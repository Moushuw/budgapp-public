import { describe, expect, it } from "vitest";
import { formatMontant } from "../money";
import { candidatsOccurrence, evaluerRapprochement } from "./rapprochement";
import type { LigneARapprocher, OccurrenceCandidate } from "./types";

const O_NF: OccurrenceCandidate = {
  id: "occ-nf",
  ruleId: "r-nf",
  echeance: "2026-10-12",
  montantCents: -1799,
  libelle: "Netflix",
  motifRapprochement: "NETFLIX.COM",
  toleranceCents: 500,
  toleranceJours: 3,
  subcategoryId: "sc-streaming",
};

const O_NF2: OccurrenceCandidate = {
  id: "occ-nf2",
  ruleId: "r-nf2",
  echeance: "2026-10-14",
  montantCents: -1799,
  libelle: "Netflix famille",
  motifRapprochement: "NETFLIX",
  toleranceCents: 500,
  toleranceJours: 3,
  subcategoryId: null,
};

function ligne(date: string, montantCents: number, descriptionNormalisee: string): LigneARapprocher {
  return { date, montantCents, descriptionNormalisee };
}

describe("evaluerRapprochement", () => {
  it("R1 — tout concorde : AUTO", () => {
    const e = evaluerRapprochement(ligne("2026-10-12", -1799, "NETFLIX.COM"), [O_NF]);
    expect(e.verdict).toBe("AUTO");
    expect(e.occurrenceAutoId).toBe("occ-nf");
    expect(e.candidats).toHaveLength(1);
    expect(e.candidats[0]?.criteres).toEqual({ description: true, montant: true, date: true });
    expect(e.candidats[0]?.cloche).toEqual([]);
  });

  it("R2 — montant hors tolérance", () => {
    const e = evaluerRapprochement(ligne("2026-10-13", -2499, "NETFLIX.COM"), [O_NF]);
    expect(e.verdict).toBe("A_CONFIRMER");
    expect(e.occurrenceAutoId).toBeNull();
    expect(e.candidats[0]?.cloche).toEqual([`montant de ${formatMontant(2499)} au lieu de ${formatMontant(1799)} attendu`]);
  });

  it("R3 — date hors tolérance", () => {
    const e = evaluerRapprochement(ligne("2026-10-20", -1799, "NETFLIX.COM"), [O_NF]);
    expect(e.verdict).toBe("A_CONFIRMER");
    expect(e.candidats[0]?.cloche).toEqual(["le 20 octobre, échéance attendue le 12 octobre à ± 3 jours"]);
  });

  it("R4 — description différente", () => {
    const e = evaluerRapprochement(ligne("2026-10-12", -1799, "NETFLIX INTL"), [O_NF]);
    expect(e.verdict).toBe("A_CONFIRMER");
    expect(e.candidats[0]?.cloche).toEqual(["description « NETFLIX INTL » sans « NETFLIX.COM »"]);
  });

  it("R5 — bord de la fenêtre de candidat inclus", () => {
    const e = evaluerRapprochement(ligne("2026-10-22", -1799, "NETFLIX.COM"), [O_NF]);
    expect(e.verdict).toBe("A_CONFIRMER");
    expect(e.candidats).toHaveLength(1);
    expect(e.candidats[0]?.cloche).toEqual(["le 22 octobre, échéance attendue le 12 octobre à ± 3 jours"]);
    expect(e.candidats[0]?.criteres).toEqual({ description: true, montant: true, date: false });
  });

  it("R6 — au-delà de la fenêtre", () => {
    const e = evaluerRapprochement(ligne("2026-10-23", -1799, "NETFLIX.COM"), [O_NF]);
    expect(e.verdict).toBe("AUCUN");
    expect(e.candidats).toEqual([]);
  });

  it("R7 — ni description ni montant", () => {
    const e = evaluerRapprochement(ligne("2026-10-12", -5000, "IGA"), [O_NF]);
    expect(e.verdict).toBe("AUCUN");
    expect(e.candidats).toEqual([]);
  });

  it("R8 — deux candidats : jamais de choix automatique", () => {
    const l = ligne("2026-10-12", -1799, "NETFLIX.COM");
    const e = evaluerRapprochement(l, [O_NF2, O_NF]);
    expect(e.verdict).toBe("A_CONFIRMER");
    expect(e.occurrenceAutoId).toBeNull();
    expect(e.candidats.map((c) => c.occurrence.id)).toEqual(["occ-nf", "occ-nf2"]);
    expect(e.candidats.map((c) => c.cloche)).toEqual([[], []]);
    expect(candidatsOccurrence(l, [O_NF2, O_NF])).toEqual(e.candidats);
  });

  it.each([
    [-2299, "AUTO"],
    [-2300, "A_CONFIRMER"],
    [-1299, "AUTO"],
    [-1298, "A_CONFIRMER"],
  ])("R9 — tolérance de montant, ligne à %i", (montant, verdict) => {
    const e = evaluerRapprochement(ligne("2026-10-12", montant, "NETFLIX.COM"), [O_NF]);
    expect(e.verdict).toBe(verdict);
    if (verdict === "A_CONFIRMER") {
      expect(e.candidats[0]?.cloche[0]).toContain("montant de");
    }
  });

  it.each([null, "", "   "])("R10 — motif %j : jamais AUTO", (motif) => {
    const e = evaluerRapprochement(ligne("2026-10-12", -1799, "NETFLIX.COM"), [{ ...O_NF, motifRapprochement: motif }]);
    expect(e.verdict).toBe("A_CONFIRMER");
    expect(e.candidats[0]?.criteres.description).toBe(false);
    expect(e.candidats[0]?.cloche).toEqual(["aucun motif de description pour cette récurrence"]);
  });

  it("R11 — remboursement face à un prélèvement : montants signés", () => {
    const e = evaluerRapprochement(ligne("2026-10-12", 1799, "NETFLIX.COM"), [O_NF]);
    expect(e.verdict).toBe("A_CONFIRMER");
    expect(e.candidats[0]?.cloche).toEqual([`montant de ${formatMontant(1799)} au lieu de ${formatMontant(-1799)} attendu`]);
  });

  it("R12 — tolérance d'un jour au singulier", () => {
    const e = evaluerRapprochement(ligne("2026-10-14", -1799, "NETFLIX.COM"), [{ ...O_NF, toleranceJours: 1 }]);
    expect(e.candidats[0]?.cloche).toEqual(["le 14 octobre, échéance attendue le 12 octobre à ± 1 jour"]);
  });

  it.each([
    [-2300, 2300, 1799],
    [-1298, 1298, 1799],
  ])("R9 — message exact hors tolérance, ligne à %i", (montant, a, b) => {
    const e = evaluerRapprochement(ligne("2026-10-12", montant, "NETFLIX.COM"), [O_NF]);
    expect(e.candidats[0]?.cloche).toEqual([`montant de ${formatMontant(a)} au lieu de ${formatMontant(b)} attendu`]);
  });

  it("date et description en échec avec un montant conforme : ordre date puis description", () => {
    const e = evaluerRapprochement(ligne("2026-10-20", -1799, "AUTRE"), [O_NF]);
    expect(e.verdict).toBe("A_CONFIRMER");
    expect(e.candidats[0]?.cloche).toEqual([
      "le 20 octobre, échéance attendue le 12 octobre à ± 3 jours",
      "description « AUTRE » sans « NETFLIX.COM »",
    ]);
  });

  it("description sensible à la casse", () => {
    const e = evaluerRapprochement(ligne("2026-10-12", -1799, "netflix.com"), [O_NF]);
    expect(e.candidats[0]?.criteres.description).toBe(false);
    expect(e.verdict).toBe("A_CONFIRMER");
  });

  it("candidats triés par écart de jours, puis échéance, puis id", () => {
    const o = (id: string, echeance: string): OccurrenceCandidate => ({ ...O_NF, id, ruleId: `r-${id}`, echeance });
    const e = evaluerRapprochement(ligne("2026-10-12", -1799, "NETFLIX.COM"), [
      o("c", "2026-10-14"),
      o("b", "2026-10-10"),
      o("a", "2026-10-10"),
      o("d", "2026-10-12"),
    ]);
    expect(e.candidats.map((c) => c.occurrence.id)).toEqual(["d", "a", "b", "c"]);
    expect(e.verdict).toBe("A_CONFIRMER");
    expect(e.occurrenceAutoId).toBeNull();
  });

  it("plusieurs critères en échec : ordre montant, date, description", () => {
    const e = evaluerRapprochement(ligne("2026-10-20", -1799, "AUTRE"), [{ ...O_NF, toleranceCents: 0, montantCents: -1800 }]);
    expect(e.candidats).toEqual([]);
    const f = evaluerRapprochement(ligne("2026-10-20", -2999, "NETFLIX.COM"), [O_NF]);
    expect(f.candidats[0]?.cloche).toHaveLength(2);
    expect(f.candidats[0]?.cloche[0]).toContain("montant de");
    expect(f.candidats[0]?.cloche[1]).toContain("échéance attendue");
  });
});
