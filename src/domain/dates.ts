// Dates civiles — CLAUDE.md §11. Le type est une chaîne, jamais un `Date` :
// c'est ce qui rend impossible le décalage d'un jour par conversion de fuseau.
// Toute arithmétique passe par des jours-époque calculés en UTC, jamais par
// les accesseurs locaux de `Date` (getFullYear, getMonth, getDate).

export type DateCivile = string; // "AAAA-MM-JJ"

// 12 cadences — le jeu de YNAB (docs/lot-m0-revision.md §3, enum Cadence du
// schéma). PONCTUEL est une occurrence unique datée, jamais répétée.
export type Cadence =
  | "HEBDO"
  | "AUX_2_SEMAINES"
  | "AUX_4_SEMAINES"
  | "DEUX_FOIS_PAR_MOIS"
  | "MENSUEL"
  | "AUX_2_MOIS"
  | "AUX_3_MOIS"
  | "AUX_4_MOIS"
  | "SEMESTRIEL"
  | "ANNUEL"
  | "AUX_2_ANS"
  | "PONCTUEL";

const FORME_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const JOUR_EN_MS = 86_400_000;

function parseDateCivile(d: DateCivile): [number, number, number] {
  const correspondance = FORME_DATE.exec(d);
  if (!correspondance) {
    throw new Error(`date civile invalide : ${d}`);
  }
  const [, a, m, j] = correspondance;
  return [Number(a), Number(m), Number(j)];
}

function parseMois(mois: string): [number, number] {
  const correspondance = /^(\d{4})-(\d{2})$/.exec(mois);
  if (!correspondance) {
    throw new Error(`mois invalide : ${mois}`);
  }
  const [, a, m] = correspondance;
  return [Number(a), Number(m)];
}

function formatDateCivile(a: number, m: number, j: number): DateCivile {
  return `${String(a).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(j).padStart(2, "0")}`;
}

function joursDansMois(annee: number, mois: number): number {
  // Le jour 0 du mois suivant est le dernier jour du mois courant.
  return new Date(Date.UTC(annee, mois, 0)).getUTCDate();
}

function toEpochJours(d: DateCivile): number {
  const [a, m, j] = parseDateCivile(d);
  return Date.UTC(a, m - 1, j) / JOUR_EN_MS;
}

function fromEpochJours(jours: number): DateCivile {
  const date = new Date(jours * JOUR_EN_MS);
  return formatDateCivile(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

/** Construit une date civile ; lève une erreur si la combinaison n'existe pas (ex. le 30 février). */
export function dateCivile(a: number, m: number, j: number): DateCivile {
  const date = new Date(Date.UTC(a, m - 1, j));
  if (date.getUTCFullYear() !== a || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== j) {
    throw new Error(`date invalide : ${a}-${m}-${j}`);
  }
  return formatDateCivile(a, m, j);
}

/** Vrai si la chaîne est une date civile bien formée ET existante (« 2026-02-30 » est faux). */
export function estDateCivile(valeur: string): boolean {
  const correspondance = FORME_DATE.exec(valeur);
  if (!correspondance) {
    return false;
  }
  const [, a, m, j] = correspondance;
  try {
    dateCivile(Number(a), Number(m), Number(j));
    return true;
  } catch {
    return false;
  }
}

/** Date civile → instant UTC minuit, pour écrire une colonne @db.Date. Lève sur une date invalide. */
export function versDateUtc(d: DateCivile): Date {
  const [a, m, j] = parseDateCivile(d);
  dateCivile(a, m, j); // lève si la combinaison n'existe pas
  return new Date(Date.UTC(a, m - 1, j));
}

/** Colonne @db.Date lue par Prisma → date civile, en getUTC* uniquement, jamais de getFullYear local. */
export function depuisDateUtc(valeur: Date): DateCivile {
  return formatDateCivile(valeur.getUTCFullYear(), valeur.getUTCMonth() + 1, valeur.getUTCDate());
}

/** Le fuseau de l'application (Québec) — le même que `timezoneId` de playwright.config.ts. */
export const FUSEAU_APPLICATION = "America/Toronto";

/**
 * La date civile d'un instant dans un fuseau. Lit les parties du formateur,
 * jamais la chaîne formatée ni un accesseur local de `Date`. Lève (RangeError
 * d'Intl) sur un fuseau inconnu.
 */
export function dateCivileDansFuseau(instant: Date, fuseau: string): DateCivile {
  const parties = new Intl.DateTimeFormat("en-CA", {
    timeZone: fuseau,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const valeur = (type: "year" | "month" | "day"): number => Number(parties.find((partie) => partie.type === type)?.value);
  return formatDateCivile(valeur("year"), valeur("month"), valeur("day"));
}

export function ajouterJours(d: DateCivile, n: number): DateCivile {
  return fromEpochJours(toEpochJours(d) + n);
}

/** Ajoute des mois en conservant le jour d'ancrage d'origine, borné au dernier jour du mois cible. */
export function ajouterMois(d: DateCivile, n: number): DateCivile {
  const [a, m, j] = parseDateCivile(d);
  const totalMois = m - 1 + n;
  const anneeCible = a + Math.floor(totalMois / 12);
  const moisCible = ((totalMois % 12) + 12) % 12;
  const jourCible = Math.min(j, joursDansMois(anneeCible, moisCible + 1));
  return dateCivile(anneeCible, moisCible + 1, jourCible);
}

export function moisDe(d: DateCivile): string {
  const [a, m] = parseDateCivile(d);
  return `${String(a).padStart(4, "0")}-${String(m).padStart(2, "0")}`;
}

/** Premier jour civil du mois ("AAAA-MM" → "AAAA-MM-01"). */
export function premierJourDuMois(mois: string): DateCivile {
  const [a, m] = parseMois(mois);
  return dateCivile(a, m, 1);
}

/** Dernier jour civil du mois ("AAAA-MM" → "AAAA-MM-28/29/30/31"). */
export function dernierJourDuMois(mois: string): DateCivile {
  const [a, m] = parseMois(mois);
  return dateCivile(a, m, joursDansMois(a, m));
}

export function moisSuivant(mois: string): string {
  return moisDe(ajouterMois(premierJourDuMois(mois), 1));
}

export function moisPrecedent(mois: string): string {
  return moisDe(ajouterMois(premierJourDuMois(mois), -1));
}

/** Nombre de mois entre deux mois civils (b − a, signé). */
export function differenceMois(a: string, b: string): number {
  const [anneeA, moisA] = parseMois(a);
  const [anneeB, moisB] = parseMois(b);
  return (anneeB - anneeA) * 12 + (moisB - moisA);
}

/** Liste des mois "AAAA-MM" de `debut` à `fin`, inclusivement. */
export function moisDansPlage(debut: string, fin: string): string[] {
  const resultat: string[] = [];
  for (let mois = debut; differenceMois(mois, fin) >= 0; mois = moisSuivant(mois)) {
    resultat.push(mois);
  }
  return resultat;
}

/** Nombre de jours entre deux dates civiles (b - a, signé). */
export function ecartJours(a: DateCivile, b: DateCivile): number {
  return toEpochJours(b) - toEpochJours(a);
}

const PAS_JOURS: Partial<Record<Cadence, number>> = {
  HEBDO: 7,
  AUX_2_SEMAINES: 14,
  AUX_4_SEMAINES: 28,
};

const PAS_MOIS: Partial<Record<Cadence, number>> = {
  MENSUEL: 1,
  AUX_2_MOIS: 2,
  AUX_3_MOIS: 3,
  AUX_4_MOIS: 4,
  SEMESTRIEL: 6,
  ANNUEL: 12,
  AUX_2_ANS: 24,
};

function echeancesParPasJours(ancrage: DateCivile, jusqua: DateCivile, pasJours: number): DateCivile[] {
  const resultat: DateCivile[] = [];
  for (let k = 0; ; k++) {
    const occurrence = ajouterJours(ancrage, k * pasJours);
    if (occurrence > jusqua) {
      break;
    }
    resultat.push(occurrence);
  }
  return resultat;
}

function echeancesParPasMois(ancrage: DateCivile, jusqua: DateCivile, pasMois: number): DateCivile[] {
  const resultat: DateCivile[] = [];
  for (let k = 0; ; k++) {
    const occurrence = ajouterMois(ancrage, k * pasMois);
    if (occurrence > jusqua) {
      break;
    }
    resultat.push(occurrence);
  }
  return resultat;
}

/**
 * Échéances d'une cadence entre `ancrage` (inclus) et `jusqua` (inclus).
 * Chaque occurrence mensuelle ou plus large se recale sur le jour d'ancrage
 * d'origine, pas sur l'occurrence précédente : un ancrage le 31 revient au 31
 * dès qu'un mois de 31 jours se présente, plutôt que de dériver vers le 30 ou
 * le 28.
 *
 * `PONCTUEL` est une occurrence unique, non répétée. `DEUX_FOIS_PAR_MOIS`
 * compose deux séries mensuelles indépendantes, l'ancrage et l'ancrage + 15
 * jours, chacune recalée sur son propre jour d'origine chaque mois.
 */
export function echeances(cadence: Cadence, ancrage: DateCivile, jusqua: DateCivile): DateCivile[] {
  if (cadence === "PONCTUEL") {
    return ancrage <= jusqua ? [ancrage] : [];
  }

  if (cadence === "DEUX_FOIS_PAR_MOIS") {
    const secondAncrage = ajouterJours(ancrage, 15);
    return [...echeancesParPasMois(ancrage, jusqua, 1), ...echeancesParPasMois(secondAncrage, jusqua, 1)].sort();
  }

  const pasJours = PAS_JOURS[cadence];
  if (pasJours !== undefined) {
    return echeancesParPasJours(ancrage, jusqua, pasJours);
  }

  return echeancesParPasMois(ancrage, jusqua, PAS_MOIS[cadence] ?? 1);
}

/** Jour de la semaine ISO d'une date civile : 1 = lundi … 7 = dimanche. Calculé sur les jours-époque, jamais par getDay(). */
export function jourSemaine(d: DateCivile): number {
  const k = ecartJours("1970-01-01", d);
  return ((((k % 7) + 7) % 7) + 3) % 7 + 1;
}
