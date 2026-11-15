"use client";

// Section 3 — docs/lot-m1.md §8.2 : le motif responsable, résolu depuis
// analyse.filtres par filtreId, et un bouton « Réintégrer » qui passe
// action à IMPORTER. La ligne reste affichée dans cette section, marquée
// « sera importée ».

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { FiltreIngestion } from "@/domain/ingestion";
import { LIBELLES_MODE_CORRESPONDANCE } from "@/domain/referentiel";
import { EnTeteColonnes } from "./EnTeteColonnes";
import type { LigneRevueEditee } from "./etat-revue";
import { LigneAImporter } from "./LigneAImporter";

export interface SectionFiltreesProps {
  readonly lignes: readonly LigneRevueEditee[];
  readonly filtres: readonly FiltreIngestion[];
  readonly onChange: (cle: string, patch: Partial<LigneRevueEditee>) => void;
  readonly erreursVirement: ReadonlyMap<string, string>;
  readonly erreursOccurrence: ReadonlyMap<string, string>;
}

function motifResponsable(filtreId: string | null, filtres: readonly FiltreIngestion[]): string {
  const filtre = filtres.find((candidat) => candidat.id === filtreId);
  if (filtre === undefined) {
    return "Filtre supprimé depuis l'analyse.";
  }
  return `${LIBELLES_MODE_CORRESPONDANCE[filtre.mode]} « ${filtre.motif} »`;
}

function LigneFiltree({
  ligne,
  filtres,
  onChange,
  erreurVirement,
  erreurOccurrence,
}: {
  readonly ligne: LigneRevueEditee;
  readonly filtres: readonly FiltreIngestion[];
  readonly onChange: SectionFiltreesProps["onChange"];
  readonly erreurVirement: string | null;
  readonly erreurOccurrence: string | null;
}): ReactNode {
  const sera = ligne.action === "IMPORTER";

  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-muted-foreground text-sm">
            Filtre : {motifResponsable(ligne.base.filtreId, filtres)}
            {ligne.base.statutDoublon !== "AUCUN" && " — porte aussi un statut de doublon"}
          </span>
          {sera ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => { onChange(ligne.base.cle, { action: "IGNORER" }); }}
            >
              Sera importée — annuler
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => { onChange(ligne.base.cle, { action: "IMPORTER" }); }}
            >
              Réintégrer
            </Button>
          )}
        </div>

        <LigneAImporter
          ligne={ligne}
          onChange={onChange}
          erreurVirement={erreurVirement}
          erreurOccurrence={erreurOccurrence}
        />
      </CardContent>
    </Card>
  );
}

export function SectionFiltrees(props: SectionFiltreesProps): ReactNode {
  const { lignes, filtres, onChange, erreursVirement, erreursOccurrence } = props;

  if (lignes.length === 0) {
    return <p className="text-muted-foreground text-sm">Aucune ligne filtrée.</p>;
  }

  return (
    <div data-tableau-revue="" className="flex flex-col gap-3">
      <EnTeteColonnes dansDesCartes />
      {lignes.map((ligne) => (
        <LigneFiltree
          key={ligne.base.cle}
          ligne={ligne}
          filtres={filtres}
          onChange={onChange}
          erreurVirement={erreursVirement.get(ligne.base.cle) ?? null}
          erreurOccurrence={erreursOccurrence.get(ligne.base.cle) ?? null}
        />
      ))}
    </div>
  );
}
