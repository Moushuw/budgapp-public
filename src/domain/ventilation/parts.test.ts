import { describe, expect, it } from "vitest";
import {
  cleVentilation,
  formatPartMille,
  lirePartsVentilation,
  serialiserPartsVentilation,
} from "./parts";

const PA1 = '[{"subcategoryId":"A","partMille":600},{"subcategoryId":"B","partMille":400}]';
const PARTS = [
  { subcategoryId: "A", partMille: 600 },
  { subcategoryId: "B", partMille: 400 },
];

describe("parts d'une règle VENTILER (docs/lot-m2.md §4.3)", () => {
  it("PA1 — lit une valeur correcte", () => {
    expect(lirePartsVentilation(PA1)).toEqual(PARTS);
  });

  it("PA2 — une clé de plus est ignorée", () => {
    const lu = lirePartsVentilation(
      '[{"subcategoryId":"A","partMille":600,"libelle":"x"},{"subcategoryId":"B","partMille":400}]',
    );
    expect(lu).toEqual(PARTS);
    expect(Object.keys(lu?.[0] ?? {})).toEqual(["subcategoryId", "partMille"]);
  });

  it("PA3 — valeur absente, vide, illisible ou pas un tableau", () => {
    expect(lirePartsVentilation(null)).toBeNull();
    expect(lirePartsVentilation("")).toBeNull();
    expect(lirePartsVentilation("{")).toBeNull();
    expect(lirePartsVentilation('{"subcategoryId":"A"}')).toBeNull();
  });

  it("PA4 — moins de deux ou plus de cinquante éléments", () => {
    expect(lirePartsVentilation('[{"subcategoryId":"A","partMille":1000}]')).toBeNull();
    const trop = Array.from({ length: 51 }, (_, i) => ({ subcategoryId: `s${i}`, partMille: i === 0 ? 950 : 1 }));
    expect(trop.reduce((a, p) => a + p.partMille, 0)).toBe(1000);
    expect(lirePartsVentilation(JSON.stringify(trop))).toBeNull();
  });

  it("PA5 — la somme doit faire 1000", () => {
    expect(lirePartsVentilation('[{"subcategoryId":"A","partMille":600},{"subcategoryId":"B","partMille":399}]')).toBeNull();
    expect(lirePartsVentilation('[{"subcategoryId":"A","partMille":600},{"subcategoryId":"B","partMille":401}]')).toBeNull();
  });

  it("PA6 — partMille hors 1..999, non entier ou non numérique", () => {
    for (const mauvaise of ["0", "-100", "12.5", '"600"']) {
      expect(
        lirePartsVentilation(`[{"subcategoryId":"A","partMille":${mauvaise}},{"subcategoryId":"B","partMille":400}]`),
      ).toBeNull();
    }
  });

  it("PA7 — subcategoryId absent, vide ou non chaîne", () => {
    for (const mauvais of ['"subcategoryId":"",', '"subcategoryId":"  ",', '"subcategoryId":42,', ""]) {
      expect(lirePartsVentilation(`[{${mauvais}"partMille":600},{"subcategoryId":"B","partMille":400}]`)).toBeNull();
    }
  });

  it("PA8 — un élément qui n'est pas un objet", () => {
    expect(lirePartsVentilation('[null,{"subcategoryId":"B","partMille":1000}]')).toBeNull();
    expect(lirePartsVentilation('["x",{"subcategoryId":"B","partMille":1000}]')).toBeNull();
  });

  it("PA9 — aller-retour sans perte", () => {
    expect(serialiserPartsVentilation(PARTS)).toBe(PA1);
    expect(lirePartsVentilation(serialiserPartsVentilation(PARTS))).toEqual(PARTS);
  });

  it("PA10 — clé d'égalité, sensible à l'ordre", () => {
    expect(cleVentilation(PARTS)).toBe("ventilation:A=600;B=400");
    expect(cleVentilation([...PARTS].reverse())).not.toBe(cleVentilation(PARTS));
  });

  it("PA11 — formatPartMille", () => {
    expect(formatPartMille(600)).toBe("60");
    expect(formatPartMille(125)).toBe("12,5");
    expect(formatPartMille(5)).toBe("0,5");
    expect(formatPartMille(1000)).toBe("100");
    expect(formatPartMille(333)).toBe("33,3");
  });
});
