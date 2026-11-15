"use client";

import type { ReactNode } from "react";
import { DialogueFormulaire } from "@/components/referentiel/DialogueFormulaire";
import { FormulaireNouvelleTransaction, type ReferentielEcriture } from "./FormulaireNouvelleTransaction";
import type { SaisieNouvelleTransaction } from "./schema";

export interface DialogueNouvelleTransactionProps {
  readonly ouvert: boolean;
  readonly referentiel: ReferentielEcriture;
  readonly enCours: boolean;
  readonly onSoumettre: (saisie: SaisieNouvelleTransaction) => void;
  readonly onFermer: () => void;
}

/** Le formulaire n'est monté qu'ouvert : à chaque ouverture, la date du jour est recalculée et les erreurs sont vidées. */
export function DialogueNouvelleTransaction(props: DialogueNouvelleTransactionProps): ReactNode {
  const { ouvert, referentiel, enCours, onSoumettre, onFermer } = props;
  return (
    <DialogueFormulaire
      ouvert={ouvert}
      onOuvertChange={(valeur) => {
        if (!valeur) {
          onFermer();
        }
      }}
      titre="Nouvelle transaction"
    >
      <FormulaireNouvelleTransaction
        referentiel={referentiel}
        enCours={enCours}
        onSoumettre={onSoumettre}
        onAnnuler={onFermer}
      />
    </DialogueFormulaire>
  );
}
