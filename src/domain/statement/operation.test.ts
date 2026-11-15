// docs/lot-m1.md §5.8 — séparation du type d'opération et du marchand.

import { describe, expect, it } from "vitest";
import { separerOperation } from "./operation";
import { DESJARDINS_ACCESD } from "./profils";

const OPERATION = DESJARDINS_ACCESD.operation;

describe("separerOperation — les huit types observés", () => {
  const cas: readonly (readonly [string, string, string, string])[] = [
    ["O1", "Achat /CAFE DEPOT", "Achat", "CAFE DEPOT"],
    ["O2", "Paie /ZORVANE", "Paie", "ZORVANE"],
    ["O3", "Paiement /Hydro-Québec", "Paiement", "Hydro-Québec"],
    ["O4", "Paiement facture - AccèsD Internet /Carte Aurore", "Paiement facture - AccèsD Internet", "Carte Aurore"],
    ["O5", "Virement - AccèsD Internet /à 0987654-EOP", "Virement - AccèsD Internet", "à 0987654-EOP"],
    ["O6", "Virement Interac à /Odile ferland  /", "Virement Interac à", "Odile ferland"],
    ["O7", "Virement-remboursement /à 0123456-PR1", "Virement-remboursement", "à 0123456-PR1"],
    ["O8", "Remboursement automatique /Prêt auto", "Remboursement automatique", "Prêt auto"],
  ];

  it.each(cas)("%s : %s", (_id, entree, type, marchand) => {
    expect(separerOperation(entree, OPERATION)).toEqual({ typeOperation: type, description: marchand });
  });
});

describe("separerOperation — sans séparateur et limites", () => {
  it("O9 : une ligne sans séparateur garde sa description entière", () => {
    expect(separerOperation("Frais fixes d'utilisation", OPERATION)).toEqual({
      typeOperation: null,
      description: "Frais fixes d'utilisation",
    });
  });

  it("O10 : « Paiement. » (condensé Visa) n'est pas séparé", () => {
    expect(separerOperation("Paiement.", OPERATION)).toEqual({ typeOperation: null, description: "Paiement." });
  });

  it("O11 : une ligne Visa n'est pas séparée", () => {
    expect(separerOperation("Pixelia I09310-5550173", OPERATION)).toEqual({
      typeOperation: null,
      description: "Pixelia I09310-5550173",
    });
  });

  it("O12 : une barre oblique sans espace devant n'est pas un séparateur", () => {
    expect(separerOperation("Électronique/Informatique", OPERATION)).toEqual({
      typeOperation: null,
      description: "Électronique/Informatique",
    });
  });

  it("O13 : une barre interne du marchand est gardée", () => {
    expect(separerOperation("Paiement internet de /ZORVANE/juillet", OPERATION)).toEqual({
      typeOperation: "Paiement internet de",
      description: "ZORVANE/juillet",
    });
  });

  it("O14 : seule la première occurrence sépare", () => {
    expect(separerOperation("Achat /FOO /BAR", OPERATION)).toEqual({ typeOperation: "Achat", description: "FOO /BAR" });
  });

  it("O15 : une barre finale collée au marchand est retirée", () => {
    expect(separerOperation("Virement Interac à /Julien Trembla/", OPERATION)).toEqual({
      typeOperation: "Virement Interac à",
      description: "Julien Trembla",
    });
  });

  it("O16 : sans `operation` dans le profil, rien n'est séparé", () => {
    expect(separerOperation("Achat /CAFE DEPOT", undefined)).toEqual({
      typeOperation: null,
      description: "Achat /CAFE DEPOT",
    });
  });

  it("O17 : marchand vide après nettoyage, pas de séparation (OQ2)", () => {
    expect(separerOperation("Achat /", OPERATION)).toEqual({ typeOperation: null, description: "Achat /" });
  });

  it("O18 : marchand réduit à une barre, pas de séparation (OQ2)", () => {
    expect(separerOperation("Virement Interac à / /", OPERATION)).toEqual({
      typeOperation: null,
      description: "Virement Interac à / /",
    });
  });

  it("type vide (séparateur en tête) : pas de séparation, rien ne se perd", () => {
    expect(separerOperation(" /CAFE", OPERATION)).toEqual({ typeOperation: null, description: " /CAFE" });
  });

  it("une seule barre finale est retirée", () => {
    expect(separerOperation("Achat /FOO//", OPERATION)).toEqual({ typeOperation: "Achat", description: "FOO/" });
  });

  it("ne lève jamais sur une chaîne vide", () => {
    expect(separerOperation("", OPERATION)).toEqual({ typeOperation: null, description: "" });
  });
});
