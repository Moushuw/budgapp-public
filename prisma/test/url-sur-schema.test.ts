import { describe, expect, it } from "vitest";
import {
  deriverUrlBaseDeTest,
  deriverUrlSurSchema,
  ErreurUrlBaseDeTest,
  estUrlSurSchema,
  type SchemaIsole,
} from "./url-base-de-test.mts";

const HOTE = "postgresql://user:pass@hote:5432/budgapp_dev";

function messageDe(fn: () => unknown): string {
  try {
    fn();
  } catch (erreur) {
    return erreur instanceof Error ? erreur.message : "";
  }
  throw new Error("Aucun refus levé.");
}

describe("deriverUrlSurSchema", () => {
  it("S1 ajoute schema=e2e", () => {
    expect(deriverUrlSurSchema(HOTE, "e2e")).toBe(`${HOTE}?schema=e2e`);
  });

  it("S2 remplace schema=public et schema=test", () => {
    expect(deriverUrlSurSchema(`${HOTE}?schema=public`, "e2e")).toBe(`${HOTE}?schema=e2e`);
    expect(deriverUrlSurSchema(`${HOTE}?schema=test`, "e2e")).toBe(`${HOTE}?schema=e2e`);
  });

  it("S3 conserve les autres paramètres à l'octet près et dans leur ordre", () => {
    expect(deriverUrlSurSchema(`${HOTE}?a=1&schema=x&b=%20z`, "e2e")).toBe(`${HOTE}?a=1&b=%20z&schema=e2e`);
  });

  it("S3 sur l'entrée de D3 des tests existants", () => {
    const source = `${HOTE}?sslmode=require&schema=public&connection_limit=5&options=-c%20statement_timeout%3D0`;
    expect(deriverUrlSurSchema(source, "e2e")).toBe(
      `${HOTE}?sslmode=require&connection_limit=5&options=-c%20statement_timeout%3D0&schema=e2e`,
    );
  });

  it("S4 est idempotente", () => {
    const une = deriverUrlSurSchema(HOTE, "e2e");
    expect(deriverUrlSurSchema(une, "e2e")).toBe(une);
  });

  it("S5 refuse budgapp_prod en e2e sans exposer le mot de passe", () => {
    const message = messageDe(() => deriverUrlSurSchema("postgresql://user:pass@hote:5432/budgapp_prod", "e2e"));
    expect(message).toContain("production");
    expect(message).not.toContain("pass");
  });

  it("S6 refuse un schéma hors liste, même avec une URL absente", () => {
    expect(() => deriverUrlSurSchema(undefined, "public" as SchemaIsole)).toThrow(ErreurUrlBaseDeTest);
    expect(messageDe(() => deriverUrlSurSchema(undefined, "public" as SchemaIsole))).toBe("Schéma isolé inconnu.");
  });

  it("S7 coïncide avec deriverUrlBaseDeTest pour le schéma test", () => {
    for (const x of [HOTE, `${HOTE}?schema=public`, `${HOTE}?a=1&schema=x`]) {
      expect(deriverUrlSurSchema(x, "test")).toBe(deriverUrlBaseDeTest(x));
    }
  });

  it("S9 aucun message n'expose utilisateur, mot de passe ni hôte", () => {
    const entrees = [
      undefined,
      "",
      "pas une url",
      "mysql://user:pass@hote:5432/budgapp_dev",
      "postgresql://user:pass@hote:5432/budgapp_prod",
      "postgresql://user:pass@hote:5432/budgapp_dev#frag",
    ];
    for (const entree of entrees) {
      const message = messageDe(() => deriverUrlSurSchema(entree, "e2e"));
      expect(message).not.toContain("pass");
      expect(message).not.toContain("user");
      expect(message).not.toContain("hote");
    }
  });
});

describe("estUrlSurSchema", () => {
  it("S8 reconnaît exactement le schéma demandé", () => {
    expect(estUrlSurSchema(`${HOTE}?schema=e2e`, "e2e")).toBe(true);
    expect(estUrlSurSchema(`${HOTE}?schema=test`, "e2e")).toBe(false);
    expect(estUrlSurSchema(`${HOTE}?schema=e2e`, "test")).toBe(false);
    expect(estUrlSurSchema(`${HOTE}?schema=e2e&schema=e2e`, "e2e")).toBe(false);
    expect(estUrlSurSchema(`${HOTE}?schema=E2E`, "e2e")).toBe(false);
    expect(estUrlSurSchema("pas une url", "e2e")).toBe(false);
  });
});
