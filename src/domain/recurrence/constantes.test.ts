import { describe, expect, it } from "vitest";
import {
  ETATS_OCCURRENCE,
  LIBELLES_ETAT_OCCURRENCE,
  LIBELLES_NATURE_RECURRENCE,
  LIBELLES_TYPE_LIAISON,
  NATURES_RECURRENCE,
  TYPES_LIAISON,
} from "../referentiel";
import {
  CADENCES_RECURRENCE,
  PORTIONS_OCCURRENCES,
  TAILLE_PAGE_ECHEANCES_A_VENIR,
  TAILLE_PAGE_OCCURRENCES,
  TOLERANCE_JOURS_MAX,
  taillePageOccurrences,
} from "./constantes";
import { libelleCadence } from "./libelles";

describe("constantes des récurrences", () => {
  it("C1 — douze cadences distinctes, chacune avec son libellé", () => {
    expect(CADENCES_RECURRENCE).toHaveLength(12);
    expect(new Set(CADENCES_RECURRENCE).size).toBe(12);
    for (const cadence of CADENCES_RECURRENCE) {
      expect(libelleCadence(cadence), cadence).not.toBe("");
    }
  });

  it("C2 — un libellé par état d'occurrence, par type de liaison et par nature", () => {
    expect(Object.keys(LIBELLES_ETAT_OCCURRENCE).sort()).toEqual([...ETATS_OCCURRENCE].sort());
    expect(Object.keys(LIBELLES_TYPE_LIAISON).sort()).toEqual([...TYPES_LIAISON].sort());
    expect(Object.keys(LIBELLES_NATURE_RECURRENCE).sort()).toEqual([...NATURES_RECURRENCE].sort());
  });

  it("C3 — bornes", () => {
    expect(TOLERANCE_JOURS_MAX).toBe(31);
    expect(TAILLE_PAGE_OCCURRENCES).toBe(25);
  });

  it("C4 — portions des échéances et taille de page de chacune", () => {
    expect(PORTIONS_OCCURRENCES).toEqual(["A_VENIR", "PASSEES"]);
    expect(TAILLE_PAGE_ECHEANCES_A_VENIR).toBe(3);
    expect(taillePageOccurrences("A_VENIR")).toBe(3);
    expect(taillePageOccurrences("PASSEES")).toBe(25);
  });
});
