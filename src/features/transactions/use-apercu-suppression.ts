"use client";

// Une query, pas une mutation : l'aperçu ne modifie rien. Il se recalcule à
// chaque ouverture (staleTime 0) — docs/lot-m2.md §6.4.

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import type { SelectionTransactions } from "@/domain/edition";
import { deballer } from "@/lib/action-result";
import { queryKeys } from "@/lib/query-keys";
import { apercevoirSuppressionEnMasse, type ApercusSuppression } from "@/server/actions/transactions";

export function useApercuSuppression(selection: SelectionTransactions | null): UseQueryResult<ApercusSuppression> {
  return useQuery({
    queryKey: queryKeys.transactions.apercuSuppression(selection ?? { type: "IDS", ids: [] }),
    queryFn: async () => {
      if (selection === null) {
        throw new Error("Aucune sélection.");
      }
      return deballer(await apercevoirSuppressionEnMasse({ selection }));
    },
    enabled: selection !== null,
    staleTime: 0,
  });
}
