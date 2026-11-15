import type { ReactNode } from "react";
import type { LigneTransactionListe } from "@/domain/consultation";
import { CarteTransaction } from "./CarteTransaction";
import { estCochee, type EtatSelection } from "./selection";

export interface CartesTransactionsProps {
  readonly lignes: readonly LigneTransactionListe[];
  readonly depliees: ReadonlySet<string>;
  readonly selection: EtatSelection;
  readonly modeSelectionMobile: boolean;
  readonly onOuvrir: (id: string) => void;
  readonly onBasculer: (id: string) => void;
  readonly onBasculerLigne: (id: string) => void;
}

export function CartesTransactions(props: CartesTransactionsProps): ReactNode {
  const { lignes, depliees, selection, modeSelectionMobile, onOuvrir, onBasculer, onBasculerLigne } = props;
  return (
    <div className="flex flex-col gap-3 md:hidden">
      {lignes.map((ligne) => (
        <CarteTransaction
          key={ligne.id}
          ligne={ligne}
          deplie={depliees.has(ligne.id)}
          modeSelection={modeSelectionMobile}
          cochee={estCochee(selection, ligne.id)}
          caseDesactivee={selection.mode === "FILTRE"}
          onOuvrir={onOuvrir}
          onBasculer={onBasculer}
          onBasculerSelection={onBasculerLigne}
        />
      ))}
    </div>
  );
}
