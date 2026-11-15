// La période que la barre affiche. Le cookie reste la source de la période (journal d'INDEX.md, 2026-10-04) ;
// l'URL « Toutes les dates » de /transactions ne change que la portée de la liste, et la barre doit le dire.

import type { Periode } from "@/domain/periode";
import { lireEtatUrl, type ParametresRecherche } from "@/features/transactions/filtres-url";

/** URLSearchParams et ReadonlyURLSearchParams y satisfont. */
export interface EntreeParametres {
  keys(): Iterable<string>;
  getAll(cle: string): string[];
}

export interface PeriodeAffichee {
  readonly periode: Periode;
  readonly surchargeUrl: boolean;
}

const CHEMIN_TRANSACTIONS = "/transactions";

function versParametresRecherche(parametres: EntreeParametres): ParametresRecherche {
  const resultat: Record<string, string[]> = {};
  for (const cle of new Set(parametres.keys())) {
    resultat[cle] = parametres.getAll(cle);
  }
  return resultat;
}

export function periodeAffichee(periodeBarre: Periode, pathname: string, parametres: EntreeParametres): PeriodeAffichee {
  if (pathname !== CHEMIN_TRANSACTIONS || periodeBarre.type === "TOUT") {
    return { periode: periodeBarre, surchargeUrl: false };
  }
  if (!lireEtatUrl(versParametresRecherche(parametres)).filtres.toutesDates) {
    return { periode: periodeBarre, surchargeUrl: false };
  }
  return { periode: { type: "TOUT", mois: periodeBarre.mois }, surchargeUrl: true };
}

/** L'adresse courante sans `toutesDates` ; les autres paramètres restent. */
export function hrefSansToutesDates(pathname: string, parametres: EntreeParametres): string {
  const restants = new URLSearchParams();
  for (const cle of new Set(parametres.keys())) {
    if (cle === "toutesDates") {
      continue;
    }
    for (const valeur of parametres.getAll(cle)) {
      restants.append(cle, valeur);
    }
  }
  const requete = restants.toString();
  return requete === "" ? pathname : `${pathname}?${requete}`;
}
