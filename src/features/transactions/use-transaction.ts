"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { deballer } from "@/lib/action-result";
import { queryKeys } from "@/lib/query-keys";
import { lireTransaction, type DetailTransaction } from "@/server/actions/transactions";

export function useTransaction(id: string | null): UseQueryResult<DetailTransaction> {
  return useQuery({
    queryKey: queryKeys.transactions.detail(id ?? ""),
    queryFn: async () => {
      if (id === null) {
        throw new Error("Aucune transaction sélectionnée.");
      }
      return deballer(await lireTransaction({ id }));
    },
    enabled: id !== null,
  });
}
