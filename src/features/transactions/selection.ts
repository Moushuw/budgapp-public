// État de la sélection de l'écran — docs/lot-m2.md §6.4. Pur, sans React.
// Trois modes : aucune ; des lignes cochées une à une ; « tout le résultat »,
// que le serveur résout par le même WHERE que la liste.

import type { SelectionTransactions } from "@/domain/edition";
import type { RequeteTransactions } from "@/lib/query-keys";

export type EtatSelection =
  | { readonly mode: "AUCUNE" }
  | { readonly mode: "IDS"; readonly ids: ReadonlySet<string> }
  | { readonly mode: "FILTRE" };

export const SELECTION_VIDE: EtatSelection = { mode: "AUCUNE" };

export function basculerLigne(e: EtatSelection, id: string): EtatSelection {
  if (e.mode === "FILTRE") {
    return e;
  }
  const ids = new Set(e.mode === "IDS" ? e.ids : []);
  if (ids.has(id)) {
    ids.delete(id);
  } else {
    ids.add(id);
  }
  return ids.size === 0 ? SELECTION_VIDE : { mode: "IDS", ids };
}

export function toutesAfficheesCochees(e: EtatSelection, idsAffiches: readonly string[]): boolean {
  if (e.mode === "FILTRE") {
    return true;
  }
  if (idsAffiches.length === 0 || e.mode === "AUCUNE") {
    return false;
  }
  return idsAffiches.every((id) => e.ids.has(id));
}

export function basculerAffichees(e: EtatSelection, idsAffiches: readonly string[]): EtatSelection {
  if (e.mode === "FILTRE" || toutesAfficheesCochees(e, idsAffiches)) {
    return SELECTION_VIDE;
  }
  const ids = new Set(e.mode === "IDS" ? e.ids : []);
  for (const id of idsAffiches) {
    ids.add(id);
  }
  return ids.size === 0 ? SELECTION_VIDE : { mode: "IDS", ids };
}

export function estCochee(e: EtatSelection, id: string): boolean {
  if (e.mode === "FILTRE") {
    return true;
  }
  return e.mode === "IDS" && e.ids.has(id);
}

export function nombreSelectionne(e: EtatSelection, total: number | null): number {
  switch (e.mode) {
    case "AUCUNE":
      return 0;
    case "IDS":
      return e.ids.size;
    case "FILTRE":
      return total ?? 0;
  }
}

export function versSelectionTransactions(e: EtatSelection, requete: RequeteTransactions): SelectionTransactions | null {
  switch (e.mode) {
    case "AUCUNE":
      return null;
    case "IDS":
      return { type: "IDS", ids: [...e.ids] };
    case "FILTRE":
      return { type: "FILTRE", filtres: requete.filtres, periode: requete.periode };
  }
}
