import { expect, test, type Page } from "@playwright/test";
import { normaliserDescription } from "@/domain/ingestion/normaliser";
import { formatMontant } from "@/domain/money";
import {
  fermerClientE2e,
  idCompteParNom,
  lotsImportDuCompte,
  nbTransactionsParDescription,
  transactionParDescription,
  transactionsDuCompte,
} from "./outils/base";
import { examinerEcran } from "./outils/examen";
import {
  lireOracleFixture,
  lireTexteFixture,
  ligneDerivee,
  type RejeteeAttendue,
} from "./outils/fixtures";
import {
  analyserReleve,
  choisirOption,
  creerCompte,
  elementReferentiel,
  enteteSection,
  nomUnique,
  ouvrirOnglet,
  projetDe,
  racineDe,
} from "./outils/interface";
import {
  verifierChampsDateLisibles,
  verifierEnTetesAlignes,
  verifierEnTetesSectionsContenus,
  verifierEtiquettesChampsVisibles,
  verifierNomCompteTronque,
} from "./outils/revue-import";
import {
  cocherAffichees,
  lignesVisibles,
  ligneVisible,
  lireChampDetail,
  montantsAffiches,
  ouvrirDetail,
  ouvrirGesteMasse,
  panneauDetail,
} from "./outils/transactions";

test.afterAll(fermerClientE2e);

// Oracle écrit à part du code : l'accord en nombre des libellés de la revue (0 et 1 au singulier).
function accorde(n: number, singulier: string, pluriel: string): string {
  return `${String(n)} ${n >= 2 ? pluriel : singulier}`;
}

const LIBELLES_RAISON: Record<RejeteeAttendue["raison"], string> = {
  AUCUNE_DATE: "Aucune date reconnue",
  AUCUN_MONTANT: "Aucun montant reconnu",
  MOIS_INCONNU: "Nom de mois non reconnu",
  MONTANT_ILLISIBLE: "Montant illisible",
};

function boutonEnregistrer(page: Page) {
  return page.getByRole("button", { name: "Enregistrer", exact: true });
}

async function confirmerEnregistrement(page: Page, nbAttendu: number, contexte: string): Promise<void> {
  await boutonEnregistrer(page).click();
  const dialogue = page.getByRole("dialog", { name: "Confirmer l'enregistrement", exact: true });
  await expect(dialogue).toBeVisible();
  await expect(dialogue).toContainText(accorde(nbAttendu, "ligne à importer.", "lignes à importer."));
  await examinerEcran(page, contexte);
  await dialogue.getByRole("button", { name: "Confirmer", exact: true }).click();
}

test("import collé d'une fixture, puis recollage du même texte", async ({ page }, testInfo) => {
  const racine = racineDe(testInfo);
  const texte = lireTexteFixture(racine, "cheque-desjardins");
  const oracle = lireOracleFixture(racine, "cheque-desjardins");
  const n = oracle.reconnues.length;
  const dates = oracle.reconnues.map((ligne) => ligne.date).sort();
  const debut = dates[0];
  const fin = dates[dates.length - 1];
  expect(debut).toBeDefined();
  expect(fin).toBeDefined();

  const compte = nomUnique("E2E import", testInfo);
  await creerCompte(page, compte, "CHEQUE");
  await analyserReleve(page, compte, oracle.annee, texte);

  await expect(enteteSection(page, `À importer (${String(n)})`)).toBeVisible();
  await expect(enteteSection(page, "Doublons (0)")).toBeVisible();
  await expect(enteteSection(page, "Filtrées (0)")).toBeVisible();
  await expect(enteteSection(page, "Non reconnues (0)")).toBeVisible();
  await expect(page.getByText(/^Le total du relevé/)).toHaveCount(0);
  await expect(page.getByText(accorde(n, "ligne à importer.", "lignes à importer."), { exact: true })).toBeVisible();
  await examinerEcran(page, "Revue de l'import (fixture chèque)");
  await verifierEnTetesSectionsContenus(page, "Revue de l'import (fixture chèque)");
  if (projetDe(testInfo) === "bureau") {
    await verifierEnTetesAlignes(page, "Revue de l'import (fixture chèque)");
  } else {
    await verifierChampsDateLisibles(page, "Revue de l'import (fixture chèque)");
  }

  await expect(boutonEnregistrer(page)).toBeEnabled();
  await confirmerEnregistrement(page, n, "Dialogue Confirmer l'enregistrement (fixture chèque)");
  const dialogueConfirmation = page.getByRole("dialog", { name: "Confirmer l'enregistrement", exact: true });
  await expect(dialogueConfirmation).toBeHidden();

  await expect(page.getByRole("heading", { name: "Import enregistré" })).toBeVisible();
  await expect(
    page.getByText(accorde(n, "transaction importée.", "transactions importées."), { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(`Période couverte : ${debut ?? ""} → ${fin ?? ""}.`, { exact: true }),
  ).toBeVisible();
  await examinerEcran(page, "Import enregistré (fixture chèque)");

  const transactions = await transactionsDuCompte(compte);
  expect(transactions).toHaveLength(n);
  const cle = (ligne: { date: string; montantCents: number; description: string }) =>
    `${ligne.date}|${String(ligne.montantCents)}|${ligne.description}`;
  expect(transactions.map(cle).sort()).toEqual(oracle.reconnues.map(cle).sort());
  for (const transaction of transactions) {
    expect(transaction.descriptionNormalisee).toBe(normaliserDescription(transaction.description));
    expect(transaction.source).toBe("COPIER_COLLER");
  }
  const idLot = transactions[0]?.importBatchId ?? null;
  expect(idLot).not.toBeNull();
  expect(transactions.every((transaction) => transaction.importBatchId === idLot)).toBe(true);
  const lots = await lotsImportDuCompte(compte);
  expect(lots).toHaveLength(1);
  expect(lots[0]).toEqual({
    id: idLot,
    source: "COPIER_COLLER",
    nbLignes: n,
    couvreDu: debut,
    couvreAu: fin,
  });

  await page.getByRole("button", { name: "Importer un autre relevé", exact: true }).click();
  await analyserReleve(page, compte, oracle.annee, texte);

  await expect(enteteSection(page, "À importer (0)")).toBeVisible();
  await expect(enteteSection(page, `Doublons (${String(n)})`)).toBeVisible();
  await expect(enteteSection(page, "Filtrées (0)")).toBeVisible();
  await expect(enteteSection(page, "Non reconnues (0)")).toBeVisible();
  await expect(page.getByText("0 ligne à importer.", { exact: true })).toBeVisible();
  await expect(
    page.getByText(accorde(n, "ligne ignorée comme doublon.", "lignes ignorées comme doublons."), { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Déjà en base (empreinte identique)", { exact: true })).toHaveCount(n);
  await expect(boutonEnregistrer(page)).toBeDisabled();
  await examinerEcran(page, "Revue de l'import (recollage, doublons)");
  await verifierEnTetesSectionsContenus(page, "Revue de l'import (recollage, doublons)");
  if (projetDe(testInfo) === "bureau") {
    await verifierEnTetesAlignes(page, "Revue de l'import (recollage, doublons)");
  } else {
    await verifierChampsDateLisibles(page, "Revue de l'import (recollage, doublons)");
    await verifierEtiquettesChampsVisibles(page, "Revue de l'import (recollage, doublons)");
  }

  expect(await transactionsDuCompte(compte)).toHaveLength(n);
  expect(await lotsImportDuCompte(compte)).toHaveLength(1);
});

test("une ligne non reconnue apparaît et se saisit à la main", async ({ page }, testInfo) => {
  const racine = racineDe(testInfo);
  const texte = lireTexteFixture(racine, "cas-limites");
  const oracle = lireOracleFixture(racine, "cas-limites");
  const affichees = oracle.rejetees.filter((rejetee) => rejetee.raison !== "AUCUNE_DATE");
  const masquees = [
    ...new Set(
      oracle.rejetees
        .filter((rejetee) => rejetee.raison === "AUCUNE_DATE")
        .map((rejetee) => rejetee.numeroLigne),
    ),
  ];
  const nbAffichees = affichees.length;

  const compte = nomUnique("E2E manuel", testInfo);
  await creerCompte(page, compte, "CHEQUE");
  await analyserReleve(page, compte, oracle.annee, texte);

  await expect(enteteSection(page, "À importer (0)")).toBeVisible();
  await expect(enteteSection(page, `Non reconnues (${String(nbAffichees)})`)).toBeVisible();
  for (const rejetee of affichees) {
    const groupe = page.getByRole("group", { name: `Ligne ${String(rejetee.numeroLigne)} non reconnue`, exact: true });
    await expect(groupe).toBeVisible();
    await expect(groupe).toContainText(`Ligne ${String(rejetee.numeroLigne)} — ${LIBELLES_RAISON[rejetee.raison]}`);
  }
  for (const numero of masquees) {
    await expect(
      page.getByRole("group", { name: `Ligne ${String(numero)} non reconnue`, exact: true }),
    ).toHaveCount(0);
  }
  const nbFragments = oracle.rejetees.filter((r) => r.raison === "AUCUNE_DATE").length;
  await expect(page.getByText(`${String(nbFragments)} fragments sans date masqués.`, { exact: true })).toBeVisible();
  await expect(boutonEnregistrer(page)).toBeDisabled();
  await examinerEcran(page, "Revue de l'import (cas limites)");
  await verifierEnTetesSectionsContenus(page, "Revue de l'import (cas limites)");

  const cible = affichees.find((rejetee) => rejetee.raison === "MOIS_INCONNU");
  if (cible === undefined) {
    throw new Error("L'oracle cas-limites ne porte aucune ligne MOIS_INCONNU.");
  }
  const groupe = page.getByRole("group", { name: `Ligne ${String(cible.numeroLigne)} non reconnue`, exact: true });
  await groupe.getByRole("button", { name: "Saisir à la main", exact: true }).click();
  await groupe.getByLabel("Date", { exact: true }).fill("2026-08-31");
  await groupe.getByLabel("Description", { exact: true }).fill("CAFE LUCIOLE (VALBRUM");
  await groupe.getByLabel("Montant", { exact: true }).fill("-11,40");
  await examinerEcran(page, "Revue de l'import (saisie manuelle ouverte)");
  await verifierChampsDateLisibles(page, "Revue de l'import (saisie manuelle ouverte)");
  await groupe.getByRole("button", { name: "Valider", exact: true }).click();

  await expect(groupe.getByText("Récupérée", { exact: true })).toBeVisible();
  await expect(groupe.getByRole("button", { name: "Saisir à la main", exact: true })).toHaveCount(0);
  await expect(enteteSection(page, `Non reconnues (${String(nbAffichees)} · 1 récupérée)`)).toBeVisible();
  await expect(enteteSection(page, "À importer (1)")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Description", exact: true })).toHaveValue("CAFE LUCIOLE (VALBRUM");
  await expect(page.getByText("1 ligne à importer.", { exact: true })).toBeVisible();
  await expect(
    page.getByText(accorde(nbAffichees - 1, "ligne non reconnue.", "lignes non reconnues."), { exact: true }),
  ).toBeVisible();
  await verifierEnTetesSectionsContenus(page, "Revue de l'import (ligne récupérée)");

  await confirmerEnregistrement(page, 1, "Dialogue Confirmer l'enregistrement (saisie manuelle)");
  await expect(page.getByText("1 transaction importée.", { exact: true })).toBeVisible();

  const transactions = await transactionsDuCompte(compte);
  expect(transactions).toHaveLength(1);
  expect(transactions[0]).toMatchObject({
    date: "2026-08-31",
    montantCents: -1140,
    description: "CAFE LUCIOLE (VALBRUM",
  });
});

test("une ligne écartée par un filtre apparaît en Filtrées et se réintègre d'un clic", async ({ page }, testInfo) => {
  const racine = racineDe(testInfo);
  const marchand = nomUnique("E2E filtre", testInfo).toUpperCase();

  await ouvrirOnglet(page, "filtres", "SOLDE PRECEDENT");
  await page.getByRole("button", { name: "Nouveau filtre", exact: true }).click();
  const dialogueFiltre = page.getByRole("dialog", { name: "Nouveau filtre", exact: true });
  await expect(dialogueFiltre).toBeVisible();
  await dialogueFiltre.getByLabel("Motif", { exact: true }).fill(marchand);
  await choisirOption(
    page,
    dialogueFiltre.getByRole("combobox", { name: "Mode de correspondance", exact: true }),
    "Contient",
  );
  await examinerEcran(page, "Paramètres › Filtres › Nouveau filtre");
  await dialogueFiltre.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await expect(dialogueFiltre).toBeHidden();
  await expect(elementReferentiel(page, marchand)).toBeVisible();

  const compte = nomUnique("E2E filtrée", testInfo);
  await creerCompte(page, compte, "CHEQUE");
  await analyserReleve(page, compte, 2026, ligneDerivee(racine, marchand));

  await expect(enteteSection(page, "À importer (0)")).toBeVisible();
  await expect(enteteSection(page, "Filtrées (1)")).toBeVisible();
  await expect(page.getByText(`Filtre : Contient « ${marchand} »`, { exact: true })).toBeVisible();
  await expect(page.getByText("0 ligne à importer.", { exact: true })).toBeVisible();
  await expect(page.getByText("1 ligne filtrée, non importée.", { exact: true })).toBeVisible();
  await expect(boutonEnregistrer(page)).toBeDisabled();
  await examinerEcran(page, "Revue de l'import (ligne filtrée)");
  await verifierEnTetesSectionsContenus(page, "Revue de l'import (ligne filtrée)");
  if (projetDe(testInfo) === "bureau") {
    await verifierEnTetesAlignes(page, "Revue de l'import (ligne filtrée)");
  } else {
    await verifierChampsDateLisibles(page, "Revue de l'import (ligne filtrée)");
  }

  await page.getByRole("button", { name: "Réintégrer", exact: true }).click();

  await expect(page.getByRole("button", { name: "Sera importée — annuler", exact: true })).toBeVisible();
  await expect(enteteSection(page, "Filtrées (1 · 1 réintégrée)")).toBeVisible();
  await expect(enteteSection(page, "À importer (0 · + 1 réintégrée d'une autre section)")).toBeVisible();
  await expect(
    page.getByText("Aucune ligne dans cette section : 1 ligne réintégrée d'une autre section sera importée.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByText("Aucune ligne à importer.", { exact: true })).toHaveCount(0);
  await expect(page.getByText("1 ligne à importer.", { exact: true })).toBeVisible();
  await expect(page.getByText("0 ligne filtrée, non importée.", { exact: true })).toBeVisible();
  await expect(boutonEnregistrer(page)).toBeEnabled();
  await examinerEcran(page, "Revue de l'import (ligne réintégrée)");
  await verifierEnTetesSectionsContenus(page, "Revue de l'import (ligne réintégrée)");

  await confirmerEnregistrement(page, 1, "Dialogue Confirmer l'enregistrement (ligne réintégrée)");
  await expect(page.getByText("1 transaction importée.", { exact: true })).toBeVisible();

  const transactions = await transactionsDuCompte(compte);
  expect(transactions).toHaveLength(1);
  expect(transactions[0]).toMatchObject({ date: "2026-08-31", montantCents: -785, description: marchand });
});

test("les deux règles en conflit du seed produisent une ligne à revoir, rien d'appliqué", async ({ page }, testInfo) => {
  const racine = racineDe(testInfo);
  const marchand = "RESTAURANT CHEZ E2E";
  const texteConflit = "1 ligne porte un conflit de règles non tranché.";

  await analyserReleve(page, "Chèque", 2026, ligneDerivee(racine, marchand));

  await expect(enteteSection(page, "À importer (1)")).toBeVisible();
  await examinerEcran(page, "Revue de l'import (conflit de règles)");
  await verifierEnTetesSectionsContenus(page, "Revue de l'import (conflit de règles)");
  if (projetDe(testInfo) === "bureau") {
    await verifierEnTetesAlignes(page, "Revue de l'import (conflit de règles)");
  } else {
    await verifierChampsDateLisibles(page, "Revue de l'import (conflit de règles)");
  }

  await expect(boutonEnregistrer(page)).toBeDisabled();
  await expect(page.getByText(texteConflit, { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Sous-catégorie", exact: true })).toHaveText("Aucune");
  await expect(page.getByRole("button", { name: "À revoir", pressed: true })).toBeVisible();

  // La ligne est rendue deux fois (tableau md: et cartes) ; une seule des deux est visible.
  await page.locator("[data-conflit-declencheur]").filter({ visible: true }).click();
  const detail = page.locator("[data-detail-conflit]");
  await expect(detail).toBeVisible();
  await expect(detail).toContainText("Restaurant (conflit A) → Restaurant");
  await expect(detail).toContainText("Restaurant (conflit B) → Sorties");
  await page.keyboard.press("Escape");
  await expect(detail).toBeHidden();
  await expect(page.getByText("Sera importée sans sous-catégorie", { exact: true }).filter({ visible: true })).toBeVisible();

  await page.getByRole("button", { name: "J'ai tranché", exact: true }).click();
  await expect(boutonEnregistrer(page)).toBeEnabled();
  await expect(page.getByText(texteConflit, { exact: true })).toHaveCount(0);

  expect(await nbTransactionsParDescription(marchand)).toBe(0);
});

test.describe("au toucher", () => {
  test.use({ hasTouch: true });

  test("le détail d'un conflit s'ouvre d'un toucher", async ({ page }, testInfo) => {
    const racine = racineDe(testInfo);
    const marchand = "RESTAURANT CHEZ E2E";

    await analyserReleve(page, "Chèque", 2026, ligneDerivee(racine, marchand));
    await expect(enteteSection(page, "À importer (1)")).toBeVisible();

    await page.locator("[data-conflit-declencheur]").filter({ visible: true }).tap();
    const detail = page.locator("[data-detail-conflit]");
    await expect(detail).toBeVisible();
    await expect(detail).toContainText("Restaurant (conflit A) → Restaurant");
    await expect(detail).toContainText("Restaurant (conflit B) → Sorties");
    await examinerEcran(page, "Revue de l'import (détail du conflit ouvert)");

    await page.keyboard.press("Escape");
    await expect(detail).toBeHidden();
    expect(await nbTransactionsParDescription(marchand)).toBe(0);
  });
});

test("un relevé Visa collé sur une carte de crédit se lit dans la consultation", async ({ page }, testInfo) => {
  test.setTimeout(240_000);
  const racine = racineDe(testInfo);
  const oracle = lireOracleFixture(racine, "virement-visa");
  const compte = nomUnique("E2E nom de compte très long pour la revue", testInfo);
  const contexte = "Revue de l'import (Visa, nom de compte long)";

  await creerCompte(page, compte, "CREDIT");
  await analyserReleve(page, compte, oracle.annee, lireTexteFixture(racine, "virement-visa"));

  await expect(enteteSection(page, "À importer (2)")).toBeVisible();
  // Garde-fou d'isolation : une ligne de chèque opposée laissée par un autre parcours se dirait ici.
  await expect(page.locator("[data-virement-propose]")).toHaveCount(0);
  // Compte neuf, aucune série : aucun rapprochement ne se propose.
  await expect(page.locator("[data-rapprochement]")).toHaveCount(0);
  await verifierNomCompteTronque(page, compte, contexte);
  if (projetDe(testInfo) === "mobile") {
    await verifierEtiquettesChampsVisibles(page, contexte);
  }
  await examinerEcran(page, contexte);

  await confirmerEnregistrement(page, 2, "Dialogue Confirmer l'enregistrement (Visa)");
  await expect(page.getByText("2 transactions importées.", { exact: true })).toBeVisible();

  const lignes = await transactionsDuCompte(compte);
  expect(lignes).toHaveLength(2);
  await page.goto(`/transactions?toutesDates=1&compte=${await idCompteParNom(compte)}`);
  await expect(lignesVisibles(page)).toHaveCount(2);
  const montants = [...(await montantsAffiches(page))].sort((a, b) => a - b);
  expect(montants).toEqual(oracle.reconnues.map((ligne) => ligne.montantCents).sort((a, b) => a - b));
  for (const attendue of oracle.reconnues) {
    const ligne = lignes.find(
      (candidate) => candidate.date === attendue.date && candidate.montantCents === attendue.montantCents,
    );
    expect(ligne).toBeDefined();
    if (ligne === undefined) {
      continue;
    }
    await expect(ligneVisible(page, ligne.id)).toContainText(formatMontant(attendue.montantCents, "CENTS"));
  }
  const somme = oracle.reconnues.reduce((total, ligne) => total + ligne.montantCents, 0);
  expect(somme).toBe(46368);
  await expect(page.getByText(`2 transactions · ${formatMontant(somme, "CENTS")}`, { exact: true })).toBeVisible();

  const achat = lignes.find((ligne) => ligne.montantCents === -2345);
  expect(achat).toBeDefined();
  if (achat === undefined) {
    return;
  }
  const panneau = await ouvrirDetail(page, achat.id);
  await expect(lireChampDetail(panneau, "montant")).toHaveText(formatMontant(-2345, "CENTS"));
  await expect(lireChampDetail(panneau, "compte")).toHaveText(compte);
  await examinerEcran(page, "Transactions › relevé Visa importé (détail)");
  await page.keyboard.press("Escape");
  await expect(panneauDetail(page)).toBeHidden();

  // Nettoyage par l'interface : le « Paiement. » de 2024 deviendrait un candidat de virement pour un autre parcours.
  await cocherAffichees(page, projetDe(testInfo));
  await ouvrirGesteMasse(page, "Supprimer…");
  const confirmation = page.getByRole("alertdialog");
  await expect(confirmation).toBeVisible();
  await confirmation.getByRole("button", { name: "Supprimer", exact: true }).click();
  await expect(lignesVisibles(page)).toHaveCount(0);
  expect(await transactionsDuCompte(compte)).toHaveLength(0);
});

test("une ligne à revoir arbitrée dans la revue se lit dans la consultation", async ({ page }, testInfo) => {
  test.setTimeout(240_000);
  const racine = racineDe(testInfo);
  const marchand = nomUnique("RESTAURANT ARBITRE", testInfo).toUpperCase();
  const compte = nomUnique("E2E arbitre", testInfo);

  await creerCompte(page, compte, "CHEQUE");
  await analyserReleve(page, compte, 2026, ligneDerivee(racine, marchand));
  await expect(enteteSection(page, "À importer (1)")).toBeVisible();
  await expect(page.locator("[data-conflit-declencheur]").filter({ visible: true })).toHaveCount(1);
  await expect(boutonEnregistrer(page)).toBeDisabled();
  await expect(page.getByRole("button", { name: "À revoir", pressed: true })).toBeVisible();

  // A6 : le geste vaut arbitrage du créneau sous-catégorie.
  await choisirOption(page, page.getByRole("combobox", { name: "Sous-catégorie", exact: true }), "Restaurant");

  await expect(page.locator("[data-conflit-declencheur]").filter({ visible: true })).toHaveCount(0);
  await expect(page.getByText("1 ligne porte un conflit de règles non tranché.", { exact: true })).toHaveCount(0);
  await expect(boutonEnregistrer(page)).toBeEnabled();
  await expect(page.getByRole("button", { name: "À revoir", pressed: true })).toBeVisible();
  await examinerEcran(page, "Revue de l'import (conflit arbitré)");

  await confirmerEnregistrement(page, 1, "Dialogue Confirmer l'enregistrement (conflit arbitré)");
  await expect(page.getByText("1 transaction importée.", { exact: true })).toBeVisible();

  const ecrite = await transactionParDescription(marchand);
  expect(ecrite?.sousCategorieNom).toBe("Restaurant");
  expect(ecrite?.appliedRuleId).toBeNull();

  await page.goto(`/transactions?toutesDates=1&aRevoir=1&compte=${await idCompteParNom(compte)}`);
  await expect(lignesVisibles(page)).toHaveCount(1);
  if (ecrite === null) {
    return;
  }
  await expect(ligneVisible(page, ecrite.id)).toContainText("Restaurant");
  const panneau = await ouvrirDetail(page, ecrite.id);
  await expect(lireChampDetail(panneau, "sousCategorie")).toHaveText(/(^| › )Restaurant$/);
  await expect(lireChampDetail(panneau, "regle")).toHaveText("Aucune");
  await expect(lireChampDetail(panneau, "aRevoir")).toHaveText("Oui");
  await examinerEcran(page, "Transactions › ligne à revoir arbitrée (détail)");

  await panneau.getByRole("button", { name: "Supprimer", exact: true }).click();
  const confirmation = page.getByRole("alertdialog");
  await expect(confirmation).toBeVisible();
  await confirmation.getByRole("button", { name: "Supprimer", exact: true }).click();
  await expect(page.getByText("Transaction supprimée.", { exact: true }).first()).toBeVisible();
  expect(await nbTransactionsParDescription(marchand)).toBe(0);
});
