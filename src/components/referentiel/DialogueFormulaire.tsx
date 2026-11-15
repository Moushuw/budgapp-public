"use client";

// Enveloppe de dialogue pour un formulaire de référentiel — spec M1 tranche 1
// §6.4. Ne rend ni pied de page ni bouton de soumission : les boutons
// appartiennent au <form> du composant enfant (CLAUDE.md §9).

import type { ReactNode } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export interface DialogueFormulaireProps {
  readonly ouvert: boolean;
  readonly onOuvertChange: (ouvert: boolean) => void;
  readonly titre: string;
  readonly description?: string;
  /** Classes ajoutées au contenu, pour un dialogue qui a besoin de plus que la largeur par défaut. */
  readonly className?: string;
  readonly children: ReactNode;
}

export function DialogueFormulaire(props: DialogueFormulaireProps): ReactNode {
  const { ouvert, onOuvertChange, titre, description, className, children } = props;

  return (
    <Dialog open={ouvert} onOpenChange={onOuvertChange}>
      <DialogContent className={cn("max-h-[calc(100dvh-2rem)] grid-rows-[auto_minmax(0,1fr)]", className)}>
        <DialogHeader>
          <DialogTitle>{titre}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {/* overflow-x-hidden : le halo de clic du Switch (after:-inset-x-3) dépasse le bord droit, comme dans FormulaireRegle. */}
        <div className="-m-1 flex min-h-0 flex-col overflow-y-auto overflow-x-hidden p-1">{children}</div>
      </DialogContent>
    </Dialog>
  );
}
