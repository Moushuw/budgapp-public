import { describe, expect, it } from "vitest";
import { echapperMotifLike, motifRecherche } from "./recherche";

describe("echapperMotifLike", () => {
  it.each([
    ["100%", "100!%"],
    ["a_b", "a!_b"],
    ["!", "!!"],
    ["!%", "!!!%"],
    ["cafe", "cafe"],
  ])("« %s » → « %s »", (entree, attendu) => {
    expect(echapperMotifLike(entree)).toBe(attendu);
  });
});

describe("motifRecherche", () => {
  it("trime puis entoure de jokers", () => {
    expect(motifRecherche("  cafe  ")).toBe("%cafe%");
  });

  it("échappe avant d'entourer", () => {
    expect(motifRecherche("100%")).toBe("%100!%%");
  });
});
