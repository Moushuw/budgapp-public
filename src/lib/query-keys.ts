// Fabrique de clés TanStack Query — CLAUDE.md §8. Aucun tableau littéral
// écrit à la main dans un composant : toutes les clés viennent d'ici.

import type { FiltresTransactions, TriTransactions } from "@/domain/consultation";
import type { SelectionTransactions } from "@/domain/edition";
import type { Periode } from "@/domain/periode";
import type { PortionOccurrences } from "@/domain/recurrence";

export interface RequeteTransactions {
  readonly filtres: FiltresTransactions;
  readonly periode: Periode;
  readonly tri: TriTransactions;
}

export const queryKeys = {
  comptes: {
    all: ["comptes"] as const,
  },
  categories: {
    all: ["categories"] as const,
  },
  beneficiaires: {
    all: ["beneficiaires"] as const,
    candidatsFusion: (id: string) => ["beneficiaires", "fusion", id] as const,
  },
  etiquettes: {
    all: ["etiquettes"] as const,
  },
  regles: {
    all: ["regles"] as const,
    apercu: (ruleId: string, du: string | null, au: string | null) =>
      ["regles", "apercu", ruleId, du, au] as const,
  },
  filtres: {
    all: ["filtres"] as const,
  },
  transactions: {
    all: ["transactions"] as const,
    /** Préfixe de toutes les listes : mise à jour optimiste d'une ligne. */
    listes: ["transactions", "liste"] as const,
    liste: (requete: RequeteTransactions) => ["transactions", "liste", requete] as const,
    apercuSuppression: (selection: SelectionTransactions) => ["transactions", "apercu-suppression", selection] as const,
    detail: (id: string) => ["transactions", "detail", id] as const,
    candidatsVirement: (id: string) => ["transactions", "candidats-virement", id] as const,
    aRevoir: ["transactions", "a-revoir"] as const,
  },
  recurrences: {
    all: ["recurrences"] as const,
    ecran: ["recurrences", "ecran"] as const,
    occurrences: (ruleId: string, portion: PortionOccurrences) => ["recurrences", "occurrences", ruleId, portion] as const,
    candidatsTransaction: (occurrenceId: string) => ["recurrences", "candidats-transaction", occurrenceId] as const,
    candidatsOccurrence: (transactionId: string) => ["recurrences", "candidats-occurrence", transactionId] as const,
  },
  soldes: {
    all: ["soldes"] as const,
    fiche: (accountId: string) => ["soldes", "fiche", accountId] as const,
    diagnostic: (statementId: string) => ["soldes", "diagnostic", statementId] as const,
  },
  budgets: {
    all: ["budgets"] as const,
    mois: (mois: string) => ["budgets", mois] as const,
  },
  previsions: {
    all: ["previsions"] as const,
  },
} as const;
