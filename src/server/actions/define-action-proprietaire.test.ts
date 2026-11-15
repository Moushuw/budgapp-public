import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

const espionOwnerIdCourant = vi.fn<() => Promise<string | null>>();

vi.mock("@/server/owner", () => ({
  ownerIdCourant: () => espionOwnerIdCourant(),
}));

const { defineActionProprietaire } = await import("./define-action-proprietaire");

const schema = z.object({ nom: z.string().min(1) });

describe("defineActionProprietaire", () => {
  it("résout l'ownerId et le passe au handler quand un utilisateur existe", async () => {
    espionOwnerIdCourant.mockResolvedValueOnce("owner-1");
    const handler = vi.fn((entree: { nom: string }, ownerId: string) =>
      Promise.resolve({ ok: true, data: `${entree.nom}-${ownerId}` } as const),
    );
    const action = defineActionProprietaire(schema, handler);

    const resultat = await action({ nom: "budgapp" });

    expect(handler).toHaveBeenCalledWith({ nom: "budgapp" }, "owner-1");
    expect(resultat).toEqual({ ok: true, data: "budgapp-owner-1" });
  });

  it("retourne FORBIDDEN sans appeler le handler quand la base ne porte aucun utilisateur", async () => {
    espionOwnerIdCourant.mockResolvedValueOnce(null);
    const handler = vi.fn(() => Promise.resolve({ ok: true, data: "jamais atteint" } as const));
    const action = defineActionProprietaire(schema, handler);

    const resultat = await action({ nom: "budgapp" });

    expect(handler).not.toHaveBeenCalled();
    expect(resultat).toEqual({
      ok: false,
      code: "FORBIDDEN",
      message: "Aucun utilisateur n'est configuré. Lance `npm run seed`.",
    });
  });

  it("retourne VALIDATION avant même de résoudre l'ownerId sur une entrée invalide", async () => {
    const handler = vi.fn(() => Promise.resolve({ ok: true, data: "jamais atteint" } as const));
    const action = defineActionProprietaire(schema, handler);

    const resultat = await action({ nom: "" });

    expect(espionOwnerIdCourant).not.toHaveBeenCalled();
    expect(handler).not.toHaveBeenCalled();
    expect(resultat.ok).toBe(false);
    if (!resultat.ok) {
      expect(resultat.code).toBe("VALIDATION");
    }
  });

  it("P1 — le message du schéma atteint le résultat, sans résoudre l'ownerId ni appeler le handler", async () => {
    const handler = vi.fn(() => Promise.resolve({ ok: true, data: "jamais atteint" } as const));
    const action = defineActionProprietaire(z.object({ nom: z.string().min(1, "Le nom est obligatoire.") }), handler);

    const resultat = await action({ nom: "" });

    expect(espionOwnerIdCourant).not.toHaveBeenCalled();
    expect(handler).not.toHaveBeenCalled();
    expect(resultat).toMatchObject({ ok: false, code: "VALIDATION", message: "Le nom est obligatoire." });
  });
});
