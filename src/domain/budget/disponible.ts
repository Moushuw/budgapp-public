import type { Cents } from "@/domain/money";

/**
 * disponible(s, m) = report(s, m) + alloué(s, m) + activité(s, m)
 * — modele-budget-prevision.md §2.1. Le vrai solde de l'enveloppe : ce qui
 * reste réellement, une fois le report et l'activité du mois pris en compte.
 *
 * `activite` est déjà signée (négative pour une sortie) et exclut les
 * parents ventilés, les virements et tout ce qui porte `exclureDuBudget` —
 * cette exclusion se fait en amont, au moment de sommer les transactions.
 */
export function disponible(report: Cents, alloue: Cents, activite: Cents): Cents {
  return report + alloue + activite;
}
