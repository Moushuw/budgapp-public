// Outils de la garde d'anonymisation (docs/lot-m3.md §10 point 3) : un nom réel retiré du dépôt ne doit jamais y
// revenir, mais la liste de ce qui est interdit ne peut pas, elle-même, contenir ces noms. On ne compare donc que des
// empreintes SHA-256 de formes normalisées, et un résultat ne dit jamais le texte trouvé.

import { createHash } from "node:crypto";

export type FormeInterdite = "mot" | "paire";

export interface FichierLu {
  readonly chemin: string;
  readonly texte: string;
}

/** Jamais le texte : le fichier, la ligne (1-indexée) et la nature de la forme. */
export interface Occurrence {
  readonly chemin: string;
  readonly ligne: number;
  readonly forme: FormeInterdite;
}

const MOT = /^[A-Z]{3,}$/;
const MOT_DE_PAIRE = /^[A-Z]{2,}$/;

/**
 * Majuscules sans accents, découpées sur tout ce qui n'est pas A-Z ou 0-9. Mots : jetons de 3 lettres ou plus.
 * Paires : deux jetons consécutifs de la même ligne, de 2 lettres ou plus chacun, joints par une espace.
 */
export function formesNormalisees(ligne: string): { readonly mots: readonly string[]; readonly paires: readonly string[] } {
  const jetons = ligne
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter((jeton) => jeton !== "");
  const mots = jetons.filter((jeton) => MOT.test(jeton));
  const paires: string[] = [];
  for (let i = 0; i + 1 < jetons.length; i += 1) {
    const premier = jetons[i];
    const second = jetons[i + 1];
    if (premier !== undefined && second !== undefined && MOT_DE_PAIRE.test(premier) && MOT_DE_PAIRE.test(second)) {
      paires.push(`${premier} ${second}`);
    }
  }
  return { mots, paires };
}

/** SHA-256 hexadécimal minuscule de la forme normalisée, encodée en UTF-8. */
export function empreinte(forme: string): string {
  return createHash("sha256").update(forme, "utf8").digest("hex");
}

export function trouverInterdits(
  fichiers: readonly FichierLu[],
  empreintes: ReadonlySet<string>,
): readonly Occurrence[] {
  const trouvees: Occurrence[] = [];
  for (const { chemin, texte } of fichiers) {
    texte.split(/\r?\n/).forEach((ligne, index) => {
      const { mots, paires } = formesNormalisees(ligne);
      for (const mot of mots) {
        if (empreintes.has(empreinte(mot))) {
          trouvees.push({ chemin, ligne: index + 1, forme: "mot" });
        }
      }
      for (const paire of paires) {
        if (empreintes.has(empreinte(paire))) {
          trouvees.push({ chemin, ligne: index + 1, forme: "paire" });
        }
      }
    });
  }
  return trouvees;
}
