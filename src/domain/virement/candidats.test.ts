import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { analyserReleve } from "../statement/analyser";
import { DESJARDINS_ACCESD } from "../statement/profils";
import { candidatsVirement } from "./candidats";
import type { CandidatVirement, CoteVirement } from "./types";

function source(surcharge: Partial<CoteVirement> = {}): CoteVirement {
  return {
    id: "src",
    accountId: "compte-1",
    date: "2026-03-10",
    montantCents: -5000,
    parentId: null,
    estVentilee: false,
    transferTransactionId: null,
    ...surcharge,
  };
}

function candidat(id: string, surcharge: Partial<CandidatVirement> = {}): CandidatVirement {
  return {
    id,
    accountId: "compte-2",
    date: "2026-03-10",
    montantCents: 5000,
    parentId: null,
    estVentilee: false,
    transferTransactionId: null,
    compteNom: "Épargne",
    description: `desc ${id}`,
    sousCategorieNom: null,
    ...surcharge,
  };
}

const ids = (liste: readonly CandidatVirement[]): string[] => liste.map((c) => c.id);

describe("candidatsVirement (docs/lot-m2.md §4.4)", () => {
  it("C1 — montant opposé exact retenu ; égal ou à 1 cent près exclu", () => {
    const retenu = candidat("ok");
    const resultat = candidatsVirement(source(), [
      retenu,
      candidat("egal", { montantCents: -5000 }),
      candidat("cent", { montantCents: 5001 }),
      candidat("cent2", { montantCents: 4999 }),
    ]);
    expect(ids(resultat)).toEqual(["ok"]);
  });

  it("C2 — ±5 jours inclus, ±6 jours exclus", () => {
    const resultat = candidatsVirement(source(), [
      candidat("p5", { date: "2026-03-15" }),
      candidat("m5", { date: "2026-03-05" }),
      candidat("p6", { date: "2026-03-16" }),
      candidat("m6", { date: "2026-03-04" }),
    ]);
    expect(ids(resultat).sort()).toEqual(["m5", "p5"]);
  });

  it("C3 — même compte exclu", () => {
    expect(candidatsVirement(source(), [candidat("m", { accountId: "compte-1" })])).toEqual([]);
  });

  it("C4 — déjà lié, ventilée et fille exclus", () => {
    const resultat = candidatsVirement(source(), [
      candidat("lie", { transferTransactionId: "z" }),
      candidat("vent", { estVentilee: true }),
      candidat("fille", { parentId: "p" }),
      candidat("ok"),
    ]);
    expect(ids(resultat)).toEqual(["ok"]);
  });

  it("C5 — ordre : écart absolu croissant, puis id croissant (indépendant de l'ordre d'entrée)", () => {
    const resultat = candidatsVirement(source({ date: "2026-03-10" }), [
      candidat("z-plus3", { date: "2026-03-13" }),
      candidat("b-moins1", { date: "2026-03-09" }),
      candidat("a-plus1", { date: "2026-03-11" }),
      candidat("y-moins3", { date: "2026-03-07" }),
    ]);
    expect(ids(resultat)).toEqual(["a-plus1", "b-moins1", "y-moins3", "z-plus3"]);
    // Entrée dans l'ordre inverse : même sortie.
    const inverse = candidatsVirement(source({ date: "2026-03-10" }), [
      candidat("y-moins3", { date: "2026-03-07" }),
      candidat("a-plus1", { date: "2026-03-11" }),
      candidat("b-moins1", { date: "2026-03-09" }),
      candidat("z-plus3", { date: "2026-03-13" }),
    ]);
    expect(ids(inverse)).toEqual(ids(resultat));
  });

  it("C6 — une source inéligible n'a aucun candidat", () => {
    const autres = [candidat("ok")];
    expect(candidatsVirement(source({ transferTransactionId: "z" }), autres)).toEqual([]);
    expect(candidatsVirement(source({ estVentilee: true }), autres)).toEqual([]);
    expect(candidatsVirement(source({ parentId: "p" }), autres)).toEqual([]);
    expect(candidatsVirement(source({ montantCents: 0 }), [candidat("zero", { montantCents: 0 })])).toEqual([]);
  });

  it("C7 — source sans id (ligne de relevé) : candidats normaux", () => {
    expect(ids(candidatsVirement(source({ id: null }), [candidat("ok")]))).toEqual(["ok"]);
  });

  it("C8 — mêmes références d'objets, champs supplémentaires conservés, entrée non mutée", () => {
    const a = candidat("a", { date: "2026-03-12" });
    const b = candidat("b", { date: "2026-03-11" });
    const entree = [a, b];
    const copie = [...entree];
    const resultat = candidatsVirement(source(), entree);
    expect(resultat[0]).toBe(b);
    expect(resultat[1]).toBe(a);
    expect(resultat[0]?.compteNom).toBe("Épargne");
    expect(entree).toEqual(copie);
    expect(entree[0]).toBe(a);
  });

  it("C9 — traversée de mois et d'année bissextile", () => {
    expect(
      ids(candidatsVirement(source({ date: "2026-01-30" }), [candidat("fev", { date: "2026-02-03" })])),
    ).toEqual(["fev"]);
    expect(
      ids(candidatsVirement(source({ date: "2028-02-27" }), [candidat("mars", { date: "2028-03-03" })])),
    ).toEqual(["mars"]);
    // Sans 29 février : 2027-02-27 -> 2027-03-04 = 5 jours ; 2027-02-26 -> 2027-03-04 = 6 jours.
    expect(candidatsVirement(source({ date: "2027-02-27" }), [candidat("m", { date: "2027-03-04" })])).toHaveLength(1);
    expect(candidatsVirement(source({ date: "2027-02-26" }), [candidat("m", { date: "2027-03-04" })])).toHaveLength(0);
  });

  it("C10 — les deux fixtures inventées : « Paiement. » a un seul candidat, la librairie aucun", () => {
    const lire = (nom: string): string =>
      readFileSync(new URL(`../statement/fixtures/${nom}.txt`, import.meta.url), "utf8");
    const cheque = analyserReleve(lire("virement-cheque"), DESJARDINS_ACCESD, 2024);
    const visa = analyserReleve(lire("virement-visa"), DESJARDINS_ACCESD, 2024);

    const autres: CandidatVirement[] = cheque.reconnues.map((l, i) => ({
      id: `cheque-${i}`,
      accountId: "cheque",
      date: l.date,
      montantCents: l.montantCents,
      parentId: null,
      estVentilee: false,
      transferTransactionId: null,
      compteNom: "cheque",
      description: l.description,
      sousCategorieNom: null,
    }));
    const enCote = (description: string): CoteVirement => {
      const l = visa.reconnues.find((x) => x.description === description);
      if (l === undefined) {
        throw new Error(`ligne absente : ${description}`);
      }
      return {
        id: null,
        accountId: "visa",
        date: l.date,
        montantCents: l.montantCents,
        parentId: null,
        estVentilee: false,
        transferTransactionId: null,
      };
    };

    const paiement = candidatsVirement(enCote("Paiement."), autres);
    expect(paiement).toHaveLength(1);
    expect(paiement[0]?.description).toBe("VISA DESJARDINS");
    expect(paiement[0]?.accountId).toBe("cheque");
    expect(candidatsVirement(enCote("Librairie Imaginaire"), autres)).toEqual([]);
  });
});
