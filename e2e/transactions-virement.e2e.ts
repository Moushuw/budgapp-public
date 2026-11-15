import { expect, test, type Page } from "@playwright/test";
import { ajouterJours, versDateUtc } from "@/domain/dates";
import { libelleApercuSuppression, libelleCompteRendu, libelleDeliaison } from "@/features/transactions/presentation";
import { formatMontant } from "@/domain/money";
import { IGNOREES_VIDES } from "@/domain/edition";
import {
  clientE2e,
  detailLu,
  fermerClientE2e,
  nbTransactionsParDescription,
  transactionParDescription,
  transactionsDuCompte,
  virementLu,
} from "./outils/base";
import { examinerEcran } from "./outils/examen";
import { lireOracleFixture, lireTexteFixture } from "./outils/fixtures";
import { verifierBordsHautsEgaux } from "./outils/formulaires";
import { analyserReleve, choisirOption, creerCompte, nomUnique, projetDe, racineDe } from "./outils/interface";
import {
  attendreToast,
  cocherAffichees,
  dialogueCreerContrepartie,
  dialogueLierVirement,
  dialogueSuppressionVirement,
  lignesVisibles,
  lireChampDetail,
  ouvrirDetail,
  ouvrirGesteMasse,
  ouvrirNouvelleTransaction,
  verifierExplicationsSuppressionVirement,
} from "./outils/transactions";

test.afterAll(fermerClientE2e);

function urlFiltree(texte: string): string {
  return `/transactions?toutesDates=1&texte=${encodeURIComponent(texte)}`;
}

async function idCompte(nom: string): Promise<string> {
  const compte = await clientE2e().account.findFirst({ where: { nom }, select: { id: true } });
  if (compte === null) {
    throw new Error(`Compte « ${nom} » absent.`);
  }
  return compte.id;
}

async function enregistrerLaRevue(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  const confirmation = page.getByRole("dialog", { name: "Confirmer l'enregistrement", exact: true });
  await expect(confirmation).toBeVisible();
  await confirmation.getByRole("button", { name: "Confirmer", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Import enregistré" })).toBeVisible();
}

test("un paiement de carte ne compte pas deux fois : le virement proposé à l'import, lié à l'enregistrement", async (
  { page },
  testInfo,
) => {
  test.setTimeout(240_000);
  const racine = racineDe(testInfo);
  const nomCheque = nomUnique("CHQ VIR", testInfo);
  const nomVisa = nomUnique("VISA VIR", testInfo);
  const oracleCheque = lireOracleFixture(racine, "virement-cheque");
  const oracleVisa = lireOracleFixture(racine, "virement-visa");
  const paiementCheque = oracleCheque.reconnues.find((r) => r.description === "VISA DESJARDINS");
  const paiementVisa = oracleVisa.reconnues.find((r) => r.description === "Paiement.");
  expect(paiementCheque).toBeDefined();
  expect(paiementVisa).toBeDefined();
  if (paiementCheque === undefined || paiementVisa === undefined) return;

  await creerCompte(page, nomCheque, "CHEQUE");
  await creerCompte(page, nomVisa, "CREDIT");

  // Le chèque.
  await analyserReleve(page, nomCheque, oracleCheque.annee, lireTexteFixture(racine, "virement-cheque"));
  await enregistrerLaRevue(page);

  // La Visa : « Paiement. » propose la ligne du chèque, case cochée.
  await analyserReleve(page, nomVisa, oracleVisa.annee, lireTexteFixture(racine, "virement-visa"));
  const propose = page.locator("[data-virement-propose]").filter({ visible: true });
  await expect(propose).toHaveCount(1);
  await expect(propose).toContainText(nomCheque);
  await expect(propose).toContainText(paiementCheque.date);
  await expect(propose).toContainText(formatMontant(paiementCheque.montantCents, "CENTS"));
  await expect(propose.getByRole("checkbox")).toBeChecked();
  await examinerEcran(page, "Importer › revue (virement proposé)");

  // La confirmation et le récapitulatif le disent.
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  const confirmation = page.getByRole("dialog", { name: "Confirmer l'enregistrement", exact: true });
  await expect(confirmation).toBeVisible();
  await expect(confirmation).toContainText("1 ligne sera liée en virement.");
  await examinerEcran(page, "Importer › confirmation (virement)");
  await confirmation.getByRole("button", { name: "Confirmer", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Import enregistré" })).toBeVisible();
  await expect(page.getByText("1 virement lié.", { exact: true })).toBeVisible();

  // En base, d'après l'oracle de la fixture.
  const lignesCheque = await transactionsDuCompte(nomCheque);
  const lignesVisa = await transactionsDuCompte(nomVisa);
  const cote = lignesVisa.find((l) => l.date === paiementVisa.date && l.montantCents === paiementVisa.montantCents);
  const autre = lignesCheque.find((l) => l.date === paiementCheque.date && l.montantCents === paiementCheque.montantCents);
  expect(cote).toBeDefined();
  expect(autre).toBeDefined();
  if (cote === undefined || autre === undefined) return;
  const lueCote = await virementLu(cote.id);
  const lueAutre = await virementLu(autre.id);
  expect(lueCote).toMatchObject({
    transferTransactionId: autre.id,
    transferAccountId: lueAutre?.accountId,
    subcategoryId: null,
    appliedRuleId: null,
  });
  expect(lueAutre).toMatchObject({
    transferTransactionId: cote.id,
    transferAccountId: lueCote?.accountId,
    subcategoryId: null,
    appliedRuleId: null,
  });
  // La librairie n'est pas un virement.
  const librairie = lignesVisa.find((l) => l.description === "Librairie Imaginaire");
  expect(librairie).toBeDefined();
  if (librairie !== undefined) {
    expect((await virementLu(librairie.id))?.transferTransactionId).toBeNull();
  }

  // La liste ne montre que ce côté, et le détail dit l'autre.
  await page.goto(`/transactions?toutesDates=1&virements=seulement&compte=${await idCompte(nomVisa)}`);
  await expect(lignesVisibles(page)).toHaveCount(1);
  const panneau = await ouvrirDetail(page, cote.id);
  await expect(lireChampDetail(panneau, "virement")).toHaveText(
    `${nomCheque} · ${paiementCheque.date} · ${formatMontant(paiementCheque.montantCents, "CENTS")}`,
  );
  await expect(lireChampDetail(panneau, "sousCategorie")).toHaveText("Aucune");
  await expect(panneau.getByRole("button", { name: "Délier", exact: true })).toBeVisible();
  await examinerEcran(page, "Transactions › détail (virement importé)");

  await panneau.getByRole("button", { name: "Ouvrir la contrepartie", exact: true }).click();
  await expect(lireChampDetail(panneau, "description")).toHaveText(autre.description);

  // Nettoyage par l'interface : les deux côtés partent ensemble.
  await panneau.getByRole("button", { name: "Supprimer", exact: true }).click();
  const suppression = dialogueSuppressionVirement(page);
  await expect(suppression).toBeVisible();
  await suppression.getByRole("button", { name: "Supprimer les deux", exact: true }).click();
  await attendreToast(page, "Les deux côtés du virement ont été supprimés.");
  expect(await virementLu(cote.id)).toBeNull();
  expect(await virementLu(autre.id)).toBeNull();
});

test("virements à la main : lier, délier, créer la contrepartie, supprimer un côté avec chacune des deux options, saisir un virement", async (
  { page },
  testInfo,
) => {
  test.setTimeout(240_000);
  const D = projetDe(testInfo) === "mobile" ? "2099-03-10" : "2099-04-10";
  const D2 = ajouterJours(D, 2);
  const S = nomUnique("VIR MAIN", testInfo);
  const idCheque = await idCompte("Chèque");
  const idEpargne = await idCompte("Épargne");

  async function saisir(description: string, compte: string, date: string, montant: string, sousCategorie?: string): Promise<void> {
    await page.goto("/transactions");
    const dialogue = await ouvrirNouvelleTransaction(page);
    await choisirOption(page, dialogue.getByRole("combobox", { name: "Compte", exact: true }), compte);
    await dialogue.getByLabel("Date", { exact: true }).fill(date);
    await dialogue.getByLabel("Description", { exact: true }).fill(description);
    await dialogue.getByLabel("Montant", { exact: true }).fill(montant);
    if (sousCategorie !== undefined) {
      await choisirOption(page, dialogue.getByRole("combobox", { name: "Sous-catégorie", exact: true }), sousCategorie);
    }
    await dialogue.getByRole("button", { name: "Enregistrer", exact: true }).click();
    await attendreToast(page, "Transaction enregistrée.");
    await expect(dialogue).toBeHidden();
  }

  async function saisirVirement(description: string, montant: string): Promise<void> {
    await page.goto("/transactions");
    const dialogue = await ouvrirNouvelleTransaction(page);
    await choisirOption(page, dialogue.getByRole("combobox", { name: "Compte", exact: true }), "Chèque");
    await choisirOption(page, dialogue.getByRole("combobox", { name: "Sous-catégorie", exact: true }), "Café");
    await dialogue.getByRole("switch", { name: "Virement vers un autre compte", exact: true }).click();
    await expect(
      dialogue.getByText("La sous-catégorie choisie a été retirée : un virement n'en porte pas.", { exact: true }),
    ).toBeVisible();
    await expect(dialogue.getByRole("combobox", { name: "Sous-catégorie", exact: true })).toHaveCount(0);
    await choisirOption(page, dialogue.getByRole("combobox", { name: "Compte de destination", exact: true }), "Épargne");
    await dialogue.getByLabel("Date", { exact: true }).fill(D);
    await dialogue.getByLabel("Montant", { exact: true }).fill(montant);
    await dialogue.getByLabel("Description", { exact: true }).fill(description);
    if (montant === "-75,00") {
      const contexte = "Transactions › nouvelle transaction — saisie d'un virement";
      await examinerEcran(page, contexte);
      await expect(dialogue.locator("[data-barre-action]")).toHaveCount(1);
      await verifierBordsHautsEgaux(dialogue.getByLabel("Date", { exact: true }), dialogue.getByLabel("Montant", { exact: true }), contexte);
    }
    await dialogue.getByRole("button", { name: "Enregistrer", exact: true }).click();
    await attendreToast(page, "Virement enregistré : les deux côtés sont liés.");
    await expect(dialogue).toBeHidden();
  }

  // 1. Deux transactions sans lien.
  const descA = `A ${S}`;
  const descB = `B ${S}`;
  await saisir(descA, "Chèque", D, "-250,00", "Café");
  await saisir(descB, "Épargne", D2, "250,00");
  const a = await transactionParDescription(descA);
  const b = await transactionParDescription(descB);
  expect(a).not.toBeNull();
  expect(b).not.toBeNull();
  if (a === null || b === null) return;
  expect(a.sousCategorieNom).toBe("Café");

  // 2. Lier.
  await page.goto(urlFiltree(descA));
  let panneau = await ouvrirDetail(page, a.id);
  await panneau.getByRole("button", { name: "Lier en virement", exact: true }).click();
  const lier = dialogueLierVirement(page);
  await expect(lier).toBeVisible();
  const radio = lier.getByRole("radio");
  await expect(radio).toHaveCount(1);
  await expect(radio).toBeChecked();
  await expect(lier.getByText(descB)).toBeVisible();
  await expect(lier.locator("[data-consequence-liaison]")).toContainText(
    `La sous-catégorie « Café » de la ligne du ${D} (Chèque) sera retirée.`,
  );
  await examinerEcran(page, "Transactions › lier en virement");
  await lier.getByRole("button", { name: "Lier", exact: true }).click();
  await attendreToast(page, "Virement lié.");
  await expect(lier).toBeHidden();
  expect(await virementLu(a.id)).toMatchObject({ transferTransactionId: b.id, subcategoryId: null, appliedRuleId: null });
  expect(await virementLu(b.id)).toMatchObject({ transferTransactionId: a.id, subcategoryId: null });

  // 3. Délier.
  const consequenceDeliaison = libelleDeliaison(await detailLu(a.id));
  await panneau.getByRole("button", { name: "Délier", exact: true }).click();
  const deliaison = page.getByRole("alertdialog", { name: "Délier le virement", exact: true });
  await expect(deliaison).toBeVisible();
  await expect(deliaison).toContainText(consequenceDeliaison);
  await examinerEcran(page, "Transactions › délier le virement");
  await deliaison.getByRole("button", { name: "Délier", exact: true }).click();
  await attendreToast(page, "Virement délié.");
  await expect(deliaison).toBeHidden();
  expect(await virementLu(a.id)).toMatchObject({ transferTransactionId: null, transferAccountId: null, subcategoryId: null });
  expect(await virementLu(b.id)).toMatchObject({ transferTransactionId: null, transferAccountId: null });

  // 4. Créer la contrepartie.
  await panneau.getByRole("button", { name: "Créer la contrepartie", exact: true }).click();
  const creer = dialogueCreerContrepartie(page);
  await expect(creer).toBeVisible();
  await choisirOption(page, creer.getByRole("combobox", { name: "Compte de la contrepartie", exact: true }), "Épargne");
  await expect(creer.locator("[data-consequence-contrepartie]")).toContainText("Virement depuis Chèque");
  await examinerEcran(page, "Transactions › créer la contrepartie");
  await creer.getByRole("button", { name: "Créer et lier", exact: true }).click();
  await attendreToast(page, "Contrepartie créée et liée.");
  await expect(creer).toBeHidden();
  const lueA = await virementLu(a.id);
  const idContrepartie = lueA?.transferTransactionId ?? null;
  expect(idContrepartie).not.toBeNull();
  if (idContrepartie === null) return;
  expect(await virementLu(idContrepartie)).toMatchObject({
    accountId: idEpargne,
    montantCents: 25000,
    transferTransactionId: a.id,
    transferAccountId: idCheque,
  });
  expect((await detailLu(idContrepartie)).source).toBe("MANUELLE");

  // 5. Supprimer celle-ci et délier l'autre.
  const detailAvantSuppression = await detailLu(a.id);
  await panneau.getByRole("button", { name: "Supprimer", exact: true }).click();
  let suppression = dialogueSuppressionVirement(page);
  await expect(suppression).toBeVisible();
  await verifierExplicationsSuppressionVirement(suppression, detailAvantSuppression);
  await examinerEcran(page, "Transactions › suppression d'un côté de virement");
  await suppression.getByRole("button", { name: "Supprimer celle-ci et délier l'autre", exact: true }).click();
  await attendreToast(page, "Transaction supprimée ; l'autre côté du virement est délié.");
  expect(await virementLu(a.id)).toBeNull();
  expect(await virementLu(idContrepartie)).toMatchObject({ transferTransactionId: null, transferAccountId: null });

  // 6. Saisir un virement.
  const descV = `V ${S}`;
  await saisirVirement(descV, "-75,00");
  const v1 = await transactionParDescription(descV);
  expect(v1).not.toBeNull();
  if (v1 === null) return;
  expect(v1).toMatchObject({ accountId: idCheque, montantCents: -7500, sousCategorieNom: null });
  const lueV1 = await virementLu(v1.id);
  const idV2 = lueV1?.transferTransactionId ?? null;
  expect(idV2).not.toBeNull();
  if (idV2 === null) return;
  expect(await virementLu(idV2)).toMatchObject({
    accountId: idEpargne,
    montantCents: 7500,
    transferTransactionId: v1.id,
    subcategoryId: null,
  });
  const detailV2 = await detailLu(idV2);
  expect(detailV2.description).toBe("Virement depuis Chèque");
  expect(detailV2.beneficiaireNom).toBeNull();

  // 7. Supprimer les deux.
  await page.goto(urlFiltree(descV));
  panneau = await ouvrirDetail(page, v1.id);
  await panneau.getByRole("button", { name: "Supprimer", exact: true }).click();
  suppression = dialogueSuppressionVirement(page);
  await expect(suppression).toBeVisible();
  await suppression.getByRole("button", { name: "Supprimer les deux", exact: true }).click();
  await attendreToast(page, "Les deux côtés du virement ont été supprimés.");
  expect(await virementLu(v1.id)).toBeNull();
  expect(await virementLu(idV2)).toBeNull();
  expect(await nbTransactionsParDescription(descV)).toBe(0);

  // 8. Masse : un second virement, puis tout ce qui reste de la plage.
  const descW = `W ${S}`;
  await saisirVirement(descW, "-30,00");
  await page.goto(`/transactions?du=${D}&au=${D2}`);
  const dansLaPlage = { accountId: { in: [idCheque, idEpargne] }, date: { gte: versDateUtc(D), lte: versDateUtc(D2) } };
  const restantes = await clientE2e().transaction.count({ where: dansLaPlage });
  // B et la contrepartie déliée de l'étape 5, plus les deux côtés de W.
  expect(restantes).toBe(4);
  await expect(lignesVisibles(page)).toHaveCount(4);
  await cocherAffichees(page, projetDe(testInfo));
  await ouvrirGesteMasse(page, "Supprimer…");
  const apercu = page.getByRole("alertdialog");
  await expect(apercu).toBeVisible();
  const choix = apercu.locator("[data-choix-virements]");
  await expect(choix).toBeVisible();
  await expect(apercu.getByRole("button", { name: "Supprimer", exact: true })).toBeDisabled();
  await expect(apercu).toContainText(
    libelleApercuSuppression({
      aSupprimer: 2,
      parentsVentiles: 0,
      lignesVentilation: 0,
      ignorees: { ...IGNOREES_VIDES, VIREMENT: 2 },
      cotesVirement: 0,
      contrepartiesSupprimees: 0,
      contrepartiesDeliees: 0,
    }),
  );
  await examinerEcran(page, "Transactions › suppression en masse (virements)");
  await choix.getByLabel("Supprimer aussi l'autre côté", { exact: true }).check();
  await expect(apercu).toContainText(
    libelleApercuSuppression({
      aSupprimer: 4,
      parentsVentiles: 0,
      lignesVentilation: 0,
      ignorees: IGNOREES_VIDES,
      cotesVirement: 2,
      contrepartiesSupprimees: 0,
      contrepartiesDeliees: 0,
    }),
  );
  await apercu.getByRole("button", { name: "Supprimer", exact: true }).click();
  await attendreToast(
    page,
    libelleCompteRendu({
      geste: "SUPPRIMER",
      traitees: 4,
      inchangees: 0,
      ignorees: IGNOREES_VIDES,
      lignesVentilationSupprimees: 0,
      contrepartiesSupprimees: 0,
      contrepartiesDeliees: 0,
    }),
  );
  expect(await clientE2e().transaction.count({ where: dansLaPlage })).toBe(0);
  expect(await nbTransactionsParDescription(descB)).toBe(0);
  expect(await nbTransactionsParDescription(descW)).toBe(0);
});
