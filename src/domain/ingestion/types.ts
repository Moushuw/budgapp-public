// Contrat du pipeline d'ingestion — docs/lot-m1.md §6.1 et §6.2, avec les
// extensions consignées au journal d'INDEX.md (2026-09-19).

import type { DateCivile } from "../dates";
import type { Cents } from "../money";
// ModeCorrespondance est déjà déclaré une fois, dans domain/referentiel.ts :
// on l'importe, on ne le redéclare pas (la dérive que le journal du
// 2026-09-14 cherche justement à éviter).
import type { ModeCorrespondance } from "../referentiel";
import type { ConflitRegles, RegleCategorisation, RegleInapplicable } from "../categorization";
import type { CandidatVirement } from "../virement";
import type { CandidatOccurrence, OccurrenceCandidate } from "../recurrence";

/** L'objet commun aux trois adaptateurs — docs/modele-ingestion-recurrences.md §1. */
export interface RawEntry {
  /** Identifiant local, posé par l'adaptateur. Jamais en base, jamais un cuid. */
  readonly cle: string;
  readonly date: DateCivile;
  /** Description du marchand, sans le type d'opération (docs/lot-m1.md §5.8). */
  readonly description: string;
  /** Type d'opération séparé par le profil ; null sans séparateur ou pour une saisie manuelle. Persisté depuis M2 (`docs/lot-m2.md` §3.1), hors empreinte, règles et dédoublonnage. */
  readonly typeOperation: string | null;
  readonly montantCents: Cents;
  readonly accountId: string;
  /** Identifiant stable de la source. Toujours null en M1 (aucune source n'en fournit). */
  readonly externalId: string | null;
  /** Ligne du relevé d'origine, conservée pour le débogage et l'affichage. */
  readonly ligneBrute: string | null;
  /** 1-based, ligne du texte collé. null pour une saisie manuelle. */
  readonly numeroLigne: number | null;
}

export interface FiltreIngestion {
  readonly id: string;
  readonly motif: string;
  readonly mode: ModeCorrespondance;
}

export interface BeneficiaireIngestion {
  readonly id: string;
  readonly nom: string;
  readonly nomNormalise: string;
  readonly sousCategorieParDefautId: string | null;
  readonly autoCategorisation: boolean;
  readonly categorieVerrouillee: boolean;
}

/** Ce que le repository ramène pour comparer — jamais une entité Prisma. */
export interface TransactionExistante {
  readonly id: string;
  readonly accountId: string;
  readonly date: DateCivile;
  readonly description: string;
  readonly descriptionNormalisee: string;
  readonly montantCents: Cents;
  readonly empreinte: string;
  readonly externalId: string | null;
  /** Non null ⇔ la transaction existante est un côté de virement ; compteNom : le compte de l'autre côté ("un autre compte" si introuvable). */
  readonly virement: { readonly compteNom: string } | null;
}

/** Ce que la revue montre « en regard » d'un doublon — docs/lot-m1.md §6.1. */
export interface ReferenceTransaction {
  readonly id: string;
  readonly date: DateCivile;
  readonly description: string;
  readonly montantCents: Cents;
  readonly empreinte: string;
  readonly virement: { readonly compteNom: string } | null;
}

export type StatutDoublon =
  | "AUCUN"
  | "EXTERNAL_ID_EXISTANT"
  | "EMPREINTE_EXISTANTE"
  | "VIREMENT_EXISTANT"
  | "QUASI_DOUBLON";

export type ActionLigne = "IMPORTER" | "IGNORER" | "METTRE_A_JOUR";

export type SectionRevue = "A_IMPORTER" | "DOUBLONS" | "FILTREES";

/** Un filtre qu'on n'a pas pu évaluer (REGEX invalide) : signalé, jamais avalé. */
export interface FiltreInapplicable {
  readonly filtreId: string;
  readonly motif: string;
  readonly detail: string;
}

export interface LigneVentilationProposee {
  readonly subcategoryId: string;
  readonly montantCents: Cents;
}

/** Ce que la revue a vidé parce que la ligne est pré-remplie en virement : jamais restauré (docs/lot-m2.md §4.5). */
export interface CategorisationRetiree {
  readonly subcategoryId: string | null;
  readonly ventilation: readonly LigneVentilationProposee[] | null;
  readonly regleAppliqueeId: string | null;
}

export interface LigneEnRevue {
  readonly cle: string;
  readonly date: DateCivile;
  readonly description: string;
  /** Affiché en lecture seule dans la revue. Persisté depuis M2 (`docs/lot-m2.md` §3.1), hors empreinte, règles et dédoublonnage. */
  readonly typeOperation: string | null;
  readonly descriptionNormalisee: string;
  readonly montantCents: Cents;
  readonly accountId: string;
  readonly externalId: string | null;
  readonly ligneBrute: string | null;
  readonly numeroLigne: number | null;

  readonly payeeId: string | null;
  /** Nom posé par RENOMMER_BENEFICIAIRE sans Payee correspondant : à créer à l'enregistrement. */
  readonly payeeNouveauNom: string | null;
  readonly subcategoryId: string | null;
  /** Posée par une règle VENTILER (docs/lot-m2.md §4.3) : montants de repartirParPourMille ; subcategoryId est alors null. */
  readonly ventilation: readonly LigneVentilationProposee[] | null;
  readonly tagIds: readonly string[];
  readonly note: string | null;
  readonly exclureDuBudget: boolean;
  readonly exclureDesRapports: boolean;
  readonly aRevoir: boolean;

  readonly empreinte: string;
  readonly statutDoublon: StatutDoublon;
  readonly doublonDe: ReferenceTransaction | null;

  readonly regleAppliqueeId: string | null;
  /** Identifiants distincts des règles en concurrence, vide sauf conflit à priorité égale. */
  readonly reglesEnConflit: readonly string[];
  /** Le détail de §3.2 : quel créneau, quelle priorité, ce que chaque règle aurait posé. */
  readonly conflits: readonly ConflitRegles[];
  /** Non nul = écartée par ce filtre. Le fait reste, même après réintégration. */
  readonly filtreId: string | null;

  /** Lecture seule : candidatsVirement(ligne, contexte.transactionsAutresComptes). */
  readonly candidatsVirement: readonly CandidatVirement[];
  /** Modifiable dans la revue ; pré-rempli quand il y a exactement un candidat. */
  readonly virementAvec: string | null;
  /** Non nul seulement si virementAvec est pré-rempli et que la catégorisation proposait une sous-catégorie ou une ventilation. */
  readonly categorisationRetiree: CategorisationRetiree | null;

  /** Lecture seule : evaluerRapprochement(ligne, contexte.occurrencesOuvertes).candidats, calculés pour toute ligne (docs/lot-m3.md §4.5). */
  readonly candidatsOccurrence: readonly CandidatOccurrence<OccurrenceCandidate>[];
  /** Modifiable ; pré-rempli seulement si le verdict est AUTO et l'action initiale IMPORTER. */
  readonly occurrenceAvec: string | null;
  /** true ⇔ subcategoryId est celle de la règle récurrente (docs/lot-m3.md §3.6) ; regleAppliqueeId est alors null. */
  readonly categorieHeritee: boolean;

  readonly action: ActionLigne;
  /** Stable : ne change pas quand l'utilisateur bascule `action`. */
  readonly section: SectionRevue;
}

export interface ContexteIngestion {
  readonly filtres: readonly FiltreIngestion[];
  readonly beneficiaires: readonly BeneficiaireIngestion[];
  readonly regles: readonly RegleCategorisation[];
  /** Bornées au compte et à la fenêtre du relevé ± 3 jours par le repository. */
  readonly existantes: readonly TransactionExistante[];
  /** Autres comptes du propriétaire, fenêtre du relevé ± FENETRE_VIREMENT_JOURS, bornés par le repository. */
  readonly transactionsAutresComptes: readonly CandidatVirement[];
  /** Occurrences ouvertes des séries actives du compte importé, fenêtre du relevé élargie par règle, bornées par le repository. */
  readonly occurrencesOuvertes: readonly OccurrenceCandidate[];
}

export interface ResultatPreparation {
  readonly lignes: readonly LigneEnRevue[];
  /** Règles dont la configuration empêche l'évaluation — remontées une fois, pas par ligne. */
  readonly reglesInapplicables: readonly RegleInapplicable[];
  readonly filtresInapplicables: readonly FiltreInapplicable[];
}

export const TOLERANCE_QUASI_DOUBLON_JOURS = 3;

/** docs/lot-m2.md §4.5. */
export const TOLERANCE_VIREMENT_EXISTANT_JOURS = 3;
