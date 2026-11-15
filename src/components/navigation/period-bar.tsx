// Barre de période persistante — composant de présentation (docs/lot-m2.md
// §5.5) : ni hook ni action, il reçoit la période et des rappels. La version
// vivante est features/periode/BarrePeriodeVivante.tsx.

import { ChevronLeft, ChevronRight, Flag, Upload } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  changerTypePeriode,
  deplacerPeriode,
  libellePeriode,
  type Periode,
  type TypePeriode,
} from "@/domain/periode";

export interface PeriodBarProps {
  readonly periode: Periode;
  readonly enAttente: boolean;
  /** null (chargement, erreur) ou 0 : l'indicateur est absent. */
  readonly nbARevoir: number | null;
  /** Libellé accessible de l'indicateur, fourni par l'appelant ; null quand l'indicateur est absent. */
  readonly libelleARevoir: string | null;
  readonly hrefARevoir: string;
  readonly onChoisir: (periode: Periode) => void;
}

const TYPES: readonly { readonly type: TypePeriode; readonly libelle: string }[] = [
  { type: "MOIS", libelle: "Mois" },
  { type: "ANNEE", libelle: "Année" },
  { type: "TOUT", libelle: "Tout" },
];

export function PeriodBar(props: PeriodBarProps): ReactNode {
  const { periode, enAttente, nbARevoir, libelleARevoir, hrefARevoir, onChoisir } = props;

  return (
    <div className="border-border bg-muted/40 border-b" aria-busy={enAttente}>
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-1 px-4 py-1.5 text-sm">
        <div role="group" aria-label="Type de période" className="bg-background flex rounded-lg border p-0.5">
          {TYPES.map(({ type, libelle }) => (
            <Button
              key={type}
              type="button"
              variant={periode.type === type ? "secondary" : "ghost"}
              size="sm"
              aria-pressed={periode.type === type}
              onClick={() => {
                onChoisir(changerTypePeriode(periode, type));
              }}
            >
              {libelle}
            </Button>
          ))}
        </div>

        <div className="flex items-center gap-1">
          {periode.type !== "TOUT" && (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Période précédente"
              onClick={() => {
                onChoisir(deplacerPeriode(periode, -1));
              }}
            >
              <ChevronLeft />
            </Button>
          )}
          <div data-periode className="min-w-16 text-center font-medium">
            <span className="hidden sm:inline">{libellePeriode(periode, "LONG")}</span>
            <span className="sm:hidden">{libellePeriode(periode, "COURT")}</span>
          </div>
          {periode.type !== "TOUT" && (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Période suivante"
              onClick={() => {
                onChoisir(deplacerPeriode(periode, 1));
              }}
            >
              <ChevronRight />
            </Button>
          )}
        </div>

        <div className="ml-auto flex items-center gap-2">
          {nbARevoir !== null && nbARevoir > 0 && (
            <Button asChild variant="outline" size="sm">
              <Link href={hrefARevoir} aria-label={libelleARevoir ?? undefined}>
                <Flag className="text-avertissement" />
                <span className="hidden sm:inline">{String(nbARevoir)} à revoir</span>
              </Link>
            </Button>
          )}
          <Button asChild variant="outline" size="sm">
            <Link href="/transactions/import" aria-label="Importer un relevé">
              <Upload />
              <span className="hidden sm:inline">Importer un relevé</span>
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
