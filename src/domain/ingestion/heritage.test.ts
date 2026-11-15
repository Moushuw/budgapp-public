import { describe, expect, it } from "vitest";
import type { ConflitRegles } from "../categorization";
import { type EtatHeritage, sousCategorieHeritable } from "./heritage";

const vide: EtatHeritage = {
  subcategoryId: null,
  ventilationPresente: false,
  virementAvec: null,
  conflits: [],
  slotsArbitres: [],
};

function conflit(slot: ConflitRegles["slot"]): ConflitRegles {
  return { slot } as ConflitRegles;
}

describe("sousCategorieHeritable", () => {
  it("H1 — tout vide : héritable", () => {
    expect(sousCategorieHeritable(vide)).toBe(true);
  });

  it("H2 — sous-catégorie déjà posée : non", () => {
    expect(sousCategorieHeritable({ ...vide, subcategoryId: "sc-1" })).toBe(false);
  });

  it("H3 — ventilation présente : non", () => {
    expect(sousCategorieHeritable({ ...vide, ventilationPresente: true })).toBe(false);
  });

  it("H4 — virement : non", () => {
    expect(sousCategorieHeritable({ ...vide, virementAvec: "t-1" })).toBe(false);
  });

  it("H5 — conflit sur SOUS_CATEGORIE : non", () => {
    expect(sousCategorieHeritable({ ...vide, conflits: [conflit("SOUS_CATEGORIE")] })).toBe(false);
  });

  it("H6 — conflit sur NOTE seul, puis BENEFICIAIRE seul : oui (D3)", () => {
    expect(sousCategorieHeritable({ ...vide, conflits: [conflit("NOTE")] })).toBe(true);
    expect(sousCategorieHeritable({ ...vide, conflits: [conflit("BENEFICIAIRE")] })).toBe(true);
  });

  it("H7 — créneau SOUS_CATEGORIE arbitré : non", () => {
    expect(sousCategorieHeritable({ ...vide, slotsArbitres: ["SOUS_CATEGORIE"] })).toBe(false);
    expect(sousCategorieHeritable({ ...vide, slotsArbitres: ["NOTE"] })).toBe(true);
  });
});
