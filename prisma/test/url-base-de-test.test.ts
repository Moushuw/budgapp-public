import { describe, expect, it } from "vitest";
import { deriverUrlBaseDeTest, ErreurUrlBaseDeTest, estUrlBaseDeTest } from "./url-base-de-test.mts";

const HOTE = "postgresql://user:pass@hote:5432/budgapp_dev";

describe("deriverUrlBaseDeTest", () => {
  it("D1 ajoute schema=test à une URL sans requête", () => {
    expect(deriverUrlBaseDeTest(HOTE)).toBe(`${HOTE}?schema=test`);
  });

  it("D2 remplace schema=public", () => {
    expect(deriverUrlBaseDeTest(`${HOTE}?schema=public`)).toBe(`${HOTE}?schema=test`);
  });

  it("D3 conserve les autres paramètres à l'octet près et dans leur ordre", () => {
    const source = `${HOTE}?sslmode=require&schema=public&connection_limit=5&options=-c%20statement_timeout%3D0`;
    expect(deriverUrlBaseDeTest(source)).toBe(
      `${HOTE}?sslmode=require&connection_limit=5&options=-c%20statement_timeout%3D0&schema=test`,
    );
  });

  it("D4 retire toutes les occurrences de schema=", () => {
    expect(deriverUrlBaseDeTest(`${HOTE}?schema=a&x=1&schema=b`)).toBe(`${HOTE}?x=1&schema=test`);
  });

  it("D5 est idempotente", () => {
    const une = deriverUrlBaseDeTest(HOTE);
    expect(deriverUrlBaseDeTest(une)).toBe(une);
    expect(deriverUrlBaseDeTest(`${HOTE}?schema=test`)).toBe(`${HOTE}?schema=test`);
  });

  it("D6 préserve les identifiants encodés", () => {
    const source = "postgresql://user:p%40ss%3Aw@hote/budgapp_dev";
    expect(deriverUrlBaseDeTest(`${source}?schema=public`).startsWith(`${source}?`)).toBe(true);
    expect(deriverUrlBaseDeTest(source).split("?")[0]).toBe(source);
  });

  it("D7 retire une clé encodée dont la clé décodée est schema", () => {
    expect(deriverUrlBaseDeTest(`${HOTE}?sch%65ma=public`)).toBe(`${HOTE}?schema=test`);
  });

  it("D8 conserve les clés voisines", () => {
    expect(deriverUrlBaseDeTest(`${HOTE}?myschema=x&Schema=y`)).toBe(
      `${HOTE}?myschema=x&Schema=y&schema=test`,
    );
  });

  it("D9 écarte la requête vide et les morceaux vides", () => {
    expect(deriverUrlBaseDeTest(`${HOTE}?`)).toBe(`${HOTE}?schema=test`);
    expect(deriverUrlBaseDeTest(`${HOTE}?&&a=1&`)).toBe(`${HOTE}?a=1&schema=test`);
  });

  it("D10 accepte postgres://", () => {
    const source = "postgres://user:pass@hote/budgapp_dev";
    expect(deriverUrlBaseDeTest(source)).toBe(`${source}?schema=test`);
  });

  it.each([undefined, "", "   "])("E-abs refuse %j", (entree) => {
    expect(() => deriverUrlBaseDeTest(entree)).toThrow(ErreurUrlBaseDeTest);
    try {
      deriverUrlBaseDeTest(entree);
    } catch (e) {
      const message = e instanceof Error ? e.message : "";
      expect(message).toContain("DATABASE_URL");
      expect(message).toContain("absente");
    }
  });

  it("E-illisible refuse sans recopier l'entrée", () => {
    expect(() => deriverUrlBaseDeTest("pas une url")).toThrow(ErreurUrlBaseDeTest);
    expect(() => deriverUrlBaseDeTest("pas une url")).not.toThrow(/pas une url/);
  });

  it("E-protocole refuse un autre protocole sans fuite du secret", () => {
    expect(() => deriverUrlBaseDeTest("mysql://user:secret@hote/db")).toThrow(ErreurUrlBaseDeTest);
    expect(() => deriverUrlBaseDeTest("mysql://user:secret@hote/db")).not.toThrow(/secret/);
    expect(() => deriverUrlBaseDeTest("file:./dev.db")).toThrow(ErreurUrlBaseDeTest);
  });

  it("E-fragment refuse un fragment", () => {
    expect(() => deriverUrlBaseDeTest(`${HOTE}#x`)).toThrow(ErreurUrlBaseDeTest);
  });

  it("E-prod refuse la base de production", () => {
    expect(() => deriverUrlBaseDeTest("postgresql://user:pass@hote/budgapp_prod")).toThrow(
      ErreurUrlBaseDeTest,
    );
  });

  it("E-secret : aucun message d'erreur ne contient le mot de passe", () => {
    const entrees = [
      "mysql://user:secret@hote/db",
      "postgresql://user:pass@hote/budgapp_prod",
      `${HOTE}#x`,
    ];
    for (const entree of entrees) {
      let message = "";
      try {
        deriverUrlBaseDeTest(entree);
      } catch (e) {
        message = e instanceof Error ? e.message : "";
      }
      expect(message).not.toBe("");
      expect(message).not.toContain("pass");
      expect(message).not.toContain("secret");
    }
  });
});

describe("estUrlBaseDeTest", () => {
  it("V1 vrai pour schema=test", () => {
    expect(estUrlBaseDeTest(`${HOTE}?schema=test`)).toBe(true);
  });
  it("V2 faux sans schema", () => {
    expect(estUrlBaseDeTest(HOTE)).toBe(false);
  });
  it("V3 faux pour schema=public", () => {
    expect(estUrlBaseDeTest(`${HOTE}?schema=public`)).toBe(false);
  });
  it("V4 faux si schema apparaît deux fois", () => {
    expect(estUrlBaseDeTest(`${HOTE}?schema=test&schema=public`)).toBe(false);
  });
  it("V5 sensible à la casse", () => {
    expect(estUrlBaseDeTest(`${HOTE}?schema=TEST`)).toBe(false);
  });
  it("V6 ne lève jamais", () => {
    expect(estUrlBaseDeTest("pas une url")).toBe(false);
    expect(estUrlBaseDeTest("")).toBe(false);
  });
});
