// Modèles de lecture et d'écriture des récurrences — docs/lot-m3.md §4.3, §4.6, §4.7. Types seuls.

import type { Cadence, DateCivile } from "../dates";
import type { Cents } from "../money";
import type { EtatOccurrence, NatureRecurrence, TypeLiaison } from "../referentiel";
import type { PORTIONS_OCCURRENCES } from "./constantes";
import type { RegleProposee } from "./types";

/** Ce que le formulaire envoie, converti (montants en cents). */
export interface ChampsRecurrence {
  readonly libelle: string;
  readonly nature: NatureRecurrence;
  readonly montantCents: Cents;
  readonly cadence: Cadence;
  readonly dateAncrage: DateCivile;
  readonly subcategoryId: string | null;
  readonly motifRapprochement: string; // déjà normalisé, non vide
  readonly toleranceCents: Cents; // ≥ 0
  readonly toleranceJours: number; // 0 … TOLERANCE_JOURS_MAX
}

export interface SuggestionAffichee {
  readonly id: string;
  readonly accountId: string;
  readonly compteNom: string | null; // null : compte introuvable
  readonly motif: string;
  readonly score: number;
  readonly nbOccurrences: number; // tel que détecté
  readonly nbTransactionsDisponibles: number; // transactionIds encore existants et du propriétaire
  /** phraseSuggestion ; null si nbTransactionsDisponibles = 0. */
  readonly phrase: string | null;
  /** regleDepuisSuggestion ; null si phrase = null ou compteNom = null (« Confirmer » désactivé). */
  readonly proposition: RegleProposee | null;
}

export interface PartVentilationRecurrente {
  readonly id: string;
  readonly libelle: string | null;
  readonly sousCategorieNom: string | null;
  readonly montantCents: Cents | null;
  readonly partMille: number | null;
}

export interface SerieAffichee {
  readonly id: string;
  readonly libelle: string;
  readonly accountId: string;
  readonly compteNom: string;
  readonly nature: NatureRecurrence;
  readonly montantCents: Cents | null; // la colonne est nullable au schéma
  readonly cadence: Cadence;
  readonly dateAncrage: DateCivile;
  readonly dateFin: DateCivile | null;
  readonly terminee: boolean; // !actif || dateFin !== null
  readonly subcategoryId: string | null;
  readonly sousCategorieNom: string | null;
  readonly categorieNom: string | null;
  readonly motifRapprochement: string | null;
  readonly toleranceCents: Cents;
  readonly toleranceJours: number;
  /** min(échéance) des occurrences ouvertes d'échéance ≥ aujourd'hui ; null s'il n'y en a pas ou pour une série terminée. */
  readonly prochaineEcheance: DateCivile | null;
  readonly nbLiees: number; // occurrences à transactionId non nul
  readonly ventilation: readonly PartVentilationRecurrente[];
}

export interface PaiementAttenduNonVu {
  readonly occurrenceId: string;
  readonly ruleId: string;
  readonly libelle: string;
  readonly compteNom: string;
  readonly echeance: DateCivile;
  readonly montantCents: Cents;
}

export interface EcranRecurrences {
  readonly aujourdhui: DateCivile;
  readonly suggestions: readonly SuggestionAffichee[]; // score décroissant, puis accountId, puis motif
  readonly nbSuggestions: number; // total des EN_ATTENTE du propriétaire, sans borne
  readonly series: readonly SerieAffichee[]; // libellé (localeCompare "fr-CA"), puis id
  readonly seriesTronquees: boolean; // LIMITE_SERIES atteinte
  readonly nonVus: readonly PaiementAttenduNonVu[]; // échéance décroissante, puis id ; au plus LIMITE_NON_VUS
  readonly nbNonVus: number; // total, sans borne
}

export interface CurseurOccurrences {
  readonly echeance: DateCivile;
  readonly id: string;
}

export interface OccurrenceAffichee {
  readonly id: string;
  readonly echeance: DateCivile;
  readonly montantCents: Cents;
  readonly etatStocke: EtatOccurrence;
  readonly etatAffiche: EtatOccurrence;
  readonly ouverte: boolean;
  readonly liaison: TypeLiaison | null;
  readonly lieeLe: DateCivile | null;
  readonly transaction: {
    readonly id: string;
    readonly date: DateCivile;
    readonly montantCents: Cents;
    readonly description: string;
  } | null;
}

export type PortionOccurrences = (typeof PORTIONS_OCCURRENCES)[number];

export interface PageOccurrences {
  readonly libelle: string;
  readonly portion: PortionOccurrences;
  /** A_VENIR : échéance croissante, puis id croissant ; PASSEES : échéance décroissante, puis id décroissant. */
  readonly occurrences: readonly OccurrenceAffichee[];
  readonly curseurSuivant: CurseurOccurrences | null;
  /** Nombre d'occurrences de la portion, pas de la série. */
  readonly total: number;
}

export interface CandidatTransactionLiaison {
  readonly id: string;
  readonly date: DateCivile;
  readonly montantCents: Cents;
  readonly description: string;
  readonly ecartJours: number; // |date − échéance|
}

export interface CandidatOccurrenceLiaison {
  readonly id: string; // id de l'occurrence
  readonly ruleId: string;
  readonly libelle: string;
  readonly echeance: DateCivile;
  readonly montantCents: Cents;
  readonly ecartJours: number; // |échéance − date de la transaction|
}

export interface TransactionNonLiee {
  readonly id: string;
  readonly date: DateCivile;
  readonly montantCents: Cents;
}

export interface CompteRenduLiaisonRetroactive {
  readonly ruleId: string;
  readonly libelle: string;
  readonly paiementsLies: number;
  readonly sansEcheance: readonly TransactionNonLiee[]; // (date, id) croissants
  /** transactionIds de la suggestion devenues indisponibles : supprimées, liées ailleurs, ou plus éligibles. */
  readonly indisponibles: number;
  /** Occurrences créées non liées dont etatAffiche(…, aujourdhui) = MANQUEE. */
  readonly echeancesPasseesSansPaiement: number;
}
