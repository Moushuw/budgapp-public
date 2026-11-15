import type { ConflitRegles, SlotAffectation } from "../categorization";

export interface EtatHeritage {
  readonly subcategoryId: string | null;
  readonly ventilationPresente: boolean;
  readonly virementAvec: string | null;
  readonly conflits: readonly ConflitRegles[];
  readonly slotsArbitres: readonly SlotAffectation[];
}

/** docs/lot-m3.md §3.6 : la récurrence ne pose sa sous-catégorie qu'en dernier recours. */
export function sousCategorieHeritable(etat: EtatHeritage): boolean {
  return (
    etat.subcategoryId === null &&
    !etat.ventilationPresente &&
    etat.virementAvec === null &&
    !etat.conflits.some((c) => c.slot === "SOUS_CATEGORIE") &&
    !etat.slotsArbitres.includes("SOUS_CATEGORIE")
  );
}
