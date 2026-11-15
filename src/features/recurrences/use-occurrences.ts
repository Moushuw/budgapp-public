"use client";

import { useInfiniteQuery, type InfiniteData, type UseInfiniteQueryResult } from "@tanstack/react-query";
import type { CurseurOccurrences, PortionOccurrences } from "@/domain/recurrence";
import { deballer } from "@/lib/action-result";
import { queryKeys } from "@/lib/query-keys";
import { listerOccurrences, type PageOccurrences } from "@/server/actions/recurrences";

/** `ruleId` null : le panneau est fermé, rien ne se lit. */
export function useOccurrences(
  ruleId: string | null,
  portion: PortionOccurrences,
): UseInfiniteQueryResult<InfiniteData<PageOccurrences, CurseurOccurrences | null>> {
  return useInfiniteQuery({
    queryKey: queryKeys.recurrences.occurrences(ruleId ?? "", portion),
    queryFn: async ({ pageParam }) => {
      if (ruleId === null) {
        throw new Error("Aucune série.");
      }
      return deballer(await listerOccurrences({ ruleId, curseur: pageParam, portion }));
    },
    initialPageParam: null as CurseurOccurrences | null,
    getNextPageParam: (page) => page.curseurSuivant,
    enabled: ruleId !== null,
    staleTime: 0,
  });
}
