"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { deballer } from "@/lib/action-result";
import { queryKeys } from "@/lib/query-keys";
import { compterTransactionsARevoir } from "@/server/actions/transactions";

export function useNombreARevoir(): UseQueryResult<number> {
  return useQuery({
    queryKey: queryKeys.transactions.aRevoir,
    queryFn: async () => deballer(await compterTransactionsARevoir({})),
  });
}
