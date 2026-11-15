// Teste prisma/test/invariants.ts sans base : bilanInvariants et formaterEcarts
// sont purs (docs/lot-m2.md §4.2 et §4.4).

import { describe, expect, it } from "vitest";
import { bilanInvariants, formaterEcarts, type LigneInvariant } from "./invariants";

function ligne(partiel: Partial<LigneInvariant> & { id: string }): LigneInvariant {
  return {
    accountId: "cpt-a",
    montantCents: 0,
    subcategoryId: null,
    transferAccountId: null,
    transferTransactionId: null,
    parentId: null,
    estVentilee: false,
    ...partiel,
  };
}

function paire(): [LigneInvariant, LigneInvariant] {
  return [
    ligne({ id: "v1", accountId: "cpt-a", montantCents: -1000, transferAccountId: "cpt-b", transferTransactionId: "v2" }),
    ligne({ id: "v2", accountId: "cpt-b", montantCents: 1000, transferAccountId: "cpt-a", transferTransactionId: "v1" }),
  ];
}

describe("bilanInvariants — invariant 1 (virements)", () => {
  it("I1 — paire correcte", () => {
    const bilan = bilanInvariants(paire());
    expect(bilan.ecarts).toEqual([]);
    expect(bilan.nbCotesVirement).toBe(2);
  });

  it("I2 — contrepartie absente de l'univers", () => {
    const [v1] = paire();
    const bilan = bilanInvariants([{ ...v1, transferTransactionId: "v-absent" }]);
    expect(bilan.ecarts).toHaveLength(1);
    expect(bilan.ecarts[0]).toMatchObject({ invariant: 1, transactionId: "v1" });
    expect(bilan.ecarts[0]?.message).toContain("v-absent");
  });

  it("I3 — la contrepartie pointe ailleurs", () => {
    const [v1, v2] = paire();
    const v3 = ligne({
      id: "v3",
      accountId: "cpt-b",
      montantCents: 1000,
      transferAccountId: "cpt-a",
      transferTransactionId: "v2",
    });
    const bilan = bilanInvariants([v1, { ...v2, transferTransactionId: "v3" }, v3]);
    const surV1 = bilan.ecarts.filter((e) => e.transactionId === "v1");
    expect(surV1.some((e) => e.invariant === 1 && e.message.includes("ne pointe pas"))).toBe(true);
  });

  it("I4 — montants non opposés, signalé des deux côtés", () => {
    const [v1, v2] = paire();
    const bilan = bilanInvariants([v1, { ...v2, montantCents: 900 }]);
    expect(bilan.ecarts.map((e) => e.transactionId)).toEqual(["v1", "v2"]);
    for (const ecart of bilan.ecarts) {
      expect(ecart.invariant).toBe(1);
      expect(ecart.message).toContain("-1000");
      expect(ecart.message).toContain("900");
      expect(ecart.message).toContain("-100");
    }
  });

  it("I5 — transferAccountId qui n'est pas le compte de la contrepartie", () => {
    const [v1, v2] = paire();
    const bilan = bilanInvariants([{ ...v1, transferAccountId: "cpt-c" }, v2]);
    expect(bilan.ecarts).toHaveLength(1);
    expect(bilan.ecarts[0]).toMatchObject({ invariant: 1, transactionId: "v1" });
    expect(bilan.ecarts[0]?.message).toContain("cpt-c");
    expect(bilan.ecarts[0]?.message).toContain("cpt-b");
  });

  it("I6 — les deux côtés sur le même compte", () => {
    const [v1, v2] = paire();
    const bilan = bilanInvariants([
      { ...v1, transferAccountId: "cpt-a" },
      { ...v2, accountId: "cpt-a", transferAccountId: "cpt-a" },
    ]);
    const memeCompte = bilan.ecarts.filter((e) => e.invariant === 1 && e.message.includes("même compte"));
    expect(memeCompte.map((e) => e.transactionId)).toEqual(["v1", "v2"]);
  });

  it("I7 — transferAccountId sans contrepartie", () => {
    const bilan = bilanInvariants([ligne({ id: "t1", transferAccountId: "cpt-b" })]);
    expect(bilan.ecarts).toHaveLength(1);
    expect(bilan.ecarts[0]).toMatchObject({ invariant: 1, transactionId: "t1" });
    expect(bilan.ecarts[0]?.message).toContain("sans contrepartie");
  });
});

describe("bilanInvariants — invariant 2 (ventilations)", () => {
  const parent = ligne({ id: "p", montantCents: -1000, estVentilee: true });

  it("I8 — parent et filles cohérents", () => {
    const bilan = bilanInvariants([
      parent,
      ligne({ id: "f1", montantCents: -600, parentId: "p" }),
      ligne({ id: "f2", montantCents: -400, parentId: "p" }),
    ]);
    expect(bilan.ecarts).toEqual([]);
    expect(bilan.nbParentsVentiles).toBe(1);
  });

  it("I9 — somme des filles différente du parent", () => {
    const bilan = bilanInvariants([
      parent,
      ligne({ id: "f1", montantCents: -600, parentId: "p" }),
      ligne({ id: "f2", montantCents: -300, parentId: "p" }),
    ]);
    expect(bilan.ecarts).toHaveLength(1);
    expect(bilan.ecarts[0]).toMatchObject({ invariant: 2, transactionId: "p" });
    expect(bilan.ecarts[0]?.message).toContain("-900");
    expect(bilan.ecarts[0]?.message).toContain("-1000");
  });

  it("I10 — parent ventilé sans fille", () => {
    const bilan = bilanInvariants([parent]);
    expect(bilan.ecarts).toHaveLength(1);
    expect(bilan.ecarts[0]).toMatchObject({ invariant: 2, transactionId: "p" });
  });

  it("I11 — fille dont le parent n'est pas marqué ventilé", () => {
    const bilan = bilanInvariants([
      ligne({ id: "p", montantCents: -1000 }),
      ligne({ id: "f1", montantCents: -1000, parentId: "p" }),
    ]);
    expect(bilan.ecarts).toHaveLength(1);
    expect(bilan.ecarts[0]).toMatchObject({ invariant: 2, transactionId: "f1" });
  });

  it("I12 — fille dont le parent est absent", () => {
    const bilan = bilanInvariants([ligne({ id: "f1", montantCents: -1000, parentId: "p-absent" })]);
    expect(bilan.ecarts).toHaveLength(1);
    expect(bilan.ecarts[0]).toMatchObject({ invariant: 2, transactionId: "f1" });
    expect(bilan.ecarts[0]?.message).toContain("p-absent");
  });
});

describe("bilanInvariants — invariant 5 (catégorie)", () => {
  it("I13 — un côté de virement catégorisé", () => {
    const [v1, v2] = paire();
    const bilan = bilanInvariants([{ ...v1, subcategoryId: "sc-a" }, v2]);
    expect(bilan.ecarts).toHaveLength(1);
    expect(bilan.ecarts[0]).toMatchObject({ invariant: 5, transactionId: "v1" });
  });

  it("I14 — un parent ventilé catégorisé", () => {
    const bilan = bilanInvariants([
      ligne({ id: "p", montantCents: -1000, estVentilee: true, subcategoryId: "sc-a" }),
      ligne({ id: "f1", montantCents: -1000, parentId: "p" }),
    ]);
    expect(bilan.ecarts).toHaveLength(1);
    expect(bilan.ecarts[0]).toMatchObject({ invariant: 5, transactionId: "p" });
  });

  it("I15 — une fille catégorisée et une transaction ordinaire catégorisée sont permises", () => {
    const bilan = bilanInvariants([
      ligne({ id: "p", montantCents: -1000, estVentilee: true }),
      ligne({ id: "f1", montantCents: -1000, parentId: "p", subcategoryId: "sc-a" }),
      ligne({ id: "o1", montantCents: -500, subcategoryId: "sc-b" }),
    ]);
    expect(bilan.ecarts).toEqual([]);
  });
});

describe("bilanInvariants — forme du bilan", () => {
  it("I16 — univers vide", () => {
    expect(bilanInvariants([])).toEqual({ ecarts: [], nbCotesVirement: 0, nbParentsVentiles: 0 });
  });

  it("I17 — écarts triés par invariant", () => {
    const bilan = bilanInvariants([
      ligne({ id: "a5", subcategoryId: "sc-a", estVentilee: true, montantCents: 0 }),
      ligne({ id: "b2", montantCents: -1, parentId: "absent" }),
      ligne({ id: "c1", transferAccountId: "cpt-b" }),
    ]);
    expect(bilan.ecarts.map((e) => e.invariant)).toEqual([1, 2, 2, 5]);
  });
});

describe("formaterEcarts", () => {
  it("F1 — aucun écart : chaîne vide", () => {
    expect(formaterEcarts([])).toBe("");
  });

  it("F2 — un en-tête puis une ligne par écart", () => {
    const texte = formaterEcarts([
      { invariant: 1, transactionId: "v1", message: "contrepartie v-absent introuvable" },
      { invariant: 2, transactionId: "p", message: "parent ventilé sans ligne fille" },
    ]);
    const lignes = texte.split("\n");
    expect(lignes).toHaveLength(3);
    expect(lignes[0]).toBe("2 écart(s) aux invariants 1, 2, 5 :");
    expect(lignes[1]).toBe("invariant 1 · v1 · contrepartie v-absent introuvable");
  });
});
