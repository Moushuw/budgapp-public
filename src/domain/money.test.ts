import { describe, expect, it } from "vitest";
import { additionner, decouperMontants, formatMontant, mediane, parseMontant, quantile } from "./money";

describe("decouperMontants", () => {
  const recompose = (texte: string): string =>
    decouperMontants(texte)
      .map((s) => s.texte)
      .join("");

  it("découpe un texte à deux montants en cinq segments", () => {
    const texte = `montant de ${formatMontant(2499)} au lieu de ${formatMontant(1799)} attendu`;
    const segments = decouperMontants(texte);
    expect(segments).toHaveLength(5);
    expect(segments.filter((s) => s.montant).map((s) => s.texte)).toEqual([
      formatMontant(2499),
      formatMontant(1799),
    ]);
    expect(recompose(texte)).toBe(texte);
  });

  it.each([0, 1, 99, 1799, 123456, 100000000, -1799])("reconnaît formatMontant(%i) comme un seul montant", (c) => {
    const f = formatMontant(c);
    expect(decouperMontants(f)).toEqual([{ texte: f, montant: true }]);
  });

  it("rend un seul segment non montant pour un texte sans montant", () => {
    expect(decouperMontants("Concorde sur la description")).toEqual([
      { texte: "Concorde sur la description", montant: false },
    ]);
  });

  it("rend [] pour une chaîne vide", () => {
    expect(decouperMontants("")).toEqual([]);
  });

  it.each(["2026-10-12", "± 3 jours", "le 12 octobre"])("ne confond pas « %s » avec un montant", (texte) => {
    expect(decouperMontants(texte).some((s) => s.montant)).toBe(false);
    expect(recompose(texte)).toBe(texte);
  });

  it("garde deux montants adjacents séparés par « · » en deux segments", () => {
    const texte = `${formatMontant(100)} · ${formatMontant(250)}`;
    const segments = decouperMontants(texte);
    expect(segments.filter((s) => s.montant)).toHaveLength(2);
    expect(recompose(texte)).toBe(texte);
  });
});

describe("parseMontant", () => {
  it("lit un montant avec séparateur de milliers en espace insécable", () => {
    expect(parseMontant("1 240,00 $")).toBe(124_000);
  });

  it("lit un montant négatif avec signe moins typographique", () => {
    expect(parseMontant("−54,99")).toBe(-5_499);
  });

  it("lit un montant positif avec signe explicite et espace insécable étroite", () => {
    expect(parseMontant("+2 406,00 $")).toBe(240_600);
  });

  it("lit un montant entier sans décimales", () => {
    expect(parseMontant("12 $")).toBe(1_200);
  });

  it("lit un montant négatif avec signe hyphen-minus ordinaire", () => {
    expect(parseMontant("-54,99")).toBe(-5_499);
  });

  it("accepte le point comme séparateur décimal", () => {
    expect(parseMontant("12.50")).toBe(1_250);
  });

  it("arrondit à la demi-unité vers le haut", () => {
    expect(parseMontant("12,345")).toBe(1_235);
  });

  it("arrondit à la demi-unité vers le bas", () => {
    expect(parseMontant("12,344")).toBe(1_234);
  });

  it("gère la retenue quand l'arrondi fait déborder les cents", () => {
    expect(parseMontant("12,995")).toBe(1_300);
  });

  it("gère un montant à trois décimales", () => {
    expect(parseMontant("100,123")).toBe(10_012);
  });

  it("retourne null sur une chaîne vide", () => {
    expect(parseMontant("")).toBeNull();
  });

  it("retourne null sur une chaîne sans chiffre", () => {
    expect(parseMontant("abc $")).toBeNull();
  });

  it("retourne null sur une entrée illisible plutôt que NaN ou 0", () => {
    const resultat = parseMontant("douze dollars");
    expect(resultat).not.toBeNaN();
    expect(resultat).toBeNull();
  });
});

describe("formatMontant", () => {
  // Intl.NumberFormat("fr-CA") sépare avec une espace insécable (U+00A0),
  // pas une espace ordinaire.
  it("formate en fr-CA avec deux décimales par défaut", () => {
    expect(formatMontant(124_000)).toBe("1 240,00 $");
  });

  it("formate un montant négatif", () => {
    expect(formatMontant(-5_499)).toBe("-54,99 $");
  });

  it("arrondit au dollar quand demandé", () => {
    expect(formatMontant(125_050, "DOLLARS")).toBe("1 251 $");
  });
});

describe("additionner", () => {
  it("additionne des montants signés", () => {
    expect(additionner(1_000, -300, 250)).toBe(950);
  });

  it("retourne 0 sans argument", () => {
    expect(additionner()).toBe(0);
  });
});

describe("mediane et quantile", () => {
  it("calcule la médiane sur un nombre impair de valeurs", () => {
    expect(mediane([300, 100, 200])).toBe(200);
  });

  it("interpole la médiane sur un nombre pair de valeurs", () => {
    expect(mediane([100, 200, 300, 400])).toBe(250);
  });

  it("le quantile 0 est le minimum et le quantile 1 le maximum", () => {
    const valeurs = [500, 100, 300, 400, 200];
    expect(quantile(valeurs, 0)).toBe(100);
    expect(quantile(valeurs, 1)).toBe(500);
  });

  it("prouve que la médiane bat la moyenne face à une valeur aberrante", () => {
    // Six mois d'épicerie avec un mois de réception à 1 180 $.
    const depenses = [590, 610, 605, 1_180, 615, 620].map((d) => d * 100);
    expect(mediane(depenses)).toBe(61_250);
  });
});
