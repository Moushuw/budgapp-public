// La période de la barre persistante — docs/lot-m2.md §5.5. Un type (mois,
// année, tout) et un mois de référence, conservé quand on change de type pour
// revenir au même endroit.

import { ajouterMois, dernierJourDuMois, moisDe, moisPrecedent, moisSuivant, premierJourDuMois, type DateCivile } from "./dates";

export type TypePeriode = "MOIS" | "ANNEE" | "TOUT";
export const TYPES_PERIODE: readonly TypePeriode[] = ["MOIS", "ANNEE", "TOUT"];

/** `mois` (AAAA-MM) est le mois de référence. */
export interface Periode {
  readonly type: TypePeriode;
  readonly mois: string;
}

const FORME_MOIS = /^\d{4}-(0[1-9]|1[0-2])$/;

export function estMois(valeur: string): boolean {
  return FORME_MOIS.test(valeur);
}

export function periodeParDefaut(aujourdhui: DateCivile): Periode {
  return { type: "MOIS", mois: moisDe(aujourdhui) };
}

export function bornesPeriode(periode: Periode): { readonly du: DateCivile | null; readonly au: DateCivile | null } {
  switch (periode.type) {
    case "MOIS":
      return { du: premierJourDuMois(periode.mois), au: dernierJourDuMois(periode.mois) };
    case "ANNEE": {
      const annee = periode.mois.slice(0, 4);
      return { du: `${annee}-01-01`, au: `${annee}-12-31` };
    }
    case "TOUT":
      return { du: null, au: null };
  }
}

export function deplacerPeriode(periode: Periode, pas: -1 | 1): Periode {
  switch (periode.type) {
    case "MOIS":
      return { type: "MOIS", mois: pas === 1 ? moisSuivant(periode.mois) : moisPrecedent(periode.mois) };
    case "ANNEE":
      return { type: "ANNEE", mois: moisDe(ajouterMois(premierJourDuMois(periode.mois), pas * 12)) };
    case "TOUT":
      return periode;
  }
}

export function changerTypePeriode(periode: Periode, type: TypePeriode): Periode {
  return { type, mois: periode.mois };
}

export function serialiserPeriode(periode: Periode): string {
  return `${periode.type}:${periode.mois}`;
}

/** Valeur absente ou illisible → période par défaut. */
export function lirePeriode(brut: string | undefined, aujourdhui: DateCivile): Periode {
  if (brut === undefined) {
    return periodeParDefaut(aujourdhui);
  }
  const morceaux = brut.split(":");
  const [type, mois] = morceaux;
  if (morceaux.length !== 2 || type === undefined || mois === undefined) {
    return periodeParDefaut(aujourdhui);
  }
  const typeConnu = TYPES_PERIODE.find((candidat) => candidat === type);
  if (typeConnu === undefined || !estMois(mois)) {
    return periodeParDefaut(aujourdhui);
  }
  return { type: typeConnu, mois };
}

export function libelleMois(mois: string, forme: "LONG" | "COURT"): string {
  const [annee, numero] = mois.split("-").map(Number);
  return new Intl.DateTimeFormat("fr-CA", {
    month: forme === "LONG" ? "long" : "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(annee ?? 0, (numero ?? 1) - 1, 1)));
}

export function libellePeriode(periode: Periode, forme: "LONG" | "COURT"): string {
  switch (periode.type) {
    case "MOIS":
      return libelleMois(periode.mois, forme);
    case "ANNEE":
      return periode.mois.slice(0, 4);
    case "TOUT":
      return forme === "LONG" ? "Toutes les dates" : "Tout";
  }
}
