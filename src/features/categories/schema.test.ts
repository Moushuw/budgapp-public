import { describe, expect, it } from "vitest";
import {
  schemaCategorie,
  schemaCreationSousCategorie,
  schemaDeplacement,
  schemaSousCategorie,
} from "./schema";

const BASE_CATEGORIE = {
  nom: "Auto",
  couleur: "#f59e0b",
  icone: "car",
  masquee: false,
  modeBudget: "PAR_SOUS_CATEGORIE",
};

const BASE_SOUS_CATEGORIE = {
  nom: "Essence",
  masquee: false,
  reportActif: true,
  reportMode: "SIGNE",
};

describe("schemaCategorie", () => {
  it("refuse un nom vide", () => {
    expect(schemaCategorie.safeParse({ ...BASE_CATEGORIE, nom: "" }).success).toBe(false);
  });

  it("refuse une couleur hors motif", () => {
    expect(schemaCategorie.safeParse({ ...BASE_CATEGORIE, couleur: "bleu" }).success).toBe(false);
  });

  it("accepte une couleur en majuscules", () => {
    expect(schemaCategorie.safeParse({ ...BASE_CATEGORIE, couleur: "#F59E0B" }).success).toBe(true);
  });

  it("accepte une couleur nulle", () => {
    expect(schemaCategorie.safeParse({ ...BASE_CATEGORIE, couleur: null }).success).toBe(true);
  });

  it("convertit une icône vide en null", () => {
    const resultat = schemaCategorie.safeParse({ ...BASE_CATEGORIE, icone: "" });
    expect(resultat.success).toBe(true);
    if (resultat.success) {
      expect(resultat.data.icone).toBeNull();
    }
  });

  it("refuse un mode de budget hors énumération", () => {
    expect(schemaCategorie.safeParse({ ...BASE_CATEGORIE, modeBudget: "AUTRE" }).success).toBe(false);
  });
});

describe("schemaSousCategorie", () => {
  it("refuse un mode de report hors énumération", () => {
    expect(schemaSousCategorie.safeParse({ ...BASE_SOUS_CATEGORIE, reportMode: "PARTIEL" }).success).toBe(false);
  });
});

describe("schemaDeplacement", () => {
  it("refuse une direction hors énumération", () => {
    expect(
      schemaDeplacement.safeParse({ id: "clx0000000000000000000000", direction: "GAUCHE" }).success,
    ).toBe(false);
  });
});

describe("schemaCreationSousCategorie", () => {
  it("refuse l'absence de categoryId", () => {
    expect(schemaCreationSousCategorie.safeParse(BASE_SOUS_CATEGORIE).success).toBe(false);
  });
});
