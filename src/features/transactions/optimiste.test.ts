import type { InfiniteData } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import type { CurseurTransactions, LigneTransactionListe } from "@/domain/consultation";
import type { PageListeTransactions } from "@/server/actions/transactions";
import { appliquerPatchLigne, type PatchEnPlace } from "./optimiste";

function ligne(id: string): LigneTransactionListe {
  return {
    id,
    date: "2026-09-01",
    accountId: "a1",
    compteNom: "Chèque",
    description: `Ligne ${id}`,
    typeOperation: null,
    montantCents: -100,
    payeeId: null,
    beneficiaireNom: null,
    subcategoryId: null,
    sousCategorieNom: null,
    categorieNom: null,
    etiquettes: [],
    aRevoir: false,
    exclureDuBudget: false,
    exclureDesRapports: false,
    estVentilee: false,
    virement: null,
    lignesVentilation: [],
    nbLignesVentilation: 0,
  };
}

function donnees(): InfiniteData<PageListeTransactions, CurseurTransactions | null> {
  const page = (ids: readonly string[]): PageListeTransactions => ({
    lignes: ids.map(ligne),
    curseurSuivant: null,
    totaux: null,
  });
  return { pages: [page(["a", "b"]), page(["c", "d"])], pageParams: [null, null] };
}

const PATCH_SOUS_CATEGORIE: PatchEnPlace = {
  champ: "SOUS_CATEGORIE",
  subcategoryId: "s1",
  sousCategorieNom: "Café",
  categorieNom: "Sorties",
};

describe("appliquerPatchLigne", () => {
  it("undefined → undefined", () => {
    expect(appliquerPatchLigne(undefined, "a", PATCH_SOUS_CATEGORIE)).toBeUndefined();
  });

  it("ne change que la ligne visée, dans la seconde page", () => {
    const avant = donnees();
    const apres = appliquerPatchLigne(avant, "c", PATCH_SOUS_CATEGORIE);
    expect(apres).toBeDefined();
    if (apres === undefined) return;
    const visee = apres.pages[1]?.lignes[0];
    expect(visee).toMatchObject({ id: "c", subcategoryId: "s1", sousCategorieNom: "Café", categorieNom: "Sorties" });
    expect(apres.pages[0]?.lignes[0]).toBe(avant.pages[0]?.lignes[0]);
    expect(apres.pages[0]?.lignes[1]).toBe(avant.pages[0]?.lignes[1]);
    expect(apres.pages[1]?.lignes[1]).toBe(avant.pages[1]?.lignes[1]);
    // l'entrée n'est pas mutée
    expect(avant.pages[1]?.lignes[0]?.subcategoryId).toBeNull();
  });

  it("applique un patch de bénéficiaire", () => {
    const apres = appliquerPatchLigne(donnees(), "a", { champ: "BENEFICIAIRE", payeeId: "p1", beneficiaireNom: "Café Dépôt" });
    expect(apres?.pages[0]?.lignes[0]).toMatchObject({ payeeId: "p1", beneficiaireNom: "Café Dépôt" });
  });

  it("un id absent → contenu égal à l'entrée", () => {
    const avant = donnees();
    expect(appliquerPatchLigne(avant, "zzz", PATCH_SOUS_CATEGORIE)).toEqual(avant);
  });
});
