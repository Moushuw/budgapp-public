// Fonctions pures de l'éditeur de ventilation — docs/lot-m2.md §4.2. Sans React, testées à froid.

import type { DetailTransaction } from "@/domain/consultation";
import { type Cents, parseMontant } from "@/domain/money";
import { messageErreurVentilation, type ParentVentilation } from "@/domain/ventilation";
import { formatMontantChamp } from "@/lib/champs-formulaire";
import type { ValeursFormulaireVentilation } from "./schema";

export const LIGNE_VENTILATION_VIDE: ValeursFormulaireVentilation["lignes"][number] = {
  subcategoryId: null,
  montant: "",
  note: "",
  tagIds: [],
};

/** Le parent tel que le client le connaît ; le serveur revalide contre la ligne lue en base. */
export function parentVentilationDepuisDetail(d: DetailTransaction): ParentVentilation {
  return { montantCents: d.montantCents, estFille: d.parentId !== null, estVirement: d.contrepartie !== null };
}

/** Ventilée : une ligne par fille. Sinon deux lignes, la première portant la sous-catégorie courante. */
export function versValeursVentilation(d: DetailTransaction): ValeursFormulaireVentilation {
  if (d.estVentilee) {
    return {
      lignes: d.lignesVentilation.map((fille) => ({
        subcategoryId: fille.subcategoryId,
        montant: formatMontantChamp(fille.montantCents),
        note: fille.note ?? "",
        tagIds: fille.etiquettes.map((etiquette) => etiquette.id),
      })),
    };
  }
  return {
    lignes: [{ ...LIGNE_VENTILATION_VIDE, subcategoryId: d.subcategoryId }, { ...LIGNE_VENTILATION_VIDE }],
  };
}

/**
 * Le message global, calculé en direct : null si un montant non vide est illisible (son FormMessage dit pourquoi)
 * ou si la somme tombe juste ; sinon le reste à répartir. Un montant vide compte pour 0.
 */
export function messageResteARepartir(parentCents: Cents, montantsSaisis: readonly string[]): string | null {
  let somme = 0;
  for (const saisie of montantsSaisis) {
    if (saisie.trim() === "") {
      continue;
    }
    const valeur = parseMontant(saisie);
    if (valeur === null) {
      return null;
    }
    somme += valeur;
  }
  if (somme === parentCents) {
    return null;
  }
  return messageErreurVentilation({
    motif: "SOMME_INEXACTE",
    resteCents: parentCents - somme,
    sensParent: parentCents < 0 ? "SORTIE" : "ENTREE",
  });
}
