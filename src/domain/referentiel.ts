// Les énumérations métier du référentiel — spec M1 tranche 2 §4.2. Elles
// redéclarent les valeurs des enum Prisma en TypeScript pur, pour que
// `src/domain/` reste sans dépendance (CLAUDE.md §5) et que ces valeurs
// soient disponibles côté client sans importer @prisma/client dans le
// navigateur (CLAUDE.md §7).
//
// Garde de dérive : aucun test artificiel ici. Les repositories assignent la
// valeur Prisma dans un champ typé par ces unions (lecture) et ces unions
// dans `data` (écriture) ; si le schéma Prisma gagne ou perd une valeur,
// `tsc` échoue de lui-même dans `src/server/repositories/`.

export const TYPES_COMPTE = [
  "CHEQUE",
  "EPARGNE",
  "CREDIT",
  "MARGE",
  "PRET",
  "PLACEMENT",
  "ACTIF",
  "PASSIF",
  "AUTRE",
] as const;
export type TypeCompte = (typeof TYPES_COMPTE)[number];

export const REGIMES_FISCAUX = ["NON_ENREGISTRE", "REER", "CELI", "CELIAPP", "REEE", "CRI", "FERR"] as const;
export type RegimeFiscal = (typeof REGIMES_FISCAUX)[number];

export const MODES_BUDGET = ["PAR_SOUS_CATEGORIE", "PAR_CATEGORIE"] as const;
export type ModeBudget = (typeof MODES_BUDGET)[number];

export const MODES_REPORT = ["AUCUN", "SIGNE", "POSITIF_SEULEMENT"] as const;
export type ModeReport = (typeof MODES_REPORT)[number];

export const MODES_CORRESPONDANCE = ["CONTIENT", "MOT_ENTIER", "REGEX", "EXACT"] as const;
export type ModeCorrespondance = (typeof MODES_CORRESPONDANCE)[number];

export const SOURCES_INGESTION = ["COPIER_COLLER", "FICHIER", "AGREGATEUR", "MANUELLE", "AJUSTEMENT"] as const;
export type SourceIngestion = (typeof SOURCES_INGESTION)[number];

export const ETATS_TRANSACTION = ["EN_ATTENTE", "COMPTABILISEE"] as const;
export type EtatTransaction = (typeof ETATS_TRANSACTION)[number];

export const ETATS_RAPPROCHEMENT = ["NON_RAPPROCHEE", "RAPPROCHEE", "RECONCILIEE"] as const;
export type EtatRapprochement = (typeof ETATS_RAPPROCHEMENT)[number];

export const NATURES_RECURRENCE = ["FIXE", "VARIABLE"] as const;
export type NatureRecurrence = (typeof NATURES_RECURRENCE)[number];

export const ETATS_OCCURRENCE = ["PREVUE", "REALISEE", "REALISEE_MONTANT_DIFFERENT", "MANQUEE", "IGNOREE"] as const;
export type EtatOccurrence = (typeof ETATS_OCCURRENCE)[number];

export const TYPES_LIAISON = ["AUTO", "MANUELLE", "RETROACTIVE"] as const;
export type TypeLiaison = (typeof TYPES_LIAISON)[number];

export const ETATS_SUGGESTION = ["EN_ATTENTE", "ACCEPTEE", "REFUSEE"] as const;
export type EtatSuggestion = (typeof ETATS_SUGGESTION)[number];

export const SOURCES_SOLDE = ["MANUEL", "RELEVE", "AGREGATEUR"] as const;
export type SourceSolde = (typeof SOURCES_SOLDE)[number];

export const LIBELLES_SOURCE_SOLDE: Record<SourceSolde, string> = {
  MANUEL: "Saisie manuelle",
  RELEVE: "Relevé",
  AGREGATEUR: "Agrégateur",
};

export const LIBELLES_SOURCE_INGESTION: Record<SourceIngestion, string> = {
  COPIER_COLLER: "Copier-coller",
  FICHIER: "Fichier",
  AGREGATEUR: "Agrégateur",
  MANUELLE: "Saisie manuelle",
  AJUSTEMENT: "Ajustement",
};

export const LIBELLES_ETAT_TRANSACTION: Record<EtatTransaction, string> = {
  EN_ATTENTE: "En attente",
  COMPTABILISEE: "Comptabilisée",
};

export const LIBELLES_ETAT_RAPPROCHEMENT: Record<EtatRapprochement, string> = {
  NON_RAPPROCHEE: "Non rapprochée",
  RAPPROCHEE: "Rapprochée",
  RECONCILIEE: "Réconciliée",
};

export const LIBELLES_ETAT_OCCURRENCE: Record<EtatOccurrence, string> = {
  PREVUE: "Prévue",
  REALISEE: "Payée",
  REALISEE_MONTANT_DIFFERENT: "Payée, montant différent",
  MANQUEE: "Manquée",
  IGNOREE: "Ignorée",
};

export const LIBELLES_TYPE_LIAISON: Record<TypeLiaison, string> = {
  AUTO: "automatique à l'import",
  MANUELLE: "à la main",
  RETROACTIVE: "à la confirmation",
};

export const LIBELLES_NATURE_RECURRENCE: Record<NatureRecurrence, string> = { FIXE: "Fixe", VARIABLE: "Variable" };

export const LIBELLES_TYPE_COMPTE: Record<TypeCompte, string> = {
  CHEQUE: "Compte chèque",
  EPARGNE: "Épargne",
  CREDIT: "Carte de crédit",
  MARGE: "Marge de crédit",
  PRET: "Prêt",
  PLACEMENT: "Placement",
  ACTIF: "Actif",
  PASSIF: "Passif",
  AUTRE: "Autre",
};

export const LIBELLES_REGIME_FISCAL: Record<RegimeFiscal, string> = {
  NON_ENREGISTRE: "Non enregistré",
  REER: "REER",
  CELI: "CELI",
  CELIAPP: "CELIAPP",
  REEE: "REEE",
  CRI: "CRI",
  FERR: "FERR",
};

export const LIBELLES_MODE_BUDGET: Record<ModeBudget, string> = {
  PAR_SOUS_CATEGORIE: "Par sous-catégorie",
  PAR_CATEGORIE: "Par catégorie",
};

export const LIBELLES_MODE_REPORT: Record<ModeReport, string> = {
  AUCUN: "Aucun report",
  SIGNE: "Report signé",
  POSITIF_SEULEMENT: "Report positif seulement",
};

export const LIBELLES_MODE_CORRESPONDANCE: Record<ModeCorrespondance, string> = {
  CONTIENT: "Contient",
  MOT_ENTIER: "Mot entier",
  REGEX: "Expression régulière",
  EXACT: "Exact",
};
