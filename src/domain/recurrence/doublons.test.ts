import { describe, expect, it } from "vitest";
import { occurrencesEnDouble } from "./doublons";

describe("occurrencesEnDouble", () => {
  it("OD1 — aucune occurrence en commun : map vide", () => {
    expect(
      occurrencesEnDouble([
        { cle: "e1", occurrenceAvec: "o1" },
        { cle: "e2", occurrenceAvec: "o2" },
      ]).size,
    ).toBe(0);
    expect(occurrencesEnDouble([]).size).toBe(0);
  });

  it("OD2 — deux lignes sur la même occurrence : la seconde, vers la première", () => {
    const m = occurrencesEnDouble([
      { cle: "e1", occurrenceAvec: "o1" },
      { cle: "e2", occurrenceAvec: "o1" },
    ]);
    expect([...m.entries()]).toEqual([["e2", "e1"]]);
  });

  it("OD3 — trois lignes : la 2e et la 3e pointent vers la 1re", () => {
    const m = occurrencesEnDouble([
      { cle: "e1", occurrenceAvec: "o1" },
      { cle: "e2", occurrenceAvec: "o1" },
      { cle: "e3", occurrenceAvec: "o1" },
    ]);
    expect([...m.entries()]).toEqual([
      ["e2", "e1"],
      ["e3", "e1"],
    ]);
  });

  it("OD4 — les null sont ignorés, même nombreux", () => {
    expect(
      occurrencesEnDouble([
        { cle: "e1", occurrenceAvec: null },
        { cle: "e2", occurrenceAvec: null },
        { cle: "e3", occurrenceAvec: null },
        { cle: "e4", occurrenceAvec: "o1" },
      ]).size,
    ).toBe(0);
  });
});
