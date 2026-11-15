import { describe, expect, it } from "vitest";
import type { RegleAMaterialiser } from "./types";
import { horizonOccurrences, occurrencesAMaterialiser, occurrencesAPartirDe } from "./materialisation";

const mensuelle = (surcharge: Partial<RegleAMaterialiser> = {}): RegleAMaterialiser => ({
  cadence: "MENSUEL",
  dateAncrage: "2026-01-12",
  dateFin: null,
  montantCents: -1799,
  ...surcharge,
});

const echeancesDe = (regle: RegleAMaterialiser, jusqua: string): string[] =>
  occurrencesAMaterialiser(regle, jusqua).map((o) => o.echeance);

describe("occurrencesAMaterialiser", () => {
  it("M1 — ancrage le 31, mois courts", () => {
    const resultat = occurrencesAMaterialiser(mensuelle({ dateAncrage: "2026-01-31" }), "2026-05-15");
    expect(resultat).toEqual([
      { echeance: "2026-01-31", montantCents: -1799 },
      { echeance: "2026-02-28", montantCents: -1799 },
      { echeance: "2026-03-31", montantCents: -1799 },
      { echeance: "2026-04-30", montantCents: -1799 },
    ]);
  });

  it("M2 — dateFin incluse", () => {
    expect(echeancesDe(mensuelle({ dateFin: "2026-03-12" }), "2026-12-31")).toEqual(["2026-01-12", "2026-02-12", "2026-03-12"]);
  });

  it("M3 — dateFin la veille d'une échéance", () => {
    expect(echeancesDe(mensuelle({ dateFin: "2026-03-11" }), "2026-12-31")).toEqual(["2026-01-12", "2026-02-12"]);
  });

  it("M4 — dateFin au-delà de l'horizon", () => {
    expect(echeancesDe(mensuelle({ dateFin: "2027-06-01" }), "2026-03-12")).toEqual(["2026-01-12", "2026-02-12", "2026-03-12"]);
  });

  it("M5 — ponctuel", () => {
    const ponctuelle = mensuelle({ cadence: "PONCTUEL", dateAncrage: "2026-05-01", montantCents: -500 });
    expect(echeancesDe(ponctuelle, "2026-12-31")).toEqual(["2026-05-01"]);
    expect(echeancesDe(ponctuelle, "2026-04-30")).toEqual([]);
    expect(echeancesDe({ ...ponctuelle, dateFin: "2026-04-30" }, "2026-12-31")).toEqual([]);
  });

  it("M6 — ancrage après l'horizon", () => {
    expect(echeancesDe(mensuelle({ dateAncrage: "2026-06-01" }), "2026-05-31")).toEqual([]);
  });

  it("M7 — idempotence et préfixe", () => {
    const regle = mensuelle();
    expect(occurrencesAMaterialiser(regle, "2026-12-31")).toEqual(occurrencesAMaterialiser(regle, "2026-12-31"));
    const court = occurrencesAMaterialiser(regle, "2026-03-31");
    expect(occurrencesAMaterialiser(regle, "2026-12-31").slice(0, court.length)).toEqual(court);
  });

  it("M9 — aux deux semaines", () => {
    const regle = mensuelle({ cadence: "AUX_2_SEMAINES", dateAncrage: "2026-01-02", montantCents: 240_600 });
    expect(echeancesDe(regle, "2026-02-13")).toEqual(["2026-01-02", "2026-01-16", "2026-01-30", "2026-02-13"]);
  });
});

describe("occurrencesAPartirDe", () => {
  const regle = mensuelle({ dateAncrage: "2099-01-15", montantCents: -2500 });
  const depuis = (de: string | null, jusqua: string, r: RegleAMaterialiser = regle): string[] =>
    occurrencesAPartirDe(r, de, jusqua).map((o) => o.echeance);

  it("M1 — depuis null : toutes les échéances", () => {
    const resultat = occurrencesAPartirDe(regle, null, "2099-06-30");
    expect(resultat).toEqual(occurrencesAMaterialiser(regle, "2099-06-30"));
    expect(resultat.map((o) => o.echeance)).toEqual([
      "2099-01-15",
      "2099-02-15",
      "2099-03-15",
      "2099-04-15",
      "2099-05-15",
      "2099-06-15",
    ]);
  });

  it("M2 — depuis est inclus", () => {
    expect(depuis("2099-03-15", "2099-06-30")).toEqual(["2099-03-15", "2099-04-15", "2099-05-15", "2099-06-15"]);
  });

  it("M3 — depuis au lendemain d'une échéance l'exclut", () => {
    expect(depuis("2099-03-16", "2099-06-30")).toEqual(["2099-04-15", "2099-05-15", "2099-06-15"]);
  });

  it("M4 — dateFin avant depuis : rien", () => {
    expect(depuis("2099-05-01", "2099-06-30", { ...regle, dateFin: "2099-04-30" })).toEqual([]);
  });

  it("M5 — depuis après jusqua : rien", () => {
    expect(depuis("2099-07-01", "2099-06-30")).toEqual([]);
  });

  it("M6 — ponctuel", () => {
    const ponctuelle = { ...regle, cadence: "PONCTUEL", dateAncrage: "2099-03-15" } as const;
    expect(depuis("2099-03-15", "2099-12-31", ponctuelle)).toEqual(["2099-03-15"]);
    expect(depuis("2099-03-16", "2099-12-31", ponctuelle)).toEqual([]);
  });
});

describe("horizonOccurrences (M8)", () => {
  it("douze mois plus tard, borné à la fin du mois", () => {
    expect(horizonOccurrences("2026-10-08")).toBe("2027-10-08");
    expect(horizonOccurrences("2028-02-29")).toBe("2029-02-28");
  });
});
