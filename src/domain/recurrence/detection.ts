// Détection des récurrences — docs/lot-m3.md §4.2. Pur : aucune horloge, la
// date de référence est un argument.

import { ecartJours, type DateCivile } from "../dates";
import { mediane } from "../money";
import type { NatureRecurrence } from "../referentiel";
import { cadenceDepuisMediane, cibleJours } from "./cadence";
import { FACTEUR_SERIE_VIVANTE, MIN_OCCURRENCES, SEUIL_REGULARITE, SEUIL_SCORE, SEUIL_STABILITE } from "./constantes";
import { libelleSuggestion } from "./phrase";
import { ecartTypePopulation, medianeExacte } from "./statistiques";
import type {
  GroupeRecurrence,
  RegleCouvrante,
  SuggestionDetectee,
  SuggestionRefusee,
  TransactionDeGroupe,
} from "./types";

export function natureDepuisStabilite(stabilite: number): NatureRecurrence {
  return stabilite < SEUIL_STABILITE ? "FIXE" : "VARIABLE";
}

/** 0.5 × min(1, (n − 1)/5) + 0.3 × (1 − régularité/SEUIL_REGULARITE) + 0.2 × (stabilité < SEUIL_STABILITE ? 1 : max(0, 1 − stabilité)), puis arrondi à deux décimales. */
export function calculerScore(nbOccurrences: number, regularite: number, stabilite: number): number {
  const brut =
    0.5 * Math.min(1, (nbOccurrences - 1) / 5) +
    0.3 * (1 - regularite / SEUIL_REGULARITE) +
    0.2 * (stabilite < SEUIL_STABILITE ? 1 : Math.max(0, 1 - stabilite));
  return Math.round(brut * 100) / 100;
}

function comparer(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function detecterGroupe(
  groupe: GroupeRecurrence,
  reglesActives: readonly RegleCouvrante[],
  refusees: readonly SuggestionRefusee[],
  dateReference: DateCivile,
): SuggestionDetectee | null {
  const transactions: TransactionDeGroupe[] = [...groupe.transactions].sort(
    (a, b) => comparer(a.date, b.date) || comparer(a.id, b.id),
  );
  const n = transactions.length;
  if (n < MIN_OCCURRENCES) return null;

  const intervalles: number[] = [];
  for (let k = 0; k < n - 1; k += 1) {
    const courante = transactions[k];
    const suivante = transactions[k + 1];
    if (courante === undefined || suivante === undefined) return null;
    intervalles.push(ecartJours(courante.date, suivante.date));
  }
  const m = medianeExacte(intervalles);

  const cadence = cadenceDepuisMediane(m);
  if (cadence === null) return null;

  const regularite = ecartTypePopulation(intervalles) / m;
  if (regularite >= SEUIL_REGULARITE) return null;

  const absolus = transactions.map((t) => Math.abs(t.montantCents));
  const medAbs = medianeExacte(absolus);
  if (medAbs === 0) return null;
  const stabilite = ecartTypePopulation(absolus) / medAbs;
  const nature = natureDepuisStabilite(stabilite);

  const derniere = transactions[n - 1];
  if (derniere === undefined) return null;
  if (ecartJours(derniere.date, dateReference) > FACTEUR_SERIE_VIVANTE * cibleJours(cadence)) return null;

  const score = calculerScore(n, regularite, stabilite);
  if (score < SEUIL_SCORE) return null;

  const motif = groupe.descriptionNormalisee;
  const couverte = reglesActives.some((r) => r.accountId === groupe.accountId && r.motifRapprochement === motif);
  const refusee = refusees.some((r) => r.accountId === groupe.accountId && r.motif === motif && r.cadence === cadence);
  if (couverte || refusee) return null;

  return {
    accountId: groupe.accountId,
    motif,
    libelle: libelleSuggestion(motif, transactions),
    cadence,
    nature,
    montantMedianCents: mediane(transactions.map((t) => t.montantCents)),
    regularite,
    stabilite,
    score,
    nbOccurrences: n,
    transactionIds: transactions.map((t) => t.id),
    dates: transactions.map((t) => t.date),
  };
}

export function detecterRecurrences(
  groupes: readonly GroupeRecurrence[],
  reglesActives: readonly RegleCouvrante[],
  refusees: readonly SuggestionRefusee[],
  dateReference: DateCivile,
): SuggestionDetectee[] {
  const suggestions: SuggestionDetectee[] = [];
  for (const groupe of groupes) {
    const suggestion = detecterGroupe(groupe, reglesActives, refusees, dateReference);
    if (suggestion !== null) suggestions.push(suggestion);
  }
  return suggestions.sort(
    (a, b) => b.score - a.score || comparer(a.accountId, b.accountId) || comparer(a.motif, b.motif),
  );
}
