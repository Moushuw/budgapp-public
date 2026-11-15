// Contrat du parser de relevés — docs/lot-m1.md §5.3, recopié sans dérive
// (forme `interface` pour les types-objets, seule adaptation : convention du
// dépôt, voir src/domain/budget/types.ts).

import type { Cents } from "../money";
import type { DateCivile } from "../dates";

export type RegleSigne =
  | "PLUS_EXPLICITE" // seul un « + » marque une entrée ; tout le reste sort
  | "MOINS_EXPLICITE"; // seul un « − » marque une sortie ; tout le reste entre

export interface NettoyageProfil {
  /** Toujours vrai pour Desjardins — docs/lot-m1.md §5.1. */
  readonly tabulationsEnSautsDeLigne: boolean;
  /** Tronque la ligne à partir de ce motif (ex. la colonne « Total »). */
  readonly tronquerApres?: RegExp;
}

export interface OperationProfil {
  /** Sépare le type d'opération du marchand ; la première correspondance compte. Jamais de drapeau g ni y. */
  readonly separateur: RegExp;
}

export interface ControleTotalProfil {
  /** Repère une ligne de total dans le texte collé ; le montant est lu dans ce qui suit la correspondance. Jamais de drapeau g ni y. */
  readonly motif: RegExp;
}

export interface ProfilImport {
  readonly id: string;
  readonly libelle: string;
  readonly institution: string;
  readonly nettoyage: NettoyageProfil;
  readonly date: {
    /** Jour en groupe 1, nom du mois en groupe 2. Année en groupe 3 si `anneeDansLaLigne`. */
    readonly motif: RegExp;
    /** Les douze noms de mois, dans l'ordre, tels qu'ils apparaissent. */
    readonly mois: readonly string[];
    /** Faux quand le relevé n'écrit que le jour et le mois (cas Desjardins). */
    readonly anneeDansLaLigne: boolean;
  };
  readonly montant: {
    readonly motif: RegExp;
    readonly separateurDecimal: "," | ".";
  };
  readonly regleSigne: RegleSigne;
  /** docs/lot-m1.md §5.8. Absent : aucune séparation. */
  readonly operation?: OperationProfil;
  /** docs/lot-m1.md §5.9. Absent : aucun contrôle du total. */
  readonly controleTotal?: ControleTotalProfil;
}

/** Fragment de texte prêt à être analysé, produit par `decouperEtNettoyer`. */
export interface FragmentSource {
  /** 1-based, ligne du texte COLLÉ — avant conversion des tabulations. */
  readonly numeroLigne: number;
  /** Fragment nettoyé et trimé ; jamais vide. */
  readonly texte: string;
}

export interface LigneReconnue {
  readonly numeroLigne: number;
  readonly ligneBrute: string;
  readonly date: DateCivile;
  /** Type d'opération séparé par le profil (§5.8) ; null sans séparateur. */
  readonly typeOperation: string | null;
  /** Description du marchand, sans le type d'opération. */
  readonly description: string;
  readonly montantCents: Cents;
}

export interface ControleTotal {
  /** 1-based, ligne du texte collé qui porte le total. */
  readonly numeroLigne: number;
  readonly totalReleveCents: Cents;
  readonly sommeReconnuesCents: Cents;
  /** sommeReconnuesCents − totalReleveCents ; 0 = le relevé concorde. */
  readonly ecartCents: Cents;
}

export type RaisonRejet = "AUCUNE_DATE" | "AUCUN_MONTANT" | "MOIS_INCONNU" | "MONTANT_ILLISIBLE";

export interface LigneRejetee {
  readonly numeroLigne: number;
  readonly ligneBrute: string;
  readonly raison: RaisonRejet;
}

export interface ResultatAnalyse {
  readonly reconnues: LigneReconnue[];
  readonly rejetees: LigneRejetee[];
}
