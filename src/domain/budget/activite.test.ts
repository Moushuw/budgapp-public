import { describe, expect, it } from "vitest";
import { entreDansActivite, type TransactionActivite } from "./activite";

function t(surcharge: Partial<TransactionActivite> = {}): TransactionActivite {
  return {
    subcategoryId: "sc",
    estVentilee: false,
    transferTransactionId: null,
    exclureDuBudget: false,
    parent: null,
    ...surcharge,
  };
}

describe("entreDansActivite (docs/lot-m0-revision.md §3.1)", () => {
  it("A1 — catégorisée ordinaire : vrai", () => {
    expect(entreDansActivite(t())).toBe(true);
  });
  it("A2 — sans sous-catégorie : faux", () => {
    expect(entreDansActivite(t({ subcategoryId: null }))).toBe(false);
  });
  it("A3 — côté de virement, même avec une sous-catégorie forcée : faux", () => {
    expect(entreDansActivite(t({ transferTransactionId: "autre" }))).toBe(false);
  });
  it("A4 — parent ventilé : faux", () => {
    expect(entreDansActivite(t({ estVentilee: true }))).toBe(false);
  });
  it("A5 — exclue du budget : faux", () => {
    expect(entreDansActivite(t({ exclureDuBudget: true }))).toBe(false);
  });
  it("A6 — fille dont le parent est exclu : faux", () => {
    expect(entreDansActivite(t({ parent: { exclureDuBudget: true } }))).toBe(false);
  });
  it("A7 — fille dont le parent n'est pas exclu : vrai", () => {
    expect(entreDansActivite(t({ parent: { exclureDuBudget: false } }))).toBe(true);
  });
});
