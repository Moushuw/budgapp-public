// docs/lot-m1.md §9 — l'oracle fait foi : en cas d'écart, on ne le
// régénère jamais depuis la sortie de preparerRevue(). Modèle de
// src/domain/categorization/scenarios.test.ts.

import { describe, expect, it } from "vitest";
import { preparerRevue } from "./pipeline";
import type {
  BeneficiaireIngestion,
  ContexteIngestion,
  FiltreIngestion,
  LigneEnRevue,
  RawEntry,
  TransactionExistante,
} from "./types";
import type { RegleCategorisation } from "../categorization";

import ordreJson from "./fixtures/ordre-categorisation.json";

interface ScenarioJson {
  readonly nom: string;
  readonly entree: string;
  readonly filtres: readonly string[];
  readonly beneficiaires: readonly string[];
  readonly regles: readonly string[];
  readonly existantes: readonly string[];
  readonly attendu: unknown;
}

const filtres = ordreJson.filtres as unknown as Record<string, FiltreIngestion>;
const beneficiaires = ordreJson.beneficiaires as unknown as Record<string, BeneficiaireIngestion>;
const regles = ordreJson.regles as unknown as Record<string, RegleCategorisation>;
// L'oracle ne connaît pas encore les virements : aucune existante n'en est un.
const existantes = ordreJson.existantes as unknown as Record<string, Omit<TransactionExistante, "virement">>;
const entrees = ordreJson.entrees as unknown as Record<string, RawEntry>;
const scenarios = ordreJson.scenarios as unknown as readonly ScenarioJson[];

function resoudre<T>(dictionnaire: Record<string, T>, cle: string, quoi: string): T {
  const valeur = dictionnaire[cle];
  if (valeur === undefined) {
    throw new Error(`fixture invalide : ${quoi} « ${cle} » inconnu`);
  }
  return valeur;
}

function projeter(ligne: LigneEnRevue) {
  return {
    payeeId: ligne.payeeId,
    payeeNouveauNom: ligne.payeeNouveauNom,
    subcategoryId: ligne.subcategoryId,
    tagIds: ligne.tagIds,
    note: ligne.note,
    aRevoir: ligne.aRevoir,
    exclureDuBudget: ligne.exclureDuBudget,
    exclureDesRapports: ligne.exclureDesRapports,
    regleAppliqueeId: ligne.regleAppliqueeId,
    reglesEnConflit: ligne.reglesEnConflit,
    filtreId: ligne.filtreId,
    statutDoublon: ligne.statutDoublon,
    action: ligne.action,
    section: ligne.section,
  };
}

describe("ordre-categorisation.json — l'oracle", () => {
  for (const scenario of scenarios) {
    it(`${scenario.nom} correspond exactement à l'attendu`, () => {
      const entree = resoudre(entrees, scenario.entree, "entrée");
      const contexte: ContexteIngestion = {
        filtres: scenario.filtres.map((cle) => resoudre(filtres, cle, "filtre")),
        beneficiaires: scenario.beneficiaires.map((cle) => resoudre(beneficiaires, cle, "bénéficiaire")),
        regles: scenario.regles.map((cle) => resoudre(regles, cle, "règle")),
        existantes: scenario.existantes.map((cle) => ({ ...resoudre(existantes, cle, "existante"), virement: null })),
        transactionsAutresComptes: [],
        occurrencesOuvertes: [],
      };

      const resultat =preparerRevue([entree], contexte);
      const ligne = resultat.lignes[0];
      if (ligne === undefined) {
        throw new Error("preparerRevue n'a rendu aucune ligne pour une entrée");
      }

      expect(projeter(ligne)).toEqual(scenario.attendu);
    });
  }

  it("les 8 scénarios de la spec sont tous présents", () => {
    const noms = scenarios.map((scenario) => scenario.nom);
    expect(noms).toHaveLength(8);
    expect(new Set(noms).size).toBe(8);
  });

  it("l'empreinte n'est pas comparée à l'œil : deux lignes de mêmes compte/date/montant/description partagent la même empreinte", () => {
    const entree = resoudre(entrees, "e-o2", "entrée");
    const resultat1 = preparerRevue([entree], {
      filtres: [],
      beneficiaires: [],
      regles: [],
      existantes: [],
      transactionsAutresComptes: [],
      occurrencesOuvertes: [],
    });
    const resultat2 = preparerRevue([{ ...entree, cle: "autre-cle" }], {
      filtres: [],
      beneficiaires: [],
      regles: [],
      existantes: [],
      transactionsAutresComptes: [],
      occurrencesOuvertes: [],
    });
    expect(resultat1.lignes[0]?.empreinte).toBe(resultat2.lignes[0]?.empreinte);
    expect(resultat1.lignes[0]?.empreinte.length).toBeGreaterThan(0);
  });
});
