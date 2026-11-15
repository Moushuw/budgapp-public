import { MoreHorizontal } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LIMITE_SERIES, libelleCadence, type SerieAffichee } from "@/domain/recurrence";
import { cn } from "@/lib/utils";
import { libelleMontantSerie, libelleVentilationSerie } from "./libelles";

export interface ActionsSerie {
  readonly onVoirEcheances: (serie: SerieAffichee) => void;
  readonly onModifier: (serie: SerieAffichee) => void;
  readonly onTerminer: (serie: SerieAffichee) => void;
  readonly onSupprimer: (serie: SerieAffichee) => void;
}

export interface SectionSeriesProps {
  readonly series: readonly SerieAffichee[];
  readonly tronquees: boolean;
  readonly actions: ActionsSerie;
}

/** Les deux tableaux (actives, terminées) partagent ces colonnes : mêmes largeurs, donc même grille. Somme : 100 %. */
interface ColonneSerie {
  readonly cle: string;
  readonly entete: string;
  readonly largeur: string;
  readonly alignement?: "droite";
}

const COLONNES_SERIES: readonly ColonneSerie[] = [
  { cle: "serie", entete: "Série", largeur: "w-[22%]" },
  { cle: "compte", entete: "Compte", largeur: "w-[12%]" },
  { cle: "montant", entete: "Montant", largeur: "w-[12%]", alignement: "droite" },
  { cle: "cadence", entete: "Cadence", largeur: "w-[16%]" },
  { cle: "prochaine", entete: "Prochaine", largeur: "w-[11%]" },
  { cle: "liees", entete: "Liées", largeur: "w-[6%]", alignement: "droite" },
  { cle: "sous-categorie", entete: "Sous-catégorie", largeur: "w-[17%]" },
  { cle: "actions", entete: "Actions", largeur: "w-[4%]" },
];

function libelleSousCategorie(serie: SerieAffichee): string {
  if (serie.sousCategorieNom === null) {
    return "Aucune";
  }
  return serie.categorieNom === null ? serie.sousCategorieNom : `${serie.categorieNom} › ${serie.sousCategorieNom}`;
}

function TableauSeries(props: { readonly series: readonly SerieAffichee[]; readonly actions: ActionsSerie }): ReactNode {
  const { series, actions } = props;
  return (
    <Table className="table-fixed">
      <colgroup>
        {COLONNES_SERIES.map((colonne) => (
          <col key={colonne.cle} className={colonne.largeur} />
        ))}
      </colgroup>
      <TableHeader>
        <TableRow>
          {COLONNES_SERIES.map((colonne) => (
            <TableHead
              key={colonne.cle}
              data-colonne={colonne.cle}
              className={cn(colonne.alignement === "droite" && "text-right")}
            >
              {colonne.cle === "actions" ? <span className="sr-only">{colonne.entete}</span> : colonne.entete}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {series.map((serie) => {
          const ventilation = libelleVentilationSerie(serie.ventilation);
          return (
            <TableRow key={serie.id} data-serie-id={serie.id}>
              <TableCell data-colonne="serie" className="whitespace-normal">
                <span className="font-medium">{serie.libelle}</span>
                {ventilation !== null && <span className="text-muted-foreground block text-xs">{ventilation}</span>}
              </TableCell>
              <TableCell data-colonne="compte" className="whitespace-normal">
                {serie.compteNom}
              </TableCell>
              <TableCell data-colonne="montant" className="font-montant text-right">
                {libelleMontantSerie(serie)}
              </TableCell>
              <TableCell data-colonne="cadence">{libelleCadence(serie.cadence)}</TableCell>
              <TableCell data-colonne="prochaine">{serie.prochaineEcheance ?? "—"}</TableCell>
              <TableCell data-colonne="liees" className="text-right">
                {serie.nbLiees}
              </TableCell>
              <TableCell data-colonne="sous-categorie" className="whitespace-normal">
                {libelleSousCategorie(serie)}
              </TableCell>
              <TableCell data-colonne="actions" className="text-right">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button type="button" variant="ghost" size="icon-sm" aria-label={`Actions de la série ${serie.libelle}`}>
                      <MoreHorizontal />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onSelect={() => {
                        actions.onVoirEcheances(serie);
                      }}
                    >
                      Voir les échéances
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={() => {
                        actions.onModifier(serie);
                      }}
                    >
                      Modifier
                    </DropdownMenuItem>
                    {!serie.terminee && (
                      <DropdownMenuItem
                        onSelect={() => {
                          actions.onTerminer(serie);
                        }}
                      >
                        Terminer
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem
                      onSelect={() => {
                        actions.onSupprimer(serie);
                      }}
                    >
                      Supprimer
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

/** Les séries actives, puis les terminées repliées : rien ne disparaît quand une série prend fin. */
export function SectionSeries(props: SectionSeriesProps): ReactNode {
  const { series, tronquees, actions } = props;
  const actives = series.filter((serie) => !serie.terminee);
  const terminees = series.filter((serie) => serie.terminee);
  return (
    <section data-section="series" aria-labelledby="titre-series" className="flex flex-col gap-3">
      <h2 id="titre-series" className="text-lg font-semibold">
        Séries
      </h2>
      {actives.length === 0 ? (
        <p className="text-muted-foreground text-sm">Aucune série active. Confirme une suggestion ou crée une récurrence.</p>
      ) : (
        <TableauSeries series={actives} actions={actions} />
      )}
      {tronquees && (
        <p className="text-muted-foreground text-sm">Seules les {String(LIMITE_SERIES)} premières séries sont affichées.</p>
      )}
      {terminees.length > 0 && (
        <details data-section="series-terminees" className="flex flex-col gap-2">
          <summary className="cursor-pointer text-sm font-medium">Séries terminées ({terminees.length})</summary>
          <div className="pt-2">
            <TableauSeries series={terminees} actions={actions} />
          </div>
        </details>
      )}
    </section>
  );
}
