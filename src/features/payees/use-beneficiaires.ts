"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { deballer } from "@/lib/action-result";
import { queryKeys } from "@/lib/query-keys";
import { listerBeneficiaires, type BeneficiaireListe } from "@/server/actions/payees";

export function useBeneficiaires(): UseQueryResult<BeneficiaireListe[]> {
  return useQuery({
    queryKey: queryKeys.beneficiaires.all,
    queryFn: async () => deballer(await listerBeneficiaires({})),
  });
}
