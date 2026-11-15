import type { Cents } from "../money";

/** Description de la contrepartie créée (docs/lot-m2.md §4.4). Un montant nul n'est jamais lié : le dernier cas est défensif. */
export function descriptionContrepartie(montantCents: Cents, nomAutreCompte: string): string {
  if (montantCents > 0) {
    return `Virement depuis ${nomAutreCompte}`;
  }
  if (montantCents < 0) {
    return `Virement vers ${nomAutreCompte}`;
  }
  return `Virement avec ${nomAutreCompte}`;
}
