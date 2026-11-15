import { describe, expect, it } from "vitest";
import { ping } from "./ping";

describe("ping", () => {
  it("renvoie l'écho du message envoyé", async () => {
    const resultat = await ping({ message: "bonjour" });
    expect(resultat.ok).toBe(true);
    if (resultat.ok) {
      expect(resultat.data.echo).toBe("bonjour");
    }
  });

  it("rejette un message vide", async () => {
    const resultat = await ping({ message: "" });
    expect(resultat.ok).toBe(false);
    if (!resultat.ok) {
      expect(resultat.code).toBe("VALIDATION");
    }
  });
});
