"use client";

// Le tableau de référentiel générique, avec sa déclinaison mobile faite une
// fois pour les six écrans — spec M1 tranche 1 §6.3. Aucun hook de mutation
// ici ni dans une cellule (CLAUDE.md §8) : il ne reçoit que des rappels.

import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import { useId, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export interface RechercheReferentiel {
  readonly valeur: string;
  readonly onChange: (valeur: string) => void;
  readonly placeholder: string;
  /** Affiché à la place de messageVide quand la recherche ne rend rien. */
  readonly messageAucunResultat: string;
}

export interface ColonneReferentiel<T> {
  readonly cle: string;
  readonly entete: string;
  readonly rendu: (element: T) => ReactNode;
  readonly alignement?: "gauche" | "droite";
  /** Affichée en tête de carte sur mobile plutôt qu'en ligne de détail. */
  readonly principale?: boolean;
  /** Tableau bureau : l'en-tête et les cellules passent à la ligne au lieu de forcer une largeur (table.tsx impose nowrap). */
  readonly retourLigne?: boolean;
}

export interface EcranReferentielProps<T> {
  readonly titre: string;
  readonly description?: string;
  readonly colonnes: readonly ColonneReferentiel<T>[];
  readonly elements: readonly T[];
  readonly cleDe: (element: T) => string;
  readonly chargement: boolean;
  readonly erreur: Error | null;
  readonly libelleCreation: string;
  readonly messageVide: string;
  readonly onCreer: () => void;
  readonly onModifier: (element: T) => void;
  readonly onSupprimer: (element: T) => void;
  /** Retourne le motif de refus, ou null si la suppression est possible. */
  readonly suppressionInterdite?: (element: T) => string | null;
  /** Actions propres à l'écran, rendues avant « Modifier » (bureau et mobile). */
  readonly actionsSupplementaires?: (element: T) => ReactNode;
  /**
   * true = aucun bouton de suppression n'est rendu pour cet élément. À
   * distinguer de suppressionInterdite, qui rend un bouton refusé avec son
   * motif : ici, le bouton est absent, pas seulement désactivé.
   */
  readonly suppressionMasquee?: (element: T) => boolean;
  /** Barre de recherche optionnelle, rendue sous la ligne titre/bouton. */
  readonly recherche?: RechercheReferentiel;
  /** Nom accessible de la carte mobile (role="group") ; sans lui, la carte n'a pas de nom. */
  readonly nomAccessible?: (element: T) => string;
}

function BoutonSuppression<T>({
  element,
  motifRefus,
  onSupprimer,
}: {
  element: T;
  motifRefus: string | null;
  onSupprimer: (element: T) => void;
}) {
  const idMotif = useId();

  if (motifRefus !== null) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          {/* aria-disabled plutôt que disabled : un bouton natif désactivé
              sort de l'ordre de tabulation, ce qui rendrait le motif
              inaccessible au clavier — exactement le défaut à corriger. */}
          <button
            type="button"
            aria-disabled="true"
            aria-describedby={idMotif}
            aria-label="Supprimer"
            className="text-muted-foreground/50 focus-visible:ring-ring/50 inline-flex size-7 items-center justify-center rounded-lg outline-none focus-visible:ring-3"
            onClick={(evenement) => { evenement.preventDefault(); }}
          >
            <Trash2 className="size-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent id={idMotif}>{motifRefus}</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Button variant="ghost" size="icon-sm" onClick={() => { onSupprimer(element); }} aria-label="Supprimer">
      <Trash2 />
    </Button>
  );
}

export function EcranReferentiel<T>(props: EcranReferentielProps<T>): ReactNode {
  const {
    titre,
    description,
    colonnes,
    elements,
    cleDe,
    chargement,
    erreur,
    libelleCreation,
    messageVide,
    onCreer,
    onModifier,
    onSupprimer,
    suppressionInterdite,
    actionsSupplementaires,
    suppressionMasquee,
    recherche,
    nomAccessible,
  } = props;

  const colonnePrincipale = colonnes.find((colonne) => colonne.principale) ?? colonnes[0];
  const colonnesSecondaires = colonnes.filter((colonne) => colonne !== colonnePrincipale);

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">{titre}</h2>
          {description && <p className="text-muted-foreground text-sm">{description}</p>}
        </div>
        <Button onClick={onCreer}>
          <Plus />
          {libelleCreation}
        </Button>
      </div>

      {recherche && (
        <div className="relative max-w-sm">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <Input
            type="search"
            value={recherche.valeur}
            onChange={(evenement) => { recherche.onChange(evenement.target.value); }}
            placeholder={recherche.placeholder}
            aria-label={recherche.placeholder}
            className="pl-8"
          />
        </div>
      )}

      {erreur && (
        <div className="border-destructive/40 bg-destructive/10 text-destructive rounded-lg border px-4 py-3 text-sm">
          {erreur.message}
        </div>
      )}

      {chargement && (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      )}

      {!chargement && !erreur && elements.length === 0 && (
        <p className="text-muted-foreground text-sm">
          {recherche !== undefined && recherche.valeur.trim() !== "" ? recherche.messageAucunResultat : messageVide}
        </p>
      )}

      {!chargement && !erreur && elements.length > 0 && (
        <>
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  {colonnes.map((colonne) => (
                    <TableHead
                      key={colonne.cle}
                      className={cn(colonne.alignement === "droite" && "text-right", colonne.retourLigne && "whitespace-normal wrap-anywhere")}
                    >
                      {colonne.entete}
                    </TableHead>
                  ))}
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {elements.map((element) => {
                  const motifRefus = suppressionInterdite?.(element) ?? null;
                  const masquee = suppressionMasquee?.(element) ?? false;
                  return (
                    <TableRow key={cleDe(element)}>
                      {colonnes.map((colonne) => (
                        <TableCell
                          key={colonne.cle}
                          className={cn(colonne.alignement === "droite" && "text-right", colonne.retourLigne && "whitespace-normal wrap-anywhere")}
                        >
                          {colonne.rendu(element)}
                        </TableCell>
                      ))}
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {actionsSupplementaires?.(element)}
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => { onModifier(element); }}
                            aria-label="Modifier"
                          >
                            <Pencil />
                          </Button>
                          {!masquee && (
                            <BoutonSuppression element={element} motifRefus={motifRefus} onSupprimer={onSupprimer} />
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <div className="flex flex-col gap-3 md:hidden">
            {elements.map((element) => {
              const motifRefus = suppressionInterdite?.(element) ?? null;
              const masquee = suppressionMasquee?.(element) ?? false;
              return (
                <Card
                  key={cleDe(element)}
                  role={nomAccessible === undefined ? undefined : "group"}
                  aria-label={nomAccessible?.(element)}
                >
                  <CardHeader>
                    <CardTitle>{colonnePrincipale?.rendu(element)}</CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-2">
                    {colonnesSecondaires.map((colonne) => (
                      <div key={colonne.cle} className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">{colonne.entete}</span>
                        <span>{colonne.rendu(element)}</span>
                      </div>
                    ))}
                    <div className="flex items-center justify-end gap-2 pt-2">
                      {actionsSupplementaires?.(element)}
                      <Button variant="outline" size="sm" onClick={() => { onModifier(element); }}>
                        <Pencil />
                        Modifier
                      </Button>
                      {!masquee && (
                        <BoutonSuppression element={element} motifRefus={motifRefus} onSupprimer={onSupprimer} />
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
