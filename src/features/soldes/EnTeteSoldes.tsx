import { ArrowLeft, Plus } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatMontant } from "@/domain/money";
import { LIBELLES_SOURCE_SOLDE } from "@/domain/referentiel";
import { dateLongue, sousTitreCompte, type FicheCompte } from "@/domain/solde";
import { StatutAncrage } from "./StatutAncrage";

export function EnTeteSoldes(props: { readonly fiche: FicheCompte; readonly onSaisir: () => void }): ReactNode {
  const { fiche, onSaisir } = props;
  const dernier = fiche.ancrages[0];
  return (
    <header className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold">Soldes et réconciliation</h1>
          <p className="text-muted-foreground flex flex-wrap items-center gap-2 text-sm">
            {sousTitreCompte(fiche.compte.nom, fiche.compte.type)}
            {fiche.compte.archive && <Badge variant="outline">Archivé</Badge>}
          </p>
          <Link
            href="/parametres?onglet=comptes"
            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm underline-offset-4 hover:underline"
          >
            <ArrowLeft className="size-4" aria-hidden />
            Retour aux comptes
          </Link>
        </div>
        <Button type="button" onClick={onSaisir}>
          <Plus />
          Saisir un solde
        </Button>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-1 rounded-lg border p-4">
          <p className="text-muted-foreground text-sm">Solde calculé au {dateLongue(fiche.aujourdhui)}</p>
          <p data-solde-aujourdhui className="font-montant text-2xl tabular-nums">
            {formatMontant(fiche.soldeAujourdhuiCents, "CENTS")}
          </p>
        </div>
        <div className="flex flex-col gap-1 rounded-lg border p-4">
          <p className="text-muted-foreground text-sm">Dernier solde saisi</p>
          {dernier === undefined ? (
            <p className="text-sm">Aucun solde saisi.</p>
          ) : (
            <>
              <p className="text-sm">
                {dateLongue(dernier.date)} · {LIBELLES_SOURCE_SOLDE[dernier.source]}
              </p>
              <p className="font-montant text-2xl tabular-nums">{formatMontant(dernier.soldeDeclareCents, "CENTS")}</p>
              <StatutAncrage statut={dernier.statut} />
            </>
          )}
        </div>
      </div>
    </header>
  );
}
