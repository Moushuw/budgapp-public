"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useOptimistic, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { PeriodBar } from "@/components/navigation/period-bar";
import { FILTRES_VIDES, TRI_PAR_DEFAUT } from "@/domain/consultation";
import type { Periode } from "@/domain/periode";
import { hrefTransactions } from "@/features/transactions/filtres-url";
import { libelleNombreARevoir } from "@/features/transactions/presentation";
import { useNombreARevoir } from "@/features/transactions/use-nombre-a-revoir";
import { choisirPeriode } from "@/server/actions/periode";
import { hrefSansToutesDates, periodeAffichee } from "./periode-affichee";

const HREF_A_REVOIR = hrefTransactions({ ...FILTRES_VIDES, aRevoir: true, toutesDates: true }, TRI_PAR_DEFAUT);

export function BarrePeriodeVivante(props: { readonly periodeInitiale: Periode }): ReactNode {
  const { periodeInitiale } = props;
  const [periode, poserOptimiste] = useOptimistic(periodeInitiale);
  const [enAttente, startTransition] = useTransition();
  const { data: nbARevoir } = useNombreARevoir();
  const router = useRouter();
  const pathname = usePathname();
  const parametres = useSearchParams();
  const { periode: affichee, surchargeUrl } = periodeAffichee(periode, pathname, parametres);

  function onChoisir(choisie: Periode): void {
    startTransition(async () => {
      poserOptimiste(choisie);
      const resultat = await choisirPeriode(choisie);
      if (!resultat.ok) {
        toast.error(resultat.message);
        return;
      }
      // L'URL « Toutes les dates » primait sur le cookie : sans la retirer, le clic ne changerait rien à l'écran.
      if (surchargeUrl) {
        router.replace(hrefSansToutesDates(pathname, parametres));
      }
    });
  }

  return (
    <PeriodBar
      periode={affichee}
      enAttente={enAttente}
      nbARevoir={nbARevoir ?? null}
      libelleARevoir={nbARevoir !== undefined && nbARevoir > 0 ? libelleNombreARevoir(nbARevoir) : null}
      hrefARevoir={HREF_A_REVOIR}
      onChoisir={onChoisir}
    />
  );
}
