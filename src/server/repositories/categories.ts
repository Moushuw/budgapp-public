// Repository des catégories et sous-catégories — spec M1 tranche 2 §5.2.
// Mêmes six règles que src/server/repositories/tags.ts. Subcategory ne porte
// pas d'ownerId : l'appartenance se filtre par la relation
// `category: { ownerId }`.

import { Prisma } from "@prisma/client";
import type { ModeBudget, ModeReport } from "@/domain/referentiel";
import { prisma } from "@/server/db";

export interface SousCategorieListe {
  readonly id: string;
  readonly categoryId: string;
  readonly nom: string;
  readonly ordre: number;
  readonly masquee: boolean;
  readonly systeme: boolean;
  readonly reportActif: boolean;
  readonly reportMode: ModeReport;
  // Ce que sa suppression emporterait — rien ne disparaît en silence (règle 6).
  readonly nbTransactions: number; // détachées (SetNull)
  readonly nbAllocations: number; // supprimées (Cascade)
  readonly nbActionsRegles: number; // supprimées (Cascade)
  readonly nbMouvements: number; // mouvementsDe + mouvementsA, supprimés (Cascade)
  readonly nbBeneficiaires: number; // détachés (SetNull)
  readonly nbRecurrences: number; // détachées (SetNull)
  readonly nbEvenements: number; // détachés (SetNull)
  readonly aCible: boolean; // Target, supprimée (Cascade)
  readonly aPrevision: boolean; // SubcategoryForecast, supprimée (Cascade)
}

export interface CategorieListe {
  readonly id: string;
  readonly nom: string;
  readonly ordre: number;
  readonly couleur: string | null;
  readonly icone: string | null;
  readonly masquee: boolean;
  readonly modeBudget: ModeBudget;
  readonly nbAllocations: number; // allocations posées sur la catégorie elle-même
  readonly sousCategories: readonly SousCategorieListe[];
}

export interface EntreeCategorieRepo {
  readonly nom: string;
  readonly couleur: string | null;
  readonly icone: string | null;
  readonly masquee: boolean;
  readonly modeBudget: ModeBudget;
}

export interface EntreeSousCategorieRepo {
  readonly nom: string;
  readonly masquee: boolean;
  readonly reportActif: boolean;
  readonly reportMode: ModeReport;
}

export type Direction = "MONTER" | "DESCENDRE";

const SELECTION_SOUS_CATEGORIE = {
  id: true,
  categoryId: true,
  nom: true,
  ordre: true,
  masquee: true,
  systeme: true,
  reportActif: true,
  reportMode: true,
  _count: {
    select: {
      transactions: true,
      allocations: true,
      regles: true,
      mouvementsDe: true,
      mouvementsA: true,
      beneficiairesParDefaut: true,
      recurrences: true,
      evenements: true,
    },
  },
  cible: { select: { subcategoryId: true } },
  prevision: { select: { subcategoryId: true } },
} satisfies Prisma.SubcategorySelect;

const SELECTION_CATEGORIE = {
  id: true,
  nom: true,
  ordre: true,
  couleur: true,
  icone: true,
  masquee: true,
  modeBudget: true,
  _count: { select: { allocations: true } },
  sousCategories: {
    select: SELECTION_SOUS_CATEGORIE,
    orderBy: [{ ordre: "asc" }, { nom: "asc" }],
  },
} satisfies Prisma.CategorySelect;

interface LigneSousCategorie {
  id: string;
  categoryId: string;
  nom: string;
  ordre: number;
  masquee: boolean;
  systeme: boolean;
  reportActif: boolean;
  reportMode: ModeReport;
  _count: {
    transactions: number;
    allocations: number;
    regles: number;
    mouvementsDe: number;
    mouvementsA: number;
    beneficiairesParDefaut: number;
    recurrences: number;
    evenements: number;
  };
  cible: { subcategoryId: string } | null;
  prevision: { subcategoryId: string } | null;
}

interface LigneCategorie {
  id: string;
  nom: string;
  ordre: number;
  couleur: string | null;
  icone: string | null;
  masquee: boolean;
  modeBudget: ModeBudget;
  _count: { allocations: number };
  sousCategories: LigneSousCategorie[];
}

function versSousCategorieListe(ligne: LigneSousCategorie): SousCategorieListe {
  return {
    id: ligne.id,
    categoryId: ligne.categoryId,
    nom: ligne.nom,
    ordre: ligne.ordre,
    masquee: ligne.masquee,
    systeme: ligne.systeme,
    reportActif: ligne.reportActif,
    reportMode: ligne.reportMode,
    nbTransactions: ligne._count.transactions,
    nbAllocations: ligne._count.allocations,
    nbActionsRegles: ligne._count.regles,
    nbMouvements: ligne._count.mouvementsDe + ligne._count.mouvementsA,
    nbBeneficiaires: ligne._count.beneficiairesParDefaut,
    nbRecurrences: ligne._count.recurrences,
    nbEvenements: ligne._count.evenements,
    aCible: ligne.cible !== null,
    aPrevision: ligne.prevision !== null,
  };
}

function versCategorieListe(ligne: LigneCategorie): CategorieListe {
  return {
    id: ligne.id,
    nom: ligne.nom,
    ordre: ligne.ordre,
    couleur: ligne.couleur,
    icone: ligne.icone,
    masquee: ligne.masquee,
    modeBudget: ligne.modeBudget,
    nbAllocations: ligne._count.allocations,
    sousCategories: ligne.sousCategories.map(versSousCategorieListe),
  };
}

export async function listerCategories(ownerId: string): Promise<CategorieListe[]> {
  const lignes = await prisma.category.findMany({
    where: { ownerId },
    select: SELECTION_CATEGORIE,
    orderBy: [{ ordre: "asc" }, { nom: "asc" }],
  });
  return lignes.map(versCategorieListe);
}

export async function creerCategorie(ownerId: string, entree: EntreeCategorieRepo): Promise<CategorieListe> {
  const ligne = await prisma.$transaction(async (tx) => {
    const { _max } = await tx.category.aggregate({ where: { ownerId }, _max: { ordre: true } });
    return tx.category.create({
      data: { ownerId, ...entree, ordre: (_max.ordre ?? 0) + 1 },
      select: SELECTION_CATEGORIE,
    });
  });
  return versCategorieListe(ligne);
}

/** Retourne le nombre de lignes touchées : 0 = inexistante ou d'un autre propriétaire. */
export async function modifierCategorie(ownerId: string, id: string, entree: EntreeCategorieRepo): Promise<number> {
  const resultat = await prisma.category.updateMany({
    where: { id, ownerId },
    data: entree,
  });
  return resultat.count;
}

/** Refuse la suppression si la catégorie contient des sous-catégories système : la cascade les emporterait. */
export async function supprimerCategorie(
  ownerId: string,
  id: string,
): Promise<{ supprimees: number; sousCategoriesSysteme: string[] }> {
  return prisma.$transaction(async (tx) => {
    const sousCategoriesSysteme = await tx.subcategory.findMany({
      where: { categoryId: id, category: { ownerId }, systeme: true },
      select: { nom: true },
    });
    if (sousCategoriesSysteme.length > 0) {
      return { supprimees: 0, sousCategoriesSysteme: sousCategoriesSysteme.map((s) => s.nom) };
    }
    const { count: supprimees } = await tx.category.deleteMany({ where: { id, ownerId } });
    return { supprimees, sousCategoriesSysteme: [] };
  });
}

export async function deplacerCategorie(
  ownerId: string,
  id: string,
  direction: Direction,
): Promise<{ trouvee: boolean; deplacee: boolean }> {
  return prisma.$transaction(async (tx) => {
    const portee = await tx.category.findMany({
      where: { ownerId },
      select: { id: true, ordre: true, nom: true },
      orderBy: [{ ordre: "asc" }, { nom: "asc" }],
    });
    return deplacerDansPortee(portee, id, direction, async (elementId, ordre) => {
      await tx.category.update({ where: { id: elementId }, data: { ordre } });
    });
  });
}

/** null = catégorie parente inexistante ou d'un autre propriétaire. */
export async function creerSousCategorie(
  ownerId: string,
  categoryId: string,
  entree: EntreeSousCategorieRepo,
): Promise<SousCategorieListe | null> {
  return prisma.$transaction(async (tx) => {
    const categorie = await tx.category.findFirst({ where: { id: categoryId, ownerId }, select: { id: true } });
    if (categorie === null) {
      return null;
    }
    const { _max } = await tx.subcategory.aggregate({ where: { categoryId }, _max: { ordre: true } });
    const ligne = await tx.subcategory.create({
      data: { categoryId, ...entree, ordre: (_max.ordre ?? 0) + 1 },
      select: SELECTION_SOUS_CATEGORIE,
    });
    return versSousCategorieListe(ligne);
  });
}

export async function modifierSousCategorie(
  ownerId: string,
  id: string,
  entree: EntreeSousCategorieRepo,
): Promise<number> {
  const resultat = await prisma.subcategory.updateMany({
    where: { id, category: { ownerId } },
    data: entree,
  });
  return resultat.count;
}

export async function supprimerSousCategorie(
  ownerId: string,
  id: string,
): Promise<{ trouvee: boolean; systeme: boolean; supprimees: number }> {
  return prisma.$transaction(async (tx) => {
    const sousCategorie = await tx.subcategory.findFirst({
      where: { id, category: { ownerId } },
      select: { systeme: true },
    });
    if (sousCategorie === null) {
      return { trouvee: false, systeme: false, supprimees: 0 };
    }
    if (sousCategorie.systeme) {
      return { trouvee: true, systeme: true, supprimees: 0 };
    }
    const { count: supprimees } = await tx.subcategory.deleteMany({ where: { id, category: { ownerId } } });
    return { trouvee: true, systeme: false, supprimees };
  });
}

export async function deplacerSousCategorie(
  ownerId: string,
  id: string,
  direction: Direction,
): Promise<{ trouvee: boolean; deplacee: boolean }> {
  return prisma.$transaction(async (tx) => {
    const sousCategorie = await tx.subcategory.findFirst({
      where: { id, category: { ownerId } },
      select: { categoryId: true },
    });
    if (sousCategorie === null) {
      return { trouvee: false, deplacee: false };
    }
    const portee = await tx.subcategory.findMany({
      where: { categoryId: sousCategorie.categoryId, category: { ownerId } },
      select: { id: true, ordre: true, nom: true },
      orderBy: [{ ordre: "asc" }, { nom: "asc" }],
    });
    return deplacerDansPortee(portee, id, direction, async (elementId, ordre) => {
      await tx.subcategory.update({ where: { id: elementId }, data: { ordre } });
    });
  });
}

/**
 * Algorithme exact de la spec §5.2 : lit la portée triée, permute les deux
 * éléments dans le tableau, puis renumérote toute la fratrie dont l'ordre
 * diffère de sa nouvelle position. La renumérotation complète est volontaire :
 * le seed et les créations laissent des ordre égaux ou troués, et permuter
 * deux valeurs identiques ne déplacerait rien.
 */
async function deplacerDansPortee(
  portee: { id: string; ordre: number; nom: string }[],
  id: string,
  direction: Direction,
  ecrireOrdre: (id: string, ordre: number) => Promise<void>,
): Promise<{ trouvee: boolean; deplacee: boolean }> {
  const index = portee.findIndex((element) => element.id === id);
  if (index === -1) {
    return { trouvee: false, deplacee: false };
  }

  const cible = index + (direction === "MONTER" ? -1 : 1);
  if (cible < 0 || cible >= portee.length) {
    return { trouvee: true, deplacee: false };
  }

  const elementCourant = portee[index];
  const elementCible = portee[cible];
  if (elementCourant === undefined || elementCible === undefined) {
    return { trouvee: true, deplacee: false };
  }

  const permutee = [...portee];
  permutee[index] = elementCible;
  permutee[cible] = elementCourant;

  // Écritures séquentielles : une transaction interactive Prisma partage une
  // seule connexion, des écritures concurrentes sur le même client ne sont
  // pas garanties de s'exécuter dans l'ordre.
  for (const [position, element] of permutee.entries()) {
    if (element.ordre !== position) {
      await ecrireOrdre(element.id, position);
    }
  }

  return { trouvee: true, deplacee: true };
}
