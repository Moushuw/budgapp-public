import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatMontant } from "@/domain/money";
import type { PaiementAttenduNonVu } from "@/domain/recurrence";

export interface SectionNonVusProps {
  readonly nonVus: readonly PaiementAttenduNonVu[];
  readonly nbNonVus: number;
  /** Les séries que l'écran connaît : « Modifier la série » est désactivé pour une série absente. */
  readonly idsSeriesConnues: ReadonlySet<string>;
  readonly enCours: boolean;
  readonly onLier: (occurrenceId: string) => void;
  readonly onIgnorer: (occurrenceId: string) => void;
  readonly onModifierSerie: (ruleId: string) => void;
}

/** Les échéances passées sans paiement lié : celles que la confirmation ou le temps ont laissées ouvertes. */
export function SectionNonVus(props: SectionNonVusProps): ReactNode {
  const { nonVus, nbNonVus, idsSeriesConnues, enCours, onLier, onIgnorer, onModifierSerie } = props;
  return (
    <section data-section="non-vus" aria-labelledby="titre-non-vus" className="flex flex-col gap-3">
      <h2 id="titre-non-vus" className="text-lg font-semibold">
        Paiements attendus non vus
      </h2>
      {nonVus.length === 0 ? (
        <p className="text-muted-foreground text-sm">Aucun paiement attendu en retard.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Série</TableHead>
              <TableHead>Échéance</TableHead>
              <TableHead className="text-right">Montant attendu</TableHead>
              <TableHead>
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {nonVus.map((ligne) => (
              <TableRow key={ligne.occurrenceId} data-occurrence-id={ligne.occurrenceId}>
                <TableCell data-colonne="serie" className="whitespace-normal">
                  <span className="font-medium">{ligne.libelle}</span>
                  <span className="text-muted-foreground block text-xs">{ligne.compteNom}</span>
                </TableCell>
                <TableCell data-colonne="echeance">{ligne.echeance}</TableCell>
                <TableCell data-colonne="montant" className="font-montant text-right">
                  {formatMontant(ligne.montantCents, "CENTS")}
                </TableCell>
                <TableCell data-colonne="actions">
                  <div className="flex flex-wrap justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={enCours}
                      onClick={() => {
                        onLier(ligne.occurrenceId);
                      }}
                    >
                      Lier à une transaction
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={enCours}
                      onClick={() => {
                        onIgnorer(ligne.occurrenceId);
                      }}
                    >
                      Ignorer
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={enCours || !idsSeriesConnues.has(ligne.ruleId)}
                      onClick={() => {
                        onModifierSerie(ligne.ruleId);
                      }}
                    >
                      Modifier la série
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {nbNonVus > nonVus.length && (
        <p className="text-muted-foreground text-sm">
          {nonVus.length} affichés sur {nbNonVus}.
        </p>
      )}
    </section>
  );
}
