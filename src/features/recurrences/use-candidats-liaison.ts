"use client";

// Des queries, pas des mutations : lister les candidats ne modifie rien. Ils se relisent à chaque
// ouverture (staleTime 0). Identifiant null : le dialogue est fermé, rien ne se lit.

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { deballer } from "@/lib/action-result";
import { queryKeys } from "@/lib/query-keys";
import {
  listerCandidatsOccurrence,
  listerCandidatsTransaction,
  type CandidatOccurrenceLiaison,
  type CandidatTransactionLiaison,
} from "@/server/actions/recurrences";

export function useCandidatsTransaction(occurrenceId: string | null): UseQueryResult<readonly CandidatTransactionLiaison[]> {
  return useQuery({
    queryKey: queryKeys.recurrences.candidatsTransaction(occurrenceId ?? ""),
    queryFn: async () => {
      if (occurrenceId === null) {
        throw new Error("Aucune échéance.");
      }
      return deballer(await listerCandidatsTransaction({ occurrenceId }));
    },
    enabled: occurrenceId !== null,
    staleTime: 0,
  });
}

export function useCandidatsOccurrence(transactionId: string | null): UseQueryResult<readonly CandidatOccurrenceLiaison[]> {
  return useQuery({
    queryKey: queryKeys.recurrences.candidatsOccurrence(transactionId ?? ""),
    queryFn: async () => {
      if (transactionId === null) {
        throw new Error("Aucune transaction.");
      }
      return deballer(await listerCandidatsOccurrence({ transactionId }));
    },
    enabled: transactionId !== null,
    staleTime: 0,
  });
}
