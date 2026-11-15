import { ArrowLeftRight, CircleSlash, EyeOff, Flag, Split, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { LigneTransactionListe } from "@/domain/consultation";
import { cn } from "@/lib/utils";
import { etatsDeLigne, type CleEtat } from "./presentation";

const ICONES: Record<CleEtat, LucideIcon> = {
  A_REVOIR: Flag,
  VIREMENT: ArrowLeftRight,
  VENTILEE: Split,
  EXCLUE_BUDGET: CircleSlash,
  EXCLUE_RAPPORTS: EyeOff,
};

export interface EtatsTransactionProps {
  readonly ligne: LigneTransactionListe;
  readonly variante: "icones" | "pastilles";
}

export function EtatsTransaction(props: EtatsTransactionProps): ReactNode {
  const { ligne, variante } = props;
  const etats = etatsDeLigne(ligne);
  if (etats.length === 0) {
    return null;
  }

  if (variante === "pastilles") {
    return (
      <div className="flex flex-wrap gap-1">
        {etats.map((etat) => {
          const Icone = ICONES[etat.cle];
          return (
            <Badge key={etat.cle} variant="outline" data-etat={etat.cle}>
              <Icone aria-hidden />
              {etat.libelle}
            </Badge>
          );
        })}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      {etats.map((etat) => {
        const Icone = ICONES[etat.cle];
        return (
          <Tooltip key={etat.cle}>
            <TooltipTrigger asChild>
              <span
                role="img"
                aria-label={etat.libelle}
                data-etat={etat.cle}
                className={cn("inline-flex", etat.cle === "A_REVOIR" ? "text-avertissement" : "text-muted-foreground")}
              >
                <Icone className="size-4" aria-hidden />
              </span>
            </TooltipTrigger>
            <TooltipContent>{etat.libelle}</TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}
