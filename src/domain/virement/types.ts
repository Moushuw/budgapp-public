// Liaison en virement — docs/lot-m2.md §3.5 et §4.4.

import type { DateCivile } from "../dates";
import type { Cents } from "../money";

/** docs/lot-m2.md §4.4 — inclus : un écart de 5 jours est dans la fenêtre, 6 n'y est pas. */
export const FENETRE_VIREMENT_JOURS = 5;

/** Ce que le domaine sait d'une transaction pour la lier en virement. id null : ligne de relevé pas encore enregistrée. */
export interface CoteVirement {
  readonly id: string | null;
  readonly accountId: string;
  readonly date: DateCivile;
  readonly montantCents: Cents;
  readonly parentId: string | null;
  readonly estVentilee: boolean;
  readonly transferTransactionId: string | null;
}

/** Une transaction enregistrée, telle que la revue et le détail l'affichent en clair (compte, date, montant). */
export interface CandidatVirement extends CoteVirement {
  readonly id: string;
  readonly compteNom: string;
  readonly description: string;
  /** Sous-catégorie que la liaison retirerait (docs/lot-m2.md §3.4) ; null si aucune. */
  readonly sousCategorieNom: string | null;
}

export type CoteDeLaPaire = "PREMIERE" | "SECONDE";

export type RefusLiaison =
  | { readonly motif: "MEME_TRANSACTION" }
  | { readonly motif: "LIGNE_FILLE"; readonly cote: CoteDeLaPaire }
  | { readonly motif: "VENTILEE"; readonly cote: CoteDeLaPaire }
  | { readonly motif: "DEJA_LIEE"; readonly cote: CoteDeLaPaire }
  | { readonly motif: "MEME_COMPTE" }
  | { readonly motif: "MONTANT_NUL" }
  | { readonly motif: "MONTANT_NON_OPPOSE"; readonly sommeCents: Cents }
  | { readonly motif: "HORS_FENETRE"; readonly ecartJours: number };
