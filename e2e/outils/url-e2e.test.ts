import { describe, expect, it } from "vitest";
import { ErreurUrlE2e, verifierUrlE2e } from "./url-e2e";

const HOTE = "postgresql://user:pass@hote:5432/budgapp_dev";

function messageDe(entree: string | undefined): string {
  try {
    verifierUrlE2e(entree);
  } catch (erreur) {
    expect(erreur).toBeInstanceOf(ErreurUrlE2e);
    return erreur instanceof Error ? erreur.message : "";
  }
  throw new Error("Aucun refus levé.");
}

describe("verifierUrlE2e", () => {
  it("U1 rend l'entrée telle quelle sur le schéma e2e", () => {
    const url = `${HOTE}?schema=e2e`;
    expect(verifierUrlE2e(url)).toBe(url);
  });

  it("U2 refuse l'absence et renvoie à npm run e2e", () => {
    expect(messageDe(undefined)).toContain("npm run e2e");
    expect(messageDe("")).toContain("npm run e2e");
  });

  it("U3 refuse un schéma autre, absent ou multiple", () => {
    for (const requete of ["schema=test", "schema=public", "", "schema=e2e&schema=public"]) {
      const url = requete === "" ? HOTE : `${HOTE}?${requete}`;
      expect(() => verifierUrlE2e(url)).toThrow(ErreurUrlE2e);
    }
  });

  it("U4 refuse budgapp_prod", () => {
    expect(() => verifierUrlE2e("postgresql://u:pass@h/budgapp_prod?schema=e2e")).toThrow(ErreurUrlE2e);
  });

  it("U5 refuse un autre protocole, une URL illisible et un fragment", () => {
    expect(() => verifierUrlE2e("mysql://user:pass@hote/budgapp_dev?schema=e2e")).toThrow(ErreurUrlE2e);
    expect(() => verifierUrlE2e("pas une url")).toThrow(ErreurUrlE2e);
    expect(() => verifierUrlE2e(`${HOTE}?schema=e2e#frag`)).toThrow(ErreurUrlE2e);
  });

  it("U6 aucun message n'expose mot de passe, hôte ni utilisateur", () => {
    const entrees = [
      undefined,
      "",
      `${HOTE}?schema=test`,
      "postgresql://user:pass@hote:5432/budgapp_prod?schema=e2e",
      "mysql://user:pass@hote/budgapp_dev?schema=e2e",
      "pas une url",
      `${HOTE}?schema=e2e#frag`,
    ];
    for (const entree of entrees) {
      const message = messageDe(entree);
      expect(message).not.toContain("pass");
      expect(message).not.toContain("hote");
      expect(message).not.toContain("user");
    }
  });
});
