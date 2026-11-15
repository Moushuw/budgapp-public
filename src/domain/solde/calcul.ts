// Solde calculé, écart, statut — docs/lot-m3.md §3.7 et §3.8.

import type { Cents } from "../money";
import { MONTANT_MAX_CENTS } from "../edition/limites";
import type { MotifRefusAjustement, StatutAncrage } from "./types";

/** §3.7 : soldeInitialCents + Σ montantCents (parentId null, date ≤ D) ; la somme vient d'un agrégat SQL. */
export function soldeCalcule(soldeInitialCents: Cents, sommeTransactionsCents: Cents): Cents {
  return soldeInitialCents + sommeTransactionsCents;
}

/** déclaré − calculé ; jamais −0. */
export function ecart(soldeDeclareCents: Cents, soldeCalculeCents: Cents): Cents {
  const e = soldeDeclareCents - soldeCalculeCents;
  return e === 0 ? 0 : e;
}

/** §3.8 : 0 → EQUILIBRE ; ≠ 0 et explication non vide après trim → EXPLIQUE ; sinon ECART_OUVERT. */
export function statutAncrage(ecartCourantCents: Cents, explication: string | null): StatutAncrage {
  if (ecartCourantCents === 0) return "EQUILIBRE";
  return explication !== null && explication.trim() !== "" ? "EXPLIQUE" : "ECART_OUVERT";
}

/** |écart| ≤ MONTANT_MAX_CENTS (D7). */
export function ecartRepresentable(ecartCents: Cents): boolean {
  return Math.abs(ecartCents) <= MONTANT_MAX_CENTS;
}

/** Ordre des refus : AJUSTEMENT_EXISTANT, puis ECART_NUL, puis ECART_HORS_LIMITE ; null = permis. */
export function refusAjustement(ecartCourantCents: Cents, aDejaUnAjustement: boolean): MotifRefusAjustement | null {
  if (aDejaUnAjustement) return "AJUSTEMENT_EXISTANT";
  if (ecartCourantCents === 0) return "ECART_NUL";
  if (!ecartRepresentable(ecartCourantCents)) return "ECART_HORS_LIMITE";
  return null;
}
