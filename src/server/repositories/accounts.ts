// Repository des comptes — spec M1 tranche 2 §5.1. Mêmes six règles que
// src/server/repositories/tags.ts : ownerId en premier paramètre, select
// jamais include, écriture et appartenance en une seule requête, aucune
// erreur attrapée, aucun message utilisateur, tri explicite.

import type { Prisma } from "@prisma/client";
import { depuisDateUtc, versDateUtc, type DateCivile } from "@/domain/dates";
import type { RegimeFiscal, TypeCompte } from "@/domain/referentiel";
import { prisma } from "@/server/db";

export interface CompteListe {
  readonly id: string;
  readonly nom: string;
  readonly type: TypeCompte;
  readonly institution: string | null;
  readonly soldeInitialCents: number;
  readonly dateSoldeInitial: DateCivile;
  readonly seuilSecuriteCents: number | null;
  readonly estBudgetaire: boolean;
  readonly inclureDansPrevision: boolean;
  readonly inclureDansValeurNette: boolean;
  readonly limiteCreditCents: number | null;
  readonly tauxAnnuel: number | null;
  readonly jourReleve: number | null;
  readonly jourEcheance: number | null;
  readonly perdDelaiDeGrace: boolean;
  readonly regimeFiscal: RegimeFiscal;
  readonly tauxRendementAnnuel: number | null;
  readonly compteLieId: string | null;
  readonly archive: boolean;
  readonly ordre: number;
  readonly nbTransactions: number;
  readonly nbRecurrences: number;
  readonly nbReleves: number;
  readonly nbReconciliations: number;
  /** Lots d'import rattachés — ImportBatch.account est en onDelete: Cascade (dette de la tranche 2, reprise en tranche 6). */
  readonly nbLotsImport: number;
}

/** Tout sauf id et nbTransactions. dateSoldeInitial est une DateCivile : la conversion en Date est ici. */
export interface EntreeCompteRepo {
  readonly nom: string;
  readonly type: TypeCompte;
  readonly institution: string | null;
  readonly soldeInitialCents: number;
  readonly dateSoldeInitial: DateCivile;
  readonly seuilSecuriteCents: number | null;
  readonly estBudgetaire: boolean;
  readonly inclureDansPrevision: boolean;
  readonly inclureDansValeurNette: boolean;
  readonly limiteCreditCents: number | null;
  readonly tauxAnnuel: number | null;
  readonly jourReleve: number | null;
  readonly jourEcheance: number | null;
  readonly perdDelaiDeGrace: boolean;
  readonly regimeFiscal: RegimeFiscal;
  readonly tauxRendementAnnuel: number | null;
  readonly compteLieId: string | null;
  readonly archive: boolean;
  readonly ordre: number;
}

const SELECTION_LISTE = {
  id: true,
  nom: true,
  type: true,
  institution: true,
  soldeInitialCents: true,
  dateSoldeInitial: true,
  seuilSecuriteCents: true,
  estBudgetaire: true,
  inclureDansPrevision: true,
  inclureDansValeurNette: true,
  limiteCreditCents: true,
  tauxAnnuel: true,
  jourReleve: true,
  jourEcheance: true,
  perdDelaiDeGrace: true,
  regimeFiscal: true,
  tauxRendementAnnuel: true,
  compteLieId: true,
  archive: true,
  ordre: true,
  _count: { select: { transactions: true, recurrences: true, releves: true, reconciliations: true, lots: true } },
} as const;

interface LigneCompte {
  id: string;
  nom: string;
  type: TypeCompte;
  institution: string | null;
  soldeInitialCents: number;
  dateSoldeInitial: Date;
  seuilSecuriteCents: number | null;
  estBudgetaire: boolean;
  inclureDansPrevision: boolean;
  inclureDansValeurNette: boolean;
  limiteCreditCents: number | null;
  tauxAnnuel: number | null;
  jourReleve: number | null;
  jourEcheance: number | null;
  perdDelaiDeGrace: boolean;
  regimeFiscal: RegimeFiscal;
  tauxRendementAnnuel: number | null;
  compteLieId: string | null;
  archive: boolean;
  ordre: number;
  _count: { transactions: number; recurrences: number; releves: number; reconciliations: number; lots: number };
}

function versCompteListe(ligne: LigneCompte): CompteListe {
  return {
    id: ligne.id,
    nom: ligne.nom,
    type: ligne.type,
    institution: ligne.institution,
    soldeInitialCents: ligne.soldeInitialCents,
    dateSoldeInitial: depuisDateUtc(ligne.dateSoldeInitial),
    seuilSecuriteCents: ligne.seuilSecuriteCents,
    estBudgetaire: ligne.estBudgetaire,
    inclureDansPrevision: ligne.inclureDansPrevision,
    inclureDansValeurNette: ligne.inclureDansValeurNette,
    limiteCreditCents: ligne.limiteCreditCents,
    tauxAnnuel: ligne.tauxAnnuel,
    jourReleve: ligne.jourReleve,
    jourEcheance: ligne.jourEcheance,
    perdDelaiDeGrace: ligne.perdDelaiDeGrace,
    regimeFiscal: ligne.regimeFiscal,
    tauxRendementAnnuel: ligne.tauxRendementAnnuel,
    compteLieId: ligne.compteLieId,
    archive: ligne.archive,
    ordre: ligne.ordre,
    nbTransactions: ligne._count.transactions,
    nbRecurrences: ligne._count.recurrences,
    nbReleves: ligne._count.releves,
    nbReconciliations: ligne._count.reconciliations,
    nbLotsImport: ligne._count.lots,
  };
}

function versData(entree: EntreeCompteRepo) {
  return {
    nom: entree.nom,
    type: entree.type,
    institution: entree.institution,
    soldeInitialCents: entree.soldeInitialCents,
    dateSoldeInitial: versDateUtc(entree.dateSoldeInitial),
    seuilSecuriteCents: entree.seuilSecuriteCents,
    estBudgetaire: entree.estBudgetaire,
    inclureDansPrevision: entree.inclureDansPrevision,
    inclureDansValeurNette: entree.inclureDansValeurNette,
    limiteCreditCents: entree.limiteCreditCents,
    tauxAnnuel: entree.tauxAnnuel,
    jourReleve: entree.jourReleve,
    jourEcheance: entree.jourEcheance,
    perdDelaiDeGrace: entree.perdDelaiDeGrace,
    regimeFiscal: entree.regimeFiscal,
    tauxRendementAnnuel: entree.tauxRendementAnnuel,
    compteLieId: entree.compteLieId,
    archive: entree.archive,
    ordre: entree.ordre,
  };
}

/**
 * Vérification légère d'appartenance — docs/lot-m1.md §7 (analyse d'un
 * relevé collé) : un identifiant venu du client ne prouve rien (CLAUDE.md
 * §6.3), sans avoir à rapatrier tout CompteListe pour ce seul contrôle.
 */
export async function compteExiste(ownerId: string, id: string): Promise<boolean> {
  const compte = await prisma.account.findFirst({ where: { id, ownerId }, select: { id: true } });
  return compte !== null;
}

export async function listerComptes(ownerId: string): Promise<CompteListe[]> {
  const lignes = await prisma.account.findMany({
    where: { ownerId },
    select: SELECTION_LISTE,
    orderBy: [{ archive: "asc" }, { ordre: "asc" }, { nom: "asc" }],
  });
  return lignes.map(versCompteListe);
}

/** Un identifiant venu du client ne prouve rien (CLAUDE.md §6.3) : vérifié dans la même transaction que l'écriture. */
async function compteLieValide(
  tx: Prisma.TransactionClient,
  ownerId: string,
  compteLieId: string | null,
): Promise<boolean> {
  if (compteLieId === null) {
    return true;
  }
  const compteLie = await tx.account.findFirst({ where: { id: compteLieId, ownerId }, select: { id: true } });
  return compteLie !== null;
}

/** null = le compte lié choisi n'existe pas ou n'appartient pas au propriétaire. */
export async function creerCompte(ownerId: string, entree: EntreeCompteRepo): Promise<CompteListe | null> {
  return prisma.$transaction(async (tx) => {
    if (!(await compteLieValide(tx, ownerId, entree.compteLieId))) {
      return null;
    }
    const ligne = await tx.account.create({
      data: { ownerId, ...versData(entree) },
      select: SELECTION_LISTE,
    });
    return versCompteListe(ligne);
  });
}

/**
 * Retourne le nombre de lignes touchées : 0 = inexistant ou d'un autre
 * propriétaire ; null = le compte lié choisi n'existe pas ou n'appartient
 * pas au propriétaire.
 */
export async function modifierCompte(
  ownerId: string,
  id: string,
  entree: EntreeCompteRepo,
): Promise<number | null> {
  return prisma.$transaction(async (tx) => {
    if (!(await compteLieValide(tx, ownerId, entree.compteLieId))) {
      return null;
    }
    const resultat = await tx.account.updateMany({
      where: { id, ownerId },
      data: versData(entree),
    });
    return resultat.count;
  });
}

export async function archiverCompte(ownerId: string, id: string, archive: boolean): Promise<number> {
  const resultat = await prisma.account.updateMany({
    where: { id, ownerId },
    data: { archive },
  });
  return resultat.count;
}

/** { supprimes: 0; nbTransactions: 0 } signifie « inexistant ou pas à moi ». */
export async function supprimerCompte(
  ownerId: string,
  id: string,
): Promise<{ supprimes: number; nbTransactions: number }> {
  return prisma.$transaction(async (tx) => {
    const nbTransactions = await tx.transaction.count({ where: { accountId: id, account: { ownerId } } });
    if (nbTransactions > 0) {
      return { supprimes: 0, nbTransactions };
    }
    const { count: supprimes } = await tx.account.deleteMany({ where: { id, ownerId } });
    return { supprimes, nbTransactions: 0 };
  });
}
