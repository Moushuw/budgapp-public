"use client";

// Section 1 — docs/lot-m1.md §8.2. Tableau md: et cartes empilées en
// dessous : la déclinaison mobile est pensée, pas un défilement horizontal
// subi (CLAUDE.md §10). Patron copié de
// src/components/referentiel/EcranReferentiel.tsx lignes 174-250.

import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { EnTeteColonnes } from "./EnTeteColonnes";
import type { LigneRevueEditee } from "./etat-revue";
import { messageAImporterVide } from "./libelles-revue";
import { LigneAImporter } from "./LigneAImporter";

export interface TableauAImporterProps {
  readonly lignes: readonly LigneRevueEditee[];
  readonly onChange: (cle: string, patch: Partial<LigneRevueEditee>) => void;
  readonly erreursVirement: ReadonlyMap<string, string>;
  readonly erreursOccurrence: ReadonlyMap<string, string>;
  /** Lignes réintégrées d'autres sections, qui seront importées bien que cette section soit vide. */
  readonly nbReintegreesAilleurs: number;
}

export function TableauAImporter(props: TableauAImporterProps): ReactNode {
  const { lignes, onChange, erreursVirement, erreursOccurrence } = props;

  if (lignes.length === 0) {
    return <p className="text-muted-foreground text-sm">{messageAImporterVide(props.nbReintegreesAilleurs)}</p>;
  }

  return (
    <>
      <div data-tableau-revue="" className="hidden flex-col gap-1 md:flex">
        <EnTeteColonnes dansDesCartes={false} />
        <div className="flex flex-col divide-y">
          {lignes.map((ligne) => (
            <div key={ligne.base.cle} className="py-2">
              <LigneAImporter
                ligne={ligne}
                onChange={onChange}
                erreurVirement={erreursVirement.get(ligne.base.cle) ?? null}
                erreurOccurrence={erreursOccurrence.get(ligne.base.cle) ?? null}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-3 md:hidden">
        {lignes.map((ligne) => (
          <Card key={ligne.base.cle}>
            <CardContent>
              <LigneAImporter
                ligne={ligne}
                onChange={onChange}
                erreurVirement={erreursVirement.get(ligne.base.cle) ?? null}
                erreurOccurrence={erreursOccurrence.get(ligne.base.cle) ?? null}
              />
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}
