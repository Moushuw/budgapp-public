import { ecartJours } from "../dates";
import { peutLier } from "./liaison";
import type { CandidatVirement, CoteVirement } from "./types";

/**
 * Les éléments de `autres` pour lesquels peutLier(transaction, autre) === null, triés par |ecartJours| croissant,
 * puis par id croissant. Rend les objets reçus, sans copie ni mutation. [] si `transaction` est elle-même inéligible.
 */
export function candidatsVirement<T extends CandidatVirement>(transaction: CoteVirement, autres: readonly T[]): T[] {
  const retenus: { readonly candidat: T; readonly ecart: number }[] = [];
  for (const autre of autres) {
    if (peutLier(transaction, autre) === null) {
      retenus.push({ candidat: autre, ecart: Math.abs(ecartJours(transaction.date, autre.date)) });
    }
  }
  retenus.sort((x, y) => {
    if (x.ecart !== y.ecart) {
      return x.ecart - y.ecart;
    }
    if (x.candidat.id < y.candidat.id) {
      return -1;
    }
    return x.candidat.id > y.candidat.id ? 1 : 0;
  });
  return retenus.map((r) => r.candidat);
}
