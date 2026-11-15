import { describe, expect, it } from "vitest";
import type { BeneficiaireListe } from "@/server/actions/payees";
import {
  schemaBeneficiaire,
  schemaFusionBeneficiaires,
  schemaModificationBeneficiaire,
  versEntreeBeneficiaire,
} from "./schema";

const BASE = {
  nom: "Amazon",
  sousCategorieParDefautId: "clx0000000000000000000000",
  autoCategorisation: true,
  categorieVerrouillee: false,
};

describe("schemaBeneficiaire", () => {
  it("accepte le cas nominal", () => {
    expect(schemaBeneficiaire.safeParse(BASE).success).toBe(true);
  });

  it("refuse un nom vide", () => {
    expect(schemaBeneficiaire.safeParse({ ...BASE, nom: "" }).success).toBe(false);
  });

  it("refuse un nom composé uniquement d'espaces", () => {
    const resultat = schemaBeneficiaire.safeParse({ ...BASE, nom: "   " });
    expect(resultat.success).toBe(false);
    if (!resultat.success) {
      expect(resultat.error.flatten().fieldErrors.nom).toContain("Le nom est obligatoire.");
    }
  });

  it("refuse un nom de 61 caractères", () => {
    const resultat = schemaBeneficiaire.safeParse({ ...BASE, nom: "a".repeat(61) });
    expect(resultat.success).toBe(false);
    if (!resultat.success) {
      expect(resultat.error.flatten().fieldErrors.nom).toContain("60 caractères au maximum.");
    }
  });

  it("coupe les espaces de bord du nom", () => {
    const resultat = schemaBeneficiaire.safeParse({ ...BASE, nom: "  Amazon  " });
    expect(resultat.success).toBe(true);
    if (resultat.success) {
      expect(resultat.data.nom).toBe("Amazon");
    }
  });

  it("accepte sousCategorieParDefautId à null", () => {
    expect(schemaBeneficiaire.safeParse({ ...BASE, sousCategorieParDefautId: null }).success).toBe(true);
  });

  it("refuse un identifiant qui n'est pas un cuid", () => {
    const resultat = schemaBeneficiaire.safeParse({ ...BASE, sousCategorieParDefautId: "pas-un-cuid" });
    expect(resultat.success).toBe(false);
  });

  it("refuse le verrou sans sous-catégorie par défaut", () => {
    const resultat = schemaBeneficiaire.safeParse({
      ...BASE,
      sousCategorieParDefautId: null,
      categorieVerrouillee: true,
    });
    expect(resultat.success).toBe(false);
    if (!resultat.success) {
      expect(resultat.error.issues[0]?.path).toEqual(["categorieVerrouillee"]);
      expect(resultat.error.flatten().fieldErrors.categorieVerrouillee).toContain(
        "Verrouiller la catégorie suppose une sous-catégorie par défaut.",
      );
    }
  });

  it("refuse le verrou avec l'auto-catégorisation désactivée", () => {
    const resultat = schemaBeneficiaire.safeParse({
      ...BASE,
      categorieVerrouillee: true,
      autoCategorisation: false,
    });
    expect(resultat.success).toBe(false);
    if (!resultat.success) {
      expect(resultat.error.issues[0]?.path).toEqual(["categorieVerrouillee"]);
      expect(resultat.error.flatten().fieldErrors.categorieVerrouillee).toContain(
        "Une catégorie verrouillée et l'auto-catégorisation désactivée se contredisent.",
      );
    }
  });

  it("accepte l'auto-catégorisation désactivée sans verrou", () => {
    expect(schemaBeneficiaire.safeParse({ ...BASE, autoCategorisation: false }).success).toBe(true);
  });
});

describe("schemaModificationBeneficiaire", () => {
  it("refuse une modification sans id", () => {
    expect(schemaModificationBeneficiaire.safeParse(BASE).success).toBe(false);
  });

  it("accepte une modification avec id", () => {
    expect(
      schemaModificationBeneficiaire.safeParse({ ...BASE, id: "clx0000000000000000000001" }).success,
    ).toBe(true);
  });
});

describe("schemaFusionBeneficiaires", () => {
  it("refuse une fusion sur soi-même", () => {
    const id = "clx0000000000000000000002";
    const resultat = schemaFusionBeneficiaires.safeParse({ sourceId: id, cibleId: id });
    expect(resultat.success).toBe(false);
    if (!resultat.success) {
      expect(resultat.error.issues[0]?.path).toEqual(["cibleId"]);
    }
  });

  it("accepte deux identifiants distincts", () => {
    const resultat = schemaFusionBeneficiaires.safeParse({
      sourceId: "clx0000000000000000000003",
      cibleId: "clx0000000000000000000004",
    });
    expect(resultat.success).toBe(true);
  });
});

describe("versEntreeBeneficiaire", () => {
  it("fait un aller-retour sans perte via schemaBeneficiaire", () => {
    const beneficiaire: BeneficiaireListe = {
      id: "clx0000000000000000000005",
      nom: "Amazon.ca",
      nomNormalise: "AMAZON.CA",
      sousCategorieParDefautId: "clx0000000000000000000000",
      sousCategorieParDefautNom: "Achats en ligne",
      categorieParDefautNom: "Divers",
      autoCategorisation: true,
      categorieVerrouillee: false,
      nbTransactions: 4,
    };

    const resultat = schemaBeneficiaire.safeParse(versEntreeBeneficiaire(beneficiaire));
    expect(resultat.success).toBe(true);
    if (resultat.success) {
      expect(resultat.data).toMatchObject({
        nom: beneficiaire.nom,
        sousCategorieParDefautId: beneficiaire.sousCategorieParDefautId,
        autoCategorisation: beneficiaire.autoCategorisation,
        categorieVerrouillee: beneficiaire.categorieVerrouillee,
      });
    }
  });
});
