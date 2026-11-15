import { describe, expect, it } from "vitest";
import { MONTANT_MAX_CENTS } from "../edition/limites";
import { ecart, ecartRepresentable, refusAjustement, soldeCalcule, statutAncrage } from "./calcul";

describe("soldeCalcule", () => {
  it("SC1 — solde initial plus somme des transactions", () => {
    expect(soldeCalcule(250_000, -12_345)).toBe(237_655);
  });
  it("SC2 — zéro et zéro", () => {
    expect(soldeCalcule(0, 0)).toBe(0);
  });
  it("SC3 — un solde négatif (dette) reste signé", () => {
    expect(soldeCalcule(-45_000_000, 1_980_000)).toBe(-43_020_000);
  });
});

describe("ecart", () => {
  it("EC1 — déclaré supérieur au calculé : écart positif", () => {
    expect(ecart(105_000, 100_000)).toBe(5_000);
  });
  it("EC2 — déclaré inférieur au calculé : écart négatif", () => {
    expect(ecart(100_000, 105_000)).toBe(-5_000);
  });
  it("EC3 — jamais -0", () => {
    expect(Object.is(ecart(5, 5), 0)).toBe(true);
    expect(Object.is(ecart(-5, -5), 0)).toBe(true);
  });
});

describe("statutAncrage", () => {
  it("ST1 — écart nul sans explication : équilibré", () => {
    expect(statutAncrage(0, null)).toBe("EQUILIBRE");
  });
  it("ST2 — écart nul avec explication : équilibré", () => {
    expect(statutAncrage(0, "texte")).toBe("EQUILIBRE");
  });
  it("ST3 — écart non nul avec explication : expliqué", () => {
    expect(statutAncrage(5_000, "transactions de septembre pas encore importées")).toBe("EXPLIQUE");
  });
  it("ST4 — écart non nul sans explication : ouvert", () => {
    expect(statutAncrage(5_000, null)).toBe("ECART_OUVERT");
  });
  it("ST5 — une explication faite d'espaces ne compte pas", () => {
    expect(statutAncrage(-1, "   ")).toBe("ECART_OUVERT");
  });
  it("ST6 — écart négatif expliqué", () => {
    expect(statutAncrage(-5_000, "x")).toBe("EXPLIQUE");
  });
});

describe("ecartRepresentable", () => {
  it("RE1 — borné par le plus grand montant enregistrable, dans les deux sens", () => {
    expect(ecartRepresentable(MONTANT_MAX_CENTS)).toBe(true);
    expect(ecartRepresentable(MONTANT_MAX_CENTS + 1)).toBe(false);
    expect(ecartRepresentable(-MONTANT_MAX_CENTS)).toBe(true);
    expect(ecartRepresentable(-MONTANT_MAX_CENTS - 1)).toBe(false);
  });
});

describe("refusAjustement", () => {
  it("RA1 — écart non nul sans ajustement : permis", () => {
    expect(refusAjustement(5_000, false)).toBeNull();
  });
  it("RA2 — ajustement déjà présent", () => {
    expect(refusAjustement(5_000, true)).toBe("AJUSTEMENT_EXISTANT");
  });
  it("RA3 — écart nul", () => {
    expect(refusAjustement(0, false)).toBe("ECART_NUL");
  });
  it("RA4 — l'ajustement existant l'emporte sur l'écart nul", () => {
    expect(refusAjustement(0, true)).toBe("AJUSTEMENT_EXISTANT");
  });
  it("RA5 — écart hors limite", () => {
    expect(refusAjustement(MONTANT_MAX_CENTS + 1, false)).toBe("ECART_HORS_LIMITE");
    expect(refusAjustement(-MONTANT_MAX_CENTS - 1, false)).toBe("ECART_HORS_LIMITE");
  });
});
