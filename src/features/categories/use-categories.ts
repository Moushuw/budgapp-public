"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { deballer } from "@/lib/action-result";
import { queryKeys } from "@/lib/query-keys";
import { listerCategories, type CategorieListe } from "@/server/actions/categories";

export function useCategories(): UseQueryResult<CategorieListe[]> {
  return useQuery({
    queryKey: queryKeys.categories.all,
    queryFn: async () => deballer(await listerCategories({})),
  });
}
