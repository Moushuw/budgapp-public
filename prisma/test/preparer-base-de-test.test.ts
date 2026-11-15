// Gardes fermés par défaut du globalSetup : tests purs, sans base.

import { describe, expect, it } from "vitest";
import { migrationAnnonceSchemaTest, verifierEmplacementExtensions } from "./preparer-base-de-test";

const NOMINAL = [
  { extension: "pg_trgm", schema: "public" },
  { extension: "unaccent", schema: "public" },
];

describe("verifierEmplacementExtensions", () => {
  it("accepte les deux extensions dans public", () => {
    expect(() => {
      verifierEmplacementExtensions(NOMINAL);
    }).not.toThrow();
  });

  it("refuse une extension absente", () => {
    expect(() => {
      verifierEmplacementExtensions([{ extension: "pg_trgm", schema: "public" }]);
    }).toThrow(/unaccent n'est pas installée/);
    expect(() => {
      verifierEmplacementExtensions([]);
    }).toThrow(/pg_trgm n'est pas installée/);
  });

  it("refuse une extension installée dans le schéma test", () => {
    expect(() => {
      verifierEmplacementExtensions([
        { extension: "pg_trgm", schema: "test" },
        { extension: "unaccent", schema: "public" },
      ]);
    }).toThrow(/pg_trgm est installée dans le schéma test/);
  });
});

describe("migrationAnnonceSchemaTest", () => {
  it("reconnaît la sortie qui nomme le schéma test", () => {
    const sortie = 'Datasource "db": PostgreSQL database "budgapp_dev", schema "test" at "hote:5432"';
    expect(migrationAnnonceSchemaTest(sortie)).toBe(true);
  });

  it("refuse le schéma public", () => {
    expect(migrationAnnonceSchemaTest('PostgreSQL database "budgapp_dev", schema "public" at "h:5432"')).toBe(false);
  });

  it("refuse un schéma voisin test_x", () => {
    expect(migrationAnnonceSchemaTest('PostgreSQL database "budgapp_dev", schema "test_x" at "h:5432"')).toBe(false);
  });

  it("refuse une sortie vide", () => {
    expect(migrationAnnonceSchemaTest("")).toBe(false);
  });
});
