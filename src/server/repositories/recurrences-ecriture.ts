// Écriture des récurrences — docs/lot-m3.md §4.2, §4.3, §4.4 et §4.6. Chaque
// geste est une transaction ; l'appariement se calcule avant l'écriture, si
// bien que les occurrences d'une règle naissent d'un seul createMany.

import { Prisma } from "@prisma/client";
import { ajouterJours, depuisDateUtc, ecartJours, versDateUtc, type DateCivile } from "@/domain/dates";
import type { Cents } from "@/domain/money";
import {
  apparierRetroactivement,
  detecterRecurrences,
  estOccurrenceOuverte,
  etatAffiche,
  etatApresLiaison,
  FENETRE_LIAISON_MANUELLE_JOURS,
  horizonOccurrences,
  LIMITE_REGLES_COUVRANTES,
  LIMITE_SUGGESTIONS_REFUSEES,
  occurrencesAMaterialiser,
  occurrencesAPartirDe,
  signesOpposes,
  type ChampsRecurrence,
  type CompteRenduLiaisonRetroactive,
} from "@/domain/recurrence";
import { prisma } from "@/server/db";
import { MAX_WAIT_TRANSACTION_MS, TIMEOUT_TRANSACTION_MS } from "./transactions";
import { dateReferenceDetection, lireGroupesDetection } from "./recurrences-lecture";
import { verrouillerOccurrences, verrouillerTransactions } from "./verrous";

const OPTIONS_TRANSACTION = { maxWait: MAX_WAIT_TRANSACTION_MS, timeout: TIMEOUT_TRANSACTION_MS } as const;

function donneesRegle(champs: ChampsRecurrence) {
  return {
    libelle: champs.libelle,
    nature: champs.nature,
    montantCents: champs.montantCents,
    cadence: champs.cadence,
    dateAncrage: versDateUtc(champs.dateAncrage),
    subcategoryId: champs.subcategoryId,
    motifRapprochement: champs.motifRapprochement,
    toleranceCents: champs.toleranceCents,
    toleranceJours: champs.toleranceJours,
  };
}

async function sousCategorieDuProprietaire(
  tx: Prisma.TransactionClient,
  ownerId: string,
  subcategoryId: string | null,
): Promise<boolean> {
  if (subcategoryId === null) {
    return true;
  }
  const trouvee = await tx.subcategory.findFirst({
    where: { id: subcategoryId, category: { ownerId } },
    select: { id: true },
  });
  return trouvee !== null;
}

// ── suggestions

export interface ResultatRecherche {
  readonly dateReference: DateCivile | null;
  readonly nbSuggestions: number;
  readonly limiteAtteinte: boolean;
}

/** Détecte puis remplace les suggestions EN_ATTENTE du propriétaire (une transaction). ACCEPTEE et REFUSEE ne sont jamais touchées. */
export async function rechercherSuggestions(
  ownerId: string,
  options?: { readonly dateReference?: DateCivile },
): Promise<ResultatRecherche> {
  const dateReference = options?.dateReference ?? (await dateReferenceDetection(ownerId));
  let groupes: Awaited<ReturnType<typeof lireGroupesDetection>>["groupes"] = [];
  let limiteAtteinte = false;
  if (dateReference !== null) {
    const lecture = await lireGroupesDetection(ownerId, dateReference);
    groupes = lecture.groupes;
    limiteAtteinte = lecture.limiteAtteinte;
  }
  const [couvrantes, refusees] = await Promise.all([
    prisma.recurringRule.findMany({
      where: { ownerId, actif: true, dateFin: null },
      select: { accountId: true, motifRapprochement: true },
      take: LIMITE_REGLES_COUVRANTES,
    }),
    prisma.recurrenceSuggestion.findMany({
      where: { ownerId, etat: "REFUSEE" },
      select: { accountId: true, motif: true, cadence: true },
      take: LIMITE_SUGGESTIONS_REFUSEES,
    }),
  ]);
  const detectees =
    dateReference === null ? [] : detecterRecurrences(groupes, couvrantes, refusees, dateReference);

  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${ownerId} FOR UPDATE`;
    await tx.recurrenceSuggestion.deleteMany({ where: { ownerId, etat: "EN_ATTENTE" } });
    if (detectees.length > 0) {
      await tx.recurrenceSuggestion.createMany({
        data: detectees.map((s) => ({
          ownerId,
          accountId: s.accountId,
          motif: s.motif,
          cadence: s.cadence,
          montantMedianCents: s.montantMedianCents,
          nbOccurrences: s.nbOccurrences,
          regularite: s.regularite,
          stabilite: s.stabilite,
          score: s.score,
          transactionIds: [...s.transactionIds],
        })),
      });
    }
  }, OPTIONS_TRANSACTION);

  return { dateReference, nbSuggestions: detectees.length, limiteAtteinte };
}

export async function refuserSuggestion(
  ownerId: string,
  id: string,
): Promise<"REFUSEE" | "INTROUVABLE" | "DEJA_TRAITEE"> {
  const { count } = await prisma.recurrenceSuggestion.updateMany({
    where: { id, ownerId, etat: "EN_ATTENTE" },
    data: { etat: "REFUSEE" },
  });
  if (count === 1) {
    return "REFUSEE";
  }
  const existe = await prisma.recurrenceSuggestion.findFirst({ where: { id, ownerId }, select: { id: true } });
  return existe === null ? "INTROUVABLE" : "DEJA_TRAITEE";
}

export type ResultatConfirmation =
  | { readonly statut: "INTROUVABLE" }
  | { readonly statut: "DEJA_TRAITEE" }
  | { readonly statut: "REFERENCE_INVALIDE"; readonly quoi: "COMPTE" | "SOUS_CATEGORIE" }
  | { readonly statut: "CONFIRMEE"; readonly compteRendu: CompteRenduLiaisonRetroactive };

/**
 * Crée la règle, matérialise ses échéances et lie rétroactivement les transactions du groupe. Aucune écriture avant
 * la création de la règle : tout ce qui peut refuser est lu d'abord.
 */
export async function confirmerSuggestion(
  ownerId: string,
  suggestionId: string,
  champs: ChampsRecurrence,
  aujourdhui: DateCivile,
): Promise<ResultatConfirmation> {
  return prisma.$transaction(async (tx): Promise<ResultatConfirmation> => {
    const verrouillees = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "RecurrenceSuggestion" WHERE "id" = ${suggestionId} AND "ownerId" = ${ownerId} FOR UPDATE
    `;
    if (verrouillees.length === 0) {
      return { statut: "INTROUVABLE" };
    }
    const suggestion = await tx.recurrenceSuggestion.findFirst({
      where: { id: suggestionId, ownerId },
      select: { id: true, accountId: true, etat: true, score: true, transactionIds: true },
    });
    if (suggestion === null) {
      return { statut: "INTROUVABLE" };
    }
    if (suggestion.etat !== "EN_ATTENTE") {
      return { statut: "DEJA_TRAITEE" };
    }
    const compte = await tx.account.findFirst({ where: { id: suggestion.accountId, ownerId }, select: { id: true } });
    if (compte === null) {
      return { statut: "REFERENCE_INVALIDE", quoi: "COMPTE" };
    }
    if (!(await sousCategorieDuProprietaire(tx, ownerId, champs.subcategoryId))) {
      return { statut: "REFERENCE_INVALIDE", quoi: "SOUS_CATEGORIE" };
    }

    await verrouillerTransactions(tx, ownerId, suggestion.transactionIds);
    const lues = await tx.transaction.findMany({
      where: {
        id: { in: [...suggestion.transactionIds] },
        ownerId,
        accountId: suggestion.accountId,
        parentId: null,
        occurrence: null,
      },
      select: { id: true, date: true, montantCents: true },
      take: suggestion.transactionIds.length,
    });
    const disponibles = lues.map((t) => ({ id: t.id, date: depuisDateUtc(t.date), montantCents: t.montantCents }));
    const indisponibles = suggestion.transactionIds.length - disponibles.length;

    const aMaterialiser = occurrencesAMaterialiser(
      { cadence: champs.cadence, dateAncrage: champs.dateAncrage, dateFin: null, montantCents: champs.montantCents },
      horizonOccurrences(aujourdhui),
    );
    const appariement = apparierRetroactivement(
      aMaterialiser.map((o) => o.echeance),
      disponibles,
      champs.toleranceJours,
    );
    const transactionParEcheance = new Map(appariement.paires.map((p) => [p.echeance, p.transaction]));

    const regle = await tx.recurringRule.create({
      data: {
        ownerId,
        accountId: suggestion.accountId,
        ...donneesRegle(champs),
        scoreConfiance: suggestion.score,
        actif: true,
      },
      select: { id: true },
    });
    const lieeLe = new Date();
    await tx.expectedOccurrence.createMany({
      data: aMaterialiser.map((o): Prisma.ExpectedOccurrenceCreateManyInput => {
        const transaction = transactionParEcheance.get(o.echeance);
        if (transaction === undefined) {
          return { ruleId: regle.id, echeance: versDateUtc(o.echeance), montantCents: o.montantCents, etat: "PREVUE" };
        }
        return {
          ruleId: regle.id,
          echeance: versDateUtc(o.echeance),
          montantCents: o.montantCents,
          transactionId: transaction.id,
          liaison: "RETROACTIVE",
          lieeLe,
          etat: etatApresLiaison(transaction.montantCents, { montantCents: champs.montantCents }, champs.toleranceCents),
        };
      }),
    });
    await tx.recurrenceSuggestion.update({ where: { id: suggestion.id }, data: { etat: "ACCEPTEE" } });

    return {
      statut: "CONFIRMEE",
      compteRendu: {
        ruleId: regle.id,
        libelle: champs.libelle,
        paiementsLies: appariement.paires.length,
        sansEcheance: appariement.transactionsSansEcheance.map((t) => ({
          id: t.id,
          date: t.date,
          montantCents: t.montantCents,
        })),
        indisponibles,
        echeancesPasseesSansPaiement: appariement.echeancesSansTransaction.filter(
          (echeance) => etatAffiche({ echeance, etat: "PREVUE" }, champs.toleranceJours, aujourdhui) === "MANQUEE",
        ).length,
      },
    };
  }, OPTIONS_TRANSACTION);
}

// ── règles

export type ResultatCreationRecurrence =
  | { readonly statut: "REFERENCE_INVALIDE"; readonly quoi: "COMPTE" | "SOUS_CATEGORIE" | "TRANSACTION" }
  | { readonly statut: "TRANSACTION_INDISPONIBLE"; readonly motif: "DEJA_LIEE" | "LIGNE_FILLE" | "AUTRE_COMPTE" }
  | {
      readonly statut: "CREEE";
      readonly ruleId: string;
      readonly libelle: string;
      /** null si aucune transaction n'était demandée. */
      readonly transaction:
        | null
        | { readonly date: DateCivile; readonly echeance: DateCivile } // liée
        | { readonly date: DateCivile; readonly echeance: null }; // non liée
    };

export async function creerRecurrence(
  ownerId: string,
  entree: { readonly accountId: string; readonly transactionId: string | null; readonly champs: ChampsRecurrence },
  aujourdhui: DateCivile,
): Promise<ResultatCreationRecurrence> {
  const { accountId, transactionId, champs } = entree;
  return prisma.$transaction(async (tx): Promise<ResultatCreationRecurrence> => {
    const compte = await tx.account.findFirst({ where: { id: accountId, ownerId }, select: { id: true } });
    if (compte === null) {
      return { statut: "REFERENCE_INVALIDE", quoi: "COMPTE" };
    }
    if (!(await sousCategorieDuProprietaire(tx, ownerId, champs.subcategoryId))) {
      return { statut: "REFERENCE_INVALIDE", quoi: "SOUS_CATEGORIE" };
    }

    let transaction: { readonly id: string; readonly date: DateCivile; readonly montantCents: Cents } | null = null;
    if (transactionId !== null) {
      await verrouillerTransactions(tx, ownerId, [transactionId]);
      const lue = await tx.transaction.findFirst({
        where: { id: transactionId, ownerId },
        select: { id: true, accountId: true, date: true, montantCents: true, parentId: true, occurrence: { select: { id: true } } },
      });
      if (lue === null) {
        return { statut: "REFERENCE_INVALIDE", quoi: "TRANSACTION" };
      }
      if (lue.parentId !== null) {
        return { statut: "TRANSACTION_INDISPONIBLE", motif: "LIGNE_FILLE" };
      }
      if (lue.occurrence !== null) {
        return { statut: "TRANSACTION_INDISPONIBLE", motif: "DEJA_LIEE" };
      }
      if (lue.accountId !== accountId) {
        return { statut: "TRANSACTION_INDISPONIBLE", motif: "AUTRE_COMPTE" };
      }
      transaction = { id: lue.id, date: depuisDateUtc(lue.date), montantCents: lue.montantCents };
    }

    const regle = await tx.recurringRule.create({
      data: { ownerId, accountId, ...donneesRegle(champs), scoreConfiance: null, actif: true },
      select: { id: true },
    });
    const aMaterialiser = occurrencesAMaterialiser(
      { cadence: champs.cadence, dateAncrage: champs.dateAncrage, dateFin: null, montantCents: champs.montantCents },
      horizonOccurrences(aujourdhui),
    );
    const paire =
      transaction === null
        ? null
        : (apparierRetroactivement(
            aMaterialiser.map((o) => o.echeance),
            [transaction],
            champs.toleranceJours,
          ).paires[0] ?? null);
    const lieeLe = new Date();
    await tx.expectedOccurrence.createMany({
      data: aMaterialiser.map((o): Prisma.ExpectedOccurrenceCreateManyInput => {
        if (paire?.echeance !== o.echeance) {
          return { ruleId: regle.id, echeance: versDateUtc(o.echeance), montantCents: o.montantCents, etat: "PREVUE" };
        }
        return {
          ruleId: regle.id,
          echeance: versDateUtc(o.echeance),
          montantCents: o.montantCents,
          transactionId: paire.transaction.id,
          liaison: "MANUELLE",
          lieeLe,
          etat: etatApresLiaison(paire.transaction.montantCents, { montantCents: champs.montantCents }, champs.toleranceCents),
        };
      }),
    });

    return {
      statut: "CREEE",
      ruleId: regle.id,
      libelle: champs.libelle,
      transaction:
        transaction === null
          ? null
          : paire === null
            ? { date: transaction.date, echeance: null }
            : { date: transaction.date, echeance: paire.echeance },
    };
  }, OPTIONS_TRANSACTION);
}

export type ResultatModificationRecurrence =
  | { readonly statut: "INTROUVABLE" }
  | { readonly statut: "REFERENCE_INVALIDE"; readonly quoi: "SOUS_CATEGORIE" }
  | { readonly statut: "SIGNE_CONTRAIRE" }
  | { readonly statut: "MODIFIEE"; readonly echeancesSupprimees: number; readonly echeancesCreees: number };

/** Remplace les échéances ouvertes à venir ; les liées, les ignorées et les ouvertes passées ne bougent pas. */
export async function modifierRecurrence(
  ownerId: string,
  id: string,
  champs: ChampsRecurrence,
  aujourdhui: DateCivile,
): Promise<ResultatModificationRecurrence> {
  return prisma.$transaction(async (tx): Promise<ResultatModificationRecurrence> => {
    const regle = await tx.recurringRule.findFirst({ where: { id, ownerId }, select: { dateFin: true } });
    if (regle === null) {
      return { statut: "INTROUVABLE" };
    }
    if (!(await sousCategorieDuProprietaire(tx, ownerId, champs.subcategoryId))) {
      return { statut: "REFERENCE_INVALIDE", quoi: "SOUS_CATEGORIE" };
    }
    if (champs.montantCents !== 0) {
      const contraires = await tx.expectedOccurrence.count({
        where: {
          ruleId: id,
          montantCents: champs.montantCents < 0 ? { gt: 0 } : { lt: 0 },
          // les occurrences que la modification garde : tout sauf les ouvertes d'échéance ≥ aujourd'hui
          NOT: { transactionId: null, etat: { in: ["PREVUE", "MANQUEE"] }, echeance: { gte: versDateUtc(aujourdhui) } },
        },
      });
      if (contraires > 0) {
        return { statut: "SIGNE_CONTRAIRE" };
      }
    }
    await tx.recurringRule.update({ where: { id }, data: donneesRegle(champs) });
    const { count: supprimees } = await tx.expectedOccurrence.deleteMany({
      where: {
        ruleId: id,
        transactionId: null,
        etat: { in: ["PREVUE", "MANQUEE"] },
        echeance: { gte: versDateUtc(aujourdhui) },
      },
    });
    const nouvelles = occurrencesAPartirDe(
      {
        cadence: champs.cadence,
        dateAncrage: champs.dateAncrage,
        dateFin: regle.dateFin === null ? null : depuisDateUtc(regle.dateFin),
        montantCents: champs.montantCents,
      },
      aujourdhui,
      horizonOccurrences(aujourdhui),
    );
    const { count: creees } = await tx.expectedOccurrence.createMany({
      data: nouvelles.map((o) => ({
        ruleId: id,
        echeance: versDateUtc(o.echeance),
        montantCents: o.montantCents,
      })),
      skipDuplicates: true,
    });
    return { statut: "MODIFIEE", echeancesSupprimees: supprimees, echeancesCreees: creees };
  }, OPTIONS_TRANSACTION);
}

/** docs/lot-m3.md §4.4 — prolonge les séries actives du compte jusqu'à l'horizon ; idempotente. */
export async function prolongerHorizonDuCompte(
  ownerId: string,
  accountId: string,
  aujourdhui: DateCivile,
): Promise<{ readonly echeancesCreees: number }> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "RecurringRule" WHERE "ownerId" = ${ownerId} AND "accountId" = ${accountId} AND "actif" AND "dateFin" IS NULL ORDER BY "id" LIMIT ${LIMITE_REGLES_COUVRANTES} FOR UPDATE`;
    const regles = await tx.recurringRule.findMany({
      where: { ownerId, accountId, actif: true, dateFin: null },
      orderBy: { id: "asc" },
      take: LIMITE_REGLES_COUVRANTES,
      select: { id: true, cadence: true, dateAncrage: true, montantCents: true },
    });
    if (regles.length === 0) {
      return { echeancesCreees: 0 };
    }
    const maxParRegle = await tx.expectedOccurrence.groupBy({
      by: ["ruleId"],
      where: { ruleId: { in: regles.map((r) => r.id) } },
      _max: { echeance: true },
    });
    const dernieres = new Map(maxParRegle.map((m) => [m.ruleId, m._max.echeance]));
    const horizon = horizonOccurrences(aujourdhui);
    const data = regles.flatMap((regle) => {
      // Une règle sans montant ne porte aucune échéance (ExpectedOccurrence.montantCents est obligatoire).
      if (regle.montantCents === null) {
        return [];
      }
      const max = dernieres.get(regle.id) ?? null;
      const depuis = max === null ? aujourdhui : ajouterJours(depuisDateUtc(max), 1);
      return occurrencesAPartirDe(
        {
          cadence: regle.cadence,
          dateAncrage: depuisDateUtc(regle.dateAncrage),
          dateFin: null,
          montantCents: regle.montantCents,
        },
        depuis,
        horizon,
      ).map((o) => ({ ruleId: regle.id, echeance: versDateUtc(o.echeance), montantCents: o.montantCents }));
    });
    if (data.length === 0) {
      return { echeancesCreees: 0 };
    }
    const { count } = await tx.expectedOccurrence.createMany({ data, skipDuplicates: true });
    return { echeancesCreees: count };
  }, OPTIONS_TRANSACTION);
}

export type ResultatTerminaison =
  | { readonly statut: "INTROUVABLE" }
  | { readonly statut: "DEJA_TERMINEE" }
  | { readonly statut: "FIN_AVANT_ANCRAGE" }
  /** `echeance` : la dernière échéance liée, que la date de fin ne peut pas précéder. */
  | { readonly statut: "FIN_AVANT_LIEE"; readonly echeance: DateCivile }
  | { readonly statut: "TERMINEE"; readonly echeancesRetirees: number; readonly dontIgnorees: number };

/** Pose la date de fin et retire toutes les échéances non liées qui la suivent, ignorées comprises. */
export async function terminerRecurrence(ownerId: string, id: string, dateFin: DateCivile): Promise<ResultatTerminaison> {
  return prisma.$transaction(async (tx): Promise<ResultatTerminaison> => {
    const regle = await tx.recurringRule.findFirst({
      where: { id, ownerId },
      select: { dateAncrage: true, dateFin: true, actif: true },
    });
    if (regle === null) {
      return { statut: "INTROUVABLE" };
    }
    if (regle.dateFin !== null || !regle.actif) {
      return { statut: "DEJA_TERMINEE" };
    }
    if (dateFin < depuisDateUtc(regle.dateAncrage)) {
      return { statut: "FIN_AVANT_ANCRAGE" };
    }
    const apres = { gt: versDateUtc(dateFin) };
    // Les échéances visées sont verrouillées avant la lecture : une liaison concurrente attend la fin de la
    // transaction, puis trouve son échéance supprimée (docs/lot-m3.md §7, invariant 4).
    await tx.$queryRaw`
      SELECT "id" FROM "ExpectedOccurrence" WHERE "ruleId" = ${id} AND "echeance" > ${versDateUtc(dateFin)}
      ORDER BY "id" FOR UPDATE
    `;
    const derniereLiee = await tx.expectedOccurrence.findFirst({
      where: { ruleId: id, transactionId: { not: null } },
      orderBy: { echeance: "desc" },
      select: { echeance: true },
    });
    if (derniereLiee !== null && derniereLiee.echeance > versDateUtc(dateFin)) {
      return { statut: "FIN_AVANT_LIEE", echeance: depuisDateUtc(derniereLiee.echeance) };
    }
    const dontIgnorees = await tx.expectedOccurrence.count({
      where: { ruleId: id, transactionId: null, etat: "IGNOREE", echeance: apres },
    });
    const { count } = await tx.expectedOccurrence.deleteMany({
      where: { ruleId: id, transactionId: null, echeance: apres },
    });
    await tx.recurringRule.update({ where: { id }, data: { dateFin: versDateUtc(dateFin) } });
    return { statut: "TERMINEE", echeancesRetirees: count, dontIgnorees };
  }, OPTIONS_TRANSACTION);
}

export type ResultatSuppressionRecurrence =
  | { readonly statut: "INTROUVABLE" }
  | { readonly statut: "SUPPRIMEE"; readonly liaisonsDefaites: number };

/** La cascade du schéma emporte les occurrences et les parts de ventilation ; les transactions restent. */
export async function supprimerRecurrence(ownerId: string, id: string): Promise<ResultatSuppressionRecurrence> {
  return prisma.$transaction(async (tx): Promise<ResultatSuppressionRecurrence> => {
    const liaisonsDefaites = await tx.expectedOccurrence.count({
      where: { ruleId: id, rule: { ownerId }, transactionId: { not: null } },
    });
    const { count } = await tx.recurringRule.deleteMany({ where: { id, ownerId } });
    return count === 0 ? { statut: "INTROUVABLE" } : { statut: "SUPPRIMEE", liaisonsDefaites };
  }, OPTIONS_TRANSACTION);
}

// ── occurrences

export type ResultatLiaisonOccurrence =
  | { readonly statut: "ECHEANCE_INTROUVABLE" }
  | { readonly statut: "TRANSACTION_INTROUVABLE" }
  | { readonly statut: "ECHEANCE_PRISE" } // occurrence non ouverte
  | { readonly statut: "LIGNE_FILLE" }
  | { readonly statut: "TRANSACTION_PRISE" } // transaction déjà liée
  | { readonly statut: "AUTRE_COMPTE" }
  | { readonly statut: "HORS_FENETRE" }
  | { readonly statut: "LIEE"; readonly etat: "REALISEE" | "REALISEE_MONTANT_DIFFERENT" };

const SELECTION_OCCURRENCE_A_LIER = {
  id: true,
  echeance: true,
  montantCents: true,
  etat: true,
  transactionId: true,
  rule: { select: { accountId: true, toleranceCents: true } },
} as const satisfies Prisma.ExpectedOccurrenceSelect;

const SELECTION_TRANSACTION_A_LIER = {
  id: true,
  accountId: true,
  date: true,
  montantCents: true,
  parentId: true,
  occurrence: { select: { id: true } },
} as const satisfies Prisma.TransactionSelect;

/** Vérifications dans cet ordre exact : échéance introuvable, transaction introuvable, échéance prise, ligne fille, transaction prise, autre compte, hors fenêtre. */
export async function lierOccurrence(
  ownerId: string,
  occurrenceId: string,
  transactionId: string,
): Promise<ResultatLiaisonOccurrence> {
  return prisma.$transaction(async (tx): Promise<ResultatLiaisonOccurrence> => {
    const avant = await tx.expectedOccurrence.findFirst({
      where: { id: occurrenceId, rule: { ownerId } },
      select: { id: true },
    });
    if (avant === null) {
      return { statut: "ECHEANCE_INTROUVABLE" };
    }
    const transactionAvant = await tx.transaction.findFirst({ where: { id: transactionId, ownerId }, select: { id: true } });
    if (transactionAvant === null) {
      return { statut: "TRANSACTION_INTROUVABLE" };
    }
    // La transaction d'abord, l'occurrence ensuite : l'ordre est le même pour toute liaison et toute déliaison.
    await verrouillerTransactions(tx, ownerId, [transactionId]);
    await verrouillerOccurrences(tx, ownerId, [occurrenceId]);

    const occurrence = await tx.expectedOccurrence.findFirst({
      where: { id: occurrenceId, rule: { ownerId } },
      select: SELECTION_OCCURRENCE_A_LIER,
    });
    if (occurrence === null) {
      return { statut: "ECHEANCE_INTROUVABLE" };
    }
    const transaction = await tx.transaction.findFirst({
      where: { id: transactionId, ownerId },
      select: SELECTION_TRANSACTION_A_LIER,
    });
    if (transaction === null) {
      return { statut: "TRANSACTION_INTROUVABLE" };
    }
    if (!estOccurrenceOuverte({ etat: occurrence.etat, transactionId: occurrence.transactionId })) {
      return { statut: "ECHEANCE_PRISE" };
    }
    if (transaction.parentId !== null) {
      return { statut: "LIGNE_FILLE" };
    }
    if (transaction.occurrence !== null) {
      return { statut: "TRANSACTION_PRISE" };
    }
    if (transaction.accountId !== occurrence.rule.accountId) {
      return { statut: "AUTRE_COMPTE" };
    }
    const ecart = Math.abs(
      ecartJours(depuisDateUtc(transaction.date), depuisDateUtc(occurrence.echeance)),
    );
    if (ecart > FENETRE_LIAISON_MANUELLE_JOURS) {
      return { statut: "HORS_FENETRE" };
    }
    const etat = etatApresLiaison(transaction.montantCents, occurrence, occurrence.rule.toleranceCents);
    const { count } = await tx.expectedOccurrence.updateMany({
      where: { id: occurrenceId, transactionId: null, etat: { in: ["PREVUE", "MANQUEE"] } },
      data: { transactionId, liaison: "MANUELLE", lieeLe: new Date(), etat },
    });
    if (count !== 1) {
      return { statut: "ECHEANCE_PRISE" };
    }
    return { statut: "LIEE", etat };
  }, OPTIONS_TRANSACTION);
}

export type ResultatDeliaison =
  | { readonly statut: "INTROUVABLE" }
  | { readonly statut: "NON_LIEE" }
  | { readonly statut: "DELIEE"; readonly transactionId: string };

/** La transaction n'est pas modifiée : sa sous-catégorie reste. */
export async function delierOccurrence(ownerId: string, occurrenceId: string): Promise<ResultatDeliaison> {
  return prisma.$transaction(async (tx): Promise<ResultatDeliaison> => {
    const lue = await tx.expectedOccurrence.findFirst({
      where: { id: occurrenceId, rule: { ownerId } },
      select: { transactionId: true },
    });
    if (lue === null) {
      return { statut: "INTROUVABLE" };
    }
    if (lue.transactionId === null) {
      return { statut: "NON_LIEE" };
    }
    await verrouillerTransactions(tx, ownerId, [lue.transactionId]);
    await verrouillerOccurrences(tx, ownerId, [occurrenceId]);
    const { count } = await tx.expectedOccurrence.updateMany({
      where: { id: occurrenceId, transactionId: lue.transactionId },
      data: { etat: "PREVUE", transactionId: null, liaison: null, lieeLe: null },
    });
    return count === 1 ? { statut: "DELIEE", transactionId: lue.transactionId } : { statut: "NON_LIEE" };
  }, OPTIONS_TRANSACTION);
}

export type ResultatGesteOccurrence =
  | { readonly statut: "INTROUVABLE" }
  | { readonly statut: "NON_APPLICABLE" }
  | { readonly statut: "FAIT" };

async function distinguerEchec(ownerId: string, occurrenceId: string): Promise<ResultatGesteOccurrence> {
  const existe = await prisma.expectedOccurrence.findFirst({
    where: { id: occurrenceId, rule: { ownerId } },
    select: { id: true },
  });
  return existe === null ? { statut: "INTROUVABLE" } : { statut: "NON_APPLICABLE" };
}

const OUVERTE = { transactionId: null, etat: { in: ["PREVUE", "MANQUEE"] } } satisfies Prisma.ExpectedOccurrenceWhereInput;

export async function ignorerOccurrence(ownerId: string, occurrenceId: string): Promise<ResultatGesteOccurrence> {
  const { count } = await prisma.expectedOccurrence.updateMany({
    where: { id: occurrenceId, rule: { ownerId }, ...OUVERTE },
    data: { etat: "IGNOREE" },
  });
  return count === 1 ? { statut: "FAIT" } : distinguerEchec(ownerId, occurrenceId);
}

export async function retablirOccurrence(ownerId: string, occurrenceId: string): Promise<ResultatGesteOccurrence> {
  const { count } = await prisma.expectedOccurrence.updateMany({
    where: { id: occurrenceId, rule: { ownerId }, etat: "IGNOREE" },
    data: { etat: "PREVUE" },
  });
  return count === 1 ? { statut: "FAIT" } : distinguerEchec(ownerId, occurrenceId);
}

export type ResultatMontantOccurrence = ResultatGesteOccurrence | { readonly statut: "SIGNE_CONTRAIRE" };

/** Refuse un montant de signe strictement contraire à celui de la règle (docs/lot-m3.md §7, invariant 6). */
export async function modifierMontantOccurrence(
  ownerId: string,
  occurrenceId: string,
  montantCents: Cents,
): Promise<ResultatMontantOccurrence> {
  const regle: Prisma.RecurringRuleWhereInput =
    montantCents === 0
      ? { ownerId }
      : { ownerId, OR: [{ montantCents: null }, { montantCents: montantCents < 0 ? { lte: 0 } : { gte: 0 } }] };
  const { count } = await prisma.expectedOccurrence.updateMany({
    where: { id: occurrenceId, rule: regle, ...OUVERTE },
    data: { montantCents },
  });
  if (count === 1) {
    return { statut: "FAIT" };
  }
  const lue = await prisma.expectedOccurrence.findFirst({
    where: { id: occurrenceId, rule: { ownerId } },
    select: { etat: true, transactionId: true, rule: { select: { montantCents: true } } },
  });
  if (lue === null) {
    return { statut: "INTROUVABLE" };
  }
  if (
    estOccurrenceOuverte(lue) &&
    lue.rule.montantCents !== null &&
    signesOpposes(montantCents, lue.rule.montantCents)
  ) {
    return { statut: "SIGNE_CONTRAIRE" };
  }
  return { statut: "NON_APPLICABLE" };
}
