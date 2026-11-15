// La matrice champ × opérateur, et les libellés fr-CA — docs/lot-m1.md
// §4.6. Savoir métier partagé : le moteur s'en sert pour détecter
// OPERATEUR_INCOMPATIBLE, l'éditeur pour n'offrir que les opérateurs qui ont
// un sens (docs/lot-m1.md §4.6).
//
// DANS est évalué mais pas offert sur les champs texte : le pluriel n'a de
// sens évident que pour une liste de comptes. Le
// moteur reste total, l'éditeur reste étroit.

import type { ChampCondition, OperateurCondition, SensCondition, TypeAction } from "./types";

export type TypeValeurCondition = "TEXTE" | "MONTANT" | "COMPTE" | "SENS";

export const TYPE_VALEUR_PAR_CHAMP: Record<ChampCondition, TypeValeurCondition> = {
  DESCRIPTION: "TEXTE",
  DESCRIPTION_NORMALISEE: "TEXTE",
  BENEFICIAIRE: "TEXTE",
  MONTANT: "MONTANT",
  COMPTE: "COMPTE",
  SENS: "SENS",
};

const OPERATEURS_TEXTE_EVALUES = ["CONTIENT", "MOT_ENTIER", "EGALE", "COMMENCE_PAR", "REGEX", "DANS"] as const;
const OPERATEURS_TEXTE_OFFERTS = ["CONTIENT", "MOT_ENTIER", "EGALE", "COMMENCE_PAR", "REGEX"] as const;
const OPERATEURS_MONTANT = ["EGALE", "SUP", "SUP_EGAL", "INF", "INF_EGAL", "ENTRE"] as const;
const OPERATEURS_COMPTE = ["EGALE", "DANS"] as const;
const OPERATEURS_SENS = ["EGALE"] as const;

type ListeNonVide<T> = readonly [T, ...T[]];

const OPERATEURS_EVALUES_INTERNE: Record<ChampCondition, ListeNonVide<OperateurCondition>> = {
  DESCRIPTION: OPERATEURS_TEXTE_EVALUES,
  DESCRIPTION_NORMALISEE: OPERATEURS_TEXTE_EVALUES,
  BENEFICIAIRE: OPERATEURS_TEXTE_EVALUES,
  MONTANT: OPERATEURS_MONTANT,
  COMPTE: OPERATEURS_COMPTE,
  SENS: OPERATEURS_SENS,
};

const OPERATEURS_OFFERTS_INTERNE: Record<ChampCondition, ListeNonVide<OperateurCondition>> = {
  DESCRIPTION: OPERATEURS_TEXTE_OFFERTS,
  DESCRIPTION_NORMALISEE: OPERATEURS_TEXTE_OFFERTS,
  BENEFICIAIRE: OPERATEURS_TEXTE_OFFERTS,
  MONTANT: OPERATEURS_MONTANT,
  COMPTE: OPERATEURS_COMPTE,
  SENS: OPERATEURS_SENS,
};

export const OPERATEURS_PAR_CHAMP: Record<ChampCondition, readonly OperateurCondition[]> = OPERATEURS_EVALUES_INTERNE;

/** Opérateurs proposés par l'éditeur — sous-ensemble d'OPERATEURS_PAR_CHAMP (§3.2, DANS). */
export const OPERATEURS_OFFERTS_PAR_CHAMP: Record<ChampCondition, readonly OperateurCondition[]> =
  OPERATEURS_OFFERTS_INTERNE;

export function operateurCompatible(champ: ChampCondition, operateur: OperateurCondition): boolean {
  return (OPERATEURS_EVALUES_INTERNE[champ] as readonly OperateurCondition[]).includes(operateur);
}

/** Premier opérateur offert pour ce champ — valeur de repli quand le champ change dans l'éditeur. */
export function operateurParDefaut(champ: ChampCondition): OperateurCondition {
  return OPERATEURS_OFFERTS_INTERNE[champ][0];
}

/** ENTRE uniquement. */
export function exigeValeurFin(operateur: OperateurCondition): boolean {
  return operateur === "ENTRE";
}

/** Séparateur des listes de l'opérateur DANS. */
export const SEPARATEUR_LISTE = "|";

export const LIBELLES_CHAMP_CONDITION: Record<ChampCondition, string> = {
  DESCRIPTION: "Description",
  DESCRIPTION_NORMALISEE: "Description normalisée",
  BENEFICIAIRE: "Bénéficiaire",
  MONTANT: "Montant",
  COMPTE: "Compte",
  SENS: "Sens",
};

export const LIBELLES_OPERATEUR_CONDITION: Record<OperateurCondition, string> = {
  CONTIENT: "contient",
  MOT_ENTIER: "contient le mot entier",
  EGALE: "est exactement",
  COMMENCE_PAR: "commence par",
  REGEX: "correspond à l'expression régulière",
  SUP: "est supérieur à",
  SUP_EGAL: "est supérieur ou égal à",
  INF: "est inférieur à",
  INF_EGAL: "est inférieur ou égal à",
  ENTRE: "est entre",
  DANS: "est dans la liste",
};

export const LIBELLES_TYPE_ACTION: Record<TypeAction, string> = {
  RENOMMER_BENEFICIAIRE: "Renommer le bénéficiaire",
  CATEGORISER: "Catégoriser",
  ETIQUETER: "Étiqueter",
  NOTER: "Ajouter une note",
  EXCLURE_BUDGET: "Exclure du budget",
  EXCLURE_RAPPORTS: "Exclure des rapports",
  MARQUER_A_REVOIR: "Marquer à revoir",
  VENTILER: "Ventiler",
};

export const LIBELLES_SENS_CONDITION: Record<SensCondition, string> = {
  ENTREE: "Entrée d'argent",
  SORTIE: "Sortie d'argent",
};
