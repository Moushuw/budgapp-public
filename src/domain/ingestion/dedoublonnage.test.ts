// docs/lot-m1.md §9 — classerDoublon : les trois couches, du plus fort au
// plus faible, déterministe indépendamment de l'ordre de `existantes`.

import { describe, expect, it } from "vitest";
import { classerDoublon } from "./dedoublonnage";
import type { TransactionExistante } from "./types";

function existante(overrides: Partial<TransactionExistante> & { id: string }): TransactionExistante {
  return {
    accountId: "cpt-1",
    date: "2026-03-10",
    description: "Description",
    descriptionNormalisee: "DESCRIPTION",
    montantCents: -5000,
    empreinte: `empreinte-${overrides.id}`,
    externalId: null,
    virement: null,
    ...overrides,
  };
}

const ENTREE_BASE = { accountId: "cpt-1", date: "2026-03-10", montantCents: -5000, externalId: null as string | null };

describe("classerDoublon — couche 1 (externalId)", () => {
  it("nominal : externalId connu → EXTERNAL_ID_EXISTANT, METTRE_A_JOUR, doublonDe renseigné", () => {
    const existantes = [existante({ id: "e1", externalId: "ext-123" })];
    const verdict = classerDoublon({ ...ENTREE_BASE, externalId: "ext-123" }, "empreinte-autre", "AUTRE", existantes);
    expect(verdict.statut).toBe("EXTERNAL_ID_EXISTANT");
    expect(verdict.actionParDefaut).toBe("METTRE_A_JOUR");
    expect(verdict.doublonDe?.id).toBe("e1");
  });

  it("limite : externalId présent mais inconnu → AUCUN", () => {
    const existantes = [existante({ id: "e1", externalId: "ext-999" })];
    const verdict = classerDoublon({ ...ENTREE_BASE, externalId: "ext-123" }, "empreinte-x", "X", existantes);
    expect(verdict.statut).toBe("AUCUN");
  });

  it("priorité : externalId connu et empreinte différente → toujours EXTERNAL_ID_EXISTANT (mise à jour, pas création)", () => {
    const existantes = [existante({ id: "e1", externalId: "ext-123", empreinte: "empreinte-ancienne" })];
    const verdict = classerDoublon(
      { ...ENTREE_BASE, externalId: "ext-123" },
      "empreinte-toute-nouvelle",
      "NOUVELLE DESCRIPTION",
      existantes,
    );
    expect(verdict.statut).toBe("EXTERNAL_ID_EXISTANT");
    expect(verdict.doublonDe?.id).toBe("e1");
  });

  it("limite : même externalId sur un autre compte → AUCUN", () => {
    const existantes = [existante({ id: "e1", accountId: "cpt-2", externalId: "ext-123" })];
    const verdict = classerDoublon({ ...ENTREE_BASE, accountId: "cpt-1", externalId: "ext-123" }, "empreinte-x", "X", existantes);
    expect(verdict.statut).toBe("AUCUN");
  });
});

describe("classerDoublon — couche 2 (empreinte)", () => {
  it("nominal : empreinte identique → EMPREINTE_EXISTANTE, IGNORER", () => {
    const existantes = [existante({ id: "e1", empreinte: "abc123" })];
    const verdict = classerDoublon(ENTREE_BASE, "abc123", "DESCRIPTION", existantes);
    expect(verdict.statut).toBe("EMPREINTE_EXISTANTE");
    expect(verdict.actionParDefaut).toBe("IGNORER");
    expect(verdict.doublonDe?.id).toBe("e1");
  });

  it("limite : même compte/date/montant, description normalisée différente → empreintes différentes → pas EMPREINTE_EXISTANTE", () => {
    const existantes = [existante({ id: "e1", empreinte: "empreinte-pour-A", descriptionNormalisee: "A" })];
    const verdict = classerDoublon(ENTREE_BASE, "empreinte-pour-B", "B", existantes);
    expect(verdict.statut).not.toBe("EMPREINTE_EXISTANTE");
  });

  it("priorité : empreinte identique et un quasi-candidat présent → EMPREINTE_EXISTANTE", () => {
    const existantes = [
      existante({ id: "e-exacte", empreinte: "abc123", descriptionNormalisee: "DESCRIPTION" }),
      existante({ id: "e-quasi", empreinte: "autre-empreinte", date: "2026-03-11", descriptionNormalisee: "DESCRIPTION" }),
    ];
    const verdict = classerDoublon(ENTREE_BASE, "abc123", "DESCRIPTION", existantes);
    expect(verdict.statut).toBe("EMPREINTE_EXISTANTE");
    expect(verdict.doublonDe?.id).toBe("e-exacte");
  });
});

describe("classerDoublon — couche 3 (quasi-doublon)", () => {
  it("nominal : même montant, même descriptionNormalisee, +3 jours → QUASI_DOUBLON, action IMPORTER", () => {
    const existantes = [existante({ id: "e1", date: "2026-03-13", descriptionNormalisee: "DESCRIPTION" })];
    const verdict = classerDoublon(ENTREE_BASE, "empreinte-nouvelle", "DESCRIPTION", existantes);
    expect(verdict.statut).toBe("QUASI_DOUBLON");
    expect(verdict.actionParDefaut).toBe("IMPORTER");
    expect(verdict.doublonDe?.id).toBe("e1");
  });

  it("limite : +4 jours → AUCUN", () => {
    const existantes = [existante({ id: "e1", date: "2026-03-14", descriptionNormalisee: "DESCRIPTION" })];
    const verdict = classerDoublon(ENTREE_BASE, "empreinte-nouvelle", "DESCRIPTION", existantes);
    expect(verdict.statut).toBe("AUCUN");
  });

  it("limite : -3 jours → QUASI_DOUBLON (symétrie)", () => {
    const existantes = [existante({ id: "e1", date: "2026-03-07", descriptionNormalisee: "DESCRIPTION" })];
    const verdict = classerDoublon(ENTREE_BASE, "empreinte-nouvelle", "DESCRIPTION", existantes);
    expect(verdict.statut).toBe("QUASI_DOUBLON");
  });

  it("limite : montant différent d'un cent → AUCUN", () => {
    const existantes = [existante({ id: "e1", date: "2026-03-11", montantCents: -5001, descriptionNormalisee: "DESCRIPTION" })];
    const verdict = classerDoublon(ENTREE_BASE, "empreinte-nouvelle", "DESCRIPTION", existantes);
    expect(verdict.statut).toBe("AUCUN");
  });

  it("limite : descriptionNormalisee différente → AUCUN", () => {
    const existantes = [existante({ id: "e1", date: "2026-03-11", descriptionNormalisee: "AUTRE" })];
    const verdict = classerDoublon(ENTREE_BASE, "empreinte-nouvelle", "DESCRIPTION", existantes);
    expect(verdict.statut).toBe("AUCUN");
  });

  it("déterminisme : le plus proche en date gagne, indépendamment de l'ordre de la liste", () => {
    const proche = existante({ id: "e-proche", date: "2026-03-09", descriptionNormalisee: "DESCRIPTION" });
    const loin = existante({ id: "e-loin", date: "2026-03-12", descriptionNormalisee: "DESCRIPTION" });

    const verdictOrdre1 = classerDoublon(ENTREE_BASE, "empreinte-nouvelle", "DESCRIPTION", [loin, proche]);
    const verdictOrdre2 = classerDoublon(ENTREE_BASE, "empreinte-nouvelle", "DESCRIPTION", [proche, loin]);

    expect(verdictOrdre1.doublonDe?.id).toBe("e-proche");
    expect(verdictOrdre2.doublonDe?.id).toBe("e-proche");
  });

  it("déterminisme : à distance égale, le plus petit id gagne, indépendamment de l'ordre de la liste", () => {
    // ENTREE_BASE.date = 2026-03-10 ; deux candidats à ±1 jour, distance égale (1).
    const candidatA = existante({ id: "b-candidat", date: "2026-03-09", descriptionNormalisee: "DESCRIPTION" });
    const candidatB = existante({ id: "a-candidat", date: "2026-03-11", descriptionNormalisee: "DESCRIPTION" });

    const verdictOrdre1 = classerDoublon(ENTREE_BASE, "empreinte-nouvelle", "DESCRIPTION", [candidatA, candidatB]);
    const verdictOrdre2 = classerDoublon(ENTREE_BASE, "empreinte-nouvelle", "DESCRIPTION", [candidatB, candidatA]);

    expect(verdictOrdre1.doublonDe?.id).toBe("a-candidat");
    expect(verdictOrdre2.doublonDe?.id).toBe("a-candidat");
  });

  it("limite : existantes vide → AUCUN", () => {
    const verdict = classerDoublon(ENTREE_BASE, "empreinte-nouvelle", "DESCRIPTION", []);
    expect(verdict).toEqual({ statut: "AUCUN", doublonDe: null, actionParDefaut: "IMPORTER" });
  });
});

describe("classerDoublon — VIREMENT_EXISTANT (docs/lot-m2.md §4.5)", () => {
  const COTE = { compteNom: "Chèque" };
  const cote = (id: string, surcharge: Partial<TransactionExistante> = {}): TransactionExistante =>
    existante({ id, description: "Virement depuis Chèque", descriptionNormalisee: "VIREMENT DEPUIS CHEQUE", virement: COTE, ...surcharge });

  it("DV1 — côté de virement, autre description, +3 jours → VIREMENT_EXISTANT, IGNORER, compteNom recopié", () => {
    const verdict = classerDoublon(ENTREE_BASE, "empreinte-nouvelle", "PAIEMENT", [cote("v1", { date: "2026-03-13" })]);
    expect(verdict.statut).toBe("VIREMENT_EXISTANT");
    expect(verdict.actionParDefaut).toBe("IGNORER");
    expect(verdict.doublonDe?.id).toBe("v1");
    expect(verdict.doublonDe?.virement).toEqual(COTE);
  });

  it("DV1 — −3 jours aussi (symétrie)", () => {
    const verdict = classerDoublon(ENTREE_BASE, "e", "PAIEMENT", [cote("v1", { date: "2026-03-07" })]);
    expect(verdict.statut).toBe("VIREMENT_EXISTANT");
  });

  it("DV2 — 4 jours : pas VIREMENT_EXISTANT", () => {
    const verdict = classerDoublon(ENTREE_BASE, "e", "PAIEMENT", [cote("v1", { date: "2026-03-14" })]);
    expect(verdict.statut).toBe("AUCUN");
  });

  it("DV3 — existante non virement, même description : QUASI_DOUBLON comme avant", () => {
    const verdict = classerDoublon(ENTREE_BASE, "e", "DESCRIPTION", [existante({ id: "e1", date: "2026-03-13" })]);
    expect(verdict.statut).toBe("QUASI_DOUBLON");
    expect(verdict.actionParDefaut).toBe("IMPORTER");
  });

  it("DV4 — autre compte ou autre montant : AUCUN", () => {
    expect(classerDoublon(ENTREE_BASE, "e", "P", [cote("v1", { accountId: "cpt-2" })]).statut).toBe("AUCUN");
    expect(classerDoublon(ENTREE_BASE, "e", "P", [cote("v1", { montantCents: -5001 })]).statut).toBe("AUCUN");
    expect(classerDoublon(ENTREE_BASE, "e", "P", [cote("v1", { montantCents: 5000 })]).statut).toBe("AUCUN");
  });

  it("DV5 — empreinte identique sur un côté de virement : EMPREINTE_EXISTANTE (priorité)", () => {
    const verdict = classerDoublon(ENTREE_BASE, "abc", "P", [cote("v1", { empreinte: "abc" })]);
    expect(verdict.statut).toBe("EMPREINTE_EXISTANTE");
  });

  it("DV6 — une existante à la fois quasi-doublon et côté de virement : VIREMENT_EXISTANT", () => {
    const verdict = classerDoublon(ENTREE_BASE, "e", "DESCRIPTION", [
      cote("v1", { descriptionNormalisee: "DESCRIPTION" }),
    ]);
    expect(verdict.statut).toBe("VIREMENT_EXISTANT");
  });

  it("DV7 — deux candidats : le plus proche, puis le plus petit id, quel que soit l'ordre", () => {
    const proche = cote("z-proche", { date: "2026-03-11" });
    const loin = cote("a-loin", { date: "2026-03-13" });
    expect(classerDoublon(ENTREE_BASE, "e", "P", [loin, proche]).doublonDe?.id).toBe("z-proche");
    expect(classerDoublon(ENTREE_BASE, "e", "P", [proche, loin]).doublonDe?.id).toBe("z-proche");

    const b = cote("b", { date: "2026-03-09" });
    const a = cote("a", { date: "2026-03-11" });
    expect(classerDoublon(ENTREE_BASE, "e", "P", [b, a]).doublonDe?.id).toBe("a");
    expect(classerDoublon(ENTREE_BASE, "e", "P", [a, b]).doublonDe?.id).toBe("a");
  });
});
