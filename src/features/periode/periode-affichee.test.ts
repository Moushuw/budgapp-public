import { describe, expect, it } from "vitest";
import type { Periode } from "@/domain/periode";
import { hrefSansToutesDates, periodeAffichee } from "./periode-affichee";

const MOIS: Periode = { type: "MOIS", mois: "2026-10" };
const ANNEE: Periode = { type: "ANNEE", mois: "2026-10" };
const TOUT: Periode = { type: "TOUT", mois: "2026-10" };

describe("periodeAffichee", () => {
  it("PA1 — /transactions?toutesDates=1 affiche « Tout », mois du cookie conservé", () => {
    const p = new URLSearchParams("toutesDates=1");
    expect(periodeAffichee(MOIS, "/transactions", p)).toEqual({ periode: TOUT, surchargeUrl: true });
    expect(periodeAffichee(ANNEE, "/transactions", p)).toEqual({ periode: TOUT, surchargeUrl: true });
  });

  it("PA2 — cookie déjà TOUT : pas de surcharge", () => {
    expect(periodeAffichee(TOUT, "/transactions", new URLSearchParams("toutesDates=1"))).toEqual({
      periode: TOUT,
      surchargeUrl: false,
    });
  });

  it.each(["", "toutesDates=2", "toutesDates=1&toutesDates=1", "toutesDates=1&du=2026-01-01"])(
    "PA3 — « %s » ne surcharge pas la barre",
    (requete) => {
      expect(periodeAffichee(MOIS, "/transactions", new URLSearchParams(requete))).toEqual({
        periode: MOIS,
        surchargeUrl: false,
      });
    },
  );

  it.each(["/budgets", "/transactions/import", "/transactions/recurrences", "/transactions/"])(
    "PA4 — %s : inchangé",
    (chemin) => {
      expect(periodeAffichee(MOIS, chemin, new URLSearchParams("toutesDates=1"))).toEqual({
        periode: MOIS,
        surchargeUrl: false,
      });
    },
  );
});

describe("hrefSansToutesDates", () => {
  it("PA5 — retire toutesDates et garde le reste", () => {
    expect(hrefSansToutesDates("/transactions", new URLSearchParams("toutesDates=1&texte=netflix&compte=x"))).toBe(
      "/transactions?texte=netflix&compte=x",
    );
  });

  it("PA6 — seul toutesDates : l'adresse nue", () => {
    expect(hrefSansToutesDates("/transactions", new URLSearchParams("toutesDates=1"))).toBe("/transactions");
  });

  it("PA7 — ne mute pas l'entrée", () => {
    const p = new URLSearchParams("toutesDates=1&texte=a");
    hrefSansToutesDates("/transactions", p);
    expect(p.toString()).toBe("toutesDates=1&texte=a");
  });
});
