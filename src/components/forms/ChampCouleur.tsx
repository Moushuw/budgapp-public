"use client";

// Sélecteur visuel de couleur — pendant de ChampMontant pour une couleur.
// docs/lot-m1.md §4.4 : un sélecteur visuel en plus du champ de code.
// Composant partagé, pas métier : la palette ci-dessous est une donnée (le
// choix offert à l'utilisateur), pas du style — elle ne viole pas
// l'interdiction de couleur en dur dans un composant métier (CLAUDE.md §10).

import { X } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface ChampCouleurProps {
  readonly value: string | null;
  readonly onChange: (couleur: string | null) => void;
  readonly onBlur?: () => void;
  readonly id?: string;
  readonly disabled?: boolean;
  readonly "aria-describedby"?: string;
  readonly "aria-invalid"?: boolean | "true" | "false";
}

export const PALETTE_COULEURS: readonly string[] = [
  "#f59e0b",
  "#fbbf24",
  "#f97316",
  "#dc2626",
  "#16a34a",
  "#0d9488",
  "#0ea5e9",
  "#4f46e5",
  "#9333ea",
  "#db2777",
  "#71717a",
  "#3f3f46",
];

const COULEUR_PAR_DEFAUT_INPUT_NATIF = "#f59e0b";

export function ChampCouleur(props: ChampCouleurProps): ReactNode {
  const {
    value,
    onChange,
    onBlur,
    id,
    disabled,
    "aria-describedby": ariaDescribedBy,
    "aria-invalid": ariaInvalid,
  } = props;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {PALETTE_COULEURS.map((couleur) => {
          const active = value?.toLowerCase() === couleur;
          return (
            <button
              key={couleur}
              type="button"
              aria-pressed={active}
              aria-label={couleur}
              disabled={disabled}
              className={cn(
                "border-border size-6 shrink-0 rounded-full border outline-none",
                "focus-visible:ring-ring/50 focus-visible:ring-3",
                active && "ring-ring ring-2 ring-offset-2",
              )}
              style={{ backgroundColor: couleur }}
              onClick={() => {
                onChange(couleur);
                onBlur?.();
              }}
            />
          );
        })}
      </div>

      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label="Choisir une couleur"
          disabled={disabled}
          className="border-border size-8 shrink-0 cursor-pointer rounded-lg border p-0.5"
          value={value ?? COULEUR_PAR_DEFAUT_INPUT_NATIF}
          onChange={(evenement) => {
            onChange(evenement.target.value.toLowerCase());
          }}
          onBlur={onBlur}
        />

        <Input
          id={id}
          className="font-mono"
          placeholder="#f59e0b"
          disabled={disabled}
          aria-describedby={ariaDescribedBy}
          aria-invalid={ariaInvalid}
          value={value ?? ""}
          onChange={(evenement) => {
            onChange(evenement.target.value === "" ? null : evenement.target.value);
          }}
          onBlur={onBlur}
        />

        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          disabled={disabled === true || value === null}
          aria-label="Retirer la couleur"
          onClick={() => {
            onChange(null);
            onBlur?.();
          }}
        >
          <X />
        </Button>
      </div>
    </div>
  );
}
