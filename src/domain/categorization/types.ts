// Contrat du moteur de règles de catégorisation — docs/lot-m1.md §4.6.
// Les énumérations redéclarent les enum Prisma (ChampCondition,
// OperateurCondition, TypeAction, lignes 144-175 de prisma/schema.prisma) en
// TypeScript pur : src/domain/ ne connaît pas Prisma (CLAUDE.md §5), et ces
// valeurs doivent être disponibles côté client. Vont ici et non dans
// src/domain/referentiel.ts : elles ne servent qu'au moteur de règles et à
// son éditeur.
//
// Garde de dérive, identique à celle de referentiel.ts : src/server/
// repositories/rules.ts assigne les valeurs Prisma dans des champs typés par
// ces unions ; si le schéma gagne ou perd une valeur, tsc échoue de lui-même.
// Aucun test artificiel de synchronisation.

import type { Cents } from "../money";
import type { PartVentilation } from "../ventilation";

export const CHAMPS_CONDITION = [
  "DESCRIPTION",
  "DESCRIPTION_NORMALISEE",
  "BENEFICIAIRE",
  "MONTANT",
  "COMPTE",
  "SENS",
] as const;
export type ChampCondition = (typeof CHAMPS_CONDITION)[number];

export const OPERATEURS_CONDITION = [
  "CONTIENT",
  "MOT_ENTIER",
  "EGALE",
  "COMMENCE_PAR",
  "REGEX",
  "SUP",
  "SUP_EGAL",
  "INF",
  "INF_EGAL",
  "ENTRE",
  "DANS",
] as const;
export type OperateurCondition = (typeof OPERATEURS_CONDITION)[number];

export const TYPES_ACTION = [
  "RENOMMER_BENEFICIAIRE",
  "CATEGORISER",
  "ETIQUETER",
  "NOTER",
  "EXCLURE_BUDGET",
  "EXCLURE_RAPPORTS",
  "MARQUER_A_REVOIR",
  "VENTILER",
] as const;
export type TypeAction = (typeof TYPES_ACTION)[number];

export const SENS_CONDITION = ["ENTREE", "SORTIE"] as const;
export type SensCondition = (typeof SENS_CONDITION)[number];

// ── ce que le moteur reçoit

export interface ConditionRegle {
  readonly id: string;
  readonly champ: ChampCondition;
  readonly operateur: OperateurCondition;
  readonly valeur: string;
  readonly valeurFin: string | null;
}

export interface ActionRegle {
  readonly id: string;
  readonly type: TypeAction;
  readonly subcategoryId: string | null;
  readonly valeur: string | null;
  readonly ordre: number;
}

export interface RegleCategorisation {
  readonly id: string;
  readonly libelle: string;
  readonly priorite: number;
  readonly actif: boolean;
  readonly conditions: readonly ConditionRegle[];
  readonly actions: readonly ActionRegle[];
}

export interface LigneACategoriser {
  readonly description: string;
  readonly descriptionNormalisee: string;
  readonly montantCents: Cents;
  readonly accountId: string;
  /** Nom du bénéficiaire déjà résolu, ou null. Cible du champ BENEFICIAIRE. */
  readonly payeeNom: string | null;
}

export interface ContexteBeneficiaire {
  readonly payeeId: string;
  readonly nom: string;
  readonly sousCategorieParDefautId: string | null;
  readonly autoCategorisation: boolean;
  readonly categorieVerrouillee: boolean;
}

// ── ce que le moteur rend

/** Les trois seuls créneaux porteurs d'une valeur, donc les trois seuls où un conflit existe. */
export const SLOTS_AFFECTATION = ["SOUS_CATEGORIE", "BENEFICIAIRE", "NOTE"] as const;
export type SlotAffectation = (typeof SLOTS_AFFECTATION)[number];

export interface Affectation {
  readonly payeeNom: string | null;
  readonly subcategoryId: string | null;
  /** Ventilation posée par VENTILER (subcategoryId est alors null), sinon null — docs/lot-m2.md §4.3. */
  readonly ventilation: readonly PartVentilation[] | null;
  readonly tagIds: readonly string[];
  readonly note: string | null;
  readonly exclureDuBudget: boolean;
  readonly exclureDesRapports: boolean;
  readonly aRevoir: boolean;
}

export interface CandidatConflit {
  readonly ruleId: string;
  readonly libelle: string;
  /** Ce que cette règle aurait posé : sous-catégorie, nom de bénéficiaire, note — ou cleVentilation(parts) pour VENTILER. */
  readonly valeur: string;
  /** Présent seulement pour un candidat VENTILER. */
  readonly ventilation?: readonly PartVentilation[];
}

export interface ConflitRegles {
  readonly slot: SlotAffectation;
  readonly priorite: number;
  readonly candidats: readonly CandidatConflit[];
}

export type MotifRegleInapplicable =
  | "AUCUNE_CONDITION"
  | "OPERATEUR_INCOMPATIBLE"
  | "VALEUR_ILLISIBLE"
  | "REGEX_INVALIDE"
  | "VENTILATION_ILLISIBLE";

export interface RegleInapplicable {
  readonly ruleId: string;
  readonly libelle: string;
  readonly motif: MotifRegleInapplicable;
  readonly champ: ChampCondition | null;
  /** Message technique (ex. celui du moteur de regex). Jamais comparé par un oracle. */
  readonly detail: string;
}

export type MotifActionNonAppliquee = "ACTION_NON_SUPPORTEE" | "CATEGORIE_VERROUILLEE";

export interface ActionNonAppliquee {
  readonly ruleId: string;
  readonly libelle: string;
  readonly type: TypeAction;
  readonly motif: MotifActionNonAppliquee;
}

export interface ResultatCategorisation {
  readonly affectation: Affectation;
  /** La règle qui a posé la sous-catégorie retenue, sinon null — sens exact d'`appliedRuleId`. */
  readonly regleAppliqueeId: string | null;
  /** Identifiants des règles dont toutes les conditions sont vraies, dans l'ordre de résolution. */
  readonly reglesCorrespondantes: readonly string[];
  readonly conflits: readonly ConflitRegles[];
  readonly reglesInapplicables: readonly RegleInapplicable[];
  readonly actionsNonAppliquees: readonly ActionNonAppliquee[];
}

export interface OptionsApplication {
  /** true = la sous-catégorie est fixée hors règles ; aucune règle ne peut la poser. */
  readonly sousCategorieVerrouillee?: boolean;
}

export const AFFECTATION_VIDE: Affectation = {
  payeeNom: null,
  subcategoryId: null,
  ventilation: null,
  tagIds: [],
  note: null,
  exclureDuBudget: false,
  exclureDesRapports: false,
  aRevoir: false,
};
