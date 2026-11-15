"use client";

// Le récapitulatif de §6.4 — docs/lot-m1.md §8.2 : montré avant d'écrire
// (projection locale, compter) puis après (chiffres du serveur, RecapImport).
// Les libellés chiffrés viennent de libelles-revue.ts (docs/lot-m2.md §10.2 point 6).

import type { ReactNode } from "react";
import type { CompteursRevue } from "./etat-revue";
import { recapitulatifApres, recapitulatifAvant, type LigneRecapitulatif } from "./libelles-revue";
import type { RecapImport } from "@/server/repositories/import-batches";

export interface RecapitulatifAvantProps {
  readonly mode: "AVANT";
  readonly compteurs: CompteursRevue;
}

export interface RecapitulatifApresProps {
  readonly mode: "APRES";
  readonly recap: RecapImport;
}

export type RecapitulatifImportProps = RecapitulatifAvantProps | RecapitulatifApresProps;

export function RecapitulatifImport(props: RecapitulatifImportProps): ReactNode {
  const lignes: readonly LigneRecapitulatif[] =
    props.mode === "AVANT" ? recapitulatifAvant(props.compteurs) : recapitulatifApres(props.recap);

  return (
    <div className="flex flex-col gap-1 rounded-lg border p-3 text-sm">
      {lignes.map((ligne) => (
        <p key={ligne.cle} className={ligne.alerte ? "text-destructive" : undefined}>
          {ligne.texte}
        </p>
      ))}
    </div>
  );
}
