import { describe, expect, it } from "vitest";
import { estOccurrenceOuverte, etatAffiche, etatApresLiaison } from "./etats";

describe("etatAffiche", () => {
  it.each([
    ["2026-10-14", "PREVUE"],
    ["2026-10-15", "PREVUE"],
    ["2026-10-16", "MANQUEE"],
  ])("E1 — PREVUE au %s → %s", (jour, attendu) => {
    expect(etatAffiche({ echeance: "2026-10-12", etat: "PREVUE" }, 3, jour)).toBe(attendu);
  });

  it.each(["2026-09-13", "2026-06-01"])("E2 — MANQUEE stockée reste MANQUEE (%s)", (jour) => {
    expect(etatAffiche({ echeance: "2026-06-20", etat: "MANQUEE" }, 4, jour)).toBe("MANQUEE");
  });

  it.each(["REALISEE", "REALISEE_MONTANT_DIFFERENT", "IGNOREE"] as const)("E3 — %s inchangée", (etat) => {
    expect(etatAffiche({ echeance: "2026-01-01", etat }, 3, "2026-10-08")).toBe(etat);
  });
});

describe("etatApresLiaison (E4)", () => {
  it.each([
    [-2299, "REALISEE"],
    [-2300, "REALISEE_MONTANT_DIFFERENT"],
    [-1299, "REALISEE"],
    [-1298, "REALISEE_MONTANT_DIFFERENT"],
  ])("montant %i → %s", (montant, attendu) => {
    expect(etatApresLiaison(montant, { montantCents: -1799 }, 500)).toBe(attendu);
  });
});

describe("estOccurrenceOuverte (E5)", () => {
  it.each([
    ["PREVUE", null, true],
    ["MANQUEE", null, true],
    ["PREVUE", "t1", false],
    ["REALISEE", "t1", false],
    ["IGNOREE", null, false],
    ["REALISEE_MONTANT_DIFFERENT", "t1", false],
  ] as const)("%s, %s → %s", (etat, transactionId, attendu) => {
    expect(estOccurrenceOuverte({ etat, transactionId })).toBe(attendu);
  });
});
