"use client";

// Une query, pas une mutation : l'aperçu ne modifie rien, et il doit se
// rafraîchir si la portée change — docs/lot-m1.md §4.6.

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { deballer } from "@/lib/action-result";
import { queryKeys } from "@/lib/query-keys";
import { apercuApplicationRetroactive, type ApercuApplication } from "@/server/actions/rules";

export function useApercuApplication(
  ruleId: string | null,
  portee: { du: string | null; au: string | null },
): UseQueryResult<ApercuApplication> {
  return useQuery({
    queryKey: queryKeys.regles.apercu(ruleId ?? "", portee.du, portee.au),
    queryFn: async () => {
      if (ruleId === null) {
        throw new Error("Aucune règle sélectionnée.");
      }
      return deballer(await apercuApplicationRetroactive({ ruleId, du: portee.du, au: portee.au }));
    },
    enabled: ruleId !== null,
  });
}
