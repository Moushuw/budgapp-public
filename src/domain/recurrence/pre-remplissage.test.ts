import { describe, expect, it } from "vitest";
import type { DateCivile } from "../dates";
import { detecterRecurrences } from "./detection";
import { G_HYDRO, G_NETFLIX, G_PAIE, groupe, type OptionsGroupe } from "./groupes-reference";
import { regleDepuisSuggestion } from "./pre-remplissage";
import type { GroupeRecurrence, RegleProposee, SuggestionAConfirmer } from "./types";

const suggestionLoyer: SuggestionAConfirmer = {
  accountId: "cheque",
  motif: "LOYER GARAGE",
  cadence: "MENSUEL",
  stabilite: 0,
  montantMedianCents: -20_000,
};

function loyer(dates: readonly DateCivile[], options: OptionsGroupe = {}, montants: readonly number[] | number = -20_000): GroupeRecurrence {
  return groupe("l", "cheque", "LOYER GARAGE", dates, montants, options);
}

function depuisDetection(g: GroupeRecurrence, reference: string): RegleProposee {
  const [s] = detecterRecurrences([g], [], [], reference);
  if (s === undefined) throw new Error("aucune suggestion");
  return regleDepuisSuggestion(s, g);
}

describe("regleDepuisSuggestion", () => {
  it("PR1 — Netflix", () => {
    expect(depuisDetection(G_NETFLIX, "2026-09-13")).toEqual({
      libelle: "Netflix.com",
      accountId: "visa",
      nature: "FIXE",
      montantCents: -1799,
      cadence: "MENSUEL",
      dateAncrage: "2025-03-12",
      subcategoryId: "sc-streaming",
      motifRapprochement: "NETFLIX.COM",
      toleranceCents: 500,
      toleranceJours: 3,
    });
  });

  it("PR2 — Hydro variable : tolérance de 2 écarts-types", () => {
    expect(depuisDetection(G_HYDRO, "2026-06-20")).toEqual({
      libelle: "Hydro-Quebec",
      accountId: "cheque",
      nature: "VARIABLE",
      montantCents: -10_250,
      cadence: "MENSUEL",
      dateAncrage: "2026-01-05",
      subcategoryId: "sc-elec",
      motifRapprochement: "HYDRO-QUEBEC",
      toleranceCents: 1633,
      toleranceJours: 3,
    });
  });

  it("PR3 — paie", () => {
    expect(depuisDetection(G_PAIE, "2026-03-20")).toEqual({
      libelle: "Dépôt paie",
      accountId: "cheque",
      nature: "FIXE",
      montantCents: 240_600,
      cadence: "AUX_2_SEMAINES",
      dateAncrage: "2026-01-02",
      subcategoryId: "sc-paie",
      motifRapprochement: "DEPOT PAIE EMPLOYEUR ABC INC",
      toleranceCents: 500,
      toleranceJours: 2,
    });
  });

  it("PR4 — jour modal 31 borné à la fin du mois", () => {
    const g = loyer(["2025-11-28", "2025-12-31", "2026-01-31", "2026-03-03", "2026-03-31"]);
    expect(regleDepuisSuggestion(suggestionLoyer, g).dateAncrage).toBe("2025-11-30");
  });

  it("PR5 — candidat trop loin : la première date", () => {
    const g = loyer(["2026-01-02", "2026-02-20", "2026-03-20", "2026-04-20"]);
    expect(regleDepuisSuggestion(suggestionLoyer, g).dateAncrage).toBe("2026-01-02");
  });

  it("PR6 — jour modal à égalité, candidat à 4 jours : la première date", () => {
    const g = loyer(["2026-01-14", "2026-02-12", "2026-03-10", "2026-04-12", "2026-05-10"]);
    expect(regleDepuisSuggestion(suggestionLoyer, g).dateAncrage).toBe("2026-01-14");
  });

  it("PR7 — candidat à la première date", () => {
    const g = loyer(["2026-01-10", "2026-02-12", "2026-03-10", "2026-04-12"]);
    expect(regleDepuisSuggestion(suggestionLoyer, g).dateAncrage).toBe("2026-01-10");
  });

  it("PR8 — variable à faible écart : la tolérance par défaut", () => {
    const g = loyer(["2026-01-05", "2026-02-05", "2026-03-05", "2026-04-05"], {}, [-1000, -1200, -1000, -1200]);
    const regle = regleDepuisSuggestion({ ...suggestionLoyer, stabilite: 0.0909, montantMedianCents: -1100 }, g);
    expect(regle.nature).toBe("VARIABLE");
    expect(regle.toleranceCents).toBe(500);
  });

  it("PR9 — bénéficiaire absent d'une ligne, ou différent : casse de titre du motif", () => {
    const dates = ["2026-01-05", "2026-02-05", "2026-03-05", "2026-04-05"];
    const x = { id: "b-x", nom: "Garage X" };
    const mixte: GroupeRecurrence = {
      ...loyer(dates),
      transactions: loyer(dates).transactions.map((t, i) => ({ ...t, beneficiaire: i < 3 ? x : null })),
    };
    expect(regleDepuisSuggestion(suggestionLoyer, mixte).libelle).toBe("Loyer Garage");
    const different: GroupeRecurrence = {
      ...loyer(dates),
      transactions: loyer(dates).transactions.map((t, i) => ({
        ...t,
        beneficiaire: i < 2 ? x : { id: "b-y", nom: "Garage Y" },
      })),
    };
    expect(regleDepuisSuggestion(suggestionLoyer, different).libelle).toBe("Loyer Garage");
  });

  it("PR10 — sous-catégorie : égalité à la plus récente ; toutes nulles → null", () => {
    const dates = ["2026-01-05", "2026-02-05", "2026-03-05", "2026-04-05"];
    expect(regleDepuisSuggestion(suggestionLoyer, loyer(dates, { sousCategories: ["sc-a", "sc-b", "sc-a", "sc-b"] })).subcategoryId).toBe("sc-b");
    expect(regleDepuisSuggestion(suggestionLoyer, loyer(dates, { sousCategories: [null, null, null, null] })).subcategoryId).toBeNull();
  });

  it("PR11 — aux quatre semaines : première date, tolérance 3", () => {
    const g = loyer(["2026-01-07", "2026-02-04", "2026-03-04"]);
    const regle = regleDepuisSuggestion({ ...suggestionLoyer, cadence: "AUX_4_SEMAINES" }, g);
    expect(regle).toMatchObject({ dateAncrage: "2026-01-07", toleranceJours: 3 });
  });

  it("PR12 — ponctuel : première date, tolérance 3", () => {
    const g = loyer(["2026-01-07", "2026-02-04", "2026-03-04"]);
    const regle = regleDepuisSuggestion({ ...suggestionLoyer, cadence: "PONCTUEL" }, g);
    expect(regle).toMatchObject({ dateAncrage: "2026-01-07", toleranceJours: 3 });
  });
});
