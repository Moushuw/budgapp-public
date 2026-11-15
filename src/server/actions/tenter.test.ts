import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { tenter } from "./tenter";

function erreurPrisma(code: string) {
  return new Prisma.PrismaClientKnownRequestError("erreur de test", { code, clientVersion: "6.19.3" });
}

describe("tenter", () => {
  it("retourne ok avec les données inchangées quand l'opération réussit", async () => {
    const resultat = await tenter(() => Promise.resolve({ valeur: 42 }), {});
    expect(resultat).toEqual({ ok: true, data: { valeur: 42 } });
  });

  it("traduit P2002 avec le message fourni pour DUPLICATE", async () => {
    const resultat = await tenter(
      () => Promise.reject(erreurPrisma("P2002")),
      { DUPLICATE: "Un doublon précis." },
    );
    expect(resultat).toEqual({ ok: false, code: "DUPLICATE", message: "Un doublon précis." });
  });

  it("traduit P2002 avec un message par défaut non vide, en français, sans message fourni", async () => {
    const resultat = await tenter(() => Promise.reject(erreurPrisma("P2002")), {});
    expect(resultat.ok).toBe(false);
    if (!resultat.ok) {
      expect(resultat.code).toBe("DUPLICATE");
      expect(resultat.message.length).toBeGreaterThan(0);
    }
  });

  it("traduit P2025 en NOT_FOUND", async () => {
    const resultat = await tenter(() => Promise.reject(erreurPrisma("P2025")), {});
    expect(resultat.ok).toBe(false);
    if (!resultat.ok) {
      expect(resultat.code).toBe("NOT_FOUND");
    }
  });

  it("relance une erreur non-Prisma sans l'avaler", async () => {
    await expect(tenter(() => Promise.reject(new Error("panne")), {})).rejects.toThrow("panne");
  });
});
