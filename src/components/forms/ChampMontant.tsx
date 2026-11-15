"use client";

// Champ de saisie d'un montant — spec M1 tranche 1 §6.2. Réutilisé par
// comptes, cibles, règles. Émet la chaîne saisie telle quelle : ce n'est plus
// ce composant qui décide qu'un texte est illisible, c'est le schéma zod du
// formulaire (voir features/etiquettes/schema.ts) — sinon un champ vide et
// une saisie illisible produisent tous deux `null`, indistinguables pour
// l'utilisateur comme pour zod.

import type { ReactNode } from "react";
import { formatMontant, parseMontant } from "@/domain/money";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface ChampMontantProps {
  readonly value: string;
  readonly onChange: (texte: string) => void;
  readonly onBlur?: () => void;
  readonly id?: string;
  readonly placeholder?: string;
  readonly disabled?: boolean;
  readonly "aria-describedby"?: string;
  readonly "aria-invalid"?: boolean | "true" | "false";
}

export function ChampMontant(props: ChampMontantProps): ReactNode {
  const {
    value,
    onChange,
    onBlur,
    id,
    placeholder,
    disabled,
    "aria-describedby": ariaDescribedBy,
    "aria-invalid": ariaInvalid,
  } = props;

  return (
    <Input
      id={id}
      className={cn("font-montant")}
      inputMode="decimal"
      placeholder={placeholder}
      disabled={disabled}
      aria-describedby={ariaDescribedBy}
      aria-invalid={ariaInvalid}
      value={value}
      onChange={(evenement) => { onChange(evenement.target.value); }}
      onBlur={() => {
        // Reformate seulement ce qui est lisible ; une saisie illisible reste
        // affichée telle quelle, pour que l'erreur du schéma pointe sur ce
        // que l'utilisateur voit encore à l'écran.
        const lisible = value.trim() === "" ? null : parseMontant(value);
        if (lisible !== null) {
          onChange(formatMontant(lisible, "CENTS"));
        }
        onBlur?.();
      }}
    />
  );
}
