import { CircleCheck, MessageSquareText, TriangleAlert, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { LIBELLES_STATUT_ANCRAGE, type StatutAncrage as StatutAncrageValeur } from "@/domain/solde";

const ICONES: Record<StatutAncrageValeur, LucideIcon> = {
  EQUILIBRE: CircleCheck,
  EXPLIQUE: MessageSquareText,
  ECART_OUVERT: TriangleAlert,
};

/** L'icône et le libellé : jamais une couleur seule. */
export function StatutAncrage(props: { readonly statut: StatutAncrageValeur }): ReactNode {
  const Icone = ICONES[props.statut];
  return (
    <span
      data-statut={props.statut}
      className={cn("inline-flex items-center gap-1 text-sm", props.statut === "ECART_OUVERT" && "text-avertissement")}
    >
      <Icone className="size-4 shrink-0" aria-hidden />
      {LIBELLES_STATUT_ANCRAGE[props.statut]}
    </span>
  );
}
