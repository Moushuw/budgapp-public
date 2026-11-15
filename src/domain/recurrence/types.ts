// Types du domaine des récurrences — docs/lot-m3.md §4.

import type { Cadence, DateCivile } from "../dates";
import type { Cents } from "../money";
import type { EtatOccurrence, NatureRecurrence } from "../referentiel";
import type { CadenceDetectable } from "./constantes";

// ── Détection (docs/lot-m3.md §4.2)

/** Une ligne d'un groupe, telle que la requête de détection la rendra (json_agg). */
export interface TransactionDeGroupe {
  readonly id: string;
  readonly date: DateCivile;
  readonly montantCents: Cents;
  readonly subcategoryId: string | null;
  /** LEFT JOIN Payee : nécessaire au libellé de §4.3 (« le nom du bénéficiaire »). */
  readonly beneficiaire: { readonly id: string; readonly nom: string } | null;
}

/** Groupe (accountId, descriptionNormalisee, signe du montant), formé en SQL. */
export interface GroupeRecurrence {
  readonly accountId: string;
  readonly descriptionNormalisee: string;
  /** Ordre quelconque : le domaine trie lui-même par (date, id). */
  readonly transactions: readonly TransactionDeGroupe[];
}

/** Ce qu'il faut d'une règle active pour le point 7. */
export interface RegleCouvrante {
  readonly accountId: string;
  readonly motifRapprochement: string | null;
}

/** Ce qu'il faut d'une suggestion REFUSEE pour le point 7. */
export interface SuggestionRefusee {
  readonly accountId: string;
  readonly motif: string;
  readonly cadence: Cadence;
}

export interface SuggestionDetectee {
  readonly accountId: string;
  readonly motif: string; // = descriptionNormalisee du groupe
  readonly libelle: string;
  readonly cadence: CadenceDetectable;
  readonly nature: NatureRecurrence;
  readonly montantMedianCents: Cents;
  readonly regularite: number; // non arrondie
  readonly stabilite: number; // non arrondie
  readonly score: number; // arrondi à deux décimales
  readonly nbOccurrences: number;
  readonly transactionIds: readonly string[]; // ordre (date, id)
  readonly dates: readonly DateCivile[]; // même ordre
}

/** Entrée de phraseSuggestion. SuggestionDetectee la satisfait. */
export interface SuggestionAPhraser {
  readonly libelle: string;
  readonly montantMedianCents: Cents;
  readonly nature: NatureRecurrence;
  readonly cadence: Cadence;
  readonly nbOccurrences: number;
  readonly dates: readonly DateCivile[]; // non vide
}

/** Entrée de regleDepuisSuggestion. SuggestionDetectee et la ligne RecurrenceSuggestion la satisfont. */
export interface SuggestionAConfirmer {
  readonly accountId: string;
  readonly motif: string;
  readonly cadence: Cadence;
  readonly stabilite: number;
  readonly montantMedianCents: Cents;
}

/** Valeurs pré-remplies du dialogue de confirmation (§4.3). Montant en cents : la conversion en chaîne de saisie appartient au formulaire. */
export interface RegleProposee {
  readonly libelle: string;
  readonly accountId: string;
  readonly nature: NatureRecurrence;
  readonly montantCents: Cents;
  readonly cadence: Cadence;
  readonly dateAncrage: DateCivile;
  readonly subcategoryId: string | null;
  readonly motifRapprochement: string;
  readonly toleranceCents: Cents;
  readonly toleranceJours: number;
}

// ── Matérialisation (§4.4)

export interface RegleAMaterialiser {
  readonly cadence: Cadence;
  readonly dateAncrage: DateCivile;
  readonly dateFin: DateCivile | null;
  readonly montantCents: Cents;
}

export interface OccurrenceAMaterialiser {
  readonly echeance: DateCivile;
  readonly montantCents: Cents;
}

// ── États (§3.3)

export interface OccurrenceDatee {
  readonly echeance: DateCivile;
  readonly etat: EtatOccurrence;
}

export interface OccurrenceLiable {
  readonly etat: EtatOccurrence;
  readonly transactionId: string | null;
}

// ── Appariement rétroactif (§4.3 point 4)

export interface TransactionAApparier {
  readonly id: string;
  readonly date: DateCivile;
}

export interface PaireAppariee<T extends TransactionAApparier> {
  readonly echeance: DateCivile;
  readonly transaction: T;
}

export interface ResultatAppariement<T extends TransactionAApparier> {
  readonly paires: readonly PaireAppariee<T>[]; // triées par échéance croissante
  readonly transactionsSansEcheance: readonly T[]; // triées par (date, id)
  readonly echeancesSansTransaction: readonly DateCivile[]; // croissantes, passées ET futures
}

// ── Rapprochement (§4.5)

export interface LigneARapprocher {
  readonly date: DateCivile;
  readonly montantCents: Cents;
  readonly descriptionNormalisee: string;
}

/** Une occurrence OUVERTE (contrat de l'appelant) avec ce qu'il faut de sa règle. */
export interface OccurrenceCandidate {
  readonly id: string;
  readonly ruleId: string;
  readonly echeance: DateCivile;
  readonly montantCents: Cents;
  readonly libelle: string;
  readonly motifRapprochement: string | null;
  readonly toleranceCents: Cents;
  readonly toleranceJours: number;
  readonly subcategoryId: string | null;
}

export interface CriteresRapprochement {
  readonly description: boolean;
  readonly montant: boolean;
  readonly date: boolean;
}

export interface CandidatOccurrence<T extends OccurrenceCandidate> {
  readonly occurrence: T;
  readonly criteres: CriteresRapprochement;
  /** Ce qui cloche, dans l'ordre montant, date, description ; [] si les trois critères passent. */
  readonly cloche: readonly string[];
}

// Pas « EtatRapprochement » : ce nom désigne déjà le pointage dans referentiel.ts.
export type VerdictRapprochement = "AUTO" | "A_CONFIRMER" | "AUCUN";

export interface EvaluationRapprochement<T extends OccurrenceCandidate> {
  readonly verdict: VerdictRapprochement;
  /** Triés par |écart de jours| croissant, puis échéance croissante, puis id croissant. */
  readonly candidats: readonly CandidatOccurrence<T>[];
  /** Id de l'occurrence si verdict = AUTO, sinon null. */
  readonly occurrenceAutoId: string | null;
}
