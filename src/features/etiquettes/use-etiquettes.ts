"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { deballer } from "@/lib/action-result";
import { queryKeys } from "@/lib/query-keys";
import { listerEtiquettes, type EtiquetteListe } from "@/server/actions/tags";

export function useEtiquettes(): UseQueryResult<EtiquetteListe[]> {
  return useQuery({
    queryKey: queryKeys.etiquettes.all,
    queryFn: async () => deballer(await listerEtiquettes({})),
  });
}
