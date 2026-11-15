import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  defineAction,
  MESSAGE_VALIDATION_GENERIQUE,
  messageValidation,
  type DetailsValidation,
} from "./define-action";

const schema = z.object({ nom: z.string().min(1) });

describe("defineAction", () => {
  it("retourne ok avec les données validées", async () => {
    const action = defineAction(schema, ({ nom }) => Promise.resolve({ ok: true, data: nom.toUpperCase() }));
    const resultat = await action({ nom: "budgapp" });
    expect(resultat).toEqual({ ok: true, data: "BUDGAPP" });
  });

  it("retourne VALIDATION sur une entrée qui ne respecte pas le schéma", async () => {
    const action = defineAction(schema, ({ nom }) => Promise.resolve({ ok: true, data: nom }));
    const resultat = await action({ nom: "" });
    expect(resultat.ok).toBe(false);
    if (!resultat.ok) {
      expect(resultat.code).toBe("VALIDATION");
    }
  });

  it("ne lève jamais : une exception inattendue devient UNKNOWN", async () => {
    const espionConsole = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const action = defineAction(schema, (): Promise<never> => {
      throw new Error("panne inattendue");
    });

    const resultat = await action({ nom: "budgapp" });
    expect(resultat.ok).toBe(false);
    if (!resultat.ok) {
      expect(resultat.code).toBe("UNKNOWN");
    }
    expect(espionConsole).toHaveBeenCalledOnce();
    espionConsole.mockRestore();
  });

  it("retourne le code métier renvoyé par le handler sans le transformer", async () => {
    const action = defineAction(schema, () =>
      Promise.resolve({ ok: false, code: "NOT_FOUND", message: "introuvable" } as const),
    );
    const resultat = await action({ nom: "budgapp" });
    expect(resultat).toEqual({ ok: false, code: "NOT_FOUND", message: "introuvable" });
  });
});

describe("defineAction — message de validation (docs/lot-m2.md §10.1.1)", () => {
  const jamais = () => Promise.resolve({ ok: true, data: null } as const);

  it("D1 — le message du schéma passe tel quel, details par champ", async () => {
    const action = defineAction(z.object({ nom: z.string().min(1, "Le nom est obligatoire.") }), jamais);
    const resultat = await action({ nom: "" });
    expect(resultat).toMatchObject({ ok: false, code: "VALIDATION", message: "Le nom est obligatoire." });
    if (!resultat.ok) {
      const details = resultat.details as DetailsValidation;
      expect(details.champs.nom).toEqual(["Le nom est obligatoire."]);
      expect(details.general).toEqual([]);
    }
  });

  it("D2 — un message par défaut de zod devient le générique qui nomme le champ", async () => {
    const action = defineAction(z.object({ id: z.string().cuid() }), jamais);
    const resultat = await action({ id: "x" });
    expect(resultat.ok).toBe(false);
    if (!resultat.ok) {
      expect(resultat.message).toBe(messageValidation("id"));
      expect(resultat.message).toContain("« id »");
      expect(resultat.message).not.toContain("Invalid");
      expect((resultat.details as DetailsValidation).champs.id).toEqual([MESSAGE_VALIDATION_GENERIQUE]);
    }
  });

  it("D3 — chemin imbriqué", async () => {
    const action = defineAction(
      z.object({ lignes: z.array(z.object({ note: z.string().max(3, "3 caractères au maximum.") })) }),
      jamais,
    );
    const resultat = await action({ lignes: [{ note: "ok" }, { note: "trop long" }] });
    expect(resultat.ok).toBe(false);
    if (!resultat.ok) {
      expect(resultat.message).toBe("3 caractères au maximum.");
      expect((resultat.details as DetailsValidation).champs["lignes.1.note"]).toEqual(["3 caractères au maximum."]);
    }
  });

  it("D4 — issue sans chemin : details.general", async () => {
    const schemaRaffine = z.object({}).superRefine((_valeur, ctx) => {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Incohérent." });
    });
    const resultat = await defineAction(schemaRaffine, jamais)({});
    expect(resultat.ok).toBe(false);
    if (!resultat.ok) {
      expect(resultat.message).toBe("Incohérent.");
      expect(resultat.details).toEqual({ champs: {}, general: ["Incohérent."] });
    }
  });

  it("D5 — le message est celui de la première issue", async () => {
    const action = defineAction(z.object({ a: z.string().min(1, "A requis"), b: z.string().min(1, "B requis") }), jamais);
    const resultat = await action({ a: "", b: "" });
    expect(resultat.ok).toBe(false);
    if (!resultat.ok) {
      expect(resultat.message).toBe("A requis");
      const details = resultat.details as DetailsValidation;
      expect(Object.keys(details.champs).sort()).toEqual(["a", "b"]);
    }
  });

  it("D6 — entrée null : le générique seul, sans suffixe de champ", async () => {
    const action = defineAction(z.object({ nom: z.string() }), jamais);
    const resultat = await action(null);
    expect(resultat.ok).toBe(false);
    if (!resultat.ok) {
      expect(resultat.message).toBe(MESSAGE_VALIDATION_GENERIQUE);
      expect((resultat.details as DetailsValidation).general.length).toBeGreaterThan(0);
    }
  });

  it("D7 — la carte propre au schéma n'est pas écrasée", async () => {
    const action = defineAction(z.object({ n: z.string({ invalid_type_error: "Texte attendu." }) }), jamais);
    const resultat = await action({ n: 3 });
    expect(resultat.ok).toBe(false);
    if (!resultat.ok) expect(resultat.message).toBe("Texte attendu.");
  });
});
