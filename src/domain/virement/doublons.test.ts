import { describe, expect, it } from "vitest";
import { ciblesEnDouble } from "./doublons";

describe("ciblesEnDouble", () => {
  it("CD1 — aucun doublon : map vide", () => {
    expect(ciblesEnDouble([]).size).toBe(0);
  });

  it("CD2 — deux lignes sur la même cible : la seconde, vers la première", () => {
    const m = ciblesEnDouble([
      { cle: "l1", virementAvec: "t" },
      { cle: "l2", virementAvec: "t" },
    ]);
    expect([...m.entries()]).toEqual([["l2", "l1"]]);
  });

  it("CD3 — trois lignes : la 2e et la 3e pointent vers la 1re", () => {
    const m = ciblesEnDouble([
      { cle: "l1", virementAvec: "t" },
      { cle: "l2", virementAvec: "t" },
      { cle: "l3", virementAvec: "t" },
    ]);
    expect([...m.entries()]).toEqual([
      ["l2", "l1"],
      ["l3", "l1"],
    ]);
  });

  it("CD4 — les null sont ignorés, des cibles distinctes ne se signalent pas", () => {
    expect(
      ciblesEnDouble([
        { cle: "l1", virementAvec: null },
        { cle: "l2", virementAvec: null },
        { cle: "l3", virementAvec: "a" },
        { cle: "l4", virementAvec: "b" },
      ]).size,
    ).toBe(0);
  });
});
