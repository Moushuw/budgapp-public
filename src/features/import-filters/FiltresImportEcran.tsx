"use client";

// Assemble le patron de référentiel sur les filtres d'import — spec M1
// tranche 2 §7.5. Création, modification et suppression : c'est précisément
// ce que la v1 n'avait pas.

import type { ReactNode } from "react";
import { useState } from "react";
import { DialogueFormulaire } from "@/components/referentiel/DialogueFormulaire";
import { DialogueSuppression } from "@/components/referentiel/DialogueSuppression";
import { EcranReferentiel, type ColonneReferentiel } from "@/components/referentiel/EcranReferentiel";
import { LIBELLES_MODE_CORRESPONDANCE } from "@/domain/referentiel";
import type { FiltreImportListe } from "@/server/actions/import-filters";
import { FormulaireFiltreImport } from "./FormulaireFiltreImport";
import type { EntreeFiltreImport } from "./schema";
import { useFiltreImportMutations } from "./use-filtre-import-mutations";
import { useFiltresImport } from "./use-filtres-import";

type DialogueEtat =
  | { mode: "ferme" }
  | { mode: "creation" }
  | { mode: "edition"; filtre: FiltreImportListe }
  | { mode: "suppression"; filtre: FiltreImportListe };

const COLONNES: readonly ColonneReferentiel<FiltreImportListe>[] = [
  {
    cle: "motif",
    entete: "Motif",
    principale: true,
    rendu: (filtre) => <span className="font-mono">{filtre.motif}</span>,
  },
  {
    cle: "mode",
    entete: "Mode",
    rendu: (filtre) => LIBELLES_MODE_CORRESPONDANCE[filtre.mode],
  },
];

function versEntree(filtre: FiltreImportListe): EntreeFiltreImport {
  return { motif: filtre.motif, mode: filtre.mode };
}

export function FiltresImportEcran(): ReactNode {
  const { data, isLoading, error } = useFiltresImport();
  const { creer, modifier, supprimer } = useFiltreImportMutations();
  const [dialogue, setDialogue] = useState<DialogueEtat>({ mode: "ferme" });

  const fermer = () => { setDialogue({ mode: "ferme" }); };

  return (
    <>
      <EcranReferentiel<FiltreImportListe>
        titre="Filtres d'import"
        description="Les lignes de relevé qui correspondent à un filtre sont écartées avant catégorisation — frais internes, transferts techniques."
        colonnes={COLONNES}
        elements={data ?? []}
        cleDe={(filtre) => filtre.id}
        chargement={isLoading}
        erreur={error}
        libelleCreation="Nouveau filtre"
        messageVide="Aucun filtre pour l'instant."
        nomAccessible={(filtre) => filtre.motif}
        onCreer={() => { setDialogue({ mode: "creation" }); }}
        onModifier={(filtre) => { setDialogue({ mode: "edition", filtre }); }}
        onSupprimer={(filtre) => { setDialogue({ mode: "suppression", filtre }); }}
      />

      <DialogueFormulaire
        ouvert={dialogue.mode === "creation" || dialogue.mode === "edition"}
        onOuvertChange={(ouvert) => { if (!ouvert) fermer(); }}
        titre={dialogue.mode === "edition" ? "Modifier le filtre" : "Nouveau filtre"}
      >
        <FormulaireFiltreImport
          key={dialogue.mode === "edition" ? dialogue.filtre.id : "creation"}
          valeurInitiale={dialogue.mode === "edition" ? versEntree(dialogue.filtre) : undefined}
          enCours={creer.isPending || modifier.isPending}
          onAnnuler={fermer}
          onSoumettre={(entree) => {
            if (dialogue.mode === "edition") {
              modifier.mutate({ ...entree, id: dialogue.filtre.id }, { onSuccess: fermer });
              return;
            }
            creer.mutate(entree, { onSuccess: fermer });
          }}
        />
      </DialogueFormulaire>

      <DialogueSuppression
        ouvert={dialogue.mode === "suppression"}
        onOuvertChange={(ouvert) => { if (!ouvert) fermer(); }}
        titre="Supprimer le filtre"
        enCours={supprimer.isPending}
        consequence={
          dialogue.mode === "suppression" ? (
            <>
              Le filtre « {dialogue.filtre.motif} » sera supprimé. Les prochains imports ne l&apos;appliqueront plus.
            </>
          ) : null
        }
        onConfirmer={() => {
          if (dialogue.mode !== "suppression") {
            return;
          }
          supprimer.mutate({ id: dialogue.filtre.id }, { onSuccess: fermer });
        }}
      />
    </>
  );
}
