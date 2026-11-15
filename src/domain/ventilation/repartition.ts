// Répartition d'un montant en pour mille — docs/lot-m2.md §4.2 (convention de RecurringSplit.partMille).

import type { Cents } from "../money";

/**
 * Montants des lignes d'une ventilation en pour mille. Chaque ligne sauf la dernière :
 * signe(montant) × ⌊|montant| × part / 1000⌋ ; la dernière : montant − somme des autres.
 * La somme est exacte, la dernière ne change jamais de signe, un zéro est rendu 0 (jamais −0).
 */
export function repartirParPourMille(montantCents: Cents, parts: readonly number[]): Cents[] {
  if (parts.length === 0) {
    return [];
  }
  const signe = montantCents < 0 ? -1 : 1;
  const absolu = Math.abs(montantCents);
  const resultat: Cents[] = [];
  let somme = 0;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const part = parts[i] ?? 0;
    const tronque = Math.floor((absolu * part) / 1000);
    const valeur = tronque === 0 ? 0 : signe * tronque;
    resultat.push(valeur);
    somme += valeur;
  }
  const derniere = montantCents - somme;
  resultat.push(derniere === 0 ? 0 : derniere);
  return resultat;
}
