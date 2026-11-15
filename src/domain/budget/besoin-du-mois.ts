import type { Cadence } from "@/domain/dates";
import { dernierJourDuMois, differenceMois, echeances, moisDe, premierJourDuMois } from "@/domain/dates";
import type { Cents } from "@/domain/money";
import type { Cible } from "./types";

// Cadences dont la période est plus courte qu'un mois : le diviseur de
// prorata est le nombre réel d'occurrences tombant dans le mois considéré
// (« une cible hebdomadaire compte quatre ou cinq lundis » — §2.4), pas une
// fraction fixe.
const CADENCES_INFRA_MENSUELLES: ReadonlySet<Cadence> = new Set([
  "HEBDO",
  "AUX_2_SEMAINES",
  "AUX_4_SEMAINES",
  "DEUX_FOIS_PAR_MOIS",
]);

// Cadences dont la période dure un ou plusieurs mois entiers : le diviseur
// est simplement le nombre de mois du cycle (12 pour ANNUEL, etc.).
const MOIS_PAR_CYCLE: Partial<Record<Cadence, number>> = {
  MENSUEL: 1,
  AUX_2_MOIS: 2,
  AUX_3_MOIS: 3,
  AUX_4_MOIS: 4,
  SEMESTRIEL: 6,
  ANNUEL: 12,
  AUX_2_ANS: 24,
};

function diviseurDeProrata(cible: Cible, mois: string): number {
  if (cible.cadence === "PONCTUEL") {
    if (!cible.dateCible) {
      return 1;
    }
    const restants = differenceMois(mois, moisDe(cible.dateCible)) + 1;
    return Math.max(1, restants);
  }

  if (CADENCES_INFRA_MENSUELLES.has(cible.cadence)) {
    const debutDuMois = premierJourDuMois(mois);
    const finDuMois = dernierJourDuMois(mois);
    return echeances(cible.cadence, cible.dateDebut, finDuMois).filter((occurrence) => occurrence >= debutDuMois)
      .length;
  }

  return MOIS_PAR_CYCLE[cible.cadence] ?? 1;
}

/**
 * besoinDuMois(s, m) — modele-budget-prevision.md §2.4.
 *
 *   = max(0, cible.montant − alloué(s, m))       si mode = ACCUMULER
 *   = max(0, cible.montant − disponible(s, m))   si mode = RECOMPLETER
 *
 * ramené au prorata des mois restants dans la période de la cadence (ou,
 * pour une cible PONCTUEL, des mois restants jusqu'à `dateCible`).
 *
 * Si aucune occurrence de la cadence ne tombe dans `mois` (ex. AUX_4_SEMAINES
 * qui saute parfois un mois), rien n'est dû ce mois-ci : le besoin est nul.
 */
export function besoinDuMois(cible: Cible, alloue: Cents, disponible: Cents, mois: string): Cents {
  const brut = Math.max(0, cible.montantCents - (cible.mode === "ACCUMULER" ? alloue : disponible));
  if (brut === 0) {
    return 0;
  }

  const diviseur = diviseurDeProrata(cible, mois);
  if (diviseur <= 0) {
    return 0;
  }

  return Math.ceil(brut / diviseur);
}
