import { describe, expect, it } from "vitest";
import { messageRefusLiaison, peutLier } from "./liaison";
import { FENETRE_VIREMENT_JOURS, type CoteVirement, type RefusLiaison } from "./types";

function cote(surcharge: Partial<CoteVirement> = {}): CoteVirement {
  return {
    id: "a",
    accountId: "compte-1",
    date: "2026-03-10",
    montantCents: -5000,
    parentId: null,
    estVentilee: false,
    transferTransactionId: null,
    ...surcharge,
  };
}

function autre(surcharge: Partial<CoteVirement> = {}): CoteVirement {
  return cote({ id: "b", accountId: "compte-2", montantCents: 5000, date: "2026-03-12", ...surcharge });
}

describe("peutLier (docs/lot-m2.md §4.4)", () => {
  it("L1 — paire nominale : null, et symétrique", () => {
    const a = cote();
    const b = autre();
    expect(peutLier(a, b)).toBeNull();
    expect(peutLier(b, a)).toBeNull();
  });

  it("L2 — ids égaux non nuls : MEME_TRANSACTION ; deux ids null ne le sont pas", () => {
    expect(peutLier(cote({ id: "x" }), autre({ id: "x" }))).toEqual({ motif: "MEME_TRANSACTION" });
    expect(peutLier(cote({ id: null }), autre({ id: null }))).toBeNull();
  });

  it("L3 — LIGNE_FILLE, pour chaque côté", () => {
    expect(peutLier(cote({ parentId: "p" }), autre())).toEqual({ motif: "LIGNE_FILLE", cote: "PREMIERE" });
    expect(peutLier(cote(), autre({ parentId: "p" }))).toEqual({ motif: "LIGNE_FILLE", cote: "SECONDE" });
  });

  it("L4 — VENTILEE, pour chaque côté", () => {
    expect(peutLier(cote({ estVentilee: true }), autre())).toEqual({ motif: "VENTILEE", cote: "PREMIERE" });
    expect(peutLier(cote(), autre({ estVentilee: true }))).toEqual({ motif: "VENTILEE", cote: "SECONDE" });
  });

  it("L5 — DEJA_LIEE, pour chaque côté", () => {
    expect(peutLier(cote({ transferTransactionId: "z" }), autre())).toEqual({ motif: "DEJA_LIEE", cote: "PREMIERE" });
    expect(peutLier(cote(), autre({ transferTransactionId: "z" }))).toEqual({ motif: "DEJA_LIEE", cote: "SECONDE" });
  });

  it("L9 — MEME_COMPTE", () => {
    expect(peutLier(cote(), autre({ accountId: "compte-1" }))).toEqual({ motif: "MEME_COMPTE" });
  });

  it("L10 — MONTANT_NUL : 0 et 0 ne forment pas une paire", () => {
    expect(peutLier(cote({ montantCents: 0 }), autre({ montantCents: 0 }))).toEqual({ motif: "MONTANT_NUL" });
  });

  it("L11 — MONTANT_NON_OPPOSE avec la somme en cents signés", () => {
    expect(peutLier(cote({ montantCents: -5000 }), autre({ montantCents: 4999 }))).toEqual({
      motif: "MONTANT_NON_OPPOSE",
      sommeCents: -1,
    });
    expect(peutLier(cote({ montantCents: -5000 }), autre({ montantCents: -5000 }))).toEqual({
      motif: "MONTANT_NON_OPPOSE",
      sommeCents: -10000,
    });
  });

  it("L12 — HORS_FENETRE à 6 jours, dans les deux sens de date", () => {
    expect(peutLier(cote({ date: "2026-03-10" }), autre({ date: "2026-03-16" }))).toEqual({
      motif: "HORS_FENETRE",
      ecartJours: 6,
    });
    expect(peutLier(cote({ date: "2026-03-16" }), autre({ date: "2026-03-10" }))).toEqual({
      motif: "HORS_FENETRE",
      ecartJours: 6,
    });
  });

  it("L13 — ±5 jours : limite incluse", () => {
    expect(FENETRE_VIREMENT_JOURS).toBe(5);
    expect(peutLier(cote({ date: "2026-03-10" }), autre({ date: "2026-03-15" }))).toBeNull();
    expect(peutLier(cote({ date: "2026-03-15" }), autre({ date: "2026-03-10" }))).toBeNull();
  });

  it("L14 — priorité : une fille sur le même compte est LIGNE_FILLE", () => {
    expect(peutLier(cote({ parentId: "p" }), autre({ accountId: "compte-1" }))).toEqual({
      motif: "LIGNE_FILLE",
      cote: "PREMIERE",
    });
  });

  it("L14 — priorité : PREMIERE déjà liée et SECONDE ventilée donne DEJA_LIEE PREMIERE", () => {
    expect(peutLier(cote({ transferTransactionId: "z" }), autre({ estVentilee: true }))).toEqual({
      motif: "DEJA_LIEE",
      cote: "PREMIERE",
    });
  });

  it("L14 — priorité : même compte avant montant et fenêtre", () => {
    expect(
      peutLier(cote({ montantCents: 0 }), autre({ accountId: "compte-1", montantCents: 1, date: "2030-01-01" })),
    ).toEqual({ motif: "MEME_COMPTE" });
  });

  it("L14 — priorité : montant avant fenêtre", () => {
    expect(peutLier(cote(), autre({ montantCents: 4000, date: "2030-01-01" }))?.motif).toBe("MONTANT_NON_OPPOSE");
  });

  it("traversée d'année : 2026-12-30 et 2027-01-02 sont à 3 jours", () => {
    expect(peutLier(cote({ date: "2026-12-30" }), autre({ date: "2027-01-02" }))).toBeNull();
  });
});

describe("messageRefusLiaison (§4.1)", () => {
  const cas: readonly (readonly [RefusLiaison, string])[] = [
    [{ motif: "MEME_TRANSACTION" }, "Une transaction ne se lie pas à elle-même."],
    [{ motif: "LIGNE_FILLE", cote: "PREMIERE" }, "Une ligne de ventilation ne devient pas un côté de virement."],
    [{ motif: "LIGNE_FILLE", cote: "SECONDE" }, "Une ligne de ventilation ne devient pas un côté de virement."],
    [
      { motif: "VENTILEE", cote: "PREMIERE" },
      "Cette transaction est ventilée : déventile-la avant de la lier en virement.",
    ],
    [
      { motif: "VENTILEE", cote: "SECONDE" },
      "L'autre transaction est ventilée : déventile-la avant de la lier en virement.",
    ],
    [
      { motif: "DEJA_LIEE", cote: "PREMIERE" },
      "Cette transaction est déjà un côté de virement : délie-la d'abord.",
    ],
    [
      { motif: "DEJA_LIEE", cote: "SECONDE" },
      "L'autre transaction est déjà un côté de virement : délie-la d'abord.",
    ],
    [{ motif: "MEME_COMPTE" }, "Les deux côtés d'un virement sont sur deux comptes différents."],
    [{ motif: "MONTANT_NUL" }, "Une transaction de 0,00 $ ne devient pas un virement."],
    [
      { motif: "HORS_FENETRE", ecartJours: 6 },
      "Les deux dates sont à 6 jours l'une de l'autre : un virement se lie à 5 jours près au plus.",
    ],
  ];

  it.each(cas)("L15 — %j", (refus, attendu) => {
    expect(messageRefusLiaison(refus)).toBe(attendu);
  });

  it("L15 — MONTANT_NON_OPPOSE formate la somme en dollars signés", () => {
    const message = messageRefusLiaison({ motif: "MONTANT_NON_OPPOSE", sommeCents: -1 });
    expect(message.startsWith("Les deux montants ne s'annulent pas : leur somme vaut ")).toBe(true);
    expect(message).toMatch(/0,01/);
    expect(message.endsWith(".")).toBe(true);
  });
});
