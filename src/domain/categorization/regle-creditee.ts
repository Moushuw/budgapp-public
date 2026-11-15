import type { Cents } from "../money";
import { lirePartsVentilation, type PartVentilation, repartirParPourMille } from "../ventilation";
import type { ActionRegle } from "./types";

/** Ce qu'une règle pose sur le créneau SOUS_CATEGORIE — docs/lot-m2.md §4.3. */
export type PoseSousCategorie =
  | { readonly type: "CATEGORISER"; readonly subcategoryId: string }
  | { readonly type: "VENTILER"; readonly parts: readonly PartVentilation[] };

/** Ce que la ligne enregistrée porte sur ce créneau. */
export interface CreneauRecu {
  readonly subcategoryId: string | null;
  /** Montant du parent tel que reçu. */
  readonly montantCents: Cents;
  readonly ventilation: readonly { readonly subcategoryId: string | null; readonly montantCents: Cents }[] | null;
}

/**
 * Même lecture que resolution.ts : actions triées par `ordre` croissant (tri
 * stable, sans muter l'argument), la première CATEGORISER dont subcategoryId
 * n'est ni null ni blanc (trim) ou VENTILER lisible ; sinon null.
 */
export function poseSousCategorie(
  actions: readonly Pick<ActionRegle, "type" | "subcategoryId" | "valeur" | "ordre">[],
): PoseSousCategorie | null {
  const triees = [...actions].sort((a, b) => a.ordre - b.ordre);
  for (const action of triees) {
    if (action.type === "CATEGORISER" && action.subcategoryId !== null && action.subcategoryId.trim() !== "") {
      return { type: "CATEGORISER", subcategoryId: action.subcategoryId };
    }
    if (action.type === "VENTILER") {
      const parts = lirePartsVentilation(action.valeur);
      if (parts !== null) {
        return { type: "VENTILER", parts };
      }
    }
  }
  return null;
}

/**
 * true si la règle a pu poser exactement ce que la ligne porte ; false sinon (pose null comprise).
 * Pour VENTILER, les montants reçus doivent être ceux de repartirParPourMille sur le montant reçu.
 */
export function regleJustifieCreneau(pose: PoseSousCategorie | null, recu: CreneauRecu): boolean {
  if (pose === null) return false;
  if (pose.type === "CATEGORISER") {
    return recu.ventilation === null && recu.subcategoryId !== null && pose.subcategoryId === recu.subcategoryId;
  }
  const filles = recu.ventilation;
  if (filles === null || recu.subcategoryId !== null) {
    return false;
  }
  if (filles.length !== pose.parts.length) {
    return false;
  }
  const attendus = repartirParPourMille(
    recu.montantCents,
    pose.parts.map((p) => p.partMille),
  );
  return pose.parts.every((part, i) => {
    const fille = filles[i];
    return fille?.subcategoryId === part.subcategoryId && fille.montantCents === attendus[i];
  });
}
