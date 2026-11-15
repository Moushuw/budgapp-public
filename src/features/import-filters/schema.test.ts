import { describe, expect, it } from "vitest";
import { schemaFiltreImport, schemaModificationFiltreImport } from "./schema";

describe("schemaFiltreImport", () => {
  it("accepte le cas nominal", () => {
    expect(schemaFiltreImport.safeParse({ motif: "PAIEMENT", mode: "EXACT" }).success).toBe(true);
  });

  it.each(["", "   "])("refuse un motif vide ou blanc : %j", (motif) => {
    expect(schemaFiltreImport.safeParse({ motif, mode: "EXACT" }).success).toBe(false);
  });

  it("refuse une regex invalide avec le message du moteur d'expressions régulières", () => {
    let messageAttendu: string | undefined;
    try {
      new RegExp("[");
    } catch (erreur) {
      messageAttendu = erreur instanceof Error ? erreur.message : undefined;
    }
    expect(messageAttendu).toBeDefined();

    const resultat = schemaFiltreImport.safeParse({ motif: "[", mode: "REGEX" });
    expect(resultat.success).toBe(false);
    if (!resultat.success) {
      const message = resultat.error.flatten().fieldErrors.motif?.[0];
      expect(message).toBe(messageAttendu);
    }
  });

  it("accepte une regex valide avec groupes", () => {
    expect(schemaFiltreImport.safeParse({ motif: "^VIR\\s+\\d+", mode: "REGEX" }).success).toBe(true);
  });

  it("accepte un crochet hors mode REGEX : ce n'est qu'un caractère", () => {
    expect(schemaFiltreImport.safeParse({ motif: "[", mode: "CONTIENT" }).success).toBe(true);
  });
});

describe("schemaModificationFiltreImport", () => {
  it("refuse un id qui n'est pas un cuid", () => {
    expect(
      schemaModificationFiltreImport.safeParse({ id: "pas-un-cuid", motif: "PAIEMENT", mode: "EXACT" }).success,
    ).toBe(false);
  });
});
