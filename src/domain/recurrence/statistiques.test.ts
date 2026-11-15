import { describe, expect, it } from "vitest";
import { ecartTypePopulation, jourModal, jourSemaineModal, medianeExacte } from "./statistiques";

describe("statistiques de récurrence", () => {
  it("ST1 — médiane exacte", () => {
    expect(medianeExacte([31, 28])).toBe(29.5);
    expect(medianeExacte([3, 1, 2])).toBe(2);
    expect(medianeExacte([5])).toBe(5);
    expect(() => medianeExacte([])).toThrow();
  });

  it("ST2 — écart-type de population", () => {
    expect(ecartTypePopulation([2, 4, 4, 4, 5, 5, 7, 9])).toBe(2);
    expect(ecartTypePopulation([7, 7, 7])).toBe(0);
    expect(() => ecartTypePopulation([])).toThrow();
  });

  it("ST3 — jour modal, le plus petit à égalité", () => {
    expect(jourModal(["2026-01-10", "2026-02-12", "2026-03-10", "2026-04-12"])).toBe(10);
    expect(() => jourModal([])).toThrow();
  });

  it("ST4 — jour de la semaine modal, lundi d'abord à égalité", () => {
    expect(jourSemaineModal(["2026-03-02", "2026-03-10", "2026-03-16", "2026-03-24"])).toBe(1);
    expect(() => jourSemaineModal([])).toThrow();
  });

  it("n'altère pas le tableau reçu", () => {
    const valeurs = [3, 1, 2];
    medianeExacte(valeurs);
    expect(valeurs).toEqual([3, 1, 2]);
  });
});
