import { describe, expect, it } from "vitest";
import { ecartsMontantsOccurrences, signesOpposes, type ControleMontantsAVenir, type OccurrenceAControler } from "./coherence-montants";

function occ(partiel: Partial<OccurrenceAControler> = {}): OccurrenceAControler {
  return {
    id: "o1",
    echeance: "2026-10-12",
    montantCents: -1799,
    etat: "PREVUE",
    transactionId: null,
    montantRegleCents: -1799,
    ...partiel,
  };
}

const C: ControleMontantsAVenir = { aujourdhui: "2026-10-09", montantsFixesALaMain: new Set() };

describe("ecartsMontantsOccurrences", () => {
  it("CM1 — série valide", () => {
    const liste = [
      occ({ id: "a", echeance: "2026-09-12", etat: "REALISEE", transactionId: "t1", montantCents: -1799 }),
      occ({ id: "b" }),
      occ({ id: "c", etat: "IGNOREE" }),
    ];
    expect(ecartsMontantsOccurrences(liste, C)).toEqual([]);
  });

  it("CM2 a) — signe opposé sur une ouverte à venir : SIGNE puis MONTANT_A_VENIR", () => {
    expect(ecartsMontantsOccurrences([occ({ id: "x", montantCents: 1799 })], C)).toEqual([
      { nature: "SIGNE", occurrenceId: "x", message: "montant 1799 de signe contraire à la règle (-1799)" },
      {
        nature: "MONTANT_A_VENIR",
        occurrenceId: "x",
        message: "échéance ouverte à venir 2026-10-12 à 1799, règle à -1799",
      },
    ]);
  });

  it("CM2 b) — liée passée de signe opposé", () => {
    const ecarts = ecartsMontantsOccurrences(
      [occ({ id: "y", echeance: "2026-08-12", etat: "REALISEE", transactionId: "t", montantCents: 1799 })],
      C,
    );
    expect(ecarts).toHaveLength(1);
    expect(ecarts[0]).toMatchObject({ nature: "SIGNE", occurrenceId: "y" });
  });

  it("CM2 c) — règle positive, occurrence négative passée", () => {
    expect(
      ecartsMontantsOccurrences(
        [occ({ id: "z", montantCents: -240600, echeance: "2026-01-01", montantRegleCents: 240600 })],
        C,
      ),
    ).toEqual([
      { nature: "SIGNE", occurrenceId: "z", message: "montant -240600 de signe contraire à la règle (240600)" },
    ]);
  });

  const h = occ({ id: "h", echeance: "2026-10-05", montantCents: -9800, montantRegleCents: -10500 });
  const controleH: ControleMontantsAVenir = { aujourdhui: "2026-10-01", montantsFixesALaMain: new Set() };

  it("CM3 — montant différent non modifié", () => {
    expect(ecartsMontantsOccurrences([h], controleH)).toEqual([
      {
        nature: "MONTANT_A_VENIR",
        occurrenceId: "h",
        message: "échéance ouverte à venir 2026-10-05 à -9800, règle à -10500",
      },
    ]);
  });

  it("CM4 — montant fixé à la main toléré, jamais le signe", () => {
    const exception = { ...controleH, montantsFixesALaMain: new Set(["h"]) };
    expect(ecartsMontantsOccurrences([h], exception)).toEqual([]);
    const ecarts = ecartsMontantsOccurrences([{ ...h, montantCents: 9800 }], exception);
    expect(ecarts).toHaveLength(1);
    expect(ecarts[0]?.nature).toBe("SIGNE");
  });

  it("CM5 — bornes d'« à venir »", () => {
    const base = { montantCents: -9800, montantRegleCents: -10500 };
    expect(ecartsMontantsOccurrences([occ({ ...base, echeance: "2026-10-09" })], C).map((e) => e.nature)).toEqual([
      "MONTANT_A_VENIR",
    ]);
    expect(ecartsMontantsOccurrences([occ({ ...base, echeance: "2026-10-08" })], C)).toEqual([]);
    expect(
      ecartsMontantsOccurrences([occ({ ...base, echeance: "2026-10-12", etat: "MANQUEE" })], C).map((e) => e.nature),
    ).toEqual(["MONTANT_A_VENIR"]);
  });

  it("CM6 — non ouvertes", () => {
    const base = { montantCents: -9800, montantRegleCents: -10500 };
    expect(ecartsMontantsOccurrences([occ({ ...base, etat: "IGNOREE" })], C)).toEqual([]);
    expect(
      ecartsMontantsOccurrences([occ({ ...base, etat: "REALISEE_MONTANT_DIFFERENT", transactionId: "t" })], C),
    ).toEqual([]);
  });

  it("CM7 — contrôle absent", () => {
    expect(ecartsMontantsOccurrences([h], null)).toEqual([]);
    const ecarts = ecartsMontantsOccurrences([occ({ id: "x", montantCents: 1799 })], null);
    expect(ecarts).toHaveLength(1);
    expect(ecarts[0]?.nature).toBe("SIGNE");
  });

  it("CM8 — règle sans montant, règle ou occurrence à zéro", () => {
    expect(ecartsMontantsOccurrences([occ({ montantCents: 500, montantRegleCents: null })], C)).toEqual([]);
    expect(
      ecartsMontantsOccurrences([occ({ montantCents: -5, montantRegleCents: 0 })], C).map((e) => e.nature),
    ).toEqual(["MONTANT_A_VENIR"]);
    expect(
      ecartsMontantsOccurrences([occ({ montantCents: 0, montantRegleCents: -5 })], C).map((e) => e.nature),
    ).toEqual(["MONTANT_A_VENIR"]);
  });
});

describe("signesOpposes (CM9)", () => {
  it.each([
    [-1, 1],
    [1, -1],
  ])("(%i, %i) → true", (a, b) => {
    expect(signesOpposes(a, b)).toBe(true);
  });

  it.each([
    [-1, -1],
    [1, 1],
    [0, -1],
    [1, 0],
    [0, 0],
  ])("(%i, %i) → false", (a, b) => {
    expect(signesOpposes(a, b)).toBe(false);
  });
});
