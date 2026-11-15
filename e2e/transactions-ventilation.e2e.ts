import { expect, test, type Page } from "@playwright/test";
import { messageRefus } from "@/domain/edition";
import { formatMontant } from "@/domain/money";
import { repartirParPourMille, serialiserPartsVentilation } from "@/domain/ventilation";
import { empreinteLigneFille } from "@/domain/ventilation/empreinte";
import { libelleDeventilation } from "@/features/transactions/presentation";
import { formatMontantChamp } from "@/lib/champs-formulaire";
import {
  actionsRegle,
  detailLu,
  fermerClientE2e,
  idRegle,
  idSousCategorie,
  nbTransactionsParDescription,
  transactionParDescription,
  ventilationLue,
} from "./outils/base";
import { mesurerRecouvrement } from "./outils/dialogues";
import { examinerEcran } from "./outils/examen";
import { verifierAucunRecouvrement } from "./outils/formulaires";
import { lireOracleFixture, ligneDerivee } from "./outils/fixtures";
import {
  analyserReleve,
  choisirOption,
  elementReferentiel,
  nomUnique,
  ouvrirOnglet,
  racineDe,
  supprimerRegle,
} from "./outils/interface";
import {
  attendreToast,
  dialogueNouvelleTransaction,
  editeurVentilation,
  idsAffiches,
  ligneEditeur,
  ligneVisible,
  lireChampDetail,
  ouvrirDetail,
  ouvrirNouvelleTransaction,
  remplirLigneEditeur,
} from "./outils/transactions";

test.afterAll(fermerClientE2e);

function urlFiltree(texte: string): string {
  return `/transactions?toutesDates=1&texte=${encodeURIComponent(texte)}`;
}

async function fermerPanneau(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Fermer", exact: true }).last().click();
  await expect(page.getByRole("dialog", { name: "Détail de la transaction", exact: true })).toBeHidden();
}

test("ventiler une transaction en trois lignes, empêché tant que la somme n'est pas juste, dépliée dans la liste, puis déventilée", async (
  { page },
  testInfo,
) => {
  const suffixe = nomUnique("VENTIL", testInfo);
  const description = `VENTIL E2E ${suffixe}`;

  await page.goto("/transactions");
  const dialogue = await ouvrirNouvelleTransaction(page);
  await choisirOption(page, dialogueNouvelleTransaction(page).getByRole("combobox", { name: "Compte", exact: true }), "Chèque");
  await dialogue.getByLabel("Description", { exact: true }).fill(description);
  await dialogue.getByLabel("Montant", { exact: true }).fill("-90,00");
  await choisirOption(page, dialogue.getByRole("combobox", { name: "Sous-catégorie", exact: true }), "Café");
  await dialogue.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await attendreToast(page, "Transaction enregistrée.");
  const t = await transactionParDescription(description);
  expect(t).not.toBeNull();
  if (t === null) return;

  await page.goto(urlFiltree(description));
  const panneau = await ouvrirDetail(page, t.id);
  const boutonVentiler = panneau.getByRole("button", { name: "Ventiler", exact: true });
  await expect(boutonVentiler).toBeEnabled();
  await boutonVentiler.click();
  const editeur = editeurVentilation(panneau);
  await expect(editeur).toBeVisible();
  await expect(editeur.getByRole("heading", { name: "Ventiler la transaction", exact: true })).toBeVisible();
  await expect(ligneEditeur(editeur, 1)).toBeVisible();
  await expect(ligneEditeur(editeur, 2)).toBeVisible();
  await expect(ligneEditeur(editeur, 1).getByRole("combobox", { name: "Sous-catégorie", exact: true })).toHaveText("Café");

  await editeur.getByRole("button", { name: "Ajouter une ligne", exact: true }).click();
  await expect(ligneEditeur(editeur, 3)).toBeVisible();
  await remplirLigneEditeur(page, editeur, 1, "Épicerie", "-40,00");
  await remplirLigneEditeur(page, editeur, 2, "Café", "-30,00");
  await remplirLigneEditeur(page, editeur, 3, "Restaurant", "-12,00");
  const message = editeur.locator("[data-reste-a-repartir]");
  await expect(message).toHaveText(`Il reste ${formatMontant(800)} à répartir.`);
  await expect(message).toBeInViewport({ ratio: 1 });

  await editeur.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await expect(editeur).toBeVisible();
  await expect(message).toHaveText(`Il reste ${formatMontant(800)} à répartir.`);
  await expect(message).toBeInViewport({ ratio: 1 });
  expect(await mesurerRecouvrement(message), "message de reste à répartir hors de la fenêtre ou recouvert").toBeNull();
  const zoneReste = editeur.locator("[data-zone-reste]");
  await expect(zoneReste).toHaveAttribute("role", "status");
  await expect(zoneReste).toBeFocused();
  expect((await ventilationLue(t.id)).estVentilee).toBe(false);
  await examinerEcran(page, "Transactions › ventilation (somme inexacte)");
  await expect(editeur.locator("[data-barre-action]")).toHaveCount(1);
  await verifierAucunRecouvrement(editeur, "Transactions › ventilation (somme inexacte)");

  await ligneEditeur(editeur, 3).getByLabel("Montant", { exact: true }).fill("-20,00");
  await expect(editeur.locator("[data-reste-a-repartir]")).toHaveCount(0);
  await examinerEcran(page, "Transactions › ventilation (trois lignes justes)");
  await expect(editeur.locator("[data-barre-action]")).toHaveCount(1);
  await verifierAucunRecouvrement(editeur, "Transactions › ventilation (trois lignes justes)");
  await editeur.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await attendreToast(page, "Ventilation enregistrée.");
  await expect(editeur).toBeHidden();
  await expect(lireChampDetail(panneau, "ventilation")).toHaveText("3 lignes");
  await expect(panneau.locator("li[data-ligne-ventilation-id]")).toHaveCount(3);
  // Retour en lecture : la section Ventilation est à l'écran sans défilement manuel.
  await expect(panneau.getByRole("heading", { name: "Ventilation", exact: true, level: 3 })).toBeInViewport();
  for (const ligneFille of await panneau.locator("li[data-ligne-ventilation-id]").all()) {
    await expect(ligneFille).toBeInViewport();
  }

  const v = await ventilationLue(t.id);
  expect(v).toMatchObject({ estVentilee: true, subcategoryId: null, appliedRuleId: null });
  expect(v.filles).toHaveLength(3);
  const attendues = [
    [-4000, "Épicerie"],
    [-3000, "Café"],
    [-2000, "Restaurant"],
  ] as const;
  for (const [i, [montantCents, sousCategorieNom]] of attendues.entries()) {
    const fille = v.filles.find((f) => f.empreinte === empreinteLigneFille(v.empreinte, i + 1));
    expect(fille).toMatchObject({ montantCents, sousCategorieNom });
  }
  await examinerEcran(page, "Transactions › détail (ventilation enregistrée par l'écran)");

  await fermerPanneau(page);
  const ligne = ligneVisible(page, t.id);
  await expect(ligne.getByRole("img", { name: "Ventilée en 3 lignes", exact: true }).or(ligne.getByText("Ventilée en 3 lignes", { exact: true }))).toBeVisible();
  await ligne.getByRole("button", { name: "Afficher les 3 lignes de ventilation", exact: true }).click();
  const filles = page.locator("[data-ligne-ventilation-id]").filter({ visible: true });
  await expect(filles).toHaveCount(3);
  for (const fille of (await detailLu(t.id)).lignesVentilation) {
    const chemin =
      fille.sousCategorieNom === null || fille.categorieNom === null
        ? "Non catégorisée"
        : `${fille.categorieNom} › ${fille.sousCategorieNom}`;
    await expect(page.locator(`[data-ligne-ventilation-id="${fille.id}"]`).filter({ visible: true })).toContainText(chemin);
  }
  await examinerEcran(page, "Transactions › ventilation dépliée (après ventilation)");

  const panneau2 = await ouvrirDetail(page, t.id);
  await panneau2.getByRole("button", { name: "Modifier la ventilation", exact: true }).click();
  const editeur2 = editeurVentilation(panneau2);
  await expect(editeur2.getByRole("heading", { name: "Modifier la ventilation", exact: true })).toBeVisible();
  for (const [n, cents] of [
    [1, -4000],
    [2, -3000],
    [3, -2000],
  ] as const) {
    await expect(ligneEditeur(editeur2, n).getByLabel("Montant", { exact: true })).toHaveValue(formatMontantChamp(cents));
  }
  await examinerEcran(page, "Transactions › modification de la ventilation");
  await expect(editeur2.locator("[data-barre-action]")).toHaveCount(1);
  await verifierAucunRecouvrement(editeur2, "Transactions › modification de la ventilation");
  const idsAvant = v.filles.map((f) => f.id);
  await editeur2.getByRole("button", { name: "Annuler", exact: true }).click();
  await expect(editeur2).toBeHidden();
  expect((await ventilationLue(t.id)).filles.map((f) => f.id)).toEqual(idsAvant);

  await panneau2.getByRole("button", { name: "Déventiler", exact: true }).click();
  const confirmation = page.getByRole("alertdialog");
  await expect(confirmation).toBeVisible();
  await expect(confirmation).toContainText(libelleDeventilation(await detailLu(t.id)));
  await examinerEcran(page, "Transactions › confirmation de déventilation");
  await confirmation.getByRole("button", { name: "Déventiler", exact: true }).click();
  await attendreToast(page, "Ventilation retirée.");
  await expect(confirmation).toBeHidden();
  await expect(lireChampDetail(panneau2, "ventilation")).not.toHaveText("3 lignes");
  const apres = await ventilationLue(t.id);
  expect(apres).toMatchObject({ estVentilee: false, subcategoryId: null });
  expect(apres.filles).toHaveLength(0);

  await panneau2.getByRole("button", { name: "Supprimer", exact: true }).click();
  const suppression = page.getByRole("alertdialog");
  await expect(suppression).toBeVisible();
  await suppression.getByRole("button", { name: "Supprimer", exact: true }).click();
  await attendreToast(page, "Transaction supprimée.");
  expect(await nbTransactionsParDescription(description)).toBe(0);
});

test("une règle VENTILER créée dans l'éditeur, puis proposée par la revue d'import", async ({ page }, testInfo) => {
  test.setTimeout(240_000);
  const racine = racineDe(testInfo);
  const S = nomUnique("VENTIL REGLE", testInfo);
  const marque = S.toUpperCase();

  await ouvrirOnglet(page, "regles", "Épicerie IGA");
  await page.getByRole("button", { name: "Nouvelle règle", exact: true }).click();
  const dialogue = page.getByRole("dialog", { name: "Nouvelle règle", exact: true });
  await expect(dialogue).toBeVisible();
  await dialogue.getByLabel("Libellé", { exact: true }).fill(S);
  await dialogue.getByLabel("Priorité", { exact: true }).fill("50");
  await choisirOption(page, dialogue.getByRole("combobox", { name: "Champ", exact: true }), "Description");
  await dialogue.getByLabel("Valeur", { exact: true }).fill(marque);
  await choisirOption(page, dialogue.getByRole("combobox", { name: "Action", exact: true }), "Ventiler");
  const part1 = dialogue.getByRole("group", { name: "Part 1", exact: true });
  const part2 = dialogue.getByRole("group", { name: "Part 2", exact: true });
  await expect(part1).toBeVisible();
  await expect(part2).toBeVisible();

  await choisirOption(page, part1.getByRole("combobox", { name: "Sous-catégorie", exact: true }), "Épicerie");
  await part1.getByLabel("Part (%)", { exact: true }).fill("60");
  await choisirOption(page, part2.getByRole("combobox", { name: "Sous-catégorie", exact: true }), "Café");
  await part2.getByLabel("Part (%)", { exact: true }).fill("30");
  await expect(dialogue.locator("[data-total-ventilation]")).toHaveText("Total : 90 %");
  await dialogue.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await expect(dialogue.getByText("Les parts totalisent 90 % : elles doivent faire 100 %.", { exact: true })).toBeVisible();
  await expect(dialogue).toBeVisible();
  await examinerEcran(page, "Paramètres › Règles › Nouvelle règle (ventilation)");

  await part2.getByLabel("Part (%)", { exact: true }).fill("40");
  await dialogue.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await expect(dialogue).toBeHidden();
  await attendreToast(page, "Règle créée.");
  const ruleId = await idRegle(S);
  expect(ruleId).not.toBeNull();
  if (ruleId === null) return;
  expect(await actionsRegle(ruleId)).toEqual([
    {
      type: "VENTILER",
      subcategoryId: null,
      valeur: serialiserPartsVentilation([
        { subcategoryId: await idSousCategorie("Épicerie"), partMille: 600 },
        { subcategoryId: await idSousCategorie("Café"), partMille: 400 },
      ]),
    },
  ]);

  await analyserReleve(page, "Chèque", 2026, ligneDerivee(racine, marque));
  const oracle = lireOracleFixture(racine, "cheque-desjardins").reconnues.find((r) => r.numeroLigne === 14);
  expect(oracle).toBeDefined();
  if (oracle === undefined) return;
  const montant = oracle.montantCents;
  const attendus = repartirParPourMille(montant, [600, 400]);
  const [premier = 0, second = 0] = attendus;

  const ligneRevue = page.locator("[data-ligne-a-importer]").filter({ visible: true });
  await expect(ligneRevue).toHaveCount(1);
  await expect(ligneRevue.getByRole("combobox", { name: "Sous-catégorie", exact: true })).toHaveText("Ventilée");
  await expect(ligneRevue.getByRole("combobox", { name: "Sous-catégorie, ligne 1 de la ventilation", exact: true })).toHaveText("Épicerie");
  await expect(ligneRevue.getByLabel("Montant, ligne 1 de la ventilation", { exact: true })).toHaveValue(formatMontantChamp(premier));
  await expect(ligneRevue.getByRole("combobox", { name: "Sous-catégorie, ligne 2 de la ventilation", exact: true })).toHaveText("Café");
  await expect(ligneRevue.getByLabel("Montant, ligne 2 de la ventilation", { exact: true })).toHaveValue(formatMontantChamp(second));
  await examinerEcran(page, "Importer › revue (ligne ventilée par une règle)");

  const champ1 = ligneRevue.getByLabel("Montant, ligne 1 de la ventilation", { exact: true });
  await champ1.fill(formatMontantChamp(premier + (montant < 0 ? 1 : -1)));
  await expect(ligneRevue.locator("[data-erreur-ventilation]")).toHaveText(`Il reste ${formatMontant(1)} à répartir.`);
  await expect(page.getByRole("button", { name: "Enregistrer", exact: true })).toBeDisabled();
  await expect(page.getByText("Ventilation à corriger :", { exact: true })).toBeVisible();
  await examinerEcran(page, "Importer › revue (ventilation à corriger)");
  await champ1.fill(formatMontantChamp(premier));
  await expect(ligneRevue.locator("[data-erreur-ventilation]")).toHaveCount(0);

  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  const confirmation = page.getByRole("dialog", { name: "Confirmer l'enregistrement", exact: true });
  await expect(confirmation).toBeVisible();
  await confirmation.getByRole("button", { name: "Confirmer", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Import enregistré" })).toBeVisible();

  await page.goto(urlFiltree(S.toLowerCase()));
  await expect(page.locator("[data-transaction-id]").filter({ visible: true })).toHaveCount(1);
  const id = (await idsAffiches(page))[0];
  expect(id).toBeDefined();
  if (id === undefined) return;
  const ligne = ligneVisible(page, id);
  await expect(ligne.getByRole("img", { name: "Ventilée en 2 lignes", exact: true }).or(ligne.getByText("Ventilée en 2 lignes", { exact: true }))).toBeVisible();

  const v = await ventilationLue(id);
  expect(v).toMatchObject({ estVentilee: true, subcategoryId: null, appliedRuleId: ruleId });
  const filles = [1, 2].map((r) => v.filles.find((f) => f.empreinte === empreinteLigneFille(v.empreinte, r)));
  expect(filles[0]).toMatchObject({ montantCents: premier, sousCategorieNom: "Épicerie" });
  expect(filles[1]).toMatchObject({ montantCents: second, sousCategorieNom: "Café" });
  expect(v.filles.reduce((somme, f) => somme + f.montantCents, 0)).toBe(montant);

  const panneau = await ouvrirDetail(page, id);
  await panneau.getByRole("button", { name: "Supprimer", exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Supprimer", exact: true }).click();
  await attendreToast(page, "Transaction supprimée.");
  await supprimerRegle(page, S);
  expect(await idRegle(S)).toBeNull();
});

test("une transaction de 0,00 $ : Ventiler désactivé, motif affiché", async ({ page }, testInfo) => {
  const description = `VENTIL NUL ${nomUnique("NUL", testInfo)}`;

  await page.goto("/transactions");
  const dialogue = await ouvrirNouvelleTransaction(page);
  await choisirOption(page, dialogueNouvelleTransaction(page).getByRole("combobox", { name: "Compte", exact: true }), "Chèque");
  await dialogue.getByLabel("Description", { exact: true }).fill(description);
  await dialogue.getByLabel("Montant", { exact: true }).fill("0,00");
  await dialogue.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await attendreToast(page, "Transaction enregistrée.");
  const t = await transactionParDescription(description);
  expect(t).not.toBeNull();
  if (t === null) return;
  expect(t.montantCents).toBe(0);

  await page.goto(urlFiltree(description));
  const panneau = await ouvrirDetail(page, t.id);
  await expect(panneau.getByRole("button", { name: "Ventiler", exact: true })).toBeDisabled();
  await expect(panneau.locator('[data-raison="ventilation"]')).toHaveText(messageRefus("VENTILATION_MONTANT_NUL"));
  await examinerEcran(page, "Transactions › détail d'une transaction à 0,00 $");

  await panneau.getByRole("button", { name: "Supprimer", exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Supprimer", exact: true }).click();
  await attendreToast(page, "Transaction supprimée.");
  expect(await nbTransactionsParDescription(description)).toBe(0);
});

test("éditeur de règles : une part dont la sous-catégorie a disparu est signalée dès l'ouverture", async ({ page }, testInfo) => {
  test.setTimeout(240_000);
  const categorie = nomUnique("E2E cat", testInfo);
  const sousCategorie = nomUnique("E2E sous", testInfo);
  const libelle = nomUnique("E2E disp", testInfo);
  const marque = `E2E-DISPARUE-${libelle.split(" ").slice(-1).join("").toUpperCase()}`;

  async function supprimerParInterface(nom: string): Promise<void> {
    await elementReferentiel(page, nom).getByRole("button", { name: "Supprimer", exact: true }).click();
    const confirmation = page.getByRole("alertdialog");
    await expect(confirmation).toBeVisible();
    await confirmation.getByRole("button", { name: "Supprimer", exact: true }).click();
    await expect(confirmation).toBeHidden();
    await expect(elementReferentiel(page, nom)).toHaveCount(0);
  }

  await ouvrirOnglet(page, "categories", "Alimentation");
  await page.getByRole("button", { name: "Nouvelle catégorie", exact: true }).click();
  const dialogueCategorie = page.getByRole("dialog", { name: "Nouvelle catégorie", exact: true });
  await expect(dialogueCategorie).toBeVisible();
  await dialogueCategorie.getByLabel("Nom", { exact: true }).fill(categorie);
  await dialogueCategorie.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await expect(dialogueCategorie).toBeHidden();
  await elementReferentiel(page, categorie).getByRole("button", { name: "Ajouter une sous-catégorie", exact: true }).click();
  const dialogueSous = page.getByRole("dialog", { name: "Nouvelle sous-catégorie", exact: true });
  await expect(dialogueSous).toBeVisible();
  await dialogueSous.getByLabel("Nom", { exact: true }).fill(sousCategorie);
  await dialogueSous.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await expect(dialogueSous).toBeHidden();
  await expect(elementReferentiel(page, sousCategorie)).toBeVisible();

  await ouvrirOnglet(page, "regles", "Épicerie IGA");
  await page.getByRole("button", { name: "Nouvelle règle", exact: true }).click();
  const dialogue = page.getByRole("dialog", { name: "Nouvelle règle", exact: true });
  await expect(dialogue).toBeVisible();
  await dialogue.getByLabel("Libellé", { exact: true }).fill(libelle);
  await dialogue.getByLabel("Priorité", { exact: true }).fill("1");
  await choisirOption(page, dialogue.getByRole("combobox", { name: "Champ", exact: true }), "Description");
  await dialogue.getByLabel("Valeur", { exact: true }).fill(marque);
  await choisirOption(page, dialogue.getByRole("combobox", { name: "Action", exact: true }), "Ventiler");
  const part1 = dialogue.getByRole("group", { name: "Part 1", exact: true });
  const part2 = dialogue.getByRole("group", { name: "Part 2", exact: true });
  await choisirOption(page, part1.getByRole("combobox", { name: "Sous-catégorie", exact: true }), sousCategorie);
  await part1.getByLabel("Part (%)", { exact: true }).fill("50");
  await choisirOption(page, part2.getByRole("combobox", { name: "Sous-catégorie", exact: true }), "Café");
  await part2.getByLabel("Part (%)", { exact: true }).fill("50");
  await dialogue.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await expect(dialogue).toBeHidden();
  await attendreToast(page, "Règle créée.");

  await ouvrirOnglet(page, "categories", "Alimentation");
  await supprimerParInterface(sousCategorie);

  await ouvrirOnglet(page, "regles", "Épicerie IGA");
  await page.getByRole("searchbox", { name: "Rechercher une règle" }).fill(libelle);
  await elementReferentiel(page, libelle).getByRole("button", { name: "Modifier", exact: true }).click();
  const edition = page.getByRole("dialog", { name: "Modifier la règle", exact: true });
  await expect(edition).toBeVisible();
  const message = "Cette sous-catégorie n'existe plus : choisis-en une autre.";
  const editionPart1 = edition.getByRole("group", { name: "Part 1", exact: true });
  const editionPart2 = edition.getByRole("group", { name: "Part 2", exact: true });
  await expect(editionPart1.getByText(message, { exact: true })).toBeVisible();
  await expect(edition.locator("[data-part-disparue]")).toHaveCount(1);
  await expect(editionPart2.getByText(message, { exact: true })).toHaveCount(0);
  await examinerEcran(page, "Paramètres › Règles › Modifier la règle (part disparue)");

  await choisirOption(page, editionPart1.getByRole("combobox", { name: "Sous-catégorie", exact: true }), "Épicerie");
  await expect(editionPart1.getByText(message, { exact: true })).toHaveCount(0);
  await edition.getByRole("button", { name: "Annuler", exact: true }).click();
  await expect(edition).toBeHidden();

  await supprimerRegle(page, libelle);
  await ouvrirOnglet(page, "categories", "Alimentation");
  await supprimerParInterface(categorie);
});
