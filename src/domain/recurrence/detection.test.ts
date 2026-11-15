import { describe, expect, it } from "vitest";
import { calculerScore, detecterRecurrences, natureDepuisStabilite } from "./detection";
import { G_BELAIR, G_CAFE, G_HYDRO, G_NETFLIX, G_PAIE, groupe } from "./groupes-reference";
import type { RegleCouvrante, SuggestionRefusee } from "./types";

const aucuneRegle: readonly RegleCouvrante[] = [];
const aucuneRefusee: readonly SuggestionRefusee[] = [];

describe("detecterRecurrences — groupes de référence", () => {
  it("D1 — Netflix, mensuel fixe malgré les mois de 28 à 31 jours", () => {
    const [s, ...autres] = detecterRecurrences([G_NETFLIX], aucuneRegle, aucuneRefusee, "2026-09-13");
    expect(autres).toEqual([]);
    expect(s).toMatchObject({
      cadence: "MENSUEL",
      nature: "FIXE",
      montantMedianCents: -1799,
      nbOccurrences: 19,
      stabilite: 0,
      score: 0.95,
      libelle: "Netflix.com",
      accountId: "visa",
      motif: "NETFLIX.COM",
    });
    expect(s?.regularite).toBeCloseTo(0.0246375, 6);
    expect(s?.transactionIds).toEqual(Array.from({ length: 19 }, (_, i) => `n${String(i + 1).padStart(2, "0")}`));
    expect(s?.dates).toEqual(G_NETFLIX.transactions.map((t) => t.date));
    expect(s?.dates[0]).toBe("2025-03-12");
    expect(s?.dates[18]).toBe("2026-09-12");
  });

  it("D2 — Hydro, variable", () => {
    const [s] = detecterRecurrences([G_HYDRO], aucuneRegle, aucuneRefusee, "2026-06-20");
    expect(s).toMatchObject({ cadence: "MENSUEL", nature: "VARIABLE", montantMedianCents: -10_250, score: 0.91, libelle: "Hydro-Quebec" });
    expect(s?.regularite).toBeCloseTo(0.037619, 6);
    expect(s?.stabilite).toBeCloseTo(0.0796582, 6);
  });

  it("D3 — paie aux deux semaines", () => {
    const [s] = detecterRecurrences([G_PAIE], aucuneRegle, aucuneRefusee, "2026-03-20");
    expect(s).toMatchObject({
      cadence: "AUX_2_SEMAINES",
      nature: "FIXE",
      montantMedianCents: 240_600,
      regularite: 0,
      stabilite: 0,
      score: 1,
      libelle: "Dépôt paie",
    });
  });

  it("D4 — café hebdomadaire", () => {
    const [s] = detecterRecurrences([G_CAFE], aucuneRegle, aucuneRefusee, "2026-03-31");
    expect(s).toMatchObject({ cadence: "HEBDO", nature: "FIXE", montantMedianCents: -2500, score: 0.9 });
  });

  it("D5 — assurance annuelle", () => {
    const [s] = detecterRecurrences([G_BELAIR], aucuneRegle, aucuneRefusee, "2026-09-13");
    expect(s).toMatchObject({ cadence: "ANNUEL", nature: "FIXE", montantMedianCents: -43_000, score: 0.7 });
  });

  it("D6 — deux lignes seulement : écarté", () => {
    const court = { ...G_NETFLIX, transactions: G_NETFLIX.transactions.slice(0, 2) };
    expect(detecterRecurrences([court], aucuneRegle, aucuneRefusee, "2026-09-13")).toEqual([]);
  });
});

describe("detecterRecurrences — bornes", () => {
  it("D7 — régularité juste dessous du seuil", () => {
    const g = groupe("r", "visa", "REG", ["2026-01-01", "2026-01-26", "2026-02-26", "2026-03-29", "2026-05-05"], -1000);
    const [s] = detecterRecurrences([g], aucuneRegle, aucuneRefusee, "2026-05-10");
    expect(s?.cadence).toBe("MENSUEL");
    expect(s?.regularite).toBeCloseTo(0.1368593, 6);
    expect(s?.score).toBe(0.63);
  });

  it("D8 — régularité juste dessus du seuil", () => {
    const g = groupe("r", "visa", "REG", ["2026-01-01", "2026-01-25", "2026-02-25", "2026-03-28", "2026-05-05"], -1000);
    expect(detecterRecurrences([g], aucuneRegle, aucuneRefusee, "2026-05-10")).toEqual([]);
  });

  it("D9 — stabilité juste dessous du seuil : FIXE", () => {
    const g = groupe("s", "cheque", "STAB", ["2026-01-05", "2026-02-05", "2026-03-05", "2026-04-05"], [-9293, -10_000, -10_000, -10_707]);
    const [s] = detecterRecurrences([g], aucuneRegle, aucuneRefusee, "2026-04-10");
    expect(s).toMatchObject({ nature: "FIXE", montantMedianCents: -10_000, score: 0.71 });
    expect(s?.stabilite).toBeCloseTo(0.0499925, 6);
    expect(s?.regularite).toBeCloseTo(0.0456198, 6);
  });

  it("D10 — stabilité juste dessus du seuil : VARIABLE", () => {
    const g = groupe("s", "cheque", "STAB", ["2026-01-05", "2026-02-05", "2026-03-05", "2026-04-05"], [-9292, -10_000, -10_000, -10_708]);
    const [s] = detecterRecurrences([g], aucuneRegle, aucuneRefusee, "2026-04-10");
    expect(s).toMatchObject({ nature: "VARIABLE", score: 0.7 });
    expect(s?.stabilite).toBeCloseTo(0.0500631, 6);
  });

  it("D11 — score sous le seuil (médiane exacte des intervalles)", () => {
    const g = groupe("x", "cheque", "SCORE", ["2026-01-05", "2026-02-05", "2026-03-05"], [-1000, -5000, -9000]);
    expect(detecterRecurrences([g], aucuneRegle, aucuneRefusee, "2026-03-10")).toEqual([]);
  });

  it("D11b — médiane exacte des intervalles (28 et 31 jours : 29,5, pas 30)", () => {
    const g = groupe("m", "visa", "MED", ["2026-01-31", "2026-02-28", "2026-03-31"], -1000);
    const [s, ...autres] = detecterRecurrences([g], aucuneRegle, aucuneRefusee, "2026-04-05");
    expect(autres).toEqual([]);
    expect(s?.cadence).toBe("MENSUEL");
    expect(s?.regularite).toBeCloseTo(0.0508475, 6);
  });

  it("D11c — médiane exacte des montants (valeurs absolues 1 à 4 : 2,5, pas 3)", () => {
    const g = groupe("m", "cheque", "MEDM", ["2026-01-05", "2026-02-05", "2026-03-05", "2026-04-05"], [-1, -2, -3, -4]);
    const [s, ...autres] = detecterRecurrences([g], aucuneRegle, aucuneRefusee, "2026-04-10");
    expect(autres).toEqual([]);
    expect(s).toMatchObject({ cadence: "MENSUEL", nature: "VARIABLE" });
    expect(s?.stabilite).toBeCloseTo(0.4472136, 6);
  });

  it("D12 — série vivante à 60 jours, morte à 61", () => {
    const g = groupe("v", "visa", "VIVE", ["2026-03-12", "2026-04-12", "2026-05-12", "2026-06-12"], -1799);
    const [s] = detecterRecurrences([g], aucuneRegle, aucuneRefusee, "2026-08-11");
    expect(s).toMatchObject({ cadence: "MENSUEL", score: 0.77 });
    expect(detecterRecurrences([g], aucuneRegle, aucuneRefusee, "2026-08-12")).toEqual([]);
  });

  it("D14 — cadence hors du tableau", () => {
    const g = groupe("z", "visa", "HORS", ["2026-01-01", "2026-02-15", "2026-04-01", "2026-05-16"], -1000);
    expect(detecterRecurrences([g], aucuneRegle, aucuneRefusee, "2026-05-20")).toEqual([]);
  });

  it("D15 — montants nuls", () => {
    const g = groupe("z", "visa", "ZERO", ["2026-01-05", "2026-02-05", "2026-03-05"], 0);
    expect(detecterRecurrences([g], aucuneRegle, aucuneRefusee, "2026-03-10")).toEqual([]);
  });
});

describe("detecterRecurrences — déjà couvert (D13)", () => {
  const ref = "2026-09-13";

  it("D13a — règle active de même compte et de même motif", () => {
    expect(detecterRecurrences([G_NETFLIX], [{ accountId: "visa", motifRapprochement: "NETFLIX.COM" }], aucuneRefusee, ref)).toEqual([]);
  });

  it("D13b — autre compte : proposée", () => {
    expect(detecterRecurrences([G_NETFLIX], [{ accountId: "cheque", motifRapprochement: "NETFLIX.COM" }], aucuneRefusee, ref)).toHaveLength(1);
  });

  it("D13c — égalité stricte, pas d'inclusion", () => {
    expect(detecterRecurrences([G_NETFLIX], [{ accountId: "visa", motifRapprochement: "NETFLIX" }], aucuneRefusee, ref)).toHaveLength(1);
  });

  it("D13d — règle sans motif : ne couvre rien", () => {
    expect(detecterRecurrences([G_NETFLIX], [{ accountId: "visa", motifRapprochement: null }], aucuneRefusee, ref)).toHaveLength(1);
  });

  it("D13e — refusée de même cadence", () => {
    expect(detecterRecurrences([G_NETFLIX], aucuneRegle, [{ accountId: "visa", motif: "NETFLIX.COM", cadence: "MENSUEL" }], ref)).toEqual([]);
  });

  it("D13f — refusée d'une autre cadence", () => {
    expect(detecterRecurrences([G_NETFLIX], aucuneRegle, [{ accountId: "visa", motif: "NETFLIX.COM", cadence: "ANNUEL" }], ref)).toHaveLength(1);
  });
});

describe("detecterRecurrences — ordre et déterminisme", () => {
  it("D16a — trié par score décroissant ; une série qui finit après la référence reste vivante", () => {
    const suggestions = detecterRecurrences([G_CAFE, G_NETFLIX], aucuneRegle, aucuneRefusee, "2026-03-31");
    expect(suggestions.map((s) => [s.libelle, s.score])).toEqual([
      ["Netflix.com", 0.95],
      ["Cafe Depot", 0.9],
    ]);
  });

  it("D16b — à score égal, accountId croissant", () => {
    const b = { ...G_NETFLIX, accountId: "b-compte" };
    const a = { ...G_NETFLIX, accountId: "a-compte" };
    const suggestions = detecterRecurrences([b, a], aucuneRegle, aucuneRefusee, "2026-09-13");
    expect(suggestions.map((s) => s.accountId)).toEqual(["a-compte", "b-compte"]);
  });

  it("à score et compte égaux, le motif croissant départage", () => {
    const zeta = { ...G_NETFLIX, descriptionNormalisee: "ZETA" };
    const alpha = { ...G_NETFLIX, descriptionNormalisee: "ALPHA" };
    const suggestions = detecterRecurrences([zeta, alpha], aucuneRegle, aucuneRefusee, "2026-09-13");
    expect(suggestions.map((s) => s.motif)).toEqual(["ALPHA", "ZETA"]);
  });

  it("D17 — l'ordre des transactions reçues ne change rien", () => {
    const inverse = { ...G_NETFLIX, transactions: [...G_NETFLIX.transactions].reverse() };
    expect(detecterRecurrences([inverse], aucuneRegle, aucuneRefusee, "2026-09-13")).toEqual(
      detecterRecurrences([G_NETFLIX], aucuneRegle, aucuneRefusee, "2026-09-13"),
    );
  });

  it("ne mute pas ses entrées", () => {
    const inverse = { ...G_NETFLIX, transactions: [...G_NETFLIX.transactions].reverse() };
    const avant = inverse.transactions.map((t) => t.id);
    detecterRecurrences([inverse], aucuneRegle, aucuneRefusee, "2026-09-13");
    expect(inverse.transactions.map((t) => t.id)).toEqual(avant);
  });
});

describe("calculerScore et natureDepuisStabilite", () => {
  it("S1 à S4", () => {
    expect(calculerScore(3, 0, 1)).toBe(0.5);
    expect(calculerScore(3, 0.00245, 1)).toBe(0.5);
    expect(calculerScore(3, 0.0028, 1)).toBe(0.49);
    expect(calculerScore(6, 0, 0)).toBe(1);
    expect(calculerScore(20, 0, 0)).toBe(1);
  });

  it("N1 — frontière de stabilité", () => {
    expect(natureDepuisStabilite(0.0499)).toBe("FIXE");
    expect(natureDepuisStabilite(0.05)).toBe("VARIABLE");
    expect(natureDepuisStabilite(0)).toBe("FIXE");
  });
});
