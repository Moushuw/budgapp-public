"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { deballer } from "@/lib/action-result";
import { queryKeys } from "@/lib/query-keys";
import { lireEcranRecurrences, type EcranRecurrences } from "@/server/actions/recurrences";

export function useRecurrences(): UseQueryResult<EcranRecurrences> {
  return useQuery({
    queryKey: queryKeys.recurrences.ecran,
    queryFn: async () => deballer(await lireEcranRecurrences({})),
  });
}
