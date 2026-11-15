import { CircleAlert, CircleCheck, Clock, EyeOff, TriangleAlert, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { LIBELLES_ETAT_OCCURRENCE, type EtatOccurrence as EtatOccurrenceValeur } from "@/domain/referentiel";

const ICONES: Record<EtatOccurrenceValeur, LucideIcon> = {
  PREVUE: Clock,
  REALISEE: CircleCheck,
  REALISEE_MONTANT_DIFFERENT: CircleAlert,
  MANQUEE: TriangleAlert,
  IGNOREE: EyeOff,
};

/** L'icône et le libellé : jamais une couleur seule. */
export function EtatOccurrence(props: { readonly etat: EtatOccurrenceValeur }): ReactNode {
  const Icone = ICONES[props.etat];
  return (
    <span className="inline-flex items-center gap-1 text-sm">
      <Icone className="size-4 shrink-0" aria-hidden />
      {LIBELLES_ETAT_OCCURRENCE[props.etat]}
    </span>
  );
}
