"use client";

// Orchestration de l'écran des récurrences — docs/lot-m3.md §4.7. Seul composant de l'écran à appeler les hooks de
// lecture et d'écriture ; les sections, le panneau et les dialogues ne reçoivent que des données et des rappels
// (CLAUDE.md §8).

import { Plus, Search } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { DialogueSuppression } from "@/components/referentiel/DialogueSuppression";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { OccurrenceAffichee, SerieAffichee, SuggestionAffichee } from "@/domain/recurrence";
import { useComptes } from "@/features/accounts/use-comptes";
import { useCategories } from "@/features/categories/use-categories";
import { ErreurAction } from "@/lib/action-result";
import { DialogueLierTransaction } from "./DialogueLierTransaction";
import { DialogueMontantEcheance } from "./DialogueMontantEcheance";
import { DialogueRecurrence, type OuvertureDialogueRecurrence } from "./DialogueRecurrence";
import { DialogueTerminerSerie } from "./DialogueTerminerSerie";
import { consequenceSuppressionSerie } from "./libelles";
import { PanneauEcheances, type ActionsEcheances } from "./PanneauEcheances";
import { SectionNonVus } from "./SectionNonVus";
import { SectionSeries } from "./SectionSeries";
import { SectionSuggestions } from "./SectionSuggestions";
import type { ValeursFormulaireRecurrence } from "./schema";
import { useRecurrenceMutations } from "./use-recurrence-mutations";
import { useRecurrences } from "./use-recurrences";
import {
  champsDepuisValeurs,
  valeursDepuisProposition,
  valeursDepuisSerie,
  valeursVides,
} from "./valeurs-formulaire";

type DialogueEcran =
  | { readonly type: "AUCUN" }
  | { readonly type: "CONFIRMER"; readonly suggestion: SuggestionAffichee }
  | { readonly type: "NOUVELLE" }
  | { readonly type: "MODIFIER"; readonly serie: SerieAffichee }
  | { readonly type: "TERMINER"; readonly serie: SerieAffichee }
  | { readonly type: "SUPPRIMER"; readonly serie: SerieAffichee }
  | { readonly type: "LIER"; readonly occurrenceId: string }
  | { readonly type: "MONTANT"; readonly occurrence: OccurrenceAffichee };

const AUCUN_DIALOGUE: DialogueEcran = { type: "AUCUN" };

export function RecurrencesEcran(): ReactNode {
  const requete = useRecurrences();
  const { data: comptes } = useComptes();
  const { data: categories } = useCategories();
  const mutations = useRecurrenceMutations();
  const { rechercher, refuser, confirmer, creer, modifier, terminer, supprimer, lier, delier, ignorer, retablir, modifierMontant } =
    mutations;

  const [dialogue, setDialogue] = useState<DialogueEcran>(AUCUN_DIALOGUE);
  const [serieEcheances, setSerieEcheances] = useState<{ readonly id: string; readonly libelle: string } | null>(null);

  const ecran = requete.data;
  const comptesChoisissables = useMemo(
    () => (comptes ?? []).filter((compte) => !compte.archive).map((compte) => ({ id: compte.id, libelle: compte.nom })),
    [comptes],
  );
  const idsSeriesConnues = useMemo(() => new Set((ecran?.series ?? []).map((serie) => serie.id)), [ecran]);

  const enCours =
    rechercher.isPending ||
    refuser.isPending ||
    confirmer.isPending ||
    creer.isPending ||
    modifier.isPending ||
    terminer.isPending ||
    supprimer.isPending ||
    lier.isPending ||
    delier.isPending ||
    ignorer.isPending ||
    retablir.isPending ||
    modifierMontant.isPending;

  function fermerDialogue(): void {
    terminer.reset();
    setDialogue(AUCUN_DIALOGUE);
  }

  function ouvertureFormulaire(): OuvertureDialogueRecurrence | null {
    switch (dialogue.type) {
      case "CONFIRMER": {
        const proposition = dialogue.suggestion.proposition;
        return proposition === null
          ? null
          : {
              mode: "CONFIRMATION",
              valeursInitiales: valeursDepuisProposition(proposition),
              nomCompte: dialogue.suggestion.compteNom,
            };
      }
      case "NOUVELLE":
        return ecran === undefined
          ? null
          : { mode: "CREATION", valeursInitiales: valeursVides(ecran.aujourdhui), nomCompte: null };
      case "MODIFIER":
        return { mode: "MODIFICATION", valeursInitiales: valeursDepuisSerie(dialogue.serie), nomCompte: dialogue.serie.compteNom };
      default:
        return null;
    }
  }

  function soumettreFormulaire(valeurs: ValeursFormulaireRecurrence): void {
    const champs = champsDepuisValeurs(valeurs);
    switch (dialogue.type) {
      case "CONFIRMER":
        confirmer.mutate({ suggestionId: dialogue.suggestion.id, champs }, { onSuccess: fermerDialogue });
        break;
      case "NOUVELLE":
        creer.mutate({ accountId: valeurs.accountId, transactionId: null, champs }, { onSuccess: fermerDialogue });
        break;
      case "MODIFIER":
        modifier.mutate({ id: dialogue.serie.id, champs }, { onSuccess: fermerDialogue });
        break;
      default:
        break;
    }
  }

  async function lierEcheance(occurrenceId: string, transactionId: string): Promise<boolean> {
    try {
      await lier.mutateAsync({ occurrenceId, transactionId });
      return true;
    } catch {
      return false; // le toast d'erreur vient du hook
    }
  }

  const actionsEcheances: ActionsEcheances = {
    onLier: (occurrenceId) => {
      setDialogue({ type: "LIER", occurrenceId });
    },
    onIgnorer: (occurrenceId) => {
      ignorer.mutate({ occurrenceId });
    },
    onRetablir: (occurrenceId) => {
      retablir.mutate({ occurrenceId });
    },
    onDelier: (occurrenceId) => {
      delier.mutate({ occurrenceId });
    },
    onModifierMontant: (occurrence) => {
      setDialogue({ type: "MONTANT", occurrence });
    },
    enCours,
  };

  let corps: ReactNode;
  if (requete.isPending) {
    corps = (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  } else if (ecran === undefined) {
    corps = (
      <div className="border-destructive/40 bg-destructive/10 text-destructive flex flex-col items-start gap-2 rounded-lg border px-4 py-3 text-sm">
        <p>{requete.error.message}</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            void requete.refetch();
          }}
        >
          Réessayer
        </Button>
      </div>
    );
  } else {
    corps = (
      <>
        <SectionSuggestions
          suggestions={ecran.suggestions}
          nbSuggestions={ecran.nbSuggestions}
          enCours={enCours}
          onConfirmer={(suggestion) => {
            setDialogue({ type: "CONFIRMER", suggestion });
          }}
          onRefuser={(id) => {
            refuser.mutate({ id });
          }}
        />
        <SectionSeries
          series={ecran.series}
          tronquees={ecran.seriesTronquees}
          actions={{
            onVoirEcheances: (serie) => {
              setSerieEcheances({ id: serie.id, libelle: serie.libelle });
            },
            onModifier: (serie) => {
              setDialogue({ type: "MODIFIER", serie });
            },
            onTerminer: (serie) => {
              setDialogue({ type: "TERMINER", serie });
            },
            onSupprimer: (serie) => {
              setDialogue({ type: "SUPPRIMER", serie });
            },
          }}
        />
        <SectionNonVus
          nonVus={ecran.nonVus}
          nbNonVus={ecran.nbNonVus}
          idsSeriesConnues={idsSeriesConnues}
          enCours={enCours}
          onLier={(occurrenceId) => {
            setDialogue({ type: "LIER", occurrenceId });
          }}
          onIgnorer={(occurrenceId) => {
            ignorer.mutate({ occurrenceId });
          }}
          onModifierSerie={(ruleId) => {
            const serie = ecran.series.find((s) => s.id === ruleId);
            if (serie !== undefined) {
              setDialogue({ type: "MODIFIER", serie });
            }
          }}
        />
      </>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h1 className="text-xl font-semibold">Récurrences</h1>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={rechercher.isPending}
            onClick={() => {
              rechercher.mutate();
            }}
          >
            <Search />
            Rechercher des récurrences
          </Button>
          <Button
            type="button"
            disabled={ecran === undefined}
            onClick={() => {
              setDialogue({ type: "NOUVELLE" });
            }}
          >
            <Plus />
            Nouvelle récurrence
          </Button>
        </div>
      </div>

      {corps}

      <PanneauEcheances
        serie={serieEcheances}
        actions={actionsEcheances}
        onFermer={() => {
          setSerieEcheances(null);
        }}
      />

      <DialogueRecurrence
        ouverture={ouvertureFormulaire()}
        comptes={comptesChoisissables}
        categories={categories ?? []}
        enCours={confirmer.isPending || creer.isPending || modifier.isPending}
        onSoumettre={soumettreFormulaire}
        onFermer={fermerDialogue}
      />

      <DialogueTerminerSerie
        serie={dialogue.type === "TERMINER" ? { id: dialogue.serie.id, libelle: dialogue.serie.libelle } : null}
        aujourdhui={ecran?.aujourdhui ?? ""}
        enCours={terminer.isPending}
        erreurDate={
          terminer.error instanceof ErreurAction && terminer.error.code === "VALIDATION"
            ? terminer.error.message
            : null
        }
        erreurGenerale={
          terminer.isError && !(terminer.error instanceof ErreurAction && terminer.error.code === "VALIDATION")
            ? terminer.error.message
            : null
        }
        onDateChange={() => {
          if (terminer.isError) {
            terminer.reset();
          }
        }}
        onTerminer={(dateFin) => {
          if (dialogue.type === "TERMINER") {
            terminer.mutate({ id: dialogue.serie.id, dateFin }, { onSuccess: fermerDialogue });
          }
        }}
        onFermer={fermerDialogue}
      />

      <DialogueSuppression
        ouvert={dialogue.type === "SUPPRIMER"}
        onOuvertChange={(ouvert) => {
          if (!ouvert) {
            fermerDialogue();
          }
        }}
        titre="Supprimer la récurrence"
        consequence={dialogue.type === "SUPPRIMER" ? consequenceSuppressionSerie(dialogue.serie.nbLiees) : null}
        enCours={supprimer.isPending}
        onConfirmer={() => {
          if (dialogue.type === "SUPPRIMER") {
            supprimer.mutate({ id: dialogue.serie.id }, { onSuccess: fermerDialogue });
          }
        }}
      />

      <DialogueMontantEcheance
        echeance={
          dialogue.type === "MONTANT"
            ? {
                occurrenceId: dialogue.occurrence.id,
                echeance: dialogue.occurrence.echeance,
                montantCents: dialogue.occurrence.montantCents,
              }
            : null
        }
        enCours={modifierMontant.isPending}
        onEnregistrer={(occurrenceId, montant) => {
          modifierMontant.mutate({ occurrenceId, montant }, { onSuccess: fermerDialogue });
        }}
        onFermer={fermerDialogue}
      />

      <DialogueLierTransaction
        occurrenceId={dialogue.type === "LIER" ? dialogue.occurrenceId : null}
        enCours={lier.isPending}
        onLier={lierEcheance}
        onFermer={fermerDialogue}
      />
    </div>
  );
}
