"use client";

// « Créer une règle depuis une transaction » — docs/lot-m2.md §5.3 : le
// formulaire de règle de M1, réutilisé tel quel, ouvert sur une valeur initiale.

import type { ReactNode } from "react";
import { DialogueFormulaire } from "@/components/referentiel/DialogueFormulaire";
import { FormulaireRegle } from "@/features/regles/FormulaireRegle";
import type { EntreeRegle } from "@/features/regles/schema";

export interface DialogueRegleDepuisTransactionProps {
  /** null = fermé. */
  readonly entree: EntreeRegle | null;
  readonly enCours: boolean;
  readonly onSoumettre: (entree: EntreeRegle) => void;
  readonly onFermer: () => void;
}

export function DialogueRegleDepuisTransaction(props: DialogueRegleDepuisTransactionProps): ReactNode {
  const { entree, enCours, onSoumettre, onFermer } = props;
  return (
    <DialogueFormulaire
      ouvert={entree !== null}
      onOuvertChange={(valeur) => {
        if (!valeur) {
          onFermer();
        }
      }}
      titre="Nouvelle règle"
    >
      {entree !== null && (
        <FormulaireRegle valeurInitiale={entree} enCours={enCours} onAnnuler={onFermer} onSoumettre={onSoumettre} />
      )}
    </DialogueFormulaire>
  );
}
