import type { Cadence, DateCivile } from "@/domain/dates";
import type { Cents } from "@/domain/money";

export type ModeReport = "AUCUN" | "SIGNE" | "POSITIF_SEULEMENT";
export type ModeCible = "RECOMPLETER" | "ACCUMULER";

/** Ce que porte `Target` — docs/lot-m0-revision.md §3.2, `modele-budget-prevision.md` §2.4. */
export interface Cible {
  montantCents: Cents;
  cadence: Cadence;
  mode: ModeCible;
  /** Ancrage de la cadence (jour d'échéance de référence). */
  dateDebut: DateCivile;
  /** Échéance d'une cible PONCTUEL — sans objet pour les cadences répétitives. */
  dateCible?: DateCivile | null;
}
