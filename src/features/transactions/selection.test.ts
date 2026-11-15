import { describe, expect, it } from "vitest";
import { FILTRES_VIDES } from "@/domain/consultation";
import type { RequeteTransactions } from "@/lib/query-keys";
import {
  basculerAffichees,
  basculerLigne,
  estCochee,
  nombreSelectionne,
  SELECTION_VIDE,
  toutesAfficheesCochees,
  versSelectionTransactions,
  type EtatSelection,
} from "./selection";

const REQUETE: RequeteTransactions = {
  filtres: FILTRES_VIDES,
  periode: { type: "TOUT", mois: "2026-09" },
  tri: { champ: "DATE", ordre: "DESC" },
};

function ids(...valeurs: string[]): EtatSelection {
  return { mode: "IDS", ids: new Set(valeurs) };
}

describe("basculerLigne", () => {
  it("AUCUNE → IDS ; retirer la dernière → AUCUNE", () => {
    const une = basculerLigne(SELECTION_VIDE, "a");
    expect(une).toEqual(ids("a"));
    expect(basculerLigne(une, "a")).toEqual(SELECTION_VIDE);
  });

  it("ajoute et retire dans IDS", () => {
    expect(basculerLigne(ids("a"), "b")).toEqual(ids("a", "b"));
    expect(basculerLigne(ids("a", "b"), "a")).toEqual(ids("b"));
  });

  it("FILTRE : inchangé", () => {
    const filtre: EtatSelection = { mode: "FILTRE" };
    expect(basculerLigne(filtre, "a")).toBe(filtre);
  });

  it("ne mute pas l'état reçu", () => {
    const avant = ids("a");
    basculerLigne(avant, "b");
    expect(avant).toEqual(ids("a"));
  });
});

describe("basculerAffichees", () => {
  it("coche l'union des cochées et des affichées", () => {
    expect(basculerAffichees(ids("x"), ["a", "b"])).toEqual(ids("x", "a", "b"));
    expect(basculerAffichees(SELECTION_VIDE, ["a", "b"])).toEqual(ids("a", "b"));
  });

  it("deux fois de suite → AUCUNE", () => {
    const une = basculerAffichees(SELECTION_VIDE, ["a", "b"]);
    expect(basculerAffichees(une, ["a", "b"])).toEqual(SELECTION_VIDE);
  });

  it("FILTRE → AUCUNE", () => {
    expect(basculerAffichees({ mode: "FILTRE" }, ["a"])).toEqual(SELECTION_VIDE);
  });
});

describe("toutesAfficheesCochees, estCochee, nombreSelectionne", () => {
  it("FILTRE : tout est coché, le total fait foi", () => {
    const filtre: EtatSelection = { mode: "FILTRE" };
    expect(toutesAfficheesCochees(filtre, ["a"])).toBe(true);
    expect(estCochee(filtre, "n'importe quoi")).toBe(true);
    expect(nombreSelectionne(filtre, 214)).toBe(214);
    expect(nombreSelectionne(filtre, null)).toBe(0);
  });

  it("une liste vide n'est jamais « toute cochée »", () => {
    expect(toutesAfficheesCochees(ids("a"), [])).toBe(false);
    expect(toutesAfficheesCochees(SELECTION_VIDE, [])).toBe(false);
  });

  it("compte les ids", () => {
    expect(nombreSelectionne(SELECTION_VIDE, 10)).toBe(0);
    expect(nombreSelectionne(ids("a", "b"), 10)).toBe(2);
    expect(estCochee(ids("a"), "a")).toBe(true);
    expect(estCochee(ids("a"), "b")).toBe(false);
    expect(estCochee(SELECTION_VIDE, "a")).toBe(false);
  });
});

describe("versSelectionTransactions", () => {
  it("les trois modes", () => {
    expect(versSelectionTransactions(SELECTION_VIDE, REQUETE)).toBeNull();
    expect(versSelectionTransactions(ids("a", "b"), REQUETE)).toEqual({ type: "IDS", ids: ["a", "b"] });
    expect(versSelectionTransactions({ mode: "FILTRE" }, REQUETE)).toEqual({
      type: "FILTRE",
      filtres: FILTRES_VIDES,
      periode: REQUETE.periode,
    });
  });
});
