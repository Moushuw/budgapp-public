"use client";

// Select groupé par catégorie — docs/lot-m1.md §8.2. Alimenté par
// useCategories() (qui rend déjà les sous-catégories), sous-catégories
// masquées exclues. Lecture seule, aucun hook de mutation (CLAUDE.md §8).

import type { ReactNode } from "react";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCategories } from "@/features/categories/use-categories";

export interface SelecteurSousCategorieProps {
  /** Posé sur le déclencheur : l'étiquette visible de la ligne s'y rattache (docs/lot-m2.md §10.2 point 2). */
  readonly id?: string;
  readonly subcategoryId: string | null;
  readonly onChange: (subcategoryId: string | null) => void;
  /** Nom accessible du sélecteur ; « Sous-catégorie » par défaut. */
  readonly ariaLabel?: string;
  /** La ligne est ventilée par une règle (docs/lot-m2.md §4.3) : le sélecteur affiche « Ventilée », choisir autre chose l'annule. */
  readonly ventilee?: boolean;
  /** La ligne est un côté de virement (docs/lot-m2.md §4.5) : le sélecteur affiche « Virement » et reste fermé. */
  readonly virement?: boolean;
}

const AUCUNE = "__aucune__";
const VENTILEE = "__ventilee__";
const VIREMENT = "__virement__";

export function SelecteurSousCategorie(props: SelecteurSousCategorieProps): ReactNode {
  const { id, subcategoryId, onChange, ariaLabel = "Sous-catégorie", ventilee = false, virement = false } = props;
  const { data: categories } = useCategories();

  let valeur = subcategoryId ?? AUCUNE;
  if (virement) {
    valeur = VIREMENT;
  } else if (ventilee) {
    valeur = VENTILEE;
  }

  return (
    <Select
      value={valeur}
      onValueChange={(choisie) => {
        onChange(choisie === AUCUNE ? null : choisie);
      }}
    >
      <SelectTrigger id={id} className="w-full" aria-label={ariaLabel} disabled={virement}>
        <SelectValue placeholder="Sous-catégorie" />
      </SelectTrigger>
      <SelectContent>
        {virement && (
          <SelectItem value={VIREMENT} disabled>
            Virement
          </SelectItem>
        )}
        {ventilee && (
          <SelectItem value={VENTILEE} disabled>
            Ventilée
          </SelectItem>
        )}
        <SelectItem value={AUCUNE}>Aucune</SelectItem>
        {(categories ?? []).map((categorie) => {
          const sousCategoriesVisibles = categorie.sousCategories.filter((sousCategorie) => !sousCategorie.masquee);
          if (sousCategoriesVisibles.length === 0) {
            return null;
          }
          return (
            <SelectGroup key={categorie.id}>
              <SelectLabel>{categorie.nom}</SelectLabel>
              {sousCategoriesVisibles.map((sousCategorie) => (
                <SelectItem key={sousCategorie.id} value={sousCategorie.id}>
                  {sousCategorie.nom}
                </SelectItem>
              ))}
            </SelectGroup>
          );
        })}
      </SelectContent>
    </Select>
  );
}
