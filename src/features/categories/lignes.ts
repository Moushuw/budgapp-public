// Aplatissement de la hiérarchie catégories → sous-catégories, pur et testé,
// pour servir le tableau plat d'EcranReferentiel — spec M1 tranche 2 §7.4.

import type { CategorieListe, SousCategorieListe } from "@/server/actions/categories";

export type LigneCategorie =
  | { readonly genre: "CATEGORIE"; readonly cle: string; readonly categorie: CategorieListe; readonly premier: boolean; readonly dernier: boolean }
  | {
      readonly genre: "SOUS_CATEGORIE";
      readonly cle: string;
      readonly categorie: CategorieListe;
      readonly sousCategorie: SousCategorieListe;
      readonly premier: boolean;
      readonly dernier: boolean;
    };

/** Ne trie pas : le repository a déjà trié. `premier`/`dernier` sont relatifs à la fratrie. */
export function aplatirCategories(categories: readonly CategorieListe[]): LigneCategorie[] {
  const lignes: LigneCategorie[] = [];

  categories.forEach((categorie, indexCategorie) => {
    lignes.push({
      genre: "CATEGORIE",
      cle: `categorie:${categorie.id}`,
      categorie,
      premier: indexCategorie === 0,
      dernier: indexCategorie === categories.length - 1,
    });

    categorie.sousCategories.forEach((sousCategorie, indexSousCategorie) => {
      lignes.push({
        genre: "SOUS_CATEGORIE",
        cle: `sousCategorie:${sousCategorie.id}`,
        categorie,
        sousCategorie,
        premier: indexSousCategorie === 0,
        dernier: indexSousCategorie === categorie.sousCategories.length - 1,
      });
    });
  });

  return lignes;
}
