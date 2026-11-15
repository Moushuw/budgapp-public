import type { Cents } from "@/domain/money";

/**
 * resteAAssigner(m) = resteAAssigner(m-1) + revenus(m) − Σ alloué(s, m)
 * — modele-budget-prevision.md §2.3. Le reliquat non réparti, global et non
 * borné à un compte. Indicatif : un négatif se signale, rien ne bloque.
 *
 * `allocations` est déjà la somme des `alloué(s, m)` de toutes les
 * enveloppes du mois — cette somme se fait en amont, à la lecture.
 */
export function resteAAssigner(precedent: Cents, revenus: Cents, allocations: Cents): Cents {
  return precedent + revenus - allocations;
}
