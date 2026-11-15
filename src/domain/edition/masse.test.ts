import { describe, expect, it } from "vitest";
import { apercuDepuisPartition, compteRenduDepuisPartition, partitionnerMasse } from "./masse";
import { IGNOREES_VIDES, type CompteIgnorees, type GesteMasse, type LigneMasse, type PartitionMasse } from "./types";

function ligneMasse(id: string, partiel: Partial<LigneMasse> = {}): LigneMasse {
  return {
    id,
    source: "COPIER_COLLER",
    parentId: null,
    estVentilee: false,
    transferTransactionId: null,
    estLiee: false,
    filleLiee: false,
    porteCotisation: false,
    montantCents: 1000,
    contrepartie: { etat: "AUCUNE" },
    subcategoryId: null,
    payeeId: null,
    tagIds: [],
    aRevoir: false,
    exclureDuBudget: false,
    exclureDesRapports: false,
    nbLignesVentilation: 0,
    ...partiel,
  };
}

function somme(i: CompteIgnorees): number {
  return Object.values(i).reduce((a, b) => a + b, 0);
}

function exact(ids: readonly string[], p: PartitionMasse): void {
  expect(p.aEcrire.length + p.inchangees + somme(p.ignorees)).toBe(ids.length);
}

describe("partitionnerMasse", () => {
  it("SOUS_CATEGORIE : écrites, inchangées et ignorées par raison", () => {
    const geste: GesteMasse = { type: "SOUS_CATEGORIE", subcategoryId: "X" };
    const lignes = [
      ligneMasse("K1"),
      ligneMasse("K2"),
      ligneMasse("K3", { subcategoryId: "X" }),
      ligneMasse("V", { transferTransactionId: "v" }),
      ligneMasse("P", { estVentilee: true, nbLignesVentilation: 2 }),
      ligneMasse("F", { parentId: "P" }),
    ];
    const ids = ["K1", "K2", "K3", "V", "P", "F", "Z"];
    const p = partitionnerMasse(ids, lignes, geste);
    expect(p.aEcrire).toEqual(["K1", "K2"]);
    expect(p.inchangees).toBe(1);
    expect(p.ignorees).toEqual({ VIREMENT: 1, VENTILEE: 1, LIGNE_FILLE: 1, INTROUVABLE: 1, LIEE: 0, CONTREPARTIE_LIEE: 0 });
    exact(ids, p);
  });

  it("suit l'ordre des identifiants demandés", () => {
    const lignes = [ligneMasse("K2"), ligneMasse("K1")];
    const p = partitionnerMasse(["K1", "K2"], lignes, { type: "A_REVOIR", valeur: true });
    expect(p.aEcrire).toEqual(["K1", "K2"]);
  });

  it("BENEFICIAIRE : un virement et une ventilée sont éligibles", () => {
    const lignes = [
      ligneMasse("K1", { payeeId: "Y" }),
      ligneMasse("V", { transferTransactionId: "v" }),
      ligneMasse("P", { estVentilee: true }),
    ];
    const ids = ["K1", "V", "P"];
    const p = partitionnerMasse(ids, lignes, { type: "BENEFICIAIRE", payeeId: "Y" });
    expect(p.aEcrire).toEqual(["V", "P"]);
    expect(p.inchangees).toBe(1);
    expect(p.ignorees).toEqual(IGNOREES_VIDES);
    exact(ids, p);
  });

  it("ETIQUETTES : ajouter a, retirer b", () => {
    const lignes = [
      ligneMasse("A", { tagIds: ["a"] }),
      ligneMasse("AB", { tagIds: ["a", "b"] }),
      ligneMasse("VIDE"),
      ligneMasse("F", { parentId: "P" }),
    ];
    const ids = ["A", "AB", "VIDE", "F"];
    const p = partitionnerMasse(ids, lignes, { type: "ETIQUETTES", ajouter: ["a"], retirer: ["b"] });
    expect(p.aEcrire).toEqual(["AB", "VIDE"]);
    expect(p.inchangees).toBe(1);
    expect(p.ignorees.LIGNE_FILLE).toBe(1);
    exact(ids, p);
  });

  it.each([
    [{ type: "A_REVOIR", valeur: true } as const, { aRevoir: true }, { aRevoir: false }],
    [{ type: "EXCLURE_BUDGET", valeur: false } as const, { exclureDuBudget: false }, { exclureDuBudget: true }],
    [{ type: "EXCLURE_RAPPORTS", valeur: true } as const, { exclureDesRapports: true }, { exclureDesRapports: false }],
  ])("%j : déjà dans l'état visé → inchangée, sinon écrite", (geste, dejaVisee, autre) => {
    const lignes = [ligneMasse("D", dejaVisee), ligneMasse("E", autre)];
    const p = partitionnerMasse(["D", "E"], lignes, geste);
    expect(p.inchangees).toBe(1);
    expect(p.aEcrire).toEqual(["E"]);
    exact(["D", "E"], p);
  });

  const lignesSuppression = [
    ligneMasse("K1"),
    ligneMasse("P", { estVentilee: true, nbLignesVentilation: 3 }),
    ligneMasse("V", { transferTransactionId: "v" }),
    ligneMasse("L", { estLiee: true }),
    ligneMasse("F", { parentId: "P" }),
  ];
  const idsSuppression = ["K1", "P", "V", "L", "F"];
  const partitionSuppression = partitionnerMasse(idsSuppression, lignesSuppression, { type: "SUPPRIMER", virements: null });

  it("SUPPRIMER : compte les parents ventilés et leurs lignes", () => {
    expect(partitionSuppression.aEcrire).toEqual(["K1", "P"]);
    expect(partitionSuppression.parentsVentilesEcrits).toBe(1);
    expect(partitionSuppression.lignesVentilationEcrites).toBe(3);
    expect(partitionSuppression.ignorees).toEqual({
      VIREMENT: 1,
      LIEE: 1,
      LIGNE_FILLE: 1,
      VENTILEE: 0,
      CONTREPARTIE_LIEE: 0,
      INTROUVABLE: 0,
    });
    expect(partitionSuppression.inchangees).toBe(0);
    exact(idsSuppression, partitionSuppression);
  });

  it("pointeursLus : chaque id de aEcrire avec son transferTransactionId tel que lu", () => {
    const lignes = [ligneMasse("K1"), ligneMasse("V", { transferTransactionId: "v" }), ligneMasse("L", { estLiee: true })];
    const p = partitionnerMasse(["K1", "V", "L", "Z"], lignes, { type: "SUPPRIMER", virements: "DELIER_L_AUTRE" });
    expect(p.aEcrire).toEqual(["K1", "V"]);
    expect(p.pointeursLus).toEqual({ K1: null, V: "v" });
  });

  it("MA1 — SUPPRIMER ignore un parent dont une fille est liée", () => {
    const lignes = [ligneMasse("K1"), ligneMasse("P", { estVentilee: true, nbLignesVentilation: 2, filleLiee: true })];
    const ids = ["K1", "P"];
    const p = partitionnerMasse(ids, lignes, { type: "SUPPRIMER", virements: null });
    expect(p.aEcrire).toEqual(["K1"]);
    expect(p.ignorees.LIEE).toBe(1);
    expect(p.parentsVentilesEcrits).toBe(0);
    exact(ids, p);
  });

  describe("virements (M2-T5)", () => {
    const AUTRE_LIBRE: LigneMasse["contrepartie"] = { etat: "TROUVEE", source: "MANUELLE", porteCotisation: false, estLiee: false };
    const AUTRE_LIEE: LigneMasse["contrepartie"] = { ...AUTRE_LIBRE, estLiee: true };
    const p1 = ligneMasse("P1", { transferTransactionId: "P2", contrepartie: AUTRE_LIBRE });

    it("MA1 — virements: null : côtés ignorés (VIREMENT), aucune contrepartie affectée", () => {
      const lignes = [p1, ligneMasse("O")];
      const p = partitionnerMasse(["P1", "O"], lignes, { type: "SUPPRIMER", virements: null });
      expect(p.aEcrire).toEqual(["O"]);
      expect(p.ignorees.VIREMENT).toBe(1);
      expect(p.contrepartiesAffectees).toEqual([]);
      expect(p.cotesVirementEcrits).toBe(0);
      exact(["P1", "O"], p);
    });

    it("MA2 — SUPPRIMER_LES_DEUX : contrepartie hors sélection affectée", () => {
      const p = partitionnerMasse(["P1"], [p1], { type: "SUPPRIMER", virements: "SUPPRIMER_LES_DEUX" });
      expect(p.aEcrire).toEqual(["P1"]);
      expect(p.contrepartiesAffectees).toEqual(["P2"]);
      expect(p.cotesVirementEcrits).toBe(1);
    });

    it("MA2 — les deux côtés sélectionnés : aucune contrepartie affectée en plus", () => {
      const q1 = ligneMasse("Q1", { transferTransactionId: "Q2", contrepartie: AUTRE_LIBRE });
      const q2 = ligneMasse("Q2", { transferTransactionId: "Q1", contrepartie: AUTRE_LIBRE });
      for (const ids of [["Q1", "Q2"], ["Q2", "Q1"]]) {
        const p = partitionnerMasse(ids, [q1, q2], { type: "SUPPRIMER", virements: "SUPPRIMER_LES_DEUX" });
        expect(p.aEcrire).toEqual(ids);
        expect(p.contrepartiesAffectees).toEqual([]);
        expect(p.cotesVirementEcrits).toBe(2);
      }
    });

    it("MA2 — une contrepartie partagée par deux pointeurs n'est comptée qu'une fois", () => {
      const a = ligneMasse("A", { transferTransactionId: "X", contrepartie: AUTRE_LIBRE });
      const b = ligneMasse("B", { transferTransactionId: "X", contrepartie: AUTRE_LIBRE });
      const p = partitionnerMasse(["A", "B"], [a, b], { type: "SUPPRIMER", virements: "DELIER_L_AUTRE" });
      expect(p.contrepartiesAffectees).toEqual(["X"]);
    });

    it("MA3 — SUPPRIMER_LES_DEUX avec une contrepartie liée : ignoré, raison CONTREPARTIE_LIEE", () => {
      const l = ligneMasse("P1", { transferTransactionId: "P2", contrepartie: AUTRE_LIEE });
      const p = partitionnerMasse(["P1"], [l], { type: "SUPPRIMER", virements: "SUPPRIMER_LES_DEUX" });
      expect(p.aEcrire).toEqual([]);
      expect(p.ignorees.CONTREPARTIE_LIEE).toBe(1);
      expect(p.contrepartiesAffectees).toEqual([]);
      exact(["P1"], p);
    });

    it("MA4 — DELIER_L_AUTRE : contrepartie liée aussi sélectionnée, ignorée (LIEE), le côté part", () => {
      const cote = ligneMasse("P1", { transferTransactionId: "P2", contrepartie: AUTRE_LIEE });
      const autre = ligneMasse("P2", { transferTransactionId: "P1", estLiee: true, contrepartie: AUTRE_LIBRE });
      const p = partitionnerMasse(["P1", "P2"], [cote, autre], { type: "SUPPRIMER", virements: "DELIER_L_AUTRE" });
      expect(p.aEcrire).toEqual(["P1"]);
      expect(p.ignorees.LIEE).toBe(1);
      expect(p.contrepartiesAffectees).toEqual(["P2"]);
      exact(["P1", "P2"], p);
    });

    it("contrepartie INTROUVABLE : le côté part seul, rien d'affecté", () => {
      const l = ligneMasse("P1", { transferTransactionId: "zzz", contrepartie: { etat: "INTROUVABLE" } });
      const p = partitionnerMasse(["P1"], [l], { type: "SUPPRIMER", virements: "SUPPRIMER_LES_DEUX" });
      expect(p.aEcrire).toEqual(["P1"]);
      expect(p.contrepartiesAffectees).toEqual([]);
      expect(p.cotesVirementEcrits).toBe(1);
    });

    it("hors SUPPRIMER, contrepartiesAffectees reste vide", () => {
      const p = partitionnerMasse(["P1"], [p1], { type: "BENEFICIAIRE", payeeId: "Y" });
      expect(p.contrepartiesAffectees).toEqual([]);
    });

    it("MA5 — aperçu et compte rendu : l'option choisie porte le compte, l'autre est à 0", () => {
      const p = partitionnerMasse(["P1"], [p1], { type: "SUPPRIMER", virements: "SUPPRIMER_LES_DEUX" });
      const lesDeux = apercuDepuisPartition(p, "SUPPRIMER_LES_DEUX");
      expect([lesDeux.cotesVirement, lesDeux.contrepartiesSupprimees, lesDeux.contrepartiesDeliees]).toEqual([1, 1, 0]);
      const delier = apercuDepuisPartition(p, "DELIER_L_AUTRE");
      expect([delier.contrepartiesSupprimees, delier.contrepartiesDeliees]).toEqual([0, 1]);
      const sans = apercuDepuisPartition(p, null);
      expect([sans.contrepartiesSupprimees, sans.contrepartiesDeliees]).toEqual([0, 0]);

      const c1 = compteRenduDepuisPartition({ type: "SUPPRIMER", virements: "SUPPRIMER_LES_DEUX" }, p);
      expect([c1.contrepartiesSupprimees, c1.contrepartiesDeliees]).toEqual([1, 0]);
      const c2 = compteRenduDepuisPartition({ type: "SUPPRIMER", virements: "DELIER_L_AUTRE" }, p);
      expect([c2.contrepartiesSupprimees, c2.contrepartiesDeliees]).toEqual([0, 1]);
      const c3 = compteRenduDepuisPartition({ type: "SUPPRIMER", virements: null }, p);
      expect([c3.contrepartiesSupprimees, c3.contrepartiesDeliees]).toEqual([0, 0]);
      const c4 = compteRenduDepuisPartition({ type: "A_REVOIR", valeur: true }, p);
      expect([c4.contrepartiesSupprimees, c4.contrepartiesDeliees]).toEqual([0, 0]);
    });
  });

  it("liste vide : tout à zéro", () => {
    const p = partitionnerMasse([], [], { type: "SUPPRIMER", virements: null });
    expect(p.aEcrire).toEqual([]);
    expect(p.inchangees).toBe(0);
    expect(p.ignorees).toEqual(IGNOREES_VIDES);
    expect(p.parentsVentilesEcrits).toBe(0);
    expect(p.lignesVentilationEcrites).toBe(0);
  });

  it("apercuDepuisPartition et compteRenduDepuisPartition", () => {
    expect(apercuDepuisPartition(partitionSuppression, null)).toEqual({
      aSupprimer: 2,
      parentsVentiles: 1,
      lignesVentilation: 3,
      ignorees: partitionSuppression.ignorees,
      cotesVirement: 0,
      contrepartiesSupprimees: 0,
      contrepartiesDeliees: 0,
    });
    expect(compteRenduDepuisPartition({ type: "SUPPRIMER", virements: null }, partitionSuppression)).toEqual({
      geste: "SUPPRIMER",
      traitees: 2,
      inchangees: 0,
      ignorees: partitionSuppression.ignorees,
      lignesVentilationSupprimees: 3,
      contrepartiesSupprimees: 0,
      contrepartiesDeliees: 0,
    });
    expect(
      compteRenduDepuisPartition({ type: "SOUS_CATEGORIE", subcategoryId: "X" }, partitionSuppression).lignesVentilationSupprimees,
    ).toBe(0);
  });
});
