// Garde d'anonymisation (docs/lot-m3.md §10 point 3) : les noms retirés des fixtures et des parcours e2e n'y reviennent
// pas. La liste n'est qu'un ensemble d'empreintes ; les cas synthétiques utilisent un nom inventé.

import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  empreinte,
  formesNormalisees,
  trouverInterdits,
  type FichierLu,
} from "./garde-anonymisation-outils";
import { EMPREINTES_INTERDITES } from "./garde-anonymisation-empreintes";

const RACINE = path.resolve(import.meta.dirname, "..");

function fichiersDe(dossier: string, extensions: readonly string[]): string[] {
  return readdirSync(path.join(RACINE, dossier), { withFileTypes: true, recursive: true })
    .filter((entree) => entree.isFile() && extensions.some((extension) => entree.name.endsWith(extension)))
    .map((entree) => path.join(entree.parentPath, entree.name));
}

function relatif(chemin: string): string {
  return path.relative(RACINE, chemin).split(path.sep).join("/");
}

const corpus: FichierLu[] = [
  ...fichiersDe("src/domain/statement/fixtures", [".txt", ".json"]),
  ...fichiersDe("e2e", [".ts", ".mts", ".json", ".txt"]),
].map((chemin) => ({ chemin: relatif(chemin), texte: readFileSync(chemin, "utf8") }));

// Un nom inventé : son empreinte est calculée ici et injectée, aucune liste réelle n'intervient.
const MOT = "ZORGLUB";
const PAIRE = "MARMELADE ZORGLUB";
const INVENTES = new Set([empreinte(MOT), empreinte(PAIRE)]);
const SEULEMENT_LA_PAIRE = new Set([empreinte(PAIRE)]);

function fichier(texte: string): FichierLu[] {
  return [{ chemin: "synthetique.txt", texte }];
}

describe("garde d'anonymisation", () => {
  it("G1 — aucun fichier du corpus ne contient une forme interdite", () => {
    const trouvees = trouverInterdits(corpus, new Set(EMPREINTES_INTERDITES));
    expect(trouvees.map((o) => `${o.chemin}:${String(o.ligne)} (${o.forme})`)).toEqual([]);
  });

  it("G2 — la liste est non vide, bien formée et sans doublon", () => {
    expect(EMPREINTES_INTERDITES.length).toBeGreaterThan(0);
    for (const e of EMPREINTES_INTERDITES) {
      expect(e).toMatch(/^[0-9a-f]{64}$/);
    }
    expect(new Set(EMPREINTES_INTERDITES).size).toBe(EMPREINTES_INTERDITES.length);
  });

  it.each(["Zörglub", "ZORGLUB", "zorglub"])("G3 — le mot inventé est attrapé sous la forme « %s », sans rendre le texte", (ecrit) => {
    const trouvees = trouverInterdits(fichier(`Achat chez ${ecrit} inc`), INVENTES);
    expect(trouvees).toEqual([{ chemin: "synthetique.txt", ligne: 1, forme: "mot" }]);
  });

  it.each(["marmelade-zorglub", "Marmelade, Zorglub"])("G4 — la paire inventée est attrapée sous la forme « %s »", (ecrit) => {
    const trouvees = trouverInterdits(fichier(ecrit), SEULEMENT_LA_PAIRE);
    expect(trouvees).toEqual([{ chemin: "synthetique.txt", ligne: 1, forme: "paire" }]);
  });

  it("G4b — l'ordre compte, et une paire ne chevauche pas deux lignes", () => {
    expect(trouverInterdits(fichier("zorglub marmelade"), SEULEMENT_LA_PAIRE)).toEqual([]);
    expect(trouverInterdits(fichier("marmelade\nzorglub"), SEULEMENT_LA_PAIRE)).toEqual([]);
  });

  it("G5 — un mot plus long ou entouré de lettres n'est pas attrapé ; un mot de moins de 3 lettres n'est pas un mot", () => {
    expect(trouverInterdits(fichier("ZORGLUBS"), INVENTES)).toEqual([]);
    expect(trouverInterdits(fichier("XZORGLUBX"), INVENTES)).toEqual([]);
    expect(formesNormalisees("ab cd").mots).toEqual([]);
    expect(formesNormalisees("ab cd").paires).toEqual(["AB CD"]);
    const court = new Set([empreinte("AB")]);
    expect(trouverInterdits(fichier("ab"), court)).toEqual([]);
  });

  it("G6 — le numéro de ligne est exact (1-indexé)", () => {
    const troisLignes = trouverInterdits(fichier("zorglub\nrien\nencore ZORGLUB"), INVENTES);
    expect(troisLignes.map((o) => o.ligne)).toEqual([1, 3]);
  });

  it("G7 — le corpus lu contient des fixtures .txt et .json et un fichier de e2e", () => {
    expect(corpus.some((f) => f.chemin.startsWith("src/domain/statement/fixtures/") && f.chemin.endsWith(".txt"))).toBe(true);
    expect(corpus.some((f) => f.chemin.startsWith("src/domain/statement/fixtures/") && f.chemin.endsWith(".json"))).toBe(true);
    expect(corpus.some((f) => f.chemin.startsWith("e2e/"))).toBe(true);
  });

  it("G8 — l'empreinte est le SHA-256 hexadécimal de la forme", () => {
    expect(empreinte("ZORGLUB")).toBe(createHash("sha256").update("ZORGLUB", "utf8").digest("hex"));
  });
});
