import { CornerDownRight } from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { TableCell, TableRow } from "@/components/ui/table";
import type { LigneTransactionListe } from "@/domain/consultation";
import { MontantTransaction } from "./MontantTransaction";

/** Les filles d'un parent déplié. Pas de `data-transaction-id` : une fille n'est pas une ligne de la liste. */
export function LignesVentilationTableau(props: { readonly ligne: LigneTransactionListe }): ReactNode {
  const { ligne } = props;
  return (
    <>
      {ligne.lignesVentilation.map((fille) => (
        <TableRow key={fille.id} data-ligne-ventilation-id={fille.id} className="bg-muted/30">
          <TableCell />
          <TableCell />
          <TableCell />
          <TableCell className="whitespace-normal wrap-anywhere">
            <div className="text-muted-foreground flex items-start gap-1 text-xs">
              <CornerDownRight className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              <span>{fille.note ?? ""}</span>
            </div>
          </TableCell>
          <TableCell />
          <TableCell className="whitespace-normal wrap-anywhere">
            {fille.sousCategorieNom === null
              ? "Non catégorisée"
              : fille.categorieNom === null
                ? fille.sousCategorieNom
                : `${fille.categorieNom} › ${fille.sousCategorieNom}`}
          </TableCell>
          <TableCell>
            <div className="flex flex-wrap gap-1">
              {fille.etiquettes.map((etiquette) => (
                <Badge key={etiquette.id} variant="secondary">
                  {etiquette.nom}
                </Badge>
              ))}
            </div>
          </TableCell>
          <TableCell className="text-right">
            <MontantTransaction cents={fille.montantCents} />
          </TableCell>
          <TableCell />
        </TableRow>
      ))}
      {ligne.lignesVentilation.length < ligne.nbLignesVentilation && (
        <TableRow className="bg-muted/30">
          <TableCell colSpan={9} className="text-muted-foreground text-xs">
            {String(ligne.lignesVentilation.length)} lignes affichées sur {String(ligne.nbLignesVentilation)}
          </TableCell>
        </TableRow>
      )}
    </>
  );
}
