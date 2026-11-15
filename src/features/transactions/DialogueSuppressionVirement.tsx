"use client";

// Supprimer un côté de virement — docs/lot-m2.md §4.4. Deux options, chacune dite en clair avec sa conséquence, ou le
// motif qui la refuse. Forme de DialogueSuppression (AlertDialog, preventDefault : onSuccess pilote la fermeture).

import { useId, type ReactNode } from "react";
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
import type { DetailTransaction } from "@/domain/consultation";
import { messageRefus, type ChoixSuppressionVirement } from "@/domain/edition";
import { libelleSuppressionVirement } from "./presentation";

export interface DialogueSuppressionVirementProps {
  readonly ouvert: boolean;
  readonly onOuvertChange: (ouvert: boolean) => void;
  readonly detail: DetailTransaction | null;
  readonly enCours: boolean;
  readonly onConfirmer: (choix: ChoixSuppressionVirement) => void;
}

const LIBELLE_DELIER = "Supprimer celle-ci et délier l'autre";
const LIBELLE_DEUX = "Supprimer les deux";

export function DialogueSuppressionVirement(props: DialogueSuppressionVirementProps): ReactNode {
  const { ouvert, onOuvertChange, detail, enCours, onConfirmer } = props;
  const idDelier = useId();
  const idDeux = useId();
  const refusDeux = detail?.refus.suppressionLesDeux ?? null;
  const refusDelier = detail?.refus.suppressionDelier ?? null;

  return (
    <AlertDialog open={ouvert && detail !== null} onOpenChange={onOuvertChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Supprimer un côté de virement</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="flex max-h-[50dvh] flex-col gap-3 overflow-y-auto">
              {detail !== null && (
                <>
                  <p id={idDelier} data-choix="delier-l-autre">
                    <strong>{LIBELLE_DELIER}</strong>{" "}
                    {refusDelier === null ? libelleSuppressionVirement(detail, "DELIER_L_AUTRE") : messageRefus(refusDelier)}
                  </p>
                  <p id={idDeux} data-choix="supprimer-les-deux">
                    <strong>{LIBELLE_DEUX}</strong>{" "}
                    {refusDeux === null ? libelleSuppressionVirement(detail, "SUPPRIMER_LES_DEUX") : messageRefus(refusDeux)}
                  </p>
                </>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        {/* Trois boutons dont un long libellé : ils passent à la ligne plutôt que de sortir du dialogue. */}
        <AlertDialogFooter className="sm:flex-wrap">
          <AlertDialogCancel disabled={enCours}>Annuler</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={enCours || refusDelier !== null}
            aria-describedby={idDelier}
            onClick={(evenement) => {
              evenement.preventDefault();
              onConfirmer("DELIER_L_AUTRE");
            }}
          >
            {LIBELLE_DELIER}
          </AlertDialogAction>
          <AlertDialogAction
            variant="destructive"
            disabled={enCours || refusDeux !== null}
            aria-describedby={idDeux}
            onClick={(evenement) => {
              evenement.preventDefault();
              onConfirmer("SUPPRIMER_LES_DEUX");
            }}
          >
            {LIBELLE_DEUX}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
