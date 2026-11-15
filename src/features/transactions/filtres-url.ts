// L'état de la consultation dans l'URL — docs/lot-m2.md §5.2. L'URL fait foi :
// un lien filtré se partage. Rien d'invalide n'est passé sous silence (règle 6) :
// chaque paramètre ignoré est rendu dans `ignores`, que l'écran affiche.

import { z } from "zod";
import { FILTRES_VIDES, TRI_PAR_DEFAUT, type FiltresTransactions, type TriTransactions } from "@/domain/consultation";
import { schemaFiltresTransactions } from "./schema";

export type ParametresRecherche = Readonly<Record<string, string | string[] | undefined>>;

export interface ParametreIgnore {
  readonly parametre: string;
  readonly valeur: string;
  readonly motif: string;
}

export interface EtatUrlTransactions {
  readonly filtres: FiltresTransactions;
  readonly tri: TriTransactions;
  readonly ignores: readonly ParametreIgnore[];
}

type Brouillon = { -readonly [K in keyof FiltresTransactions]: FiltresTransactions[K] };

const MOTIF_REPETE = "Paramètre répété.";
const MOTIF_UN = "Valeur attendue : 1.";
const MOTIF_MONTANT = "Montant illisible : l'adresse attend un nombre de cents, sans virgule ni espace (1250 pour 12,50).";
const MOTIF_ID = "Identifiant invalide.";
const SCHEMA_ID = z.string().cuid();

/** Champ du modèle → clé d'URL qui l'a produit. */
const CLE_URL_DU_CHAMP: Readonly<Record<keyof FiltresTransactions, string>> = {
  du: "du",
  au: "au",
  toutesDates: "toutesDates",
  texte: "texte",
  comptes: "compte",
  sousCategories: "sousCategorie",
  nonCategorisee: "sousCategorie",
  beneficiaires: "beneficiaire",
  etiquettes: "etiquette",
  montantMinCents: "montantMin",
  montantMaxCents: "montantMax",
  sens: "sens",
  aRevoir: "aRevoir",
  virements: "virements",
  recurrences: "recurrences",
  ventileesSeulement: "ventilees",
  exclueDuBudget: "exclueBudget",
  exclueDesRapports: "exclueRapports",
};

const CHAMPS = Object.keys(CLE_URL_DU_CHAMP) as (keyof FiltresTransactions)[];

function valeursDe(parametres: ParametresRecherche, cle: string): string[] {
  const brut = parametres[cle];
  if (brut === undefined) {
    return [];
  }
  return Array.isArray(brut) ? brut : [brut];
}

function estChampDeFiltres(valeur: unknown): valeur is keyof FiltresTransactions {
  return typeof valeur === "string" && (CHAMPS as string[]).includes(valeur);
}

export function lireEtatUrl(parametres: ParametresRecherche): EtatUrlTransactions {
  const ignores: ParametreIgnore[] = [];
  const bruts = new Map<string, string>();
  const signaler = (parametre: string, valeur: string, motif: string): void => {
    ignores.push({ parametre, valeur, motif });
  };

  /** La valeur d'un paramètre scalaire ; une répétition est ignorée et signalée. */
  const scalaire = (cle: string): string | null => {
    const valeurs = valeursDe(parametres, cle);
    if (valeurs.length === 0) {
      return null;
    }
    if (valeurs.length > 1) {
      signaler(cle, valeurs.join(","), MOTIF_REPETE);
      return null;
    }
    bruts.set(cle, valeurs[0] ?? "");
    return valeurs[0] ?? "";
  };

  const indicateur = (cle: string): boolean => {
    const valeur = scalaire(cle);
    if (valeur === null) {
      return false;
    }
    if (valeur !== "1") {
      signaler(cle, valeur, MOTIF_UN);
      return false;
    }
    return true;
  };

  const montant = (cle: string): number | null => {
    const valeur = scalaire(cle);
    if (valeur === null) {
      return null;
    }
    if (!/^\d+$/.test(valeur)) {
      signaler(cle, valeur, MOTIF_MONTANT);
      return null;
    }
    return Number(valeur);
  };

  const choix = <T extends string>(cle: string, permises: Readonly<Record<string, T>>, motif: string): T | null => {
    const valeur = scalaire(cle);
    if (valeur === null) {
      return null;
    }
    const retenue = permises[valeur];
    if (retenue === undefined) {
      signaler(cle, valeur, motif);
      return null;
    }
    return retenue;
  };

  const identifiants = (cle: string): { ids: string[]; aucune: boolean } => {
    const ids: string[] = [];
    let aucune = false;
    for (const valeur of valeursDe(parametres, cle)) {
      if (cle === "sousCategorie" && valeur === "aucune") {
        aucune = true;
      } else if (SCHEMA_ID.safeParse(valeur).success) {
        ids.push(valeur);
      } else {
        signaler(cle, valeur, MOTIF_ID);
      }
    }
    return { ids, aucune };
  };

  const brouillon: Brouillon = { ...FILTRES_VIDES };
  brouillon.du = scalaire("du");
  brouillon.au = scalaire("au");
  brouillon.toutesDates = indicateur("toutesDates");
  const texte = scalaire("texte");
  brouillon.texte = texte === null || texte === "" ? null : texte;
  brouillon.comptes = identifiants("compte").ids;
  const sousCategories = identifiants("sousCategorie");
  brouillon.sousCategories = sousCategories.ids;
  brouillon.nonCategorisee = sousCategories.aucune;
  brouillon.beneficiaires = identifiants("beneficiaire").ids;
  brouillon.etiquettes = identifiants("etiquette").ids;
  brouillon.montantMinCents = montant("montantMin");
  brouillon.montantMaxCents = montant("montantMax");
  brouillon.sens =
    choix("sens", { entrees: "ENTREES", sorties: "SORTIES" } as const, "Valeur attendue : entrees ou sorties.") ?? "TOUT";
  brouillon.aRevoir = indicateur("aRevoir");
  brouillon.virements =
    choix("virements", { seulement: "SEULEMENT", exclure: "EXCLURE" } as const, "Valeur attendue : seulement ou exclure.") ??
    "INCLURE";
  brouillon.recurrences =
    choix(
      "recurrences",
      { seulement: "SEULEMENT", exclure: "EXCLURE" } as const,
      "Valeur attendue : seulement ou exclure.",
    ) ?? "INCLURE";
  brouillon.ventileesSeulement = indicateur("ventilees");
  brouillon.exclueDuBudget = indicateur("exclueBudget");
  brouillon.exclueDesRapports = indicateur("exclueRapports");

  const champ = choix("tri", { date: "DATE", montant: "MONTANT" } as const, "Valeur attendue : date ou montant.");
  const ordre = choix("ordre", { asc: "ASC", desc: "DESC" } as const, "Valeur attendue : asc ou desc.");
  const tri: TriTransactions = { champ: champ ?? TRI_PAR_DEFAUT.champ, ordre: ordre ?? TRI_PAR_DEFAUT.ordre };

  // Validation du schéma partagé : une issue remet à neutre le champ racine de
  // son chemin (et, pour une issue croisée, les champs en cause), au plus deux tours.
  const valeurBrute = (champCible: keyof FiltresTransactions): string => {
    const cle = CLE_URL_DU_CHAMP[champCible];
    const valeurs = valeursDe(parametres, cle);
    return valeurs.length > 0 ? valeurs.join(",") : (bruts.get(cle) ?? "");
  };
  const neutraliser = (cible: keyof FiltresTransactions): void => {
    (brouillon as Record<keyof FiltresTransactions, unknown>)[cible] = FILTRES_VIDES[cible];
  };
  const CHAMPS_EN_CAUSE: Readonly<Record<string, readonly (keyof FiltresTransactions)[]>> = {
    au: ["du", "au"],
    montantMaxCents: ["montantMinCents", "montantMaxCents"],
    toutesDates: ["toutesDates", "du", "au"],
  };

  for (let tour = 0; tour < 2; tour += 1) {
    const analyse = schemaFiltresTransactions.safeParse(brouillon);
    if (analyse.success) {
      return { filtres: analyse.data, tri, ignores };
    }
    for (const issue of analyse.error.issues) {
      const racine = issue.path[0];
      if (!estChampDeFiltres(racine)) {
        continue;
      }
      signaler(CLE_URL_DU_CHAMP[racine], valeurBrute(racine), issue.message);
      const croisee = issue.code === "custom" && issue.params?.croisee === true;
      const enCause = croisee && issue.path.length === 1 ? CHAMPS_EN_CAUSE[racine] : undefined;
      for (const cible of enCause ?? [racine]) {
        neutraliser(cible);
      }
    }
  }

  const derniere = schemaFiltresTransactions.safeParse(brouillon);
  if (derniere.success) {
    return { filtres: derniere.data, tri, ignores };
  }
  for (const issue of derniere.error.issues) {
    const racine = issue.path[0];
    if (estChampDeFiltres(racine)) {
      signaler(CLE_URL_DU_CHAMP[racine], valeurBrute(racine), issue.message);
    }
  }
  return { filtres: FILTRES_VIDES, tri, ignores };
}

export function versParametresUrl(filtres: FiltresTransactions, tri: TriTransactions): URLSearchParams {
  const parametres = new URLSearchParams();
  if (filtres.du !== null) parametres.append("du", filtres.du);
  if (filtres.au !== null) parametres.append("au", filtres.au);
  if (filtres.toutesDates) parametres.append("toutesDates", "1");
  if (filtres.texte !== null) parametres.append("texte", filtres.texte);
  for (const id of filtres.comptes) parametres.append("compte", id);
  for (const id of filtres.sousCategories) parametres.append("sousCategorie", id);
  if (filtres.nonCategorisee) parametres.append("sousCategorie", "aucune");
  for (const id of filtres.beneficiaires) parametres.append("beneficiaire", id);
  for (const id of filtres.etiquettes) parametres.append("etiquette", id);
  if (filtres.montantMinCents !== null) parametres.append("montantMin", String(filtres.montantMinCents));
  if (filtres.montantMaxCents !== null) parametres.append("montantMax", String(filtres.montantMaxCents));
  if (filtres.sens !== "TOUT") parametres.append("sens", filtres.sens === "ENTREES" ? "entrees" : "sorties");
  if (filtres.aRevoir) parametres.append("aRevoir", "1");
  if (filtres.virements !== "INCLURE") parametres.append("virements", filtres.virements === "SEULEMENT" ? "seulement" : "exclure");
  if (filtres.recurrences !== "INCLURE") parametres.append("recurrences", filtres.recurrences === "SEULEMENT" ? "seulement" : "exclure");
  if (filtres.ventileesSeulement) parametres.append("ventilees", "1");
  if (filtres.exclueDuBudget) parametres.append("exclueBudget", "1");
  if (filtres.exclueDesRapports) parametres.append("exclueRapports", "1");
  if (tri.champ !== TRI_PAR_DEFAUT.champ) parametres.append("tri", "montant");
  if (tri.ordre !== TRI_PAR_DEFAUT.ordre) parametres.append("ordre", "asc");
  return parametres;
}

export function hrefTransactions(filtres: FiltresTransactions, tri: TriTransactions): string {
  const requete = versParametresUrl(filtres, tri).toString();
  return requete === "" ? "/transactions" : `/transactions?${requete}`;
}
