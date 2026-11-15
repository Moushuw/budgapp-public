import { Fragment, type ReactNode } from "react";
import { Table, TableBody, TableCaption, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { LigneTransactionListe } from "@/domain/consultation";
import type { CategorieListe } from "@/server/actions/categories";
import { CaseSelection } from "./CaseSelection";
import { LigneTransactionTableau, type BeneficiaireOption } from "./LigneTransactionTableau";
import { LignesVentilationTableau } from "./LignesVentilationTableau";
import type { ChangementEnPlace } from "./optimiste";
import { estCochee, toutesAfficheesCochees, type EtatSelection } from "./selection";

export interface TableauTransactionsProps {
  readonly lignes: readonly LigneTransactionListe[];
  readonly depliees: ReadonlySet<string>;
  readonly selection: EtatSelection;
  readonly categories: readonly CategorieListe[];
  readonly beneficiaires: readonly BeneficiaireOption[];
  readonly onOuvrir: (id: string) => void;
  readonly onBasculer: (id: string) => void;
  readonly onBasculerLigne: (id: string) => void;
  readonly onBasculerAffichees: (idsAffiches: readonly string[]) => void;
  readonly onModifierEnPlace: (ligne: LigneTransactionListe, changement: ChangementEnPlace) => void;
}

export function TableauTransactions(props: TableauTransactionsProps): ReactNode {
  const {
    lignes,
    depliees,
    selection,
    categories,
    beneficiaires,
    onOuvrir,
    onBasculer,
    onBasculerLigne,
    onBasculerAffichees,
    onModifierEnPlace,
  } = props;
  const idsAffiches = lignes.map((ligne) => ligne.id);
  return (
    <div className="hidden md:block">
      <Table>
        <TableCaption className="sr-only">Transactions</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead className="w-8">
              <CaseSelection
                aria-label="Sélectionner les transactions affichées"
                checked={toutesAfficheesCochees(selection, idsAffiches)}
                disabled={selection.mode === "FILTRE"}
                onChange={() => {
                  onBasculerAffichees(idsAffiches);
                }}
              />
            </TableHead>
            <TableHead>Date</TableHead>
            <TableHead>Compte</TableHead>
            <TableHead className="whitespace-normal">Description</TableHead>
            <TableHead className="whitespace-normal">Bénéficiaire</TableHead>
            <TableHead className="whitespace-normal">Sous-catégorie</TableHead>
            <TableHead>Étiquettes</TableHead>
            <TableHead className="text-right">Montant</TableHead>
            <TableHead>État</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {lignes.map((ligne) => {
            const deplie = depliees.has(ligne.id);
            return (
              <Fragment key={ligne.id}>
                <LigneTransactionTableau
                  ligne={ligne}
                  deplie={deplie}
                  cochee={estCochee(selection, ligne.id)}
                  caseDesactivee={selection.mode === "FILTRE"}
                  categories={categories}
                  beneficiaires={beneficiaires}
                  onOuvrir={onOuvrir}
                  onBasculer={onBasculer}
                  onBasculerSelection={onBasculerLigne}
                  onModifierEnPlace={onModifierEnPlace}
                />
                {deplie && <LignesVentilationTableau ligne={ligne} />}
              </Fragment>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
