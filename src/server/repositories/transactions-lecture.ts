// Lecture des transactions pour la consultation — docs/lot-m2.md §5 et §7.
// Séparé de transactions.ts (écritures, balayage, dédoublonnage) pour tenir
// en taille. Une page se lit en deux temps : un SQL brut balisé qui rend au
// plus `taille + 1` identifiants triés (le tri par curseur composé exige une
// comparaison de lignes que Prisma n'exprime pas), puis un `findMany` borné
// par ces identifiants. Le `WHERE` n'existe qu'en un seul exemplaire,
// `conditions`, partagé par la page et les totaux.

import { Prisma } from "@prisma/client";
import {
  curseurApres,
  LIMITE_LIGNES_VENTILATION,
  motifRecherche,
  TAILLE_PAGE_TRANSACTIONS,
  type ContrepartieLue,
  type CriteresTransactions,
  type CurseurTransactions,
  type DetailTransaction,
  type EtiquetteResume,
  type LigneTransactionListe,
  type LigneVentilationLue,
  type PageTransactions,
  type RecurrenceLiee,
  type TotauxTransactions,
  type TriTransactions,
} from "@/domain/consultation";
import { ajouterJours, dateCivileDansFuseau, depuisDateUtc, FUSEAU_APPLICATION } from "@/domain/dates";
import {
  contrepartieEligibilite,
  refusEcriture,
  refusLierVirement,
  type ContrepartieEligibilite,
  type FaitsContrepartie,
  type LigneEligibilite,
  type MotifRefus,
  type RefusEcriture,
} from "@/domain/edition";
import { candidatsVirement, FENETRE_VIREMENT_JOURS, type CandidatVirement, type CoteVirement } from "@/domain/virement";
import { prisma } from "@/server/db";
import { lireTransactionsPourVirement } from "./transactions";

const SELECTION_ETIQUETTES = { select: { tag: { select: { id: true, nom: true, couleur: true } } } } as const;

const SELECTION_LIGNE_VENTILATION = {
  id: true,
  montantCents: true,
  subcategoryId: true,
  subcategory: { select: { nom: true, category: { select: { nom: true } } } },
  details: true,
  etiquettes: SELECTION_ETIQUETTES,
} as const;

const SELECTION_LISTE = {
  id: true,
  date: true,
  accountId: true,
  account: { select: { nom: true } },
  description: true,
  typeOperation: true,
  montantCents: true,
  payeeId: true,
  payee: { select: { nom: true } },
  subcategoryId: true,
  subcategory: { select: { nom: true, category: { select: { nom: true } } } },
  etiquettes: SELECTION_ETIQUETTES,
  aRevoir: true,
  exclureDuBudget: true,
  exclureDesRapports: true,
  estVentilee: true,
  transferTransactionId: true,
  compteContrepartie: { select: { id: true, nom: true, ownerId: true } },
  contrepartie: { select: { ownerId: true } },
  lignes: {
    select: SELECTION_LIGNE_VENTILATION,
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: LIMITE_LIGNES_VENTILATION,
  },
  _count: { select: { lignes: true } },
} as const satisfies Prisma.TransactionSelect;

const SELECTION_DETAIL = {
  ...SELECTION_LISTE,
  parentId: true,
  details: true,
  source: true,
  etat: true,
  rapprochement: true,
  externalId: true,
  empreinte: true,
  // Le détail lit en plus les liens de chaque fille : une fille liée interdit de remodeler la ventilation
  // (docs/lot-m2.md §4.2). L'écriture revérifie en base ; la lecture est bornée comme la liste.
  lignes: {
    select: {
      ...SELECTION_LIGNE_VENTILATION,
      occurrence: { select: { id: true } },
      cotisation: { select: { id: true } },
      _count: { select: { liensObjectif: true } },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: LIMITE_LIGNES_VENTILATION,
  },
  importBatch: { select: { id: true, importeLe: true, libelle: true, couvreDu: true, couvreAu: true } },
  regle: { select: { id: true, libelle: true } },
  contrepartie: {
    select: {
      id: true,
      date: true,
      montantCents: true,
      description: true,
      source: true,
      account: { select: { id: true, nom: true } },
      ownerId: true,
      cotisation: { select: { id: true } },
      occurrence: { select: { id: true } },
      _count: { select: { liensObjectif: true } },
    },
  },
  occurrence: {
    select: {
      id: true,
      ruleId: true,
      echeance: true,
      liaison: true,
      lieeLe: true,
      rule: { select: { libelle: true, ownerId: true } },
    },
  },
  cotisation: { select: { id: true } },
  _count: { select: { lignes: true, liensObjectif: true } },
} as const satisfies Prisma.TransactionSelect;

type LigneListeBrute = Prisma.TransactionGetPayload<{ select: typeof SELECTION_LISTE }>;
type LigneDetailBrute = Prisma.TransactionGetPayload<{ select: typeof SELECTION_DETAIL }>;
type LigneVentilationBrute = LigneListeBrute["lignes"][number];

function versEtiquettes(brutes: readonly { tag: EtiquetteResume }[]): EtiquetteResume[] {
  return brutes
    .map(({ tag }) => ({ id: tag.id, nom: tag.nom, couleur: tag.couleur }))
    .sort((a, b) => a.nom.localeCompare(b.nom, "fr-CA"));
}

function versLigneVentilation(ligne: LigneVentilationBrute): LigneVentilationLue {
  return {
    id: ligne.id,
    montantCents: ligne.montantCents,
    subcategoryId: ligne.subcategoryId,
    sousCategorieNom: ligne.subcategory?.nom ?? null,
    categorieNom: ligne.subcategory?.category.nom ?? null,
    note: ligne.details,
    etiquettes: versEtiquettes(ligne.etiquettes),
  };
}

/** Le compte de l'autre côté, s'il appartient bien à l'appelant : sinon rien de lui ne s'expose (CLAUDE.md §6.3). */
function compteDeLaContrepartie(
  ligne: LigneListeBrute,
  ownerId: string,
): { readonly id: string | null; readonly nom: string | null } {
  const compte = ligne.compteContrepartie;
  return compte?.ownerId === ownerId ? { id: compte.id, nom: compte.nom } : { id: null, nom: null };
}

/** L'id de l'autre côté tel qu'on peut le montrer : jamais celui d'un autre propriétaire (CLAUDE.md §6.3). */
function idContrepartieVisible(
  transferTransactionId: string,
  contrepartie: { readonly ownerId: string } | null,
  ownerId: string,
): string | null {
  // Un pointeur orphelin (contrepartie absente) reste montré : c'est le comportement du détail.
  return contrepartie === null || contrepartie.ownerId === ownerId ? transferTransactionId : null;
}

function versLigneListe(ligne: LigneListeBrute, ownerId: string): LigneTransactionListe {
  const compteAutreCote = compteDeLaContrepartie(ligne, ownerId);
  return {
    id: ligne.id,
    date: depuisDateUtc(ligne.date),
    accountId: ligne.accountId,
    compteNom: ligne.account.nom,
    description: ligne.description,
    typeOperation: ligne.typeOperation,
    montantCents: ligne.montantCents,
    payeeId: ligne.payeeId,
    beneficiaireNom: ligne.payee?.nom ?? null,
    subcategoryId: ligne.subcategoryId,
    sousCategorieNom: ligne.subcategory?.nom ?? null,
    categorieNom: ligne.subcategory?.category.nom ?? null,
    etiquettes: versEtiquettes(ligne.etiquettes),
    aRevoir: ligne.aRevoir,
    exclureDuBudget: ligne.exclureDuBudget,
    exclureDesRapports: ligne.exclureDesRapports,
    estVentilee: ligne.estVentilee,
    virement:
      ligne.transferTransactionId === null
        ? null
        : {
            transactionId: idContrepartieVisible(ligne.transferTransactionId, ligne.contrepartie, ownerId),
            compteId: compteAutreCote.id,
            compteNom: compteAutreCote.nom,
          },
    lignesVentilation: ligne.lignes.map(versLigneVentilation),
    nbLignesVentilation: ligne._count.lignes,
  };
}

function versContrepartie(ligne: LigneDetailBrute, ownerId: string): ContrepartieLue | null {
  if (ligne.transferTransactionId === null) {
    return null;
  }
  const contrepartie = ligne.contrepartie;
  if (contrepartie?.ownerId !== ownerId) {
    // Pointeur orphelin, ou contrepartie d'un autre propriétaire : rien de l'autre ligne ne s'affiche (CLAUDE.md §6.3).
    const compteAutreCote = compteDeLaContrepartie(ligne, ownerId);
    return {
      transactionId: idContrepartieVisible(ligne.transferTransactionId, contrepartie, ownerId),
      compteId: compteAutreCote.id,
      compteNom: compteAutreCote.nom,
      date: null,
      montantCents: null,
      description: null,
    };
  }
  return {
    transactionId: contrepartie.id,
    compteId: contrepartie.account.id,
    compteNom: contrepartie.account.nom,
    date: depuisDateUtc(contrepartie.date),
    montantCents: contrepartie.montantCents,
    description: contrepartie.description,
  };
}

function versRefus(ligne: LigneDetailBrute, ownerId: string): RefusEcriture {
  const eligibilite: LigneEligibilite = {
    montantCents: ligne.montantCents,
    source: ligne.source,
    parentId: ligne.parentId,
    estVentilee: ligne.estVentilee,
    transferTransactionId: ligne.transferTransactionId,
    estLiee: ligne.occurrence !== null || ligne.cotisation !== null || ligne._count.liensObjectif > 0,
    filleLiee: ligne.lignes.some(
      (fille) => fille.occurrence !== null || fille.cotisation !== null || fille._count.liensObjectif > 0,
    ),
    porteCotisation: ligne.cotisation !== null,
  };
  const faits: FaitsContrepartie | null =
    ligne.contrepartie === null
      ? null
      : {
          ownerId: ligne.contrepartie.ownerId,
          source: ligne.contrepartie.source,
          porteCotisation: ligne.contrepartie.cotisation !== null,
          estLiee:
            ligne.contrepartie.occurrence !== null ||
            ligne.contrepartie.cotisation !== null ||
            ligne.contrepartie._count.liensObjectif > 0,
        };
  const contrepartie: ContrepartieEligibilite = contrepartieEligibilite(ligne.transferTransactionId, ownerId, faits);
  return refusEcriture(eligibilite, contrepartie);
}

function versRecurrence(ligne: LigneDetailBrute, ownerId: string): RecurrenceLiee | null {
  const occurrence = ligne.occurrence;
  if (occurrence?.rule.ownerId !== ownerId || occurrence.liaison === null) {
    return null;
  }
  return {
    occurrenceId: occurrence.id,
    ruleId: occurrence.ruleId,
    libelle: occurrence.rule.libelle,
    echeance: depuisDateUtc(occurrence.echeance),
    liaison: occurrence.liaison,
    lieeLe: occurrence.lieeLe === null ? null : dateCivileDansFuseau(occurrence.lieeLe, FUSEAU_APPLICATION),
  };
}

function versDetail(ligne: LigneDetailBrute, ownerId: string): DetailTransaction {
  const liste = versLigneListe(ligne, ownerId);
  return {
    id: liste.id,
    parentId: ligne.parentId,
    accountId: liste.accountId,
    compteNom: liste.compteNom,
    date: liste.date,
    description: liste.description,
    typeOperation: liste.typeOperation,
    montantCents: liste.montantCents,
    payeeId: liste.payeeId,
    beneficiaireNom: liste.beneficiaireNom,
    subcategoryId: liste.subcategoryId,
    sousCategorieNom: liste.sousCategorieNom,
    categorieNom: liste.categorieNom,
    note: ligne.details,
    etiquettes: liste.etiquettes,
    aRevoir: liste.aRevoir,
    exclureDuBudget: liste.exclureDuBudget,
    exclureDesRapports: liste.exclureDesRapports,
    source: ligne.source,
    etat: ligne.etat,
    rapprochement: ligne.rapprochement,
    externalId: ligne.externalId,
    empreinte: ligne.empreinte,
    lotImport:
      ligne.importBatch === null
        ? null
        : {
            id: ligne.importBatch.id,
            importeLeDate: dateCivileDansFuseau(ligne.importBatch.importeLe, FUSEAU_APPLICATION),
            libelle: ligne.importBatch.libelle,
            couvreDu: ligne.importBatch.couvreDu === null ? null : depuisDateUtc(ligne.importBatch.couvreDu),
            couvreAu: ligne.importBatch.couvreAu === null ? null : depuisDateUtc(ligne.importBatch.couvreAu),
          },
    regle: ligne.regle,
    estVentilee: liste.estVentilee,
    contrepartie: versContrepartie(ligne, ownerId),
    lignesVentilation: liste.lignesVentilation,
    nbLignesVentilation: liste.nbLignesVentilation,
    recurrence: versRecurrence(ligne, ownerId),
    refus: versRefus(ligne, ownerId),
  };
}

// ── le WHERE, en un seul exemplaire

/**
 * `lower(unaccent(x)) LIKE lower(unaccent(motif)) ESCAPE '!'` (le « ! » de
 * CARACTERE_ECHAPPEMENT_LIKE). `public.` : les extensions vivent dans public,
 * les tests dans le schéma test.
 */
function correspond(expression: Prisma.Sql, motif: string): Prisma.Sql {
  return Prisma.sql`lower(public.unaccent(${expression})) LIKE lower(public.unaccent(${motif})) ESCAPE '!'`;
}

function conditions(ownerId: string, c: CriteresTransactions): Prisma.Sql {
  const fragments: Prisma.Sql[] = [Prisma.sql`t."ownerId" = ${ownerId}`, Prisma.sql`t."parentId" IS NULL`];

  if (c.du !== null) {
    fragments.push(Prisma.sql`t."date" >= ${c.du}::date`);
  }
  if (c.au !== null) {
    fragments.push(Prisma.sql`t."date" <= ${c.au}::date`);
  }

  if (c.texte !== null) {
    const motif = motifRecherche(c.texte);
    fragments.push(
      Prisma.sql`(${correspond(Prisma.sql`t."description"`, motif)}
        OR ${correspond(Prisma.sql`coalesce(t."typeOperation", '')`, motif)}
        OR ${correspond(Prisma.sql`coalesce(t."details", '')`, motif)}
        OR EXISTS (SELECT 1 FROM "Payee" p WHERE p."id" = t."payeeId" AND ${correspond(Prisma.sql`p."nom"`, motif)})
        OR EXISTS (SELECT 1 FROM "Transaction" f WHERE f."parentId" = t."id" AND ${correspond(Prisma.sql`coalesce(f."details", '')`, motif)}))`,
    );
  }

  if (c.comptes.length > 0) {
    fragments.push(Prisma.sql`t."accountId" IN (${Prisma.join([...c.comptes])})`);
  }

  if (c.sousCategories.length > 0 || c.nonCategorisee) {
    const groupe: Prisma.Sql[] = [];
    if (c.sousCategories.length > 0) {
      const ids = Prisma.join([...c.sousCategories]);
      groupe.push(Prisma.sql`t."subcategoryId" IN (${ids})`);
      groupe.push(
        Prisma.sql`EXISTS (SELECT 1 FROM "Transaction" f WHERE f."parentId" = t."id" AND f."subcategoryId" IN (${ids}))`,
      );
    }
    if (c.nonCategorisee) {
      groupe.push(
        Prisma.sql`(t."subcategoryId" IS NULL AND NOT t."estVentilee" AND t."transferTransactionId" IS NULL)`,
      );
      groupe.push(
        Prisma.sql`EXISTS (SELECT 1 FROM "Transaction" f WHERE f."parentId" = t."id" AND f."subcategoryId" IS NULL)`,
      );
    }
    fragments.push(Prisma.sql`(${Prisma.join(groupe, " OR ")})`);
  }

  if (c.beneficiaires.length > 0) {
    fragments.push(Prisma.sql`t."payeeId" IN (${Prisma.join([...c.beneficiaires])})`);
  }

  if (c.etiquettes.length > 0) {
    const ids = Prisma.join([...c.etiquettes]);
    fragments.push(
      Prisma.sql`(EXISTS (SELECT 1 FROM "TransactionTag" tt WHERE tt."transactionId" = t."id" AND tt."tagId" IN (${ids}))
        OR EXISTS (SELECT 1 FROM "TransactionTag" tt JOIN "Transaction" f ON f."id" = tt."transactionId" WHERE f."parentId" = t."id" AND tt."tagId" IN (${ids})))`,
    );
  }

  if (c.montantMinCents !== null) {
    fragments.push(Prisma.sql`abs(t."montantCents"::bigint) >= ${c.montantMinCents}::bigint`);
  }
  if (c.montantMaxCents !== null) {
    fragments.push(Prisma.sql`abs(t."montantCents"::bigint) <= ${c.montantMaxCents}::bigint`);
  }

  if (c.sens === "ENTREES") {
    fragments.push(Prisma.sql`t."montantCents" > 0`);
  } else if (c.sens === "SORTIES") {
    fragments.push(Prisma.sql`t."montantCents" < 0`);
  }

  if (c.aRevoir) {
    fragments.push(Prisma.sql`t."aRevoir"`);
  }
  if (c.virements === "SEULEMENT") {
    fragments.push(Prisma.sql`t."transferTransactionId" IS NOT NULL`);
  } else if (c.virements === "EXCLURE") {
    fragments.push(Prisma.sql`t."transferTransactionId" IS NULL`);
  }
  if (c.recurrences === "SEULEMENT") {
    fragments.push(Prisma.sql`EXISTS (SELECT 1 FROM "ExpectedOccurrence" o WHERE o."transactionId" = t."id")`);
  } else if (c.recurrences === "EXCLURE") {
    fragments.push(Prisma.sql`NOT EXISTS (SELECT 1 FROM "ExpectedOccurrence" o WHERE o."transactionId" = t."id")`);
  }
  if (c.ventileesSeulement) {
    fragments.push(Prisma.sql`t."estVentilee"`);
  }
  if (c.exclueDuBudget) {
    fragments.push(Prisma.sql`t."exclureDuBudget"`);
  }
  if (c.exclueDesRapports) {
    fragments.push(Prisma.sql`t."exclureDesRapports"`);
  }

  return Prisma.join(fragments, " AND ");
}

// COLLATE "C" : sans lui l'ordre des id dépend de la collation de la base, et
// l'oracle JS (comparerLignes) ne le reproduirait plus.
const ORDRES: Record<`${TriTransactions["champ"]}_${TriTransactions["ordre"]}`, Prisma.Sql> = {
  DATE_ASC: Prisma.sql`ORDER BY t."date" ASC, t."id" COLLATE "C" ASC`,
  DATE_DESC: Prisma.sql`ORDER BY t."date" DESC, t."id" COLLATE "C" DESC`,
  MONTANT_ASC: Prisma.sql`ORDER BY t."montantCents" ASC, t."id" COLLATE "C" ASC`,
  MONTANT_DESC: Prisma.sql`ORDER BY t."montantCents" DESC, t."id" COLLATE "C" DESC`,
};

function apresCurseur(curseur: CurseurTransactions | null, tri: TriTransactions): Prisma.Sql {
  if (curseur === null) {
    return Prisma.empty;
  }
  const comparateur = tri.ordre === "ASC" ? Prisma.sql`>` : Prisma.sql`<`;
  if (curseur.champ === "DATE") {
    return Prisma.sql`AND (t."date", t."id" COLLATE "C") ${comparateur} (${curseur.date}::date, ${curseur.id}::text COLLATE "C")`;
  }
  return Prisma.sql`AND (t."montantCents"::bigint, t."id" COLLATE "C") ${comparateur} (${curseur.montantCents}::bigint,${curseur.id}::text COLLATE "C")`;
}

export async function listerTransactions(
  ownerId: string,
  criteres: CriteresTransactions,
  tri: TriTransactions,
  curseur: CurseurTransactions | null,
  taille: number = TAILLE_PAGE_TRANSACTIONS,
): Promise<PageTransactions> {
  const ordre = ORDRES[`${tri.champ}_${tri.ordre}`];
  const identifiants = await prisma.$queryRaw<{ id: string }[]>`
    SELECT t."id" FROM "Transaction" t
    WHERE ${conditions(ownerId, criteres)} ${apresCurseur(curseur, tri)}
    ${ordre}
    LIMIT ${taille + 1}
  `;
  if (identifiants.length === 0) {
    return { lignes: [], curseurSuivant: null };
  }

  const ids = identifiants.slice(0, taille).map((ligne) => ligne.id);
  const brutes = await prisma.transaction.findMany({
    where: { id: { in: ids }, ownerId },
    select: SELECTION_LISTE,
    take: taille,
  });
  const parId = new Map(brutes.map((ligne) => [ligne.id, ligne]));
  const lignes: LigneTransactionListe[] = [];
  for (const id of ids) {
    const brute = parId.get(id);
    if (brute !== undefined) {
      lignes.push(versLigneListe(brute, ownerId));
    }
  }

  const derniere = lignes[lignes.length - 1];
  const curseurSuivant =
    identifiants.length > taille && derniere !== undefined ? curseurApres(derniere, tri.champ) : null;
  return { lignes, curseurSuivant };
}

/**
 * Les identifiants des lignes de la liste qui répondent aux critères — le même
 * `conditions` que la page (docs/lot-m2.md §6.4). Au plus limite + 1, pour que
 * l'appelant détecte un dépassement sans tout lire.
 */
export async function idsSelonCriteres(
  client: Prisma.TransactionClient,
  ownerId: string,
  criteres: CriteresTransactions,
  limite: number,
): Promise<string[]> {
  const lignes = await client.$queryRaw<{ id: string }[]>`
    SELECT t."id" FROM "Transaction" t
    WHERE ${conditions(ownerId, criteres)}
    ORDER BY t."id" COLLATE "C"
    LIMIT ${limite + 1}
  `;
  return lignes.map((ligne) => ligne.id);
}

export async function totauxTransactions(ownerId: string, criteres: CriteresTransactions): Promise<TotauxTransactions> {
  const lignes = await prisma.$queryRaw<{ nombre: number; sommeCents: bigint }[]>`
    SELECT count(*)::int AS "nombre", coalesce(sum(t."montantCents"), 0)::bigint AS "sommeCents"
    FROM "Transaction" t
    WHERE ${conditions(ownerId, criteres)}
  `;
  const premiere = lignes[0];
  return { nombre: premiere?.nombre ?? 0, sommeCents: Number(premiere?.sommeCents ?? 0) };
}

export async function lireTransaction(ownerId: string, id: string): Promise<DetailTransaction | null> {
  const brute = await prisma.transaction.findFirst({ where: { id, ownerId }, select: SELECTION_DETAIL });
  return brute === null ? null : versDetail(brute, ownerId);
}

export type ResultatCandidatsVirement =
  | { readonly statut: "INTROUVABLE" }
  | { readonly statut: "REFUS"; readonly motif: MotifRefus }
  | { readonly statut: "CANDIDATS"; readonly candidats: readonly CandidatVirement[] };

/**
 * Les transactions que la transaction `id` peut rejoindre en virement (docs/lot-m2.md §4.4) : autres comptes, montant
 * opposé exact, à FENETRE_VIREMENT_JOURS près, ni liées ni ventilées. Bornée par LIMITE_BALAYAGE.
 */
export async function lireCandidatsVirement(ownerId: string, id: string): Promise<ResultatCandidatsVirement> {
  const source = await prisma.transaction.findFirst({
    where: { id, ownerId },
    select: {
      id: true,
      accountId: true,
      date: true,
      montantCents: true,
      parentId: true,
      estVentilee: true,
      transferTransactionId: true,
    },
  });
  if (source === null) {
    return { statut: "INTROUVABLE" };
  }
  const refus = refusLierVirement(source);
  if (refus !== null) {
    return { statut: "REFUS", motif: refus };
  }
  const date = depuisDateUtc(source.date);
  const autres = await lireTransactionsPourVirement(ownerId, {
    accountIdExclu: source.accountId,
    du: ajouterJours(date, -FENETRE_VIREMENT_JOURS),
    au: ajouterJours(date, FENETRE_VIREMENT_JOURS),
    montantsCents: [-source.montantCents],
  });
  const cote: CoteVirement = {
    id: source.id,
    accountId: source.accountId,
    date,
    montantCents: source.montantCents,
    parentId: source.parentId,
    estVentilee: source.estVentilee,
    transferTransactionId: source.transferTransactionId,
  };
  return { statut: "CANDIDATS", candidats: candidatsVirement(cote, autres) };
}

/** Lignes de la liste (parentId null) avec aRevoir, toutes dates. */
export async function compterARevoir(ownerId: string): Promise<number> {
  return prisma.transaction.count({ where: { ownerId, parentId: null, aRevoir: true } });
}

export async function possedeDesTransactions(ownerId: string): Promise<boolean> {
  const ligne = await prisma.transaction.findFirst({ where: { ownerId }, select: { id: true } });
  return ligne !== null;
}
