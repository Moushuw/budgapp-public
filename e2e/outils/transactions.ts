// Gestes et lectures d'écran de /transactions — docs/lot-m2.md §5, §8.
// Une ligne est rendue deux fois (tableau md: et cartes) : une seule des deux
// est visible, d'où le filtre `visible` partout.

import { expect, type Locator, type Page } from "@playwright/test";
import { comparerLignes, type DetailTransaction, type TriTransactions } from "@/domain/consultation";
import { messageRefus } from "@/domain/edition";
import {
  LIBELLES_CHAMP_DETAIL,
  libelleSuppressionVirement,
  type ChampDetail,
} from "@/features/transactions/presentation";
import { choisirOption, type Projet } from "./interface";

export const CHAMPS_DETAIL = Object.keys(LIBELLES_CHAMP_DETAIL) as ChampDetail[];

export function lignesVisibles(page: Page): Locator {
  return page.locator("[data-transaction-id]").filter({ visible: true });
}

export function ligneVisible(page: Page, id: string): Locator {
  return page.locator(`[data-transaction-id="${id}"]`).filter({ visible: true });
}

export async function idsAffiches(page: Page): Promise<string[]> {
  return lignesVisibles(page).evaluateAll((elements) =>
    elements.map((element) => element.getAttribute("data-transaction-id") ?? ""),
  );
}

export async function montantsAffiches(page: Page): Promise<number[]> {
  return lignesVisibles(page).evaluateAll((elements) =>
    elements.map((element) => Number(element.getAttribute("data-montant-cents"))),
  );
}

export async function attendreBarreAuRepos(page: Page): Promise<void> {
  await expect(page.locator("[aria-busy]").first()).toHaveAttribute("aria-busy", "false");
}

export async function choisirTypePeriode(page: Page, type: "Mois" | "Année" | "Tout"): Promise<void> {
  const groupe = page.getByRole("group", { name: "Type de période" });
  await groupe.getByRole("button", { name: type, exact: true }).click();
  await expect(groupe.getByRole("button", { name: type, exact: true })).toHaveAttribute("aria-pressed", "true");
  await attendreBarreAuRepos(page);
}

export async function rechercher(page: Page, texte: string): Promise<void> {
  const champ = page.getByRole("searchbox", { name: "Rechercher dans les transactions" });
  await champ.fill(texte);
  await champ.press("Enter");
  await page.waitForURL((url) => url.searchParams.get("texte") === texte.trim());
}

export interface SelectionFiltres {
  readonly comptes?: readonly string[];
  readonly sousCategories?: readonly string[];
}

export function panneauFiltres(page: Page): Locator {
  return page.getByRole("dialog", { name: "Filtres", exact: true });
}

/** Ouvre le panneau, bascule les options, appelle `avantAppliquer`, puis Appliquer. */
export async function appliquerFiltres(
  page: Page,
  selection: SelectionFiltres,
  avantAppliquer?: () => Promise<void>,
): Promise<void> {
  await page.getByRole("button", { name: "Filtres", exact: true }).click();
  const panneau = panneauFiltres(page);
  await expect(panneau).toBeVisible();
  for (const nom of [...(selection.comptes ?? []), ...(selection.sousCategories ?? [])]) {
    await panneau.getByRole("switch", { name: nom, exact: true }).click();
  }
  await avantAppliquer?.();
  await panneau.getByRole("button", { name: "Appliquer", exact: true }).click();
  await expect(panneau).toBeHidden();
}

export async function choisirTri(page: Page, libelle: string): Promise<void> {
  await choisirOption(page, page.getByRole("combobox", { name: "Tri", exact: true }), libelle);
}

export function panneauDetail(page: Page): Locator {
  return page.getByRole("dialog", { name: "Détail de la transaction", exact: true });
}

/** Ouvre le détail d'une ligne visible ; rend le panneau, chargé. */
export async function ouvrirDetail(page: Page, id: string): Promise<Locator> {
  await ligneVisible(page, id).getByRole("button", { name: /^Ouvrir le détail : / }).click();
  const panneau = panneauDetail(page);
  await expect(panneau).toBeVisible();
  await expect(panneau.locator('[data-champ="description"]')).toBeVisible();
  return panneau;
}

export async function ouvrirDetailsTechniques(panneau: Locator): Promise<void> {
  await panneau.locator('[data-section="details-techniques"] summary').click();
  await expect(panneau.locator('[data-champ="empreinte"] [data-valeur]')).toBeVisible();
}

export function lireChampDetail(panneau: Locator, champ: ChampDetail): Locator {
  return panneau.locator(`[data-champ="${champ}"] [data-valeur]`);
}

export async function lireTousLesChamps(panneau: Locator): Promise<Record<ChampDetail, string>> {
  await ouvrirDetailsTechniques(panneau);
  const valeurs: Partial<Record<ChampDetail, string>> = {};
  for (const champ of CHAMPS_DETAIL) {
    valeurs[champ] = (await lireChampDetail(panneau, champ).textContent()) ?? "";
  }
  return valeurs as Record<ChampDetail, string>;
}

// ── écritures (docs/lot-m2.md §6)

export function dialogueNouvelleTransaction(page: Page): Locator {
  return page.getByRole("dialog", { name: "Nouvelle transaction", exact: true });
}

export async function ouvrirNouvelleTransaction(page: Page): Promise<Locator> {
  await page.getByRole("button", { name: "Nouvelle transaction", exact: true }).click();
  const dialogue = dialogueNouvelleTransaction(page);
  await expect(dialogue).toBeVisible();
  return dialogue;
}

/** « Modifier », puis attend le bouton « Enregistrer » du formulaire du panneau. */
export async function passerEnModification(panneau: Locator): Promise<void> {
  await panneau.getByRole("button", { name: "Modifier", exact: true }).click();
  await expect(panneau.getByRole("button", { name: "Enregistrer", exact: true })).toBeVisible();
}

// ── virements (docs/lot-m2.md §4.4)

export function dialogueLierVirement(page: Page): Locator {
  return page.getByRole("dialog", { name: "Lier en virement", exact: true });
}

export function dialogueCreerContrepartie(page: Page): Locator {
  return page.getByRole("dialog", { name: "Créer la contrepartie", exact: true });
}

export function dialogueSuppressionVirement(page: Page): Locator {
  return page.getByRole("alertdialog", { name: "Supprimer un côté de virement", exact: true });
}

/**
 * Chaque bouton du dialogue désigne, par aria-describedby, l'explication de son option : elle existe, est visible, porte
 * le nom du bouton et le texte de l'option (ou le motif du refus), et les deux identifiants sont distincts.
 */
export async function verifierExplicationsSuppressionVirement(dialogue: Locator, detail: DetailTransaction): Promise<void> {
  const refusDeux = detail.refus.suppressionLesDeux;
  const refusDelier = detail.refus.suppressionDelier;
  const options = [
    {
      bouton: "Supprimer celle-ci et délier l'autre",
      texte: refusDelier === null ? libelleSuppressionVirement(detail, "DELIER_L_AUTRE") : messageRefus(refusDelier),
    },
    {
      bouton: "Supprimer les deux",
      texte: refusDeux === null ? libelleSuppressionVirement(detail, "SUPPRIMER_LES_DEUX") : messageRefus(refusDeux),
    },
  ];
  const identifiants: string[] = [];
  for (const { bouton, texte } of options) {
    const id = await dialogue.getByRole("button", { name: bouton, exact: true }).getAttribute("aria-describedby");
    expect(id, `« ${bouton} » doit désigner son explication par aria-describedby`).not.toBeNull();
    const explication = dialogue.locator(`[id="${id ?? ""}"]`);
    await expect(explication).toBeVisible();
    await expect(explication).toContainText(bouton);
    await expect(explication).toContainText(texte);
    identifiants.push(id ?? "");
  }
  expect(new Set(identifiants).size, "Les deux explications ont des identifiants distincts").toBe(2);
}

// ── ventilation (docs/lot-m2.md §4.2)

export function editeurVentilation(panneau: Locator): Locator {
  return panneau.locator('[data-section="editeur-ventilation"]');
}

export function ligneEditeur(editeur: Locator, n: number): Locator {
  return editeur.getByRole("group", { name: `Ligne ${String(n)}`, exact: true });
}

/** Sous-catégorie (null : « Aucune ») puis montant de la ligne `n` de l'éditeur. */
export async function remplirLigneEditeur(
  page: Page,
  editeur: Locator,
  n: number,
  sousCategorie: string | null,
  montant: string,
): Promise<void> {
  const ligne = ligneEditeur(editeur, n);
  await choisirOption(page, ligne.getByRole("combobox", { name: "Sous-catégorie", exact: true }), sousCategorie ?? "Aucune");
  await ligne.getByLabel("Montant", { exact: true }).fill(montant);
}

export async function cocherLigne(page: Page, id: string): Promise<void> {
  await ligneVisible(page, id).getByRole("checkbox").check();
}

export async function activerSelectionMobile(page: Page): Promise<void> {
  const terminer = page.getByRole("button", { name: "Terminer la sélection", exact: true });
  if (await terminer.isVisible()) {
    return;
  }
  await page.getByRole("button", { name: "Sélectionner", exact: true }).click();
  await expect(terminer).toBeVisible();
}

/** Bureau : la case d'en-tête. Mobile : le mode « Sélectionner », puis chaque case visible. */
export async function cocherAffichees(page: Page, projet: Projet): Promise<void> {
  if (projet === "bureau") {
    await page.getByRole("checkbox", { name: "Sélectionner les transactions affichées", exact: true }).check();
    return;
  }
  await activerSelectionMobile(page);
  const lignes = lignesVisibles(page);
  const n = await lignes.count();
  for (let index = 0; index < n; index += 1) {
    await lignes.nth(index).getByRole("checkbox").check();
  }
}

export async function toutSelectionner(page: Page, total: number): Promise<void> {
  await page.getByRole("button", { name: `Tout sélectionner (${String(total)})`, exact: true }).click();
}

export async function ouvrirGesteMasse(page: Page, element: string): Promise<void> {
  await page.getByRole("button", { name: "Modifier la sélection", exact: true }).click();
  await page.getByRole("menuitem", { name: element, exact: true }).click();
}

export async function attendreToast(page: Page, texte: string): Promise<void> {
  await expect(page.getByText(texte, { exact: true }).first()).toBeVisible();
}

export function ordreOracle<T extends { id: string; date: string; montantCents: number }>(
  lignes: readonly T[],
  tri: TriTransactions,
): T[] {
  return [...lignes].sort((a, b) => comparerLignes(a, b, tri));
}
