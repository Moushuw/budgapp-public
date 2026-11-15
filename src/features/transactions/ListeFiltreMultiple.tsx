"use client";

// Multi-sélection d'un filtre : une liste en place de Switch, sans popover (un
// popover dans un Sheet se superpose mal). Patron de SelecteurEtiquettes.tsx.
// Chaque option est un Switch étiqueté par un Label : son nom accessible est
// le nom de l'option.

import { useId, type ReactNode } from "react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export interface OptionFiltre {
  readonly id: string;
  readonly libelle: string;
}

export interface GroupeOptionsFiltre {
  readonly titre: string | null;
  readonly options: readonly OptionFiltre[];
}

export interface ListeFiltreMultipleProps {
  readonly legende: string;
  readonly groupes: readonly GroupeOptionsFiltre[];
  readonly valeurs: readonly string[];
  readonly onChange: (valeurs: readonly string[]) => void;
  readonly messageVide: string;
}

export function ListeFiltreMultiple(props: ListeFiltreMultipleProps): ReactNode {
  const { legende, groupes, valeurs, onChange, messageVide } = props;
  const prefixe = useId();
  const cochees = new Set(valeurs);
  const aucune = groupes.every((groupe) => groupe.options.length === 0);

  function basculer(id: string, coche: boolean): void {
    onChange(coche ? [...new Set([...valeurs, id])] : valeurs.filter((valeur) => valeur !== id));
  }

  return (
    <fieldset className="flex min-w-0 flex-col gap-2">
      <legend className="mb-1 text-sm font-medium">{legende}</legend>
      <div className="flex max-h-48 flex-col gap-2 overflow-x-hidden overflow-y-auto rounded-lg border p-3">
        {aucune && <p className="text-muted-foreground text-sm">{messageVide}</p>}
        {groupes.map((groupe) => (
          <div key={groupe.titre ?? "sans-titre"} className="flex flex-col gap-2">
            {groupe.titre !== null && groupe.options.length > 0 && (
              <p className="text-muted-foreground text-xs font-medium">{groupe.titre}</p>
            )}
            {groupe.options.map((option) => {
              const idChamp = `${prefixe}-${option.id}`;
              return (
                <div key={option.id} className="flex items-center justify-between gap-4">
                  <Label htmlFor={idChamp} className="min-w-0 break-words">
                    {option.libelle}
                  </Label>
                  <Switch
                    id={idChamp}
                    checked={cochees.has(option.id)}
                    onCheckedChange={(coche) => {
                      basculer(option.id, coche);
                    }}
                  />
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </fieldset>
  );
}
