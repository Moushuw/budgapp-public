// Types du diagnostic de solde — docs/lot-m3.md §5 ; docs/modele-ingestion-recurrences.md §5.

import type { DateCivile } from "../dates";
import type { Cents } from "../money";
import type { SourceIngestion } from "../referentiel";

export type StatutAncrage = "EQUILIBRE" | "EXPLIQUE" | "ECART_OUVERT";
export type MotifRefusAjustement = "AJUSTEMENT_EXISTANT" | "ECART_NUL" | "ECART_HORS_LIMITE";

export type NatureExplication =
  | "PERIODE_NON_COUVERTE"
  | "EN_ATTENTE"
  | "DOUBLON"
  | "LIGNE_NON_RECONNUE"
  | "MONTANT_ERRONE";
/** L'ordre de docs/modele-ingestion-recurrences.md §5.2 — constant, que la piste soit présente ou non. */
export const ORDRE_EXPLICATIONS: readonly NatureExplication[] = [
  "PERIODE_NON_COUVERTE",
  "EN_ATTENTE",
  "DOUBLON",
  "LIGNE_NON_RECONNUE",
  "MONTANT_ERRONE",
];
export type ConstatExplication = "PISTE" | "RIEN" | "RAPPEL";

export interface TransactionDiagnostic {
  readonly id: string;
  readonly date: DateCivile;
  readonly montantCents: Cents;
  readonly description: string;
  readonly source: SourceIngestion;
}
export interface PaireQuasiDoublon {
  readonly a: TransactionDiagnostic;
  readonly b: TransactionDiagnostic;
}

export interface ContexteDiagnostic {
  readonly dateAncrage: DateCivile;
  readonly ecartCourantCents: Cents;
  readonly dateAncragePrecedent: DateCivile | null;
  /** Transaction la plus récente du compte, parentId null, hors AJUSTEMENT, toutes dates (D5). */
  readonly dateDerniereTransaction: DateCivile | null;
  /** Plus grand couvreAu des lots d'import du compte. */
  readonly finCouvertureImports: DateCivile | null;
  /** EN_ATTENTE, parentId null, date ≤ dateAncrage. */
  readonly enAttente: { readonly nombre: number; readonly sommeCents: Cents };
  readonly quasiDoublons: readonly PaireQuasiDoublon[];
  readonly quasiDoublonsTronques: boolean;
  /** Période (D5), parentId null, source MANUELLE ou |montant| = |écart courant| (écart ≠ 0). */
  readonly transactionsAVerifier: readonly TransactionDiagnostic[];
  readonly transactionsAVerifierTronquees: boolean;
}

export type MotifMontantErrone = "MANUELLE" | "MONTANT_EGAL_ECART" | "LES_DEUX";
export interface LigneMontantErrone {
  readonly transaction: TransactionDiagnostic;
  readonly motif: MotifMontantErrone;
  readonly message: string;
}

export type Explication =
  | { readonly nature: "PERIODE_NON_COUVERTE"; readonly constat: "PISTE" | "RIEN"; readonly message: string }
  | {
      readonly nature: "EN_ATTENTE";
      readonly constat: "PISTE" | "RIEN";
      readonly message: string;
      readonly nombre: number;
      readonly sommeCents: Cents;
    }
  | {
      readonly nature: "DOUBLON";
      readonly constat: "PISTE" | "RIEN";
      readonly message: string;
      readonly paires: readonly PaireQuasiDoublon[];
      readonly tronquee: boolean;
    }
  | { readonly nature: "LIGNE_NON_RECONNUE"; readonly constat: "RAPPEL"; readonly message: string }
  | {
      readonly nature: "MONTANT_ERRONE";
      readonly constat: "PISTE" | "RIEN";
      readonly message: string;
      readonly lignes: readonly LigneMontantErrone[];
      readonly tronquee: boolean;
    };
