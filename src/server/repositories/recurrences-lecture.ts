// Lecture des récurrences — docs/lot-m3.md §4.2, §4.6 et §4.7. La détection se
// fait en un seul SQL (fonction de fenêtrage, json_agg) ; l'écran lit un nombre
// fixe de requêtes, jamais une par série.

import { Prisma } from "@prisma/client";
import { z } from "zod";
import { ajouterMois, dateCivileDansFuseau, depuisDateUtc, FUSEAU_APPLICATION, versDateUtc, ajouterJours, type DateCivile } from "@/domain/dates";
import {
  estOccurrenceOuverte,
  etatAffiche,
  FENETRE_DETECTION_MOIS,
  FENETRE_LIAISON_MANUELLE_JOURS,
  LIMITE_CANDIDATS_LIAISON,
  LIMITE_GROUPES_DETECTION,
  LIMITE_LIGNES_PAR_GROUPE,
  LIMITE_NON_VUS,
  LIMITE_OCCURRENCES_RAPPROCHEMENT,
  LIMITE_SERIES,
  MARGE_CANDIDAT_JOURS,
  LIMITE_SUGGESTIONS,
  libelleSuggestion,
  MIN_OCCURRENCES,
  natureDepuisStabilite,
  phraseSuggestion,
  regleDepuisSuggestion,
  taillePageOccurrences,
  type CandidatOccurrenceLiaison,
  type CandidatTransactionLiaison,
  type CurseurOccurrences,
  type EcranRecurrences,
  type GroupeRecurrence,
  type OccurrenceAffichee,
  type OccurrenceCandidate,
  type PageOccurrences,
  type PaiementAttenduNonVu,
  type PartVentilationRecurrente,
  type PortionOccurrences,
  type SerieAffichee,
  type SuggestionAffichee,
  type TransactionDeGroupe,
} from "@/domain/recurrence";
import { prisma } from "@/server/db";

function comparer(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

// ── détection

/** La date de référence de la détection : la transaction la plus récente, pas l'horloge (docs/lot-m3.md §3.2). */
export async function dateReferenceDetection(ownerId: string): Promise<DateCivile | null> {
  const agregat = await prisma.transaction.aggregate({ where: { ownerId, parentId: null }, _max: { date: true } });
  return agregat._max.date === null ? null : depuisDateUtc(agregat._max.date);
}

const schemaTransactionsGroupe = z.array(
  z.object({
    id: z.string(),
    date: z.string(),
    montantCents: z.number().int(),
    subcategoryId: z.string().nullable(),
    payeeId: z.string().nullable(),
    payeeNom: z.string().nullable(),
  }),
);

interface LigneGroupeBrute {
  readonly accountId: string;
  readonly descriptionNormalisee: string;
  readonly transactions: unknown;
}

export async function lireGroupesDetection(
  ownerId: string,
  dateReference: DateCivile,
): Promise<{ readonly groupes: GroupeRecurrence[]; readonly limiteAtteinte: boolean }> {
  const debut = ajouterMois(dateReference, -FENETRE_DETECTION_MOIS);
  const lignes = await prisma.$queryRaw<LigneGroupeBrute[]>`
    WITH lignes AS (
      SELECT t."id", t."accountId", t."descriptionNormalisee", sign(t."montantCents") AS "signe",
             t."date", t."montantCents", t."subcategoryId", t."payeeId",
             row_number() OVER (
               PARTITION BY t."accountId", t."descriptionNormalisee", sign(t."montantCents")
               ORDER BY t."date" DESC, t."id" COLLATE "C" DESC
             ) AS "rang"
      FROM "Transaction" t
      WHERE t."ownerId" = ${ownerId}
        AND t."parentId" IS NULL
        AND t."source" <> 'AJUSTEMENT'
        AND t."date" > ${debut}::date AND t."date" <= ${dateReference}::date
        AND NOT EXISTS (SELECT 1 FROM "ExpectedOccurrence" o WHERE o."transactionId" = t."id")
    )
    SELECT l."accountId", l."descriptionNormalisee",
           json_agg(json_build_object(
             'id', l."id", 'date', to_char(l."date", 'YYYY-MM-DD'), 'montantCents', l."montantCents",
             'subcategoryId', l."subcategoryId", 'payeeId', p."id", 'payeeNom', p."nom"
           ) ORDER BY l."date", l."id" COLLATE "C") AS "transactions"
    FROM lignes l LEFT JOIN "Payee" p ON p."id" = l."payeeId"
    WHERE l."rang" <= ${LIMITE_LIGNES_PAR_GROUPE}
    GROUP BY l."accountId", l."descriptionNormalisee", l."signe"
    HAVING count(*) >= ${MIN_OCCURRENCES}
    ORDER BY count(*) DESC, l."accountId", l."descriptionNormalisee", l."signe"
    LIMIT ${LIMITE_GROUPES_DETECTION + 1}
  `;
  const limiteAtteinte = lignes.length > LIMITE_GROUPES_DETECTION;
  const retenues = lignes.slice(0, LIMITE_GROUPES_DETECTION);
  const groupes: GroupeRecurrence[] = retenues.map((ligne) => ({
    accountId: ligne.accountId,
    descriptionNormalisee: ligne.descriptionNormalisee,
    transactions: schemaTransactionsGroupe.parse(ligne.transactions).map(
      (t): TransactionDeGroupe => ({
        id: t.id,
        date: t.date,
        montantCents: t.montantCents,
        subcategoryId: t.subcategoryId,
        beneficiaire: t.payeeId === null || t.payeeNom === null ? null : { id: t.payeeId, nom: t.payeeNom },
      }),
    ),
  }));
  return { groupes, limiteAtteinte };
}

// ── l'écran

interface LigneParRegle {
  readonly ruleId: string;
  readonly nbLiees: number;
  readonly prochaine: Date | null;
}

interface LigneNonVue {
  readonly id: string;
  readonly ruleId: string;
  readonly echeance: Date;
  readonly montantCents: number;
  readonly libelle: string;
  readonly compteNom: string;
}

function sansDoublons(valeurs: readonly string[]): string[] {
  return [...new Set(valeurs)];
}

async function lireSuggestions(ownerId: string): Promise<SuggestionAffichee[]> {
  const suggestions = await prisma.recurrenceSuggestion.findMany({
    where: { ownerId, etat: "EN_ATTENTE" },
    orderBy: [{ score: "desc" }, { accountId: "asc" }, { motif: "asc" }],
    take: LIMITE_SUGGESTIONS,
    select: {
      id: true,
      accountId: true,
      motif: true,
      cadence: true,
      montantMedianCents: true,
      nbOccurrences: true,
      stabilite: true,
      score: true,
      transactionIds: true,
    },
  });
  if (suggestions.length === 0) {
    return [];
  }
  const union = sansDoublons(suggestions.flatMap((s) => s.transactionIds));
  const [transactions, comptes] = await Promise.all([
    prisma.transaction.findMany({
      where: { id: { in: union }, ownerId, parentId: null },
      select: { id: true, date: true, montantCents: true, subcategoryId: true, payee: { select: { id: true, nom: true } } },
      take: union.length,
    }),
    prisma.account.findMany({ where: { ownerId }, select: { id: true, nom: true }, take: 500 }),
  ]);
  const parId = new Map(
    transactions.map((t): [string, TransactionDeGroupe] => [
      t.id,
      {
        id: t.id,
        date: depuisDateUtc(t.date),
        montantCents: t.montantCents,
        subcategoryId: t.subcategoryId,
        beneficiaire: t.payee === null ? null : { id: t.payee.id, nom: t.payee.nom },
      },
    ]),
  );
  const nomsComptes = new Map(comptes.map((c) => [c.id, c.nom]));

  return suggestions.map((s): SuggestionAffichee => {
    const disponibles = s.transactionIds
      .map((id) => parId.get(id))
      .filter((t): t is TransactionDeGroupe => t !== undefined)
      .sort((a, b) => comparer(a.date, b.date) || comparer(a.id, b.id));
    const compteNom = nomsComptes.get(s.accountId) ?? null;
    const base = {
      id: s.id,
      accountId: s.accountId,
      compteNom,
      motif: s.motif,
      score: s.score,
      nbOccurrences: s.nbOccurrences,
      nbTransactionsDisponibles: disponibles.length,
    };
    if (disponibles.length === 0) {
      return { ...base, phrase: null, proposition: null };
    }
    const phrase = phraseSuggestion({
      libelle: libelleSuggestion(s.motif, disponibles),
      montantMedianCents: s.montantMedianCents,
      nature: natureDepuisStabilite(s.stabilite),
      cadence: s.cadence,
      nbOccurrences: s.nbOccurrences,
      dates: disponibles.map((t) => t.date),
    });
    const proposition =
      compteNom === null
        ? null
        : regleDepuisSuggestion(
            {
              accountId: s.accountId,
              motif: s.motif,
              cadence: s.cadence,
              stabilite: s.stabilite,
              montantMedianCents: s.montantMedianCents,
            },
            { accountId: s.accountId, descriptionNormalisee: s.motif, transactions: disponibles },
          );
    return { ...base, phrase, proposition };
  });
}

async function lireSeries(
  ownerId: string,
  aujourdhui: DateCivile,
): Promise<{ readonly series: SerieAffichee[]; readonly tronquees: boolean }> {
  const regles = await prisma.recurringRule.findMany({
    where: { ownerId },
    orderBy: [{ libelle: "asc" }, { id: "asc" }],
    take: LIMITE_SERIES + 1,
    select: {
      id: true,
      libelle: true,
      accountId: true,
      account: { select: { nom: true } },
      nature: true,
      montantCents: true,
      cadence: true,
      dateAncrage: true,
      dateFin: true,
      actif: true,
      subcategoryId: true,
      subcategory: { select: { nom: true, category: { select: { nom: true } } } },
      motifRapprochement: true,
      toleranceCents: true,
      toleranceJours: true,
      ventilation: {
        select: { id: true, libelle: true, montantCents: true, partMille: true, subcategoryId: true },
        orderBy: { id: "asc" },
        take: 20,
      },
    },
  });
  const tronquees = regles.length > LIMITE_SERIES;
  const retenues = regles.slice(0, LIMITE_SERIES);
  if (retenues.length === 0) {
    return { series: [], tronquees };
  }

  const idsSousCategories = sansDoublons(
    retenues.flatMap((r) => r.ventilation.flatMap((p) => (p.subcategoryId === null ? [] : [p.subcategoryId]))),
  );
  const [nomsParts, agregats] = await Promise.all([
    idsSousCategories.length === 0
      ? Promise.resolve([])
      : prisma.subcategory.findMany({
          where: { id: { in: idsSousCategories }, category: { ownerId } },
          select: { id: true, nom: true },
          take: idsSousCategories.length,
        }),
    prisma.$queryRaw<LigneParRegle[]>`
      SELECT o."ruleId" AS "ruleId",
             count(o."transactionId")::int AS "nbLiees",
             min(o."echeance") FILTER (
               WHERE o."transactionId" IS NULL AND o."etat" IN ('PREVUE','MANQUEE') AND o."echeance" >= ${aujourdhui}::date
             ) AS "prochaine"
      FROM "ExpectedOccurrence" o
      JOIN "RecurringRule" r ON r."id" = o."ruleId"
      WHERE r."ownerId" = ${ownerId} AND o."ruleId" IN (${Prisma.join(retenues.map((r) => r.id))})
      GROUP BY o."ruleId"
    `,
  ]);
  const nomsSousCategories = new Map(nomsParts.map((s) => [s.id, s.nom]));
  const parRegle = new Map(agregats.map((a) => [a.ruleId, a]));

  const series = retenues.map((r): SerieAffichee => {
    const agregat = parRegle.get(r.id);
    const terminee = !r.actif || r.dateFin !== null;
    const ventilation = r.ventilation.map(
      (p): PartVentilationRecurrente => ({
        id: p.id,
        libelle: p.libelle,
        sousCategorieNom: p.subcategoryId === null ? null : (nomsSousCategories.get(p.subcategoryId) ?? null),
        montantCents: p.montantCents,
        partMille: p.partMille,
      }),
    );
    return {
      id: r.id,
      libelle: r.libelle,
      accountId: r.accountId,
      compteNom: r.account.nom,
      nature: r.nature,
      montantCents: r.montantCents,
      cadence: r.cadence,
      dateAncrage: depuisDateUtc(r.dateAncrage),
      dateFin: r.dateFin === null ? null : depuisDateUtc(r.dateFin),
      terminee,
      subcategoryId: r.subcategoryId,
      sousCategorieNom: r.subcategory?.nom ?? null,
      categorieNom: r.subcategory?.category.nom ?? null,
      motifRapprochement: r.motifRapprochement,
      toleranceCents: r.toleranceCents,
      toleranceJours: r.toleranceJours,
      prochaineEcheance:
        terminee || agregat?.prochaine == null ? null : depuisDateUtc(agregat.prochaine),
      nbLiees: agregat?.nbLiees ?? 0,
      ventilation,
    };
  });
  series.sort((a, b) => a.libelle.localeCompare(b.libelle, "fr-CA") || comparer(a.id, b.id));
  return { series, tronquees };
}

async function lireNonVus(
  ownerId: string,
  aujourdhui: DateCivile,
): Promise<{ readonly nonVus: PaiementAttenduNonVu[]; readonly nb: number }> {
  const [lignes, comptes] = await Promise.all([
    prisma.$queryRaw<LigneNonVue[]>`
      SELECT o."id" AS "id", o."ruleId" AS "ruleId", o."echeance" AS "echeance", o."montantCents" AS "montantCents",
             r."libelle" AS "libelle", a."nom" AS "compteNom"
      FROM "ExpectedOccurrence" o
      JOIN "RecurringRule" r ON r."id" = o."ruleId"
      JOIN "Account" a ON a."id" = r."accountId"
      WHERE r."ownerId" = ${ownerId} AND r."actif" AND r."dateFin" IS NULL
        AND o."transactionId" IS NULL
        AND (o."etat" = 'MANQUEE' OR (o."etat" = 'PREVUE' AND o."echeance" + r."toleranceJours" < ${aujourdhui}::date))
      ORDER BY o."echeance" DESC, o."id" DESC
      LIMIT ${LIMITE_NON_VUS}
    `,
    prisma.$queryRaw<{ nb: number }[]>`
      SELECT count(*)::int AS "nb"
      FROM "ExpectedOccurrence" o
      JOIN "RecurringRule" r ON r."id" = o."ruleId"
      WHERE r."ownerId" = ${ownerId} AND r."actif" AND r."dateFin" IS NULL
        AND o."transactionId" IS NULL
        AND (o."etat" = 'MANQUEE' OR (o."etat" = 'PREVUE' AND o."echeance" + r."toleranceJours" < ${aujourdhui}::date))
    `,
  ]);
  return {
    nonVus: lignes.map((l) => ({
      occurrenceId: l.id,
      ruleId: l.ruleId,
      libelle: l.libelle,
      compteNom: l.compteNom,
      echeance: depuisDateUtc(l.echeance),
      montantCents: l.montantCents,
    })),
    nb: comptes[0]?.nb ?? 0,
  };
}

export async function lireEcranRecurrences(ownerId: string, aujourdhui: DateCivile): Promise<EcranRecurrences> {
  const [suggestions, nbSuggestions, series, nonVus] = await Promise.all([
    lireSuggestions(ownerId),
    prisma.recurrenceSuggestion.count({ where: { ownerId, etat: "EN_ATTENTE" } }),
    lireSeries(ownerId, aujourdhui),
    lireNonVus(ownerId, aujourdhui),
  ]);
  return {
    aujourdhui,
    suggestions,
    nbSuggestions,
    series: series.series,
    seriesTronquees: series.tronquees,
    nonVus: nonVus.nonVus,
    nbNonVus: nonVus.nb,
  };
}

// ── les échéances d'une série

/**
 * A_VENIR : échéance ≥ aujourd'hui, ordre croissant ; PASSEES : échéance < aujourd'hui, ordre décroissant.
 * null : règle introuvable pour ce propriétaire, quelle que soit la portion.
 */
export async function lireOccurrences(
  ownerId: string,
  ruleId: string,
  aujourdhui: DateCivile,
  portion: PortionOccurrences,
  curseur: CurseurOccurrences | null,
  taille: number = taillePageOccurrences(portion),
): Promise<PageOccurrences | null> {
  const regle = await prisma.recurringRule.findFirst({
    where: { id: ruleId, ownerId },
    select: { libelle: true, toleranceJours: true },
  });
  if (regle === null) {
    return null;
  }
  const aVenir = portion === "A_VENIR";
  const sens = aVenir ? "asc" : "desc";
  const portionWhere: Prisma.ExpectedOccurrenceWhereInput = {
    ruleId,
    echeance: aVenir ? { gte: versDateUtc(aujourdhui) } : { lt: versDateUtc(aujourdhui) },
  };
  const apresCurseur: Prisma.ExpectedOccurrenceWhereInput =
    curseur === null
      ? {}
      : {
          OR: [
            { echeance: aVenir ? { gt: versDateUtc(curseur.echeance) } : { lt: versDateUtc(curseur.echeance) } },
            {
              echeance: versDateUtc(curseur.echeance),
              id: aVenir ? { gt: curseur.id } : { lt: curseur.id },
            },
          ],
        };
  const [brutes, total] = await Promise.all([
    prisma.expectedOccurrence.findMany({
      where: { AND: [portionWhere, apresCurseur] },
      orderBy: [{ echeance: sens }, { id: sens }],
      take: taille + 1,
      select: {
        id: true,
        echeance: true,
        montantCents: true,
        etat: true,
        liaison: true,
        lieeLe: true,
        transactionId: true,
        transaction: { select: { id: true, date: true, montantCents: true, description: true } },
      },
    }),
    prisma.expectedOccurrence.count({ where: portionWhere }),
  ]);
  const page = brutes.slice(0, taille);
  const occurrences = page.map((o): OccurrenceAffichee => {
    const echeance = depuisDateUtc(o.echeance);
    return {
      id: o.id,
      echeance,
      montantCents: o.montantCents,
      etatStocke: o.etat,
      etatAffiche: etatAffiche({ echeance, etat: o.etat }, regle.toleranceJours, aujourdhui),
      ouverte: estOccurrenceOuverte({ etat: o.etat, transactionId: o.transactionId }),
      liaison: o.liaison,
      lieeLe: o.lieeLe === null ? null : dateCivileDansFuseau(o.lieeLe, FUSEAU_APPLICATION),
      transaction:
        o.transaction === null
          ? null
          : {
              id: o.transaction.id,
              date: depuisDateUtc(o.transaction.date),
              montantCents: o.transaction.montantCents,
              description: o.transaction.description,
            },
    };
  });
  const derniere = occurrences[occurrences.length - 1];
  return {
    libelle: regle.libelle,
    portion,
    occurrences,
    curseurSuivant:
      brutes.length > taille && derniere !== undefined ? { echeance: derniere.echeance, id: derniere.id } : null,
    total,
  };
}

// ── les candidats de liaison à la main

export type ResultatCandidatsTransaction =
  | { readonly statut: "INTROUVABLE" }
  | { readonly statut: "NON_OUVERTE" }
  | { readonly statut: "CANDIDATS"; readonly candidats: readonly CandidatTransactionLiaison[] };

export async function lireCandidatsTransaction(
  ownerId: string,
  occurrenceId: string,
): Promise<ResultatCandidatsTransaction> {
  const occurrence = await prisma.expectedOccurrence.findFirst({
    where: { id: occurrenceId, rule: { ownerId } },
    select: { echeance: true, etat: true, transactionId: true, rule: { select: { accountId: true } } },
  });
  if (occurrence === null) {
    return { statut: "INTROUVABLE" };
  }
  if (!estOccurrenceOuverte({ etat: occurrence.etat, transactionId: occurrence.transactionId })) {
    return { statut: "NON_OUVERTE" };
  }
  const echeance = depuisDateUtc(occurrence.echeance);
  const du = ajouterJours(echeance, -FENETRE_LIAISON_MANUELLE_JOURS);
  const au = ajouterJours(echeance, FENETRE_LIAISON_MANUELLE_JOURS);
  const lignes = await prisma.$queryRaw<
    { id: string; date: Date; montantCents: number; description: string; ecart: number }[]
  >`
    SELECT t."id" AS "id", t."date" AS "date", t."montantCents" AS "montantCents", t."description" AS "description",
           abs(t."date" - ${echeance}::date)::int AS "ecart"
    FROM "Transaction" t
    WHERE t."ownerId" = ${ownerId} AND t."accountId" = ${occurrence.rule.accountId} AND t."parentId" IS NULL
      AND t."date" >= ${du}::date AND t."date" <= ${au}::date
      AND NOT EXISTS (SELECT 1 FROM "ExpectedOccurrence" o WHERE o."transactionId" = t."id")
    ORDER BY "ecart", t."date", t."id" COLLATE "C"
    LIMIT ${LIMITE_CANDIDATS_LIAISON}
  `;
  return {
    statut: "CANDIDATS",
    candidats: lignes.map((l) => ({
      id: l.id,
      date: depuisDateUtc(l.date),
      montantCents: l.montantCents,
      description: l.description,
      ecartJours: l.ecart,
    })),
  };
}

export type ResultatCandidatsOccurrence =
  | { readonly statut: "INTROUVABLE" }
  | { readonly statut: "REFUS"; readonly motif: "LIGNE_FILLE" | "DEJA_LIEE" }
  | { readonly statut: "CANDIDATS"; readonly candidats: readonly CandidatOccurrenceLiaison[] };

export async function lireCandidatsOccurrence(
  ownerId: string,
  transactionId: string,
): Promise<ResultatCandidatsOccurrence> {
  const transaction = await prisma.transaction.findFirst({
    where: { id: transactionId, ownerId },
    select: { accountId: true, date: true, parentId: true, occurrence: { select: { id: true } } },
  });
  if (transaction === null) {
    return { statut: "INTROUVABLE" };
  }
  if (transaction.parentId !== null) {
    return { statut: "REFUS", motif: "LIGNE_FILLE" };
  }
  if (transaction.occurrence !== null) {
    return { statut: "REFUS", motif: "DEJA_LIEE" };
  }
  const date = depuisDateUtc(transaction.date);
  const du = ajouterJours(date, -FENETRE_LIAISON_MANUELLE_JOURS);
  const au = ajouterJours(date, FENETRE_LIAISON_MANUELLE_JOURS);
  const lignes = await prisma.$queryRaw<
    { id: string; ruleId: string; libelle: string; echeance: Date; montantCents: number; ecart: number }[]
  >`
    SELECT o."id" AS "id", o."ruleId" AS "ruleId", r."libelle" AS "libelle", o."echeance" AS "echeance",
           o."montantCents" AS "montantCents", abs(o."echeance" - ${date}::date)::int AS "ecart"
    FROM "ExpectedOccurrence" o
    JOIN "RecurringRule" r ON r."id" = o."ruleId"
    WHERE r."ownerId" = ${ownerId} AND r."accountId" = ${transaction.accountId}
      AND o."transactionId" IS NULL AND o."etat" IN ('PREVUE', 'MANQUEE')
      AND o."echeance" >= ${du}::date AND o."echeance" <= ${au}::date
    ORDER BY "ecart", o."echeance", o."id" COLLATE "C"
    LIMIT ${LIMITE_CANDIDATS_LIAISON}
  `;
  return {
    statut: "CANDIDATS",
    candidats: lignes.map((l) => ({
      id: l.id,
      ruleId: l.ruleId,
      libelle: l.libelle,
      echeance: depuisDateUtc(l.echeance),
      montantCents: l.montantCents,
      ecartJours: l.ecart,
    })),
  };
}

// ── le rapprochement à l'import

/** docs/lot-m3.md §4.5 : les occurrences ouvertes des séries actives du compte, fenêtre du relevé élargie par règle. */
export async function lireOccurrencesARapprocher(
  ownerId: string,
  accountId: string,
  fenetre: { readonly premiere: DateCivile; readonly derniere: DateCivile },
): Promise<{ readonly occurrences: readonly OccurrenceCandidate[]; readonly limiteAtteinte: boolean }> {
  const { premiere, derniere } = fenetre;
  const lignes = await prisma.$queryRaw<
    {
      id: string;
      ruleId: string;
      echeance: Date;
      montantCents: number;
      libelle: string;
      motifRapprochement: string | null;
      toleranceCents: number;
      toleranceJours: number;
      subcategoryId: string | null;
    }[]
  >`
    SELECT o."id", o."ruleId", o."echeance", o."montantCents",
           r."libelle", r."motifRapprochement", r."toleranceCents", r."toleranceJours", r."subcategoryId"
    FROM "ExpectedOccurrence" o JOIN "RecurringRule" r ON r."id" = o."ruleId"
    WHERE r."ownerId" = ${ownerId} AND r."accountId" = ${accountId} AND r."actif" AND r."dateFin" IS NULL
      AND o."transactionId" IS NULL AND o."etat" IN ('PREVUE', 'MANQUEE')
      AND o."echeance" >= ${premiere}::date - (r."toleranceJours" + ${MARGE_CANDIDAT_JOURS}::int)
      AND o."echeance" <= ${derniere}::date + (r."toleranceJours" + ${MARGE_CANDIDAT_JOURS}::int)
    ORDER BY o."echeance", o."id" COLLATE "C"
    LIMIT ${LIMITE_OCCURRENCES_RAPPROCHEMENT + 1}
  `;
  return {
    occurrences: lignes.slice(0, LIMITE_OCCURRENCES_RAPPROCHEMENT).map(
      (l): OccurrenceCandidate => ({
        id: l.id,
        ruleId: l.ruleId,
        echeance: depuisDateUtc(l.echeance),
        montantCents: l.montantCents,
        libelle: l.libelle,
        motifRapprochement: l.motifRapprochement,
        toleranceCents: l.toleranceCents,
        toleranceJours: l.toleranceJours,
        subcategoryId: l.subcategoryId,
      }),
    ),
    limiteAtteinte: lignes.length > LIMITE_OCCURRENCES_RAPPROCHEMENT,
  };
}

/** L'occurrence liée à cette transaction (règle du propriétaire), ou null. */
export async function lireOccurrenceLiee(
  ownerId: string,
  transactionId: string,
): Promise<{ readonly libelle: string; readonly echeance: DateCivile } | null> {
  const occurrence = await prisma.expectedOccurrence.findFirst({
    where: { transactionId, rule: { ownerId } },
    select: { echeance: true, rule: { select: { libelle: true } } },
  });
  return occurrence === null ? null : { libelle: occurrence.rule.libelle, echeance: depuisDateUtc(occurrence.echeance) };
}
