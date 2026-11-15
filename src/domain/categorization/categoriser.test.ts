// docs/lot-m1.md §9.

import { describe, expect, it } from "vitest";
import { appliquerRegles } from "./resolution";
import { categoriser } from "./categoriser";
import { serialiserPartsVentilation } from "../ventilation";
import type { ActionRegle, ContexteBeneficiaire, LigneACategoriser, RegleCategorisation } from "./types";

const LIGNE: LigneACategoriser = {
  description: "IGA VALBRUME",
  descriptionNormalisee: "IGA VALBRUME",
  montantCents: -8500,
  accountId: "cpt-cheque",
  payeeNom: null,
};

function categoriserAction(subcategoryId: string): ActionRegle {
  return { id: `a-${subcategoryId}`, type: "CATEGORISER", subcategoryId, valeur: null, ordre: 0 };
}

function regle(id: string, subcategoryId: string): RegleCategorisation {
  return {
    id,
    libelle: id,
    priorite: 5,
    actif: true,
    conditions: [{ id: "c1", champ: "DESCRIPTION_NORMALISEE", operateur: "CONTIENT", valeur: "IGA", valeurFin: null }],
    actions: [categoriserAction(subcategoryId)],
  };
}

function beneficiaire(partiel: Partial<ContexteBeneficiaire> = {}): ContexteBeneficiaire {
  return {
    payeeId: "p1",
    nom: "IGA",
    sousCategorieParDefautId: "sc-defaut",
    autoCategorisation: true,
    categorieVerrouillee: false,
    ...partiel,
  };
}

describe("categoriser", () => {
  it("G1 — bénéficiaire verrouillé bat une règle qui catégorise autrement", () => {
    const b = beneficiaire({ categorieVerrouillee: true, sousCategorieParDefautId: "sc-verrou" });
    const r = regle("r1", "sc-regle");
    const resultat = categoriser(LIGNE, b, [r]);
    expect(resultat.affectation.subcategoryId).toBe("sc-verrou");
    expect(resultat.actionsNonAppliquees).toEqual([
      { ruleId: "r1", libelle: "r1", type: "CATEGORISER", motif: "CATEGORIE_VERROUILLEE" },
    ]);
  });

  it("G2 — bénéficiaire verrouillé sans sous-catégorie par défaut", () => {
    const b = beneficiaire({ categorieVerrouillee: true, sousCategorieParDefautId: null });
    const r = regle("r1", "sc-regle");
    const resultat = categoriser(LIGNE, b, [r]);
    expect(resultat.affectation.subcategoryId).toBeNull();
    expect(resultat.actionsNonAppliquees).toEqual([
      { ruleId: "r1", libelle: "r1", type: "CATEGORISER", motif: "CATEGORIE_VERROUILLEE" },
    ]);
  });

  it("G3 — aucune règle ne catégorise, autoCategorisation true : le défaut se pose", () => {
    const b = beneficiaire({ sousCategorieParDefautId: "sc-defaut" });
    const resultat = categoriser(LIGNE, b, []);
    expect(resultat.affectation.subcategoryId).toBe("sc-defaut");
    expect(resultat.regleAppliqueeId).toBeNull();
  });

  it("G4 — une règle catégorise, autoCategorisation true : la règle gagne, le défaut n'intervient pas", () => {
    const b = beneficiaire({ sousCategorieParDefautId: "sc-defaut" });
    const r = regle("r1", "sc-regle");
    const resultat = categoriser(LIGNE, b, [r]);
    expect(resultat.affectation.subcategoryId).toBe("sc-regle");
    expect(resultat.regleAppliqueeId).toBe("r1");
  });

  it("G5 — autoCategorisation false : aucun défaut posé, même sans règle", () => {
    const b = beneficiaire({ autoCategorisation: false, sousCategorieParDefautId: "sc-defaut" });
    const resultat = categoriser(LIGNE, b, []);
    expect(resultat.affectation.subcategoryId).toBeNull();
  });

  it("G6 — conflit à priorité égale + bénéficiaire avec défaut : le défaut ne comble pas le conflit", () => {
    const b = beneficiaire({ sousCategorieParDefautId: "sc-defaut" });
    const a = regle("ra", "sc-a");
    const rb = regle("rb", "sc-b");
    const resultat = categoriser(LIGNE, b, [a, rb]);
    expect(resultat.affectation.subcategoryId).toBeNull();
    expect(resultat.affectation.aRevoir).toBe(true);
  });

  it("G7 — beneficiaire === null : identique à appliquerRegles sans option", () => {
    const r = regle("r1", "sc-regle");
    const attendu = appliquerRegles(LIGNE, [r]);
    const resultat = categoriser(LIGNE, null, [r]);
    expect(resultat).toEqual(attendu);
  });

  it("G8 — les autres créneaux traversent inchangés depuis appliquerRegles", () => {
    const r: RegleCategorisation = {
      id: "r1",
      libelle: "r1",
      priorite: 5,
      actif: true,
      conditions: [{ id: "c1", champ: "DESCRIPTION_NORMALISEE", operateur: "CONTIENT", valeur: "IGA", valeurFin: null }],
      actions: [
        { id: "a1", type: "ETIQUETER", subcategoryId: null, valeur: "tag-1", ordre: 0 },
        { id: "a2", type: "NOTER", subcategoryId: null, valeur: "une note", ordre: 1 },
        { id: "a3", type: "MARQUER_A_REVOIR", subcategoryId: null, valeur: null, ordre: 2 },
      ],
    };
    const b = beneficiaire();
    const attendu = appliquerRegles(LIGNE, [r]);
    const resultat = categoriser(LIGNE, b, [r]);
    expect(resultat.affectation.tagIds).toEqual(attendu.affectation.tagIds);
    expect(resultat.affectation.note).toEqual(attendu.affectation.note);
    expect(resultat.affectation.aRevoir).toEqual(attendu.affectation.aRevoir);
    expect(resultat.affectation.exclureDuBudget).toEqual(attendu.affectation.exclureDuBudget);
    expect(resultat.affectation.exclureDesRapports).toEqual(attendu.affectation.exclureDesRapports);
    expect(resultat.affectation.payeeNom).toEqual(attendu.affectation.payeeNom);
  });

  it("CV1 — le défaut du bénéficiaire ne remplace pas une ventilation", () => {
    const parts = [
      { subcategoryId: "sc-a", partMille: 600 },
      { subcategoryId: "sc-b", partMille: 400 },
    ];
    const r: RegleCategorisation = {
      ...regle("r1", "sc-x"),
      actions: [{ id: "a-v", type: "VENTILER", subcategoryId: null, valeur: serialiserPartsVentilation(parts), ordre: 0 }],
    };
    const b = beneficiaire({ autoCategorisation: true, sousCategorieParDefautId: "sc-x" });
    const resultat = categoriser(LIGNE, b, [r]);
    expect(resultat.affectation.subcategoryId).toBeNull();
    expect(resultat.affectation.ventilation).toEqual(parts);
  });
});
