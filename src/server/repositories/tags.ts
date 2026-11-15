// Le patron de repository — spec M1 tranche 1 §5.6. Les six règles ici
// respectées mot pour mot sont copiées par les cinq autres repositories de
// référentiel (comptes, catégories, sous-catégories, bénéficiaires, filtres) :
//
// 1. ownerId est le premier paramètre de chaque fonction ; aucune fonction ne
//    lit toute une table.
// 2. select, jamais include (CLAUDE.md §7) — nbTransactions vient d'un _count.
// 3. Écriture et vérification d'appartenance en une seule requête
//    (updateMany / deleteMany filtrés sur id + ownerId), jamais un findUnique
//    suivi d'un update : la lecture préalable ne prouve rien et ouvre une course.
// 4. Aucune erreur n'est attrapée ici : tenter() la traduit.
// 5. Aucun throw métier, aucun message utilisateur : le repository ne connaît
//    pas l'interface.
// 6. Tri stable et explicite.

import { prisma } from "@/server/db";

export interface EtiquetteListe {
  readonly id: string;
  readonly nom: string;
  readonly couleur: string | null;
  readonly cibleMensuelleCents: number | null;
  readonly nbTransactions: number;
}

export interface EntreeEtiquetteRepo {
  readonly nom: string;
  readonly couleur: string | null;
  readonly cibleMensuelleCents: number | null;
}

const SELECTION_LISTE = {
  id: true,
  nom: true,
  couleur: true,
  cibleMensuelleCents: true,
  _count: { select: { transactions: true } },
} as const;

function versEtiquetteListe(ligne: {
  id: string;
  nom: string;
  couleur: string | null;
  cibleMensuelleCents: number | null;
  _count: { transactions: number };
}): EtiquetteListe {
  return {
    id: ligne.id,
    nom: ligne.nom,
    couleur: ligne.couleur,
    cibleMensuelleCents: ligne.cibleMensuelleCents,
    nbTransactions: ligne._count.transactions,
  };
}

export async function listerEtiquettes(ownerId: string): Promise<EtiquetteListe[]> {
  const lignes = await prisma.tag.findMany({
    where: { ownerId },
    select: SELECTION_LISTE,
    orderBy: { nom: "asc" },
  });
  return lignes.map(versEtiquetteListe);
}

export async function creerEtiquette(ownerId: string, entree: EntreeEtiquetteRepo): Promise<EtiquetteListe> {
  const ligne = await prisma.tag.create({
    data: { ownerId, ...entree },
    select: SELECTION_LISTE,
  });
  return versEtiquetteListe(ligne);
}

/** Retourne le nombre de lignes touchées : 0 = inexistante ou d'un autre propriétaire. */
export async function modifierEtiquette(
  ownerId: string,
  id: string,
  entree: EntreeEtiquetteRepo,
): Promise<number> {
  const resultat = await prisma.tag.updateMany({
    where: { id, ownerId },
    data: entree,
  });
  return resultat.count;
}

/** Retourne le nombre de lignes supprimées et le nombre de liaisons détachées. */
export async function supprimerEtiquette(
  ownerId: string,
  id: string,
): Promise<{ supprimees: number; transactionsDetachees: number }> {
  return prisma.$transaction(async (tx) => {
    const transactionsDetachees = await tx.transactionTag.count({ where: { tagId: id, tag: { ownerId } } });
    const { count: supprimees } = await tx.tag.deleteMany({ where: { id, ownerId } });
    return { supprimees, transactionsDetachees: supprimees > 0 ? transactionsDetachees : 0 };
  });
}
