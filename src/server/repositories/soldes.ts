// Soldes et réconciliation — docs/lot-m3.md §3.4, §3.7, §3.8, §5. Le solde calculé
// n'est jamais stocké : c'est soldeInitial + Σ des transactions (parentId null) à
// la date d'un ancrage, recalculé à chaque lecture. Une réconciliation garde
// l'écart constaté quand elle est née ; l'écart courant se recalcule.

import { Prisma } from "@prisma/client";
import { z } from "zod";
import { depuisDateUtc, versDateUtc, type DateCivile } from "@/domain/dates";
import { normaliserDescription } from "@/domain/ingestion/normaliser";
import { TOLERANCE_QUASI_DOUBLON_JOURS } from "@/domain/ingestion/types";
import type { Cents } from "@/domain/money";
import { SOURCES_INGESTION } from "@/domain/referentiel";
import {
  DESCRIPTION_AJUSTEMENT,
  ecart,
  ecartRepresentable,
  LIMITE_ANCRAGES,
  LIMITE_DOUBLONS_DIAGNOSTIC,
  LIMITE_LIGNES_MONTANT_DIAGNOSTIC,
  NOM_CATEGORIE_AJUSTEMENTS,
  NOM_SOUS_CATEGORIE_AJUSTEMENT,
  refusAjustement,
  soldeCalcule,
  statutAncrage,
  type AncrageAffiche,
  type ContexteDiagnostic,
  type FicheCompte,
  type MotifRefusAjustement,
  type PaireQuasiDoublon,
  type SourceSoldeSaisissable,
  type TransactionDiagnostic,
} from "@/domain/solde";
import { empreinteAjustement } from "@/domain/solde/empreinte";
import { prisma } from "@/server/db";
import { MAX_WAIT_TRANSACTION_MS, TIMEOUT_TRANSACTION_MS } from "./transactions";
import { verrouillerTransactions } from "./verrous";

const OPTIONS_TRANSACTION = { maxWait: MAX_WAIT_TRANSACTION_MS, timeout: TIMEOUT_TRANSACTION_MS } as const;

type Client = Prisma.TransactionClient;

// ── sommes

/** Somme au jour D (partout) : parentId null, toutes sources et tous états, jour D inclus. */
async function sommeAuJour(client: Client, accountId: string, date: DateCivile): Promise<Cents> {
  const agregat = await client.transaction.aggregate({
    where: { accountId, parentId: null, date: { lte: versDateUtc(date) } },
    _sum: { montantCents: true },
  });
  return agregat._sum.montantCents ?? 0;
}

/** Une seule requête : groupBy accountId. Les comptes sans transaction sont absents de la carte. */
export async function sommesParCompte(ownerId: string, date: DateCivile): Promise<ReadonlyMap<string, Cents>> {
  const lignes = await prisma.transaction.groupBy({
    by: ["accountId"],
    where: { ownerId, parentId: null, date: { lte: versDateUtc(date) } },
    _sum: { montantCents: true },
  });
  return new Map(lignes.map((l) => [l.accountId, l._sum.montantCents ?? 0]));
}

const schemaSommesAncrages = z.array(z.object({ id: z.string(), somme: z.bigint() }));

// ── lecture

const SELECTION_ANCRAGE = {
  id: true,
  accountId: true,
  date: true,
  source: true,
  soldeCents: true,
  reconciliation: {
    select: {
      id: true,
      ecartCents: true,
      explication: true,
      ajustement: { select: { id: true, date: true, montantCents: true } },
    },
  },
} as const satisfies Prisma.BalanceStatementSelect;

type LigneAncrage = Prisma.BalanceStatementGetPayload<{ select: typeof SELECTION_ANCRAGE }>;

function versAncrage(ligne: LigneAncrage, soldeInitialCents: Cents, somme: Cents): AncrageAffiche {
  const calcule = soldeCalcule(soldeInitialCents, somme);
  const courant = ecart(ligne.soldeCents, calcule);
  const reconciliation = ligne.reconciliation;
  return {
    id: ligne.id,
    accountId: ligne.accountId,
    date: depuisDateUtc(ligne.date),
    source: ligne.source,
    soldeDeclareCents: ligne.soldeCents,
    soldeCalculeCents: calcule,
    ecartCourantCents: courant,
    statut: statutAncrage(courant, reconciliation?.explication ?? null),
    refusAjustement: refusAjustement(courant, reconciliation?.ajustement != null),
    reconciliation:
      reconciliation === null
        ? null
        : {
            id: reconciliation.id,
            ecartConstateCents: reconciliation.ecartCents,
            explication: reconciliation.explication,
            ajustement:
              reconciliation.ajustement === null
                ? null
                : {
                    transactionId: reconciliation.ajustement.id,
                    date: depuisDateUtc(reconciliation.ajustement.date),
                    montantCents: reconciliation.ajustement.montantCents,
                  },
          },
  };
}

/** null = compte inexistant ou d'un autre propriétaire. Nombre fixe de requêtes (≤ 5), jamais une par ancrage. */
export async function lireFicheCompte(
  ownerId: string,
  accountId: string,
  aujourdhui: DateCivile,
): Promise<FicheCompte | null> {
  const compte = await prisma.account.findFirst({
    where: { id: accountId, ownerId },
    select: { id: true, nom: true, type: true, archive: true, soldeInitialCents: true },
  });
  if (compte === null) {
    return null;
  }
  const [sommeAujourdhui, nbAncrages, lignes] = await Promise.all([
    sommeAuJour(prisma, accountId, aujourdhui),
    prisma.balanceStatement.count({ where: { accountId } }),
    prisma.balanceStatement.findMany({
      where: { accountId },
      select: SELECTION_ANCRAGE,
      orderBy: [{ date: "desc" }, { saisiLe: "desc" }, { id: "asc" }],
      take: LIMITE_ANCRAGES,
    }),
  ]);
  const sommes = new Map<string, Cents>();
  if (lignes.length > 0) {
    const brutes = await prisma.$queryRaw<unknown[]>`
      SELECT b."id", COALESCE(SUM(t."montantCents"), 0)::bigint AS "somme"
      FROM "BalanceStatement" b
      LEFT JOIN "Transaction" t ON t."accountId" = b."accountId" AND t."parentId" IS NULL AND t."date" <= b."date"
      WHERE b."id" IN (${Prisma.join(lignes.map((l) => l.id))})
      GROUP BY b."id"
    `;
    for (const s of schemaSommesAncrages.parse(brutes)) {
      sommes.set(s.id, Number(s.somme));
    }
  }
  return {
    compte: { id: compte.id, nom: compte.nom, type: compte.type, archive: compte.archive },
    aujourdhui,
    soldeAujourdhuiCents: soldeCalcule(compte.soldeInitialCents, sommeAujourdhui),
    ancrages: lignes.map((l) => versAncrage(l, compte.soldeInitialCents, sommes.get(l.id) ?? 0)),
    nbAncrages,
  };
}

const schemaPaires = z.array(
  z.object({
    aId: z.string(),
    aDate: z.string(),
    aDescription: z.string(),
    aSource: z.enum(SOURCES_INGESTION),
    bId: z.string(),
    bDate: z.string(),
    bDescription: z.string(),
    bSource: z.enum(SOURCES_INGESTION),
    montantCents: z.number().int(),
  }),
);

/** null = ancrage inexistant ou d'un autre propriétaire. L'action appelle explicationsProbables sur le contexte. */
export async function lireDiagnostic(
  ownerId: string,
  statementId: string,
): Promise<{ readonly ancrage: AncrageAffiche; readonly contexte: ContexteDiagnostic } | null> {
  const ligne = await prisma.balanceStatement.findFirst({
    where: { id: statementId, account: { ownerId } },
    select: { ...SELECTION_ANCRAGE, account: { select: { soldeInitialCents: true } } },
  });
  if (ligne === null) {
    return null;
  }
  const accountId = ligne.accountId;
  const dateAncrage = depuisDateUtc(ligne.date);
  const somme = await sommeAuJour(prisma, accountId, dateAncrage);
  const ancrage = versAncrage(ligne, ligne.account.soldeInitialCents, somme);
  const ecartCourant = ancrage.ecartCourantCents;

  const precedent = await prisma.balanceStatement.findFirst({
    where: { accountId, date: { lt: ligne.date } },
    orderBy: { date: "desc" },
    select: { date: true },
  });
  const dateAncragePrecedent = precedent === null ? null : depuisDateUtc(precedent.date);
  // Période (D5) : ]ancrage précédent ; ancrage], ou ]−∞ ; ancrage] sans précédent.
  const periode: Prisma.DateTimeFilter = {
    lte: ligne.date,
    ...(precedent === null ? {} : { gt: precedent.date }),
  };

  const [derniere, imports, attente, brutes, aVerifier] = await Promise.all([
    prisma.transaction.aggregate({
      where: { accountId, parentId: null, source: { not: "AJUSTEMENT" } },
      _max: { date: true },
    }),
    prisma.importBatch.aggregate({ where: { accountId, ownerId }, _max: { couvreAu: true } }),
    prisma.transaction.aggregate({
      where: { accountId, parentId: null, etat: "EN_ATTENTE", date: { lte: ligne.date } },
      _count: { _all: true },
      _sum: { montantCents: true },
    }),
    prisma.$queryRaw<unknown[]>`
      SELECT a."id" AS "aId", to_char(a."date", 'YYYY-MM-DD') AS "aDate", a."description" AS "aDescription",
             a."source"::text AS "aSource",
             b."id" AS "bId", to_char(b."date", 'YYYY-MM-DD') AS "bDate", b."description" AS "bDescription",
             b."source"::text AS "bSource",
             a."montantCents" AS "montantCents"
      FROM "Transaction" a
      JOIN "Transaction" b
        ON b."accountId" = a."accountId"
       AND b."montantCents" = a."montantCents"
       AND b."descriptionNormalisee" = a."descriptionNormalisee"
       AND b."id" COLLATE "C" > a."id" COLLATE "C"
       AND abs(b."date" - a."date") <= ${TOLERANCE_QUASI_DOUBLON_JOURS}
      WHERE a."accountId" = ${accountId}
        AND a."parentId" IS NULL AND b."parentId" IS NULL
        AND a."date" <= ${dateAncrage}::date AND b."date" <= ${dateAncrage}::date
        AND (${dateAncragePrecedent}::date IS NULL
             OR (a."date" > ${dateAncragePrecedent}::date AND b."date" > ${dateAncragePrecedent}::date))
      ORDER BY greatest(a."date", b."date") DESC, a."id" COLLATE "C", b."id" COLLATE "C"
      LIMIT ${LIMITE_DOUBLONS_DIAGNOSTIC + 1}
    `,
    prisma.transaction.findMany({
      where: {
        accountId,
        parentId: null,
        date: periode,
        OR: [
          { source: "MANUELLE" },
          ...(ecartCourant === 0 || !ecartRepresentable(ecartCourant)
            ? []
            : [{ montantCents: ecartCourant }, { montantCents: -ecartCourant }]),
        ],
      },
      select: { id: true, date: true, montantCents: true, description: true, source: true },
      orderBy: [{ date: "desc" }, { id: "asc" }],
      take: LIMITE_LIGNES_MONTANT_DIAGNOSTIC + 1,
    }),
  ]);

  const paires = schemaPaires.parse(brutes);
  const quasiDoublons: PaireQuasiDoublon[] = paires.slice(0, LIMITE_DOUBLONS_DIAGNOSTIC).map((p) => ({
    a: { id: p.aId, date: p.aDate, montantCents: p.montantCents, description: p.aDescription, source: p.aSource },
    b: { id: p.bId, date: p.bDate, montantCents: p.montantCents, description: p.bDescription, source: p.bSource },
  }));
  const transactionsAVerifier: TransactionDiagnostic[] = aVerifier.slice(0, LIMITE_LIGNES_MONTANT_DIAGNOSTIC).map(
    (t) => ({
      id: t.id,
      date: depuisDateUtc(t.date),
      montantCents: t.montantCents,
      description: t.description,
      source: t.source,
    }),
  );

  return {
    ancrage,
    contexte: {
      dateAncrage,
      ecartCourantCents: ecartCourant,
      dateAncragePrecedent,
      dateDerniereTransaction: derniere._max.date === null ? null : depuisDateUtc(derniere._max.date),
      finCouvertureImports: imports._max.couvreAu === null ? null : depuisDateUtc(imports._max.couvreAu),
      enAttente: { nombre: attente._count._all, sommeCents: attente._sum.montantCents ?? 0 },
      quasiDoublons,
      quasiDoublonsTronques: paires.length > LIMITE_DOUBLONS_DIAGNOSTIC,
      transactionsAVerifier,
      transactionsAVerifierTronquees: aVerifier.length > LIMITE_LIGNES_MONTANT_DIAGNOSTIC,
    },
  };
}

// ── écriture

export type ResultatSaisieSolde =
  | { readonly statut: "COMPTE_INTROUVABLE" }
  | { readonly statut: "DOUBLON" }
  | { readonly statut: "ECART_HORS_LIMITE" }
  | {
      readonly statut: "SAISI";
      readonly statementId: string;
      readonly soldeCalculeCents: Cents;
      readonly ecartCents: Cents;
    };

/** Une course qui lève P2002 remonte : l'action la traduit en DUPLICATE. */
export async function saisirSolde(
  ownerId: string,
  entree: {
    readonly accountId: string;
    readonly date: DateCivile;
    readonly soldeCents: Cents;
    readonly source: SourceSoldeSaisissable;
  },
): Promise<ResultatSaisieSolde> {
  return prisma.$transaction(async (tx): Promise<ResultatSaisieSolde> => {
    const compte = await tx.account.findFirst({
      where: { id: entree.accountId, ownerId },
      select: { soldeInitialCents: true },
    });
    if (compte === null) {
      return { statut: "COMPTE_INTROUVABLE" };
    }
    const date = versDateUtc(entree.date);
    const existant = await tx.balanceStatement.findFirst({
      where: { accountId: entree.accountId, date, source: entree.source },
      select: { id: true },
    });
    if (existant !== null) {
      return { statut: "DOUBLON" };
    }
    const calcule = soldeCalcule(compte.soldeInitialCents, await sommeAuJour(tx, entree.accountId, entree.date));
    const ecartCents = ecart(entree.soldeCents, calcule);
    if (!ecartRepresentable(ecartCents)) {
      return { statut: "ECART_HORS_LIMITE" };
    }
    const cree = await tx.balanceStatement.create({
      data: { accountId: entree.accountId, date, soldeCents: entree.soldeCents, source: entree.source },
      select: { id: true },
    });
    if (ecartCents !== 0) {
      await tx.reconciliation.create({
        data: { accountId: entree.accountId, statementId: cree.id, ecartCents },
        select: { id: true },
      });
    }
    return { statut: "SAISI", statementId: cree.id, soldeCalculeCents: calcule, ecartCents };
  }, OPTIONS_TRANSACTION);
}

/** Verrou d'ancrage : false = ancrage inexistant ou d'un autre propriétaire. */
async function verrouillerAncrage(tx: Client, ownerId: string, statementId: string): Promise<boolean> {
  const lignes = await tx.$queryRaw<unknown[]>`
    SELECT b."id" FROM "BalanceStatement" b JOIN "Account" a ON a."id" = b."accountId"
    WHERE b."id" = ${statementId} AND a."ownerId" = ${ownerId} FOR UPDATE OF b
  `;
  return lignes.length > 0;
}

const SELECTION_ANCRAGE_ECRITURE = {
  id: true,
  accountId: true,
  date: true,
  soldeCents: true,
  account: { select: { soldeInitialCents: true } },
  reconciliation: { select: { id: true, ajustementTxId: true } },
} as const satisfies Prisma.BalanceStatementSelect;

async function lireAncrageEcriture(tx: Client, statementId: string) {
  const ligne = await tx.balanceStatement.findUniqueOrThrow({
    where: { id: statementId },
    select: SELECTION_ANCRAGE_ECRITURE,
  });
  const somme = await sommeAuJour(tx, ligne.accountId, depuisDateUtc(ligne.date));
  const ecartCourant = ecart(ligne.soldeCents, soldeCalcule(ligne.account.soldeInitialCents, somme));
  return { ligne, ecartCourant };
}

export type ResultatExplication =
  | { readonly statut: "INTROUVABLE" }
  | { readonly statut: "ECART_HORS_LIMITE" }
  | { readonly statut: "ECART_NUL" }
  | { readonly statut: "EXPLIQUE"; readonly reconciliationCreee: boolean };

export async function expliquerEcart(
  ownerId: string,
  statementId: string,
  explication: string,
): Promise<ResultatExplication> {
  return prisma.$transaction(async (tx): Promise<ResultatExplication> => {
    if (!(await verrouillerAncrage(tx, ownerId, statementId))) {
      return { statut: "INTROUVABLE" };
    }
    const { ligne, ecartCourant } = await lireAncrageEcriture(tx, statementId);
    if (ligne.reconciliation === null) {
      if (!ecartRepresentable(ecartCourant)) {
        return { statut: "ECART_HORS_LIMITE" };
      }
      if (ecartCourant === 0) {
        return { statut: "ECART_NUL" };
      }
      await tx.reconciliation.create({
        data: { accountId: ligne.accountId, statementId, ecartCents: ecartCourant, explication, regleeLe: new Date() },
        select: { id: true },
      });
      return { statut: "EXPLIQUE", reconciliationCreee: true };
    }
    await tx.reconciliation.update({
      where: { id: ligne.reconciliation.id },
      data: { explication, regleeLe: new Date() },
      select: { id: true },
    });
    return { statut: "EXPLIQUE", reconciliationCreee: false };
  }, OPTIONS_TRANSACTION);
}

/** D4 : la sous-catégorie système d'ajustement du propriétaire, créée (avec sa catégorie) si elle manque. */
async function assurerSousCategorieAjustement(
  tx: Client,
  ownerId: string,
): Promise<{ readonly id: string; readonly creee: boolean }> {
  const systeme = await tx.subcategory.findFirst({
    where: { systeme: true, nom: NOM_SOUS_CATEGORIE_AJUSTEMENT, category: { ownerId } },
    orderBy: { id: "asc" },
    select: { id: true },
  });
  if (systeme !== null) {
    return { id: systeme.id, creee: false };
  }
  let categorie = await tx.category.findFirst({
    where: { ownerId, nom: NOM_CATEGORIE_AJUSTEMENTS },
    select: { id: true },
  });
  if (categorie === null) {
    const max = await tx.category.aggregate({ where: { ownerId }, _max: { ordre: true } });
    categorie = await tx.category.create({
      data: { ownerId, nom: NOM_CATEGORIE_AJUSTEMENTS, ordre: (max._max.ordre ?? -1) + 1 },
      select: { id: true },
    });
  }
  const existante = await tx.subcategory.findFirst({
    where: { categoryId: categorie.id, nom: NOM_SOUS_CATEGORIE_AJUSTEMENT },
    select: { id: true },
  });
  if (existante !== null) {
    await tx.subcategory.update({ where: { id: existante.id }, data: { systeme: true }, select: { id: true } });
    return { id: existante.id, creee: false };
  }
  const max = await tx.subcategory.aggregate({ where: { categoryId: categorie.id }, _max: { ordre: true } });
  const creee = await tx.subcategory.create({
    data: {
      categoryId: categorie.id,
      nom: NOM_SOUS_CATEGORIE_AJUSTEMENT,
      ordre: (max._max.ordre ?? -1) + 1,
      systeme: true,
    },
    select: { id: true },
  });
  return { id: creee.id, creee: true };
}

export type ResultatAjustement =
  | { readonly statut: "INTROUVABLE" }
  | { readonly statut: "REFUS"; readonly motif: MotifRefusAjustement }
  | {
      readonly statut: "AJUSTE";
      readonly transactionId: string;
      readonly date: DateCivile;
      readonly montantCents: Cents;
      readonly sousCategorieCreee: boolean;
    };

export async function creerAjustement(ownerId: string, statementId: string): Promise<ResultatAjustement> {
  return prisma.$transaction(async (tx): Promise<ResultatAjustement> => {
    if (!(await verrouillerAncrage(tx, ownerId, statementId))) {
      return { statut: "INTROUVABLE" };
    }
    const { ligne, ecartCourant } = await lireAncrageEcriture(tx, statementId);
    const motif = refusAjustement(ecartCourant, ligne.reconciliation?.ajustementTxId != null);
    if (motif !== null) {
      return { statut: "REFUS", motif };
    }
    const reconciliationId =
      ligne.reconciliation?.id ??
      (
        await tx.reconciliation.create({
          data: { accountId: ligne.accountId, statementId, ecartCents: ecartCourant },
          select: { id: true },
        })
      ).id;
    const sousCategorie = await assurerSousCategorieAjustement(tx, ownerId);
    const ajustement = await tx.transaction.create({
      data: {
        ownerId,
        accountId: ligne.accountId,
        date: ligne.date,
        description: DESCRIPTION_AJUSTEMENT,
        descriptionNormalisee: normaliserDescription(DESCRIPTION_AJUSTEMENT),
        montantCents: ecartCourant,
        subcategoryId: sousCategorie.id,
        payeeId: null,
        appliedRuleId: null,
        parentId: null,
        source: "AJUSTEMENT",
        etat: "COMPTABILISEE",
        empreinte: empreinteAjustement(statementId),
      },
      select: { id: true },
    });
    await tx.reconciliation.update({
      where: { id: reconciliationId },
      data: { ajustementTxId: ajustement.id, regleeLe: new Date() },
      select: { id: true },
    });
    return {
      statut: "AJUSTE",
      transactionId: ajustement.id,
      date: depuisDateUtc(ligne.date),
      montantCents: ecartCourant,
      sousCategorieCreee: sousCategorie.creee,
    };
  }, OPTIONS_TRANSACTION);
}

export type ResultatSuppressionAncrage =
  | { readonly statut: "INTROUVABLE" }
  | { readonly statut: "AJUSTEMENT_LIE" }
  | {
      readonly statut: "SUPPRIME";
      readonly ajustementSupprime: { readonly date: DateCivile; readonly montantCents: Cents } | null;
    };

export async function supprimerAncrage(ownerId: string, statementId: string): Promise<ResultatSuppressionAncrage> {
  return prisma.$transaction(async (tx): Promise<ResultatSuppressionAncrage> => {
    if (!(await verrouillerAncrage(tx, ownerId, statementId))) {
      return { statut: "INTROUVABLE" };
    }
    const reconciliation = await tx.reconciliation.findUnique({
      where: { statementId },
      select: { ajustementTxId: true },
    });
    const ajustementId = reconciliation?.ajustementTxId ?? null;
    let ajustementSupprime: { date: DateCivile; montantCents: Cents } | null = null;
    if (ajustementId !== null) {
      await verrouillerTransactions(tx, ownerId, [ajustementId]);
      const ajustement = await tx.transaction.findFirst({
        where: { id: ajustementId, ownerId },
        select: {
          date: true,
          montantCents: true,
          transferTransactionId: true,
          occurrence: { select: { id: true } },
          cotisation: { select: { id: true } },
          _count: { select: { liensObjectif: true } },
          lignes: {
            where: {
              OR: [
                { occurrence: { isNot: null } },
                { cotisation: { isNot: null } },
                { liensObjectif: { some: {} } },
              ],
            },
            select: { id: true },
            take: 1,
          },
        },
      });
      if (ajustement !== null) {
        const lie =
          ajustement.transferTransactionId !== null ||
          ajustement.occurrence !== null ||
          ajustement.cotisation !== null ||
          ajustement._count.liensObjectif > 0 ||
          ajustement.lignes.length > 0;
        if (lie) {
          return { statut: "AJUSTEMENT_LIE" };
        }
        ajustementSupprime = { date: depuisDateUtc(ajustement.date), montantCents: ajustement.montantCents };
      }
    }
    await tx.balanceStatement.delete({ where: { id: statementId }, select: { id: true } });
    if (ajustementId !== null) {
      await tx.transaction.deleteMany({ where: { id: ajustementId, ownerId } });
    }
    return { statut: "SUPPRIME", ajustementSupprime };
  }, OPTIONS_TRANSACTION);
}
