import { describe, expect, it } from "vitest";
import type { Cadence } from "../dates";
import { cadenceDepuisMediane, cibleJours, toleranceJoursPourCadence, uniteCadence } from "./cadence";

describe("cadenceDepuisMediane (oracles K)", () => {
  it.each([
    [0, null],
    [4.5, null],
    [5, "HEBDO"],
    [9, "HEBDO"],
    [9.5, null],
    [11.5, null],
    [12, "AUX_2_SEMAINES"],
    [16, "AUX_2_SEMAINES"],
    [16.5, null],
    [27.4, null],
    [27.5, "MENSUEL"],
    [31, "MENSUEL"],
    [33.4, "MENSUEL"],
    [33.5, null],
    [55.5, null],
    [56, "AUX_2_MOIS"],
    [66, "AUX_2_MOIS"],
    [66.5, null],
    [86, "AUX_3_MOIS"],
    [96, "AUX_3_MOIS"],
    [177, "SEMESTRIEL"],
    [187, "SEMESTRIEL"],
    [359.5, null],
    [360, "ANNUEL"],
    [370, "ANNUEL"],
    [371, null],
  ])("m = %s → %s", (m, attendu) => {
    expect(cadenceDepuisMediane(m)).toBe(attendu);
  });
});

describe("toleranceJoursPourCadence (oracles K')", () => {
  it.each([
    ["HEBDO", 2],
    ["AUX_2_SEMAINES", 2],
    ["MENSUEL", 3],
    ["AUX_2_MOIS", 5],
    ["AUX_3_MOIS", 5],
    ["SEMESTRIEL", 5],
    ["ANNUEL", 5],
    ["AUX_4_SEMAINES", 3],
    ["DEUX_FOIS_PAR_MOIS", 3],
    ["AUX_4_MOIS", 3],
    ["AUX_2_ANS", 3],
    ["PONCTUEL", 3],
  ] satisfies [Cadence, number][])("%s → %i", (cadence, attendu) => {
    expect(toleranceJoursPourCadence(cadence)).toBe(attendu);
  });
});

describe("cibleJours et uniteCadence", () => {
  it("cible d'une cadence détectable", () => {
    expect(cibleJours("MENSUEL")).toBe(30.44);
    expect(cibleJours("ANNUEL")).toBe(365);
  });

  it("unité des 12 cadences", () => {
    const attendu: Record<Cadence, string> = {
      HEBDO: "SEMAINES",
      AUX_2_SEMAINES: "SEMAINES",
      AUX_4_SEMAINES: "SEMAINES",
      PONCTUEL: "AUCUNE",
      DEUX_FOIS_PAR_MOIS: "MOIS",
      MENSUEL: "MOIS",
      AUX_2_MOIS: "MOIS",
      AUX_3_MOIS: "MOIS",
      AUX_4_MOIS: "MOIS",
      SEMESTRIEL: "MOIS",
      ANNUEL: "MOIS",
      AUX_2_ANS: "MOIS",
    };
    for (const [cadence, unite] of Object.entries(attendu)) {
      expect(uniteCadence(cadence as Cadence)).toBe(unite);
    }
  });
});
