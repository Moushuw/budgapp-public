"use client";

// Assemble le patron de référentiel sur les catégories et sous-catégories —
// spec M1 tranche 2 §7.4. Un seul EcranReferentiel<LigneCategorie>, les
// sous-catégories rendues sous leur parent grâce à aplatirCategories.

import { ChevronDown, ChevronUp, Plus } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DialogueFormulaire } from "@/components/referentiel/DialogueFormulaire";
import { DialogueSuppression } from "@/components/referentiel/DialogueSuppression";
import { EcranReferentiel, type ColonneReferentiel } from "@/components/referentiel/EcranReferentiel";
import { LIBELLES_MODE_BUDGET, LIBELLES_MODE_REPORT } from "@/domain/referentiel";
import type { CategorieListe, SousCategorieListe } from "@/server/actions/categories";
import { FormulaireCategorie } from "./FormulaireCategorie";
import { FormulaireSousCategorie } from "./FormulaireSousCategorie";
import { aplatirCategories, type LigneCategorie } from "./lignes";
import { useCategorieMutations } from "./use-categorie-mutations";
import { useCategories } from "./use-categories";

type DialogueEtat =
  | { mode: "ferme" }
  | { mode: "creationCategorie" }
  | { mode: "editionCategorie"; categorie: CategorieListe }
  | { mode: "suppressionCategorie"; categorie: CategorieListe }
  | { mode: "creationSousCategorie"; categorie: CategorieListe }
  | { mode: "editionSousCategorie"; categorie: CategorieListe; sousCategorie: SousCategorieListe }
  | { mode: "suppressionSousCategorie"; categorie: CategorieListe; sousCategorie: SousCategorieListe };

const COLONNES: readonly ColonneReferentiel<LigneCategorie>[] = [
  {
    cle: "nom",
    entete: "Nom",
    principale: true,
    rendu: (ligne) =>
      ligne.genre === "CATEGORIE" ? (
        <span className="flex items-center gap-2 font-semibold">
          <span
            className="border-border size-3 shrink-0 rounded-full border"
            style={{ backgroundColor: ligne.categorie.couleur ?? "transparent" }}
            aria-hidden
          />
          {ligne.categorie.nom}
        </span>
      ) : (
        <span className="flex items-center gap-2 pl-6">
          {ligne.sousCategorie.nom}
          {ligne.sousCategorie.systeme && <Badge variant="outline">Système</Badge>}
        </span>
      ),
  },
  {
    cle: "mode",
    entete: "Mode",
    rendu: (ligne) => {
      if (ligne.genre === "CATEGORIE") {
        return LIBELLES_MODE_BUDGET[ligne.categorie.modeBudget];
      }
      return ligne.sousCategorie.reportActif
        ? LIBELLES_MODE_REPORT[ligne.sousCategorie.reportMode]
        : "Report désactivé";
    },
  },
  {
    cle: "masquee",
    entete: "Visibilité",
    rendu: (ligne) => {
      const masquee = ligne.genre === "CATEGORIE" ? ligne.categorie.masquee : ligne.sousCategorie.masquee;
      return masquee ? <Badge variant="outline">Masquée</Badge> : <span className="text-muted-foreground">Visible</span>;
    },
  },
  {
    cle: "nbTransactions",
    entete: "Transactions",
    alignement: "droite",
    rendu: (ligne) => (
      <span className="font-montant">
        {ligne.genre === "SOUS_CATEGORIE"
          ? ligne.sousCategorie.nbTransactions
          : ligne.categorie.sousCategories.reduce((total, s) => total + s.nbTransactions, 0)}
      </span>
    ),
  },
];

function contientSousCategorieSysteme(categorie: CategorieListe): boolean {
  return categorie.sousCategories.some((sousCategorie) => sousCategorie.systeme);
}

function nommer(sousCategories: readonly SousCategorieListe[]): string {
  return sousCategories.map((sousCategorie) => sousCategorie.nom).join(", ");
}

function pluriel(n: number, singulier: string, pluriel: string): string {
  return n === 1 ? singulier : pluriel;
}

function consequenceSuppressionCategorie(categorie: CategorieListe): ReactNode {
  const sousCategories = categorie.sousCategories;
  const totalTransactions = sousCategories.reduce((total, s) => total + s.nbTransactions, 0);
  const totalAllocations = categorie.nbAllocations + sousCategories.reduce((total, s) => total + s.nbAllocations, 0);
  const totalActionsRegles = sousCategories.reduce((total, s) => total + s.nbActionsRegles, 0);
  const totalMouvements = sousCategories.reduce((total, s) => total + s.nbMouvements, 0);
  const totalBeneficiaires = sousCategories.reduce((total, s) => total + s.nbBeneficiaires, 0);
  const totalRecurrences = sousCategories.reduce((total, s) => total + s.nbRecurrences, 0);
  const totalEvenements = sousCategories.reduce((total, s) => total + s.nbEvenements, 0);
  const totalCibles = sousCategories.filter((s) => s.aCible).length;
  const totalPrevisions = sousCategories.filter((s) => s.aPrevision).length;

  return (
    <div className="flex flex-col gap-1">
      <p>
        La catégorie « {categorie.nom} » sera supprimée
        {sousCategories.length > 0 && (
          <>
            , ainsi que ses {sousCategories.length} sous-catégorie{pluriel(sousCategories.length, "", "s")} :{" "}
            <strong>{nommer(sousCategories)}</strong>
          </>
        )}
        .
      </p>
      {totalTransactions > 0 && <p>{totalTransactions} transaction(s) seront détachées, pas supprimées.</p>}
      {totalAllocations > 0 && <p>{totalAllocations} allocation(s) budgétaire(s) seront supprimées.</p>}
      {totalActionsRegles > 0 && <p>{totalActionsRegles} action(s) de règle seront supprimées.</p>}
      {totalMouvements > 0 && <p>{totalMouvements} mouvement(s) d&apos;enveloppe seront supprimés.</p>}
      {totalBeneficiaires > 0 && <p>{totalBeneficiaires} bénéficiaire(s) perdront leur sous-catégorie par défaut.</p>}
      {totalRecurrences > 0 && <p>{totalRecurrences} récurrence(s) perdront leur sous-catégorie.</p>}
      {totalEvenements > 0 && <p>{totalEvenements} événement(s) planifié(s) perdront leur sous-catégorie.</p>}
      {totalCibles > 0 && <p>{totalCibles} cible(s) d&apos;enveloppe seront supprimées.</p>}
      {totalPrevisions > 0 && <p>{totalPrevisions} réglage(s) de prévision seront supprimés.</p>}
    </div>
  );
}

function consequenceSuppressionSousCategorie(sousCategorie: SousCategorieListe): ReactNode {
  return (
    <div className="flex flex-col gap-1">
      <p>La sous-catégorie « {sousCategorie.nom} » sera supprimée.</p>
      {sousCategorie.nbTransactions > 0 && <p>{sousCategorie.nbTransactions} transaction(s) seront détachées, pas supprimées.</p>}
      {sousCategorie.nbAllocations > 0 && <p>{sousCategorie.nbAllocations} allocation(s) budgétaire(s) seront supprimées.</p>}
      {sousCategorie.nbActionsRegles > 0 && <p>{sousCategorie.nbActionsRegles} action(s) de règle seront supprimées.</p>}
      {sousCategorie.nbMouvements > 0 && <p>{sousCategorie.nbMouvements} mouvement(s) d&apos;enveloppe seront supprimés.</p>}
      {sousCategorie.nbBeneficiaires > 0 && (
        <p>{sousCategorie.nbBeneficiaires} bénéficiaire(s) perdront leur sous-catégorie par défaut.</p>
      )}
      {sousCategorie.nbRecurrences > 0 && <p>{sousCategorie.nbRecurrences} récurrence(s) perdront leur sous-catégorie.</p>}
      {sousCategorie.nbEvenements > 0 && (
        <p>{sousCategorie.nbEvenements} événement(s) planifié(s) perdront leur sous-catégorie.</p>
      )}
      {sousCategorie.aCible && <p>La cible d&apos;enveloppe sera supprimée.</p>}
      {sousCategorie.aPrevision && <p>Le réglage de prévision sera supprimé.</p>}
    </div>
  );
}

export function CategoriesEcran(): ReactNode {
  const { data, isLoading, error } = useCategories();
  const {
    creer,
    modifier,
    supprimer,
    deplacer,
    creerSousCategorie,
    modifierSousCategorie,
    supprimerSousCategorie,
    deplacerSousCategorie,
  } = useCategorieMutations();
  const [dialogue, setDialogue] = useState<DialogueEtat>({ mode: "ferme" });

  const fermer = () => { setDialogue({ mode: "ferme" }); };

  const lignes = aplatirCategories(data ?? []);

  const dialogueFormulaireOuvert =
    dialogue.mode === "creationCategorie" ||
    dialogue.mode === "editionCategorie" ||
    dialogue.mode === "creationSousCategorie" ||
    dialogue.mode === "editionSousCategorie";

  const titreFormulaire = (() => {
    switch (dialogue.mode) {
      case "editionCategorie":
        return "Modifier la catégorie";
      case "creationSousCategorie":
        return "Nouvelle sous-catégorie";
      case "editionSousCategorie":
        return "Modifier la sous-catégorie";
      default:
        return "Nouvelle catégorie";
    }
  })();

  return (
    <>
      <EcranReferentiel<LigneCategorie>
        titre="Catégories"
        description="Les catégories regroupent des sous-catégories, qui portent le budget, le report et l'historique des transactions."
        colonnes={COLONNES}
        elements={lignes}
        cleDe={(ligne) => ligne.cle}
        chargement={isLoading}
        erreur={error}
        libelleCreation="Nouvelle catégorie"
        messageVide="Aucune catégorie pour l'instant."
        nomAccessible={(ligne) => (ligne.genre === "CATEGORIE" ? ligne.categorie.nom : ligne.sousCategorie.nom)}
        onCreer={() => { setDialogue({ mode: "creationCategorie" }); }}
        onModifier={(ligne) => {
          if (ligne.genre === "CATEGORIE") {
            setDialogue({ mode: "editionCategorie", categorie: ligne.categorie });
            return;
          }
          setDialogue({ mode: "editionSousCategorie", categorie: ligne.categorie, sousCategorie: ligne.sousCategorie });
        }}
        onSupprimer={(ligne) => {
          if (ligne.genre === "CATEGORIE") {
            setDialogue({ mode: "suppressionCategorie", categorie: ligne.categorie });
            return;
          }
          setDialogue({ mode: "suppressionSousCategorie", categorie: ligne.categorie, sousCategorie: ligne.sousCategorie });
        }}
        suppressionMasquee={(ligne) => ligne.genre === "SOUS_CATEGORIE" && ligne.sousCategorie.systeme}
        suppressionInterdite={(ligne) =>
          ligne.genre === "CATEGORIE" && contientSousCategorieSysteme(ligne.categorie)
            ? "Contient une ou des sous-catégories système : elles ne peuvent pas être supprimées."
            : null
        }
        actionsSupplementaires={(ligne) => (
          <>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Monter"
              disabled={ligne.premier}
              onClick={() => {
                if (ligne.genre === "CATEGORIE") {
                  deplacer.mutate({ id: ligne.categorie.id, direction: "MONTER" });
                  return;
                }
                deplacerSousCategorie.mutate({ id: ligne.sousCategorie.id, direction: "MONTER" });
              }}
            >
              <ChevronUp />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Descendre"
              disabled={ligne.dernier}
              onClick={() => {
                if (ligne.genre === "CATEGORIE") {
                  deplacer.mutate({ id: ligne.categorie.id, direction: "DESCENDRE" });
                  return;
                }
                deplacerSousCategorie.mutate({ id: ligne.sousCategorie.id, direction: "DESCENDRE" });
              }}
            >
              <ChevronDown />
            </Button>
            {ligne.genre === "CATEGORIE" && (
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Ajouter une sous-catégorie"
                onClick={() => { setDialogue({ mode: "creationSousCategorie", categorie: ligne.categorie }); }}
              >
                <Plus />
              </Button>
            )}
          </>
        )}
      />

      <DialogueFormulaire
        ouvert={dialogueFormulaireOuvert}
        onOuvertChange={(ouvert) => { if (!ouvert) fermer(); }}
        titre={titreFormulaire}
      >
        {(dialogue.mode === "creationCategorie" || dialogue.mode === "editionCategorie") && (
          <FormulaireCategorie
            key={dialogue.mode === "editionCategorie" ? dialogue.categorie.id : "creation"}
            valeurInitiale={
              dialogue.mode === "editionCategorie"
                ? {
                    nom: dialogue.categorie.nom,
                    couleur: dialogue.categorie.couleur,
                    icone: dialogue.categorie.icone,
                    masquee: dialogue.categorie.masquee,
                    modeBudget: dialogue.categorie.modeBudget,
                  }
                : undefined
            }
            enCours={creer.isPending || modifier.isPending}
            onAnnuler={fermer}
            onSoumettre={(entree) => {
              if (dialogue.mode === "editionCategorie") {
                modifier.mutate({ ...entree, id: dialogue.categorie.id }, { onSuccess: fermer });
                return;
              }
              creer.mutate(entree, { onSuccess: fermer });
            }}
          />
        )}

        {(dialogue.mode === "creationSousCategorie" || dialogue.mode === "editionSousCategorie") && (
          <FormulaireSousCategorie
            key={dialogue.mode === "editionSousCategorie" ? dialogue.sousCategorie.id : `creation:${dialogue.categorie.id}`}
            valeurInitiale={
              dialogue.mode === "editionSousCategorie"
                ? {
                    nom: dialogue.sousCategorie.nom,
                    masquee: dialogue.sousCategorie.masquee,
                    reportActif: dialogue.sousCategorie.reportActif,
                    reportMode: dialogue.sousCategorie.reportMode,
                  }
                : undefined
            }
            enCours={creerSousCategorie.isPending || modifierSousCategorie.isPending}
            onAnnuler={fermer}
            onSoumettre={(entree) => {
              if (dialogue.mode === "editionSousCategorie") {
                modifierSousCategorie.mutate({ ...entree, id: dialogue.sousCategorie.id }, { onSuccess: fermer });
                return;
              }
              creerSousCategorie.mutate({ ...entree, categoryId: dialogue.categorie.id }, { onSuccess: fermer });
            }}
          />
        )}
      </DialogueFormulaire>

      <DialogueSuppression
        ouvert={dialogue.mode === "suppressionCategorie" || dialogue.mode === "suppressionSousCategorie"}
        onOuvertChange={(ouvert) => { if (!ouvert) fermer(); }}
        titre={dialogue.mode === "suppressionSousCategorie" ? "Supprimer la sous-catégorie" : "Supprimer la catégorie"}
        enCours={supprimer.isPending || supprimerSousCategorie.isPending}
        consequence={
          dialogue.mode === "suppressionCategorie"
            ? consequenceSuppressionCategorie(dialogue.categorie)
            : dialogue.mode === "suppressionSousCategorie"
              ? consequenceSuppressionSousCategorie(dialogue.sousCategorie)
              : null
        }
        onConfirmer={() => {
          if (dialogue.mode === "suppressionCategorie") {
            supprimer.mutate({ id: dialogue.categorie.id }, { onSuccess: fermer });
            return;
          }
          if (dialogue.mode === "suppressionSousCategorie") {
            supprimerSousCategorie.mutate({ id: dialogue.sousCategorie.id }, { onSuccess: fermer });
          }
        }}
      />
    </>
  );
}
