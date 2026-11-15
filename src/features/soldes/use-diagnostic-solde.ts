"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { deballer } from "@/lib/action-result";
import { queryKeys } from "@/lib/query-keys";
import { lireDiagnosticAncrage, type DiagnosticAncrage } from "@/server/actions/soldes";

/** `statementId` null : le panneau est fermé, rien ne se lit. */
export function useDiagnosticSolde(statementId: string | null): UseQueryResult<DiagnosticAncrage> {
  return useQuery({
    queryKey: queryKeys.soldes.diagnostic(statementId ?? ""),
    queryFn: async () => {
      if (statementId === null) {
        throw new Error("Aucun solde.");
      }
      return deballer(await lireDiagnosticAncrage({ statementId }));
    },
    enabled: statementId !== null,
    staleTime: 0,
  });
}
