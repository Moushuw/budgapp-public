// Teste prisma/test/invariants-occurrences.ts sans base : bilanInvariantsOccurrences
// et formaterEcartsOccurrences sont purs (docs/lot-m3.md §7).

import { describe, expect, it } from "vitest";
import {
  bilanInvariantsOccurrences,
  formaterEcartsOccurrences,
  type LigneOccurrenceInvariant,
  type LigneReconciliationInvariant,
} from "./invariants-occurrences";

let compteur = 0;

function occ(partiel: Partial<LigneOccurrenceInvariant> = {}): LigneOccurrenceInvariant {
  compteur += 1;
  return {
    id: `o${compteur}`,
    ruleId: "r1",
    echeance: "2026-03-01",
    etat: "PREVUE",
    liaison: null,
    lieeLe: null,
    montantCents: -1000,
    transactionId: null,
    regle: { accountId: "cpt-a", ownerId: "own-a", dateFin: null, montantCents: -1000 },
    transaction: null,
    ...partiel,
  };
}

function liee(partiel: Partial<LigneOccurrenceInvariant> = {}): LigneOccurrenceInvariant {
  return occ({
    etat: "REALISEE",
    liaison: "RETROACTIVE",
    lieeLe: new Date(0),
    transactionId: "t1",
    transaction: { accountId: "cpt-a", ownerId: "own-a", parentId: null },
    ...partiel,
  });
}

function reconciliation(partiel: Partial<LigneReconciliationInvariant> = {}): LigneReconciliationInvariant {
  return {
    id: "rec1",
    accountId: "cpt-a",
    ajustementTxId: null,
    ancrage: { accountId: "cpt-a", date: "2026-09-09" },
    ajustement: null,
    ...partiel,
  };
}

describe("bilanInvariantsOccurrences", () => {
  it("IO1 — cohérent", () => {
    const bilan = bilanInvariantsOccurrences([occ(), liee()], []);
    expect(bilan.ecarts).toEqual([]);
    expect(bilan.nbOccurrences).toBe(2);
    expect(bilan.nbLiees).toBe(1);
    expect(bilan.nbReconciliations).toBe(0);
  });

  it("IO2 — REALISEE sans rien", () => {
    const bilan = bilanInvariantsOccurrences(
      [occ({ id: "x", etat: "REALISEE" })],
      [],
    );
    expect(bilan.ecarts.map((e) => [e.invariant, e.message])).toEqual([
      [1, "état REALISEE sans liaison"],
      [1, "état REALISEE sans lieeLe"],
      [1, "état REALISEE sans transactionId"],
    ]);
  });

  it("IO3 — PREVUE liée", () => {
    const bilan = bilanInvariantsOccurrences(
      [occ({ id: "x", transactionId: "t9", liaison: "AUTO", lieeLe: new Date(0), transaction: { accountId: "cpt-a", ownerId: "own-a", parentId: null } })],
      [],
    );
    expect(bilan.ecarts).toHaveLength(3);
    expect(bilan.ecarts.every((e) => e.invariant === 1)).toBe(true);
    const messages = bilan.ecarts.map((e) => e.message);
    expect(messages).toContain("état PREVUE avec transactionId t9");
    expect(messages).toContain("état PREVUE avec liaison AUTO");
  });

  it("IO4 — IGNOREE avec liaison", () => {
    const bilan = bilanInvariantsOccurrences([occ({ etat: "IGNOREE", liaison: "MANUELLE" })], []);
    expect(bilan.ecarts.map((e) => e.message)).toEqual(["état IGNOREE avec liaison MANUELLE"]);
  });

  it("IO5 — transaction sur un autre compte", () => {
    const bilan = bilanInvariantsOccurrences([liee({ transaction: { accountId: "cpt-b", ownerId: "own-a", parentId: null } })], []);
    expect(bilan.ecarts).toHaveLength(1);
    expect(bilan.ecarts[0]?.invariant).toBe(2);
    expect(bilan.ecarts[0]?.message).toContain("cpt-b");
    expect(bilan.ecarts[0]?.message).toContain("cpt-a");
  });

  it("IO6 — transaction d'un autre propriétaire", () => {
    const bilan = bilanInvariantsOccurrences([liee({ transaction: { accountId: "cpt-a", ownerId: "own-b", parentId: null } })], []);
    expect(bilan.ecarts).toHaveLength(1);
    expect(bilan.ecarts[0]).toMatchObject({ invariant: 2 });
    expect(bilan.ecarts[0]?.message).toContain("propriétaire");
  });

  it("IO7 — ligne fille", () => {
    const bilan = bilanInvariantsOccurrences([liee({ transaction: { accountId: "cpt-a", ownerId: "own-a", parentId: "p1" } })], []);
    expect(bilan.ecarts).toHaveLength(1);
    expect(bilan.ecarts[0]).toMatchObject({ invariant: 3, message: "transaction t1 est une ligne fille de p1" });
  });

  it("IO8 — échéance et dateFin", () => {
    const regle = { accountId: "cpt-a", ownerId: "own-a", dateFin: "2026-03-31", montantCents: -1000 };
    const apres = bilanInvariantsOccurrences([occ({ echeance: "2026-04-01", regle })], []);
    expect(apres.ecarts).toHaveLength(1);
    expect(apres.ecarts[0]?.invariant).toBe(4);
    expect(bilanInvariantsOccurrences([liee({ echeance: "2026-04-01", regle })], []).ecarts).toEqual([]);
    expect(bilanInvariantsOccurrences([occ({ echeance: "2026-03-31", regle })], []).ecarts).toEqual([]);
  });

  it("IO9 — réconciliation sur un autre compte que son ancrage", () => {
    const bilan = bilanInvariantsOccurrences([], [reconciliation({ ancrage: { accountId: "cpt-b", date: "2026-09-09" } })]);
    expect(bilan.ecarts).toHaveLength(1);
    expect(bilan.ecarts[0]?.invariant).toBe(5);
    expect(bilan.nbReconciliations).toBe(1);
  });

  it("IO10 — ajustement manuel, d'un autre compte et d'une autre date", () => {
    const bilan = bilanInvariantsOccurrences(
      [],
      [
        reconciliation({
          ajustementTxId: "a1",
          ajustement: { accountId: "cpt-b", source: "MANUELLE", date: "2026-09-10" },
        }),
      ],
    );
    expect(bilan.ecarts).toHaveLength(3);
    expect(bilan.ecarts.every((e) => e.invariant === 5)).toBe(true);
  });

  it("IO11 — ajustement conforme", () => {
    const bilan = bilanInvariantsOccurrences(
      [],
      [
        reconciliation({
          ajustementTxId: "a1",
          ajustement: { accountId: "cpt-a", source: "AJUSTEMENT", date: "2026-09-09" },
        }),
      ],
    );
    expect(bilan.ecarts).toEqual([]);
  });

  it("IO12 — transaction liée introuvable", () => {
    const bilan = bilanInvariantsOccurrences([liee({ id: "x", transaction: null })], []);
    expect(bilan.ecarts).toEqual([{ invariant: 2, objetId: "x", message: "transaction liée t1 introuvable" }]);
  });

  it("IO13 — écarts triés par invariant, objetId, message", () => {
    const bilan = bilanInvariantsOccurrences(
      [
        liee({ id: "b", transaction: { accountId: "cpt-a", ownerId: "own-a", parentId: "p1" } }),
        occ({ id: "z", etat: "IGNOREE", liaison: "AUTO" }),
        occ({ id: "a", etat: "IGNOREE", liaison: "AUTO" }),
      ],
      [reconciliation({ accountId: "cpt-c" })],
    );
    expect(bilan.ecarts.map((e) => [e.invariant, e.objetId])).toEqual([
      [1, "a"],
      [1, "z"],
      [3, "b"],
      [5, "rec1"],
    ]);
  });

  it("IO14 — signe contraire, vérifié sans option", () => {
    const bilan = bilanInvariantsOccurrences([occ({ id: "s", montantCents: 1000 })], []);
    expect(bilan.ecarts).toEqual([
      { invariant: 6, objetId: "s", message: "montant 1000 de signe contraire à la règle (-1000)" },
    ]);
  });

  it("IO15 — montant à venir, sur demande, exceptions déclarées", () => {
    const o = occ({ id: "m", echeance: "2026-10-12", montantCents: -1200 });
    expect(bilanInvariantsOccurrences([o], []).ecarts).toEqual([]);
    expect(
      bilanInvariantsOccurrences([o], [], { montantsAVenir: { aujourdhui: "2026-10-09" } }).ecarts,
    ).toEqual([
      { invariant: 7, objetId: "m", message: "échéance ouverte à venir 2026-10-12 à -1200, règle à -1000" },
    ]);
    expect(
      bilanInvariantsOccurrences([o], [], {
        montantsAVenir: { aujourdhui: "2026-10-09", montantsFixesALaMain: ["m"] },
      }).ecarts,
    ).toEqual([]);
  });

  it("IO16 — tri des invariants 1, 6 et 7 mêlés", () => {
    const bilan = bilanInvariantsOccurrences(
      [
        occ({ id: "z7", echeance: "2026-10-12", montantCents: -1200 }),
        occ({ id: "b6", echeance: "2026-01-01", montantCents: 1000 }),
        occ({ id: "a1", echeance: "2026-01-01", etat: "IGNOREE", liaison: "AUTO" }),
        occ({ id: "a6", echeance: "2026-01-01", montantCents: 1000 }),
      ],
      [],
      { montantsAVenir: { aujourdhui: "2026-10-09" } },
    );
    expect(bilan.ecarts.map((e) => [e.invariant, e.objetId])).toEqual([
      [1, "a1"],
      [6, "a6"],
      [6, "b6"],
      [7, "z7"],
    ]);
  });
});

describe("messages exacts des invariants (docs/lot-m3.md §7)", () => {
  it("invariant 2 : compte et propriétaire", () => {
    const compte = bilanInvariantsOccurrences([liee({ transaction: { accountId: "cpt-b", ownerId: "own-a", parentId: null } })], []);
    expect(compte.ecarts.map((e) => e.message)).toEqual(["transaction t1 sur le compte cpt-b, règle sur le compte cpt-a"]);
    const proprio = bilanInvariantsOccurrences([liee({ transaction: { accountId: "cpt-a", ownerId: "own-b", parentId: null } })], []);
    expect(proprio.ecarts.map((e) => e.message)).toEqual(["transaction t1 du propriétaire own-b, règle du propriétaire own-a"]);
  });

  it("invariant 1 : lieeLe sur un état non lié, et REALISEE_MONTANT_DIFFERENT sans lien", () => {
    const prevue = bilanInvariantsOccurrences([occ({ lieeLe: new Date(0) })], []);
    expect(prevue.ecarts.map((e) => e.message)).toEqual(["état PREVUE avec lieeLe"]);
    const different = bilanInvariantsOccurrences([occ({ etat: "REALISEE_MONTANT_DIFFERENT" })], []);
    expect(different.ecarts.map((e) => e.message).sort()).toEqual([
      "état REALISEE_MONTANT_DIFFERENT sans liaison",
      "état REALISEE_MONTANT_DIFFERENT sans lieeLe",
      "état REALISEE_MONTANT_DIFFERENT sans transactionId",
    ]);
  });

  it("invariant 4 : message", () => {
    const regle = { accountId: "cpt-a", ownerId: "own-a", dateFin: "2026-03-31", montantCents: -1000 };
    const b = bilanInvariantsOccurrences([occ({ echeance: "2026-04-01", regle })], []);
    expect(b.ecarts.map((e) => e.message)).toEqual(["échéance 2026-04-01 après la dateFin 2026-03-31 sans liaison"]);
  });

  it("invariant 5 : les messages", () => {
    const compte = bilanInvariantsOccurrences([], [reconciliation({ ancrage: { accountId: "cpt-b", date: "2026-09-09" } })]);
    expect(compte.ecarts.map((e) => e.message)).toEqual(["compte cpt-a ≠ compte de l'ancrage cpt-b"]);
    const introuvable = bilanInvariantsOccurrences([], [reconciliation({ ajustementTxId: "a1", ajustement: null })]);
    expect(introuvable.ecarts.map((e) => e.message)).toEqual(["ajustement a1 introuvable"]);
    const manuel = bilanInvariantsOccurrences(
      [],
      [reconciliation({ ajustementTxId: "a1", ajustement: { accountId: "cpt-b", source: "MANUELLE", date: "2026-09-10" } })],
    );
    expect(manuel.ecarts.map((e) => e.message).sort()).toEqual(
      [
        "ajustement a1 de source MANUELLE",
        "ajustement a1 sur le compte cpt-b, réconciliation sur le compte cpt-a",
        "ajustement a1 daté du 2026-09-10, ancrage du 2026-09-09",
      ].sort(),
    );
  });

  it("une occurrence REALISEE_MONTANT_DIFFERENT liée et conforme n'a aucun écart", () => {
    expect(bilanInvariantsOccurrences([liee({ etat: "REALISEE_MONTANT_DIFFERENT", liaison: "MANUELLE" })], []).ecarts).toEqual([]);
  });
});

describe("formaterEcartsOccurrences", () => {
  it("IO-F1 — aucun écart", () => {
    expect(formaterEcartsOccurrences([])).toBe("");
  });

  it("IO-F2 — deux écarts", () => {
    const lignes = formaterEcartsOccurrences([
      { invariant: 1, objetId: "o1", message: "m1" },
      { invariant: 3, objetId: "o2", message: "m2" },
    ]).split("\n");
    expect(lignes).toHaveLength(3);
    expect(lignes[0]).toBe("2 écart(s) aux invariants des occurrences :");
    expect(lignes[1]).toBe("invariant 1 · o1 · m1");
    expect(lignes[2]).toBe("invariant 3 · o2 · m2");
  });
});
