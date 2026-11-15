"use client";

// Une query, pas une mutation : lister les candidats ne modifie rien. Ils se relisent à chaque ouverture
// (staleTime 0) — docs/lot-m2.md §4.4. `id` null : le dialogue est fermé, rien ne se lit.

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { deballer } from "@/lib/action-result";
import { queryKeys } from "@/lib/query-keys";
import { listerCandidatsVirement, type CandidatVirement } from "@/server/actions/transactions";

export function useCandidatsVirement(id: string | null): UseQueryResult<readonly CandidatVirement[]> {
  return useQuery({
    queryKey: queryKeys.transactions.candidatsVirement(id ?? ""),
    queryFn: async () => {
      if (id === null) {
        throw new Error("Aucune transaction.");
      }
      return deballer(await listerCandidatsVirement({ id }));
    },
    enabled: id !== null,
    staleTime: 0,
  });
}
