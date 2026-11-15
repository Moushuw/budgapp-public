import { Trash2 } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatMontant } from "@/domain/money";
import { LIBELLES_SOURCE_SOLDE } from "@/domain/referentiel";
import { dateLongue, type AncrageAffiche, type FicheCompte } from "@/domain/solde";
import { hrefTransactionsDuJour } from "./liens";
import { StatutAncrage } from "./StatutAncrage";

export interface TableauAncragesProps {
  readonly fiche: FicheCompte;
  readonly enCours: boolean;
  readonly onReconciliation: (ancrage: AncrageAffiche) => void;
  readonly onSupprimer: (ancrage: AncrageAffiche) => void;
}

export function TableauAncrages(props: TableauAncragesProps): ReactNode {
  const { fiche, enCours, onReconciliation, onSupprimer } = props;
  const { ancrages, nbAncrages } = fiche;
  return (
    <section aria-labelledby="titre-ancrages" className="flex flex-col gap-3">
      <h2 id="titre-ancrages" className="text-lg font-semibold">
        Soldes saisis
      </h2>
      {ancrages.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Aucun solde saisi pour ce compte. Saisis le solde d&apos;un relevé pour vérifier que les transactions
          enregistrées le reproduisent.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Source</TableHead>
              <TableHead className="text-right">Solde déclaré</TableHead>
              <TableHead className="text-right">Solde calculé</TableHead>
              <TableHead className="text-right">Écart courant</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead>Ajustement</TableHead>
              <TableHead>
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ancrages.map((ancrage) => {
              const ajustement = ancrage.reconciliation?.ajustement ?? null;
              return (
                <TableRow key={ancrage.id} data-ancrage-id={ancrage.id}>
                  <TableCell>{dateLongue(ancrage.date)}</TableCell>
                  <TableCell>{LIBELLES_SOURCE_SOLDE[ancrage.source]}</TableCell>
                  <TableCell className="font-montant text-right tabular-nums">
                    {formatMontant(ancrage.soldeDeclareCents, "CENTS")}
                  </TableCell>
                  <TableCell className="font-montant text-right tabular-nums">
                    {formatMontant(ancrage.soldeCalculeCents, "CENTS")}
                  </TableCell>
                  <TableCell data-colonne="ecart" className="font-montant text-right tabular-nums">
                    {formatMontant(ancrage.ecartCourantCents, "CENTS")}
                  </TableCell>
                  <TableCell>
                    <StatutAncrage statut={ancrage.statut} />
                  </TableCell>
                  <TableCell>
                    {ajustement === null ? (
                      "—"
                    ) : (
                      <Link
                        href={hrefTransactionsDuJour(ancrage.accountId, ajustement.date)}
                        className="font-montant underline-offset-4 hover:underline"
                      >
                        {`Ajustement de ${formatMontant(ajustement.montantCents, "CENTS")}`}
                      </Link>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          onReconciliation(ancrage);
                        }}
                      >
                        Réconciliation
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Supprimer"
                        disabled={enCours}
                        onClick={() => {
                          onSupprimer(ancrage);
                        }}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
      {nbAncrages > ancrages.length && (
        <p className="text-muted-foreground text-sm">
          {`${String(ancrages.length)} soldes affichés sur ${String(nbAncrages)}.`}
        </p>
      )}
    </section>
  );
}
