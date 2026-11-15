import { describe, expect, it } from "vitest";
import {
  champEntierObligatoire,
  champEntierOptionnel,
  champMontantObligatoire,
  champMontantOptionnel,
  champPourcentageOptionnel,
  champTexteOptionnel,
  formatMontantChamp,
  formatPourcentageChamp,
} from "./champs-formulaire";

describe("champMontantObligatoire", () => {
  it("convertit un montant bien formé", () => {
    const resultat = champMontantObligatoire().safeParse("1 234,56");
    expect(resultat.success).toBe(true);
    if (resultat.success) {
      expect(resultat.data).toBe(123456);
    }
  });

  it("accepte le signe libre, y compris le moins typographique", () => {
    expect(champMontantObligatoire().parse("-1 234,56")).toBe(-123456);
    expect(champMontantObligatoire().parse("−1 234,56")).toBe(-123456);
  });

  it("refuse une chaîne vide comme obligatoire", () => {
    const resultat = champMontantObligatoire().safeParse("");
    expect(resultat.success).toBe(false);
    if (!resultat.success) {
      expect(resultat.error.issues[0]?.message).toMatch(/obligatoire/i);
    }
  });

  it("refuse une saisie illisible avec le message par défaut", () => {
    const resultat = champMontantObligatoire().safeParse("12,OO");
    expect(resultat.success).toBe(false);
    if (!resultat.success) {
      expect(resultat.error.issues[0]?.message).toBe("Montant illisible. Exemple : 250,00");
    }
  });
});

describe("champMontantOptionnel", () => {
  it.each(["", "   "])("retourne null pour %j", (valeur) => {
    expect(champMontantOptionnel().parse(valeur)).toBeNull();
  });

  it("applique la borne minimale avec le message fourni", () => {
    const resultat = champMontantOptionnel({ min: 0, messageMin: "Ne peut pas être négatif." }).safeParse("-1");
    expect(resultat.success).toBe(false);
    if (!resultat.success) {
      expect(resultat.error.issues[0]?.message).toBe("Ne peut pas être négatif.");
    }
  });
});

describe("champEntierOptionnel", () => {
  it("31 dans [1, 31] est accepté", () => {
    expect(champEntierOptionnel({ min: 1, max: 31 }).parse("31")).toBe(31);
  });

  it("0 est hors borne minimale", () => {
    expect(champEntierOptionnel({ min: 1, max: 31 }).safeParse("0").success).toBe(false);
  });

  it("32 est hors borne maximale", () => {
    expect(champEntierOptionnel({ min: 1, max: 31 }).safeParse("32").success).toBe(false);
  });

  it("12,5 est illisible", () => {
    expect(champEntierOptionnel({ min: 1, max: 31 }).safeParse("12,5").success).toBe(false);
  });

  it("chaîne vide retourne null", () => {
    expect(champEntierOptionnel({ min: 1, max: 31 }).parse("")).toBeNull();
  });
});

describe("champEntierObligatoire", () => {
  it("zéro est une valeur, pas un vide", () => {
    expect(champEntierObligatoire({ min: 0 }).parse("0")).toBe(0);
  });
});

describe("champPourcentageOptionnel", () => {
  it("19,99 devient 0.1999", () => {
    expect(champPourcentageOptionnel().parse("19,99")).toBe(0.1999);
  });

  it("0 devient 0", () => {
    expect(champPourcentageOptionnel().parse("0")).toBe(0);
  });

  it("chaîne vide devient null", () => {
    expect(champPourcentageOptionnel().parse("")).toBeNull();
  });

  it("abc est illisible", () => {
    expect(champPourcentageOptionnel().safeParse("abc").success).toBe(false);
  });

  it("101 est hors borne maximale [0, 100]", () => {
    expect(champPourcentageOptionnel({ min: 0, max: 100 }).safeParse("101").success).toBe(false);
  });

  it("-1 est hors borne minimale [0, 100]", () => {
    expect(champPourcentageOptionnel({ min: 0, max: 100 }).safeParse("-1").success).toBe(false);
  });
});

describe("champTexteOptionnel", () => {
  it.each(["", "   ", null])("retourne null pour %j", (valeur) => {
    expect(champTexteOptionnel(80).parse(valeur)).toBeNull();
  });
});

describe("formatMontantChamp", () => {
  it("retourne une chaîne vide pour null", () => {
    expect(formatMontantChamp(null)).toBe("");
  });

  it("formate un montant négatif en fr-CA", () => {
    expect(formatMontantChamp(-123456)).toBe("-1 234,56 $");
  });
});

describe("formatPourcentageChamp", () => {
  it("0.1999 devient 19,99", () => {
    expect(formatPourcentageChamp(0.1999)).toBe("19,99");
  });

  it("null devient une chaîne vide", () => {
    expect(formatPourcentageChamp(null)).toBe("");
  });
});

describe("aller-retour champMontantOptionnel / formatMontantChamp", () => {
  it.each([0, 1, -1, 123456, -123456])("%i survit à l'aller-retour", (c) => {
    expect(champMontantOptionnel().parse(formatMontantChamp(c))).toBe(c);
  });
});
