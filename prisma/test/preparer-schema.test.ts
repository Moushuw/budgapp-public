import { describe, expect, it } from "vitest";
import {
  masquerHote,
  migrationAnnonceSchema,
  migrationAnnonceSchemaTest,
  verifierEmplacementExtensions,
} from "./preparer-schema.mts";

describe("migrationAnnonceSchema", () => {
  it("P1 reconnaît le schéma e2e annoncé", () => {
    expect(migrationAnnonceSchema('… schema "e2e" at "h:5432"', "e2e")).toBe(true);
  });

  it("P2 refuse un autre schéma, un schéma voisin et une sortie vide", () => {
    expect(migrationAnnonceSchema('schema "test" at "h:5432"', "e2e")).toBe(false);
    expect(migrationAnnonceSchema('schema "e2e_x" at "h:5432"', "e2e")).toBe(false);
    expect(migrationAnnonceSchema("", "e2e")).toBe(false);
  });

  it("P3 migrationAnnonceSchemaTest garde son comportement", () => {
    expect(migrationAnnonceSchemaTest('database "budgapp_dev", schema "test" at "hote:5432"')).toBe(true);
    expect(migrationAnnonceSchemaTest('schema "public" at "h:5432"')).toBe(false);
  });
});

describe("masquerHote", () => {
  const sortieM1 = 'Datasource "db": PostgreSQL database "budgapp_dev", schema "test" at "192.0.2.5:5432"';

  it("M1 masque l'hôte de l'annonce de la datasource, guillemets conservés", () => {
    expect(masquerHote(sortieM1)).toBe(
      'Datasource "db": PostgreSQL database "budgapp_dev", schema "test" at "[hôte masqué]"',
    );
  });

  it("M2 masque l'hôte de l'erreur P1001, accents graves conservés", () => {
    expect(masquerHote("Can't reach database server at `db.local:5432`")).toBe(
      "Can't reach database server at `[hôte masqué]`",
    );
  });

  it("M3 masque deux occurrences dans une sortie multiligne", () => {
    const sortie = `${sortieM1}\nCan't reach database server at \`192.0.2.5:5432\`\nfin`;
    const masquee = masquerHote(sortie);
    expect(masquee).not.toContain("192.0.2.5");
    expect(masquee.match(/\[hôte masqué\]/g)).toHaveLength(2);
  });

  it("M4 rend à l'identique une sortie sans fragment, ou vide", () => {
    expect(masquerHote("")).toBe("");
    expect(masquerHote("Applying migration `20260101_init`\nAll migrations applied")).toBe(
      "Applying migration `20260101_init`\nAll migrations applied",
    );
  });

  it("M5 ne touche pas à schema \"test\" : migrationAnnonceSchema reste vrai", () => {
    expect(migrationAnnonceSchema(masquerHote(sortieM1), "test")).toBe(true);
  });
});

describe("verifierEmplacementExtensions avec schéma e2e", () => {
  it("P4 lève avec le nom du schéma e2e quand une extension manque", () => {
    expect(() => {
      verifierEmplacementExtensions([{ extension: "unaccent", schema: "public" }], "e2e");
    }).toThrow(/schéma e2e/);
  });

  it("P4 lève quand pg_trgm est installée dans e2e", () => {
    expect(() => {
      verifierEmplacementExtensions(
        [
          { extension: "pg_trgm", schema: "e2e" },
          { extension: "unaccent", schema: "public" },
        ],
        "e2e",
      );
    }).toThrow(/pg_trgm est installée dans le schéma e2e/);
  });

  it("P5 accepte les lignes nominales", () => {
    expect(() => {
      verifierEmplacementExtensions(
        [
          { extension: "pg_trgm", schema: "public" },
          { extension: "unaccent", schema: "public" },
        ],
        "e2e",
      );
    }).not.toThrow();
  });
});
