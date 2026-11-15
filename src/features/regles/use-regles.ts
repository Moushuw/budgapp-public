"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { deballer } from "@/lib/action-result";
import { queryKeys } from "@/lib/query-keys";
import { listerRegles, type RegleListe } from "@/server/actions/rules";

export function useRegles(): UseQueryResult<RegleListe[]> {
  return useQuery({
    queryKey: queryKeys.regles.all,
    queryFn: async () => deballer(await listerRegles({})),
  });
}
