import { Plus, SlidersHorizontal } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { TotauxTransactions, TriTransactions } from "@/domain/consultation";
import { BarreRecherche } from "./BarreRecherche";
import { libelleTotaux } from "./presentation";
import { SelecteurTri } from "./SelecteurTri";

export interface EnTeteTransactionsProps {
  readonly totaux: TotauxTransactions | null;
  readonly portee: string;
  readonly texte: string;
  readonly tri: TriTransactions;
  readonly onRechercher: (texte: string) => void;
  readonly onChangerTri: (tri: TriTransactions) => void;
  readonly onOuvrirFiltres: () => void;
  readonly onNouvelleTransaction: () => void;
  /** Mobile seulement : « Sélectionner » fait apparaître les cases des cartes. */
  readonly modeSelectionMobile: boolean;
  readonly onBasculerSelectionMobile: () => void;
}

export function EnTeteTransactions(props: EnTeteTransactionsProps): ReactNode {
  const {
    totaux,
    portee,
    texte,
    tri,
    onRechercher,
    onChangerTri,
    onOuvrirFiltres,
    onNouvelleTransaction,
    modeSelectionMobile,
    onBasculerSelectionMobile,
  } = props;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="text-lg font-semibold">Transactions</h2>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            className="md:hidden"
            onClick={onBasculerSelectionMobile}
          >
            {modeSelectionMobile ? "Terminer la sélection" : "Sélectionner"}
          </Button>
          <Button type="button" onClick={onNouvelleTransaction}>
            <Plus />
            Nouvelle transaction
          </Button>
        </div>
      </div>
      <div>
        {totaux === null ? (
          <Skeleton className="mt-1 h-5 w-48" />
        ) : (
          <p className="text-sm" data-totaux>
            {libelleTotaux(totaux)}
          </p>
        )}
        <p className="text-muted-foreground text-sm">Période : {portee}</p>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <BarreRecherche key={texte} texteInitial={texte} onRechercher={onRechercher} />
        <SelecteurTri tri={tri} onChange={onChangerTri} />
        <Button variant="outline" onClick={onOuvrirFiltres}>
          <SlidersHorizontal />
          Filtres
        </Button>
      </div>
    </div>
  );
}
