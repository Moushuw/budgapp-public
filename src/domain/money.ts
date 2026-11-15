// Le seul endroit où on manipule des montants — CLAUDE.md §11.

export type Cents = number; // entier signé ; négatif = sortie d'argent
export type Arrondi = "CENTS" | "DOLLARS";

const FORME_MONTANT = /^([+-]?)(\d+)(?:[.,](\d+))?$/;

/**
 * Avale les formes réelles d'un relevé Desjardins : « 1 240,00 $ », « −54,99 »,
 * « +2 406,00 $ », « 12 $ », espaces insécables, virgule ou point décimal, signe
 * moins typographique « − ». Retourne `null` sur une entrée illisible — jamais
 * `NaN`, jamais `0` par défaut (c'était le bug de la v1).
 */
export function parseMontant(texte: string): Cents | null {
  const nettoye = texte
    .replace(/−/g, "-") // signe moins typographique
    .replace(/\$/g, "")
    .replace(/\s/g, ""); // espace, insécable ( ) et insécable étroite ( )

  const correspondance = FORME_MONTANT.exec(nettoye);
  if (!correspondance) {
    return null;
  }

  const [, signe, partieEntiere, partieDecimale = ""] = correspondance;

  // Arrondi au cent le plus proche à partir des trois premiers chiffres
  // décimaux, en arithmétique entière (jamais de flottant sur les montants).
  const decimalePadded = `${partieDecimale}000`.slice(0, 3);
  const deuxPremiers = Number(decimalePadded.slice(0, 2));
  const troisieme = Number(decimalePadded.charAt(2));

  let entier = Number(partieEntiere);
  let centimes = deuxPremiers;
  if (troisieme >= 5) {
    centimes += 1;
  }
  if (centimes >= 100) {
    centimes -= 100;
    entier += 1;
  }

  const montant = entier * 100 + centimes;
  return signe === "-" ? -montant : montant;
}

/** Formate un montant en cents pour l'affichage, en fr-CA / CAD. */
export function formatMontant(c: Cents, arrondi: Arrondi = "CENTS"): string {
  const dollars = c / 100;
  const valeur = arrondi === "DOLLARS" ? Math.round(dollars) : dollars;
  const decimales = arrondi === "DOLLARS" ? 0 : 2;

  return new Intl.NumberFormat("fr-CA", {
    style: "currency",
    currency: "CAD",
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  }).format(valeur);
}

export interface SegmentMontant {
  readonly texte: string;
  readonly montant: boolean;
}

// Forme produite par formatMontant (CENTS) en fr-CA : signe facultatif, groupes de milliers séparés
// par une espace (insécable ou fine), virgule décimale, espace avant « $ ».
const MOTIF_MONTANT_FORMATE = /(?<![\d,.])[-−]?\d+(?:[\s  ]\d{3})*,\d{2}[\s  ]\$/gu;

/** Découpe `texte` en segments contigus ; `montant: true` pour chaque sous-chaîne produite par formatMontant (CENTS). */
export function decouperMontants(texte: string): readonly SegmentMontant[] {
  const segments: SegmentMontant[] = [];
  let curseur = 0;
  for (const correspondance of texte.matchAll(MOTIF_MONTANT_FORMATE)) {
    const debut = correspondance.index;
    if (debut > curseur) {
      segments.push({ texte: texte.slice(curseur, debut), montant: false });
    }
    segments.push({ texte: correspondance[0], montant: true });
    curseur = debut + correspondance[0].length;
  }
  if (curseur < texte.length) {
    segments.push({ texte: texte.slice(curseur), montant: false });
  }
  return segments;
}

export function additionner(...montants: Cents[]): Cents {
  return montants.reduce((total, montant) => total + montant, 0);
}

function valeurA(valeurs: Cents[], index: number): Cents {
  const valeur = valeurs[index];
  if (valeur === undefined) {
    throw new Error(`quantile : index ${index} hors limites`);
  }
  return valeur;
}

/**
 * Quantile continu (interpolation linéaire entre statistiques d'ordre),
 * cohérent avec `percentile_cont` côté PostgreSQL — CLAUDE.md §7.
 */
export function quantile(valeurs: Cents[], q: number): Cents {
  if (valeurs.length === 0) {
    throw new Error("quantile : tableau de valeurs vide");
  }

  const triees = [...valeurs].sort((a, b) => a - b);
  const rang = q * (triees.length - 1);
  const bas = Math.floor(rang);
  const haut = Math.ceil(rang);

  if (bas === haut) {
    return valeurA(triees, bas);
  }

  const poids = rang - bas;
  const valeurBasse = valeurA(triees, bas);
  const valeurHaute = valeurA(triees, haut);
  return Math.round(valeurBasse + (valeurHaute - valeurBasse) * poids);
}

export function mediane(valeurs: Cents[]): Cents {
  return quantile(valeurs, 0.5);
}
