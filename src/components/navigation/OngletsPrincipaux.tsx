"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { ONGLETS_PRINCIPAUX, ongletActif } from "./onglets";
import { useCentrerOngletActif } from "./use-centrer-onglet-actif";

export function OngletsPrincipaux(): ReactNode {
  const chemin = usePathname();
  const navRef = useRef<HTMLElement>(null);
  const actif = ongletActif(chemin, ONGLETS_PRINCIPAUX);
  useCentrerOngletActif(navRef, chemin);

  return (
    <nav
      ref={navRef}
      aria-label="Navigation principale"
      className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto pe-1 [scrollbar-width:none]"
    >
      {ONGLETS_PRINCIPAUX.map((onglet) => (
        <Link
          key={onglet.href}
          href={onglet.href}
          aria-current={onglet.href === actif ? "page" : undefined}
          className={cn(
            "text-muted-foreground shrink-0 whitespace-nowrap hover:bg-accent hover:text-accent-foreground rounded-md px-3 py-2 text-sm font-medium",
            "aria-[current=page]:bg-accent aria-[current=page]:text-accent-foreground",
          )}
        >
          {onglet.libelle}
        </Link>
      ))}
    </nav>
  );
}
