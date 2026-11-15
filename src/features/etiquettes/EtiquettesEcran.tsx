"use client";

// Assemble le patron de référentiel sur les étiquettes — spec M1 tranche 1
// §7.5. Sert de modèle aux cinq autres écrans de référentiel (tranches 2, 3).

import type { ReactNode } from "react";
import { useState } from "react";
import { DialogueFormulaire } from "@/components/referentiel/DialogueFormulaire";
import { DialogueSuppression } from "@/components/referentiel/DialogueSuppression";
import { EcranReferentiel, type ColonneReferentiel } from "@/components/referentiel/EcranReferentiel";
import { formatMontant } from "@/domain/money";
import type { EtiquetteListe } from "@/server/actions/tags";
import { FormulaireEtiquette } from "./FormulaireEtiquette";
import type { EntreeEtiquette } from "./schema";
import { useEtiquetteMutations } from "./use-etiquette-mutations";
import { useEtiquettes } from "./use-etiquettes";

type DialogueEtat =
  | { mode: "ferme" }
  | { mode: "creation" }
  | { mode: "edition"; etiquette: EtiquetteListe }
  | { mode: "suppression"; etiquette: EtiquetteListe };

const COLONNES: readonly ColonneReferentiel<EtiquetteListe>[] = [
  {
    cle: "nom",
    entete: "Nom",
    principale: true,
    rendu: (etiquette) => etiquette.nom,
  },
  {
    cle: "couleur",
    entete: "Couleur",
    rendu: (etiquette) => (
      <div className="flex items-center gap-2">
        <span
          className="border-border size-4 shrink-0 rounded-full border"
          style={{ backgroundColor: etiquette.couleur ?? "transparent" }}
          aria-hidden
        />
        <span className="text-muted-foreground text-sm">{etiquette.couleur ?? "—"}</span>
      </div>
    ),
  },
  {
    cle: "cibleMensuelleCents",
    entete: "Cible mensuelle",
    alignement: "droite",
    rendu: (etiquette) => (
      <span className="font-montant">
        {etiquette.cibleMensuelleCents === null ? "—" : formatMontant(etiquette.cibleMensuelleCents, "CENTS")}
      </span>
    ),
  },
  {
    cle: "nbTransactions",
    entete: "Transactions",
    alignement: "droite",
    rendu: (etiquette) => <span className="font-montant">{etiquette.nbTransactions}</span>,
  },
];

function versEntree(etiquette: EtiquetteListe): EntreeEtiquette {
  return {
    nom: etiquette.nom,
    couleur: etiquette.couleur,
    cibleMensuelleCents:
      etiquette.cibleMensuelleCents === null ? "" : formatMontant(etiquette.cibleMensuelleCents, "CENTS"),
  };
}

export function EtiquettesEcran(): ReactNode {
  const { data, isLoading, error } = useEtiquettes();
  const { creer, modifier, supprimer } = useEtiquetteMutations();
  const [dialogue, setDialogue] = useState<DialogueEtat>({ mode: "ferme" });

  const fermer = () => { setDialogue({ mode: "ferme" }); };

  return (
    <>
      <EcranReferentiel<EtiquetteListe>
        titre="Étiquettes"
        description="Marquez des transactions au-delà de leur sous-catégorie ; posez une cible pour en faire une liste de surveillance."
        colonnes={COLONNES}
        elements={data ?? []}
        cleDe={(etiquette) => etiquette.id}
        chargement={isLoading}
        erreur={error}
        libelleCreation="Nouvelle étiquette"
        messageVide="Aucune étiquette pour l'instant."
        nomAccessible={(etiquette) => etiquette.nom}
        onCreer={() => { setDialogue({ mode: "creation" }); }}
        onModifier={(etiquette) => { setDialogue({ mode: "edition", etiquette }); }}
        onSupprimer={(etiquette) => { setDialogue({ mode: "suppression", etiquette }); }}
      />

      <DialogueFormulaire
        ouvert={dialogue.mode === "creation" || dialogue.mode === "edition"}
        onOuvertChange={(ouvert) => { if (!ouvert) fermer(); }}
        titre={dialogue.mode === "edition" ? "Modifier l'étiquette" : "Nouvelle étiquette"}
      >
        <FormulaireEtiquette
          // Une clé par étiquette (ou "creation") force le remontage du
          // formulaire entre deux éditions, plutôt que de compter sur le
          // démontage du Dialog Radix pour réinitialiser les valeurs.
          key={dialogue.mode === "edition" ? dialogue.etiquette.id : "creation"}
          valeurInitiale={dialogue.mode === "edition" ? versEntree(dialogue.etiquette) : undefined}
          enCours={creer.isPending || modifier.isPending}
          onAnnuler={fermer}
          onSoumettre={(entree) => {
            if (dialogue.mode === "edition") {
              modifier.mutate({ ...entree, id: dialogue.etiquette.id }, { onSuccess: fermer });
              return;
            }
            creer.mutate(entree, { onSuccess: fermer });
          }}
        />
      </DialogueFormulaire>

      <DialogueSuppression
        ouvert={dialogue.mode === "suppression"}
        onOuvertChange={(ouvert) => { if (!ouvert) fermer(); }}
        titre="Supprimer l'étiquette"
        enCours={supprimer.isPending}
        consequence={
          dialogue.mode === "suppression" ? (
            <>
              L&apos;étiquette « {dialogue.etiquette.nom} » sera supprimée.{" "}
              {dialogue.etiquette.nbTransactions} transaction(s) la portent : elles seront détachées, pas
              modifiées.
            </>
          ) : null
        }
        onConfirmer={() => {
          if (dialogue.mode !== "suppression") {
            return;
          }
          supprimer.mutate({ id: dialogue.etiquette.id }, { onSuccess: fermer });
        }}
      />
    </>
  );
}
