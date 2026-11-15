// docs/lot-m1.md §9.

import { describe, expect, it } from "vitest";
import { appliquerRegles } from "./resolution";
import type { ActionRegle, ConditionRegle, LigneACategoriser, RegleCategorisation } from "./types";
import { serialiserPartsVentilation } from "../ventilation";

const LIGNE: LigneACategoriser = {
  description: "IGA VALBRUME",
  descriptionNormalisee: "IGA VALBRUME",
  montantCents: -8500,
  accountId: "cpt-cheque",
  payeeNom: null,
};

const CONDITION_VRAIE: ConditionRegle = {
  id: "c-1",
  champ: "DESCRIPTION_NORMALISEE",
  operateur: "CONTIENT",
  valeur: "IGA",
  valeurFin: null,
};

function categoriser(subcategoryId: string, ordre = 0): ActionRegle {
  return { id: `a-cat-${subcategoryId}-${ordre}`, type: "CATEGORISER", subcategoryId, valeur: null, ordre };
}

function etiqueter(tagId: string, ordre = 0): ActionRegle {
  return { id: `a-etq-${tagId}-${ordre}`, type: "ETIQUETER", subcategoryId: null, valeur: tagId, ordre };
}

function regle(partiel: Partial<RegleCategorisation> & { id: string }): RegleCategorisation {
  return {
    libelle: partiel.id,
    priorite: 0,
    actif: true,
    conditions: [CONDITION_VRAIE],
    actions: [],
    ...partiel,
  };
}

describe("appliquerRegles", () => {
  it("R1 — une règle, une condition vraie, CATEGORISER", () => {
    const r = regle({ id: "r1", actions: [categoriser("sc-a")] });
    const resultat = appliquerRegles(LIGNE, [r]);
    expect(resultat.affectation.subcategoryId).toBe("sc-a");
    expect(resultat.regleAppliqueeId).toBe("r1");
  });

  it("R2 — inactive priorité 99 + active priorité 10 : seule l'active s'applique", () => {
    const inactive = regle({ id: "r-inactif", priorite: 99, actif: false, actions: [categoriser("sc-x")] });
    const active = regle({ id: "r-actif", priorite: 10, actions: [categoriser("sc-a")] });
    const resultat = appliquerRegles(LIGNE, [inactive, active]);
    expect(resultat.reglesCorrespondantes).toEqual(["r-actif"]);
    expect(resultat.reglesInapplicables.some((r2) => r2.ruleId === "r-inactif")).toBe(false);
  });

  it("R3 — conflit à priorité égale sur SOUS_CATEGORIE", () => {
    const a = regle({ id: "ra", libelle: "A", priorite: 5, actions: [categoriser("sc-a")] });
    const b = regle({ id: "rb", libelle: "B", priorite: 5, actions: [categoriser("sc-b")] });
    const resultat = appliquerRegles(LIGNE, [a, b]);
    expect(resultat.affectation.subcategoryId).toBeNull();
    expect(resultat.affectation.aRevoir).toBe(true);
    expect(resultat.regleAppliqueeId).toBeNull();
    expect(resultat.conflits).toHaveLength(1);
    expect(resultat.conflits[0]).toEqual({
      slot: "SOUS_CATEGORIE",
      priorite: 5,
      candidats: [
        { ruleId: "ra", libelle: "A", valeur: "sc-a" },
        { ruleId: "rb", libelle: "B", valeur: "sc-b" },
      ],
    });
  });

  it("R4 — conflit à priorités différentes : la plus haute gagne", () => {
    const haute = regle({ id: "r-haute", priorite: 8, actions: [categoriser("sc-haute")] });
    const basse = regle({ id: "r-basse", priorite: 5, actions: [categoriser("sc-basse")] });
    const resultat = appliquerRegles(LIGNE, [haute, basse]);
    expect(resultat.affectation.subcategoryId).toBe("sc-haute");
    expect(resultat.conflits).toEqual([]);
    expect(resultat.affectation.aRevoir).toBe(false);
  });

  it("R5 — deux règles de même priorité posant la même sous-catégorie : pas un conflit", () => {
    const a = regle({ id: "ra", libelle: "A", priorite: 5, actions: [categoriser("sc-a")] });
    const b = regle({ id: "rb", libelle: "B", priorite: 5, actions: [categoriser("sc-a")] });
    const resultat = appliquerRegles(LIGNE, [a, b]);
    expect(resultat.affectation.subcategoryId).toBe("sc-a");
    expect(resultat.conflits).toEqual([]);
    expect(resultat.regleAppliqueeId).toBe("ra");
  });

  it("R6 — conflit à priorité 5 plus une règle à priorité 3 : la priorité 3 n'entre pas dans les candidats", () => {
    const a = regle({ id: "ra", libelle: "A", priorite: 5, actions: [categoriser("sc-a")] });
    const b = regle({ id: "rb", libelle: "B", priorite: 5, actions: [categoriser("sc-b")] });
    const c = regle({ id: "rc", libelle: "C", priorite: 3, actions: [categoriser("sc-c")] });
    const resultat = appliquerRegles(LIGNE, [a, b, c]);
    expect(resultat.conflits).toHaveLength(1);
    const [conflit] = resultat.conflits;
    expect(conflit?.candidats.map((candidat) => candidat.ruleId)).toEqual(["ra", "rb"]);
  });

  it("R7 — une règle CATEGORISER, une règle ETIQUETER : les deux s'appliquent, aucun conflit", () => {
    const a = regle({ id: "ra", actions: [categoriser("sc-a")] });
    const b = regle({ id: "rb", actions: [etiqueter("tag-1")] });
    const resultat = appliquerRegles(LIGNE, [a, b]);
    expect(resultat.affectation.subcategoryId).toBe("sc-a");
    expect(resultat.affectation.tagIds).toEqual(["tag-1"]);
    expect(resultat.conflits).toEqual([]);
  });

  it("R8 — conflit sur SOUS_CATEGORIE + une étiquette posée par l'une des deux", () => {
    const a = regle({
      id: "ra",
      libelle: "A",
      priorite: 5,
      actions: [categoriser("sc-a"), etiqueter("tag-1", 1)],
    });
    const b = regle({ id: "rb", libelle: "B", priorite: 5, actions: [categoriser("sc-b")] });
    const resultat = appliquerRegles(LIGNE, [a, b]);
    expect(resultat.affectation.subcategoryId).toBeNull();
    expect(resultat.affectation.tagIds).toEqual(["tag-1"]);
  });

  it("R9 — conflit sur NOTE seulement : la sous-catégorie se pose normalement", () => {
    const noter = (valeur: string, ordre = 0): ActionRegle => ({
      id: `a-note-${valeur}`,
      type: "NOTER",
      subcategoryId: null,
      valeur,
      ordre,
    });
    const a = regle({ id: "ra", libelle: "A", priorite: 5, actions: [noter("note A")] });
    const b = regle({ id: "rb", libelle: "B", priorite: 5, actions: [noter("note B")] });
    const c = regle({ id: "rc", libelle: "C", priorite: 1, actions: [categoriser("sc-a")] });
    const resultat = appliquerRegles(LIGNE, [a, b, c]);
    expect(resultat.affectation.note).toBeNull();
    expect(resultat.affectation.aRevoir).toBe(true);
    expect(resultat.affectation.subcategoryId).toBe("sc-a");
  });

  it("R10 — actions multiples : RENOMMER_BENEFICIAIRE puis MARQUER_A_REVOIR", () => {
    const r = regle({
      id: "r1",
      actions: [
        { id: "a1", type: "RENOMMER_BENEFICIAIRE", subcategoryId: null, valeur: "Amazon", ordre: 0 },
        { id: "a2", type: "MARQUER_A_REVOIR", subcategoryId: null, valeur: null, ordre: 1 },
      ],
    });
    const resultat = appliquerRegles(LIGNE, [r]);
    expect(resultat.affectation.payeeNom).toBe("Amazon");
    expect(resultat.affectation.aRevoir).toBe(true);
  });

  it("R11 — actions d'une même règle données dans le désordre : traitées par ordre croissant", () => {
    const r = regle({
      id: "r1",
      actions: [
        { id: "a-second", type: "CATEGORISER", subcategoryId: "sc-second", valeur: null, ordre: 1 },
        { id: "a-premier", type: "CATEGORISER", subcategoryId: "sc-premier", valeur: null, ordre: 0 },
      ],
    });
    const resultat = appliquerRegles(LIGNE, [r]);
    // Seule la première action selon `ordre` compte pour ce créneau (§3.4 étape 5.1).
    expect(resultat.affectation.subcategoryId).toBe("sc-premier");
  });

  it("R12 — deux règles ETIQUETER posant la même étiquette : sans doublon", () => {
    const a = regle({ id: "ra", actions: [etiqueter("tag-1")] });
    const b = regle({ id: "rb", actions: [etiqueter("tag-1")] });
    const resultat = appliquerRegles(LIGNE, [a, b]);
    expect(resultat.affectation.tagIds).toEqual(["tag-1"]);
  });

  it("R13 — trois règles ETIQUETER distinctes : dans l'ordre de tri des règles", () => {
    const a = regle({ id: "ra", libelle: "A", priorite: 5, actions: [etiqueter("tag-a")] });
    const b = regle({ id: "rb", libelle: "B", priorite: 3, actions: [etiqueter("tag-b")] });
    const c = regle({ id: "rc", libelle: "C", priorite: 8, actions: [etiqueter("tag-c")] });
    const resultat = appliquerRegles(LIGNE, [a, b, c]);
    expect(resultat.affectation.tagIds).toEqual(["tag-c", "tag-a", "tag-b"]);
  });

  it("R14 — deux règles de même priorité, libellés B et A : ordre A puis B", () => {
    const b = regle({ id: "r-b", libelle: "B", priorite: 5, actions: [categoriser("sc-b")] });
    const a = regle({ id: "r-a", libelle: "A", priorite: 5, actions: [categoriser("sc-a")] });
    const resultat = appliquerRegles(LIGNE, [b, a]);
    expect(resultat.reglesCorrespondantes).toEqual(["r-a", "r-b"]);
  });

  it("R15 — deux règles de même priorité et même libellé : ordre par id croissant", () => {
    const b = regle({ id: "r-b", libelle: "Même libellé", priorite: 5, actions: [categoriser("sc-b")] });
    const a = regle({ id: "r-a", libelle: "Même libellé", priorite: 5, actions: [categoriser("sc-a")] });
    const resultat = appliquerRegles(LIGNE, [b, a]);
    expect(resultat.reglesCorrespondantes).toEqual(["r-a", "r-b"]);
  });

  it("R16 — règle dont la regex ne compile pas : inapplicable, aucune action appliquée", () => {
    const r = regle({
      id: "r1",
      conditions: [{ id: "c1", champ: "DESCRIPTION", operateur: "REGEX", valeur: "((", valeurFin: null }],
      actions: [categoriser("sc-a")],
    });
    const resultat = appliquerRegles(LIGNE, [r]);
    expect(resultat.reglesInapplicables).toHaveLength(1);
    const [inapplicable] = resultat.reglesInapplicables;
    expect(inapplicable).toMatchObject({ ruleId: "r1", libelle: "r1", motif: "REGEX_INVALIDE", champ: "DESCRIPTION" });
    expect(typeof inapplicable?.detail).toBe("string");
    expect(resultat.reglesCorrespondantes).toEqual([]);
    expect(resultat.affectation.subcategoryId).toBeNull();
  });

  it("R17 — règle sans condition : AUCUNE_CONDITION, rien appliqué", () => {
    const r = regle({ id: "r1", conditions: [], actions: [categoriser("sc-a")] });
    const resultat = appliquerRegles(LIGNE, [r]);
    expect(resultat.reglesInapplicables).toHaveLength(1);
    const [inapplicable] = resultat.reglesInapplicables;
    expect(inapplicable).toMatchObject({ ruleId: "r1", libelle: "r1", motif: "AUCUNE_CONDITION", champ: null });
    expect(typeof inapplicable?.detail).toBe("string");
    expect(resultat.affectation.subcategoryId).toBeNull();
  });

  it("R18 — règle portant VENTILER illisible et ETIQUETER : inapplicable, l'étiquette ne s'applique pas", () => {
    const r = regle({
      id: "r1",
      actions: [
        { id: "a-vent", type: "VENTILER", subcategoryId: null, valeur: null, ordre: 0 },
        etiqueter("tag-1", 1),
      ],
    });
    const resultat = appliquerRegles(LIGNE, [r]);
    expect(resultat.reglesInapplicables).toHaveLength(1);
    expect(resultat.reglesInapplicables[0]).toMatchObject({ ruleId: "r1", motif: "VENTILATION_ILLISIBLE", champ: null });
    expect(resultat.affectation.tagIds).toEqual([]);
    expect(resultat.actionsNonAppliquees).toEqual([]);
  });

  it("R19 — options.sousCategorieVerrouillee avec une règle CATEGORISER", () => {
    const r = regle({ id: "r1", actions: [categoriser("sc-a")] });
    const resultat = appliquerRegles(LIGNE, [r], { sousCategorieVerrouillee: true });
    expect(resultat.affectation.subcategoryId).toBeNull();
    expect(resultat.actionsNonAppliquees).toEqual([
      { ruleId: "r1", libelle: "r1", type: "CATEGORISER", motif: "CATEGORIE_VERROUILLEE" },
    ]);
    expect(resultat.regleAppliqueeId).toBeNull();
  });

  it("R20 — verrou plus conflit potentiel sur SOUS_CATEGORIE", () => {
    const a = regle({ id: "ra", libelle: "A", priorite: 5, actions: [categoriser("sc-a")] });
    const b = regle({ id: "rb", libelle: "B", priorite: 5, actions: [categoriser("sc-b")] });
    const resultat = appliquerRegles(LIGNE, [a, b], { sousCategorieVerrouillee: true });
    expect(resultat.conflits).toEqual([]);
    expect(resultat.affectation.aRevoir).toBe(false);
    expect(resultat.actionsNonAppliquees).toEqual([
      { ruleId: "ra", libelle: "A", type: "CATEGORISER", motif: "CATEGORIE_VERROUILLEE" },
      { ruleId: "rb", libelle: "B", type: "CATEGORISER", motif: "CATEGORIE_VERROUILLEE" },
    ]);
  });

  it("R21 — verrou et une règle ETIQUETER : l'étiquette s'applique", () => {
    const r = regle({ id: "r1", actions: [etiqueter("tag-1")] });
    const resultat = appliquerRegles(LIGNE, [r], { sousCategorieVerrouillee: true });
    expect(resultat.affectation.tagIds).toEqual(["tag-1"]);
  });

  it("R22 — aucune règle ne correspond : AFFECTATION_VIDE", () => {
    const r = regle({
      id: "r1",
      conditions: [{ id: "c1", champ: "DESCRIPTION_NORMALISEE", operateur: "CONTIENT", valeur: "METRO", valeurFin: null }],
      actions: [categoriser("sc-a")],
    });
    const resultat = appliquerRegles(LIGNE, [r]);
    expect(resultat.affectation).toEqual({
      payeeNom: null,
      subcategoryId: null,
      ventilation: null,
      tagIds: [],
      note: null,
      exclureDuBudget: false,
      exclureDesRapports: false,
      aRevoir: false,
    });
    expect(resultat.regleAppliqueeId).toBeNull();
    expect(resultat.reglesCorrespondantes).toEqual([]);
    expect(resultat.conflits).toEqual([]);
    expect(resultat.reglesInapplicables).toEqual([]);
    expect(resultat.actionsNonAppliquees).toEqual([]);
  });

  it("R23 — appliquerRegles ne mute pas ses arguments", () => {
    const r = regle({ id: "r1", actions: [categoriser("sc-a"), etiqueter("tag-1", 1)] });
    const copie = structuredClone(r);
    appliquerRegles(LIGNE, [r]);
    expect(r).toEqual(copie);
  });

  it("R24 — un drapeau ne se remet jamais à false", () => {
    const exclure = (ordre: number): ActionRegle => ({
      id: `a-excl-${ordre}`,
      type: "EXCLURE_BUDGET",
      subcategoryId: null,
      valeur: null,
      ordre,
    });
    const basse = regle({ id: "r-basse", priorite: 1, actions: [exclure(0)] });
    const haute = regle({ id: "r-haute", priorite: 10, actions: [categoriser("sc-a")] });
    const resultat = appliquerRegles(LIGNE, [basse, haute]);
    expect(resultat.affectation.exclureDuBudget).toBe(true);
  });
});

describe("appliquerRegles — VENTILER (docs/lot-m2.md §4.3)", () => {
  const PARTS = [
    { subcategoryId: "sc-a", partMille: 600 },
    { subcategoryId: "sc-b", partMille: 400 },
  ];
  const VALEUR = serialiserPartsVentilation(PARTS);
  function ventiler(ordre = 0, valeur: string | null = VALEUR): ActionRegle {
    return { id: `a-vent-${ordre}`, type: "VENTILER", subcategoryId: null, valeur, ordre };
  }

  it("RV1 — VENTILER lisible et ETIQUETER dans une règle : ventilation et étiquette posées", () => {
    const r = regle({ id: "r1", actions: [ventiler(0), etiqueter("tag-1", 1)] });
    const resultat = appliquerRegles(LIGNE, [r]);
    expect(resultat.affectation.ventilation).toEqual(PARTS);
    expect(resultat.affectation.subcategoryId).toBeNull();
    expect(resultat.affectation.tagIds).toEqual(["tag-1"]);
    expect(resultat.regleAppliqueeId).toBe("r1");
  });

  it("RV2 — VENTILER puis CATEGORISER dans la même règle : la ventilation pose le créneau", () => {
    const r = regle({ id: "r1", actions: [ventiler(0), categoriser("sc-x", 1)] });
    const resultat = appliquerRegles(LIGNE, [r]);
    expect(resultat.conflits).toEqual([]);
    expect(resultat.affectation.ventilation).toEqual(PARTS);
    expect(resultat.affectation.subcategoryId).toBeNull();
  });

  it("RV3 — mêmes parts à priorité égale : pas de conflit, la première par libellé est créditée", () => {
    const a = regle({ id: "ra", libelle: "A", priorite: 5, actions: [ventiler()] });
    const b = regle({ id: "rb", libelle: "B", priorite: 5, actions: [ventiler()] });
    const resultat = appliquerRegles(LIGNE, [b, a]);
    expect(resultat.conflits).toEqual([]);
    expect(resultat.regleAppliqueeId).toBe("ra");
    expect(resultat.affectation.ventilation).toEqual(PARTS);
  });

  it("RV4 — la sonde neutre fait remonter VENTILATION_ILLISIBLE même quand les conditions seraient fausses", () => {
    const r = regle({
      id: "r1",
      conditions: [{ id: "c1", champ: "DESCRIPTION_NORMALISEE", operateur: "CONTIENT", valeur: "ZZZ", valeurFin: null }],
      actions: [ventiler(0, "[]")],
    });
    const sonde: LigneACategoriser = {
      description: "",
      descriptionNormalisee: "",
      montantCents: 0,
      accountId: "",
      payeeNom: null,
    };
    const resultat = appliquerRegles(sonde, [r]);
    expect(resultat.reglesInapplicables.map((i) => i.motif)).toEqual(["VENTILATION_ILLISIBLE"]);
  });
});
