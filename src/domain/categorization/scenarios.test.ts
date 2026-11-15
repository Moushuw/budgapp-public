// docs/lot-m1.md §9 — l'oracle fait foi : en cas d'écart, on ne le
// régénère jamais depuis la sortie de categoriser(). Modèle de
// src/domain/statement/fixtures.test.ts.

import { describe, expect, it } from "vitest";
import { categoriser } from "./categoriser";
import type { ContexteBeneficiaire, LigneACategoriser, RegleCategorisation, ResultatCategorisation } from "./types";

import scenariosJson from "./fixtures/scenarios.json";

interface ScenarioJson {
  readonly nom: string;
  readonly ligne: string;
  readonly beneficiaire: string | null;
  readonly regles: readonly string[];
  readonly attendu: unknown;
}

const regles = scenariosJson.regles as unknown as Record<string, RegleCategorisation>;
const lignes = scenariosJson.lignes as unknown as Record<string, LigneACategoriser>;
const beneficiaires = scenariosJson.beneficiaires as unknown as Record<string, ContexteBeneficiaire>;
const scenarios = scenariosJson.scenarios as unknown as readonly ScenarioJson[];

function projeter(resultat: ResultatCategorisation) {
  return {
    affectation: resultat.affectation,
    regleAppliqueeId: resultat.regleAppliqueeId,
    reglesCorrespondantes: resultat.reglesCorrespondantes,
    conflits: resultat.conflits,
    reglesInapplicables: resultat.reglesInapplicables.map(({ ruleId, motif }) => ({ ruleId, motif })),
    actionsNonAppliquees: resultat.actionsNonAppliquees.map(({ ruleId, type, motif }) => ({ ruleId, type, motif })),
  };
}

function resoudreRegle(id: string): RegleCategorisation {
  const regle = regles[id];
  if (regle === undefined) {
    throw new Error(`fixture invalide : règle « ${id} » inconnue`);
  }
  return regle;
}

function resoudreLigne(cle: string): LigneACategoriser {
  const ligne = lignes[cle];
  if (ligne === undefined) {
    throw new Error(`fixture invalide : ligne « ${cle} » inconnue`);
  }
  return ligne;
}

function resoudreBeneficiaire(cle: string | null): ContexteBeneficiaire | null {
  if (cle === null) {
    return null;
  }
  const beneficiaire = beneficiaires[cle];
  if (beneficiaire === undefined) {
    throw new Error(`fixture invalide : bénéficiaire « ${cle} » inconnu`);
  }
  return beneficiaire;
}

describe("scenarios.json — l'oracle", () => {
  for (const scenario of scenarios) {
    it(`${scenario.nom} correspond exactement à l'attendu`, () => {
      const ligne = resoudreLigne(scenario.ligne);
      const beneficiaire = resoudreBeneficiaire(scenario.beneficiaire);
      const reglesScenario = scenario.regles.map(resoudreRegle);

      const resultat = categoriser(ligne, beneficiaire, reglesScenario);

      expect(projeter(resultat)).toEqual(scenario.attendu);
    });
  }

  it("les 26 scénarios de la spec sont tous présents", () => {
    const noms = scenarios.map((scenario) => scenario.nom);
    expect(noms).toHaveLength(26);
    expect(new Set(noms).size).toBe(26);
  });
});
