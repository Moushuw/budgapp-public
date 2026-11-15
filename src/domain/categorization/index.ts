// Barillet — sur le modèle de src/domain/statement/index.ts. Le reste du
// projet importe @/domain/categorization, jamais un fichier interne.

export type {
  ActionNonAppliquee,
  ActionRegle,
  Affectation,
  CandidatConflit,
  ChampCondition,
  ConditionRegle,
  ConflitRegles,
  ContexteBeneficiaire,
  LigneACategoriser,
  MotifActionNonAppliquee,
  MotifRegleInapplicable,
  OperateurCondition,
  OptionsApplication,
  RegleCategorisation,
  RegleInapplicable,
  ResultatCategorisation,
  SensCondition,
  SlotAffectation,
  TypeAction,
} from "./types";
export {
  AFFECTATION_VIDE,
  CHAMPS_CONDITION,
  OPERATEURS_CONDITION,
  SENS_CONDITION,
  SLOTS_AFFECTATION,
  TYPES_ACTION,
} from "./types";

export type { TypeValeurCondition } from "./champs";
export {
  LIBELLES_CHAMP_CONDITION,
  LIBELLES_OPERATEUR_CONDITION,
  LIBELLES_SENS_CONDITION,
  LIBELLES_TYPE_ACTION,
  OPERATEURS_OFFERTS_PAR_CHAMP,
  OPERATEURS_PAR_CHAMP,
  SEPARATEUR_LISTE,
  TYPE_VALEUR_PAR_CHAMP,
  exigeValeurFin,
  operateurCompatible,
  operateurParDefaut,
} from "./champs";

export type { VerdictCondition } from "./conditions";
export { evaluerCondition, evaluerConditions } from "./conditions";

export { appliquerRegles } from "./resolution";

export { categoriser } from "./categoriser";

export type { CreneauRecu, PoseSousCategorie } from "./regle-creditee";
export { poseSousCategorie, regleJustifieCreneau } from "./regle-creditee";
