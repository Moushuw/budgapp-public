// Types des écritures sur les transactions — docs/lot-m2.md §6.

import type { FiltresTransactions } from "../consultation";
import type { Cents } from "../money";
import type { Periode } from "../periode";
import type { SourceIngestion } from "../referentiel";

/** Ce qui décide de l'éligibilité d'une transaction à une écriture. */
export interface LigneEligibilite {
  readonly source: SourceIngestion;
  readonly parentId: string | null;
  readonly estVentilee: boolean;
  readonly transferTransactionId: string | null;
  /** Occurrence récurrente, cotisation ou objectif qui la référence. */
  readonly estLiee: boolean;
  /** Une de ses lignes filles porte un tel lien (docs/lot-m2.md §4.2 : ventiler, déventiler et supprimer emportent les filles). */
  readonly filleLiee: boolean;
  /** Une ContributionEntry la référence. */
  readonly porteCotisation: boolean;
  /** Lier une transaction de 0,00 $ en virement est refusé (docs/lot-m2.md §4.4). */
  readonly montantCents: Cents;
}

/** docs/lot-m2.md §4.5 : suppression d'un côté de virement, deux options. */
export const CHOIX_SUPPRESSION_VIREMENT = ["SUPPRIMER_LES_DEUX", "DELIER_L_AUTRE"] as const;
export type ChoixSuppressionVirement = (typeof CHOIX_SUPPRESSION_VIREMENT)[number];

/** Ce que le repository lit de la contrepartie. */
export interface FaitsContrepartie {
  readonly ownerId: string;
  readonly source: SourceIngestion;
  readonly porteCotisation: boolean;
  /** Occurrence, cotisation ou objectif qui la référence (même définition que LigneEligibilite.estLiee). */
  readonly estLiee: boolean;
}

export type ContrepartieEligibilite =
  | { readonly etat: "AUCUNE" } // la transaction n'est pas un côté de virement
  | { readonly etat: "INTROUVABLE" } // pointeur dans le vide, ou contrepartie d'un autre propriétaire
  | {
      readonly etat: "TROUVEE";
      readonly source: SourceIngestion;
      readonly porteCotisation: boolean;
      readonly estLiee: boolean;
    };

export type MotifRefus =
  | "LIGNE_FILLE"
  | "DATE_HORS_MANUELLE"
  | "MONTANT_HORS_MANUELLE"
  | "MONTANT_PARENT_VENTILE"
  | "MONTANT_COTISATION"
  | "MONTANT_CONTREPARTIE_INTROUVABLE"
  | "MONTANT_CONTREPARTIE_HORS_MANUELLE"
  | "SOUS_CATEGORIE_VIREMENT"
  | "SOUS_CATEGORIE_PARENT_VENTILE"
  | "SUPPRESSION_VIREMENT"
  | "SUPPRESSION_LIEE"
  | "SUPPRESSION_FILLE_LIEE"
  | "VENTILATION_VIREMENT"
  | "VENTILATION_FILLE_LIEE"
  | "VENTILATION_MONTANT_NUL"
  | "NON_VENTILEE"
  | "SUPPRESSION_CONTREPARTIE_LIEE"
  | "VIREMENT_DEJA_LIE"
  | "VIREMENT_VENTILEE"
  | "VIREMENT_MONTANT_NUL"
  | "VIREMENT_COTISATION"
  | "NON_VIREMENT";

/** Les seuls motifs qu'un geste de masse peut produire. */
export type MotifRefusMasse = Extract<
  MotifRefus,
  | "LIGNE_FILLE"
  | "SOUS_CATEGORIE_VIREMENT"
  | "SOUS_CATEGORIE_PARENT_VENTILE"
  | "SUPPRESSION_VIREMENT"
  | "SUPPRESSION_LIEE"
  | "SUPPRESSION_FILLE_LIEE"
  | "SUPPRESSION_CONTREPARTIE_LIEE"
  | "VIREMENT_COTISATION"
>;

/** Ce que l'écran affiche avant toute tentative : null = permis. */
export interface RefusEcriture {
  readonly modification: MotifRefus | null; // LIGNE_FILLE seulement
  readonly date: MotifRefus | null;
  readonly montant: MotifRefus | null;
  readonly sousCategorie: MotifRefus | null;
  /** Ce qui interdit toute suppression, quel que soit le choix (fille, liée, fille liée). null pour un côté de virement supprimable. */
  readonly suppression: MotifRefus | null;
  /** Côté de virement seulement (null sinon) : refus de « supprimer les deux ». */
  readonly suppressionLesDeux: MotifRefus | null;
  /** Côté de virement seulement (null sinon) : refus de « supprimer celle-ci et délier l'autre ». */
  readonly suppressionDelier: MotifRefus | null;
  readonly ventilation: MotifRefus | null; // ventiler, ou modifier la ventilation
  readonly deventilation: MotifRefus | null;
  /** Lier en virement, et créer la contrepartie (mêmes conditions). */
  readonly lierVirement: MotifRefus | null;
  readonly delierVirement: MotifRefus | null;
}

/** Changements effectifs (valeur demandée ≠ valeur stockée), calculés par le repository. */
export interface ChangementsDemandes {
  readonly date: boolean;
  readonly montant: boolean;
  /** Vrai seulement si la nouvelle sous-catégorie est non nulle et diffère : retirer une sous-catégorie n'est jamais refusé. */
  readonly sousCategoriePosee: boolean;
  /** Tout autre changement effectif (description, bénéficiaire, note, étiquettes, drapeaux, retrait de sous-catégorie). */
  readonly autres: boolean;
}

export type RaisonIgnoree = "VIREMENT" | "VENTILEE" | "LIGNE_FILLE" | "LIEE" | "CONTREPARTIE_LIEE" | "INTROUVABLE";
export const RAISONS_IGNOREES: readonly RaisonIgnoree[] = [
  "VIREMENT",
  "VENTILEE",
  "LIGNE_FILLE",
  "LIEE",
  "CONTREPARTIE_LIEE",
  "INTROUVABLE",
];
export type CompteIgnorees = Readonly<Record<RaisonIgnoree, number>>;
export const IGNOREES_VIDES: CompteIgnorees = {
  VIREMENT: 0,
  VENTILEE: 0,
  LIGNE_FILLE: 0,
  LIEE: 0,
  CONTREPARTIE_LIEE: 0,
  INTROUVABLE: 0,
};

export type GesteMasse =
  | { readonly type: "SOUS_CATEGORIE"; readonly subcategoryId: string }
  | { readonly type: "BENEFICIAIRE"; readonly payeeId: string }
  | { readonly type: "ETIQUETTES"; readonly ajouter: readonly string[]; readonly retirer: readonly string[] }
  | { readonly type: "A_REVOIR"; readonly valeur: boolean }
  | { readonly type: "EXCLURE_BUDGET"; readonly valeur: boolean }
  | { readonly type: "EXCLURE_RAPPORTS"; readonly valeur: boolean }
  | { readonly type: "SUPPRIMER"; readonly virements: ChoixSuppressionVirement | null };
export type TypeGesteMasse = GesteMasse["type"];

/** La sélection telle que le client la décrit. */
export type SelectionTransactions =
  | { readonly type: "IDS"; readonly ids: readonly string[] }
  | { readonly type: "FILTRE"; readonly filtres: FiltresTransactions; readonly periode: Periode };

export interface LigneMasse extends LigneEligibilite {
  readonly id: string;
  readonly subcategoryId: string | null;
  readonly payeeId: string | null;
  readonly tagIds: readonly string[];
  readonly aRevoir: boolean;
  readonly exclureDuBudget: boolean;
  readonly exclureDesRapports: boolean;
  readonly nbLignesVentilation: number;
  readonly contrepartie: ContrepartieEligibilite;
}

export interface PartitionMasse {
  /** Dans l'ordre des identifiants demandés. */
  readonly aEcrire: readonly string[];
  readonly inchangees: number;
  readonly ignorees: CompteIgnorees;
  /** Parmi aEcrire : parents ventilés, et somme de leurs nbLignesVentilation. */
  readonly parentsVentilesEcrits: number;
  readonly lignesVentilationEcrites: number;
  /** Parmi aEcrire : côtés de virement. */
  readonly cotesVirementEcrits: number;
  /**
   * Contreparties des côtés de virement de aEcrire qui ne sont pas eux-mêmes dans aEcrire, sans doublon, ordre de
   * première rencontre. SUPPRIMER seulement, sinon [].
   */
  readonly contrepartiesAffectees: readonly string[];
  /** Pour chaque id de aEcrire : transferTransactionId tel que lu. L'écriture se garde sur ce pointeur, ligne par ligne. */
  readonly pointeursLus: Readonly<Record<string, string | null>>;
}

export interface CompteRenduMasse {
  readonly geste: TypeGesteMasse;
  readonly traitees: number; // modifiées, ou supprimées pour SUPPRIMER
  readonly inchangees: number;
  readonly ignorees: CompteIgnorees;
  readonly lignesVentilationSupprimees: number; // 0 hors SUPPRIMER
  readonly contrepartiesSupprimees: number; // SUPPRIMER + SUPPRIMER_LES_DEUX ; 0 sinon
  readonly contrepartiesDeliees: number; // SUPPRIMER + DELIER_L_AUTRE ; 0 sinon
}

export interface ApercuSuppression {
  readonly aSupprimer: number;
  readonly parentsVentiles: number;
  readonly lignesVentilation: number;
  readonly ignorees: CompteIgnorees;
  readonly cotesVirement: number;
  readonly contrepartiesSupprimees: number;
  readonly contrepartiesDeliees: number;
}

/** Les trois aperçus d'une même sélection : sans choix (les côtés de virement sont ignorés), et pour chaque choix. */
export interface ApercusSuppression {
  readonly sansChoix: ApercuSuppression;
  readonly lesDeux: ApercuSuppression;
  readonly delier: ApercuSuppression;
}
