// Mise à jour optimiste d'une ligne de la liste — docs/lot-m2.md §5.4 et §6.3.
// Pur : une copie où seule la ligne visée reçoit les champs du patch ; les
// autres lignes gardent leur identité d'objet.

import type { InfiniteData, QueryKey } from "@tanstack/react-query";
import type { CurseurTransactions, LigneTransactionListe } from "@/domain/consultation";
import type { PageListeTransactions } from "@/server/actions/transactions";

type DonneesListe = InfiniteData<PageListeTransactions, CurseurTransactions | null>;

export type PatchEnPlace =
  | {
      readonly champ: "SOUS_CATEGORIE";
      readonly subcategoryId: string | null;
      readonly sousCategorieNom: string | null;
      readonly categorieNom: string | null;
    }
  | { readonly champ: "BENEFICIAIRE"; readonly payeeId: string | null; readonly beneficiaireNom: string | null };

/** Ce que la cellule demande : l'écran y ajoute les noms tirés du référentiel pour faire un PatchEnPlace. */
export type ChangementEnPlace =
  | { readonly champ: "SOUS_CATEGORIE"; readonly subcategoryId: string | null }
  | { readonly champ: "BENEFICIAIRE"; readonly payeeId: string | null };

export interface ContexteOptimiste {
  readonly instantane: readonly (readonly [QueryKey, DonneesListe | undefined])[];
}

function appliquer(ligne: LigneTransactionListe, patch: PatchEnPlace): LigneTransactionListe {
  if (patch.champ === "SOUS_CATEGORIE") {
    return {
      ...ligne,
      subcategoryId: patch.subcategoryId,
      sousCategorieNom: patch.sousCategorieNom,
      categorieNom: patch.categorieNom,
    };
  }
  return { ...ligne, payeeId: patch.payeeId, beneficiaireNom: patch.beneficiaireNom };
}

export function appliquerPatchLigne(donnees: DonneesListe | undefined, id: string, patch: PatchEnPlace): DonneesListe | undefined {
  if (donnees === undefined) {
    return undefined;
  }
  return {
    ...donnees,
    pages: donnees.pages.map((page) => ({
      ...page,
      lignes: page.lignes.map((ligne) => (ligne.id === id ? appliquer(ligne, patch) : ligne)),
    })),
  };
}
