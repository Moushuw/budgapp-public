// Garde : aucun fichier de src/ ou de e2e/ ne cite le dossier des fichiers
// éphémères du pipeline (CLAUDE.md §13, docs/lot-m2.md §10.1.4). La chaîne
// cherchée est construite pour que ce fichier ne se signale pas lui-même.

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const MOTIF = [".", "pipeline", "/"].join("");
const RACINE = path.resolve(import.meta.dirname, "..");
const DOSSIERS = ["src", "e2e"];

function lignesContenant(texte: string, motif: string): number[] {
  const numeros: number[] = [];
  texte.split(/\r?\n/).forEach((ligne, index) => {
    if (ligne.includes(motif)) numeros.push(index + 1);
  });
  return numeros;
}

function fichiersDe(dossier: string): string[] {
  return readdirSync(path.join(RACINE, dossier), { withFileTypes: true, recursive: true })
    .filter((entree) => entree.isFile())
    .map((entree) => path.join(entree.parentPath, entree.name));
}

function relatif(chemin: string): string {
  return path.relative(RACINE, chemin).split(path.sep).join("/");
}

describe("renvois aux fichiers éphémères du pipeline", () => {
  const lus = DOSSIERS.flatMap((dossier) =>
    fichiersDe(dossier).map((chemin) => ({
      dossier,
      chemin: relatif(chemin),
      texte: readFileSync(chemin, "utf8"),
    })),
  );

  it("G1 — aucun fichier de src/ ni de e2e/ ne les cite", () => {
    const occurrences = lus.flatMap(({ chemin, texte }) =>
      lignesContenant(texte, MOTIF).map((ligne) => `${chemin}:${ligne}`),
    );
    expect(occurrences).toEqual([]);
  });

  it("G2 — le détecteur détecte", () => {
    expect(lignesContenant(`a\nb ${MOTIF}spec.md\nc`, MOTIF)).toEqual([2]);
  });

  it("G3 — la garde lit bien des fichiers dans src et dans e2e", () => {
    for (const dossier of DOSSIERS) {
      expect(lus.some((fichier) => fichier.dossier === dossier)).toBe(true);
    }
  });
});
