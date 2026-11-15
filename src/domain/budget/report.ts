import type { Cents } from "@/domain/money";
import type { ModeReport } from "./types";

/**
 * report(s, m) — modele-budget-prevision.md §2.2.
 *
 *   = 0                          si AUCUN
 *   = disponible(s, m-1)         si SIGNE
 *   = max(0, disponible(s, m-1)) si POSITIF_SEULEMENT
 *
 * Signé par défaut : un dépassement se propage au disponible du mois
 * suivant (decision-modele-budget.md §3, décision 2), jamais aux rapports.
 */
export function report(disponiblePrecedent: Cents, mode: ModeReport): Cents {
  switch (mode) {
    case "AUCUN":
      return 0;
    case "SIGNE":
      return disponiblePrecedent;
    case "POSITIF_SEULEMENT":
      return Math.max(0, disponiblePrecedent);
  }
}
