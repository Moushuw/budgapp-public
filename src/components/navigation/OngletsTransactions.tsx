"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { ONGLETS_TRANSACTIONS, ongletTransactionsActif } from "./onglets";

/** Barre secondaire de Transactions : trois routes, onglet actif par égalité exacte du chemin. */
export function OngletsTransactions(): ReactNode {
  const actif = ongletTransactionsActif(usePathname());

  return (
    <nav
      aria-label="Sections des transactions"
      className="flex min-w-0 items-center gap-1 overflow-x-auto [scrollbar-width:none]"
    >
      {ONGLETS_TRANSACTIONS.map((onglet) => (
        <Link
          key={onglet.href}
          href={onglet.href}
          aria-current={onglet.href === actif ? "page" : undefined}
          className={cn(
            "text-muted-foreground hover:bg-accent hover:text-accent-foreground shrink-0 rounded-md px-3 py-2 text-sm font-medium whitespace-nowrap",
            "aria-[current=page]:bg-accent aria-[current=page]:text-accent-foreground",
          )}
        >
          {onglet.libelle}
        </Link>
      ))}
    </nav>
  );
}
