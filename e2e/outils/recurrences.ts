// Localisateurs de l'écran des récurrences et lectures d'oracle (lecture seule, hors de l'application) —
// docs/lot-m3.md §4.7 et §8.

import { expect, type Locator, type Page } from "@playwright/test";
import { depuisDateUtc, ecartJours, versDateUtc, type DateCivile } from "@/domain/dates";
import type { Cents } from "@/domain/money";
import { FENETRE_LIAISON_MANUELLE_JOURS, LIMITE_CANDIDATS_LIAISON } from "@/domain/recurrence";
import { clientE2e } from "./base";

export type SectionRecurrences = "suggestions" | "series" | "non-vus";

export function sectionRecurrences(page: Page, nom: SectionRecurrences): Locator {
  return page.locator(`section[data-section="${nom}"]`);
}

/** La carte de suggestion dont la phrase contient `texte`. */
export function carteSuggestion(page: Page, texte: string): Locator {
  return sectionRecurrences(page, "suggestions")
    .locator("[data-suggestion-id]")
    .filter({ has: page.locator("[data-phrase]", { hasText: texte }) });
}

export function ligneSerie(page: Page, libelle: string): Locator {
  return sectionRecurrences(page, "series")
    .locator("[data-serie-id]")
    .filter({ has: page.locator('[data-colonne="serie"]', { hasText: libelle }) });
}

export function ligneNonVu(page: Page, occurrenceId: string): Locator {
  return sectionRecurrences(page, "non-vus").locator(`[data-occurrence-id="${occurrenceId}"]`);
}

export function panneauEcheances(page: Page, libelle: string): Locator {
  return page.getByRole("dialog", { name: `Échéances de ${libelle}`, exact: true });
}

export type PortionEcheances = "a-venir" | "passees";

/** Une des deux sections du panneau des échéances. */
export function sectionEcheances(panneau: Locator, portion: PortionEcheances): Locator {
  return panneau.locator(`section[data-section-echeances="${portion}"]`);
}

export function piedEcheances(panneau: Locator, portion: PortionEcheances): Locator {
  return panneau.locator(`[data-pied-echeances="${portion}"]`);
}

/** `occurrences` triées par échéance croissante (occurrencesDeRegle). À venir : croissant ; passées : décroissant. */
export function repartirEcheances(
  occurrences: readonly OccurrenceLue[],
  aujourdhui: DateCivile,
): { readonly aVenir: readonly OccurrenceLue[]; readonly passees: readonly OccurrenceLue[] } {
  return {
    aVenir: occurrences.filter((o) => o.echeance >= aujourdhui),
    passees: occurrences.filter((o) => o.echeance < aujourdhui).reverse(),
  };
}

/** Le premier tableau de la section des séries et celui des séries terminées dépliées. */
export function tableauSeriesActives(page: Page): Locator {
  return sectionRecurrences(page, "series").locator('[data-slot="table"]').first();
}

export function tableauSeriesTerminees(page: Page): Locator {
  return sectionRecurrences(page, "series").locator('details[data-section="series-terminees"] [data-slot="table"]');
}

/** `left` et `width` de chaque en-tête `[data-colonne]` d'un tableau, par colonne. */
export async function mesurerColonnes(tableau: Locator): Promise<Record<string, { left: number; width: number }>> {
  return tableau.evaluate((table) => {
    const resultat: Record<string, { left: number; width: number }> = {};
    for (const th of Array.from(table.querySelectorAll("th[data-colonne]"))) {
      const rect = th.getBoundingClientRect();
      resultat[th.getAttribute("data-colonne") ?? ""] = { left: rect.left, width: rect.width };
    }
    return resultat;
  });
}

export interface PoliceMesuree {
  readonly chiffres: string;
  readonly famille: string;
}

/** La police d'une sonde `<span class="font-montant">` : la référence des montants de l'interface. */
export async function policeDesMontants(page: Page): Promise<PoliceMesuree> {
  return page.evaluate(() => {
    const sonde = document.createElement("span");
    sonde.className = "font-montant";
    document.body.append(sonde);
    const style = getComputedStyle(sonde);
    const mesure = { chiffres: style.fontVariantNumeric, famille: style.fontFamily };
    sonde.remove();
    return mesure;
  });
}

export async function mesurerPolices(elements: Locator): Promise<readonly PoliceMesuree[]> {
  return elements.evaluateAll((noeuds) =>
    noeuds.map((noeud) => {
      const style = getComputedStyle(noeud);
      return { chiffres: style.fontVariantNumeric, famille: style.fontFamily };
    }),
  );
}

export type ActionSerie = "Voir les échéances" | "Modifier" | "Terminer" | "Supprimer";

export async function ouvrirActionSerie(page: Page, libelle: string, action: ActionSerie): Promise<void> {
  await ligneSerie(page, libelle).getByRole("button", { name: `Actions de la série ${libelle}`, exact: true }).click();
  await page.getByRole("menuitem", { name: action, exact: true }).click();
}

/** Le bloc de rapprochement visible d'une ligne de la revue (la ligne est rendue deux fois : tableau et cartes). */
export function blocRapprochement(page: Page, mode: "auto" | "a-confirmer"): Locator {
  return page.locator(`[data-rapprochement="${mode}"]`).filter({ visible: true });
}

/** Attend que l'écran ait rendu ses trois sections. */
export async function attendreEcranRecurrences(page: Page): Promise<void> {
  await expect(page.getByRole("heading", { name: "Récurrences", exact: true, level: 1 })).toBeVisible();
  await expect(sectionRecurrences(page, "suggestions")).toBeVisible();
  await expect(sectionRecurrences(page, "series")).toBeVisible();
  await expect(sectionRecurrences(page, "non-vus")).toBeVisible();
}

// ── oracles, en lecture seule

async function proprietaire(): Promise<string> {
  return (await clientE2e().user.findFirstOrThrow({ orderBy: { createdAt: "asc" }, select: { id: true } })).id;
}

export async function dateMaxTransactions(): Promise<DateCivile | null> {
  const agregat = await clientE2e().transaction.aggregate({
    where: { ownerId: await proprietaire(), parentId: null },
    _max: { date: true },
  });
  return agregat._max.date === null ? null : depuisDateUtc(agregat._max.date);
}

export interface RegleLue {
  readonly id: string;
  readonly libelle: string;
  readonly accountId: string;
  readonly scoreConfiance: number | null;
  readonly dateFin: DateCivile | null;
}

export async function regleParLibelle(libelle: string): Promise<RegleLue | null> {
  const regle = await clientE2e().recurringRule.findFirst({
    where: { ownerId: await proprietaire(), libelle },
    select: { id: true, libelle: true, accountId: true, scoreConfiance: true, dateFin: true },
  });
  return regle === null ? null : { ...regle, dateFin: regle.dateFin === null ? null : depuisDateUtc(regle.dateFin) };
}

export interface OccurrenceLue {
  readonly id: string;
  readonly ruleId: string;
  readonly echeance: DateCivile;
  readonly montantCents: Cents;
  readonly etat: string;
  readonly liaison: string | null;
  readonly transactionId: string | null;
}

export async function occurrencesDeRegle(ruleId: string): Promise<OccurrenceLue[]> {
  const lignes = await clientE2e().expectedOccurrence.findMany({
    where: { ruleId },
    orderBy: [{ echeance: "asc" }, { id: "asc" }],
    take: 500,
    select: { id: true, ruleId: true, echeance: true, montantCents: true, etat: true, liaison: true, transactionId: true },
  });
  return lignes.map((o) => ({ ...o, echeance: depuisDateUtc(o.echeance) }));
}

export async function occurrenceParEcheance(libelleRegle: string, echeance: DateCivile): Promise<OccurrenceLue> {
  const ligne = await clientE2e().expectedOccurrence.findFirstOrThrow({
    where: { echeance: versDateUtc(echeance), rule: { ownerId: await proprietaire(), libelle: libelleRegle } },
    select: { id: true, ruleId: true, echeance: true, montantCents: true, etat: true, liaison: true, transactionId: true },
  });
  return { ...ligne, echeance: depuisDateUtc(ligne.echeance) };
}

export interface TransactionNetflix {
  readonly id: string;
  readonly date: DateCivile;
  readonly montantCents: Cents;
}

/** Compte « Visa », descriptionNormalisee « NETFLIX.COM », lignes de liste, par date croissante. */
export async function transactionsNetflix(): Promise<TransactionNetflix[]> {
  const lignes = await clientE2e().transaction.findMany({
    where: {
      ownerId: await proprietaire(),
      account: { nom: "Visa" },
      descriptionNormalisee: "NETFLIX.COM",
      parentId: null,
    },
    orderBy: [{ date: "asc" }, { id: "asc" }],
    take: 200,
    select: { id: true, date: true, montantCents: true },
  });
  return lignes.map((l) => ({ id: l.id, date: depuisDateUtc(l.date), montantCents: l.montantCents }));
}

/** Ligne unique d'un relevé Visa inventé, forme de la dernière ligne des fixtures Netflix : « 12 Décembre NETFLIX.COM 17,99 $ ». */
export function ligneReleveVisa(jour: number, mois: string, description: string, montantCents: Cents): string {
  const absolu = Math.abs(montantCents);
  const texte = `${String(Math.trunc(absolu / 100))},${String(absolu % 100).padStart(2, "0")}`;
  return `${String(jour)} ${mois} ${description} ${texte} $`;
}

export interface EcheanceCandidateOracle {
  readonly libelle: string;
  readonly echeance: DateCivile;
  readonly montantCents: Cents;
  readonly ecartJours: number;
}

export interface TransactionAvecCandidates {
  readonly id: string;
  readonly date: DateCivile;
  readonly accountId: string;
  /** Triés comme l'application : écart croissant, puis échéance, puis id ; au plus LIMITE_CANDIDATS_LIAISON. */
  readonly candidates: readonly EcheanceCandidateOracle[];
}

function comparerTexte(a: string, b: string): number {
  if (a < b) return -1;
  return a > b ? 1 : 0;
}

/** Lecture seule, indépendante du repository. Lève une Error si aucune transaction n'a `minimum` candidates. */
export async function transactionAvecEcheancesCandidates(nomCompte: string, minimum: number): Promise<TransactionAvecCandidates> {
  const client = clientE2e();
  const ownerId = await proprietaire();
  const transactions = await client.transaction.findMany({
    where: {
      ownerId,
      account: { nom: nomCompte },
      parentId: null,
      estVentilee: false,
      transferTransactionId: null,
      occurrence: null,
      ajustement: null,
    },
    orderBy: [{ date: "desc" }, { id: "asc" }],
    take: 5000,
    select: { id: true, date: true, accountId: true },
  });
  const occurrences = await client.expectedOccurrence.findMany({
    where: { transactionId: null, etat: { in: ["PREVUE", "MANQUEE"] }, rule: { ownerId, account: { nom: nomCompte } } },
    orderBy: [{ echeance: "asc" }, { id: "asc" }],
    take: 5000,
    select: { id: true, echeance: true, montantCents: true, rule: { select: { libelle: true, accountId: true } } },
  });

  let meilleure: TransactionAvecCandidates | null = null;
  for (const transaction of transactions) {
    const date = depuisDateUtc(transaction.date);
    const candidates = occurrences
      .filter((o) => o.rule.accountId === transaction.accountId)
      .map((o) => {
        const echeance = depuisDateUtc(o.echeance);
        return { id: o.id, libelle: o.rule.libelle, echeance, montantCents: o.montantCents, ecart: ecartJours(date, echeance) };
      })
      .filter((o) => Math.abs(o.ecart) <= FENETRE_LIAISON_MANUELLE_JOURS)
      .sort((a, b) => Math.abs(a.ecart) - Math.abs(b.ecart) || comparerTexte(a.echeance, b.echeance) || comparerTexte(a.id, b.id))
      .slice(0, LIMITE_CANDIDATS_LIAISON)
      .map((o) => ({
        libelle: o.libelle,
        echeance: o.echeance,
        montantCents: o.montantCents,
        ecartJours: Math.abs(o.ecart),
      }));
    const courante: TransactionAvecCandidates = { id: transaction.id, date, accountId: transaction.accountId, candidates };
    if (meilleure === null || candidates.length > meilleure.candidates.length) {
      meilleure = courante;
    }
  }
  if (meilleure === null || meilleure.candidates.length < minimum) {
    throw new Error(
      `Aucune transaction du compte « ${nomCompte} » n'a au moins ${String(minimum)} échéances candidates : le seed a changé, ou l'état des parcours précédents.`,
    );
  }
  return meilleure;
}

/** Les mesures communes aux deux dialogues de liaison (« Lier à une transaction », « Lier à une échéance »). */
export async function verifierListeChoixLiaison(
  page: Page,
  dialogue: Locator,
  colonneLongue: "description" | "serie",
  minimumLignes: number,
): Promise<void> {
  await expect(
    dialogue.locator("fieldset label").nth(minimumLignes - 1),
    `Le seed a changé : au moins ${String(minimumLignes)} candidats attendus`,
  ).toBeVisible();
  const droits = await dialogue
    .locator('[data-colonne="montant"]')
    .evaluateAll((cellules) => cellules.map((c) => c.getBoundingClientRect().right));
  expect(droits.length).toBeGreaterThanOrEqual(2);
  for (const droit of droits) {
    expect(Math.abs(droit - (droits[0] ?? 0))).toBeLessThanOrEqual(1);
  }
  const policeMontants = await policeDesMontants(page);
  for (const mesure of await mesurerPolices(dialogue.locator('[data-colonne="montant"]'))) {
    expect(mesure.chiffres).toContain("tabular-nums");
    expect(mesure.famille).toBe(policeMontants.famille);
  }
  await expect(dialogue.locator("[data-tri-liaison]")).toContainText("proximité");
  // Une description tient sur deux lignes au plus et dans une colonne d'au moins 160 px : coupée sur n'importe
  // quel caractère dans une colonne de 80 px, elle prendrait quatre lignes ou plus.
  const cellules = await dialogue.locator(`[data-colonne="${colonneLongue}"]`).evaluateAll((noeuds) =>
    noeuds.map((c) => ({
      largeur: c.getBoundingClientRect().width,
      hauteur: c.getBoundingClientRect().height,
      ligne: Number.parseFloat(getComputedStyle(c).lineHeight),
    })),
  );
  expect(cellules.length).toBeGreaterThanOrEqual(2);
  for (const d of cellules) {
    expect(d.largeur).toBeGreaterThanOrEqual(160);
    expect(d.hauteur).toBeLessThanOrEqual(2 * d.ligne + 1);
  }
}

/** Règles du propriétaire terminées : dateFin posée ou actif = false. */
export async function nbSeriesTerminees(): Promise<number> {
  return clientE2e().recurringRule.count({
    where: { ownerId: await proprietaire(), OR: [{ dateFin: { not: null } }, { actif: false }] },
  });
}
