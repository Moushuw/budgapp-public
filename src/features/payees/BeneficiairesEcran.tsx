"use client";

// Assemble le patron de référentiel sur les bénéficiaires — spec M1 tranche 3 §3.11.

import { Merge } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DialogueFormulaire } from "@/components/referentiel/DialogueFormulaire";
import { DialogueSuppression } from "@/components/referentiel/DialogueSuppression";
import { EcranReferentiel, type ColonneReferentiel } from "@/components/referentiel/EcranReferentiel";
import type { BeneficiaireListe } from "@/server/actions/payees";
import { DialogueFusion } from "./DialogueFusion";
import { FormulaireBeneficiaire } from "./FormulaireBeneficiaire";
import { correspondARecherche } from "./recherche";
import { versEntreeBeneficiaire } from "./schema";
import { useBeneficiaireMutations } from "./use-beneficiaire-mutations";
import { useBeneficiaires } from "./use-beneficiaires";

type DialogueEtat =
  | { mode: "ferme" }
  | { mode: "creation" }
  | { mode: "edition"; beneficiaire: BeneficiaireListe }
  | { mode: "suppression"; beneficiaire: BeneficiaireListe }
  | { mode: "fusion"; beneficiaire: BeneficiaireListe };

const COLONNES: readonly ColonneReferentiel<BeneficiaireListe>[] = [
  {
    cle: "nom",
    retourLigne: true,
    entete: "Nom",
    principale: true,
    rendu: (beneficiaire) => beneficiaire.nom,
  },
  {
    cle: "nomNormalise",
    retourLigne: true,
    entete: "Nom normalisé",
    rendu: (beneficiaire) =>
      beneficiaire.nomNormalise !== "" ? (
        <span className="font-mono text-muted-foreground">{beneficiaire.nomNormalise}</span>
      ) : (
        "—"
      ),
  },
  {
    cle: "sousCategorieParDefaut",
    retourLigne: true,
    entete: "Sous-catégorie par défaut",
    rendu: (beneficiaire) =>
      beneficiaire.sousCategorieParDefautNom !== null
        ? `${beneficiaire.categorieParDefautNom} › ${beneficiaire.sousCategorieParDefautNom}`
        : "—",
  },
  {
    cle: "autoCategorisation",
    retourLigne: true,
    entete: "Auto-catégorisation",
    rendu: (beneficiaire) => (beneficiaire.autoCategorisation ? "Oui" : "Non"),
  },
  {
    cle: "categorieVerrouillee",
    retourLigne: true,
    entete: "Catégorie verrouillée",
    rendu: (beneficiaire) => (beneficiaire.categorieVerrouillee ? "Oui" : "Non"),
  },
  {
    cle: "nbTransactions",
    entete: "Transactions",
    alignement: "droite",
    rendu: (beneficiaire) => <span className="font-montant">{beneficiaire.nbTransactions}</span>,
  },
];

function consequenceSuppressionBeneficiaire(beneficiaire: BeneficiaireListe) {
  return (
    <div className="flex flex-col gap-1">
      <p>
        Le bénéficiaire « {beneficiaire.nom} » sera supprimé. {beneficiaire.nbTransactions} transaction(s) le
        portent : elles seront détachées, pas supprimées.
      </p>
      {beneficiaire.sousCategorieParDefautNom !== null && (
        <p>Sa sous-catégorie par défaut ({beneficiaire.sousCategorieParDefautNom}) n&apos;est pas touchée.</p>
      )}
    </div>
  );
}

export function BeneficiairesEcran(): ReactNode {
  const { data, isLoading, error } = useBeneficiaires();
  const { creer, modifier, supprimer, fusionner } = useBeneficiaireMutations();
  const [dialogue, setDialogue] = useState<DialogueEtat>({ mode: "ferme" });
  const [recherche, setRecherche] = useState("");

  const fermer = () => { setDialogue({ mode: "ferme" }); };

  const visibles = (data ?? []).filter((beneficiaire) => correspondARecherche(beneficiaire, recherche));

  return (
    <>
      <EcranReferentiel<BeneficiaireListe>
        titre="Bénéficiaires"
        description="Les marchands et organismes qui reviennent sur vos relevés. Fusionnez les graphies multiples d'un même marchand."
        colonnes={COLONNES}
        elements={visibles}
        cleDe={(beneficiaire) => beneficiaire.id}
        chargement={isLoading}
        erreur={error}
        libelleCreation="Nouveau bénéficiaire"
        messageVide="Aucun bénéficiaire pour l'instant."
        nomAccessible={(beneficiaire) => beneficiaire.nom}
        recherche={{
          valeur: recherche,
          onChange: setRecherche,
          placeholder: "Rechercher un bénéficiaire",
          messageAucunResultat: "Aucun bénéficiaire ne correspond à cette recherche.",
        }}
        onCreer={() => { setDialogue({ mode: "creation" }); }}
        onModifier={(beneficiaire) => { setDialogue({ mode: "edition", beneficiaire }); }}
        onSupprimer={(beneficiaire) => { setDialogue({ mode: "suppression", beneficiaire }); }}
        actionsSupplementaires={(beneficiaire) =>
          (data ?? []).length > 1 ? (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Fusionner"
              onClick={() => { setDialogue({ mode: "fusion", beneficiaire }); }}
            >
              <Merge />
            </Button>
          ) : null
        }
      />

      <DialogueFormulaire
        ouvert={dialogue.mode === "creation" || dialogue.mode === "edition"}
        onOuvertChange={(ouvert) => { if (!ouvert) fermer(); }}
        titre={dialogue.mode === "edition" ? "Modifier le bénéficiaire" : "Nouveau bénéficiaire"}
      >
        <FormulaireBeneficiaire
          key={dialogue.mode === "edition" ? dialogue.beneficiaire.id : "creation"}
          valeurInitiale={dialogue.mode === "edition" ? versEntreeBeneficiaire(dialogue.beneficiaire) : undefined}
          enCours={creer.isPending || modifier.isPending}
          onAnnuler={fermer}
          onSoumettre={(entree) => {
            if (dialogue.mode === "edition") {
              modifier.mutate({ ...entree, id: dialogue.beneficiaire.id }, { onSuccess: fermer });
              return;
            }
            creer.mutate(entree, { onSuccess: fermer });
          }}
        />
      </DialogueFormulaire>

      <DialogueSuppression
        ouvert={dialogue.mode === "suppression"}
        onOuvertChange={(ouvert) => { if (!ouvert) fermer(); }}
        titre="Supprimer le bénéficiaire"
        enCours={supprimer.isPending}
        consequence={dialogue.mode === "suppression" ? consequenceSuppressionBeneficiaire(dialogue.beneficiaire) : null}
        onConfirmer={() => {
          if (dialogue.mode !== "suppression") {
            return;
          }
          supprimer.mutate({ id: dialogue.beneficiaire.id }, { onSuccess: fermer });
        }}
      />

      {dialogue.mode === "fusion" && (
        <DialogueFusion
          key={dialogue.beneficiaire.id}
          ouvert
          onOuvertChange={(ouvert) => { if (!ouvert) fermer(); }}
          source={dialogue.beneficiaire}
          tous={data ?? []}
          enCours={fusionner.isPending}
          onFusionner={(cibleId) => {
            fusionner.mutate({ sourceId: dialogue.beneficiaire.id, cibleId }, { onSuccess: fermer });
          }}
        />
      )}
    </>
  );
}
