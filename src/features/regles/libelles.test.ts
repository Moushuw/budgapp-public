import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { RecapApplication } from "@/server/actions/rules";
import {
  consequenceSuppressionRegle,
  libelleApercuCorrespondances,
  libelleApercuPreservees,
  libelleApercuTronque,
  libelleBilanApplication,
  libelleRegleSupprimee,
  lignesRecapApplication,
} from "./libelles";

function recap(partiel: Partial<RecapApplication>): RecapApplication {
  return { ruleId: "r", modifiees: 0, inchangees: 0, beneficiairesIntrouvables: 0, categoriesPreservees: 0, ignorees: 0, ...partiel };
}

describe("libelles des règles", () => {
  it("RL1 — aperçu : exemples de la spec", () => {
    expect(libelleApercuCorrespondances(1, 1)).toBe("1 transaction correspond, dont 1 serait modifiée.");
    expect(libelleApercuCorrespondances(0, 0)).toBe("0 transaction correspond, dont 0 serait modifiée.");
    expect(libelleApercuCorrespondances(7, 2)).toBe("7 transactions correspondent, dont 2 seraient modifiées.");
  });

  it.each([0, 1, 2, 10])("RL2 — n = %i : le singulier va jusqu'à 1 inclus", (n) => {
    const pluriel = n >= 2;
    expect(libelleApercuPreservees(n)).toContain(pluriel ? "catégories préservées" : "catégorie préservée");
    expect(libelleApercuPreservees(n)).toContain(pluriel ? "ces lignes gardent" : "cette ligne garde");
    expect(libelleApercuTronque(n, n + 3, n)).toContain(pluriel ? "premières" : "première");
    expect(libelleApercuTronque(n, n + 3, n)).toContain(pluriel ? "seront modifiées" : "sera modifiée");
    expect(libelleBilanApplication(n, n, n)).toBe(
      `${String(n)} ${pluriel ? "transactions modifiées" : "transaction modifiée"}, ${String(n)} ${pluriel ? "inchangées" : "inchangée"}, ${String(n)} ${pluriel ? "ignorées" : "ignorée"}.`,
    );
    expect(libelleRegleSupprimee(n)).toBe(
      n === 0
        ? "Règle supprimée."
        : `Règle supprimée, ${String(n)} ${pluriel ? "transactions ont perdu" : "transaction a perdu"} la trace de la règle appliquée.`,
    );
    const lignes = lignesRecapApplication(recap({ modifiees: n, inchangees: n, beneficiairesIntrouvables: n, categoriesPreservees: n, ignorees: n }));
    expect(lignes).toHaveLength(5);
    expect(lignes[0]).toBe(`${String(n)} ${pluriel ? "transactions modifiées" : "transaction modifiée"}.`);
    expect(lignes[2]).toBe(`${String(n)} ${pluriel ? "bénéficiaires introuvables" : "bénéficiaire introuvable"}.`);
    expect(lignes[4]).toContain(pluriel ? "elles ne correspondaient plus" : "elle ne correspondait plus");
    expect(lignes[4]).toContain(pluriel ? "pour les traiter" : "pour la traiter");
  });

  it("RL3 — pied de liste", () => {
    expect(libelleApercuTronque(1, 5, 1)).toBe("1 première des 5 transactions correspondantes — 1 sera modifiée au total.");
  });

  it("RL4 — suppression d'une règle", () => {
    expect(consequenceSuppressionRegle(1, 2, 0, "Café")).toBe(
      "La règle « Café » sera supprimée, avec 1 condition et 2 actions. Aucune transaction ne porte la trace de cette règle.",
    );
    expect(consequenceSuppressionRegle(0, 0, 1, "X")).toContain("1 transaction perdra la trace de la règle appliquée ; elle n'est ni recatégorisée, ni supprimée.");
    expect(consequenceSuppressionRegle(3, 1, 4, "X")).toContain("4 transactions perdront la trace de la règle appliquée ; elles ne sont ni recatégorisées, ni supprimées.");
  });
});

// Motif construit par jointure : ce fichier est lui-même balayé par la garde.
const MOTIF_PLURIEL_ENTRE_PARENTHESES = new RegExp(["\\p{L}", "\\(", "s", "\\)"].join(""), "u");

describe("garde — plus de pluriel entre parenthèses dans src/features/regles", () => {
  it("RL5 — aucun fichier ne contient de pluriel entre parenthèses", () => {
    const dossier = __dirname;
    const fichiers = readdirSync(dossier).filter((f) => f.endsWith(".ts") || f.endsWith(".tsx"));
    expect(fichiers.length).toBeGreaterThan(5);
    for (const fichier of fichiers) {
      expect(MOTIF_PLURIEL_ENTRE_PARENTHESES.test(readFileSync(join(dossier, fichier), "utf8")), fichier).toBe(false);
    }
  });

  it("RL6 — le détecteur attrape le pluriel écrit et ignore une fonction fléchée", () => {
    expect(MOTIF_PLURIEL_ENTRE_PARENTHESES.test(["transaction", "(s", ")"].join(""))).toBe(true);
    expect(MOTIF_PLURIEL_ENTRE_PARENTHESES.test(".map((s) => s)")).toBe(false);
  });
});
