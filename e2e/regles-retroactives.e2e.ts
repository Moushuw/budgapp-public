import { expect, test } from "@playwright/test";
import {
  fermerClientE2e,
  idRegle,
  idSousCategorie,
  transactionsAppliqueesPar,
} from "./outils/base";
import { accorder } from "@/features/import/libelles-revue";
import { verifierBoutonNonRecouvert, verifierToastNeCouvrePas } from "./outils/dialogues";
import { examinerEcran } from "./outils/examen";
import { choisirOption, elementReferentiel, nomUnique, ouvrirOnglet, projetDe, supprimerRegle } from "./outils/interface";
import { attendreToast } from "./outils/transactions";

test.afterAll(fermerClientE2e);

const MOTIF_APERCU = /^(\d+) transactions? correspond(?:ent)?, dont (\d+) (?:seraient modifiées|serait modifiée)\.$/;

test("une règle appliquée rétroactivement montre son aperçu avant d'écrire et pose appliedRuleId", async ({ page }, testInfo) => {
  const valeur = projetDe(testInfo) === "mobile" ? "PETRO" : "CIRCLE";
  const libelle = nomUnique("E2E rétro", testInfo);

  await ouvrirOnglet(page, "regles", "Épicerie IGA");
  await page.getByRole("button", { name: "Nouvelle règle", exact: true }).click();
  const dialogueRegle = page.getByRole("dialog", { name: "Nouvelle règle", exact: true });
  await expect(dialogueRegle).toBeVisible();
  await dialogueRegle.getByLabel("Libellé", { exact: true }).fill(libelle);
  await dialogueRegle.getByLabel("Priorité", { exact: true }).fill("1");
  await dialogueRegle.getByLabel("Valeur", { exact: true }).fill(valeur);
  await choisirOption(page, dialogueRegle.getByRole("combobox", { name: "Sous-catégorie", exact: true }), "Entretien");
  await examinerEcran(page, "Paramètres › Règles › Nouvelle règle (rétroactive)");
  await dialogueRegle.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await expect(dialogueRegle).toBeHidden();

  const ruleId = await idRegle(libelle);
  expect(ruleId).not.toBeNull();

  await page.getByRole("searchbox", { name: "Rechercher une règle" }).fill(libelle);
  await elementReferentiel(page, libelle)
    .getByRole("button", { name: "Appliquer aux transactions existantes", exact: true })
    .click();
  const dialogue = page.getByRole("dialog", {
    name: `Appliquer « ${libelle} » aux transactions existantes`,
    exact: true,
  });
  await expect(dialogue).toBeVisible();

  const apercu = dialogue.getByText(MOTIF_APERCU);
  await expect(apercu).toBeVisible();
  const correspondance = MOTIF_APERCU.exec((await apercu.textContent()) ?? "");
  const total = Number(correspondance?.[1]);
  const modifiees = Number(correspondance?.[2]);
  expect(Number.isInteger(total)).toBe(true);
  expect(Number.isInteger(modifiees)).toBe(true);
  expect(modifiees).toBeGreaterThanOrEqual(1);
  expect(modifiees).toBeLessThanOrEqual(total);
  await expect(dialogue.getByText("Sous-catégorie : Essence → Entretien").first()).toBeVisible();
  await examinerEcran(page, "Paramètres › Règles › Application rétroactive (aperçu)");

  expect(await transactionsAppliqueesPar(ruleId ?? "")).toHaveLength(0);

  await dialogue.getByRole("button", { name: "Appliquer", exact: true }).click();
  await expect(
    dialogue.getByText(`${accorder(modifiees, "transaction modifiée", "transactions modifiées")}.`, { exact: true }),
  ).toBeVisible();
  await examinerEcran(page, "Paramètres › Règles › Application rétroactive (bilan)");

  const appliquees = await transactionsAppliqueesPar(ruleId ?? "");
  expect(appliquees).toHaveLength(modifiees);
  const idEntretien = await idSousCategorie("Entretien");
  expect(appliquees.every((transaction) => transaction.subcategoryId === idEntretien)).toBe(true);

  await dialogue.getByRole("button", { name: "Fermer", exact: true }).click();
});

test("un toast d'erreur ne recouvre pas la barre d'action de l'aperçu rétroactif", async ({ page }, testInfo) => {
  const libelle = nomUnique("E2E toast", testInfo);

  await ouvrirOnglet(page, "regles", "Épicerie IGA");
  await page.getByRole("button", { name: "Nouvelle règle", exact: true }).click();
  const dialogueRegle = page.getByRole("dialog", { name: "Nouvelle règle", exact: true });
  await expect(dialogueRegle).toBeVisible();
  await dialogueRegle.getByLabel("Libellé", { exact: true }).fill(libelle);
  await dialogueRegle.getByLabel("Priorité", { exact: true }).fill("1");
  // Rien ne sera écrit : la règle est supprimée avant l'application, dans les deux projets.
  await dialogueRegle.getByLabel("Valeur", { exact: true }).fill("IGA");
  await choisirOption(page, dialogueRegle.getByRole("combobox", { name: "Sous-catégorie", exact: true }), "Entretien");
  await dialogueRegle.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await attendreToast(page, "Règle créée.");

  await page.getByRole("searchbox", { name: "Rechercher une règle" }).fill(libelle);
  await elementReferentiel(page, libelle)
    .getByRole("button", { name: "Appliquer aux transactions existantes", exact: true })
    .click();
  const dialogue = page.getByRole("dialog", {
    name: `Appliquer « ${libelle} » aux transactions existantes`,
    exact: true,
  });
  await expect(dialogue).toBeVisible();
  await expect(dialogue.getByText(MOTIF_APERCU)).toBeVisible();

  // La règle disparaît par ailleurs (deux onglets ouverts) : l'application échoue et le serveur le dit par un toast.
  const autre = await page.context().newPage();
  await supprimerRegle(autre, libelle);
  await autre.close();

  await dialogue.getByRole("button", { name: "Appliquer", exact: true }).click();
  await expect(page.locator('[data-sonner-toast][data-type="error"]')).toBeVisible();
  await expect(dialogue).toBeVisible();
  const contexte = "Paramètres › Règles › Application rétroactive (toast d'erreur)";
  await verifierToastNeCouvrePas(page, contexte);
  await verifierBoutonNonRecouvert(dialogue.getByRole("button", { name: "Appliquer", exact: true }), contexte);
  await verifierBoutonNonRecouvert(dialogue.getByRole("button", { name: "Annuler", exact: true }), contexte);
  await examinerEcran(page, contexte);

  await dialogue.getByRole("button", { name: "Annuler", exact: true }).click();
  expect(await idRegle(libelle)).toBeNull();
});
