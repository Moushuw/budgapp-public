"use client";

// Lecture seule, activée seulement à l'ouverture du dialogue de fusion —
// CLAUDE.md §8.

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { deballer } from "@/lib/action-result";
import { queryKeys } from "@/lib/query-keys";
import { candidatsFusion, type PropositionFusion } from "@/server/actions/payees";

export function useCandidatsFusion(id: string | null): UseQueryResult<PropositionFusion> {
  return useQuery({
    queryKey: queryKeys.beneficiaires.candidatsFusion(id ?? ""),
    queryFn: async () => deballer(await candidatsFusion({ id: id ?? "" })),
    enabled: id !== null,
  });
}
