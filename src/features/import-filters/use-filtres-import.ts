"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { deballer } from "@/lib/action-result";
import { queryKeys } from "@/lib/query-keys";
import { listerFiltresImport, type FiltreImportListe } from "@/server/actions/import-filters";

export function useFiltresImport(): UseQueryResult<FiltreImportListe[]> {
  return useQuery({
    queryKey: queryKeys.filtres.all,
    queryFn: async () => deballer(await listerFiltresImport({})),
  });
}
