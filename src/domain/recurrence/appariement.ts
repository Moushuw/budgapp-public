// Appariement rétroactif des transactions existantes aux échéances d'une règle
// — docs/lot-m3.md §4.3 point 4 : la plus proche d'abord, l'ordre des dates
// pour départager (la transaction la plus proche de l'échéance est celle qui
// l'a réalisée, §8).

import { ecartJours, type DateCivile } from "../dates";
import type { PaireAppariee, ResultatAppariement, TransactionAApparier } from "./types";

function comparer(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

export function apparierRetroactivement<T extends TransactionAApparier>(
  echeances: readonly DateCivile[],
  transactions: readonly T[],
  toleranceJours: number,
): ResultatAppariement<T> {
  const echeancesUniques = [...new Set(echeances)].sort(comparer);

  interface Candidate {
    readonly distance: number;
    readonly echeance: DateCivile;
    readonly transaction: T;
  }
  const candidates: Candidate[] = [];
  for (const transaction of transactions) {
    for (const echeance of echeancesUniques) {
      const distance = Math.abs(ecartJours(echeance, transaction.date));
      if (distance <= toleranceJours) {
        candidates.push({ distance, echeance, transaction });
      }
    }
  }
  candidates.sort(
    (a, b) =>
      a.distance - b.distance ||
      comparer(a.echeance, b.echeance) ||
      comparer(a.transaction.date, b.transaction.date) ||
      comparer(a.transaction.id, b.transaction.id),
  );

  const echeancesPrises = new Set<DateCivile>();
  const transactionsPrises = new Set<T>();
  const paires: PaireAppariee<T>[] = [];
  for (const { echeance, transaction } of candidates) {
    if (echeancesPrises.has(echeance) || transactionsPrises.has(transaction)) continue;
    echeancesPrises.add(echeance);
    transactionsPrises.add(transaction);
    paires.push({ echeance, transaction });
  }

  return {
    paires: paires.sort((a, b) => comparer(a.echeance, b.echeance)),
    transactionsSansEcheance: transactions
      .filter((t) => !transactionsPrises.has(t))
      .sort((a, b) => comparer(a.date, b.date) || comparer(a.id, b.id)),
    echeancesSansTransaction: echeancesUniques.filter((e) => !echeancesPrises.has(e)),
  };
}
