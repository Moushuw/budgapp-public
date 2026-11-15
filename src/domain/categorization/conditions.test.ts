// docs/lot-m1.md §9 — nominal, limites, échec, un it par ligne.

import { describe, expect, it } from "vitest";
import { normaliserDescription } from "../ingestion/normaliser";
import { evaluerCondition, evaluerConditions } from "./conditions";
import type { ChampCondition, ConditionRegle, LigneACategoriser, OperateurCondition } from "./types";

function ligne(partiel: Partial<LigneACategoriser> = {}): LigneACategoriser {
  return {
    description: "IGA VALBRUME",
    descriptionNormalisee: "IGA VALBRUME",
    montantCents: -8500,
    accountId: "cpt-cheque",
    payeeNom: null,
    ...partiel,
  };
}

function condition(
  champ: ChampCondition,
  operateur: OperateurCondition,
  valeur: string,
  valeurFin: string | null = null,
): ConditionRegle {
  return { id: "c-test", champ, operateur, valeur, valeurFin };
}

describe("evaluerCondition — champs texte", () => {
  it("D1 — DESCRIPTION_NORMALISEE CONTIENT « IGA » sur IGA VALBRUME", () => {
    const verdict = evaluerCondition(
      condition("DESCRIPTION_NORMALISEE", "CONTIENT", "IGA"),
      ligne({ descriptionNormalisee: "IGA VALBRUME" }),
    );
    expect(verdict).toEqual({ statut: "VRAI" });
  });

  it("D2 — la même sur METRO LAC-BRUME", () => {
    const verdict = evaluerCondition(
      condition("DESCRIPTION_NORMALISEE", "CONTIENT", "IGA"),
      ligne({ descriptionNormalisee: "METRO LAC-BRUME" }),
    );
    expect(verdict).toEqual({ statut: "FAUX" });
  });

  it("D3 — DESCRIPTION CONTIENT « épicerie » sur « Épicerie du coin » : casse et accents neutralisés", () => {
    const verdict = evaluerCondition(
      condition("DESCRIPTION", "CONTIENT", "épicerie"),
      ligne({ description: "Épicerie du coin" }),
    );
    expect(verdict).toEqual({ statut: "VRAI" });
  });

  it("D4 — DESCRIPTION EGALE « iga » sur IGA", () => {
    const verdict = evaluerCondition(condition("DESCRIPTION", "EGALE", "iga"), ligne({ description: "IGA" }));
    expect(verdict).toEqual({ statut: "VRAI" });
  });

  it("D5 — DESCRIPTION COMMENCE_PAR « IGA » sur SUPER IGA", () => {
    const verdict = evaluerCondition(
      condition("DESCRIPTION", "COMMENCE_PAR", "IGA"),
      ligne({ description: "SUPER IGA" }),
    );
    expect(verdict).toEqual({ statut: "FAUX" });
  });

  it("D6 — DESCRIPTION REGEX « ^IGA\\s » sur IGA VALBRUME", () => {
    const verdict = evaluerCondition(
      condition("DESCRIPTION", "REGEX", "^IGA\\s"),
      ligne({ description: "IGA VALBRUME" }),
    );
    expect(verdict).toEqual({ statut: "VRAI" });
  });

  it("D7 — DESCRIPTION REGEX « (( » : motif invalide", () => {
    const verdict = evaluerCondition(condition("DESCRIPTION", "REGEX", "(("), ligne());
    expect(verdict.statut).toBe("INAPPLICABLE");
    expect(verdict).toMatchObject({ motif: "REGEX_INVALIDE" });
  });

  it("D8 — DESCRIPTION CONTIENT « » (chaîne vide)", () => {
    const verdict = evaluerCondition(condition("DESCRIPTION", "CONTIENT", ""), ligne());
    expect(verdict).toMatchObject({ statut: "INAPPLICABLE", motif: "VALEUR_ILLISIBLE" });
  });

  it("D9 — DESCRIPTION CONTIENT « ␣␣␣ » (espaces seuls)", () => {
    const verdict = evaluerCondition(condition("DESCRIPTION", "CONTIENT", "   "), ligne());
    expect(verdict).toMatchObject({ statut: "INAPPLICABLE", motif: "VALEUR_ILLISIBLE" });
  });

  it("D10 — DESCRIPTION SUP « 10 » : opérateur incompatible", () => {
    const verdict = evaluerCondition(condition("DESCRIPTION", "SUP", "10"), ligne());
    expect(verdict).toMatchObject({ statut: "INAPPLICABLE", motif: "OPERATEUR_INCOMPATIBLE" });
  });

  it("D11 — BENEFICIAIRE CONTIENT « AMAZON » avec payeeNom null : FAUX, jamais INAPPLICABLE", () => {
    const verdict = evaluerCondition(
      condition("BENEFICIAIRE", "CONTIENT", "AMAZON"),
      ligne({ payeeNom: null }),
    );
    expect(verdict).toEqual({ statut: "FAUX" });
  });

  it("D12 — BENEFICIAIRE EGALE « Amazon » avec payeeNom « AMAZON.COM »", () => {
    const verdict = evaluerCondition(
      condition("BENEFICIAIRE", "EGALE", "Amazon"),
      ligne({ payeeNom: "AMAZON.COM" }),
    );
    expect(verdict).toEqual({ statut: "FAUX" });
  });
});

describe("evaluerCondition — opérateur MOT_ENTIER (A3)", () => {
  it("K1 — « PAIE » ne reconnaît pas « Paiement. »", () => {
    const verdict = evaluerCondition(
      condition("DESCRIPTION_NORMALISEE", "MOT_ENTIER", "PAIE"),
      ligne({ descriptionNormalisee: normaliserDescription("Paiement.") }),
    );
    expect(verdict).toEqual({ statut: "FAUX" });
  });

  it("K2 — « PAIE » reconnaît « DEPOT PAIE EMPLOYEUR ABC INC »", () => {
    const verdict = evaluerCondition(
      condition("DESCRIPTION_NORMALISEE", "MOT_ENTIER", "PAIE"),
      ligne({ descriptionNormalisee: normaliserDescription("DEPOT PAIE EMPLOYEUR ABC INC") }),
    );
    expect(verdict).toEqual({ statut: "VRAI" });
  });

  it("K3 — DESCRIPTION, casse et accents ignorés", () => {
    const verdict = evaluerCondition(
      condition("DESCRIPTION", "MOT_ENTIER", "paie"),
      ligne({ description: "Dépôt Paie" }),
    );
    expect(verdict).toEqual({ statut: "VRAI" });
  });

  it("K4 — BENEFICIAIRE sans bénéficiaire résolu : faux", () => {
    const verdict = evaluerCondition(condition("BENEFICIAIRE", "MOT_ENTIER", "IGA"), ligne({ payeeNom: null }));
    expect(verdict).toEqual({ statut: "FAUX" });
  });

  it("K5 — incompatible avec MONTANT", () => {
    const verdict = evaluerCondition(condition("MONTANT", "MOT_ENTIER", "100"), ligne());
    expect(verdict).toMatchObject({ statut: "INAPPLICABLE", motif: "OPERATEUR_INCOMPATIBLE" });
  });

  it("K6 — valeur vide : valeur illisible", () => {
    const verdict = evaluerCondition(condition("DESCRIPTION", "MOT_ENTIER", "  "), ligne());
    expect(verdict).toMatchObject({ statut: "INAPPLICABLE", motif: "VALEUR_ILLISIBLE" });
  });

  it("K7 — contraste : CONTIENT garde son sens et reconnaît « Paiement. »", () => {
    const verdict = evaluerCondition(
      condition("DESCRIPTION_NORMALISEE", "CONTIENT", "PAIE"),
      ligne({ descriptionNormalisee: normaliserDescription("Paiement.") }),
    );
    expect(verdict).toEqual({ statut: "VRAI" });
  });

  it("BENEFICIAIRE : le mot entier se cherche dans le nom du bénéficiaire résolu", () => {
    expect(
      evaluerCondition(condition("BENEFICIAIRE", "MOT_ENTIER", "IGA"), ligne({ payeeNom: "IGA Extra" })),
    ).toEqual({ statut: "VRAI" });
    expect(
      evaluerCondition(condition("BENEFICIAIRE", "MOT_ENTIER", "IGA"), ligne({ payeeNom: "Vigaro" })),
    ).toEqual({ statut: "FAUX" });
  });
});

describe("evaluerCondition — champ MONTANT", () => {
  it("D13 — MONTANT INF « -5000 » sur -21000", () => {
    expect(evaluerCondition(condition("MONTANT", "INF", "-5000"), ligne({ montantCents: -21000 }))).toEqual({
      statut: "VRAI",
    });
  });

  it("D14 — MONTANT INF « -5000 » sur -2100", () => {
    expect(evaluerCondition(condition("MONTANT", "INF", "-5000"), ligne({ montantCents: -2100 }))).toEqual({
      statut: "FAUX",
    });
  });

  it("D15 — MONTANT INF « -5000 » sur -5000 : borne stricte", () => {
    expect(evaluerCondition(condition("MONTANT", "INF", "-5000"), ligne({ montantCents: -5000 }))).toEqual({
      statut: "FAUX",
    });
  });

  it("D16 — MONTANT INF_EGAL « -5000 » sur -5000", () => {
    expect(evaluerCondition(condition("MONTANT", "INF_EGAL", "-5000"), ligne({ montantCents: -5000 }))).toEqual({
      statut: "VRAI",
    });
  });

  it("D17 — MONTANT EGALE « -5000 » sur -5000", () => {
    expect(evaluerCondition(condition("MONTANT", "EGALE", "-5000"), ligne({ montantCents: -5000 }))).toEqual({
      statut: "VRAI",
    });
  });

  it("D18 — MONTANT SUP « 0 » sur 44830", () => {
    expect(evaluerCondition(condition("MONTANT", "SUP", "0"), ligne({ montantCents: 44830 }))).toEqual({
      statut: "VRAI",
    });
  });

  it("D19 — MONTANT INF « -50,00 » (des dollars) : le moteur ne lit que des cents", () => {
    const verdict = evaluerCondition(condition("MONTANT", "INF", "-50,00"), ligne({ montantCents: -21000 }));
    expect(verdict).toMatchObject({ statut: "INAPPLICABLE", motif: "VALEUR_ILLISIBLE" });
  });

  it("D20 — MONTANT ENTRE « -10000 »/« -5000 » sur -7000", () => {
    expect(
      evaluerCondition(condition("MONTANT", "ENTRE", "-10000", "-5000"), ligne({ montantCents: -7000 })),
    ).toEqual({ statut: "VRAI" });
  });

  it("D21 — bornes incluses : -10000 puis -5000", () => {
    expect(
      evaluerCondition(condition("MONTANT", "ENTRE", "-10000", "-5000"), ligne({ montantCents: -10000 })),
    ).toEqual({ statut: "VRAI" });
    expect(
      evaluerCondition(condition("MONTANT", "ENTRE", "-10000", "-5000"), ligne({ montantCents: -5000 })),
    ).toEqual({ statut: "VRAI" });
  });

  it("D22 — MONTANT ENTRE « -10000 » avec valeurFin null", () => {
    const verdict = evaluerCondition(condition("MONTANT", "ENTRE", "-10000", null), ligne());
    expect(verdict).toMatchObject({ statut: "INAPPLICABLE", motif: "VALEUR_ILLISIBLE" });
  });

  it("D23 — MONTANT ENTRE bornes inversées : aucune permutation silencieuse", () => {
    const verdict = evaluerCondition(condition("MONTANT", "ENTRE", "-5000", "-10000"), ligne());
    expect(verdict).toMatchObject({ statut: "INAPPLICABLE", motif: "VALEUR_ILLISIBLE" });
  });
});

describe("evaluerCondition — champ COMPTE", () => {
  it("D24 — COMPTE EGALE « cpt-visa » sur accountId cpt-visa", () => {
    expect(
      evaluerCondition(condition("COMPTE", "EGALE", "cpt-visa"), ligne({ accountId: "cpt-visa" })),
    ).toEqual({ statut: "VRAI" });
  });

  it("D25 — COMPTE EGALE « CPT-VISA » sur accountId cpt-visa : comparaison exacte", () => {
    expect(
      evaluerCondition(condition("COMPTE", "EGALE", "CPT-VISA"), ligne({ accountId: "cpt-visa" })),
    ).toEqual({ statut: "FAUX" });
  });

  it("D26 — COMPTE DANS « cpt-visa|cpt-cheque » sur cpt-cheque", () => {
    expect(
      evaluerCondition(condition("COMPTE", "DANS", "cpt-visa|cpt-cheque"), ligne({ accountId: "cpt-cheque" })),
    ).toEqual({ statut: "VRAI" });
  });

  it("D27 — COMPTE DANS «  |  » : liste vide après nettoyage", () => {
    const verdict = evaluerCondition(condition("COMPTE", "DANS", " | "), ligne());
    expect(verdict).toMatchObject({ statut: "INAPPLICABLE", motif: "VALEUR_ILLISIBLE" });
  });
});

describe("evaluerCondition — champ SENS", () => {
  it("D28 — SENS EGALE SORTIE sur -100", () => {
    expect(evaluerCondition(condition("SENS", "EGALE", "SORTIE"), ligne({ montantCents: -100 }))).toEqual({
      statut: "VRAI",
    });
  });

  it("D29 — SENS EGALE ENTREE sur -100", () => {
    expect(evaluerCondition(condition("SENS", "EGALE", "ENTREE"), ligne({ montantCents: -100 }))).toEqual({
      statut: "FAUX",
    });
  });

  it("D30 — SENS EGALE SORTIE et SENS EGALE ENTREE sur un montant nul : les deux sont fausses", () => {
    expect(evaluerCondition(condition("SENS", "EGALE", "SORTIE"), ligne({ montantCents: 0 }))).toEqual({
      statut: "FAUX",
    });
    expect(evaluerCondition(condition("SENS", "EGALE", "ENTREE"), ligne({ montantCents: 0 }))).toEqual({
      statut: "FAUX",
    });
  });

  it("D31 — SENS EGALE « DEPENSE » : valeur inconnue", () => {
    const verdict = evaluerCondition(condition("SENS", "EGALE", "DEPENSE"), ligne());
    expect(verdict).toMatchObject({ statut: "INAPPLICABLE", motif: "VALEUR_ILLISIBLE" });
  });
});

describe("evaluerConditions — le ET", () => {
  it("D32 — liste vide : AUCUNE_CONDITION", () => {
    const verdict = evaluerConditions([], ligne());
    expect(verdict).toMatchObject({ statut: "INAPPLICABLE", motif: "AUCUNE_CONDITION" });
  });

  it("D33 — deux conditions vraies en ET", () => {
    const verdict = evaluerConditions(
      [condition("DESCRIPTION_NORMALISEE", "CONTIENT", "IGA"), condition("MONTANT", "INF", "0")],
      ligne({ descriptionNormalisee: "IGA VALBRUME", montantCents: -8500 }),
    );
    expect(verdict).toEqual({ statut: "VRAI" });
  });

  it("D34 — deux conditions dont une fausse", () => {
    const verdict = evaluerConditions(
      [condition("DESCRIPTION_NORMALISEE", "CONTIENT", "IGA"), condition("MONTANT", "SUP", "0")],
      ligne({ descriptionNormalisee: "IGA VALBRUME", montantCents: -8500 }),
    );
    expect(verdict).toEqual({ statut: "FAUX" });
  });

  it("D35 — une condition vraie et une inapplicable : l'inapplicable prime", () => {
    const verdict = evaluerConditions(
      [condition("DESCRIPTION_NORMALISEE", "CONTIENT", "IGA"), condition("DESCRIPTION", "SUP", "10")],
      ligne({ descriptionNormalisee: "IGA VALBRUME" }),
    );
    expect(verdict.statut).toBe("INAPPLICABLE");
  });

  it("D36 — une condition fausse et une inapplicable : l'inapplicable prime aussi sur le faux", () => {
    const verdict = evaluerConditions(
      [condition("DESCRIPTION_NORMALISEE", "CONTIENT", "METRO"), condition("DESCRIPTION", "SUP", "10")],
      ligne({ descriptionNormalisee: "IGA VALBRUME" }),
    );
    expect(verdict.statut).toBe("INAPPLICABLE");
  });

  it("D37 — evaluerCondition ne lève jamais, même sur une regex catastrophique et une valeur absurde", () => {
    expect(() =>
      evaluerCondition(condition("DESCRIPTION", "REGEX", "(a+)+$"), ligne({ description: "a".repeat(40) })),
    ).not.toThrow();
    expect(() => evaluerCondition(condition("MONTANT", "ENTRE", "abc", "def"), ligne())).not.toThrow();
    expect(() => evaluerCondition(condition("SENS", "EGALE", ""), ligne())).not.toThrow();
  });
});
