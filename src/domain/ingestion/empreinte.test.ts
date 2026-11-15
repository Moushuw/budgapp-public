import { describe, expect, it } from "vitest";
import { calculerEmpreinte } from "./empreinte";

describe("calculerEmpreinte", () => {
  it("est stable pour les mêmes entrées", () => {
    const a = calculerEmpreinte("compte-1", "2026-09-13", -1240, "IGA VALBRUME");
    const b = calculerEmpreinte("compte-1", "2026-09-13", -1240, "IGA VALBRUME");
    expect(a).toBe(b);
  });

  it("diffère si un seul champ change", () => {
    const reference = calculerEmpreinte("compte-1", "2026-09-13", -1240, "IGA VALBRUME");
    expect(calculerEmpreinte("compte-2", "2026-09-13", -1240, "IGA VALBRUME")).not.toBe(reference);
    expect(calculerEmpreinte("compte-1", "2026-09-14", -1240, "IGA VALBRUME")).not.toBe(reference);
    expect(calculerEmpreinte("compte-1", "2026-09-13", -1241, "IGA VALBRUME")).not.toBe(reference);
    expect(calculerEmpreinte("compte-1", "2026-09-13", -1240, "IGA LAC-BRUME")).not.toBe(reference);
  });
});
