import { describe, expect, it } from "vitest";
import { defilementCentre, ONGLETS_PRINCIPAUX, ongletActif, ongletTransactionsActif } from "./onglets";

describe("ongletActif", () => {
  it("NAV1 — la racine", () => {
    expect(ongletActif("/", ONGLETS_PRINCIPAUX)).toBe("/");
  });
  it("NAV2 — un onglet", () => {
    expect(ongletActif("/transactions", ONGLETS_PRINCIPAUX)).toBe("/transactions");
  });
  it("NAV3 — une sous-page", () => {
    expect(ongletActif("/transactions/import", ONGLETS_PRINCIPAUX)).toBe("/transactions");
  });
  it("NAV4 — Paramètres", () => {
    expect(ongletActif("/parametres", ONGLETS_PRINCIPAUX)).toBe("/parametres");
  });
  it("NAV5 — un préfixe sans barre oblique ne compte pas", () => {
    expect(ongletActif("/transactionsx", ONGLETS_PRINCIPAUX)).toBeNull();
  });
  it("NAV6 — un chemin inconnu", () => {
    expect(ongletActif("/inconnu", ONGLETS_PRINCIPAUX)).toBeNull();
  });
  it("NAV7 — Budgets n'est jamais l'accueil", () => {
    expect(ongletActif("/budgets", ONGLETS_PRINCIPAUX)).toBe("/budgets");
  });
});

describe("ongletTransactionsActif", () => {
  it("N1 — la consultation", () => {
    expect(ongletTransactionsActif("/transactions")).toBe("/transactions");
  });
  it("N2 — l'import n'est pas la consultation", () => {
    expect(ongletTransactionsActif("/transactions/import")).toBe("/transactions/import");
  });
  it("N3 — les récurrences", () => {
    expect(ongletTransactionsActif("/transactions/recurrences")).toBe("/transactions/recurrences");
  });
  it("N4 — hors des transactions", () => {
    expect(ongletTransactionsActif("/budgets")).toBeNull();
  });
});

describe("defilementCentre", () => {
  const bande = { largeurVisible: 300, largeurContenu: 900 };

  it("DC1 — onglet au début", () => {
    expect(defilementCentre(bande, { gauche: 0, largeur: 80 })).toBe(0);
  });
  it("DC2 — onglet en fin de contenu", () => {
    expect(defilementCentre(bande, { gauche: 820, largeur: 80 })).toBe(600);
  });
  it("DC3 — au milieu, valeur exacte", () => {
    expect(defilementCentre(bande, { gauche: 400, largeur: 100 })).toBe(300);
  });
  it("DC4 — contenu plus petit que la bande", () => {
    expect(defilementCentre({ largeurVisible: 300, largeurContenu: 250 }, { gauche: 150, largeur: 80 })).toBe(0);
  });
  it("DC5 — demi-pixel arrondi à l'entier", () => {
    const valeur = defilementCentre(bande, { gauche: 400, largeur: 101 });
    expect(Number.isInteger(valeur)).toBe(true);
    expect(valeur).toBe(Math.round(400 + 101 / 2 - 150));
  });
  it("DC6 — onglet plus large que la bande : borné", () => {
    const valeur = defilementCentre(bande, { gauche: 500, largeur: 800 });
    expect(valeur).toBeGreaterThanOrEqual(0);
    expect(valeur).toBeLessThanOrEqual(600);
  });
});
