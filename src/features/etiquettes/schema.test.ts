import { describe, expect, it } from "vitest";
import { schemaEtiquette, schemaModificationEtiquette } from "./schema";

describe("schemaEtiquette", () => {
  it("accepte le cas nominal et convertit la cible en cents", () => {
    const resultat = schemaEtiquette.safeParse({ nom: "Auto", couleur: "#f59e0b", cibleMensuelleCents: "250,00" });
    expect(resultat.success).toBe(true);
    if (resultat.success) {
      expect(resultat.data.cibleMensuelleCents).toBe(25000);
    }
  });

  it("accepte couleur nulle et une cible vide : les deux sont optionnels", () => {
    const resultat = schemaEtiquette.safeParse({ nom: "Auto", couleur: null, cibleMensuelleCents: "" });
    expect(resultat.success).toBe(true);
    if (resultat.success) {
      expect(resultat.data.cibleMensuelleCents).toBeNull();
    }
  });

  it("refuse un nom vide ou blanc", () => {
    const resultat = schemaEtiquette.safeParse({ nom: "   ", couleur: null, cibleMensuelleCents: "" });
    expect(resultat.success).toBe(false);
    if (!resultat.success) {
      expect(resultat.error.flatten().fieldErrors.nom).toContain("Le nom est obligatoire.");
    }
  });

  it("refuse un nom de plus de 60 caractères", () => {
    const resultat = schemaEtiquette.safeParse({
      nom: "a".repeat(61),
      couleur: null,
      cibleMensuelleCents: "",
    });
    expect(resultat.success).toBe(false);
  });

  it("analyse un nom entouré d'espaces en le tronquant", () => {
    const resultat = schemaEtiquette.safeParse({ nom: "  Auto  ", couleur: null, cibleMensuelleCents: "" });
    expect(resultat.success).toBe(true);
    if (resultat.success) {
      expect(resultat.data.nom).toBe("Auto");
    }
  });

  it.each(["bleu", "#f59e0", "f59e0ab"])("refuse une couleur hors motif : %s", (couleur) => {
    const resultat = schemaEtiquette.safeParse({ nom: "Auto", couleur, cibleMensuelleCents: "" });
    expect(resultat.success).toBe(false);
  });

  it("accepte une couleur en majuscules", () => {
    const resultat = schemaEtiquette.safeParse({ nom: "Auto", couleur: "#F59E0B", cibleMensuelleCents: "" });
    expect(resultat.success).toBe(true);
  });

  it("refuse une cible négative", () => {
    const resultat = schemaEtiquette.safeParse({ nom: "Auto", couleur: null, cibleMensuelleCents: "-1" });
    expect(resultat.success).toBe(false);
    if (!resultat.success) {
      expect(resultat.error.flatten().fieldErrors.cibleMensuelleCents).toContain("La cible ne peut pas être négative.");
    }
  });

  it("accepte une cible à zéro", () => {
    const resultat = schemaEtiquette.safeParse({ nom: "Auto", couleur: null, cibleMensuelleCents: "0" });
    expect(resultat.success).toBe(true);
    if (resultat.success) {
      expect(resultat.data.cibleMensuelleCents).toBe(0);
    }
  });

  it("refuse une cible illisible avec un message explicite, distinct d'un champ vide", () => {
    const resultat = schemaEtiquette.safeParse({ nom: "Auto", couleur: null, cibleMensuelleCents: "25,OO" });
    expect(resultat.success).toBe(false);
    if (!resultat.success) {
      expect(resultat.error.flatten().fieldErrors.cibleMensuelleCents).toContain(
        "Montant illisible. Exemple : 250,00",
      );
    }
  });
});

describe("schemaModificationEtiquette", () => {
  it("refuse un id qui n'est pas un cuid", () => {
    const resultat = schemaModificationEtiquette.safeParse({
      id: "pas-un-cuid",
      nom: "Auto",
      couleur: null,
      cibleMensuelleCents: "",
    });
    expect(resultat.success).toBe(false);
  });
});
