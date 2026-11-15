import { describe, expect, it } from "vitest";
import { apparierRetroactivement } from "./appariement";
import type { TransactionAApparier } from "./types";

const t = (id: string, date: string): TransactionAApparier => ({ id, date });

describe("apparierRetroactivement", () => {
  const a1 = [t("t1", "2026-01-12"), t("t2", "2026-02-13"), t("t3", "2026-03-11")];

  it("A1 — une transaction par échéance", () => {
    const [t1, t2, t3] = a1;
    const r = apparierRetroactivement(["2026-01-12", "2026-02-12", "2026-03-12"], a1, 3);
    expect(r.paires).toEqual([
      { echeance: "2026-01-12", transaction: t1 },
      { echeance: "2026-02-12", transaction: t2 },
      { echeance: "2026-03-12", transaction: t3 },
    ]);
    expect(r.transactionsSansEcheance).toEqual([]);
    expect(r.echeancesSansTransaction).toEqual([]);
  });

  it("A2 — deux transactions pour une échéance : l'autre reste visible", () => {
    const tA = t("tA", "2026-03-12");
    const tB = t("tB", "2026-03-14");
    const r = apparierRetroactivement(["2026-03-12", "2026-04-12"], [tA, tB], 3);
    expect(r.paires).toEqual([{ echeance: "2026-03-12", transaction: tA }]);
    expect(r.transactionsSansEcheance).toEqual([tB]);
    expect(r.echeancesSansTransaction).toEqual(["2026-04-12"]);
  });

  it("A3 — échéance sans transaction", () => {
    const r = apparierRetroactivement(["2026-01-12", "2026-02-12", "2026-03-12"], [t("t1", "2026-01-12"), t("t3", "2026-03-12")], 3);
    expect(r.paires).toHaveLength(2);
    expect(r.echeancesSansTransaction).toEqual(["2026-02-12"]);
  });

  it("A4 — distance égale : l'échéance la plus ancienne", () => {
    const tx = t("t", "2026-03-12");
    const r = apparierRetroactivement(["2026-03-10", "2026-03-14"], [tx], 2);
    expect(r.paires).toEqual([{ echeance: "2026-03-10", transaction: tx }]);
    expect(r.echeancesSansTransaction).toEqual(["2026-03-14"]);
  });

  it("A5 — la plus proche gagne, pas la plus ancienne", () => {
    const tP = t("tP", "2026-03-10");
    const tQ = t("tQ", "2026-03-12");
    const r = apparierRetroactivement(["2026-03-12", "2026-04-12"], [tP, tQ], 3);
    expect(r.paires).toEqual([{ echeance: "2026-03-12", transaction: tQ }]);
    expect(r.transactionsSansEcheance).toEqual([tP]);
    expect(r.echeancesSansTransaction).toEqual(["2026-04-12"]);
  });

  it("A6 — la perdante prend l'échéance suivante", () => {
    const tX = t("tX", "2026-03-11");
    const tY = t("tY", "2026-03-12");
    const r = apparierRetroactivement(["2026-03-10", "2026-03-14"], [tX, tY], 3);
    expect(r.paires).toEqual([
      { echeance: "2026-03-10", transaction: tX },
      { echeance: "2026-03-14", transaction: tY },
    ]);
  });

  it("A7 — distance égale : la date la plus ancienne, malgré l'id", () => {
    const t1 = t("b", "2026-03-10");
    const t2 = t("a", "2026-03-14");
    const r = apparierRetroactivement(["2026-03-12"], [t1, t2], 3);
    expect(r.paires).toEqual([{ echeance: "2026-03-12", transaction: t1 }]);
    expect(r.transactionsSansEcheance).toEqual([t2]);
  });

  it("A8 — tolérance nulle", () => {
    const tx = t("t", "2026-03-13");
    const r = apparierRetroactivement(["2026-03-12"], [tx], 0);
    expect(r.paires).toEqual([]);
    expect(r.transactionsSansEcheance).toEqual([tx]);
    expect(r.echeancesSansTransaction).toEqual(["2026-03-12"]);
  });

  it("A9 — vides, désordre, doublons", () => {
    expect(apparierRetroactivement([], [], 3)).toEqual({ paires: [], transactionsSansEcheance: [], echeancesSansTransaction: [] });
    const desordre = apparierRetroactivement(["2026-03-12", "2026-01-12", "2026-02-12"], [...a1].reverse(), 3);
    expect(desordre).toEqual(apparierRetroactivement(["2026-01-12", "2026-02-12", "2026-03-12"], a1, 3));
    expect(apparierRetroactivement(["2026-01-12", "2026-01-12"], [t("t1", "2026-01-12")], 3).echeancesSansTransaction).toEqual([]);
  });

  it("distance, échéance et date égales : l'id croissant gagne", () => {
    const tb = t("b", "2026-03-12");
    const ta = t("a", "2026-03-12");
    const r = apparierRetroactivement(["2026-03-12"], [tb, ta], 3);
    expect(r.paires).toEqual([{ echeance: "2026-03-12", transaction: ta }]);
    expect(r.transactionsSansEcheance).toEqual([tb]);
  });

  it("transactions sans échéance triées par (date, id)", () => {
    const x = t("x", "2026-05-02");
    const y = t("a", "2026-05-02");
    const z = t("z", "2026-05-01");
    const r = apparierRetroactivement([], [x, y, z], 3);
    expect(r.transactionsSansEcheance).toEqual([z, y, x]);
  });

  it("rend les objets reçus, sans copie, et ne mute rien", () => {
    const tx = t("t", "2026-03-12");
    const entree = [tx];
    const r = apparierRetroactivement(["2026-03-12"], entree, 3);
    expect(r.paires[0]?.transaction).toBe(tx);
    expect(entree).toEqual([tx]);
  });
});
