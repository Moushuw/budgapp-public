"use client";

// Carte repliable générique — docs/lot-m1.md §8.2. Pas de nouveau composant
// shadcn (journal INDEX.md 2026-09-13, bug du CLI shadcn déjà rencontré une
// fois). L'en-tête est un <button> natif et non le Button shadcn : sa base
// impose whitespace-nowrap et une hauteur fixe, ce qui empêche le détail de
// passer à la ligne (docs/pilotage/passes/m1.md, P3-a) ; sa variante ghost
// colore aussi aria-expanded, ce qui griserait les en-têtes ouverts.

import { ChevronDown, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export interface SectionRepliableProps {
  readonly titre: string;
  readonly compte: number;
  readonly detail?: string | null;
  readonly ouvertParDefaut?: boolean;
  readonly children: ReactNode;
}

export function SectionRepliable(props: SectionRepliableProps): ReactNode {
  const { titre, compte, detail, ouvertParDefaut = true, children } = props;
  const [ouvert, setOuvert] = useState(ouvertParDefaut);

  return (
    <Card data-section-repliable="">
      <CardHeader>
        <button
          type="button"
          data-entete-section=""
          aria-expanded={ouvert}
          className="-mx-2 flex min-h-8 w-[calc(100%+1rem)] min-w-0 items-start justify-between gap-1.5 rounded-lg border border-transparent px-2 py-[3px] text-left outline-none transition-all select-none hover:bg-muted hover:text-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:translate-y-px dark:hover:bg-muted/50"
          onClick={() => { setOuvert((valeur) => !valeur); }}
        >
          <span data-entete-texte="" className="min-w-0 text-base font-semibold [overflow-wrap:anywhere]">
            {titre} <span className="text-muted-foreground font-normal">({compte}{detail ? ` · ${detail}` : ""})</span>
          </span>
          {ouvert ? (
            <ChevronDown data-chevron-section="" className="mt-1 size-4 shrink-0" />
          ) : (
            <ChevronRight data-chevron-section="" className="mt-1 size-4 shrink-0" />
          )}
        </button>
      </CardHeader>
      {ouvert && <CardContent>{children}</CardContent>}
    </Card>
  );
}
