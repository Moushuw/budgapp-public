import { describe, expect, it } from "vitest";
import { z } from "zod";
import { creerFabriqueIdentifiants } from "./identifiant-seed";

function tirer(fabrique: () => string, n: number): string[] {
  return Array.from({ length: n }, () => fabrique());
}

describe("creerFabriqueIdentifiants", () => {
  it("produit des identifiants de 25 caractères au format cuid", () => {
    for (const id of tirer(creerFabriqueIdentifiants(1), 1000)) {
      expect(id).toHaveLength(25);
      expect(id).toMatch(/^c[0-9a-z]{24}$/);
    }
  });

  it("passe z.string().cuid()", () => {
    const schema = z.string().cuid();
    for (const id of tirer(creerFabriqueIdentifiants(2), 1000)) {
      expect(schema.safeParse(id).success).toBe(true);
    }
  });

  it("est déterministe pour une même graine", () => {
    expect(tirer(creerFabriqueIdentifiants(42), 1000)).toEqual(tirer(creerFabriqueIdentifiants(42), 1000));
  });

  it("donne une suite différente pour une autre graine, dès le premier identifiant", () => {
    expect(creerFabriqueIdentifiants(1)()).not.toBe(creerFabriqueIdentifiants(2)());
  });

  it("ne produit aucun doublon sur 10 000 tirages", () => {
    expect(new Set(tirer(creerFabriqueIdentifiants(7), 10_000)).size).toBe(10_000);
  });

  it("deux fabriques indépendantes ne se décalent pas", () => {
    const a = creerFabriqueIdentifiants(5);
    const b = creerFabriqueIdentifiants(5);
    const referenceA = tirer(creerFabriqueIdentifiants(5), 3);
    a();
    a();
    a();
    expect(tirer(b, 3)).toEqual(referenceA);
  });
});
