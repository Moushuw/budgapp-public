"use client";

// Détient l'état, enchaîne formulaire → revue → récapitulatif —
// docs/lot-m1.md §8.2. Le seul composant qui importe use-import-mutations.

import type { ReactNode } from "react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { LigneEnRevue } from "@/domain/ingestion";
import type { ResultatAnalyse } from "@/server/actions/import";
import type { RecapImport } from "@/server/repositories/import-batches";
import { depuisLigneEnRevue, versLigneImport, type LigneRevueEditee } from "./etat-revue";
import { FormulaireImport } from "./FormulaireImport";
import { RecapitulatifImport } from "./RecapitulatifImport";
import { RevueImport } from "./RevueImport";
import type { EntreeAnalyse } from "./schema";
import { useImportMutations } from "./use-import-mutations";

type EtatEcran =
  | { readonly phase: "FORMULAIRE" }
  | {
      readonly phase: "REVUE";
      readonly analyse: ResultatAnalyse;
      readonly lignes: readonly LigneRevueEditee[];
      readonly recuperees: ReadonlySet<number>;
    }
  | { readonly phase: "TERMINE"; readonly recap: RecapImport };

export function ImportEcran(): ReactNode {
  const [etat, setEtat] = useState<EtatEcran>({ phase: "FORMULAIRE" });
  const { analyser, enregistrer } = useImportMutations();

  function onSoumettreFormulaire(entree: EntreeAnalyse): void {
    analyser.mutate(entree, {
      onSuccess: (donnees) => {
        setEtat({
          phase: "REVUE",
          analyse: donnees,
          lignes: donnees.lignes.map(depuisLigneEnRevue),
          recuperees: new Set(),
        });
      },
    });
  }

  function onChange(cle: string, patch: Partial<LigneRevueEditee>): void {
    setEtat((precedent) => {
      if (precedent.phase !== "REVUE") {
        return precedent;
      }
      return {
        ...precedent,
        lignes: precedent.lignes.map((ligne) => (ligne.base.cle === cle ? { ...ligne, ...patch } : ligne)),
      };
    });
  }

  function onRecupere(ligne: LigneEnRevue, numeroLigne: number): void {
    setEtat((precedent) => {
      if (precedent.phase !== "REVUE") {
        return precedent;
      }
      return {
        ...precedent,
        lignes: [...precedent.lignes, depuisLigneEnRevue(ligne)],
        recuperees: new Set([...precedent.recuperees, numeroLigne]),
      };
    });
  }

  function onEnregistrer(): void {
    if (etat.phase !== "REVUE") {
      return;
    }
    const lignesAEnvoyer = etat.lignes.map(versLigneImport).filter((ligne) => ligne !== null);
    enregistrer.mutate(
      { accountId: etat.analyse.accountId, libelle: null, lignes: lignesAEnvoyer },
      {
        onSuccess: (recap) => {
          setEtat({ phase: "TERMINE", recap });
        },
      },
    );
  }

  if (etat.phase === "FORMULAIRE") {
    return (
      <div className="flex flex-col gap-4 p-4 md:p-6">
        <div>
          <h2 className="text-lg font-semibold">Importer un relevé</h2>
          <p className="text-muted-foreground text-sm">
            Colle le texte copié depuis ton relevé en ligne ; la ligne est catégorisée automatiquement, comparée aux
            transactions déjà en base, et rien n&apos;est écrit avant confirmation.
          </p>
        </div>
        <FormulaireImport enCours={analyser.isPending} onSoumettre={onSoumettreFormulaire} />
      </div>
    );
  }

  if (etat.phase === "REVUE") {
    return (
      <div className="flex flex-col gap-4 p-4 md:p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Revue de l&apos;import</h2>
          <Button type="button" variant="outline" onClick={() => { setEtat({ phase: "FORMULAIRE" }); }}>
            Recommencer
          </Button>
        </div>
        <RevueImport
          analyse={etat.analyse}
          lignes={etat.lignes}
          recuperees={etat.recuperees}
          onChange={onChange}
          onRecupere={onRecupere}
          onEnregistrer={onEnregistrer}
          enregistrementEnCours={enregistrer.isPending}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <h2 className="text-lg font-semibold">Import enregistré</h2>
      <RecapitulatifImport mode="APRES" recap={etat.recap} />
      <div>
        <Button type="button" onClick={() => { setEtat({ phase: "FORMULAIRE" }); }}>
          Importer un autre relevé
        </Button>
      </div>
    </div>
  );
}
