"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { deballer } from "@/lib/action-result";
import { queryKeys } from "@/lib/query-keys";
import { listerComptes, type CompteListeAvecSolde } from "@/server/actions/accounts";

export function useComptes(): UseQueryResult<CompteListeAvecSolde[]> {
  return useQuery({
    queryKey: queryKeys.comptes.all,
    queryFn: async () => deballer(await listerComptes({})),
  });
}
