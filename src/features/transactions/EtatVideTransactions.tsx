import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { EtatListe } from "./presentation";

export interface EtatVideTransactionsProps {
  readonly etat: Exclude<EtatListe, "LISTE">;
  readonly portee: string;
  readonly messageErreur: string | null;
  readonly onToutEffacer: () => void;
  readonly onReessayer: () => void;
}

export function EtatVideTransactions(props: EtatVideTransactionsProps): ReactNode {
  const { etat, portee, messageErreur, onToutEffacer, onReessayer } = props;

  switch (etat) {
    case "CHARGEMENT":
      return (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      );
    case "ERREUR":
      return (
        <div className="border-destructive/40 bg-destructive/10 text-destructive flex flex-col items-start gap-2 rounded-lg border px-4 py-3 text-sm">
          <p>{messageErreur ?? "Une erreur inattendue est survenue."}</p>
          <Button variant="outline" size="sm" onClick={onReessayer}>
            Réessayer
          </Button>
        </div>
      );
    case "SANS_TRANSACTION":
      return (
        <div className="flex flex-col items-start gap-3">
          <p className="text-muted-foreground text-sm">Aucune transaction enregistrée pour l&apos;instant.</p>
          <Button asChild>
            <Link href="/transactions/import">Importer un relevé</Link>
          </Button>
        </div>
      );
    case "AUCUN_RESULTAT_FILTRES":
      return (
        <div className="flex flex-col items-start gap-3">
          <p className="text-muted-foreground text-sm">Aucune transaction ne correspond aux filtres.</p>
          <Button variant="outline" onClick={onToutEffacer}>
            Tout effacer
          </Button>
        </div>
      );
    case "AUCUN_RESULTAT_PERIODE":
      return (
        <div className="flex flex-col items-start gap-3">
          <p className="text-muted-foreground text-sm">Aucune transaction pour {portee}.</p>
          <Button asChild>
            <Link href="/transactions/import">Importer un relevé</Link>
          </Button>
        </div>
      );
  }
}
