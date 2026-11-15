// Matérialisation des occurrences attendues d'une règle — docs/lot-m3.md §4.4.

import { ajouterMois, echeances, type DateCivile } from "../dates";
import { HORIZON_OCCURRENCES_MOIS } from "./constantes";
import type { OccurrenceAMaterialiser, RegleAMaterialiser } from "./types";

export function horizonOccurrences(aujourdhui: DateCivile): DateCivile {
  return ajouterMois(aujourdhui, HORIZON_OCCURRENCES_MOIS);
}

/** occurrencesAMaterialiser(regle, jusqua) restreinte aux échéances ≥ `depuis` (inclus) ; depuis = null : toutes. */
export function occurrencesAPartirDe(
  regle: RegleAMaterialiser,
  depuis: DateCivile | null,
  jusqua: DateCivile,
): OccurrenceAMaterialiser[] {
  const toutes = occurrencesAMaterialiser(regle, jusqua);
  return depuis === null ? toutes : toutes.filter((o) => o.echeance >= depuis);
}

/** Échéances de la règle jusqu'à `jusqua` ; `dateFin` est inclusive. Déterministe, donc idempotente. */
export function occurrencesAMaterialiser(regle: RegleAMaterialiser, jusqua: DateCivile): OccurrenceAMaterialiser[] {
  const borne = regle.dateFin !== null && regle.dateFin < jusqua ? regle.dateFin : jusqua;
  return echeances(regle.cadence, regle.dateAncrage, borne).map((echeance) => ({
    echeance,
    montantCents: regle.montantCents,
  }));
}
