"use client";

// Assemble le patron de référentiel sur les règles — docs/lot-m1.md §4.6,
// sur le modèle exact de src/features/payees/BeneficiairesEcran.tsx.

import { Wand2 } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DialogueFormulaire } from "@/components/referentiel/DialogueFormulaire";
import { DialogueSuppression } from "@/components/referentiel/DialogueSuppression";
import { EcranReferentiel, type ColonneReferentiel } from "@/components/referentiel/EcranReferentiel";
import { LIBELLES_TYPE_ACTION } from "@/domain/categorization";
// Import direct, pas depuis le barillet @/domain/ingestion : ce composant
// est "use client", et le barillet réexporte aussi calculerEmpreinte
// (node:crypto, ./empreinte.ts) dans le même index.ts — même précédent que
// src/features/import/etat-revue.ts et FormulaireBeneficiaire.tsx, corrigé
// à la relecture de la tranche 6 point 8 (journal INDEX.md du 2026-09-20).
import { aplatirTexte } from "@/domain/ingestion/normaliser";
import { useComptes } from "@/features/accounts/use-comptes";
import type { RegleListe } from "@/server/actions/rules";
import { DialogueApplicationRetroactive } from "./DialogueApplicationRetroactive";
import { FormulaireRegle } from "./FormulaireRegle";
import { consequenceSuppressionRegle as libelleConsequenceSuppression } from "./libelles";
import { resumeCondition, type NomsComptes } from "./resume-regle";
import { versEntreeRegle } from "./schema";
import { useRegleMutations } from "./use-regle-mutations";
import { useRegles } from "./use-regles";

type DialogueEtat =
  | { mode: "ferme" }
  | { mode: "creation" }
  | { mode: "edition"; regle: RegleListe }
  | { mode: "suppression"; regle: RegleListe }
  | { mode: "application"; regle: RegleListe };

function resumeActions(regle: RegleListe): string {
  return regle.actions.map((action) => LIBELLES_TYPE_ACTION[action.type]).join(" · ");
}

function correspondARecherche(regle: RegleListe, recherche: string): boolean {
  const q = aplatirTexte(recherche);
  if (q === "") {
    return true;
  }
  return aplatirTexte(regle.libelle).includes(q);
}

function colonnesRegles(nomsComptes: NomsComptes): readonly ColonneReferentiel<RegleListe>[] {
  return [
    { cle: "libelle", entete: "Libellé", principale: true, retourLigne: true, rendu: (regle) => regle.libelle },
    {
      cle: "priorite",
      entete: "Priorité",
      alignement: "droite",
      rendu: (regle) => <span className="font-montant">{regle.priorite}</span>,
    },
    {
      cle: "conditions",
      entete: "Conditions",
      retourLigne: true,
      rendu: (regle) => `${regle.conditions.length} — ${resumeCondition(regle.conditions, nomsComptes)}`,
    },
    { cle: "actions", entete: "Effets", retourLigne: true, rendu: (regle) => resumeActions(regle) },
    { cle: "actif", entete: "Active", rendu: (regle) => (regle.actif ? "Oui" : "Non") },
    {
      cle: "nbTransactions",
      entete: "Transactions",
      alignement: "droite",
      rendu: (regle) => <span className="font-montant">{regle.nbTransactions}</span>,
    },
  ];
}

function consequenceSuppressionRegle(regle: RegleListe) {
  return (
    <p>
      {libelleConsequenceSuppression(
        regle.conditions.length,
        regle.actions.length,
        regle.nbTransactions,
        regle.libelle,
      )}
    </p>
  );
}

export function ReglesEcran(): ReactNode {
  const { data, isLoading, error } = useRegles();
  const { data: comptes, isError: erreurComptes } = useComptes();
  const { creer, modifier, supprimer } = useRegleMutations();
  const [dialogue, setDialogue] = useState<DialogueEtat>({ mode: "ferme" });
  const [recherche, setRecherche] = useState("");

  const fermer = () => {
    setDialogue({ mode: "ferme" });
  };

  const nomsComptes: NomsComptes =
    comptes !== undefined ? new Map(comptes.map((c) => [c.id, c.nom])) : erreurComptes ? "ERREUR" : "CHARGEMENT";

  const visibles = (data ?? []).filter((regle) => correspondARecherche(regle, recherche));

  return (
    <>
      <EcranReferentiel<RegleListe>
        titre="Règles"
        description="Les règles de catégorisation automatique appliquées aux nouvelles transactions."
        colonnes={colonnesRegles(nomsComptes)}
        elements={visibles}
        cleDe={(regle) => regle.id}
        chargement={isLoading}
        erreur={error}
        libelleCreation="Nouvelle règle"
        messageVide="Aucune règle pour l'instant."
        nomAccessible={(regle) => regle.libelle}
        recherche={{
          valeur: recherche,
          onChange: setRecherche,
          placeholder: "Rechercher une règle",
          messageAucunResultat: "Aucune règle ne correspond à cette recherche.",
        }}
        onCreer={() => {
          setDialogue({ mode: "creation" });
        }}
        onModifier={(regle) => {
          setDialogue({ mode: "edition", regle });
        }}
        onSupprimer={(regle) => {
          setDialogue({ mode: "suppression", regle });
        }}
        actionsSupplementaires={(regle) => (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Appliquer aux transactions existantes"
            onClick={() => {
              setDialogue({ mode: "application", regle });
            }}
          >
            <Wand2 />
          </Button>
        )}
      />

      <DialogueFormulaire
        ouvert={dialogue.mode === "creation" || dialogue.mode === "edition"}
        onOuvertChange={(ouvert) => {
          if (!ouvert) fermer();
        }}
        titre={dialogue.mode === "edition" ? "Modifier la règle" : "Nouvelle règle"}
      >
        <FormulaireRegle
          key={dialogue.mode === "edition" ? dialogue.regle.id : "creation"}
          valeurInitiale={dialogue.mode === "edition" ? versEntreeRegle(dialogue.regle) : undefined}
          enCours={creer.isPending || modifier.isPending}
          onAnnuler={fermer}
          onSoumettre={(entree) => {
            if (dialogue.mode === "edition") {
              modifier.mutate({ ...entree, id: dialogue.regle.id }, { onSuccess: fermer });
              return;
            }
            creer.mutate(entree, { onSuccess: fermer });
          }}
        />
      </DialogueFormulaire>

      <DialogueSuppression
        ouvert={dialogue.mode === "suppression"}
        onOuvertChange={(ouvert) => {
          if (!ouvert) fermer();
        }}
        titre="Supprimer la règle"
        enCours={supprimer.isPending}
        consequence={dialogue.mode === "suppression" ? consequenceSuppressionRegle(dialogue.regle) : null}
        onConfirmer={() => {
          if (dialogue.mode !== "suppression") {
            return;
          }
          supprimer.mutate({ id: dialogue.regle.id }, { onSuccess: fermer });
        }}
      />

      {dialogue.mode === "application" && (
        <DialogueApplicationRetroactive
          key={dialogue.regle.id}
          ouvert
          onOuvertChange={(ouvert) => {
            if (!ouvert) fermer();
          }}
          regle={dialogue.regle}
          onTermine={fermer}
        />
      )}
    </>
  );
}
