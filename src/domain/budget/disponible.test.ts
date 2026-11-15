import { describe, expect, it } from "vitest";
import { disponible } from "./disponible";

describe("disponible", () => {
  it("additionne report, alloué et activité", () => {
    expect(disponible(100_00, 600_00, -540_00)).toBe(160_00);
  });

  it("épicerie dépassée de 84 $ en août : septembre affiche 516 $ de disponible", () => {
    // Alloué 600 $, dépensé 684 $ en août (report = disponible(août) = -84 $),
    // rien dépensé en septembre pour l'instant.
    const reportAout = disponible(0, 600_00, -684_00);
    expect(reportAout).toBe(-84_00);
    expect(disponible(reportAout, 600_00, 0)).toBe(516_00);
  });

  it("peut être négatif — un dépassement réel", () => {
    expect(disponible(0, 100_00, -150_00)).toBe(-50_00);
  });
});
