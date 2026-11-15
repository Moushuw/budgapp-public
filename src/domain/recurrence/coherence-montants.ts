// Cohérence des montants d'une occurrence et de sa règle — docs/lot-m3.md §7, invariants 6 et 7.

import type { DateCivile } from "../dates";
import type { Cents } from "../money";
import type { EtatOccurrence } from "../referentiel";
import { estOccurrenceOuverte } from "./etats";

/** Signes strictement contraires ; le zéro n'a pas de signe. */
export function signesOpposes(a: Cents, b: Cents): boolean {
  return (a < 0 && b > 0) || (a > 0 && b < 0);
}

export interface OccurrenceAControler {
  readonly id: string;
  readonly echeance: DateCivile;
  readonly montantCents: Cents;
  readonly etat: EtatOccurrence;
  readonly transactionId: string | null;
  /** RecurringRule.montantCents ; null : la règle n'a pas de montant, rien n'est contrôlé. */
  readonly montantRegleCents: Cents | null;
}

export interface ControleMontantsAVenir {
  readonly aujourdhui: DateCivile;
  /** Occurrences dont le montant a été fixé à la main : exemptées du contrôle de montant, jamais du signe. */
  readonly montantsFixesALaMain: ReadonlySet<string>;
}

export type NatureEcartMontant = "SIGNE" | "MONTANT_A_VENIR";

export interface EcartMontantOccurrence {
  readonly nature: NatureEcartMontant;
  readonly occurrenceId: string;
  readonly message: string;
}

/**
 * Dans l'ordre des occurrences reçues ; pour une même occurrence, SIGNE avant MONTANT_A_VENIR.
 */
export function ecartsMontantsOccurrences(
  occurrences: readonly OccurrenceAControler[],
  controle: ControleMontantsAVenir | null,
): EcartMontantOccurrence[] {
  const ecarts: EcartMontantOccurrence[] = [];
  for (const o of occurrences) {
    const montantRegle = o.montantRegleCents;
    if (montantRegle === null) continue;
    if (signesOpposes(o.montantCents, montantRegle)) {
      ecarts.push({
        nature: "SIGNE",
        occurrenceId: o.id,
        message: `montant ${String(o.montantCents)} de signe contraire à la règle (${String(montantRegle)})`,
      });
    }
    if (
      controle !== null &&
      estOccurrenceOuverte(o) &&
      o.echeance >= controle.aujourdhui &&
      !controle.montantsFixesALaMain.has(o.id) &&
      o.montantCents !== montantRegle
    ) {
      ecarts.push({
        nature: "MONTANT_A_VENIR",
        occurrenceId: o.id,
        message: `échéance ouverte à venir ${o.echeance} à ${String(o.montantCents)}, règle à ${String(montantRegle)}`,
      });
    }
  }
  return ecarts;
}
