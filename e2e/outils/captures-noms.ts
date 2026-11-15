export const VARIABLE_CAPTURES = "BUDGAPP_E2E_CAPTURES";
export const VARIABLE_FILTRE_CAPTURES = "BUDGAPP_E2E_CAPTURES_ECRANS";
export const DOSSIER_CAPTURES = "captures-e2e";
export const FICHIER_INDEX_CAPTURES = "index.md";
export const LONGUEUR_MAX_SLUG = 100;
export const HAUTEUR_MAX_CAPTURE = 2000;

export type ModeCaptures = "NORMAL" | "PASSE";
export type Projet = "mobile" | "bureau";
export type Theme = "clair" | "sombre";
export type PartieCapture =
  | { readonly type: "fenetre" }
  | { readonly type: "page" }
  | { readonly type: "tranche"; readonly numero: number; readonly total: number }
  | { readonly type: "dialogue" };
export const THEMES: readonly Theme[] = ["clair", "sombre"];

export class ErreurCaptures extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ErreurCaptures";
  }
}

export function lireModeCaptures(env: Readonly<Record<string, string | undefined>>): ModeCaptures {
  const valeur = env[VARIABLE_CAPTURES];
  if (valeur === undefined || valeur === "" || valeur === "0") {
    return "NORMAL";
  }
  if (valeur === "1") {
    return "PASSE";
  }
  throw new ErreurCaptures(
    `${VARIABLE_CAPTURES} a une valeur non reconnue : « ${valeur} ». Valeurs acceptées : 1 pour le mode passe, rien ou 0 sinon.`,
  );
}

export function lireProjet(nom: string): Projet {
  if (nom === "mobile" || nom === "bureau") {
    return nom;
  }
  throw new ErreurCaptures(`Projet Playwright inconnu : ${nom}.`);
}

export function slugCapture(contexte: string): string {
  const slug = contexte
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (slug === "") {
    throw new ErreurCaptures(`Contexte de capture sans caractère utilisable : « ${contexte} ».`);
  }
  if (slug.length > LONGUEUR_MAX_SLUG) {
    throw new ErreurCaptures(
      `Contexte de capture trop long (${String(slug.length)} > ${String(LONGUEUR_MAX_SLUG)}) : « ${contexte} ».`,
    );
  }
  return slug;
}

/**
 * Motifs d'écrans à capturer en mode passe, séparés par des virgules ; `null` = tout capturer.
 * Une passe ne capture que les écrans de son lot (docs/pilotage/consignes-benjamin-2026-10-08.md §2.1).
 */
export function lireFiltreCaptures(env: Readonly<Record<string, string | undefined>>): readonly string[] | null {
  const valeur = env[VARIABLE_FILTRE_CAPTURES];
  if (valeur === undefined || valeur.trim() === "") {
    return null;
  }
  return valeur.split(",").map((motif) => {
    if (motif.trim() === "") {
      throw new ErreurCaptures(`${VARIABLE_FILTRE_CAPTURES} contient un motif vide : « ${valeur} ».`);
    }
    return slugCapture(motif);
  });
}

export function captureRetenue(contexte: string, filtre: readonly string[] | null): boolean {
  if (filtre === null) {
    return true;
  }
  const slug = slugCapture(contexte);
  return filtre.some((motif) => slug.includes(motif));
}

export interface Tranche {
  readonly y: number;
  readonly hauteur: number;
}

export function tranchesCapture(hauteur: number): readonly Tranche[] {
  if (!Number.isInteger(hauteur) || hauteur < 1) {
    throw new ErreurCaptures(`Hauteur de page invalide pour une capture : ${String(hauteur)}.`);
  }
  const tranches: Tranche[] = [];
  for (let y = 0; y < hauteur; y += HAUTEUR_MAX_CAPTURE) {
    tranches.push({ y, hauteur: Math.min(HAUTEUR_MAX_CAPTURE, hauteur - y) });
  }
  return tranches;
}

export interface DimensionsPng {
  readonly largeur: number;
  readonly hauteur: number;
}

const SIGNATURE_PNG: readonly number[] = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const BLOC_IHDR: readonly number[] = [0x49, 0x48, 0x44, 0x52];

function entierGrosBoutiste(octets: Uint8Array, debut: number): number {
  const a = octets[debut];
  const b = octets[debut + 1];
  const c = octets[debut + 2];
  const d = octets[debut + 3];
  if (a === undefined || b === undefined || c === undefined || d === undefined) {
    throw new ErreurCaptures("En-tête PNG illisible.");
  }
  return a * 2 ** 24 + b * 2 ** 16 + c * 2 ** 8 + d;
}

export function dimensionsPng(octets: Uint8Array): DimensionsPng {
  const conforme =
    octets.length >= 24 &&
    SIGNATURE_PNG.every((valeur, i) => octets[i] === valeur) &&
    BLOC_IHDR.every((valeur, i) => octets[12 + i] === valeur);
  if (!conforme) {
    throw new ErreurCaptures("En-tête PNG illisible.");
  }
  return { largeur: entierGrosBoutiste(octets, 16), hauteur: entierGrosBoutiste(octets, 20) };
}

function validerTranche(numero: number, total: number): void {
  if (
    !Number.isInteger(numero) ||
    !Number.isInteger(total) ||
    total < 2 ||
    total > 99 ||
    numero < 1 ||
    numero > total
  ) {
    throw new ErreurCaptures(`Tranche de capture invalide : ${String(numero)}/${String(total)}.`);
  }
}

export interface IdentiteCapture {
  readonly projet: Projet;
  readonly theme: Theme;
  readonly contexte: string;
  readonly partie: PartieCapture;
}

export function nomFichierCapture(identite: IdentiteCapture): string {
  const base = `${identite.projet}__${identite.theme}__${slugCapture(identite.contexte)}`;
  const { partie } = identite;
  switch (partie.type) {
    case "dialogue":
      return `${base}__dialogue.png`;
    case "tranche":
      validerTranche(partie.numero, partie.total);
      return `${base}__t${String(partie.numero).padStart(2, "0")}.png`;
    case "fenetre":
    case "page":
      return `${base}.png`;
  }
}

export function libellePartie(partie: PartieCapture): string {
  switch (partie.type) {
    case "fenetre":
      return "fenêtre";
    case "page":
      return "page";
    case "dialogue":
      return "dialogue";
    case "tranche":
      validerTranche(partie.numero, partie.total);
      return `tranche ${String(partie.numero)}/${String(partie.total)}`;
  }
}

export interface EntreeIndexCapture {
  readonly fichier: string;
  readonly partie: PartieCapture;
  readonly largeur: number;
  readonly hauteur: number;
  readonly contexte: string;
  readonly url: string;
  readonly dialogue: string | null;
  readonly projet: Projet;
  readonly theme: Theme;
}

export function enteteIndexCaptures(): string {
  return [
    "# Captures e2e — mode passe",
    "",
    "Une ligne par fichier. Capture : `fenêtre` = ce que voit l'utilisateur quand un dialogue est ouvert ; `page` = page entière de 2000 px de haut au plus ; `tranche n/N` = page de plus de 2000 px découpée en N tranches de 2000 px au plus (suffixe `__tNN`), à lire dans l'ordre ; `dialogue` = élément entier d'un dialogue plus haut que la fenêtre (suffixe `__dialogue`).",
    "",
    "| Fichier | Capture | Taille (px) | Écran ou dialogue (contexte) | URL | Dialogue ouvert | Projet | Thème |",
    "|---|---|---|---|---|---|---|---|",
    "",
  ].join("\n");
}

function champIndex(texte: string): string {
  return texte.replace(/\r\n|\r|\n/g, " ").replace(/\|/g, "\\|");
}

export function ligneIndexCapture(entree: EntreeIndexCapture): string {
  const champs = [
    entree.fichier,
    libellePartie(entree.partie),
    `${String(entree.largeur)} × ${String(entree.hauteur)}`,
    entree.contexte,
    entree.url,
    entree.dialogue ?? "—",
    entree.projet,
    entree.theme,
  ].map(champIndex);
  return `| ${champs.join(" | ")} |\n`;
}
