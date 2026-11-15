import path from "node:path";
import { expect, type Locator, type Page, type TestInfo } from "@playwright/test";
import { LIBELLES_TYPE_COMPTE, type TypeCompte } from "@/domain/referentiel";
import { lireProjet, type Projet } from "./captures-noms";
import { examinerEcran } from "./examen";

export type { Projet } from "./captures-noms";
export type OngletParametres = "comptes" | "categories" | "beneficiaires" | "etiquettes" | "regles" | "filtres";

export function projetDe(testInfo: TestInfo): Projet {
  return lireProjet(testInfo.project.name);
}

/** tap() dans le projet mobile, click() dans le projet bureau. */
export async function toucherOuCliquer(cible: Locator, testInfo: TestInfo): Promise<void> {
  if (projetDe(testInfo) === "mobile") {
    await cible.tap();
  } else {
    await cible.click();
  }
}

export function racineDe(testInfo: TestInfo): string {
  return path.resolve(testInfo.project.testDir, "..");
}

export function nomUnique(prefixe: string, testInfo: TestInfo): string {
  const nom = `${prefixe} ${projetDe(testInfo)} ${Date.now().toString(36)}`;
  if (nom.length > 60) {
    throw new Error(`Nom unique trop long (${String(nom.length)} caractères) : ${nom}`);
  }
  return nom;
}

/** Ligne de tableau (bureau) ou carte (mobile) d'un EcranReferentiel. */
export function elementReferentiel(page: Page, nom: string): Locator {
  return page
    .getByRole("row")
    .filter({ has: page.getByRole("cell", { name: nom, exact: true }) })
    .or(page.getByRole("group", { name: nom, exact: true }));
}

export async function choisirOption(page: Page, combobox: Locator, option: string | RegExp): Promise<void> {
  await combobox.click();
  await page.getByRole("option", typeof option === "string" ? { name: option, exact: true } : { name: option }).click();
}

export async function ouvrirOnglet(page: Page, onglet: OngletParametres, temoin: string): Promise<void> {
  await page.goto(`/parametres?onglet=${onglet}`);
  await expect(elementReferentiel(page, temoin)).toBeVisible();
  await examinerEcran(page, `Paramètres › ${onglet}`);
}

export async function creerCompte(page: Page, nom: string, type: TypeCompte): Promise<void> {
  await ouvrirOnglet(page, "comptes", "Chèque");
  await page.getByRole("button", { name: "Nouveau compte", exact: true }).click();
  const dialogue = page.getByRole("dialog", { name: "Nouveau compte" });
  await expect(dialogue).toBeVisible();
  await dialogue.getByLabel("Nom", { exact: true }).fill(nom);
  await choisirOption(page, dialogue.getByRole("combobox", { name: "Type de compte" }), LIBELLES_TYPE_COMPTE[type]);
  await dialogue.getByLabel("Solde initial", { exact: true }).fill("0,00");
  await dialogue.getByLabel("Date du solde initial", { exact: true }).fill("2026-01-01");
  await dialogue.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await expect(dialogue).toBeHidden();
  await expect(elementReferentiel(page, nom)).toBeVisible();
}

/** Création par l'écran des Paramètres : onglet Étiquettes, « Nouvelle étiquette », Nom, Enregistrer. */
export async function creerEtiquette(page: Page, nom: string): Promise<void> {
  await ouvrirOnglet(page, "etiquettes", "Auto");
  await page.getByRole("button", { name: "Nouvelle étiquette", exact: true }).click();
  const dialogue = page.getByRole("dialog", { name: "Nouvelle étiquette", exact: true });
  await expect(dialogue).toBeVisible();
  await dialogue.getByLabel("Nom", { exact: true }).fill(nom);
  await dialogue.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await expect(dialogue).toBeHidden();
  await expect(elementReferentiel(page, nom)).toBeVisible();
}

async function supprimerElementReferentiel(page: Page, nom: string): Promise<void> {
  await elementReferentiel(page, nom).getByRole("button", { name: "Supprimer", exact: true }).click();
  const confirmation = page.getByRole("alertdialog");
  await expect(confirmation).toBeVisible();
  await expect(confirmation).toContainText(nom);
  await confirmation.getByRole("button", { name: "Supprimer", exact: true }).click();
  await expect(confirmation).toBeHidden();
  await expect(elementReferentiel(page, nom)).toHaveCount(0);
}

/** Supprime l'étiquette par l'écran : ses TransactionTag partent en cascade. */
export async function supprimerEtiquette(page: Page, nom: string): Promise<void> {
  await ouvrirOnglet(page, "etiquettes", "Auto");
  await supprimerElementReferentiel(page, nom);
}

export async function supprimerRegle(page: Page, libelle: string): Promise<void> {
  await ouvrirOnglet(page, "regles", "Épicerie IGA");
  await supprimerElementReferentiel(page, libelle);
}

export async function analyserReleve(page: Page, nomCompte: string, annee: number, texte: string): Promise<void> {
  await page.goto("/transactions/import");
  await page.waitForLoadState("networkidle");
  await choisirOption(page, page.getByRole("combobox", { name: "Compte", exact: true }), nomCompte);
  await choisirOption(page, page.getByRole("combobox", { name: "Année", exact: true }), String(annee));
  await page.getByRole("textbox", { name: "Relevé collé" }).fill(texte);
  await examinerEcran(page, "Importer un relevé (formulaire rempli)");
  await page.getByRole("button", { name: "Analyser", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Revue de l'import" })).toBeVisible();
}

/** « Enregistrer » dans la revue, « Confirmer » dans le dialogue, puis attend « Import enregistré ». */
export async function enregistrerLaRevue(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  const dialogue = page.getByRole("dialog", { name: "Confirmer l'enregistrement", exact: true });
  await expect(dialogue).toBeVisible();
  await dialogue.getByRole("button", { name: "Confirmer", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Import enregistré" })).toBeVisible();
}

/** Bouton d'en-tête de section de la revue. */
export function enteteSection(page: Page, texte: string): Locator {
  return page.getByRole("button", { name: texte, exact: true });
}
