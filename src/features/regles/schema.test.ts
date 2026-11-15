// docs/lot-m1.md §4.6.

import { describe, expect, it } from "vitest";
import type { RegleListe } from "@/server/actions/rules";
import {
  MESSAGE_ID_REPETE,
  MESSAGE_IDS_EN_DOUBLE,
  MESSAGE_TROP_DE_LIGNES,
  estSousCategorieDisparue,
  partsSousCategorieDisparue,
  schemaAction,
  schemaApplicationRetroactive,
  entreeRegleDepuisTransaction,
  schemaCondition,
  schemaRegle,
  versEntreeRegle,
} from "./schema";

const CUID_SC = "clx0000000000000000000010";
const CUID_TAG_A = "clx0000000000000000000011";
const CUID_TAG_B = "clx0000000000000000000012";

const CONDITION_VALIDE = { champ: "DESCRIPTION_NORMALISEE", operateur: "CONTIENT", valeur: "IGA", valeurFin: "" } as const;
const CUID_SC_B = "clx0000000000000000000013";
const ACTION_CATEGORISER_VALIDE = { type: "CATEGORISER", subcategoryId: CUID_SC, valeur: "", ventilation: [] } as const;

function actionVentiler(...pourcentages: readonly string[]) {
  return {
    type: "VENTILER",
    subcategoryId: null,
    valeur: "",
    ventilation: pourcentages.map((pourcentage, j) => ({
      subcategoryId: j === 0 ? CUID_SC : CUID_SC_B,
      pourcentage,
    })),
  } as const;
}

const BASE_REGLE = {
  libelle: "Épicerie",
  priorite: "10",
  actif: true,
  conditions: [CONDITION_VALIDE],
  actions: [ACTION_CATEGORISER_VALIDE],
};

describe("schemaCondition — montants", () => {
  it("F1 — MONTANT saisi « -50,00 » : sortie -5000, dollars → cents une seule fois", () => {
    const resultat = schemaCondition.safeParse({ champ: "MONTANT", operateur: "EGALE", valeur: "-50,00", valeurFin: "" });
    expect(resultat.success).toBe(true);
    if (resultat.success) {
      expect(resultat.data.valeur).toBe("-5000");
    }
  });

  it("F2 — MONTANT saisi « 1 234,56 » : sortie 123456", () => {
    const resultat = schemaCondition.safeParse({
      champ: "MONTANT",
      operateur: "EGALE",
      valeur: "1 234,56",
      valeurFin: "",
    });
    expect(resultat.success).toBe(true);
    if (resultat.success) {
      expect(resultat.data.valeur).toBe("123456");
    }
  });

  it("F3 — MONTANT saisi « abc » : refusée, message et champ précis", () => {
    const resultat = schemaCondition.safeParse({ champ: "MONTANT", operateur: "EGALE", valeur: "abc", valeurFin: "" });
    expect(resultat.success).toBe(false);
    if (!resultat.success) {
      const issue = resultat.error.issues[0];
      expect(issue?.path).toEqual(["valeur"]);
      expect(issue?.message).toBe("Montant illisible. Exemple : 250,00");
    }
  });

  it("F4 — MONTANT ENTRE sans borne haute : refusée sur valeurFin", () => {
    const resultat = schemaCondition.safeParse({ champ: "MONTANT", operateur: "ENTRE", valeur: "100", valeurFin: "" });
    expect(resultat.success).toBe(false);
    if (!resultat.success) {
      expect(resultat.error.issues[0]?.path).toEqual(["valeurFin"]);
    }
  });

  it("F5 — MONTANT ENTRE bornes inversées : refusée sur valeurFin", () => {
    const resultat = schemaCondition.safeParse({
      champ: "MONTANT",
      operateur: "ENTRE",
      valeur: "100",
      valeurFin: "50",
    });
    expect(resultat.success).toBe(false);
    if (!resultat.success) {
      expect(resultat.error.issues[0]?.path).toEqual(["valeurFin"]);
    }
  });
});

describe("schemaCondition — texte", () => {
  it("F6 — DESCRIPTION SUP : refusée sur operateur", () => {
    const resultat = schemaCondition.safeParse({ champ: "DESCRIPTION", operateur: "SUP", valeur: "10", valeurFin: "" });
    expect(resultat.success).toBe(false);
    if (!resultat.success) {
      expect(resultat.error.issues[0]?.path).toEqual(["operateur"]);
    }
  });

  it("F7 — DESCRIPTION REGEX « (( » : refusée sur valeur, avec le message du moteur", () => {
    const resultat = schemaCondition.safeParse({ champ: "DESCRIPTION", operateur: "REGEX", valeur: "((", valeurFin: "" });
    expect(resultat.success).toBe(false);
    if (!resultat.success) {
      const issue = resultat.error.issues[0];
      expect(issue?.path).toEqual(["valeur"]);
      expect(issue?.message).not.toBe("Expression régulière invalide.");
      expect(issue?.message.length).toBeGreaterThan(0);
    }
  });

  it("MOT_ENTIER sur un champ texte : acceptée, valeur conservée, valeurFin à null", () => {
    const resultat = schemaCondition.safeParse({
      champ: "DESCRIPTION_NORMALISEE",
      operateur: "MOT_ENTIER",
      valeur: "PAIE",
      valeurFin: "",
    });
    expect(resultat.success).toBe(true);
    if (resultat.success) {
      expect(resultat.data.valeur).toBe("PAIE");
      expect(resultat.data.valeurFin).toBeNull();
    }
  });

  it("MOT_ENTIER sur MONTANT : refusée sur operateur", () => {
    const resultat = schemaCondition.safeParse({
      champ: "MONTANT",
      operateur: "MOT_ENTIER",
      valeur: "10,00",
      valeurFin: "",
    });
    expect(resultat.success).toBe(false);
    if (!resultat.success) {
      expect(resultat.error.issues[0]?.path).toEqual(["operateur"]);
    }
  });

  it("F8 — condition non-ENTRE avec valeurFin renseignée : le vestige ne part pas en base", () => {
    const resultat = schemaCondition.safeParse({
      champ: "DESCRIPTION",
      operateur: "CONTIENT",
      valeur: "IGA",
      valeurFin: "vestige",
    });
    expect(resultat.success).toBe(true);
    if (resultat.success) {
      expect(resultat.data.valeurFin).toBeNull();
    }
  });
});

describe("schemaAction", () => {
  it("F10 — CATEGORISER sans subcategoryId : refusée sur subcategoryId", () => {
    const resultat = schemaAction.safeParse({ type: "CATEGORISER", subcategoryId: null, valeur: "", ventilation: [] });
    expect(resultat.success).toBe(false);
    if (!resultat.success) {
      expect(resultat.error.issues[0]?.path).toEqual(["subcategoryId"]);
    }
  });

  it("F11 — ETIQUETER sans valeur : refusée sur valeur", () => {
    const resultat = schemaAction.safeParse({ type: "ETIQUETER", subcategoryId: null, valeur: "", ventilation: [] });
    expect(resultat.success).toBe(false);
    if (!resultat.success) {
      expect(resultat.error.issues[0]?.path).toEqual(["valeur"]);
    }
  });
});

describe("schemaRegle — cohérence inter-actions", () => {
  it("F12 — deux actions CATEGORISER : refusées sur actions", () => {
    const resultat = schemaRegle.safeParse({
      ...BASE_REGLE,
      actions: [ACTION_CATEGORISER_VALIDE, ACTION_CATEGORISER_VALIDE],
    });
    expect(resultat.success).toBe(false);
    if (!resultat.success) {
      expect(resultat.error.issues.some((issue) => issue.path.join(".") === "actions")).toBe(true);
    }
  });

  it("F13 — deux actions ETIQUETER sur des étiquettes différentes : acceptées", () => {
    const resultat = schemaRegle.safeParse({
      ...BASE_REGLE,
      actions: [
        { type: "ETIQUETER", subcategoryId: null, valeur: CUID_TAG_A, ventilation: [] },
        { type: "ETIQUETER", subcategoryId: null, valeur: CUID_TAG_B, ventilation: [] },
      ],
    });
    expect(resultat.success).toBe(true);
  });

  it("F14 — deux actions ETIQUETER sur la même étiquette : refusées", () => {
    const resultat = schemaRegle.safeParse({
      ...BASE_REGLE,
      actions: [
        { type: "ETIQUETER", subcategoryId: null, valeur: CUID_TAG_A, ventilation: [] },
        { type: "ETIQUETER", subcategoryId: null, valeur: CUID_TAG_A, ventilation: [] },
      ],
    });
    expect(resultat.success).toBe(false);
    if (!resultat.success) {
      expect(resultat.error.issues.some((issue) => issue.message === "Cette étiquette est déjà posée par cette règle.")).toBe(
        true,
      );
    }
  });

  it("F15 — règle sans condition : refusée", () => {
    const resultat = schemaRegle.safeParse({ ...BASE_REGLE, conditions: [] });
    expect(resultat.success).toBe(false);
    if (!resultat.success) {
      expect(resultat.error.flatten().fieldErrors.conditions).toContain(
        "Une règle sans condition ne s'applique à rien.",
      );
    }
  });

  it("F16 — règle sans action : refusée", () => {
    const resultat = schemaRegle.safeParse({ ...BASE_REGLE, actions: [] });
    expect(resultat.success).toBe(false);
  });

  it("F17 — priorite hors bornes : « -1 » puis « 1000 » refusées toutes les deux", () => {
    expect(schemaRegle.safeParse({ ...BASE_REGLE, priorite: "-1" }).success).toBe(false);
    expect(schemaRegle.safeParse({ ...BASE_REGLE, priorite: "1000" }).success).toBe(false);
  });
});

describe("versEntreeRegle — aller-retour sans perte", () => {
  it("F18 — versEntreeRegle → schemaRegle.parse rend la règle d'origine, montants compris", () => {
    const regleStockee: RegleListe = {
      id: "clx0000000000000000000020",
      libelle: "Gros achat",
      priorite: 7,
      actif: true,
      conditions: [
        { id: "cnd1", champ: "MONTANT", operateur: "INF", valeur: "-5000", valeurFin: null },
        { id: "cnd2", champ: "DESCRIPTION", operateur: "CONTIENT", valeur: "IGA", valeurFin: null },
      ],
      actions: [
        {
          id: "act1",
          type: "CATEGORISER",
          subcategoryId: CUID_SC,
          sousCategorieNom: "Épicerie",
          categorieNom: "Alimentation",
          valeur: null,
          ordre: 0,
        },
        {
          id: "act2",
          type: "ETIQUETER",
          subcategoryId: null,
          sousCategorieNom: null,
          categorieNom: null,
          valeur: CUID_TAG_A,
          ordre: 1,
        },
      ],
      nbTransactions: 3,
    };

    const entree = versEntreeRegle(regleStockee);
    const resultat = schemaRegle.safeParse(entree);
    expect(resultat.success).toBe(true);
    if (resultat.success) {
      expect(resultat.data).toEqual({
        libelle: "Gros achat",
        priorite: 7,
        actif: true,
        conditions: [
          { champ: "MONTANT", operateur: "INF", valeur: "-5000", valeurFin: null },
          { champ: "DESCRIPTION", operateur: "CONTIENT", valeur: "IGA", valeurFin: null },
        ],
        actions: [
          { type: "CATEGORISER", subcategoryId: CUID_SC, valeur: null },
          { type: "ETIQUETER", subcategoryId: null, valeur: CUID_TAG_A },
        ],
      });
    }
  });
});

describe("VENTILER dans l'éditeur de règles (docs/lot-m2.md §4.3)", () => {
  const regleAvec = (...actions: readonly unknown[]) => ({ ...BASE_REGLE, actions });
  const messages = (entree: unknown): { chemin: string; message: string }[] => {
    const resultat = schemaRegle.safeParse(entree);
    return resultat.success
      ? []
      : resultat.error.issues.map((issue) => ({ chemin: issue.path.join("."), message: issue.message }));
  };

  it("RS1 — 60 / 40 donne les parts en pour mille, JSON exact", () => {
    const resultat = schemaAction.safeParse(actionVentiler("60", "40"));
    expect(resultat.success).toBe(true);
    if (resultat.success) {
      expect(resultat.data).toEqual({
        type: "VENTILER",
        subcategoryId: null,
        valeur: `[{"subcategoryId":"${CUID_SC}","partMille":600},{"subcategoryId":"${CUID_SC_B}","partMille":400}]`,
      });
    }
  });

  it("RS2 — 12,5 et 87.5 donnent 125 et 875", () => {
    const resultat = schemaAction.safeParse(actionVentiler("12,5", "87.5"));
    expect(resultat.success).toBe(true);
    if (resultat.success) {
      expect(resultat.data.valeur).toBe(
        `[{"subcategoryId":"${CUID_SC}","partMille":125},{"subcategoryId":"${CUID_SC_B}","partMille":875}]`,
      );
    }
  });

  it("RS3 — parts qui ne totalisent pas 100 %", () => {
    const issues = schemaAction.safeParse(actionVentiler("60", "30"));
    expect(issues.success).toBe(false);
    expect(issues.error?.issues.map((i) => [i.path.join("."), i.message])).toEqual([
      ["ventilation", "Les parts totalisent 90 % : elles doivent faire 100 %."],
    ]);
    const decimale = schemaAction.safeParse(actionVentiler("60", "30,5"));
    expect(decimale.error?.issues[0]?.message).toBe("Les parts totalisent 90,5 % : elles doivent faire 100 %.");
  });

  it("RS4 — une seule ligne", () => {
    const resultat = schemaAction.safeParse(actionVentiler("100"));
    expect(resultat.error?.issues.map((i) => [i.path.join("."), i.message])).toEqual([
      ["ventilation", "Une ventilation compte au moins deux lignes."],
    ]);
  });

  it("RS5 — pourcentage illisible", () => {
    for (const illisible of ["12,55", "abc", "", "1000"]) {
      const resultat = schemaAction.safeParse(actionVentiler("50", illisible));
      expect(resultat.error?.issues.map((i) => [i.path.join("."), i.message])).toEqual([
        ["ventilation.1.pourcentage", "Pourcentage illisible. Exemple : 12,5"],
      ]);
    }
  });

  it("RS6 — une part à 0 %", () => {
    const resultat = schemaAction.safeParse(actionVentiler("100", "0"));
    expect(resultat.error?.issues.map((i) => [i.path.join("."), i.message])).toEqual([
      ["ventilation.1.pourcentage", "Une part doit être supérieure à 0 %."],
    ]);
  });

  it("RS7 — sous-catégorie manquante", () => {
    const action = {
      type: "VENTILER",
      subcategoryId: null,
      valeur: "",
      ventilation: [
        { subcategoryId: null, pourcentage: "60" },
        { subcategoryId: CUID_SC_B, pourcentage: "40" },
      ],
    };
    const resultat = schemaAction.safeParse(action);
    expect(resultat.error?.issues.map((i) => [i.path.join("."), i.message])).toEqual([
      ["ventilation.0.subcategoryId", "Choisis une sous-catégorie."],
    ]);
  });

  it("RS8 — VENTILER avec CATEGORISER, et deux VENTILER", () => {
    expect(messages(regleAvec(actionVentiler("60", "40"), ACTION_CATEGORISER_VALIDE))).toEqual([
      { chemin: "actions", message: "Une règle ne porte pas à la fois une ventilation et une sous-catégorie." },
    ]);
    expect(messages(regleAvec(actionVentiler("60", "40"), actionVentiler("50", "50")))).toEqual([
      { chemin: "actions", message: "Une règle ne pose qu'une ventilation." },
    ]);
  });

  const regleStockee = (valeur: string | null): RegleListe => ({
    id: "clx0000000000000000000020",
    libelle: "Ventilation",
    priorite: 5,
    actif: true,
    conditions: [{ id: "cnd1", champ: "DESCRIPTION", operateur: "CONTIENT", valeur: "IGA", valeurFin: null }],
    actions: [
      { id: "act1", type: "VENTILER", subcategoryId: null, sousCategorieNom: null, categorieNom: null, valeur, ordre: 0 },
    ],
    nbTransactions: 0,
  });

  it("RS9 — aller-retour sans perte d'une règle stockée", () => {
    const valeur = `[{"subcategoryId":"${CUID_SC}","partMille":600},{"subcategoryId":"${CUID_SC_B}","partMille":400}]`;
    const entree = versEntreeRegle(regleStockee(valeur));
    expect(entree.actions[0]).toEqual({
      type: "VENTILER",
      subcategoryId: null,
      valeur: "",
      ventilation: [
        { subcategoryId: CUID_SC, pourcentage: "60" },
        { subcategoryId: CUID_SC_B, pourcentage: "40" },
      ],
    });
    const resultat = schemaRegle.safeParse(entree);
    expect(resultat.success).toBe(true);
    if (resultat.success) {
      expect(resultat.data.actions[0]?.valeur).toBe(valeur);
    }
  });

  it("RS10 — une ventilation stockée illisible s'ouvre vide et le schéma refuse de l'enregistrer", () => {
    const entree = versEntreeRegle(regleStockee("n'importe quoi"));
    expect(entree.actions[0]?.ventilation).toEqual([]);
    expect(messages(entree)).toEqual([
      { chemin: "actions.0.ventilation", message: "Une ventilation compte au moins deux lignes." },
    ]);
  });

  it("RS11 — une action CATEGORISER ignore une ventilation résiduelle", () => {
    const resultat = schemaAction.safeParse({
      ...ACTION_CATEGORISER_VALIDE,
      ventilation: [{ subcategoryId: CUID_SC_B, pourcentage: "50" }],
    });
    expect(resultat.success).toBe(true);
    if (resultat.success) {
      expect(resultat.data).toEqual({ type: "CATEGORISER", subcategoryId: CUID_SC, valeur: null });
    }
  });

  it("RS12 — partsSousCategorieDisparue désigne les parts dont la sous-catégorie n'existe plus", () => {
    const actions = [ACTION_CATEGORISER_VALIDE, actionVentiler("60", "40")];
    expect(partsSousCategorieDisparue(actions, new Set([CUID_SC, CUID_SC_B]))).toEqual([]);
    expect(partsSousCategorieDisparue(actions, new Set([CUID_SC]))).toEqual([{ action: 1, part: 1 }]);
    expect(partsSousCategorieDisparue(actions, new Set())).toEqual([
      { action: 1, part: 0 },
      { action: 1, part: 1 },
    ]);
    // Une action CATEGORISER n'est pas concernée, ni une part sans sous-catégorie (le schéma la signale).
    const sansChoix = { ...actionVentiler("60", "40"), ventilation: [{ subcategoryId: null, pourcentage: "100" }] };
    expect(partsSousCategorieDisparue([sansChoix], new Set())).toEqual([]);
  });

  it("RS13 — estSousCategorieDisparue : faux tant que les catégories ne sont pas chargées", () => {
    expect(estSousCategorieDisparue(null, new Set(["x"]))).toBe(false);
    expect(estSousCategorieDisparue("x", new Set(["x"]))).toBe(false);
    expect(estSousCategorieDisparue("y", new Set(["x"]))).toBe(true);
    expect(estSousCategorieDisparue("y", null)).toBe(false);
    expect(estSousCategorieDisparue("y", new Set())).toBe(true);
  });
});

describe("schemaApplicationRetroactive", () => {
  const ruleId = "clx0000000000000000000001";
  const cuidNumero = (n: number): string => `c${n.toString(36).padStart(24, "0")}`;
  const plage = (debut: number, nombre: number): string[] => Array.from({ length: nombre }, (_, i) => cuidNumero(debut + i));

  it("accepte des identifiants distincts dans les deux listes", () => {
    const resultat = schemaApplicationRetroactive.safeParse({
      ruleId,
      transactionIds: [cuidNumero(1)],
      idsSansEcriture: [cuidNumero(2)],
    });
    expect(resultat.success).toBe(true);
  });

  it("accepte idsSansEcriture vide", () => {
    expect(
      schemaApplicationRetroactive.safeParse({ ruleId, transactionIds: [cuidNumero(1)], idsSansEcriture: [] }).success,
    ).toBe(true);
  });

  it("refuse un même identifiant dans les deux listes", () => {
    const resultat = schemaApplicationRetroactive.safeParse({
      ruleId,
      transactionIds: [cuidNumero(1)],
      idsSansEcriture: [cuidNumero(1)],
    });
    expect(resultat.success).toBe(false);
    if (!resultat.success) {
      expect(resultat.error.issues[0]?.path).toEqual(["idsSansEcriture"]);
      expect(resultat.error.issues[0]?.message).toBe(MESSAGE_IDS_EN_DOUBLE);
    }
  });

  it("refuse un identifiant répété dans transactionIds", () => {
    const resultat = schemaApplicationRetroactive.safeParse({
      ruleId,
      transactionIds: [cuidNumero(1), cuidNumero(1)],
      idsSansEcriture: [],
    });
    expect(resultat.success).toBe(false);
    if (!resultat.success) {
      expect(resultat.error.issues).toEqual([
        expect.objectContaining({ path: ["transactionIds"], message: MESSAGE_ID_REPETE }),
      ]);
    }
  });

  it("refuse un identifiant répété dans idsSansEcriture", () => {
    const resultat = schemaApplicationRetroactive.safeParse({
      ruleId,
      transactionIds: [cuidNumero(1)],
      idsSansEcriture: [cuidNumero(2), cuidNumero(3), cuidNumero(2)],
    });
    expect(resultat.success).toBe(false);
    if (!resultat.success) {
      expect(resultat.error.issues).toEqual([
        expect.objectContaining({ path: ["idsSansEcriture"], message: MESSAGE_ID_REPETE }),
      ]);
    }
  });

  it("borne le total des deux listes", () => {
    const trop = schemaApplicationRetroactive.safeParse({
      ruleId,
      transactionIds: plage(1, 3000),
      idsSansEcriture: plage(10_000, 2001),
    });
    expect(trop.success).toBe(false);
    if (!trop.success) {
      expect(trop.error.issues.some((i) => i.message === MESSAGE_TROP_DE_LIGNES)).toBe(true);
    }
    const limite = schemaApplicationRetroactive.safeParse({
      ruleId,
      transactionIds: plage(1, 3000),
      idsSansEcriture: plage(10_000, 2000),
    });
    expect(limite.success).toBe(true);
  });

  it("rend idsSansEcriture obligatoire", () => {
    expect(schemaApplicationRetroactive.safeParse({ ruleId, transactionIds: [cuidNumero(1)] }).success).toBe(false);
  });

  it("refuse un UUID dans idsSansEcriture", () => {
    expect(
      schemaApplicationRetroactive.safeParse({
        ruleId,
        transactionIds: [cuidNumero(1)],
        idsSansEcriture: ["3f2b8c1e-6a4d-4e0b-9d57-1c2f8a7b9e10"],
      }).success,
    ).toBe(false);
  });
});

describe("entreeRegleDepuisTransaction", () => {
  it("pré-remplit la règle et passe le schéma", () => {
    const entree = entreeRegleDepuisTransaction({ description: "CAFE DEPOT 123", subcategoryId: CUID_SC });
    expect(entree).toEqual({
      libelle: "CAFE DEPOT 123",
      priorite: "0",
      actif: true,
      conditions: [{ champ: "DESCRIPTION", operateur: "CONTIENT", valeur: "CAFE DEPOT 123", valeurFin: "" }],
      actions: [{ type: "CATEGORISER", subcategoryId: CUID_SC, valeur: "", ventilation: [] }],
    });
    expect(schemaRegle.safeParse(entree).success).toBe(true);
  });

  it("sans sous-catégorie, le schéma demande d'en choisir une", () => {
    const resultat = schemaRegle.safeParse(entreeRegleDepuisTransaction({ description: "CAFE", subcategoryId: null }));
    expect(resultat.success).toBe(false);
    const issue = resultat.error?.issues.find((i) => i.path.join(".") === "actions.0.subcategoryId");
    expect(issue?.message).toBe("Choisis une sous-catégorie.");
  });

  it("une description de 100 caractères donne un libellé de 80 et une condition de 100", () => {
    const description = "a".repeat(100);
    const entree = entreeRegleDepuisTransaction({ description, subcategoryId: CUID_SC });
    expect(entree.libelle).toHaveLength(80);
    expect(entree.conditions[0]?.valeur).toHaveLength(100);
  });
});
