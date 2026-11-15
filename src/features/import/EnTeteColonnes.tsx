// L'en-tête de colonnes partagé par les trois sections de la revue (docs/lot-m2.md §10.2 point 5) : une seule
// définition de colonnes, donc des pistes identiques à celles des lignes.

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { COLONNES_A_IMPORTER, GRILLE_A_IMPORTER, RETRAIT_EN_TETE_CARTES } from "./colonnes-a-importer";

export interface EnTeteColonnesProps {
  /** true quand les lignes sont rendues dans des cartes (Doublons, Filtrées) : l'en-tête prend le retrait de CardContent. */
  readonly dansDesCartes: boolean;
}

export function EnTeteColonnes(props: EnTeteColonnesProps): ReactNode {
  return (
    <div
      data-entete-colonnes=""
      className={cn(
        "text-muted-foreground hidden text-xs font-medium md:grid",
        GRILLE_A_IMPORTER,
        props.dansDesCartes && RETRAIT_EN_TETE_CARTES,
      )}
    >
      {COLONNES_A_IMPORTER.map((colonne) => (
        <span key={colonne.cle} data-entete-colonne={colonne.cle}>
          {colonne.libelle}
        </span>
      ))}
    </div>
  );
}
