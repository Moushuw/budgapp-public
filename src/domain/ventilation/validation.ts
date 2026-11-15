// Validation d'une ventilation — docs/lot-m2.md §4.2 et §3.6 (un seul niveau).

import { type Cents, formatMontant } from "../money";
import { LIMITE_LIGNES_VENTILATION } from "./limites";

export interface ParentVentilation {
  readonly montantCents: Cents;
  readonly estFille: boolean;
  readonly estVirement: boolean;
}

export interface MontantLigneVentilation {
  readonly montantCents: Cents;
}

export type ErreurVentilation =
  | { readonly motif: "PARENT_FILLE" }
  | { readonly motif: "PARENT_VIREMENT" }
  | { readonly motif: "PARENT_NUL" }
  | { readonly motif: "MOINS_DE_DEUX_LIGNES" }
  | { readonly motif: "TROP_DE_LIGNES" }
  | { readonly motif: "LIGNE_A_ZERO"; readonly rang: number }
  | { readonly motif: "SIGNE_OPPOSE"; readonly rang: number; readonly sensParent: "SORTIE" | "ENTREE" }
  | { readonly motif: "SOMME_INEXACTE"; readonly resteCents: Cents; readonly sensParent: "SORTIE" | "ENTREE" };

export type MotifErreurVentilation = ErreurVentilation["motif"];

/**
 * Liste vide = ventilation valide. Ordre déterministe : parent fille / virement (seuls),
 * parent nul (seul), nombre de lignes, puis ligne par ligne (zéro, signe), puis la somme.
 */
export function validerVentilation(
  parent: ParentVentilation,
  lignes: readonly MontantLigneVentilation[],
): readonly ErreurVentilation[] {
  const erreurs: ErreurVentilation[] = [];
  if (parent.estFille) {
    erreurs.push({ motif: "PARENT_FILLE" });
  }
  if (parent.estVirement) {
    erreurs.push({ motif: "PARENT_VIREMENT" });
  }
  if (erreurs.length > 0) {
    return erreurs;
  }
  if (parent.montantCents === 0) {
    return [{ motif: "PARENT_NUL" }];
  }
  if (lignes.length < 2) {
    erreurs.push({ motif: "MOINS_DE_DEUX_LIGNES" });
  }
  if (lignes.length > LIMITE_LIGNES_VENTILATION) {
    erreurs.push({ motif: "TROP_DE_LIGNES" });
  }
  const sensParent = parent.montantCents < 0 ? "SORTIE" : "ENTREE";
  let somme = 0;
  lignes.forEach((ligne, rang) => {
    somme += ligne.montantCents;
    if (ligne.montantCents === 0) {
      erreurs.push({ motif: "LIGNE_A_ZERO", rang });
    } else if (ligne.montantCents < 0 !== parent.montantCents < 0) {
      erreurs.push({ motif: "SIGNE_OPPOSE", rang, sensParent });
    }
  });
  if (somme !== parent.montantCents) {
    erreurs.push({ motif: "SOMME_INEXACTE", resteCents: parent.montantCents - somme, sensParent });
  }
  return erreurs;
}

export function messageErreurVentilation(erreur: ErreurVentilation): string {
  switch (erreur.motif) {
    case "PARENT_FILLE":
      return "Une ligne de ventilation ne se ventile pas : la ventilation n'a qu'un niveau.";
    case "PARENT_VIREMENT":
      return "Un côté de virement ne se ventile pas : un virement n'est ni une dépense ni un revenu. Pour le ventiler, délie d'abord le virement.";
    case "PARENT_NUL":
      return `Une transaction de ${formatMontant(0)} ne se ventile pas : il n'y a rien à répartir.`;
    case "MOINS_DE_DEUX_LIGNES":
      return "Une ventilation compte au moins deux lignes.";
    case "TROP_DE_LIGNES":
      return `Une ventilation compte au plus ${LIMITE_LIGNES_VENTILATION} lignes.`;
    case "LIGNE_A_ZERO":
      return `La ligne ${erreur.rang + 1} est à ${formatMontant(0)} : retire-la ou donne-lui un montant.`;
    case "SIGNE_OPPOSE":
      return erreur.sensParent === "SORTIE"
        ? `La ligne ${erreur.rang + 1} est une entrée alors que la transaction est une sortie : chaque ligne garde le signe de la transaction.`
        : `La ligne ${erreur.rang + 1} est une sortie alors que la transaction est une entrée : chaque ligne garde le signe de la transaction.`;
    case "SOMME_INEXACTE":
      // Le reste est « du signe du parent » quand il manque de l'argent à répartir ; sinon les lignes dépassent.
      return erreur.resteCents > 0 === (erreur.sensParent === "ENTREE")
        ? `Il reste ${formatMontant(Math.abs(erreur.resteCents))} à répartir.`
        : `Les lignes dépassent la transaction de ${formatMontant(Math.abs(erreur.resteCents))}.`;
  }
}
