"use client";

import type { ReactNode } from "react";
import { DialogueFormulaire } from "@/components/referentiel/DialogueFormulaire";
import type { CategorieListe } from "@/server/actions/categories";
import {
  FormulaireRecurrence,
  type ModeFormulaireRecurrence,
  type OptionCompte,
} from "./FormulaireRecurrence";
import type { ValeursFormulaireRecurrence } from "./schema";

const TITRES: Record<ModeFormulaireRecurrence, string> = {
  CONFIRMATION: "Confirmer la récurrence",
  CREATION: "Nouvelle récurrence",
  CREATION_DEPUIS_TRANSACTION: "Créer une récurrence",
  MODIFICATION: "Modifier la récurrence",
};

/** Ce que l'écran a décidé d'ouvrir ; null : le dialogue est fermé. */
export interface OuvertureDialogueRecurrence {
  readonly mode: ModeFormulaireRecurrence;
  readonly valeursInitiales: ValeursFormulaireRecurrence;
  readonly nomCompte: string | null;
}

export interface DialogueRecurrenceProps {
  readonly ouverture: OuvertureDialogueRecurrence | null;
  readonly comptes: readonly OptionCompte[];
  readonly categories: readonly CategorieListe[];
  readonly enCours: boolean;
  readonly onSoumettre: (valeurs: ValeursFormulaireRecurrence) => void;
  readonly onFermer: () => void;
}

/** Le formulaire n'est monté qu'ouvert : à chaque ouverture, les valeurs repartent de celles de l'écran et les erreurs sont vidées. */
export function DialogueRecurrence(props: DialogueRecurrenceProps): ReactNode {
  const { ouverture, comptes, categories, enCours, onSoumettre, onFermer } = props;
  return (
    <DialogueFormulaire
      ouvert={ouverture !== null}
      onOuvertChange={(valeur) => {
        if (!valeur) {
          onFermer();
        }
      }}
      titre={TITRES[ouverture?.mode ?? "CREATION"]}
    >
      {ouverture !== null && (
        <FormulaireRecurrence
          mode={ouverture.mode}
          valeursInitiales={ouverture.valeursInitiales}
          comptes={comptes}
          nomCompte={ouverture.nomCompte}
          categories={categories}
          enCours={enCours}
          onSoumettre={onSoumettre}
          onAnnuler={onFermer}
        />
      )}
    </DialogueFormulaire>
  );
}
