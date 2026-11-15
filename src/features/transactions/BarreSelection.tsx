"use client";

import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LIMITE_BALAYAGE, type GesteMasse } from "@/domain/edition";
import { libelleSelection } from "./presentation";
import { nombreSelectionne, type EtatSelection } from "./selection";

export type GesteAvecDialogue = "SOUS_CATEGORIE" | "BENEFICIAIRE" | "ETIQUETTES";

export interface BarreSelectionProps {
  readonly selection: EtatSelection;
  /** Nombre de transactions du résultat filtré, ou null tant que les totaux ne sont pas là. */
  readonly total: number | null;
  readonly onToutSelectionner: () => void;
  readonly onAnnuler: () => void;
  readonly onOuvrirDialogue: (geste: GesteAvecDialogue) => void;
  readonly onGesteDirect: (geste: GesteMasse) => void;
  readonly onSupprimer: () => void;
  readonly enCours: boolean;
}

const GESTES_DIRECTS: readonly { readonly libelle: string; readonly geste: GesteMasse }[] = [
  { libelle: "Marquer à revoir", geste: { type: "A_REVOIR", valeur: true } },
  { libelle: "Retirer « à revoir »", geste: { type: "A_REVOIR", valeur: false } },
  { libelle: "Exclure du budget", geste: { type: "EXCLURE_BUDGET", valeur: true } },
  { libelle: "Réintégrer au budget", geste: { type: "EXCLURE_BUDGET", valeur: false } },
  { libelle: "Exclure des rapports", geste: { type: "EXCLURE_RAPPORTS", valeur: true } },
  { libelle: "Réintégrer aux rapports", geste: { type: "EXCLURE_RAPPORTS", valeur: false } },
];

export function BarreSelection(props: BarreSelectionProps): ReactNode {
  const { selection, total, onToutSelectionner, onAnnuler, onOuvrirDialogue, onGesteDirect, onSupprimer, enCours } = props;
  const nombre = nombreSelectionne(selection, total);
  const vide = selection.mode === "AUCUNE";
  const tropGrand = selection.mode === "FILTRE" && (total ?? 0) > LIMITE_BALAYAGE;
  const peutToutSelectionner = selection.mode !== "FILTRE" && total !== null && total > nombre;

  return (
    <div role="region" aria-label="Sélection" className="bg-muted/50 flex flex-wrap items-center gap-2 rounded-lg border p-3">
      <p className="text-sm font-medium" data-selection>
        {libelleSelection(selection, total)}
      </p>
      {peutToutSelectionner && (
        <Button type="button" variant="outline" size="sm" onClick={onToutSelectionner}>
          {`Tout sélectionner (${String(total)})`}
        </Button>
      )}
      {!vide && (
        <Button type="button" variant="ghost" size="sm" onClick={onAnnuler}>
          Annuler la sélection
        </Button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" size="sm" disabled={vide || tropGrand || enCours}>
            Modifier la sélection
            <ChevronDown />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem
            onSelect={() => {
              onOuvrirDialogue("SOUS_CATEGORIE");
            }}
          >
            Poser une sous-catégorie…
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              onOuvrirDialogue("BENEFICIAIRE");
            }}
          >
            Poser un bénéficiaire…
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              onOuvrirDialogue("ETIQUETTES");
            }}
          >
            Ajouter ou retirer des étiquettes…
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {GESTES_DIRECTS.map(({ libelle, geste }) => (
            <DropdownMenuItem
              key={libelle}
              onSelect={() => {
                onGesteDirect(geste);
              }}
            >
              {libelle}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={onSupprimer}>
            Supprimer…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {tropGrand && (
        <p className="text-muted-foreground w-full text-sm">
          Au-delà de {String(LIMITE_BALAYAGE)} transactions, une modification en masse est refusée : resserre les filtres.
        </p>
      )}
    </div>
  );
}
