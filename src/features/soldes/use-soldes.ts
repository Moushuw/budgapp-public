"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { deballer } from "@/lib/action-result";
import { queryKeys } from "@/lib/query-keys";
import { lireFicheCompte, type FicheCompte } from "@/server/actions/soldes";

export function useSoldes(accountId: string): UseQueryResult<FicheCompte> {
  return useQuery({
    queryKey: queryKeys.soldes.fiche(accountId),
    queryFn: async () => deballer(await lireFicheCompte({ accountId })),
  });
}
