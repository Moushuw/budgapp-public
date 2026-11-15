import { describe, expect, it } from "vitest";
import { repartirParPourMille } from "./repartition";

function somme(valeurs: readonly number[]): number {
  return valeurs.reduce((a, b) => a + b, 0);
}

describe("repartirParPourMille (docs/lot-m2.md §4.2)", () => {
  it("RP1 — sortie de 100,01 $ en 333 / 333 / 334", () => {
    const r = repartirParPourMille(-10001, [333, 333, 334]);
    expect(r).toEqual([-3330, -3330, -3341]);
    expect(somme(r)).toBe(-10001);
  });

  it("RP2 — le signe d'une entrée est conservé", () => {
    expect(repartirParPourMille(10001, [333, 333, 334])).toEqual([3330, 3330, 3341]);
  });

  it("RP3 — la troncature se fait vers zéro", () => {
    expect(repartirParPourMille(-999, [500, 500])).toEqual([-499, -500]);
  });

  it("RP4 — une division exacte n'a rien à absorber", () => {
    expect(repartirParPourMille(1000, [125, 875])).toEqual([125, 875]);
  });

  it("RP5 — un zéro est +0 et la dernière ligne garde le signe", () => {
    const r = repartirParPourMille(-1, [500, 500]);
    expect(r).toEqual([0, -1]);
    expect(Object.is(r[0], 0)).toBe(true);
  });

  it("RP6 — la dernière ligne ne change jamais de signe", () => {
    const r = repartirParPourMille(-2, [250, 250, 250, 250]);
    expect(r).toEqual([0, 0, 0, -2]);
    expect(Object.is(r[0], 0)).toBe(true);
  });

  it("RP7 — somme exacte et aucun signe contraire sur 200 montants pseudo-aléatoires", () => {
    let graine = 12345;
    const suivant = (): number => {
      graine = (graine * 1103515245 + 12345) % 2147483648;
      return graine;
    };
    for (let i = 0; i < 200; i += 1) {
      const montant = suivant() * (suivant() % 2 === 0 ? 1 : -1);
      const r = repartirParPourMille(montant, [100, 200, 300, 400]);
      expect(somme(r)).toBe(montant);
      for (const ligne of r) {
        expect(montant < 0 ? ligne <= 0 : ligne >= 0).toBe(true);
        expect(Object.is(ligne, -0)).toBe(false);
      }
    }
  });

  it("RP8 — aucune part, aucune ligne", () => {
    expect(repartirParPourMille(-500, [])).toEqual([]);
  });
});
