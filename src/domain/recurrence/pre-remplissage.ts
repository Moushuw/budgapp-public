// Pré-remplissage du dialogue de confirmation d'une suggestion — docs/lot-m3.md §4.3.

import { dateCivile, dernierJourDuMois, ecartJours, moisDe, type DateCivile } from "../dates";
import { toleranceJoursPourCadence, uniteCadence } from "./cadence";
import { TOLERANCE_MONTANT_DEFAUT_CENTS } from "./constantes";
import { natureDepuisStabilite } from "./detection";
import { libelleSuggestion } from "./phrase";
import { ecartTypePopulation, jourModal } from "./statistiques";
import type { GroupeRecurrence, RegleProposee, SuggestionAConfirmer, TransactionDeGroupe } from "./types";

function comparer(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function sousCategorieLaPlusFrequente(triees: readonly TransactionDeGroupe[]): string | null {
  const effectifs = new Map<string, number>();
  for (const t of triees) {
    if (t.subcategoryId !== null) {
      effectifs.set(t.subcategoryId, (effectifs.get(t.subcategoryId) ?? 0) + 1);
    }
  }
  const maximum = Math.max(0, ...effectifs.values());
  if (maximum === 0) return null;
  // À égalité : celle de la transaction la plus récente parmi les ex aequo.
  for (let i = triees.length - 1; i >= 0; i -= 1) {
    const id = triees[i]?.subcategoryId ?? null;
    if (id !== null && effectifs.get(id) === maximum) return id;
  }
  return null;
}

function dateAncrage(suggestion: SuggestionAConfirmer, dates: readonly DateCivile[], toleranceJours: number): DateCivile {
  const premiere = dates[0];
  if (premiere === undefined) {
    throw new Error("regleDepuisSuggestion : groupe sans transaction");
  }
  if (uniteCadence(suggestion.cadence) !== "MOIS") {
    return premiere;
  }
  const mois = moisDe(premiere);
  const dernierJour = Number(dernierJourDuMois(mois).slice(8, 10));
  const candidat = dateCivile(Number(mois.slice(0, 4)), Number(mois.slice(5, 7)), Math.min(jourModal(dates), dernierJour));
  return Math.abs(ecartJours(premiere, candidat)) <= toleranceJours ? candidat : premiere;
}

export function regleDepuisSuggestion(suggestion: SuggestionAConfirmer, groupe: GroupeRecurrence): RegleProposee {
  const triees = [...groupe.transactions].sort((a, b) => comparer(a.date, b.date) || comparer(a.id, b.id));
  const nature = natureDepuisStabilite(suggestion.stabilite);
  const toleranceJours = toleranceJoursPourCadence(suggestion.cadence);
  const toleranceCents =
    nature === "FIXE"
      ? TOLERANCE_MONTANT_DEFAUT_CENTS
      : Math.max(
          TOLERANCE_MONTANT_DEFAUT_CENTS,
          Math.round(2 * ecartTypePopulation(triees.map((t) => Math.abs(t.montantCents)))),
        );

  return {
    libelle: libelleSuggestion(suggestion.motif, triees),
    accountId: suggestion.accountId,
    nature,
    montantCents: suggestion.montantMedianCents,
    cadence: suggestion.cadence,
    dateAncrage: dateAncrage(
      suggestion,
      triees.map((t) => t.date),
      toleranceJours,
    ),
    subcategoryId: sousCategorieLaPlusFrequente(triees),
    motifRapprochement: suggestion.motif,
    toleranceCents,
    toleranceJours,
  };
}
