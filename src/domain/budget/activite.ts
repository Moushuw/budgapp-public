export interface TransactionActivite {
  readonly subcategoryId: string | null;
  readonly estVentilee: boolean;
  readonly transferTransactionId: string | null;
  readonly exclureDuBudget: boolean;
  /** Pour une ligne fille : l'exclusion du budget de son parent. null sans parent. */
  readonly parent: { readonly exclureDuBudget: boolean } | null;
}

/**
 * docs/modele-budget-prevision.md §2.1 et docs/lot-m0-revision.md §3.1 : vrai si la transaction compte dans
 * activité(s, m) de l'enveloppe de sa sous-catégorie. Faux sans sous-catégorie, pour un côté de virement, un parent
 * ventilé, une transaction exclue du budget, ou une fille dont le parent est exclu du budget.
 */
export function entreDansActivite(t: TransactionActivite): boolean {
  if (t.subcategoryId === null) {
    return false;
  }
  if (t.transferTransactionId !== null || t.estVentilee || t.exclureDuBudget) {
    return false;
  }
  if (t.parent?.exclureDuBudget === true) {
    return false;
  }
  return true;
}
