// Cadences détectables — docs/lot-m3.md §4.2 point 2.

import type { Cadence } from "../dates";
import { CADENCES_DETECTABLES, TOLERANCE_JOURS_DEFAUT, type CadenceDetectable } from "./constantes";

/** La première cadence de CADENCES_DETECTABLES telle que |m − cible| ≤ tolérance (bornes incluses), sinon null. */
export function cadenceDepuisMediane(m: number): CadenceDetectable | null {
  for (const definition of CADENCES_DETECTABLES) {
    if (Math.abs(m - definition.cibleJours) <= definition.toleranceJours) {
      return definition.cadence;
    }
  }
  return null;
}

/** Tolérance de la cadence au tableau ; TOLERANCE_JOURS_DEFAUT pour une cadence absente du tableau. */
export function toleranceJoursPourCadence(cadence: Cadence): number {
  const definition = CADENCES_DETECTABLES.find((d) => d.cadence === cadence);
  return definition === undefined ? TOLERANCE_JOURS_DEFAUT : definition.toleranceJours;
}

/** Cible en jours d'une cadence détectable. */
export function cibleJours(cadence: CadenceDetectable): number {
  const definition = CADENCES_DETECTABLES.find((d) => d.cadence === cadence);
  if (definition === undefined) {
    throw new Error(`cadence non détectable : ${cadence}`);
  }
  return definition.cibleJours;
}

export type UniteCadence = "SEMAINES" | "MOIS" | "AUCUNE";

/** SEMAINES : HEBDO, AUX_2_SEMAINES, AUX_4_SEMAINES. AUCUNE : PONCTUEL. MOIS : les huit autres. */
export function uniteCadence(cadence: Cadence): UniteCadence {
  switch (cadence) {
    case "HEBDO":
    case "AUX_2_SEMAINES":
    case "AUX_4_SEMAINES":
      return "SEMAINES";
    case "PONCTUEL":
      return "AUCUNE";
    default:
      return "MOIS";
  }
}
