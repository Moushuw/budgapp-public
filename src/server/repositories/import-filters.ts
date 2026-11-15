// Repository des filtres d'import — spec M1 tranche 2 §5.3. Mêmes six règles
// que src/server/repositories/tags.ts.

import type { ModeCorrespondance } from "@/domain/referentiel";
import { prisma } from "@/server/db";

export interface FiltreImportListe {
  readonly id: string;
  readonly motif: string;
  readonly mode: ModeCorrespondance;
}

export interface EntreeFiltreImportRepo {
  readonly motif: string;
  readonly mode: ModeCorrespondance;
}

const SELECTION_LISTE = {
  id: true,
  motif: true,
  mode: true,
} as const;

export async function listerFiltresImport(ownerId: string): Promise<FiltreImportListe[]> {
  return prisma.importFilter.findMany({
    where: { ownerId },
    select: SELECTION_LISTE,
    orderBy: [{ motif: "asc" }, { mode: "asc" }],
  });
}

export async function creerFiltreImport(
  ownerId: string,
  entree: EntreeFiltreImportRepo,
): Promise<FiltreImportListe> {
  return prisma.importFilter.create({
    data: { ownerId, ...entree },
    select: SELECTION_LISTE,
  });
}

/** Retourne le nombre de lignes touchées : 0 = inexistant ou d'un autre propriétaire. */
export async function modifierFiltreImport(
  ownerId: string,
  id: string,
  entree: EntreeFiltreImportRepo,
): Promise<number> {
  const resultat = await prisma.importFilter.updateMany({
    where: { id, ownerId },
    data: entree,
  });
  return resultat.count;
}

export async function supprimerFiltreImport(ownerId: string, id: string): Promise<number> {
  const resultat = await prisma.importFilter.deleteMany({ where: { id, ownerId } });
  return resultat.count;
}
