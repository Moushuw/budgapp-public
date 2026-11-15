// Les filtres de la consultation des transactions — docs/lot-m2.md §5.2. Pur :
// aucun accès à la base, aucun import de framework.

import type { DateCivile } from "../dates";
import type { Cents } from "../money";
import { bornesPeriode, type Periode } from "../periode";
import type { CurseurTransactions } from "./types";

export const TAILLE_PAGE_TRANSACTIONS = 50;
export { LIMITE_LIGNES_VENTILATION } from "../ventilation/limites";

export type SensMontant = "TOUT" | "ENTREES" | "SORTIES";
export type ModeVirements = "INCLURE" | "SEULEMENT" | "EXCLURE";
export type ModeRecurrences = "INCLURE" | "SEULEMENT" | "EXCLURE";
export type ChampTri = "DATE" | "MONTANT";
export type OrdreTri = "ASC" | "DESC";

export interface TriTransactions {
  readonly champ: ChampTri;
  readonly ordre: OrdreTri;
}

export const TRI_PAR_DEFAUT: TriTransactions = { champ: "DATE", ordre: "DESC" };

/** Ce que porte l'URL et ce que reçoit l'action (avec la période). */
export interface FiltresTransactions {
  readonly du: DateCivile | null;
  readonly au: DateCivile | null;
  readonly toutesDates: boolean;
  readonly texte: string | null; // déjà trimé, jamais ""
  readonly comptes: readonly string[];
  readonly sousCategories: readonly string[];
  readonly nonCategorisee: boolean;
  readonly beneficiaires: readonly string[];
  readonly etiquettes: readonly string[];
  readonly montantMinCents: Cents | null; // ≥ 0, sur la valeur absolue
  readonly montantMaxCents: Cents | null; // ≥ 0, sur la valeur absolue
  readonly sens: SensMontant;
  readonly aRevoir: boolean;
  readonly virements: ModeVirements;
  readonly recurrences: ModeRecurrences;
  readonly ventileesSeulement: boolean;
  readonly exclueDuBudget: boolean;
  readonly exclueDesRapports: boolean;
}

/** Ce que reçoit le repository : la portée de dates est résolue. */
export type CriteresTransactions = Omit<FiltresTransactions, "toutesDates">;

export const FILTRES_VIDES: FiltresTransactions = {
  du: null,
  au: null,
  toutesDates: false,
  texte: null,
  comptes: [],
  sousCategories: [],
  nonCategorisee: false,
  beneficiaires: [],
  etiquettes: [],
  montantMinCents: null,
  montantMaxCents: null,
  sens: "TOUT",
  aRevoir: false,
  virements: "INCLURE",
  recurrences: "INCLURE",
  ventileesSeulement: false,
  exclueDuBudget: false,
  exclueDesRapports: false,
};

/** toutesDates → du = au = null ; du ou au posé → gardés tels quels ; sinon bornes de la période. */
export function resoudreCriteres(filtres: FiltresTransactions, periode: Periode): CriteresTransactions {
  const { toutesDates, ...reste } = filtres;
  if (toutesDates) {
    return { ...reste, du: null, au: null };
  }
  if (filtres.du !== null || filtres.au !== null) {
    return reste;
  }
  const bornes = bornesPeriode(periode);
  return { ...reste, du: bornes.du, au: bornes.au };
}

export type Pastille =
  | { readonly type: "PLAGE"; readonly du: DateCivile | null; readonly au: DateCivile | null }
  | { readonly type: "TOUTES_DATES" }
  | { readonly type: "TEXTE"; readonly texte: string }
  | { readonly type: "COMPTE"; readonly id: string }
  | { readonly type: "SOUS_CATEGORIE"; readonly id: string }
  | { readonly type: "NON_CATEGORISEE" }
  | { readonly type: "BENEFICIAIRE"; readonly id: string }
  | { readonly type: "ETIQUETTE"; readonly id: string }
  | { readonly type: "MONTANT_MIN"; readonly cents: Cents }
  | { readonly type: "MONTANT_MAX"; readonly cents: Cents }
  | { readonly type: "SENS"; readonly sens: "ENTREES" | "SORTIES" }
  | { readonly type: "A_REVOIR" }
  | { readonly type: "VIREMENTS"; readonly mode: "SEULEMENT" | "EXCLURE" }
  | { readonly type: "RECURRENCES"; readonly mode: "SEULEMENT" | "EXCLURE" }
  | { readonly type: "VENTILEES" }
  | { readonly type: "EXCLUE_BUDGET" }
  | { readonly type: "EXCLUE_RAPPORTS" };

/** Une pastille par valeur active, dans l'ordre des membres de l'union, puis dans l'ordre des listes. Le tri n'est jamais une pastille. */
export function pastillesActives(filtres: FiltresTransactions): readonly Pastille[] {
  const pastilles: Pastille[] = [];
  if (filtres.du !== null || filtres.au !== null) {
    pastilles.push({ type: "PLAGE", du: filtres.du, au: filtres.au });
  }
  if (filtres.toutesDates) {
    pastilles.push({ type: "TOUTES_DATES" });
  }
  if (filtres.texte !== null) {
    pastilles.push({ type: "TEXTE", texte: filtres.texte });
  }
  for (const id of filtres.comptes) {
    pastilles.push({ type: "COMPTE", id });
  }
  for (const id of filtres.sousCategories) {
    pastilles.push({ type: "SOUS_CATEGORIE", id });
  }
  if (filtres.nonCategorisee) {
    pastilles.push({ type: "NON_CATEGORISEE" });
  }
  for (const id of filtres.beneficiaires) {
    pastilles.push({ type: "BENEFICIAIRE", id });
  }
  for (const id of filtres.etiquettes) {
    pastilles.push({ type: "ETIQUETTE", id });
  }
  if (filtres.montantMinCents !== null) {
    pastilles.push({ type: "MONTANT_MIN", cents: filtres.montantMinCents });
  }
  if (filtres.montantMaxCents !== null) {
    pastilles.push({ type: "MONTANT_MAX", cents: filtres.montantMaxCents });
  }
  if (filtres.sens !== "TOUT") {
    pastilles.push({ type: "SENS", sens: filtres.sens });
  }
  if (filtres.aRevoir) {
    pastilles.push({ type: "A_REVOIR" });
  }
  if (filtres.virements !== "INCLURE") {
    pastilles.push({ type: "VIREMENTS", mode: filtres.virements });
  }
  if (filtres.recurrences !== "INCLURE") {
    pastilles.push({ type: "RECURRENCES", mode: filtres.recurrences });
  }
  if (filtres.ventileesSeulement) {
    pastilles.push({ type: "VENTILEES" });
  }
  if (filtres.exclueDuBudget) {
    pastilles.push({ type: "EXCLUE_BUDGET" });
  }
  if (filtres.exclueDesRapports) {
    pastilles.push({ type: "EXCLUE_RAPPORTS" });
  }
  return pastilles;
}

/** Retire exactement ce que la pastille représente (PLAGE remet du et au à null ; COMPTE retire cet id seulement). */
export function retirerPastille(filtres: FiltresTransactions, pastille: Pastille): FiltresTransactions {
  switch (pastille.type) {
    case "PLAGE":
      return { ...filtres, du: null, au: null };
    case "TOUTES_DATES":
      return { ...filtres, toutesDates: false };
    case "TEXTE":
      return { ...filtres, texte: null };
    case "COMPTE":
      return { ...filtres, comptes: filtres.comptes.filter((id) => id !== pastille.id) };
    case "SOUS_CATEGORIE":
      return { ...filtres, sousCategories: filtres.sousCategories.filter((id) => id !== pastille.id) };
    case "NON_CATEGORISEE":
      return { ...filtres, nonCategorisee: false };
    case "BENEFICIAIRE":
      return { ...filtres, beneficiaires: filtres.beneficiaires.filter((id) => id !== pastille.id) };
    case "ETIQUETTE":
      return { ...filtres, etiquettes: filtres.etiquettes.filter((id) => id !== pastille.id) };
    case "MONTANT_MIN":
      return { ...filtres, montantMinCents: null };
    case "MONTANT_MAX":
      return { ...filtres, montantMaxCents: null };
    case "SENS":
      return { ...filtres, sens: "TOUT" };
    case "A_REVOIR":
      return { ...filtres, aRevoir: false };
    case "VIREMENTS":
      return { ...filtres, virements: "INCLURE" };
    case "RECURRENCES":
      return { ...filtres, recurrences: "INCLURE" };
    case "VENTILEES":
      return { ...filtres, ventileesSeulement: false };
    case "EXCLUE_BUDGET":
      return { ...filtres, exclueDuBudget: false };
    case "EXCLUE_RAPPORTS":
      return { ...filtres, exclueDesRapports: false };
  }
}

interface CleLigne {
  readonly id: string;
  readonly date: DateCivile;
  readonly montantCents: Cents;
}

/** Clé du curseur de la ligne qui termine la page. */
export function curseurApres(ligne: CleLigne, champ: ChampTri): CurseurTransactions {
  return champ === "DATE"
    ? { champ: "DATE", date: ligne.date, id: ligne.id }
    : { champ: "MONTANT", montantCents: ligne.montantCents, id: ligne.id };
}

/**
 * L'ordre de référence : la clé (date civile comparée en chaîne, ou
 * montantCents signé) puis l'id en ordre de code (comparaison `<` de chaînes,
 * équivalente à COLLATE "C"), les deux dans le sens de `tri.ordre`.
 */
export function comparerLignes(a: CleLigne, b: CleLigne, tri: TriTransactions): number {
  let ordre: number;
  if (tri.champ === "DATE") {
    ordre = a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
  } else {
    ordre = a.montantCents < b.montantCents ? -1 : a.montantCents > b.montantCents ? 1 : 0;
  }
  if (ordre === 0) {
    ordre = a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  }
  return tri.ordre === "ASC" ? ordre : -ordre;
}
