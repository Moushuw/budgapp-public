"use client";

// Confirmation de la suppression d'une sélection — docs/lot-m2.md §6.4. Le
// texte vient d'un aperçu calculé par le serveur sur la même partition que
// l'écriture : ce qui est annoncé est ce qui part. Quand la sélection contient
// des côtés de virement, un choix est exigé (docs/lot-m2.md §4.4) : sans lui,
// ils seraient ignorés.

import { useId, useState, type ReactNode } from "react";
import { DialogueSuppression } from "@/components/referentiel/DialogueSuppression";
import { Skeleton } from "@/components/ui/skeleton";
import type { ChoixSuppressionVirement, SelectionTransactions } from "@/domain/edition";
import { libelleApercuSuppression } from "./presentation";
import { useApercuSuppression } from "./use-apercu-suppression";

export interface DialogueSuppressionMasseProps {
  readonly ouvert: boolean;
  readonly selection: SelectionTransactions | null;
  readonly enCours: boolean;
  readonly onFermer: () => void;
  readonly onConfirmer: (choix: ChoixSuppressionVirement | null) => void;
}

const OPTIONS_VIREMENT: readonly { readonly valeur: ChoixSuppressionVirement; readonly libelle: string }[] = [
  { valeur: "SUPPRIMER_LES_DEUX", libelle: "Supprimer aussi l'autre côté" },
  { valeur: "DELIER_L_AUTRE", libelle: "Supprimer seulement ces côtés et délier l'autre" },
];

export function DialogueSuppressionMasse(props: DialogueSuppressionMasseProps): ReactNode {
  const { ouvert, selection, enCours, onFermer, onConfirmer } = props;
  const apercus = useApercuSuppression(ouvert ? selection : null);
  const [choix, setChoix] = useState<ChoixSuppressionVirement | null>(null);
  const nomGroupe = useId();

  // Le choix ne survit pas à la fermeture : à la réouverture, aucune option n'est cochée.
  if (!ouvert && choix !== null) {
    setChoix(null);
  }

  const donnees = apercus.data;
  const choixRequis = donnees !== undefined && donnees.sansChoix.ignorees.VIREMENT > 0;
  const apercuAffiche =
    donnees === undefined
      ? undefined
      : choix === "SUPPRIMER_LES_DEUX"
        ? donnees.lesDeux
        : choix === "DELIER_L_AUTRE"
          ? donnees.delier
          : donnees.sansChoix;

  let consequence: ReactNode;
  if (apercus.isError) {
    consequence = <p>{apercus.error.message}</p>;
  } else if (apercuAffiche === undefined) {
    consequence = <Skeleton className="h-10 w-full" />;
  } else {
    consequence = (
      <div className="flex flex-col gap-3">
        {choixRequis && (
          <fieldset data-choix-virements className="flex flex-col gap-2">
            <legend className="text-foreground mb-1 text-sm font-medium">Côtés de virement dans la sélection</legend>
            {OPTIONS_VIREMENT.map((option) => (
              <label key={option.valeur} className="flex items-start gap-2 text-sm">
                <input
                  type="radio"
                  name={nomGroupe}
                  value={option.valeur}
                  checked={choix === option.valeur}
                  disabled={enCours}
                  className="mt-1"
                  onChange={() => {
                    setChoix(option.valeur);
                  }}
                />
                <span>{option.libelle}</span>
              </label>
            ))}
          </fieldset>
        )}
        <p data-apercu-suppression>{libelleApercuSuppression(apercuAffiche)}</p>
      </div>
    );
  }

  return (
    <DialogueSuppression
      ouvert={ouvert}
      onOuvertChange={(valeur) => {
        if (!valeur) {
          onFermer();
        }
      }}
      titre="Supprimer la sélection"
      consequence={consequence}
      enCours={enCours}
      confirmationDesactivee={
        apercus.isFetching || apercuAffiche === undefined || apercuAffiche.aSupprimer === 0 || (choixRequis && choix === null)
      }
      onConfirmer={() => {
        onConfirmer(choixRequis ? choix : null);
      }}
    />
  );
}
