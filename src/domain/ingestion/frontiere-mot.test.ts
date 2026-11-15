// docs/lot-m1.md §4.6 — la frontière de mot, définie une seule fois.

import { describe, expect, it } from "vitest";
import { contientMotEntier, estCaractereDeMot } from "./frontiere-mot";

describe("contientMotEntier", () => {
  it("M1 : le mot au milieu d'un texte", () => {
    expect(contientMotEntier("DEPOT PAIE EMPLOYEUR ABC INC", "PAIE")).toBe(true);
  });

  it("M2 : « PAIEMENT. » ne contient pas le mot PAIE", () => {
    expect(contientMotEntier("PAIEMENT.", "PAIE")).toBe(false);
  });

  it("M3 : texte entier", () => {
    expect(contientMotEntier("PAIE", "PAIE")).toBe(true);
  });

  it("M4 : le point n'est pas un caractère de mot", () => {
    expect(contientMotEntier("PAIE.", "PAIE")).toBe(true);
  });

  it("M5 : une lettre avant refuse", () => {
    expect(contientMotEntier("REPAIE", "PAIE")).toBe(false);
  });

  it("M6 : la seconde occurrence est essayée", () => {
    expect(contientMotEntier("PAIEMENT PAIE", "PAIE")).toBe(true);
  });

  it("M7 : casse et accents ignorés", () => {
    expect(contientMotEntier("Dépôt paie", "PAIE")).toBe(true);
    expect(contientMotEntier("Dépôt paie", "dépôt")).toBe(true);
  });

  it("M8 : & fait partie du mot cherché", () => {
    expect(contientMotEntier("A&W RESTAURANT", "A&W")).toBe(true);
  });

  it("M9 : & est un caractère de mot, W seul n'est pas un mot dans A&W", () => {
    expect(contientMotEntier("A&W", "W")).toBe(false);
  });

  it("M10 : les deux apostrophes sont des caractères de mot", () => {
    expect(contientMotEntier("MCDONALD'S", "MCDONALD")).toBe(false);
    expect(contientMotEntier("MCDONALD’S", "MCDONALD")).toBe(false);
  });

  it("M11 : un motif de plusieurs mots", () => {
    expect(contientMotEntier("FRAIS DE SERVICE ANNUEL", "DE SERVICE")).toBe(true);
  });

  it("M12 : un motif qui s'aplatit en vide ne correspond jamais", () => {
    expect(contientMotEntier("CAFE", "   ")).toBe(false);
    expect(contientMotEntier("CAFE", "")).toBe(false);
  });

  it("M13 : * est une frontière", () => {
    expect(contientMotEntier("AMZN MKTP CA*2K4LM9", "CA")).toBe(true);
  });

  it("un texte vide ne contient rien et ne lève pas", () => {
    expect(contientMotEntier("", "PAIE")).toBe(false);
  });
});

describe("estCaractereDeMot", () => {
  it.each([
    ["", false],
    ["é", true],
    ["7", true],
    ["&", true],
    ["’", true],
    ["'", true],
    ["*", false],
    [" ", false],
    [".", false],
  ] as const)("%j vaut %s", (caractere, attendu) => {
    expect(estCaractereDeMot(caractere)).toBe(attendu);
  });
});
