"use client";

// Dialogue de confirmation de suppression pour un écran de référentiel — spec
// M1 tranche 1 §6.5. `consequence` est un nœud parce que les cas réels
// énumèrent (docs/lot-m1.md §4.2 : sous-catégories listées nommément).

import type { ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export interface DialogueSuppressionProps {
  readonly ouvert: boolean;
  readonly onOuvertChange: (ouvert: boolean) => void;
  readonly titre: string;
  /** Dit ce qui va arriver, chiffres à l'appui. Jamais un avertissement vague. */
  readonly consequence: ReactNode;
  readonly enCours: boolean;
  /** Grise `Supprimer` sans toucher à `Annuler` — par exemple tant qu'un aperçu n'est pas chargé. */
  readonly confirmationDesactivee?: boolean;
  /** Libellé du bouton de confirmation ; « Supprimer » par défaut. */
  readonly libelleConfirmation?: string;
  readonly onConfirmer: () => void;
}

export function DialogueSuppression(props: DialogueSuppressionProps): ReactNode {
  const {
    ouvert,
    onOuvertChange,
    titre,
    consequence,
    enCours,
    confirmationDesactivee = false,
    libelleConfirmation = "Supprimer",
    onConfirmer,
  } = props;

  return (
    <AlertDialog open={ouvert} onOpenChange={onOuvertChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{titre}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="max-h-[50dvh] overflow-y-auto">{consequence}</div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={enCours}>Annuler</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={enCours || confirmationDesactivee}
            // AlertDialogAction ferme le dialogue au clic par défaut (Radix) ;
            // preventDefault laisse onSuccess piloter la fermeture, sinon une
            // erreur de mutation s'affiche sur un dialogue déjà parti.
            onClick={(evenement) => {
              evenement.preventDefault();
              onConfirmer();
            }}
          >
            {libelleConfirmation}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
