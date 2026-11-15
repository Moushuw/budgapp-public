// Évaluation d'une condition de règle — docs/lot-m1.md §4.6. Aucune zone
// grise : chaque condition rend VRAI, FAUX, ou INAPPLICABLE (avec motif) ;
// jamais une exception. INAPPLICABLE prime toujours sur FAUX dans
// evaluerConditions, pour qu'une règle cassée ne disparaisse pas en silence.

import { aplatirTexte } from "../ingestion";
import { contientMotEntier } from "../ingestion/frontiere-mot";
import { operateurCompatible, SEPARATEUR_LISTE } from "./champs";
import { SENS_CONDITION } from "./types";
import type {
  ChampCondition,
  ConditionRegle,
  LigneACategoriser,
  MotifRegleInapplicable,
  OperateurCondition,
  SensCondition,
} from "./types";

export type VerdictCondition =
  | { readonly statut: "VRAI" }
  | { readonly statut: "FAUX" }
  | { readonly statut: "INAPPLICABLE"; readonly motif: MotifRegleInapplicable; readonly detail: string };

const VRAI: VerdictCondition = { statut: "VRAI" };
const FAUX: VerdictCondition = { statut: "FAUX" };

function inapplicable(motif: MotifRegleInapplicable, detail: string): VerdictCondition {
  return { statut: "INAPPLICABLE", motif, detail };
}

const FORME_ENTIER_SIGNE = /^[+-]?\d+$/;

function parseEntierCents(valeur: string): number | null {
  return FORME_ENTIER_SIGNE.test(valeur) ? Number(valeur) : null;
}

function listeDepuisValeur(valeur: string): string[] {
  return valeur
    .split(SEPARATEUR_LISTE)
    .map((element) => element.trim())
    .filter((element) => element !== "");
}

type ChampTexte = "DESCRIPTION" | "DESCRIPTION_NORMALISEE" | "BENEFICIAIRE";

function valeurChampTexte(champ: ChampTexte, ligne: LigneACategoriser): string | null {
  if (champ === "DESCRIPTION") {
    return ligne.description;
  }
  if (champ === "DESCRIPTION_NORMALISEE") {
    return ligne.descriptionNormalisee;
  }
  return ligne.payeeNom;
}

function evaluerTexte(
  champ: ChampTexte,
  operateur: OperateurCondition,
  valeur: string,
  ligne: LigneACategoriser,
): VerdictCondition {
  const valeurChamp = valeurChampTexte(champ, ligne);

  // BENEFICIAIRE sans bénéficiaire résolu : la règle est valide, elle ne
  // correspond simplement pas — jamais INAPPLICABLE.
  if (valeurChamp === null) {
    return FAUX;
  }

  if (operateur === "REGEX") {
    let motifRegex: RegExp;
    try {
      // Jamais le drapeau "g" : une RegExp avec état rendrait l'évaluation
      // dépendante de l'ordre. Testée contre la valeur BRUTE (pas aplatie).
      motifRegex = new RegExp(valeur, "i");
    } catch (erreur) {
      return inapplicable("REGEX_INVALIDE", erreur instanceof Error ? erreur.message : String(erreur));
    }
    return motifRegex.test(valeurChamp) ? VRAI : FAUX;
  }

  const champAplati = aplatirTexte(valeurChamp);

  if (operateur === "CONTIENT") {
    return champAplati.includes(aplatirTexte(valeur)) ? VRAI : FAUX;
  }
  if (operateur === "MOT_ENTIER") {
    return contientMotEntier(champAplati, valeur) ? VRAI : FAUX;
  }
  if (operateur === "EGALE") {
    return champAplati === aplatirTexte(valeur) ? VRAI : FAUX;
  }
  if (operateur === "COMMENCE_PAR") {
    return champAplati.startsWith(aplatirTexte(valeur)) ? VRAI : FAUX;
  }

  // DANS = « égale l'un des éléments ».
  const liste = listeDepuisValeur(valeur).map(aplatirTexte);
  if (liste.length === 0) {
    return inapplicable("VALEUR_ILLISIBLE", "Liste vide après nettoyage.");
  }
  return liste.includes(champAplati) ? VRAI : FAUX;
}

function evaluerMontant(
  operateur: OperateurCondition,
  valeur: string,
  valeurFin: string | null,
  montantCents: number,
): VerdictCondition {
  // Jamais parseMontant() ici : la conversion dollars → cents se fait une
  // seule fois, dans le transform zod de l'éditeur. Le moteur ne voit que des
  // cents (CLAUDE.md §11).
  const bas = parseEntierCents(valeur);
  if (bas === null) {
    return inapplicable("VALEUR_ILLISIBLE", `Montant illisible : « ${valeur} ».`);
  }

  if (operateur === "ENTRE") {
    if (valeurFin === null) {
      return inapplicable("VALEUR_ILLISIBLE", "La borne haute est absente.");
    }
    const haut = parseEntierCents(valeurFin);
    if (haut === null) {
      return inapplicable("VALEUR_ILLISIBLE", `Borne haute illisible : « ${valeurFin} ».`);
    }
    if (haut < bas) {
      return inapplicable("VALEUR_ILLISIBLE", "La borne haute est inférieure à la borne basse.");
    }
    return montantCents >= bas && montantCents <= haut ? VRAI : FAUX;
  }

  if (operateur === "EGALE") {
    return montantCents === bas ? VRAI : FAUX;
  }
  if (operateur === "SUP") {
    return montantCents > bas ? VRAI : FAUX;
  }
  if (operateur === "SUP_EGAL") {
    return montantCents >= bas ? VRAI : FAUX;
  }
  if (operateur === "INF") {
    return montantCents < bas ? VRAI : FAUX;
  }
  // INF_EGAL
  return montantCents <= bas ? VRAI : FAUX;
}

function evaluerCompte(operateur: OperateurCondition, valeur: string, accountId: string): VerdictCondition {
  if (operateur === "DANS") {
    const liste = listeDepuisValeur(valeur);
    if (liste.length === 0) {
      return inapplicable("VALEUR_ILLISIBLE", "Liste de comptes vide après nettoyage.");
    }
    return liste.includes(accountId) ? VRAI : FAUX;
  }
  // EGALE — comparaison exacte, ni casse ni accents à neutraliser (un cuid).
  return valeur === accountId ? VRAI : FAUX;
}

function estSensConnu(valeur: string): valeur is SensCondition {
  return (SENS_CONDITION as readonly string[]).includes(valeur);
}

function evaluerSens(valeur: string, montantCents: number): VerdictCondition {
  if (!estSensConnu(valeur)) {
    return inapplicable("VALEUR_ILLISIBLE", `Sens inconnu : « ${valeur} ».`);
  }
  // Un montant nul n'est ni une entrée ni une sortie.
  if (valeur === "ENTREE") {
    return montantCents > 0 ? VRAI : FAUX;
  }
  return montantCents < 0 ? VRAI : FAUX;
}

export function evaluerCondition(condition: ConditionRegle, ligne: LigneACategoriser): VerdictCondition {
  const { champ, operateur, valeur, valeurFin } = condition;

  if (!operateurCompatible(champ, operateur)) {
    return inapplicable("OPERATEUR_INCOMPATIBLE", `L'opérateur ${operateur} ne s'applique pas au champ ${champ}.`);
  }

  // Sans quoi CONTIENT "" catégoriserait tout le relevé.
  if (valeur.trim() === "") {
    return inapplicable("VALEUR_ILLISIBLE", "La valeur de la condition est vide.");
  }

  if (champ === "DESCRIPTION" || champ === "DESCRIPTION_NORMALISEE" || champ === "BENEFICIAIRE") {
    return evaluerTexte(champ, operateur, valeur, ligne);
  }
  if (champ === "MONTANT") {
    return evaluerMontant(operateur, valeur, valeurFin, ligne.montantCents);
  }
  if (champ === "COMPTE") {
    return evaluerCompte(operateur, valeur, ligne.accountId);
  }
  // SENS
  return evaluerSens(valeur, ligne.montantCents);
}

/** Renvoie le champ de la première condition inapplicable, ou null (AUCUNE_CONDITION ou aucune trouvée). */
export function champInapplicable(
  conditions: readonly ConditionRegle[],
  ligne: LigneACategoriser,
): ChampCondition | null {
  for (const condition of conditions) {
    if (evaluerCondition(condition, ligne).statut === "INAPPLICABLE") {
      return condition.champ;
    }
  }
  return null;
}

/** ET de toutes les conditions. Court-circuite sur INAPPLICABLE (qui prime sur FAUX). */
export function evaluerConditions(
  conditions: readonly ConditionRegle[],
  ligne: LigneACategoriser,
): VerdictCondition {
  if (conditions.length === 0) {
    return inapplicable("AUCUNE_CONDITION", "Cette règle ne porte aucune condition.");
  }

  let uneFausse = false;
  for (const condition of conditions) {
    const verdict = evaluerCondition(condition, ligne);
    if (verdict.statut === "INAPPLICABLE") {
      return verdict;
    }
    if (verdict.statut === "FAUX") {
      uneFausse = true;
    }
  }

  return uneFausse ? FAUX : VRAI;
}
