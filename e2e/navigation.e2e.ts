// Navigation par l'interface, aux deux largeurs : barre principale et onglets des Paramètres. À 375 px, les deux
// bandes défilent ; l'onglet actif doit être marqué et ramené au centre (docs/lot-m2.md §10.3).

import { expect, test } from "@playwright/test";
import { examinerEcran } from "./outils/examen";
import { elementReferentiel, toucherOuCliquer } from "./outils/interface";

const BARRE = { name: "Navigation principale" } as const;

test("barre principale : chaque onglet s'atteint par l'interface, l'onglet actif est marqué et visible", async ({ page }, testInfo) => {
  await page.goto("/");
  const barre = page.getByRole("navigation", BARRE);
  const etapes = [
    ["Transactions", "/transactions"],
    ["Budgets", "/budgets"],
    ["Prévision", "/prevision"],
    ["Rapports", "/rapports"],
    ["Paramètres", "/parametres"],
    ["Accueil", "/"],
  ] as const;

  for (const [name, chemin] of etapes) {
    const lien = barre.getByRole("link", { name, exact: true });
    await toucherOuCliquer(lien, testInfo);
    await expect(page).toHaveURL((url) => url.pathname === chemin);
    await expect(lien).toHaveAttribute("aria-current", "page");
    await expect(barre.locator('[aria-current="page"]')).toHaveCount(1);
    await expect(lien).toBeInViewport({ ratio: 1 });
    await examinerEcran(page, `Navigation › ${name}`);
  }

  await page.goto("/rapports");
  const rapports = page.getByRole("navigation", BARRE).getByRole("link", { name: "Rapports", exact: true });
  await expect(rapports).toHaveAttribute("aria-current", "page");
  await expect(rapports).toBeInViewport({ ratio: 1 });
});

test("Paramètres : chaque onglet s'atteint par l'interface, l'onglet actif est sélectionné et visible", async ({ page }, testInfo) => {
  await page.goto("/parametres");
  const tablist = page.getByRole("tablist", { name: "Sections des paramètres" });
  const etapes = [
    ["Catégories", "Alimentation"],
    ["Bénéficiaires", "IGA VALBRUME"],
    ["Étiquettes", "Auto"],
    ["Règles", "Épicerie IGA"],
    ["Filtres", "SOLDE PRECEDENT"],
    ["Comptes", "Chèque"],
  ] as const;

  for (const [onglet, temoin] of etapes) {
    const tab = tablist.getByRole("tab", { name: onglet, exact: true });
    await toucherOuCliquer(tab, testInfo);
    await expect(tab).toHaveAttribute("aria-selected", "true");
    await expect(tab).toBeInViewport({ ratio: 1 });
    await expect(elementReferentiel(page, temoin)).toBeVisible();
    await examinerEcran(page, `Navigation › Paramètres › ${onglet}`);
  }

  await page.goto("/parametres?onglet=filtres");
  const filtres = page.getByRole("tablist", { name: "Sections des paramètres" }).getByRole("tab", { name: "Filtres", exact: true });
  await expect(filtres).toHaveAttribute("aria-selected", "true");
  await expect(filtres).toBeInViewport({ ratio: 1 });
});
