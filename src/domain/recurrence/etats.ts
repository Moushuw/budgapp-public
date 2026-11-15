// États des occurrences — docs/lot-m3.md §3.3.

import { ajouterJours, type DateCivile } from "../dates";
import type { Cents } from "../money";
import type { EtatOccurrence } from "../referentiel";
import type { OccurrenceDatee, OccurrenceLiable } from "./types";

/**
 * Une PREVUE dont l'échéance + la tolérance est passée s'affiche MANQUEE. Une
 * MANQUEE stockée reste MANQUEE : on ne contredit pas un constat stocké.
 */
export function etatAffiche(occurrence: OccurrenceDatee, toleranceJours: number, aujourdhui: DateCivile): EtatOccurrence {
  if (occurrence.etat === "PREVUE" && ajouterJours(occurrence.echeance, toleranceJours) < aujourdhui) {
    return "MANQUEE";
  }
  return occurrence.etat;
}

export function etatApresLiaison(
  montantTransactionCents: Cents,
  occurrence: { readonly montantCents: Cents },
  toleranceCents: Cents,
): "REALISEE" | "REALISEE_MONTANT_DIFFERENT" {
  return Math.abs(montantTransactionCents - occurrence.montantCents) <= toleranceCents
    ? "REALISEE"
    : "REALISEE_MONTANT_DIFFERENT";
}

/** Ouverte : état PREVUE ou MANQUEE (stocké ou dérivé) et transactionId nul. */
export function estOccurrenceOuverte(occurrence: OccurrenceLiable): boolean {
  return (occurrence.etat === "PREVUE" || occurrence.etat === "MANQUEE") && occurrence.transactionId === null;
}
