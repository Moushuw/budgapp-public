// docs/lot-m1.md §9.

import { describe, expect, it } from "vitest";
import {
  LIBELLES_CHAMP_CONDITION,
  LIBELLES_OPERATEUR_CONDITION,
  LIBELLES_SENS_CONDITION,
  LIBELLES_TYPE_ACTION,
  OPERATEURS_OFFERTS_PAR_CHAMP,
  OPERATEURS_PAR_CHAMP,
  operateurCompatible,
  operateurParDefaut,
} from "./champs";
import { CHAMPS_CONDITION, TYPES_ACTION } from "./types";

describe("champs — matrice champ × opérateur", () => {
  it("C1 — chaque ChampCondition a au moins un opérateur évalué", () => {
    for (const champ of CHAMPS_CONDITION) {
      expect(OPERATEURS_PAR_CHAMP[champ].length).toBeGreaterThan(0);
    }
  });

  it("C2 — OPERATEURS_OFFERTS_PAR_CHAMP est un sous-ensemble d'OPERATEURS_PAR_CHAMP", () => {
    for (const champ of CHAMPS_CONDITION) {
      for (const operateur of OPERATEURS_OFFERTS_PAR_CHAMP[champ]) {
        expect(OPERATEURS_PAR_CHAMP[champ]).toContain(operateur);
      }
    }
  });

  it("C3 — DESCRIPTION et SUP sont incompatibles", () => {
    expect(operateurCompatible("DESCRIPTION", "SUP")).toBe(false);
  });

  it("C4 — MONTANT et CONTIENT sont incompatibles", () => {
    expect(operateurCompatible("MONTANT", "CONTIENT")).toBe(false);
  });

  it("C6 — operateurParDefaut rend toujours un opérateur offert pour ce champ", () => {
    for (const champ of CHAMPS_CONDITION) {
      expect(OPERATEURS_OFFERTS_PAR_CHAMP[champ]).toContain(operateurParDefaut(champ));
    }
  });

  it("C8 — MOT_ENTIER est offert pour les trois champs texte et aucun autre", () => {
    for (const champ of ["DESCRIPTION", "DESCRIPTION_NORMALISEE", "BENEFICIAIRE"] as const) {
      expect(OPERATEURS_OFFERTS_PAR_CHAMP[champ]).toContain("MOT_ENTIER");
    }
    for (const champ of ["MONTANT", "COMPTE", "SENS"] as const) {
      expect(OPERATEURS_OFFERTS_PAR_CHAMP[champ]).not.toContain("MOT_ENTIER");
      expect(operateurCompatible(champ, "MOT_ENTIER")).toBe(false);
    }
  });

  it("C9 — l'opérateur par défaut des champs texte reste CONTIENT", () => {
    for (const champ of ["DESCRIPTION", "DESCRIPTION_NORMALISEE", "BENEFICIAIRE"] as const) {
      expect(operateurParDefaut(champ)).toBe("CONTIENT");
    }
  });

  it("C7 — chaque enum a un libellé fr-CA non vide", () => {
    for (const champ of CHAMPS_CONDITION) {
      expect(LIBELLES_CHAMP_CONDITION[champ].trim()).not.toBe("");
    }
    for (const type of TYPES_ACTION) {
      expect(LIBELLES_TYPE_ACTION[type].trim()).not.toBe("");
    }
    expect(LIBELLES_SENS_CONDITION.ENTREE.trim()).not.toBe("");
    expect(LIBELLES_SENS_CONDITION.SORTIE.trim()).not.toBe("");
    for (const operateur of Object.keys(LIBELLES_OPERATEUR_CONDITION) as (keyof typeof LIBELLES_OPERATEUR_CONDITION)[]) {
      expect(LIBELLES_OPERATEUR_CONDITION[operateur].trim()).not.toBe("");
    }
  });
});
