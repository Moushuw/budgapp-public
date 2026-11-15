import { expect, test, type Page } from "@playwright/test";
import { dateCivileDansFuseau, FUSEAU_APPLICATION } from "@/domain/dates";
import { IGNOREES_VIDES, messageRefus } from "@/domain/edition";
import { calculerEmpreinte, normaliserDescription } from "@/domain/ingestion";
import { formatMontant } from "@/domain/money";
import { TAILLE_PAGE_TRANSACTIONS } from "@/domain/consultation";
import {
  libelleApercuSuppression,
  libelleCompteRendu,
  libelleNombreTransactions,
  libelleSuppressionUnique,
} from "@/features/transactions/presentation";
import { MESSAGE_EMPREINTE_EXISTANTE } from "@/features/transactions/schema";
import {
  detailLu,
  fermerClientE2e,
  idEtiquette,
  idRegle,
  idSousCategorie,
  lignesListe,
  nbCotesVirementLies,
  nbTransactionsParDescription,
  premiereTransaction,
  transactionParDescription,
} from "./outils/base";
import { verifierBoutonNonRecouvert } from "./outils/dialogues";
import { examinerEcran } from "./outils/examen";
import { verifierAucunRecouvrement, verifierBordsHautsEgaux } from "./outils/formulaires";
import { ligneDerivee } from "./outils/fixtures";
import {
  analyserReleve,
  choisirOption,
  creerEtiquette,
  nomUnique,
  projetDe,
  racineDe,
  supprimerEtiquette,
  supprimerRegle,
} from "./outils/interface";
import {
  attendreToast,
  cocherAffichees,
  dialogueNouvelleTransaction,
  dialogueSuppressionVirement,
  idsAffiches,
  lignesVisibles,
  lireChampDetail,
  ouvrirDetail,
  ouvrirGesteMasse,
  ouvrirNouvelleTransaction,
  passerEnModification,
  toutSelectionner,
  verifierExplicationsSuppressionVirement,
} from "./outils/transactions";

test.afterAll(fermerClientE2e);

function urlFiltree(description: string): string {
  return `/transactions?toutesDates=1&texte=${encodeURIComponent(description)}`;
}

async function remplirSaisie(page: Page, description: string): Promise<void> {
  const dialogue = dialogueNouvelleTransaction(page);
  await choisirOption(page, dialogue.getByRole("combobox", { name: "Compte", exact: true }), "Chèque");
  await dialogue.getByLabel("Description", { exact: true }).fill(description);
  await dialogue.getByLabel("Montant", { exact: true }).fill("-12,34");
}

test("saisir une transaction, la modifier en place ou par le détail, créer une règle depuis elle, puis la supprimer", async (
  { page },
  testInfo,
) => {
  const suffixe = nomUnique("SAISIE", testInfo);
  const description = `SAISIE E2E ${suffixe}`;
  const benef = `Benef ${suffixe}`;
  const aujourdhui = dateCivileDansFuseau(new Date(), FUSEAU_APPLICATION);

  await page.goto("/transactions");
  let dialogue = await ouvrirNouvelleTransaction(page);
  await expect(dialogue.getByLabel("Date", { exact: true })).toHaveValue(aujourdhui);

  await dialogue.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await expect(dialogue.getByText("La description est obligatoire.", { exact: true })).toBeVisible();
  await expect(dialogue.getByText("Choisis un compte.", { exact: true })).toBeVisible();
  await expect(dialogue).toBeVisible();

  await remplirSaisie(page, description);
  // Après une soumission ratée, choisir le compte efface son message sans nouvelle soumission.
  await expect(dialogue.getByText("Choisis un compte.", { exact: true })).toBeHidden();
  await choisirOption(page, dialogue.getByRole("combobox", { name: "Bénéficiaire", exact: true }), "Nouveau bénéficiaire…");
  await dialogue.getByLabel("Nom du nouveau bénéficiaire", { exact: true }).fill(benef);
  await choisirOption(page, dialogue.getByRole("combobox", { name: "Sous-catégorie", exact: true }), "Café");
  await dialogue.getByLabel("Note", { exact: true }).fill(`Note ${suffixe}`);
  await examinerEcran(page, "Transactions › nouvelle transaction");
  await verifierBordsHautsEgaux(
    dialogue.getByLabel("Date", { exact: true }),
    dialogue.getByLabel("Montant", { exact: true }),
    "Transactions › nouvelle transaction",
  );
  await expect(dialogue.locator("[data-barre-action]")).toHaveCount(1);
  await dialogue.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await expect(dialogue).toBeHidden();
  await attendreToast(page, "Transaction enregistrée.");

  const t = await transactionParDescription(description);
  expect(t).not.toBeNull();
  if (t === null) return;
  expect(t.source).toBe("MANUELLE");
  expect(t.montantCents).toBe(-1234);
  expect(t.date).toBe(aujourdhui);
  expect(t.sousCategorieNom).toBe("Café");
  expect(t.payeeNom).toBe(benef);
  expect(t.appliedRuleId).toBeNull();
  expect(t.empreinte).toBe(calculerEmpreinte(t.accountId, t.date, -1234, normaliserDescription(description)));
  const empreinteInitiale = t.empreinte;

  // Doublon : refusé, avec le message qui dit quoi faire, sans rien écrire.
  dialogue = await ouvrirNouvelleTransaction(page);
  await remplirSaisie(page, description);
  await dialogue.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await attendreToast(page, MESSAGE_EMPREINTE_EXISTANTE);
  await expect(dialogue).toBeVisible();
  for (const nom of ["Enregistrer", "Annuler"]) {
    await verifierBoutonNonRecouvert(
      dialogue.getByRole("button", { name: nom, exact: true }),
      "Transactions › nouvelle transaction (doublon refusé, toast affiché)",
    );
  }
  if (projetDe(testInfo) === "mobile") {
    await verifierBoutonNonRecouvert(
      dialogue.locator('[data-slot="dialog-close"]'),
      "Transactions › nouvelle transaction (doublon refusé, toast affiché) — croix",
    );
  }
  await dialogue.getByRole("button", { name: "Annuler", exact: true }).click();
  await expect(dialogue).toBeHidden();
  expect(await nbTransactionsParDescription(description)).toBe(1);

  await page.goto(urlFiltree(description));
  await expect(lignesVisibles(page)).toHaveCount(1);
  expect(await idsAffiches(page)).toEqual([t.id]);

  if (projetDe(testInfo) === "bureau") {
    const ligne = lignesVisibles(page);
    await choisirOption(page, ligne.getByRole("combobox", { name: `Sous-catégorie : ${description}`, exact: true }), "Épicerie");
    await choisirOption(page, ligne.getByRole("combobox", { name: `Bénéficiaire : ${description}`, exact: true }), "CAFE DEPOT");
    await expect(ligne.getByRole("combobox", { name: `Sous-catégorie : ${description}`, exact: true })).toHaveText("Épicerie");
    await expect(ligne.getByRole("combobox", { name: `Bénéficiaire : ${description}`, exact: true })).toHaveText("CAFE DEPOT");
    await expect
      .poll(async () => {
        const lue = await transactionParDescription(description);
        return [lue?.sousCategorieNom, lue?.payeeNom, lue?.appliedRuleId];
      })
      .toEqual(["Épicerie", "CAFE DEPOT", null]);
    await examinerEcran(page, "Transactions › modification en place");
  }

  let panneau = await ouvrirDetail(page, t.id);
  await expect(panneau.locator('[data-section="actions"]')).toBeVisible();
  await examinerEcran(page, "Transactions › détail avec actions");
  await passerEnModification(panneau);
  await expect(panneau.getByLabel("Date", { exact: true })).toBeEnabled();
  await expect(panneau.getByLabel("Montant", { exact: true })).toBeEnabled();
  await panneau.getByLabel("Montant", { exact: true }).fill("-23,45");
  if (projetDe(testInfo) === "mobile") {
    await choisirOption(page, panneau.getByRole("combobox", { name: "Sous-catégorie", exact: true }), "Épicerie");
    await choisirOption(page, panneau.getByRole("combobox", { name: "Bénéficiaire", exact: true }), "CAFE DEPOT");
  }
  await examinerEcran(page, "Transactions › détail en modification");
  await expect(panneau.locator("[data-barre-action]")).toHaveCount(1);
  await verifierAucunRecouvrement(panneau.locator("form"), "Transactions › détail en modification");
  await panneau.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await expect(panneau.locator('[data-section="actions"]')).toBeVisible();
  await attendreToast(page, "Transaction modifiée.");
  if (projetDe(testInfo) === "mobile") {
    await verifierBoutonNonRecouvert(
      panneau.getByRole("button", { name: "Fermer le panneau", exact: true }),
      "Transactions › détail (toast « Transaction modifiée. » affiché) — croix",
    );
  }
  await expect(lireChampDetail(panneau, "montant")).toHaveText(formatMontant(-2345, "CENTS"));
  const modifiee = await transactionParDescription(description);
  expect(modifiee).toMatchObject({
    montantCents: -2345,
    empreinte: empreinteInitiale,
    sousCategorieNom: "Épicerie",
    payeeNom: "CAFE DEPOT",
    appliedRuleId: null,
  });

  // Créer une règle depuis la transaction.
  await panneau.getByRole("button", { name: "Créer une règle", exact: true }).click();
  const regle = page.getByRole("dialog", { name: "Nouvelle règle", exact: true });
  await expect(regle).toBeVisible();
  await expect(regle.getByLabel("Libellé", { exact: true })).toHaveValue(description);
  await expect(regle.getByRole("combobox", { name: "Champ", exact: true })).toHaveText("Description");
  await expect(regle.getByRole("combobox", { name: "Opérateur", exact: true })).toHaveText("contient");
  await expect(regle.getByLabel("Valeur", { exact: true })).toHaveValue(description);
  await expect(regle.getByRole("combobox", { name: "Action", exact: true })).toHaveText("Catégoriser");
  await expect(regle.getByRole("combobox", { name: "Sous-catégorie", exact: true })).toHaveText("Épicerie");
  await examinerEcran(page, "Transactions › nouvelle règle depuis une transaction");
  await regle.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await attendreToast(page, "Règle créée.");
  expect(await idRegle(description)).not.toBeNull();
  await supprimerRegle(page, description);
  expect(await idRegle(description)).toBeNull();

  // Suppression.
  await page.goto(urlFiltree(description));
  await expect(lignesVisibles(page)).toHaveCount(1);
  panneau = await ouvrirDetail(page, t.id);
  await panneau.getByRole("button", { name: "Supprimer", exact: true }).click();
  const confirmation = page.getByRole("alertdialog");
  await expect(confirmation).toBeVisible();
  await expect(confirmation).toContainText(libelleSuppressionUnique(await detailLu(t.id)));
  await examinerEcran(page, "Transactions › confirmation de suppression");
  await confirmation.getByRole("button", { name: "Supprimer", exact: true }).click();
  await expect(panneau).toBeHidden();
  await attendreToast(page, "Transaction supprimée.");
  await expect(lignesVisibles(page)).toHaveCount(0);
  expect(await nbTransactionsParDescription(description)).toBe(0);
});

test("date et montant importés verrouillés, sous-catégorie refusée sur un virement et une ventilée, virement : suppression à deux options", async ({
  page,
}) => {
  await page.goto("/transactions?toutesDates=1&texte=petro-canada");
  let panneau = await ouvrirDetail(page, await premiereTransaction({ description: "PETRO-CANADA" }));
  await passerEnModification(panneau);
  await expect(panneau.getByLabel("Date", { exact: true })).toBeDisabled();
  await expect(panneau.getByLabel("Montant", { exact: true })).toBeDisabled();
  await expect(panneau.locator('[data-raison="date"]')).toHaveText(messageRefus("DATE_HORS_MANUELLE"));
  await expect(panneau.locator('[data-raison="montant"]')).toHaveText(messageRefus("MONTANT_HORS_MANUELLE"));
  await examinerEcran(page, "Transactions › détail (importée) en modification");
  await expect(panneau.locator("[data-barre-action]")).toHaveCount(1);
  await verifierAucunRecouvrement(panneau.locator("form"), "Transactions › détail (importée) en modification");
  await panneau.getByRole("button", { name: "Annuler", exact: true }).click();

  await page.goto("/transactions?toutesDates=1&texte=paiement%20visa%20desjardins");
  const idVirement = await premiereTransaction({ description: "PAIEMENT VISA DESJARDINS" });
  panneau = await ouvrirDetail(page, idVirement);
  await expect(panneau.getByRole("button", { name: "Supprimer", exact: true })).toBeEnabled();
  await expect(panneau.locator('[data-raison="suppression"]')).toHaveCount(0);
  await examinerEcran(page, "Transactions › détail (virement)");
  await panneau.getByRole("button", { name: "Supprimer", exact: true }).click();
  const dialogueSuppression = dialogueSuppressionVirement(page);
  await expect(dialogueSuppression).toBeVisible();
  await expect(dialogueSuppression.getByRole("button", { name: "Supprimer les deux", exact: true })).toBeEnabled();
  await expect(
    dialogueSuppression.getByRole("button", { name: "Supprimer celle-ci et délier l'autre", exact: true }),
  ).toBeEnabled();
  await verifierExplicationsSuppressionVirement(dialogueSuppression, await detailLu(idVirement));
  await examinerEcran(page, "Transactions › suppression d'un côté de virement (seed)");
  // Rien n'est supprimé : le seed sert à d'autres parcours.
  await dialogueSuppression.getByRole("button", { name: "Annuler", exact: true }).click();
  await expect(dialogueSuppression).toBeHidden();
  await passerEnModification(panneau);
  await expect(panneau.getByRole("combobox", { name: "Sous-catégorie", exact: true })).toBeDisabled();
  await expect(panneau.locator('[data-raison="sous-categorie"]')).toHaveText(messageRefus("SOUS_CATEGORIE_VIREMENT"));
  await panneau.getByRole("button", { name: "Annuler", exact: true }).click();

  await page.goto("/transactions?toutesDates=1&texte=versement%20hypothecaire");
  panneau = await ouvrirDetail(page, await premiereTransaction({ description: "VERSEMENT HYPOTHECAIRE", estVentilee: true }));
  await passerEnModification(panneau);
  await expect(panneau.locator('[data-raison="sous-categorie"]')).toHaveText(messageRefus("SOUS_CATEGORIE_PARENT_VENTILE"));
  await panneau.getByRole("button", { name: "Annuler", exact: true }).click();
});

test("réattribution en masse sur tout le résultat d'un filtre de plus d'une page", async ({ page }, testInfo) => {
  test.setTimeout(240_000);
  const projet = projetDe(testInfo);
  const racine = racineDe(testInfo);
  const S = nomUnique("MASSE", testInfo);
  const etiquette = `Masse ${S}`;

  await creerEtiquette(page, etiquette);

  await analyserReleve(
    page,
    "Chèque",
    2026,
    [ligneDerivee(racine, `MASSE UN ${S.toUpperCase()}`), ligneDerivee(racine, `MASSE DEUX ${S.toUpperCase()}`)].join("\n"),
  );
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  const confirmationImport = page.getByRole("dialog", { name: "Confirmer l'enregistrement", exact: true });
  await expect(confirmationImport).toBeVisible();
  await confirmationImport.getByRole("button", { name: "Confirmer", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Import enregistré" })).toBeVisible();

  async function poserEtiquette(): Promise<void> {
    await ouvrirGesteMasse(page, "Ajouter ou retirer des étiquettes…");
    const dialogue = page.getByRole("dialog", { name: "Ajouter ou retirer des étiquettes", exact: true });
    await expect(dialogue).toBeVisible();
    await dialogue.getByRole("group", { name: "Ajouter", exact: true }).getByRole("switch", { name: etiquette, exact: true }).click();
    await examinerEcran(page, "Transactions › réattribution en masse — étiquettes");
    await dialogue.getByRole("button", { name: "Appliquer", exact: true }).click();
  }

  await page.goto(urlFiltree(S.toLowerCase()));
  await expect(lignesVisibles(page)).toHaveCount(2);
  await cocherAffichees(page, projet);
  await poserEtiquette();
  await attendreToast(page, "2 modifiées");

  await page.goto("/transactions?toutesDates=1&virements=seulement");
  const nV = (await lignesListe({ cotesVirement: true })).length;
  await expect(page.locator("[data-totaux]")).toHaveText(new RegExp(`^${libelleNombreTransactions(nV)} ·`));
  await cocherAffichees(page, projet);
  if (nV > TAILLE_PAGE_TRANSACTIONS) {
    await toutSelectionner(page, nV);
  }
  await poserEtiquette();
  await attendreToast(
    page,
    libelleCompteRendu({
      geste: "ETIQUETTES",
      traitees: nV,
      inchangees: 0,
      ignorees: IGNOREES_VIDES,
      lignesVentilationSupprimees: 0,
      contrepartiesSupprimees: 0,
      contrepartiesDeliees: 0,
    }),
  );

  await page.goto("/transactions?toutesDates=1&ventilees=1");
  const nP = (await lignesListe({ ventilees: true })).length;
  await expect(page.locator("[data-totaux]")).toHaveText(new RegExp(`^${libelleNombreTransactions(nP)} ·`));
  await cocherAffichees(page, projet);
  if (nP > TAILLE_PAGE_TRANSACTIONS) {
    await toutSelectionner(page, nP);
  }
  await poserEtiquette();
  await attendreToast(
    page,
    libelleCompteRendu({
      geste: "ETIQUETTES",
      traitees: nP,
      inchangees: 0,
      ignorees: IGNOREES_VIDES,
      lignesVentilationSupprimees: 0,
      contrepartiesSupprimees: 0,
      contrepartiesDeliees: 0,
    }),
  );

  await page.goto(`/transactions?toutesDates=1&etiquette=${await idEtiquette(etiquette)}`);
  const lignes = await lignesListe({ etiquetteNom: etiquette });
  expect(lignes.length).toBeGreaterThan(TAILLE_PAGE_TRANSACTIONS);
  expect(lignes.length).toBe(2 + nV + nP);
  await expect(page.locator("[data-totaux]")).toHaveText(new RegExp(`^${libelleNombreTransactions(lignes.length)} ·`));
  await cocherAffichees(page, projet);
  await toutSelectionner(page, lignes.length);
  await expect(page.locator("[data-selection]")).toHaveText(`Tout le résultat : ${String(lignes.length)} transactions sélectionnées`);
  await examinerEcran(page, "Transactions › sélection de tout le résultat");

  await ouvrirGesteMasse(page, "Poser une sous-catégorie…");
  const dialogueSousCategorie = page.getByRole("dialog", { name: "Poser une sous-catégorie", exact: true });
  await expect(dialogueSousCategorie).toBeVisible();
  await dialogueSousCategorie.getByRole("button", { name: "Appliquer", exact: true }).click();
  await expect(dialogueSousCategorie.getByText("Choisis une sous-catégorie.", { exact: true })).toBeVisible();
  await choisirOption(page, dialogueSousCategorie.getByRole("combobox", { name: "Sous-catégorie", exact: true }), "Café");
  await examinerEcran(page, "Transactions › réattribution en masse — sous-catégorie");
  await dialogueSousCategorie.getByRole("button", { name: "Appliquer", exact: true }).click();
  const compteRenduSousCategorie = libelleCompteRendu({
    geste: "SOUS_CATEGORIE",
    traitees: 2,
    inchangees: 0,
    ignorees: { ...IGNOREES_VIDES, VIREMENT: nV, VENTILEE: nP },
    lignesVentilationSupprimees: 0,
    contrepartiesSupprimees: 0,
    contrepartiesDeliees: 0,
  });
  await attendreToast(page, compteRenduSousCategorie);
  // Le survol suspend le minuteur du toast de sonner : il reste affiché le temps de l'examen.
  const toastCompteRendu = page.locator("[data-sonner-toast]").filter({ hasText: compteRenduSousCategorie });
  await toastCompteRendu.hover();
  await examinerEcran(page, "Transactions › compte rendu de masse (toast)");

  const apres = await lignesListe({ etiquetteNom: etiquette });
  const ordinaires = apres.filter((ligne) => !ligne.estVirement && !ligne.estVentilee);
  expect(ordinaires).toHaveLength(2);
  const idCafe = await idSousCategorie("Café");
  for (const ligne of ordinaires) {
    expect(ligne.subcategoryId).toBe(idCafe);
    expect(ligne.appliedRuleId).toBeNull();
  }
  for (const ligne of apres.filter((l) => l.estVirement || l.estVentilee)) {
    expect(ligne.subcategoryId, `ligne ignorée ${ligne.id}`).toBeNull();
  }

  // Suppression en masse : les virements sont ignorés, rien ne s'écrit.
  await page.goto("/transactions?toutesDates=1&virements=seulement");
  await cocherAffichees(page, projet);
  if (nV > TAILLE_PAGE_TRANSACTIONS) {
    await toutSelectionner(page, nV);
  }
  await ouvrirGesteMasse(page, "Supprimer…");
  const apercu = page.getByRole("alertdialog");
  // Un côté de virement qui porte lui-même un lien est rangé avec les « liées » (le lien passe avant le virement).
  const nVLies = await nbCotesVirementLies();
  await expect(apercu).toContainText(
    libelleApercuSuppression({
      aSupprimer: 0,
      parentsVentiles: 0,
      lignesVentilation: 0,
      ignorees: { ...IGNOREES_VIDES, VIREMENT: nV - nVLies, LIEE: nVLies },
      cotesVirement: 0,
      contrepartiesSupprimees: 0,
      contrepartiesDeliees: 0,
    }),
  );
  await expect(apercu.getByRole("button", { name: "Supprimer", exact: true })).toBeDisabled();
  await examinerEcran(page, "Transactions › suppression en masse — virements ignorés");
  await apercu.getByRole("button", { name: "Annuler", exact: true }).click();
  await expect(apercu).toBeHidden();

  // Suppression en masse : nettoyage des deux lignes créées par le test.
  await page.goto(urlFiltree(S.toLowerCase()));
  await expect(lignesVisibles(page)).toHaveCount(2);
  await cocherAffichees(page, projet);
  await ouvrirGesteMasse(page, "Supprimer…");
  const confirmation = page.getByRole("alertdialog");
  await expect(confirmation).toContainText("2 transactions seront supprimées. Cette action est définitive.");
  await examinerEcran(page, "Transactions › suppression en masse — confirmation");
  await confirmation.getByRole("button", { name: "Supprimer", exact: true }).click();
  await attendreToast(page, "2 supprimées");
  await expect(lignesVisibles(page)).toHaveCount(0);

  await supprimerEtiquette(page, etiquette);
  expect(await lignesListe({ etiquetteNom: etiquette })).toEqual([]);
});
