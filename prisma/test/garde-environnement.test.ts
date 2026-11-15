// Le garde de worker (setupFiles) refuse toute DATABASE_URL qui ne vise pas le schéma test.
// Pur : aucune connexion.

import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("garde-environnement", () => {
  it("laisse passer une URL de test", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://u:p@h/budgapp_dev?schema=test");
    vi.resetModules();
    await expect(import("./garde-environnement")).resolves.toBeDefined();
  });

  it.each([
    "postgresql://u:motsecret@h/budgapp_dev",
    "postgresql://u:motsecret@h/budgapp_dev?schema=public",
    "postgresql://u:motsecret@h/budgapp_dev?schema=test&schema=public",
    "",
  ])("refuse %j sans afficher l'URL", async (url) => {
    vi.stubEnv("DATABASE_URL", url);
    vi.resetModules();
    const erreur = await import("./garde-environnement").then(
      () => undefined,
      (e: unknown) => e,
    );
    expect(erreur).toBeInstanceOf(Error);
    const message = erreur instanceof Error ? erreur.message : "";
    expect(message).toContain("Garde-fou");
    expect(message).not.toContain("motsecret");
  });
});
