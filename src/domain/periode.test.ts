import { describe, expect, it } from "vitest";
import {
  bornesPeriode,
  changerTypePeriode,
  deplacerPeriode,
  estMois,
  libellePeriode,
  lirePeriode,
  periodeParDefaut,
  serialiserPeriode,
  type Periode,
} from "./periode";

describe("estMois", () => {
  it("accepte AAAA-MM", () => {
    expect(estMois("2026-09")).toBe(true);
  });

  it.each(["2026-13", "2026-00", "2026-9", "26-09", ""])("refuse « %s »", (valeur) => {
    expect(estMois(valeur)).toBe(false);
  });
});

describe("periodeParDefaut", () => {
  it("est le mois de la date du jour", () => {
    expect(periodeParDefaut("2026-10-04")).toEqual({ type: "MOIS", mois: "2026-10" });
  });
});

describe("bornesPeriode", () => {
  it("mois de février, ordinaire et bissextile", () => {
    expect(bornesPeriode({ type: "MOIS", mois: "2026-02" })).toEqual({ du: "2026-02-01", au: "2026-02-28" });
    expect(bornesPeriode({ type: "MOIS", mois: "2028-02" }).au).toBe("2028-02-29");
  });

  it("année : de janvier à décembre de l'année du mois de référence", () => {
    expect(bornesPeriode({ type: "ANNEE", mois: "2026-09" })).toEqual({ du: "2026-01-01", au: "2026-12-31" });
  });

  it("tout : aucune borne", () => {
    expect(bornesPeriode({ type: "TOUT", mois: "2026-09" })).toEqual({ du: null, au: null });
  });
});

describe("deplacerPeriode", () => {
  it("mois : passe l'année", () => {
    expect(deplacerPeriode({ type: "MOIS", mois: "2026-01" }, -1)).toEqual({ type: "MOIS", mois: "2025-12" });
    expect(deplacerPeriode({ type: "MOIS", mois: "2025-12" }, 1)).toEqual({ type: "MOIS", mois: "2026-01" });
  });

  it("année : douze mois, mois de référence conservé", () => {
    expect(deplacerPeriode({ type: "ANNEE", mois: "2026-09" }, -1)).toEqual({ type: "ANNEE", mois: "2025-09" });
  });

  it("tout : inchangée, à l'identique", () => {
    const tout: Periode = { type: "TOUT", mois: "2026-09" };
    expect(deplacerPeriode(tout, 1)).toBe(tout);
  });
});

describe("changerTypePeriode", () => {
  it("conserve le mois de référence, aller et retour", () => {
    const annee = changerTypePeriode({ type: "MOIS", mois: "2025-11" }, "ANNEE");
    expect(annee).toEqual({ type: "ANNEE", mois: "2025-11" });
    expect(changerTypePeriode(annee, "MOIS")).toEqual({ type: "MOIS", mois: "2025-11" });
    expect(changerTypePeriode(annee, "TOUT").mois).toBe("2025-11");
  });
});

describe("serialiserPeriode et lirePeriode", () => {
  it.each(["MOIS", "ANNEE", "TOUT"] as const)("aller-retour pour %s", (type) => {
    const periode: Periode = { type, mois: "2026-09" };
    expect(serialiserPeriode(periode)).toBe(`${type}:2026-09`);
    expect(lirePeriode(serialiserPeriode(periode), "2030-01-01")).toEqual(periode);
  });

  it.each([undefined, "", "MOIS", "SEMAINE:2026-09", "MOIS:2026-13", "MOIS:2026-09:extra"])(
    "retombe sur le défaut pour %s",
    (brut) => {
      expect(lirePeriode(brut, "2030-01-15")).toEqual({ type: "MOIS", mois: "2030-01" });
    },
  );
});

describe("libellePeriode", () => {
  it("mois, long et court", () => {
    expect(libellePeriode({ type: "MOIS", mois: "2026-09" }, "LONG")).toBe("septembre 2026");
    expect(libellePeriode({ type: "MOIS", mois: "2026-09" }, "COURT")).toBe("sept. 2026");
    expect(libellePeriode({ type: "MOIS", mois: "2026-08" }, "LONG")).toBe("août 2026");
  });

  it("année et tout", () => {
    expect(libellePeriode({ type: "ANNEE", mois: "2026-09" }, "LONG")).toBe("2026");
    expect(libellePeriode({ type: "TOUT", mois: "2026-09" }, "LONG")).toBe("Toutes les dates");
    expect(libellePeriode({ type: "TOUT", mois: "2026-09" }, "COURT")).toBe("Tout");
  });
});
