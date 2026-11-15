import { X } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import type { FiltresTransactions, Pastille } from "@/domain/consultation";
import { pastillesActives } from "@/domain/consultation";
import { libellePastille, type NomsReferentiel } from "./presentation";

export interface PastillesFiltresProps {
  readonly filtres: FiltresTransactions;
  readonly noms: NomsReferentiel;
  readonly onRetirer: (pastille: Pastille) => void;
  readonly onToutEffacer: () => void;
}

function cleDe(pastille: Pastille): string {
  return "id" in pastille ? `${pastille.type}-${pastille.id}` : pastille.type;
}

export function PastillesFiltres(props: PastillesFiltresProps): ReactNode {
  const { filtres, noms, onRetirer, onToutEffacer } = props;
  const pastilles = pastillesActives(filtres);
  if (pastilles.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {pastilles.map((pastille) => {
        const libelle = libellePastille(pastille, noms);
        return (
          <button
            key={cleDe(pastille)}
            type="button"
            aria-label={`Retirer le filtre ${libelle}`}
            className="bg-secondary text-secondary-foreground hover:bg-secondary/80 focus-visible:ring-ring/50 inline-flex min-h-7 max-w-full items-center gap-1 rounded-full px-3 py-1 text-xs font-medium outline-none focus-visible:ring-3"
            onClick={() => {
              onRetirer(pastille);
            }}
          >
            <span className="min-w-0 break-words">{libelle}</span>
            <X className="size-3 shrink-0" aria-hidden />
          </button>
        );
      })}
      <Button variant="ghost" size="sm" onClick={onToutEffacer}>
        Tout effacer
      </Button>
    </div>
  );
}
