import { describe, expect, it } from "vitest";
import type { CategorieListe, SousCategorieListe } from "@/server/actions/categories";
import { aplatirCategories } from "./lignes";

function sousCategorie(id: string, categoryId: string): SousCategorieListe {
  return {
    id,
    categoryId,
    nom: id,
    ordre: 0,
    masquee: false,
    systeme: false,
    reportActif: true,
    reportMode: "SIGNE",
    nbTransactions: 0,
    nbAllocations: 0,
    nbActionsRegles: 0,
    nbMouvements: 0,
    nbBeneficiaires: 0,
    nbRecurrences: 0,
    nbEvenements: 0,
    aCible: false,
    aPrevision: false,
  };
}

function categorie(id: string, sousCategories: SousCategorieListe[]): CategorieListe {
  return {
    id,
    nom: id,
    ordre: 0,
    couleur: null,
    icone: null,
    masquee: false,
    modeBudget: "PAR_SOUS_CATEGORIE",
    nbAllocations: 0,
    sousCategories,
  };
}

describe("aplatirCategories", () => {
  it("aplatit deux catégories de deux sous-catégories dans l'ordre", () => {
    const c1 = categorie("C1", [sousCategorie("S1.1", "C1"), sousCategorie("S1.2", "C1")]);
    const c2 = categorie("C2", [sousCategorie("S2.1", "C2"), sousCategorie("S2.2", "C2")]);

    const lignes = aplatirCategories([c1, c2]);

    expect(lignes).toHaveLength(6);
    expect(lignes.map((ligne) => (ligne.genre === "CATEGORIE" ? ligne.categorie.id : ligne.sousCategorie.id))).toEqual([
      "C1",
      "S1.1",
      "S1.2",
      "C2",
      "S2.1",
      "S2.2",
    ]);
  });

  it("premier/dernier des catégories ne sont pas influencés par les sous-catégories", () => {
    const c1 = categorie("C1", [sousCategorie("S1.1", "C1")]);
    const c2 = categorie("C2", [sousCategorie("S2.1", "C2"), sousCategorie("S2.2", "C2")]);
    const c3 = categorie("C3", []);

    const lignes = aplatirCategories([c1, c2, c3]);
    const lignesCategorie = lignes.filter((ligne) => ligne.genre === "CATEGORIE");

    expect(lignesCategorie[0]?.premier).toBe(true);
    expect(lignesCategorie[0]?.dernier).toBe(false);
    expect(lignesCategorie[1]?.premier).toBe(false);
    expect(lignesCategorie[1]?.dernier).toBe(false);
    expect(lignesCategorie[2]?.premier).toBe(false);
    expect(lignesCategorie[2]?.dernier).toBe(true);
  });

  it("premier/dernier des sous-catégories sont relatifs à leur fratrie", () => {
    const c1 = categorie("C1", [sousCategorie("S1.1", "C1"), sousCategorie("S1.2", "C1")]);
    const lignes = aplatirCategories([c1]);
    const sousLignes = lignes.filter((ligne) => ligne.genre === "SOUS_CATEGORIE");

    expect(sousLignes[0]?.premier).toBe(true);
    expect(sousLignes[0]?.dernier).toBe(false);
    expect(sousLignes[1]?.premier).toBe(false);
    expect(sousLignes[1]?.dernier).toBe(true);
  });

  it("une catégorie sans sous-catégorie produit une seule ligne", () => {
    const lignes = aplatirCategories([categorie("C1", [])]);
    expect(lignes).toHaveLength(1);
    expect(lignes[0]?.genre).toBe("CATEGORIE");
  });

  it("une catégorie unique avec une sous-catégorie unique porte premier et dernier sur les deux lignes", () => {
    const lignes = aplatirCategories([categorie("C1", [sousCategorie("S1.1", "C1")])]);
    expect(lignes[0]?.premier).toBe(true);
    expect(lignes[0]?.dernier).toBe(true);
    expect(lignes[1]?.premier).toBe(true);
    expect(lignes[1]?.dernier).toBe(true);
  });

  it("une liste vide retourne un tableau vide", () => {
    expect(aplatirCategories([])).toEqual([]);
  });

  it("les clés sont toutes distinctes et préfixées", () => {
    const c1 = categorie("C1", [sousCategorie("S1.1", "C1")]);
    const c2 = categorie("C2", [sousCategorie("S2.1", "C2")]);
    const lignes = aplatirCategories([c1, c2]);
    const cles = lignes.map((ligne) => ligne.cle);

    expect(new Set(cles).size).toBe(cles.length);
    expect(cles).toEqual(["categorie:C1", "sousCategorie:S1.1", "categorie:C2", "sousCategorie:S2.1"]);
  });
});
