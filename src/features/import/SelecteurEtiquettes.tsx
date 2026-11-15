"use client";

// Popover + liste de Switch — docs/lot-m1.md §8.2, exactement comme
// LigneCondition.tsx pour COMPTE DANS : aucun composant de multi-sélection
// n'existe dans le projet et on n'en écrit pas à la main (journal
// INDEX.md 2026-09-18).

import { Tag as TagIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { useEtiquettes } from "@/features/etiquettes/use-etiquettes";

export interface SelecteurEtiquettesProps {
  readonly tagIds: readonly string[];
  readonly onChange: (tagIds: readonly string[]) => void;
}

export function SelecteurEtiquettes(props: SelecteurEtiquettesProps): ReactNode {
  const { tagIds, onChange } = props;
  const { data: etiquettes } = useEtiquettes();
  const cochees = new Set(tagIds);

  function basculer(tagId: string, coche: boolean): void {
    const suivante = coche ? [...new Set([...tagIds, tagId])] : tagIds.filter((id) => id !== tagId);
    onChange(suivante);
  }

  const noms = (etiquettes ?? []).filter((etiquette) => cochees.has(etiquette.id)).map((etiquette) => etiquette.nom);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="justify-start">
          <TagIcon />
          {noms.length === 0 ? "Étiquettes" : noms.join(", ")}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="flex flex-col gap-2">
        {(etiquettes ?? []).map((etiquette) => (
          <div key={etiquette.id} className="flex items-center justify-between gap-4">
            <span className="text-sm">{etiquette.nom}</span>
            <Switch
              checked={cochees.has(etiquette.id)}
              onCheckedChange={(coche) => { basculer(etiquette.id, coche); }}
            />
          </div>
        ))}
        {(etiquettes ?? []).length === 0 && <p className="text-muted-foreground text-sm">Aucune étiquette.</p>}
      </PopoverContent>
    </Popover>
  );
}
