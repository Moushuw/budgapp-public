// Modèles de lecture des soldes — types seuls, docs/lot-m3.md §5.

import type { DateCivile } from "../dates";
import type { Cents } from "../money";
import type { SourceSolde, TypeCompte } from "../referentiel";
import type { Explication, MotifRefusAjustement, StatutAncrage } from "./types";

export interface AjustementAffiche {
  readonly transactionId: string;
  readonly date: DateCivile;
  readonly montantCents: Cents;
}

export interface ReconciliationAffichee {
  readonly id: string;
  /** L'écart constaté quand la réconciliation est née (fait daté, §3.8). */
  readonly ecartConstateCents: Cents;
  readonly explication: string | null;
  readonly ajustement: AjustementAffiche | null;
}

export interface AncrageAffiche {
  readonly id: string; // BalanceStatement.id
  readonly accountId: string;
  readonly date: DateCivile;
  readonly source: SourceSolde;
  readonly soldeDeclareCents: Cents;
  readonly soldeCalculeCents: Cents;
  readonly ecartCourantCents: Cents;
  readonly statut: StatutAncrage;
  readonly refusAjustement: MotifRefusAjustement | null;
  readonly reconciliation: ReconciliationAffichee | null;
}

export interface FicheCompte {
  readonly compte: { readonly id: string; readonly nom: string; readonly type: TypeCompte; readonly archive: boolean };
  readonly aujourdhui: DateCivile;
  readonly soldeAujourdhuiCents: Cents;
  /** Plus récents d'abord (date desc, saisiLe desc, id asc), au plus LIMITE_ANCRAGES. */
  readonly ancrages: readonly AncrageAffiche[];
  /** Total sans borne : « N affichés sur M » au-delà de LIMITE_ANCRAGES. */
  readonly nbAncrages: number;
}

export interface DiagnosticAncrage {
  readonly ancrage: AncrageAffiche;
  readonly explications: readonly Explication[];
}
