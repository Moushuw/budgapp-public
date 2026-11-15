import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { codeDepuisErreurPrisma } from "./erreurs-prisma";

function erreurPrisma(code: string) {
  return new Prisma.PrismaClientKnownRequestError("erreur de test", { code, clientVersion: "6.19.3" });
}

describe("codeDepuisErreurPrisma", () => {
  it("traduit P2002 en DUPLICATE", () => {
    expect(codeDepuisErreurPrisma(erreurPrisma("P2002"))).toBe("DUPLICATE");
  });

  it("traduit P2025 en NOT_FOUND", () => {
    expect(codeDepuisErreurPrisma(erreurPrisma("P2025"))).toBe("NOT_FOUND");
  });

  it("traduit P2003 en CONFLICT", () => {
    expect(codeDepuisErreurPrisma(erreurPrisma("P2003"))).toBe("CONFLICT");
  });

  it("traduit P2028 (délai de transaction dépassé) en UNKNOWN", () => {
    expect(codeDepuisErreurPrisma(erreurPrisma("P2028"))).toBe("UNKNOWN");
  });

  it("retourne null pour une erreur Prisma connue mais non répertoriée (base injoignable)", () => {
    expect(codeDepuisErreurPrisma(erreurPrisma("P1001"))).toBeNull();
  });

  it("retourne null pour une erreur ordinaire", () => {
    expect(codeDepuisErreurPrisma(new Error("boum"))).toBeNull();
  });

  it("retourne null pour null, undefined ou une chaîne nue", () => {
    expect(codeDepuisErreurPrisma(null)).toBeNull();
    expect(codeDepuisErreurPrisma(undefined)).toBeNull();
    expect(codeDepuisErreurPrisma("P2002")).toBeNull();
  });
});
