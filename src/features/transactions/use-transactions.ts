"use client";

import { useInfiniteQuery, type InfiniteData, type UseInfiniteQueryResult } from "@tanstack/react-query";
import type { CurseurTransactions } from "@/domain/consultation";
import { deballer } from "@/lib/action-result";
import { queryKeys, type RequeteTransactions } from "@/lib/query-keys";
import { listerTransactions, type PageListeTransactions } from "@/server/actions/transactions";

/**
 * Pas de placeholderData : au changement de filtres, l'écran repasse en
 * chargement plutôt que de montrer l'ancienne liste sous de nouvelles pastilles.
 */
export function useTransactions(
  requete: RequeteTransactions,
): UseInfiniteQueryResult<InfiniteData<PageListeTransactions, CurseurTransactions | null>> {
  return useInfiniteQuery({
    queryKey: queryKeys.transactions.liste(requete),
    queryFn: async ({ pageParam }) => deballer(await listerTransactions({ ...requete, curseur: pageParam })),
    initialPageParam: null as CurseurTransactions | null,
    getNextPageParam: (page) => page.curseurSuivant,
  });
}
