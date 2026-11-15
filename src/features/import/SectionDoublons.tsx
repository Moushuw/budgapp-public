"use client";

// Section 2 — docs/lot-m1.md §8.2 : la ligne et la transaction existante
// en regard (doublonDe), le statut, une bascule importer / ignorer
// (METTRE_A_JOUR pour la couche 1).

import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatMontant } from "@/domain/money";
import type { StatutDoublon } from "@/domain/ingestion";
import { EnTeteColonnes } from "./EnTeteColonnes";
import { libelleReferenceDoublon, type LigneRevueEditee } from "./etat-revue";
import { LigneAImporter } from "./LigneAImporter";

export interface SectionDoublonsProps {
  readonly lignes: readonly LigneRevueEditee[];
  readonly onChange: (cle: string, patch: Partial<LigneRevueEditee>) => void;
  readonly erreursVirement: ReadonlyMap<string, string>;
  readonly erreursOccurrence: ReadonlyMap<string, string>;
}

const LIBELLES_STATUT: Record<StatutDoublon, string> = {
  AUCUN: "—",
  EXTERNAL_ID_EXISTANT: "Identifiant déjà connu — sera mis à jour",
  EMPREINTE_EXISTANTE: "Déjà en base (empreinte identique)",
  VIREMENT_EXISTANT: "Déjà enregistrée comme virement",
  QUASI_DOUBLON: "Ressemble à une transaction proche en date",
};

function optionsAction(statut: StatutDoublon): readonly { readonly valeur: LigneRevueEditee["action"]; readonly libelle: string }[] {
  if (statut === "EXTERNAL_ID_EXISTANT") {
    return [
      { valeur: "METTRE_A_JOUR", libelle: "Mettre à jour" },
      { valeur: "IGNORER", libelle: "Ignorer" },
    ];
  }
  return [
    { valeur: "IMPORTER", libelle: "Importer" },
    { valeur: "IGNORER", libelle: "Ignorer" },
  ];
}

function LigneDoublon({
  ligne,
  onChange,
  erreurVirement,
  erreurOccurrence,
}: {
  readonly ligne: LigneRevueEditee;
  readonly onChange: SectionDoublonsProps["onChange"];
  readonly erreurVirement: string | null;
  readonly erreurOccurrence: string | null;
}): ReactNode {
  const reference = ligne.base.doublonDe;
  const libelleReference = libelleReferenceDoublon(ligne);

  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-muted-foreground text-sm">{LIBELLES_STATUT[ligne.base.statutDoublon]}</span>
          <Select
            value={ligne.action}
            onValueChange={(valeur) => { onChange(ligne.base.cle, { action: valeur as LigneRevueEditee["action"] }); }}
          >
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {optionsAction(ligne.base.statutDoublon).map((option) => (
                <SelectItem key={option.valeur} value={option.valeur}>
                  {option.libelle}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {reference !== null && (
          <div className="bg-muted/50 flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm">
            <span>{libelleReference}</span>
            <span className="font-montant">{formatMontant(reference.montantCents, "CENTS")}</span>
          </div>
        )}

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

export function SectionDoublons(props: SectionDoublonsProps): ReactNode {
  const { lignes, onChange, erreursVirement, erreursOccurrence } = props;

  if (lignes.length === 0) {
    return <p className="text-muted-foreground text-sm">Aucun doublon détecté.</p>;
  }

  return (
    <div data-tableau-revue="" className="flex flex-col gap-3">
      <EnTeteColonnes dansDesCartes />
      {lignes.map((ligne) => (
        <LigneDoublon
          key={ligne.base.cle}
          ligne={ligne}
          onChange={onChange}
          erreurVirement={erreursVirement.get(ligne.base.cle) ?? null}
          erreurOccurrence={erreursOccurrence.get(ligne.base.cle) ?? null}
        />
      ))}
    </div>
  );
}
