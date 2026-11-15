import { describe, expect, it } from "vitest";
import { resteAAssigner } from "./reste-a-assigner";

describe("resteAAssigner", () => {
  it("roule le reliquat, ajoute les revenus, retranche les allocations", () => {
    expect(resteAAssigner(100_00, 5_000_00, 4_800_00)).toBe(300_00);
  });

  it("peut devenir négatif — indicatif, jamais bloquant", () => {
    expect(resteAAssigner(0, 1_000_00, 1_200_00)).toBe(-200_00);
  });

  it("un mois sans revenu ni allocation ne change rien au reliquat", () => {
    expect(resteAAssigner(250_00, 0, 0)).toBe(250_00);
  });
});
