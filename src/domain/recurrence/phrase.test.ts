import { describe, expect, it } from "vitest";
import { detecterRecurrences } from "./detection";
import { G_BELAIR, G_CAFE, G_HYDRO, G_NETFLIX, G_PAIE } from "./groupes-reference";
import { formatMontant } from "../money";
import { libelleSuggestion, phraseSuggestion } from "./phrase";
import type { SuggestionAPhraser, SuggestionDetectee } from "./types";

function detectee(groupe: Parameters<typeof detecterRecurrences>[0][number], reference: string): SuggestionDetectee {
  const [s] = detecterRecurrences([groupe], [], [], reference);
  if (s === undefined) throw new Error("aucune suggestion");
  return s;
}

describe("phraseSuggestion", () => {
  it("PH1 — Netflix", () => {
    expect(phraseSuggestion(detectee(G_NETFLIX, "2026-09-13"))).toBe(
      `Netflix.com — ${formatMontant(1799)}, tous les mois vers le 12. 19 occurrences depuis mars 2025.`,
    );
  });

  it("PH2 — Hydro, variable", () => {
    expect(phraseSuggestion(detectee(G_HYDRO, "2026-06-20"))).toBe(
      `Hydro-Quebec — environ ${formatMontant(10_250)}, tous les mois vers le 5. 6 occurrences depuis janvier 2026.`,
    );
  });

  it("PH3 — paie reçue", () => {
    expect(phraseSuggestion(detectee(G_PAIE, "2026-03-20"))).toBe(
      `Dépôt paie — ${formatMontant(240_600)} reçu toutes les deux semaines le vendredi. 6 occurrences depuis janvier 2026.`,
    );
  });

  it("PH4 — café hebdomadaire", () => {
    expect(phraseSuggestion(detectee(G_CAFE, "2026-03-31"))).toBe(
      `Cafe Depot — ${formatMontant(2500)}, toutes les semaines le lundi. 5 occurrences depuis mars 2026.`,
    );
  });

  it("PH5 — variable reçue, jour 1er", () => {
    const s: SuggestionAPhraser = {
      libelle: "Ristourne",
      montantMedianCents: 5000,
      nature: "VARIABLE",
      cadence: "MENSUEL",
      nbOccurrences: 3,
      dates: ["2026-01-01", "2026-02-01", "2026-03-02"],
    };
    expect(phraseSuggestion(s)).toBe(
      `Ristourne — environ ${formatMontant(5000)} reçu tous les mois vers le 1er. 3 occurrences depuis janvier 2026.`,
    );
  });

  it("PH6 — jour modal à égalité : le plus petit", () => {
    const s: SuggestionAPhraser = {
      libelle: "Abonnement",
      montantMedianCents: -1000,
      nature: "FIXE",
      cadence: "MENSUEL",
      nbOccurrences: 4,
      dates: ["2026-01-10", "2026-02-12", "2026-03-10", "2026-04-12"],
    };
    expect(phraseSuggestion(s)).toBe(
      `Abonnement — ${formatMontant(1000)}, tous les mois vers le 10. 4 occurrences depuis janvier 2026.`,
    );
  });

  it("PH7 — jour de la semaine à égalité : lundi d'abord", () => {
    const s: SuggestionAPhraser = {
      libelle: "Cours",
      montantMedianCents: -1500,
      nature: "FIXE",
      cadence: "HEBDO",
      nbOccurrences: 4,
      dates: ["2026-03-02", "2026-03-10", "2026-03-16", "2026-03-24"],
    };
    expect(phraseSuggestion(s)).toBe(
      `Cours — ${formatMontant(1500)}, toutes les semaines le lundi. 4 occurrences depuis mars 2026.`,
    );
  });

  it("PH8 — deux fois par mois : pas de jour", () => {
    const s: SuggestionAPhraser = {
      libelle: "Loyer",
      montantMedianCents: -50_000,
      nature: "FIXE",
      cadence: "DEUX_FOIS_PAR_MOIS",
      nbOccurrences: 4,
      dates: ["2026-01-01", "2026-01-16", "2026-02-01", "2026-02-16"],
    };
    expect(phraseSuggestion(s)).toBe(
      `Loyer — ${formatMontant(50_000)}, deux fois par mois. 4 occurrences depuis janvier 2026.`,
    );
  });

  it("PH9 — assurance annuelle", () => {
    expect(phraseSuggestion(detectee(G_BELAIR, "2026-09-13"))).toBe(
      `Belair Assurance — ${formatMontant(43_000)}, tous les ans vers le 15. 3 occurrences depuis avril 2024.`,
    );
  });

  it("la première date est la plus petite, même reçue en désordre", () => {
    const s: SuggestionAPhraser = {
      libelle: "Désordre",
      montantMedianCents: -1000,
      nature: "FIXE",
      cadence: "MENSUEL",
      nbOccurrences: 3,
      dates: ["2026-03-10", "2026-01-10", "2026-02-10"],
    };
    expect(phraseSuggestion(s)).toBe(`Désordre — ${formatMontant(1000)}, tous les mois vers le 10. 3 occurrences depuis janvier 2026.`);
  });

  it("singulier à une occurrence ; lève sans date", () => {
    const base: SuggestionAPhraser = {
      libelle: "Unique",
      montantMedianCents: -1000,
      nature: "FIXE",
      cadence: "PONCTUEL",
      nbOccurrences: 1,
      dates: ["2026-01-10"],
    };
    expect(phraseSuggestion(base)).toBe(`Unique — ${formatMontant(1000)}, une seule fois. 1 occurrence depuis janvier 2026.`);
    expect(() => phraseSuggestion({ ...base, dates: [] })).toThrow();
  });
});

describe("libelleSuggestion", () => {
  it("bénéficiaire commun : son nom ; sinon la casse de titre du motif", () => {
    const x = { id: "b-x", nom: "Garage X" };
    expect(libelleSuggestion("LOYER GARAGE", [{ beneficiaire: x }, { beneficiaire: x }])).toBe("Garage X");
    expect(libelleSuggestion("LOYER GARAGE", [{ beneficiaire: x }, { beneficiaire: null }])).toBe("Loyer Garage");
    expect(libelleSuggestion("LOYER GARAGE", [{ beneficiaire: x }, { beneficiaire: { id: "b-y", nom: "Garage Y" } }])).toBe(
      "Loyer Garage",
    );
    expect(libelleSuggestion("LOYER GARAGE", [])).toBe("Loyer Garage");
  });
});
