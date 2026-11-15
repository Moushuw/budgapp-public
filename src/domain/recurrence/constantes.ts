// Constantes de la détection et du rapprochement des récurrences — docs/lot-m3.md §4.2 à §4.5.

import type { Cadence } from "../dates";
import type { PortionOccurrences } from "./lecture";

export const MIN_OCCURRENCES = 3;
export const SEUIL_REGULARITE = 0.15; // écarté si régularité ≥ seuil
export const SEUIL_STABILITE = 0.05; // FIXE si stabilité < seuil
export const SEUIL_SCORE = 0.5; // proposé si score arrondi ≥ seuil
export const FACTEUR_SERIE_VIVANTE = 2; // vivante si (dateReference − dernière date) ≤ 2 × cible
export const FENETRE_DETECTION_MOIS = 24; // utilisée par la requête de détection
export const MARGE_CANDIDAT_JOURS = 7;
export const HORIZON_OCCURRENCES_MOIS = 12;
export const FENETRE_LIAISON_MANUELLE_JOURS = 15;
export const TOLERANCE_MONTANT_DEFAUT_CENTS = 500;
export const TOLERANCE_JOURS_DEFAUT = 3; // cadence non détectable

export const LIMITE_GROUPES_DETECTION = 500; // groupes rendus par la requête, les plus nombreux d'abord
export const LIMITE_LIGNES_PAR_GROUPE = 120; // lignes les plus récentes d'un groupe (hebdo sur 24 mois = 105)
export const LIMITE_REGLES_COUVRANTES = 1000;
export const LIMITE_SUGGESTIONS_REFUSEES = 1000;
export const LIMITE_SUGGESTIONS = 50; // cartes affichées
export const LIMITE_SERIES = 200;
export const LIMITE_NON_VUS = 50;
export const TAILLE_PAGE_OCCURRENCES = 25;
/** Panneau des échéances : un an d'échéances futures repoussait l'historique des paiements liés (docs/lot-m3.md §4.7). */
export const TAILLE_PAGE_ECHEANCES_A_VENIR = 3;
export const PORTIONS_OCCURRENCES = ["A_VENIR", "PASSEES"] as const;

/** A_VENIR → TAILLE_PAGE_ECHEANCES_A_VENIR ; PASSEES → TAILLE_PAGE_OCCURRENCES. */
export function taillePageOccurrences(portion: PortionOccurrences): number {
  return portion === "A_VENIR" ? TAILLE_PAGE_ECHEANCES_A_VENIR : TAILLE_PAGE_OCCURRENCES;
}
export const LIMITE_CANDIDATS_LIAISON = 50;
/** Occurrences ouvertes lues pour le rapprochement d'un import (docs/lot-m3.md §4.5). */
export const LIMITE_OCCURRENCES_RAPPROCHEMENT = 500;
export const TOLERANCE_JOURS_MAX = 31;
/** Une date d'ancrage plus ancienne matérialiserait des milliers d'échéances d'un coup (hebdomadaire : ~520 par dix ans). */
export const ANCIENNETE_ANCRAGE_MAX_ANS = 10;

/** Les 12 cadences, dans l'ordre d'affichage du formulaire. */
export const CADENCES_RECURRENCE = [
  "HEBDO",
  "AUX_2_SEMAINES",
  "AUX_4_SEMAINES",
  "DEUX_FOIS_PAR_MOIS",
  "MENSUEL",
  "AUX_2_MOIS",
  "AUX_3_MOIS",
  "AUX_4_MOIS",
  "SEMESTRIEL",
  "ANNUEL",
  "AUX_2_ANS",
  "PONCTUEL",
] as const satisfies readonly Cadence[];

export interface DefinitionCadenceDetectable {
  readonly cadence: Cadence;
  readonly cibleJours: number;
  readonly toleranceJours: number;
}

/** docs/lot-m3.md §4.2 point 2, dans cet ordre. */
export const CADENCES_DETECTABLES = [
  { cadence: "HEBDO", cibleJours: 7, toleranceJours: 2 },
  { cadence: "AUX_2_SEMAINES", cibleJours: 14, toleranceJours: 2 },
  { cadence: "MENSUEL", cibleJours: 30.44, toleranceJours: 3 },
  { cadence: "AUX_2_MOIS", cibleJours: 61, toleranceJours: 5 },
  { cadence: "AUX_3_MOIS", cibleJours: 91, toleranceJours: 5 },
  { cadence: "SEMESTRIEL", cibleJours: 182, toleranceJours: 5 },
  { cadence: "ANNUEL", cibleJours: 365, toleranceJours: 5 },
] as const satisfies readonly DefinitionCadenceDetectable[];

export type CadenceDetectable = (typeof CADENCES_DETECTABLES)[number]["cadence"];
