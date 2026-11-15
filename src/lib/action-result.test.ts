import { describe, expect, it } from "vitest";
import { deballer, deballerAvecCode, ErreurAction, MESSAGE_DE_REPLI } from "./action-result";

describe("deballer", () => {
  it("retourne les données sur un succès", () => {
    expect(deballer({ ok: true, data: 42 })).toBe(42);
  });

  it("lève une Error avec le message fourni sur un échec", () => {
    expect(() => deballer({ ok: false, code: "DUPLICATE", message: "Doublon." })).toThrow("Doublon.");
  });

  it("lève quand même avec un message de repli non vide si le message est vide", () => {
    expect(() => deballer({ ok: false, code: "UNKNOWN", message: "" })).toThrow(/.+/);
  });
});

describe("deballerAvecCode", () => {
  it("AR1 — retourne les données sur un succès", () => {
    expect(deballerAvecCode({ ok: true, data: 42 })).toBe(42);
  });

  it("AR2 — un échec lève une ErreurAction qui garde code et message", () => {
    let levee: unknown;
    try {
      deballerAvecCode({ ok: false, code: "VALIDATION", message: "X." });
    } catch (e) {
      levee = e;
    }
    expect(levee).toBeInstanceOf(ErreurAction);
    expect(levee).toBeInstanceOf(Error);
    expect((levee as ErreurAction).code).toBe("VALIDATION");
    expect((levee as ErreurAction).message).toBe("X.");
  });

  it("AR3 — message vide : message de repli, code conservé", () => {
    let levee: unknown;
    try {
      deballerAvecCode({ ok: false, code: "CONFLICT", message: "" });
    } catch (e) {
      levee = e;
    }
    expect(levee).toBeInstanceOf(ErreurAction);
    expect((levee as ErreurAction).message).toBe(MESSAGE_DE_REPLI);
    expect((levee as ErreurAction).code).toBe("CONFLICT");
  });
});
