import { expect, test, type Locator, type Page } from "@playwright/test";
import { ajouterJours, dateCivileDansFuseau, FUSEAU_APPLICATION } from "@/domain/dates";
import { formatMontant } from "@/domain/money";
import { jourEtMois } from "@/domain/recurrence";
import { LIBELLES_TYPE_COMPTE } from "@/domain/referentiel";
import {
  LIMITE_ANCRAGES,
  LIMITE_DOUBLONS_DIAGNOSTIC,
  LIMITE_LIGNES_MONTANT_DIAGNOSTIC,
  LIBELLES_NATURE_EXPLICATION,
  ORDRE_EXPLICATIONS,
  type AncrageAffiche,
} from "@/domain/solde";
import {
  consequenceSuppressionAncrage,
  LIBELLE_EXPLICATION,
  libelleAjustement,
  libelleBoutonAjustement,
  libelleSaisie,
  libelleSuppressionAncrage,
} from "@/features/soldes/libelles";
import { fermerClientE2e, idCompteParNom } from "./outils/base";
import { examinerEcran } from "./outils/examen";
import { verifierAucunRecouvrement } from "./outils/formulaires";
import {
  analyserReleve,
  creerCompte,
  elementReferentiel,
  enregistrerLaRevue,
  enteteSection,
  nomUnique,
  ouvrirOnglet,
} from "./outils/interface";
import {
  ajustementsDuCompte,
  ancragesDuCompte,
  explicationsAffichees,
  ligneAncrage,
  ligneReleveCheque,
  panneauReconciliation,
  saisirSolde,
  soldeCalculeOracle,
} from "./outils/soldes";
import { attendreToast, lignesVisibles, lireChampDetail, ouvrirDetail } from "./outils/transactions";

test.describe.configure({ mode: "serial" });
test.afterAll(fermerClientE2e);

const aujourdhui = dateCivileDansFuseau(new Date(), FUSEAU_APPLICATION);
const fmt = (c: number) => formatMontant(c, "CENTS");

/** La ligne de sous-titre (nom et type du compte) sous le titre de la fiche. */
function sousTitreDeLaFiche(page: Page): Locator {
  return page.getByRole("heading", { name: "Soldes et réconciliation", exact: true, level: 1 }).locator("xpath=following-sibling::p[1]");
}

async function couleurDe(element: Locator): Promise<string> {
  return element.evaluate((noeud) => getComputedStyle(noeud).color);
}

/** La couleur calculée d'une sonde `<span class="…">` : la référence d'un token de l'interface. */
async function couleurDeSonde(page: Page, classes: string): Promise<string> {
  return page.evaluate((c) => {
    const sonde = document.createElement("span");
    sonde.className = c;
    document.body.append(sonde);
    const couleur = getComputedStyle(sonde).color;
    sonde.remove();
    return couleur;
  }, classes);
}

test("Soldes : la fiche de l'Épargne montre l'écart du seed et son diagnostic", async ({ page }) => {
  test.setTimeout(120_000);
  await ouvrirOnglet(page, "comptes", "Chèque");
  await elementReferentiel(page, "Épargne").getByRole("link", { name: "Soldes et réconciliation", exact: true }).click();
  const epargne = await idCompteParNom("Épargne");
  await expect(page).toHaveURL((url) => url.pathname === `/parametres/comptes/${epargne}`);
  await expect(page.getByRole("heading", { name: "Soldes et réconciliation", exact: true, level: 1 })).toBeVisible();

  await expect(page.locator("[data-solde-aujourdhui]")).toHaveText(fmt(await soldeCalculeOracle(epargne, aujourdhui)));
  // Nom et type coïncident : le sous-titre ne se répète pas.
  await expect(sousTitreDeLaFiche(page)).toHaveText("Épargne");

  const ancrages = await ancragesDuCompte(epargne);
  const premier = ancrages[0];
  if (premier === undefined) throw new Error("L'Épargne du seed devrait porter au moins un solde saisi.");
  const ecart = premier.soldeCents - (await soldeCalculeOracle(epargne, premier.date));
  expect(ecart, "Le seed laisse un écart non nul sur l'Épargne").not.toBe(0);
  const ligne = ligneAncrage(page, premier.id);
  await expect(ligne.locator('[data-statut="ECART_OUVERT"]')).toBeVisible();
  // « Écart ouvert » porte le token d'avertissement (ambre), pas la couleur neutre.
  expect(await couleurDe(ligne.locator('[data-statut="ECART_OUVERT"]'))).toBe(await couleurDeSonde(page, "text-avertissement"));
  await expect(ligne.locator('[data-colonne="ecart"]')).toHaveText(fmt(ecart));
  await expect(page.locator("[data-ancrage-id]")).toHaveCount(Math.min(ancrages.length, LIMITE_ANCRAGES));
  await examinerEcran(page, "Soldes › fiche du compte (Épargne)");

  await ligne.getByRole("button", { name: "Réconciliation", exact: true }).click();
  const panneau = panneauReconciliation(page);
  await expect(panneau).toBeVisible();
  await expect(panneau.locator("[data-ecart-courant]")).toHaveText(fmt(ecart));
  const explications = explicationsAffichees(panneau);
  await expect(explications).toHaveCount(ORDRE_EXPLICATIONS.length);
  for (const [i, nature] of ORDRE_EXPLICATIONS.entries()) {
    await expect(explications.nth(i)).toHaveAttribute("data-explication", nature);
    await expect(explications.nth(i).locator("h3")).toHaveText(LIBELLES_NATURE_EXPLICATION[nature]);
  }
  await expect(panneau.getByRole("button", { name: libelleBoutonAjustement(ecart), exact: true })).toBeEnabled();
  await examinerEcran(page, "Soldes › diagnostic de l'écart (Épargne)");
  await page.keyboard.press("Escape");
  await expect(panneau).toBeHidden();
});

test("Soldes : saisir un écart, l'ajuster, le lire dans la consultation, le supprimer", async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const nom = nomUnique("E2E soldes", testInfo);

  // 1. Compte jetable, fiche vide.
  await creerCompte(page, nom, "CHEQUE");
  await elementReferentiel(page, nom).getByRole("link", { name: "Soldes et réconciliation", exact: true }).click();
  const compteId = await idCompteParNom(nom);
  await expect(page).toHaveURL((url) => url.pathname === `/parametres/comptes/${compteId}`);
  await expect(page.locator("[data-solde-aujourdhui]")).toHaveText(fmt(0));
  await expect(sousTitreDeLaFiche(page)).toHaveText(`${nom} · ${LIBELLES_TYPE_COMPTE.CHEQUE}`);
  await expect(page.getByText("Aucun solde saisi pour ce compte.", { exact: false })).toBeVisible();
  await examinerEcran(page, "Soldes › fiche du compte (compte vide)");

  // 2. Saisie.
  await page.getByRole("button", { name: "Saisir un solde", exact: true }).click();
  const dialogue = page.getByRole("dialog", { name: "Saisir un solde", exact: true });
  await expect(dialogue).toBeVisible();
  await expect(dialogue.getByLabel("Date", { exact: true })).toHaveValue(aujourdhui);
  await dialogue.getByLabel("Solde déclaré", { exact: true }).fill("50,00");
  await expect(dialogue.getByRole("combobox", { name: "Source", exact: true })).toHaveText("Relevé");
  await verifierAucunRecouvrement(dialogue, "Soldes › saisir un solde");
  await examinerEcran(page, "Soldes › saisir un solde");
  await dialogue.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await attendreToast(page, libelleSaisie(5_000));
  const panneau = panneauReconciliation(page);
  await expect(panneau).toBeVisible();

  // 3. Diagnostic.
  await expect(panneau.locator("[data-ecart-courant]")).toHaveText(fmt(5_000));
  const explications = explicationsAffichees(panneau);
  await expect(explications).toHaveCount(ORDRE_EXPLICATIONS.length);
  for (const [i, nature] of ORDRE_EXPLICATIONS.entries()) {
    await expect(explications.nth(i)).toHaveAttribute("data-explication", nature);
  }
  await expect(panneau.locator('[data-explication="PERIODE_NON_COUVERTE"]')).toContainText(
    "Aucune transaction ni aucun import sur ce compte : rien ne couvre la période jusqu'à l'ancrage.",
  );
  await expect(panneau.getByLabel("Explication", { exact: true })).toBeVisible();
  await expect(panneau.getByRole("button", { name: "Enregistrer l'explication", exact: true })).toBeVisible();
  await verifierAucunRecouvrement(panneau, "Soldes › diagnostic de l'écart");
  await examinerEcran(page, "Soldes › diagnostic de l'écart");

  // 4. Ajustement.
  await panneau.getByRole("button", { name: libelleBoutonAjustement(5_000), exact: true }).click();
  await attendreToast(page, libelleAjustement(5_000));
  await expect(panneau.locator("[data-ecart-courant]")).toHaveText(fmt(0));
  await expect(panneau.locator('[data-statut="EQUILIBRE"]').first()).toBeVisible();
  // Le haut du panneau est dans la fenêtre : la zone défilante ne garde pas le défilement du bouton cliqué.
  await expect(panneau.locator("[data-ecart-courant]")).toBeInViewport();
  await expect(panneau.locator('[data-statut="EQUILIBRE"]').first()).toBeInViewport();
  await expect(panneau.getByRole("link", { name: `Ajustement de ${fmt(5_000)}`, exact: true })).toBeInViewport();
  await expect(panneau.getByRole("button", { name: "Créer un ajustement", exact: true })).toBeDisabled();
  await expect(panneau.getByRole("button", { name: /^Créer un ajustement de / })).toHaveCount(0);
  await expect(panneau.getByText("Ce solde a déjà un ajustement.", { exact: true })).toBeVisible();
  // Écart nul : rien à expliquer, le formulaire d'explication disparaît.
  await expect(panneau.getByLabel("Explication", { exact: true })).toHaveCount(0);
  await expect(panneau.getByRole("button", { name: "Enregistrer l'explication", exact: true })).toHaveCount(0);
  // Équilibré reste neutre : seul « Écart ouvert » prend la couleur d'avertissement.
  expect(await couleurDe(panneau.locator('[data-statut="EQUILIBRE"]').first())).not.toBe(
    await couleurDeSonde(page, "text-avertissement"),
  );
  await examinerEcran(page, "Soldes › après ajustement");
  const ajustements = await ajustementsDuCompte(compteId);
  expect(ajustements).toHaveLength(1);
  expect(ajustements[0]).toMatchObject({ date: aujourdhui, montantCents: 5_000 });
  const idAjustement = ajustements[0]?.id ?? "";
  const ancrage = (await ancragesDuCompte(compteId))[0];
  expect(ancrage?.ajustementTxId).toBe(idAjustement);
  const idAncrage = ancrage?.id ?? "";

  // 5. Lecture dans la consultation.
  await page.keyboard.press("Escape");
  await expect(panneau).toBeHidden();
  const ligne = ligneAncrage(page, idAncrage);
  await expect(ligne.locator('[data-statut="EQUILIBRE"]')).toBeVisible();
  await expect(page.locator("[data-solde-aujourdhui]")).toHaveText(fmt(5_000));
  await expect(ligne.getByRole("link", { name: `Ajustement de ${fmt(5_000)}`, exact: true })).toBeInViewport();
  await examinerEcran(page, "Soldes › fiche du compte (solde ajusté, lien vers l'ajustement)");
  await ligne.getByRole("link", { name: `Ajustement de ${fmt(5_000)}`, exact: true }).click();
  await expect(page).toHaveURL(
    (url) =>
      url.pathname === "/transactions" &&
      url.searchParams.get("du") === aujourdhui &&
      url.searchParams.get("au") === aujourdhui &&
      url.searchParams.get("compte") === compteId,
  );
  await expect(lignesVisibles(page)).toHaveCount(1);
  const detail = await ouvrirDetail(page, idAjustement);
  await expect(lireChampDetail(detail, "source")).toContainText("Ajustement");
  await examinerEcran(page, "Soldes › ajustement dans la consultation");

  // 6. Suppression de l'ajustement depuis le détail : permise, l'écart redevient ouvert.
  const supprimerDetail = detail.getByRole("button", { name: "Supprimer", exact: true });
  await expect(supprimerDetail).toBeEnabled();
  await supprimerDetail.click();
  const confirmation = page.getByRole("alertdialog");
  await expect(confirmation).toBeVisible();
  await confirmation.getByRole("button", { name: "Supprimer", exact: true }).click();
  await expect(detail).toBeHidden();
  await attendreToast(page, "Transaction supprimée.");
  expect(await ajustementsDuCompte(compteId)).toHaveLength(0);
  expect((await ancragesDuCompte(compteId))[0]?.ajustementTxId).toBeNull();

  // 7. Retour sur la fiche : l'écart est ouvert par le seul recalcul.
  await page.goto(`/parametres/comptes/${compteId}`);
  const ligneRouverte = ligneAncrage(page, idAncrage);
  await expect(ligneRouverte.locator('[data-statut="ECART_OUVERT"]')).toBeVisible();
  await expect(ligneRouverte.locator('[data-colonne="ecart"]')).toHaveText(fmt(5_000));

  // 8. Ajuster de nouveau, puis supprimer le solde avec son ajustement.
  await ligneRouverte.getByRole("button", { name: "Réconciliation", exact: true }).click();
  const panneau2 = panneauReconciliation(page);
  await expect(panneau2).toBeVisible();
  await panneau2.getByRole("button", { name: libelleBoutonAjustement(5_000), exact: true }).click();
  await expect.poll(async () => (await ajustementsDuCompte(compteId)).length).toBe(1);
  await expect(panneau2.locator("[data-ecart-courant]")).toHaveText(fmt(0));
  await page.keyboard.press("Escape");
  await expect(panneau2).toBeHidden();

  await ligneAncrage(page, idAncrage).getByRole("button", { name: "Supprimer", exact: true }).click();
  const confirmationSolde = page.getByRole("alertdialog");
  await expect(confirmationSolde).toBeVisible();
  const aSupprimer: AncrageAffiche = {
    id: idAncrage,
    accountId: compteId,
    date: aujourdhui,
    source: "RELEVE",
    soldeDeclareCents: 5_000,
    soldeCalculeCents: 5_000,
    ecartCourantCents: 0,
    statut: "EQUILIBRE",
    refusAjustement: "AJUSTEMENT_EXISTANT",
    reconciliation: {
      id: "r",
      ecartConstateCents: 5_000,
      explication: null,
      ajustement: { transactionId: "t", date: aujourdhui, montantCents: 5_000 },
    },
  };
  await expect(confirmationSolde).toContainText(consequenceSuppressionAncrage(aSupprimer));
  await expect(confirmationSolde).toContainText("Son ajustement de");
  await examinerEcran(page, "Soldes › supprimer un solde et son ajustement");
  await confirmationSolde.getByRole("button", { name: "Supprimer", exact: true }).click();
  await attendreToast(page, libelleSuppressionAncrage({ montantCents: 5_000 }));
  await expect(page.getByText("Aucun solde saisi pour ce compte.", { exact: false })).toBeVisible();
  expect(await ancragesDuCompte(compteId)).toHaveLength(0);
  expect(await ajustementsDuCompte(compteId)).toHaveLength(0);

  // 9. Nettoyage : le compte jetable (sans transaction) se supprime.
  await ouvrirOnglet(page, "comptes", "Chèque");
  await elementReferentiel(page, nom).getByRole("button", { name: "Supprimer", exact: true }).click();
  const confirmationCompte = page.getByRole("alertdialog");
  await expect(confirmationCompte).toBeVisible();
  await confirmationCompte.getByRole("button", { name: "Supprimer", exact: true }).click();
  await expect(confirmationCompte).toBeHidden();
  await expect(elementReferentiel(page, nom)).toHaveCount(0);
});

test("Soldes : un solde équilibré sans réconciliation n'offre pas le formulaire d'explication", async ({ page }, testInfo) => {
  test.setTimeout(150_000);
  const nom = nomUnique("E2E soldes eq", testInfo);

  await creerCompte(page, nom, "CHEQUE");
  await elementReferentiel(page, nom).getByRole("link", { name: "Soldes et réconciliation", exact: true }).click();
  const compteId = await idCompteParNom(nom);
  await expect(page).toHaveURL((url) => url.pathname === `/parametres/comptes/${compteId}`);

  // Un solde déclaré égal au solde calculé (zéro, compte vide) : écart nul, aucune réconciliation.
  await page.getByRole("button", { name: "Saisir un solde", exact: true }).click();
  const dialogue = page.getByRole("dialog", { name: "Saisir un solde", exact: true });
  await dialogue.getByLabel("Solde déclaré", { exact: true }).fill("0,00");
  await dialogue.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await attendreToast(page, libelleSaisie(0));
  await expect(dialogue).toBeHidden();

  const ancrage = (await ancragesDuCompte(compteId))[0];
  const idAncrage = ancrage?.id ?? "";
  expect(idAncrage).not.toBe("");
  const ligne = ligneAncrage(page, idAncrage);
  await expect(ligne.locator('[data-statut="EQUILIBRE"]')).toBeVisible();

  await ligne.getByRole("button", { name: "Réconciliation", exact: true }).click();
  const panneau = panneauReconciliation(page);
  await expect(panneau).toBeVisible();
  await expect(panneau.locator("[data-ecart-courant]")).toHaveText(fmt(0));
  await expect(explicationsAffichees(panneau)).toHaveCount(ORDRE_EXPLICATIONS.length);
  await expect(panneau.getByLabel("Explication", { exact: true })).toHaveCount(0);
  await expect(panneau.getByRole("button", { name: "Enregistrer l'explication", exact: true })).toHaveCount(0);
  // Aucune réconciliation n'existe : rien n'est « constaté à la saisie ».
  await expect(panneau.getByText(/^Écart constaté à la saisie/)).toHaveCount(0);
  await examinerEcran(page, "Soldes › solde équilibré sans réconciliation");
  await page.keyboard.press("Escape");
  await expect(panneau).toBeHidden();

  // Nettoyage : le solde, puis le compte jetable.
  await ligneAncrage(page, idAncrage).getByRole("button", { name: "Supprimer", exact: true }).click();
  const confirmationSolde = page.getByRole("alertdialog");
  await expect(confirmationSolde).toBeVisible();
  await confirmationSolde.getByRole("button", { name: "Supprimer", exact: true }).click();
  await expect(page.getByText("Aucun solde saisi pour ce compte.", { exact: false })).toBeVisible();
  await ouvrirOnglet(page, "comptes", "Chèque");
  await elementReferentiel(page, nom).getByRole("button", { name: "Supprimer", exact: true }).click();
  const confirmationCompte = page.getByRole("alertdialog");
  await expect(confirmationCompte).toBeVisible();
  await confirmationCompte.getByRole("button", { name: "Supprimer", exact: true }).click();
  await expect(confirmationCompte).toBeHidden();
  await expect(elementReferentiel(page, nom)).toHaveCount(0);
});

test("Soldes : écart négatif, pistes peuplées, statut Expliqué, solde initial modifié, compte archivé", async ({
  page,
}, testInfo) => {
  test.setTimeout(240_000);
  // Le compte porte des transactions : il ne se supprime pas, il reste archivé dans le schéma e2e.
  const nom = nomUnique("E2E soldes diag", testInfo);
  const explication = "Relevé de janvier pas encore importé en entier";

  await creerCompte(page, nom, "CHEQUE");
  await analyserReleve(
    page,
    nom,
    2024,
    [
      ligneReleveCheque(8, "Janvier", "DOUBLON E2E", -3000),
      ligneReleveCheque(9, "Janvier", "DOUBLON E2E", -3000),
      ligneReleveCheque(9, "Janvier", "EPICERIE E2E", -4500),
    ].join("\n"),
  );
  await expect(enteteSection(page, "À importer (3)")).toBeVisible();
  await enregistrerLaRevue(page);

  // 1. La fiche, par le lien (le cache TanStack doit rester).
  await ouvrirOnglet(page, "comptes", "Chèque");
  await elementReferentiel(page, nom).getByRole("link", { name: "Soldes et réconciliation", exact: true }).click();
  const compteId = await idCompteParNom(nom);
  await expect(page).toHaveURL((url) => url.pathname === `/parametres/comptes/${compteId}`);
  await expect(page.locator("[data-solde-aujourdhui]")).toHaveText(fmt(-10_500));
  await expect(page.locator("[data-solde-aujourdhui]")).toHaveText(fmt(await soldeCalculeOracle(compteId, aujourdhui)));

  // 2. Un solde déclaré sous le solde calculé : écart négatif.
  await saisirSolde(page, "2024-01-10", "-150,00");
  await attendreToast(page, libelleSaisie(-4_500));
  const panneau = panneauReconciliation(page);
  await expect(panneau).toBeVisible();

  // 3. Diagnostic.
  await expect(panneau.locator("[data-ecart-courant]")).toHaveText(fmt(-4_500));
  await expect(panneau.getByRole("button", { name: libelleBoutonAjustement(-4_500), exact: true })).toBeEnabled();
  const doublon = panneau.locator('[data-explication="DOUBLON"]');
  await expect(doublon).toHaveAttribute("data-constat", "PISTE");
  await expect(doublon).toContainText("1 paire de transactions identiques");
  await expect(doublon.locator("ul > li")).toHaveCount(1);
  const liensDoublon = doublon.locator("ul > li a");
  await expect(liensDoublon).toHaveCount(2);
  await expect(liensDoublon.nth(0)).toContainText("DOUBLON E2E");
  await expect(liensDoublon.nth(0)).toContainText("2024-01-08");
  await expect(liensDoublon.nth(1)).toContainText("DOUBLON E2E");
  await expect(liensDoublon.nth(1)).toContainText("2024-01-09");
  const montantErrone = panneau.locator('[data-explication="MONTANT_ERRONE"]');
  await expect(montantErrone).toHaveAttribute("data-constat", "PISTE");
  await expect(montantErrone).toContainText("1 transaction à vérifier");
  await expect(montantErrone.locator("ul > li")).toHaveCount(1);
  // Le message se termine par un mot que la garde d'anonymisation interdit en toutes lettres : on en vérifie le début.
  await expect(montantErrone.locator("ul > li")).toContainText(
    `Une transaction de ${fmt(4_500)} le ${jourEtMois("2024-01-09")} : comptée en trop ou`,
  );
  await expect(montantErrone.locator("ul > li")).toHaveText(/\?$/);
  await expect(panneau.locator('[data-explication="PERIODE_NON_COUVERTE"]')).toHaveAttribute("data-constat", "PISTE");
  await expect(panneau.locator('[data-explication="EN_ATTENTE"]')).toHaveAttribute("data-constat", "RIEN");
  const contexteDiagnostic = "Soldes › diagnostic de l'écart (écart négatif, pistes peuplées)";
  await verifierAucunRecouvrement(panneau, contexteDiagnostic);
  await examinerEcran(page, contexteDiagnostic);
  // La piste « Montant erroné » est sous le pli du panneau : on la montre aussi à l'écran.
  await montantErrone.locator("ul > li").scrollIntoViewIfNeeded();
  await expect(montantErrone.locator("ul > li")).toBeInViewport();
  await examinerEcran(page, "Soldes › diagnostic de l'écart (piste montant erroné peuplée)");

  // 4. Expliquer.
  await panneau.getByLabel("Explication", { exact: true }).fill(explication);
  await panneau.getByRole("button", { name: "Enregistrer l'explication", exact: true }).click();
  await attendreToast(page, LIBELLE_EXPLICATION);
  const statut = panneau.locator('[data-statut="EXPLIQUE"]').first();
  await expect(statut).toBeVisible();
  await expect(statut).toBeInViewport();
  await expect(statut).toHaveText("Expliqué");
  await expect(panneau.getByText(`Explication : « ${explication} »`)).toBeVisible();
  await expect(panneau.locator("[data-ecart-courant]")).toHaveText(fmt(-4_500));
  await examinerEcran(page, "Soldes › diagnostic de l'écart (statut expliqué)");
  await page.keyboard.press("Escape");
  await expect(panneau).toBeHidden();

  // 5. La ligne du tableau.
  const idAncrage = (await ancragesDuCompte(compteId))[0]?.id ?? "";
  expect(idAncrage).not.toBe("");
  await expect(ligneAncrage(page, idAncrage).locator('[data-statut="EXPLIQUE"]')).toBeVisible();
  await expect(ligneAncrage(page, idAncrage).locator('[data-colonne="ecart"]')).toHaveText(fmt(-4_500));
  await examinerEcran(page, "Soldes › fiche du compte (écart négatif, expliqué)");

  // 6. Le solde initial change : la fiche se relit sans rechargement (invalidation de soldes.all).
  await page.getByRole("link", { name: "Retour aux comptes", exact: true }).click();
  await elementReferentiel(page, nom).getByRole("button", { name: "Modifier", exact: true }).click();
  const modifier = page.getByRole("dialog", { name: "Modifier le compte", exact: true });
  await expect(modifier).toBeVisible();
  await modifier.getByLabel("Solde initial", { exact: true }).fill("100,00");
  await modifier.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await attendreToast(page, "Compte modifié.");
  await expect(modifier).toBeHidden();
  await expect(elementReferentiel(page, nom).locator("[data-solde-compte]")).toHaveText(fmt(-500));
  await elementReferentiel(page, nom).getByRole("link", { name: "Soldes et réconciliation", exact: true }).click();
  await expect(page).toHaveURL((url) => url.pathname === `/parametres/comptes/${compteId}`);
  await expect(page.locator("[data-solde-aujourdhui]")).toHaveText(fmt(-500));
  await expect(page.locator("[data-solde-aujourdhui]")).toHaveText(fmt(await soldeCalculeOracle(compteId, aujourdhui)));
  await expect(ligneAncrage(page, idAncrage).locator('[data-colonne="ecart"]')).toHaveText(fmt(-14_500));
  await expect(ligneAncrage(page, idAncrage).locator('[data-statut="EXPLIQUE"]')).toBeVisible();
  await examinerEcran(page, "Soldes › fiche du compte (solde initial modifié)");

  // 7. Ajustement négatif.
  await ligneAncrage(page, idAncrage).getByRole("button", { name: "Réconciliation", exact: true }).click();
  const panneau2 = panneauReconciliation(page);
  await expect(panneau2).toBeVisible();
  await panneau2.getByRole("button", { name: libelleBoutonAjustement(-14_500), exact: true }).click();
  await attendreToast(page, libelleAjustement(-14_500));
  await expect(panneau2.locator("[data-ecart-courant]")).toHaveText(fmt(0));
  await expect(panneau2.locator("[data-ecart-courant]")).toBeInViewport();
  await expect(panneau2.locator('[data-statut="EQUILIBRE"]').first()).toBeInViewport();
  const ajustements = await ajustementsDuCompte(compteId);
  expect(ajustements).toHaveLength(1);
  expect(ajustements[0]).toMatchObject({ date: "2024-01-10", montantCents: -14_500 });
  await page.keyboard.press("Escape");
  await expect(panneau2).toBeHidden();
  await expect(
    ligneAncrage(page, idAncrage).getByRole("link", { name: `Ajustement de ${fmt(-14_500)}`, exact: true }),
  ).toBeVisible();

  // 8. Archivage : le nom accessible de la cellule change, on retrouve la ligne par son texte.
  await page.getByRole("link", { name: "Retour aux comptes", exact: true }).click();
  await elementReferentiel(page, nom).getByRole("button", { name: "Archiver", exact: true }).click();
  await attendreToast(page, "Compte archivé.");
  const ligneArchivee = page.getByRole("row").filter({ hasText: nom });
  await expect(ligneArchivee).toContainText("Archivé");
  await examinerEcran(page, "Paramètres › Comptes › compte archivé");
  await ligneArchivee.getByRole("link", { name: "Soldes et réconciliation", exact: true }).click();
  await expect(sousTitreDeLaFiche(page)).toContainText("Archivé");
  await examinerEcran(page, "Soldes › fiche du compte archivé");
});

test("Soldes : les listes du diagnostic sont bornées et l'annoncent", async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  // Le compte porte des transactions : il ne se supprime pas, il reste actif dans le schéma e2e.
  const nom = nomUnique("E2E soldes bornes", testInfo);

  await creerCompte(page, nom, "CHEQUE");
  const lignes = Array.from({ length: 24 }, (_, i) => ligneReleveCheque(i + 1, "Janvier", "TRONQUE E2E", -1000));
  await analyserReleve(page, nom, 2024, lignes.join("\n"));
  await expect(enteteSection(page, "À importer (24)")).toBeVisible();
  await enregistrerLaRevue(page);

  await ouvrirOnglet(page, "comptes", "Chèque");
  await elementReferentiel(page, nom).getByRole("link", { name: "Soldes et réconciliation", exact: true }).click();
  const compteId = await idCompteParNom(nom);
  await expect(page).toHaveURL((url) => url.pathname === `/parametres/comptes/${compteId}`);
  await saisirSolde(page, "2024-01-31", "-250,00");
  const panneau = panneauReconciliation(page);
  await expect(panneau).toBeVisible();

  const limiteDoublons = String(LIMITE_DOUBLONS_DIAGNOSTIC);
  const limiteMontants = String(LIMITE_LIGNES_MONTANT_DIAGNOSTIC);
  const doublon = panneau.locator('[data-explication="DOUBLON"]');
  await expect(doublon).toContainText(`Plus de ${limiteDoublons} paires de transactions identiques`);
  await expect(doublon).toContainText(`seules les ${limiteDoublons} premières sont affichées`);
  await expect(doublon.locator("ul > li")).toHaveCount(LIMITE_DOUBLONS_DIAGNOSTIC);
  const montantErrone = panneau.locator('[data-explication="MONTANT_ERRONE"]');
  await expect(montantErrone).toContainText(
    `Plus de ${limiteMontants} transactions à vérifier jusqu'à cet ancrage : seules les ${limiteMontants} premières sont affichées.`,
  );
  await expect(montantErrone.locator("ul > li")).toHaveCount(LIMITE_LIGNES_MONTANT_DIAGNOSTIC);
  await examinerEcran(page, "Soldes › diagnostic de l'écart (listes tronquées)");
  const annonceMontants = montantErrone.getByText(`Plus de ${limiteMontants} transactions à vérifier`);
  await annonceMontants.scrollIntoViewIfNeeded();
  await expect(annonceMontants).toBeInViewport();
  await examinerEcran(page, "Soldes › diagnostic de l'écart (liste montant erroné tronquée)");
});

test("Soldes : la liste des soldes saisis est bornée et dit combien sont affichés", async ({ page }, testInfo) => {
  test.setTimeout(300_000);
  const nom = nomUnique("E2E soldes liste", testInfo);

  await creerCompte(page, nom, "CHEQUE");
  await elementReferentiel(page, nom).getByRole("link", { name: "Soldes et réconciliation", exact: true }).click();
  const compteId = await idCompteParNom(nom);
  await expect(page).toHaveURL((url) => url.pathname === `/parametres/comptes/${compteId}`);

  // Écart nul sur un compte vide : aucun panneau ne s'ouvre.
  for (let i = 0; i <= LIMITE_ANCRAGES; i += 1) {
    await saisirSolde(page, ajouterJours("2025-01-01", i), "0,00");
  }

  const ancrages = await ancragesDuCompte(compteId);
  expect(ancrages).toHaveLength(LIMITE_ANCRAGES + 1);
  await expect(page.locator("[data-ancrage-id]")).toHaveCount(LIMITE_ANCRAGES);
  await expect(
    page.getByText(`${String(LIMITE_ANCRAGES)} soldes affichés sur ${String(LIMITE_ANCRAGES + 1)}.`, { exact: true }),
  ).toBeVisible();
  const plusAncien = ancrages[ancrages.length - 1];
  expect(plusAncien).toBeDefined();
  await expect(ligneAncrage(page, plusAncien?.id ?? "")).toHaveCount(0);
  await examinerEcran(page, "Soldes › liste bornée des soldes");

  // Nettoyage par l'interface : un compte sans transaction se supprime.
  await ouvrirOnglet(page, "comptes", "Chèque");
  await elementReferentiel(page, nom).getByRole("button", { name: "Supprimer", exact: true }).click();
  const confirmation = page.getByRole("alertdialog");
  await expect(confirmation).toBeVisible();
  await expect(confirmation).toContainText(`${String(LIMITE_ANCRAGES + 1)} relevé(s) de solde seront supprimés.`);
  await confirmation.getByRole("button", { name: "Supprimer", exact: true }).click();
  await expect(confirmation).toBeHidden();
  await expect(elementReferentiel(page, nom)).toHaveCount(0);
});

test("Soldes : la fiche d'un compte introuvable le dit", async ({ page }) => {
  await page.goto(`/parametres/comptes/c${"0".repeat(24)}`);
  await expect(page.getByText("Ce compte n'existe plus.", { exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("link", { name: "Retour aux comptes", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Soldes et réconciliation", exact: true, level: 1 })).toHaveCount(0);
  await examinerEcran(page, "Soldes › fiche d'un compte introuvable");
});
