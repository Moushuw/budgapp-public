// Libellés français des récurrences. Les noms de mois et de jours viennent de
// tables fixes, pas d'Intl : le résultat ne dépend pas d'ICU.

import type { Cadence, DateCivile } from "../dates";
import { formatMontant, type Cents } from "../money";
import type { TypeLiaison } from "../referentiel";

const MOIS = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
] as const;

const JOURS_SEMAINE = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"] as const;

const LIBELLES_CADENCE: Record<Cadence, string> = {
  HEBDO: "toutes les semaines",
  AUX_2_SEMAINES: "toutes les deux semaines",
  AUX_4_SEMAINES: "toutes les quatre semaines",
  DEUX_FOIS_PAR_MOIS: "deux fois par mois",
  MENSUEL: "tous les mois",
  AUX_2_MOIS: "tous les deux mois",
  AUX_3_MOIS: "tous les trois mois",
  AUX_4_MOIS: "tous les quatre mois",
  SEMESTRIEL: "tous les six mois",
  ANNUEL: "tous les ans",
  AUX_2_ANS: "tous les deux ans",
  PONCTUEL: "une seule fois",
};

export function libelleCadence(cadence: Cadence): string {
  return LIBELLES_CADENCE[cadence];
}

/** Jour du mois écrit à la française : 1 → « 1er ». */
export function jourDuMois(jour: number): string {
  return jour === 1 ? "1er" : String(jour);
}

/** Nom du jour ISO (1 = lundi … 7 = dimanche). */
export function nomJourSemaine(jourIso: number): string {
  const nom = JOURS_SEMAINE[jourIso - 1];
  if (nom === undefined) {
    throw new Error(`jour de semaine invalide : ${jourIso}`);
  }
  return nom;
}

function nomMois(d: DateCivile): string {
  const nom = MOIS[Number(d.slice(5, 7)) - 1];
  if (nom === undefined) {
    throw new Error(`date civile invalide : ${d}`);
  }
  return nom;
}

/** « 12 octobre », « 1er novembre » (1 → « 1er »). */
export function jourEtMois(d: DateCivile): string {
  return `${jourDuMois(Number(d.slice(8, 10)))} ${nomMois(d)}`;
}

/** « Paiement de Netflix.com, échéance du 12 octobre », « … échéance du 1er novembre » (docs/lot-m3.md §4.5). */
export function libellePaiementAttendu(libelle: string, echeance: DateCivile): string {
  return `Paiement de ${libelle}, échéance du ${jourEtMois(echeance)}`;
}

/** « Paiement de Netflix.com, échéance du 12 octobre — 17,99 $ » : montant en valeur absolue, sans « attendu ». */
export function libelleCandidatAttendu(libelle: string, echeance: DateCivile, montantCents: Cents): string {
  return `${libellePaiementAttendu(libelle, echeance)} — ${formatMontant(Math.abs(montantCents))}`;
}

const PROVENANCE_LIAISON: Record<TypeLiaison, string> = {
  AUTO: "lié automatiquement à l'import",
  MANUELLE: "lié à la main",
  RETROACTIVE: "lié à la confirmation",
};

/** « Paiement de Netflix.com, échéance du 12 août — lié à la main le 14 octobre ». */
export function phraseLiaison(r: {
  readonly libelle: string;
  readonly echeance: DateCivile;
  readonly liaison: TypeLiaison;
  readonly lieeLe: DateCivile | null;
}): string {
  const quand = r.lieeLe === null ? "" : ` le ${jourEtMois(r.lieeLe)}`;
  return `${libellePaiementAttendu(r.libelle, r.echeance)} — ${PROVENANCE_LIAISON[r.liaison]}${quand}`;
}

export function messageSuppressionLiee(libelle: string, echeance: DateCivile): string {
  return `Cette transaction est le paiement de ${libelle} du ${jourEtMois(echeance)}. Délie-la d'abord depuis son détail.`;
}

/** Message du panneau de détail : le geste « Délier » est dans la section Récurrence, sous les actions. */
export function messageSuppressionLieeDetail(libelle: string, echeance: DateCivile): string {
  return `Cette transaction est le paiement de ${libelle} du ${jourEtMois(echeance)}. Délie-la d'abord dans la section Récurrence ci-dessous.`;
}

/** « mars 2025 ». */
export function moisEtAnnee(d: DateCivile): string {
  return `${nomMois(d)} ${d.slice(0, 4)}`;
}

/** Minuscules, puis majuscule en début de chaîne et après une espace ou un trait d'union (locale fr-CA). « NETFLIX.COM » → « Netflix.com ». */
export function casseDeTitre(texte: string): string {
  const minuscules = texte.toLocaleLowerCase("fr-CA");
  let resultat = "";
  let debutDeMot = true;
  for (const caractere of minuscules) {
    resultat += debutDeMot ? caractere.toLocaleUpperCase("fr-CA") : caractere;
    debutDeMot = caractere === " " || caractere === "-";
  }
  return resultat;
}
