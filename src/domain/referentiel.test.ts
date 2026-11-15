import { describe, expect, it } from "vitest";
import {
  LIBELLES_MODE_BUDGET,
  LIBELLES_MODE_CORRESPONDANCE,
  LIBELLES_MODE_REPORT,
  LIBELLES_REGIME_FISCAL,
  LIBELLES_TYPE_COMPTE,
  MODES_BUDGET,
  MODES_CORRESPONDANCE,
  MODES_REPORT,
  REGIMES_FISCAUX,
  TYPES_COMPTE,
} from "./referentiel";

// `tsc` garantit déjà que chaque Record couvre exactement les clés de son
// union (CLAUDE.md §12 — Record<TypeCompte, string> ne compile pas s'il en
// manque une). Ce que `tsc` ne voit pas, c'est une dérive de *contenu* : un
// libellé vide, dupliqué, ou qui ne correspond plus au texte attendu par la
// spec (§4.2). C'est ce que ces tests attrapent.

describe("TYPES_COMPTE et LIBELLES_TYPE_COMPTE", () => {
  it("porte un libellé non vide pour chaque type, dans le même ordre que l'énumération", () => {
    expect(Object.keys(LIBELLES_TYPE_COMPTE)).toEqual([...TYPES_COMPTE]);
    for (const type of TYPES_COMPTE) {
      expect(LIBELLES_TYPE_COMPTE[type].length).toBeGreaterThan(0);
    }
  });

  it("correspond mot pour mot aux libellés de la spec", () => {
    expect(LIBELLES_TYPE_COMPTE).toEqual({
      CHEQUE: "Compte chèque",
      EPARGNE: "Épargne",
      CREDIT: "Carte de crédit",
      MARGE: "Marge de crédit",
      PRET: "Prêt",
      PLACEMENT: "Placement",
      ACTIF: "Actif",
      PASSIF: "Passif",
      AUTRE: "Autre",
    });
  });
});

describe("REGIMES_FISCAUX et LIBELLES_REGIME_FISCAL", () => {
  it("porte un libellé non vide pour chaque régime", () => {
    expect(Object.keys(LIBELLES_REGIME_FISCAL)).toEqual([...REGIMES_FISCAUX]);
  });

  it("correspond mot pour mot aux libellés de la spec", () => {
    expect(LIBELLES_REGIME_FISCAL).toEqual({
      NON_ENREGISTRE: "Non enregistré",
      REER: "REER",
      CELI: "CELI",
      CELIAPP: "CELIAPP",
      REEE: "REEE",
      CRI: "CRI",
      FERR: "FERR",
    });
  });
});

describe("MODES_BUDGET et LIBELLES_MODE_BUDGET", () => {
  it("correspond mot pour mot aux libellés de la spec", () => {
    expect(Object.keys(LIBELLES_MODE_BUDGET)).toEqual([...MODES_BUDGET]);
    expect(LIBELLES_MODE_BUDGET).toEqual({
      PAR_SOUS_CATEGORIE: "Par sous-catégorie",
      PAR_CATEGORIE: "Par catégorie",
    });
  });
});

describe("MODES_REPORT et LIBELLES_MODE_REPORT", () => {
  it("correspond mot pour mot aux libellés de la spec", () => {
    expect(Object.keys(LIBELLES_MODE_REPORT)).toEqual([...MODES_REPORT]);
    expect(LIBELLES_MODE_REPORT).toEqual({
      AUCUN: "Aucun report",
      SIGNE: "Report signé",
      POSITIF_SEULEMENT: "Report positif seulement",
    });
  });
});

describe("MODES_CORRESPONDANCE et LIBELLES_MODE_CORRESPONDANCE", () => {
  it("correspond mot pour mot aux libellés de la spec", () => {
    expect(Object.keys(LIBELLES_MODE_CORRESPONDANCE)).toEqual([...MODES_CORRESPONDANCE]);
    expect(LIBELLES_MODE_CORRESPONDANCE).toEqual({
      CONTIENT: "Contient",
      MOT_ENTIER: "Mot entier",
      REGEX: "Expression régulière",
      EXACT: "Exact",
    });
  });
});

describe("unicité des valeurs d'énumération", () => {
  it.each([
    ["TYPES_COMPTE", TYPES_COMPTE],
    ["REGIMES_FISCAUX", REGIMES_FISCAUX],
    ["MODES_BUDGET", MODES_BUDGET],
    ["MODES_REPORT", MODES_REPORT],
    ["MODES_CORRESPONDANCE", MODES_CORRESPONDANCE],
  ] as const)("%s ne contient aucun doublon", (_nom, valeurs) => {
    expect(new Set(valeurs).size).toBe(valeurs.length);
  });
});
