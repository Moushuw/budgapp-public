import { expect, test, type Locator, type Page } from "@playwright/test";
import { dateCivileDansFuseau, FUSEAU_APPLICATION, moisDe, moisPrecedent } from "@/domain/dates";
import { libellePeriode } from "@/domain/periode";
import {
  libelleNombreARevoir,
  libelleNombreTransactions,
  libelleTotaux,
  valeursDetail,
} from "@/features/transactions/presentation";
import {
  compterParTexteAplati,
  detailLu,
  fermerClientE2e,
  lignesOracle,
  nbTransactionsARevoir,
  premiereTransaction,
} from "./outils/base";
import { examinerEcran } from "./outils/examen";
import { verifierAucunRecouvrement } from "./outils/formulaires";
import { ligneDerivee } from "./outils/fixtures";
import { analyserReleve, nomUnique, projetDe, racineDe } from "./outils/interface";
import { verifierChampsDateLisibles } from "./outils/revue-import";
import {
  appliquerFiltres,
  attendreBarreAuRepos,
  CHAMPS_DETAIL,
  choisirTri,
  choisirTypePeriode,
  idsAffiches,
  ligneVisible,
  lignesVisibles,
  lireChampDetail,
  lireTousLesChamps,
  montantsAffiches,
  ordreOracle,
  ouvrirDetail,
  panneauFiltres,
  rechercher,
} from "./outils/transactions";

test.afterAll(fermerClientE2e);

function enTete(page: Page): Locator {
  return page.locator("[data-totaux]");
}

async function attendreNombre(page: Page, n: number): Promise<void> {
  await expect(enTete(page)).toHaveText(new RegExp(`^${String(n)} transactions? ·`));
}

function etatDeLigne(ligne: Locator, libelle: string): Locator {
  return ligne.getByRole("img", { name: libelle, exact: true }).or(ligne.getByText(libelle, { exact: true }));
}

async function verifierTousLesChamps(panneau: Locator, id: string): Promise<void> {
  const lus = await lireTousLesChamps(panneau);
  const attendus = valeursDetail(await detailLu(id));
  for (const champ of CHAMPS_DETAIL) {
    expect(lus[champ], `champ ${champ}`).toBe(attendus[champ]);
  }
}

/** Le titre d'une section ne se répète pas en étiquette : pas de `dt`, et aucun élément de la section, hors le titre, ne le redit. */
async function verifierTitreNonRepete(panneau: Locator, champ: "virement" | "ventilation", titre: string): Promise<void> {
  await expect(panneau.locator(`[data-champ="${champ}"] dt`)).toHaveCount(0);
  const section = panneau
    .locator("section")
    .filter({ has: panneau.page().getByRole("heading", { name: titre, exact: true, level: 3 }) });
  await expect(section).toHaveCount(1);
  const repetes = await section.evaluate(
    (noeud, attendu) =>
      Array.from(noeud.querySelectorAll("*")).filter(
        (element) => element.tagName !== "H3" && element.textContent.trim() === attendu,
      ).length,
    titre,
  );
  expect(repetes, `Le titre « ${titre} » est répété dans sa section`).toBe(0);
}

test("retrouver une transaction par une recherche sans accents, puis lire son détail", async ({ page }, testInfo) => {
  const racine = racineDe(testInfo);
  const suffixe = nomUnique("E2E", testInfo);
  const marchand = `CAFÉ DÉPÔT ${suffixe.toUpperCase()}`;
  const note = `Crème brûlée ${suffixe}`;

  await analyserReleve(page, "Chèque", 2026, ligneDerivee(racine, marchand));
  await page.getByPlaceholder("Note").filter({ visible: true }).fill(note);
  const aRevoir = page.getByRole("button", { name: "À revoir", exact: true }).filter({ visible: true });
  if ((await aRevoir.getAttribute("aria-pressed")) !== "true") {
    await aRevoir.click();
  }
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  const confirmation = page.getByRole("dialog", { name: "Confirmer l'enregistrement", exact: true });
  await expect(confirmation).toBeVisible();
  await confirmation.getByRole("button", { name: "Confirmer", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Import enregistré" })).toBeVisible();

  await page.goto("/transactions");
  await choisirTypePeriode(page, "Tout");

  await rechercher(page, `cafe depot ${suffixe.toLowerCase()}`);
  await expect(lignesVisibles(page)).toHaveCount(1);
  await expect(enTete(page)).toHaveText(libelleTotaux({ nombre: 1, sommeCents: -785 }));
  const id = (await idsAffiches(page))[0];
  expect(id).toBeDefined();
  if (id === undefined) return;

  await rechercher(page, `creme brulee ${suffixe.toLowerCase()}`);
  await expect(lignesVisibles(page)).toHaveCount(1);
  expect(await idsAffiches(page)).toEqual([id]);

  await rechercher(page, "cafe depot");
  await attendreNombre(page, await compterParTexteAplati("cafe depot"));

  await rechercher(page, `cafe depot ${suffixe.toLowerCase()}`);
  await expect(lignesVisibles(page)).toHaveCount(1);
  const panneau = await ouvrirDetail(page, id);
  await expect(lireChampDetail(panneau, "empreinte")).toBeHidden();
  await verifierTousLesChamps(panneau, id);

  await expect(lireChampDetail(panneau, "typeOperation")).toHaveText("Achat");
  await expect(lireChampDetail(panneau, "note")).toHaveText(note);
  await expect(lireChampDetail(panneau, "aRevoir")).toHaveText("Oui");
  await expect(lireChampDetail(panneau, "source")).toHaveText("Copier-coller");
  await expect(lireChampDetail(panneau, "lotImport")).toHaveText(/^Importé le /);
  await expect(lireChampDetail(panneau, "etat")).toHaveText("Comptabilisée");
  await expect(lireChampDetail(panneau, "externalId")).toHaveText("—");
  await expect(lireChampDetail(panneau, "empreinte")).toBeVisible();
  await expect(lireChampDetail(panneau, "empreinte")).toHaveText((await detailLu(id)).empreinte);
  await examinerEcran(page, "Transactions › détail (importée)");
});

test("retrouver une transaction du seed par son bénéficiaire accentué, avec une recherche sans accents", async ({ page }) => {
  const beneficiaire = "SOCIÉTÉ DE L'ASSURANCE AUTOMOBILE DU QUÉBEC";
  await page.goto("/transactions?toutesDates=1");
  await rechercher(page, "societe de l'assurance automobile du quebec");
  const n = await compterParTexteAplati("societe de l'assurance automobile du quebec");
  expect(n).toBeGreaterThan(0);
  await attendreNombre(page, n);

  const id = await premiereTransaction({ description: "SAAQ IMMATRICULATION" });
  const ligne = ligneVisible(page, id);
  await expect(ligne).toBeVisible();
  await expect(ligne).toContainText(beneficiaire);

  const panneau = await ouvrirDetail(page, id);
  await expect(lireChampDetail(panneau, "beneficiaire")).toHaveText(beneficiaire);
});

test("filtrer par compte et sous-catégorie, trier par montant, charger une deuxième page", async ({ page }, testInfo) => {
  await page.goto("/transactions?toutesDates=1");
  await appliquerFiltres(page, { comptes: ["Visa"], sousCategories: ["Épicerie"] }, async () => {
    await examinerEcran(page, "Transactions › filtres");
    await verifierAucunRecouvrement(panneauFiltres(page).locator("form"), "Transactions › filtres");
    if (projetDe(testInfo) === "mobile") {
      await verifierChampsDateLisibles(page, "Transactions › filtres");
    }
  });
  await page.waitForURL(/compte=/);
  for (const libelle of ["Toutes les dates", "Compte : Visa", "Sous-catégorie : Épicerie"]) {
    await expect(page.getByRole("button", { name: `Retirer le filtre ${libelle}`, exact: true })).toBeVisible();
  }

  const oracle = await lignesOracle({ compteNom: "Visa", sousCategorieNom: "Épicerie" });
  expect(oracle.length).toBeGreaterThan(100);
  await attendreNombre(page, oracle.length);

  const triDate = { champ: "DATE", ordre: "DESC" } as const;
  await expect(lignesVisibles(page)).toHaveCount(50);
  const attenduDate = ordreOracle(oracle, triDate).map((ligne) => ligne.id);
  expect(await idsAffiches(page)).toEqual(attenduDate.slice(0, 50));
  await examinerEcran(page, "Transactions › liste filtrée");

  await page.getByRole("button", { name: "Charger plus", exact: true }).click();
  await expect(lignesVisibles(page)).toHaveCount(100);
  const cent = await idsAffiches(page);
  expect(new Set(cent).size).toBe(100);
  expect(cent).toEqual(attenduDate.slice(0, 100));
  await expect(page.getByText(`100 affichées sur ${String(oracle.length)}`, { exact: true })).toBeVisible();

  const triMontant = { champ: "MONTANT", ordre: "ASC" } as const;
  await choisirTri(page, "Montant croissant");
  await page.waitForURL(/tri=montant/);
  await expect(lignesVisibles(page)).toHaveCount(50);
  const attenduMontant = ordreOracle(oracle, triMontant).map((ligne) => ligne.id);
  const montants = await montantsAffiches(page);
  expect(montants).toEqual([...montants].sort((a, b) => a - b));
  expect(await idsAffiches(page)).toEqual(attenduMontant.slice(0, 50));
  await page.getByRole("button", { name: "Charger plus", exact: true }).click();
  await expect(lignesVisibles(page)).toHaveCount(100);
  const centMontant = await idsAffiches(page);
  expect(new Set(centMontant).size).toBe(100);
  expect(centMontant).toEqual(attenduMontant.slice(0, 100));

  await page.getByRole("button", { name: "Retirer le filtre Sous-catégorie : Épicerie", exact: true }).click();
  await expect(page.getByRole("button", { name: "Retirer le filtre Sous-catégorie : Épicerie", exact: true })).toHaveCount(0);
  await attendreNombre(page, (await lignesOracle({ compteNom: "Visa" })).length);

  await page.getByRole("button", { name: "Tout effacer", exact: true }).click();
  await expect(page.getByRole("button", { name: /^Retirer le filtre/ })).toHaveCount(0);
});

test("parent ventilé, virement et ligne étiquetée dans la liste et dans le détail", async ({ page }) => {
  const idParent = await premiereTransaction({ description: "VERSEMENT HYPOTHECAIRE", estVentilee: true });
  await page.goto("/transactions?toutesDates=1&texte=versement%20hypothecaire");
  const ligneParent = ligneVisible(page, idParent);
  await expect(ligneParent).toBeVisible();
  await expect(etatDeLigne(ligneParent, "Ventilée en 3 lignes")).toBeVisible();
  await ligneParent.getByRole("button", { name: "Afficher les 3 lignes de ventilation", exact: true }).click();
  await expect(page.locator("[data-ligne-ventilation-id]").filter({ visible: true })).toHaveCount(3);
  // Aux deux largeurs : chaque fille affiche sa catégorie parente et ses étiquettes (docs/lot-m2.md §6.3).
  const detailParent = await detailLu(idParent);
  for (const fille of detailParent.lignesVentilation) {
    const element = page.locator(`[data-ligne-ventilation-id="${fille.id}"]`).filter({ visible: true });
    const chemin =
      fille.sousCategorieNom === null
        ? "Non catégorisée"
        : fille.categorieNom === null
          ? fille.sousCategorieNom
          : `${fille.categorieNom} › ${fille.sousCategorieNom}`;
    await expect(element).toContainText(chemin);
    for (const etiquette of fille.etiquettes) {
      await expect(element).toContainText(etiquette.nom);
    }
  }
  await examinerEcran(page, "Transactions › ventilée dépliée");

  let panneau = await ouvrirDetail(page, idParent);
  await expect(lireChampDetail(panneau, "ventilation")).toHaveText("3 lignes");
  await expect(panneau.locator("li[data-ligne-ventilation-id]")).toHaveCount(3);
  await verifierTitreNonRepete(panneau, "ventilation", "Ventilation");
  await verifierTousLesChamps(panneau, idParent);
  await examinerEcran(page, "Transactions › détail (ventilée)");
  await panneau.locator("li[data-ligne-ventilation-id]").last().scrollIntoViewIfNeeded();
  await examinerEcran(page, "Transactions › détail (ventilée) — section Ventilation");

  const idVirement = await premiereTransaction({ description: "PAIEMENT VISA DESJARDINS" });
  await page.goto("/transactions?toutesDates=1&texte=paiement%20visa%20desjardins");
  await expect(etatDeLigne(ligneVisible(page, idVirement), "Virement avec Visa")).toBeVisible();
  panneau = await ouvrirDetail(page, idVirement);
  await expect(lireChampDetail(panneau, "virement")).toHaveText(valeursDetail(await detailLu(idVirement)).virement);
  await verifierTitreNonRepete(panneau, "virement", "Virement");
  await panneau.getByRole("heading", { name: "Virement", exact: true }).scrollIntoViewIfNeeded();
  await examinerEcran(page, "Transactions › détail (paire liée) — section Virement");
  await panneau.getByRole("button", { name: "Ouvrir la contrepartie", exact: true }).click();
  await expect(lireChampDetail(panneau, "description")).toHaveText("PAIEMENT RECU - MERCI");
  await expect(lireChampDetail(panneau, "compte")).toHaveText("Visa");
  await examinerEcran(page, "Transactions › détail (virement)");

  const idEtiquetee = await premiereTransaction({ description: "PETRO-CANADA" });
  await page.goto("/transactions?toutesDates=1&texte=petro-canada");
  panneau = await ouvrirDetail(page, idEtiquetee);
  await verifierTousLesChamps(panneau, idEtiquetee);
  await expect(lireChampDetail(panneau, "etiquettes")).toContainText("Auto");
});

test("barre de période : mois, année, tout, navigation, indicateur", async ({ page }, testInfo) => {
  const forme = projetDe(testInfo) === "bureau" ? "LONG" : "COURT";
  const moisCourant = moisDe(dateCivileDansFuseau(new Date(), FUSEAU_APPLICATION));
  const periodeCourante = { type: "MOIS", mois: moisCourant } as const;

  await page.goto("/transactions");
  await expect(page.locator("[data-periode]")).toHaveText(libellePeriode(periodeCourante, forme), { useInnerText: true });

  await page.getByRole("button", { name: "Période précédente", exact: true }).click();
  const precedent = { type: "MOIS", mois: moisPrecedent(moisCourant) } as const;
  await expect(page.locator("[data-periode]")).toHaveText(libellePeriode(precedent, forme), { useInnerText: true });
  await attendreBarreAuRepos(page);
  await expect(page.getByText(`Période : ${libellePeriode(precedent, "LONG")}`, { exact: true })).toBeVisible();

  await page.getByRole("link", { name: "Budgets", exact: true }).click();
  await page.waitForURL(/\/budgets/);
  await expect(page.locator("[data-periode]")).toHaveText(libellePeriode(precedent, forme), { useInnerText: true });
  await page.getByRole("link", { name: "Transactions", exact: true }).click();
  await page.waitForURL(/\/transactions/);
  await expect(page.locator("[data-periode]")).toHaveText(libellePeriode(precedent, forme), { useInnerText: true });
  await page.reload();
  await expect(page.locator("[data-periode]")).toHaveText(libellePeriode(precedent, forme), { useInnerText: true });

  // Une adresse « Toutes les dates » prime sur le cookie pour l'affichage, sur /transactions seulement.
  const groupeType = page.getByRole("group", { name: "Type de période" });
  await page.goto("/transactions?toutesDates=1");
  await expect(page.locator("[data-periode]")).toHaveText(forme === "LONG" ? "Toutes les dates" : "Tout", { useInnerText: true });
  await expect(groupeType.getByRole("button", { name: "Tout", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(groupeType.getByRole("button", { name: "Mois", exact: true })).toHaveAttribute("aria-pressed", "false");
  await examinerEcran(page, "Barre de période › toutes les dates (URL)");
  await choisirTypePeriode(page, "Mois");
  await page.waitForURL((url) => url.pathname === "/transactions" && !url.searchParams.has("toutesDates"));
  await expect(page.locator("[data-periode]")).toHaveText(libellePeriode(precedent, forme), { useInnerText: true });
  await page.goto("/budgets?toutesDates=1");
  await expect(page.locator("[data-periode]")).toHaveText(libellePeriode(precedent, forme), { useInnerText: true });

  await choisirTypePeriode(page, "Année");
  await expect(page.locator("[data-periode]")).toHaveText(precedent.mois.slice(0, 4), { useInnerText: true });
  await choisirTypePeriode(page, "Tout");
  await expect(page.locator("[data-periode]")).toHaveText(forme === "LONG" ? "Toutes les dates" : "Tout", { useInnerText: true });
  await expect(page.getByRole("button", { name: "Période précédente", exact: true })).toHaveCount(0);

  const n = await nbTransactionsARevoir();
  expect(n).toBeGreaterThan(0);
  const indicateur = page.getByRole("link", { name: libelleNombreARevoir(n), exact: true });
  await expect(indicateur).toBeVisible();
  await indicateur.click();
  await page.waitForURL((url) => url.searchParams.get("aRevoir") === "1" && url.searchParams.get("toutesDates") === "1");
  await expect(page.getByRole("button", { name: "Retirer le filtre À revoir", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Retirer le filtre Toutes les dates", exact: true })).toBeVisible();
  await expect(enTete(page)).toHaveText(new RegExp(`^${libelleNombreTransactions(n)} ·`));
  const lignes = lignesVisibles(page);
  const nbAffichees = await lignes.count();
  expect(nbAffichees).toBeGreaterThan(0);
  for (let index = 0; index < nbAffichees; index += 1) {
    await expect(etatDeLigne(lignes.nth(index), "À revoir")).toBeVisible();
  }

  await page.getByRole("link", { name: "Importer un relevé", exact: true }).click();
  await page.waitForURL(/\/transactions\/import/);

  await page.goto("/transactions");
  await examinerEcran(page, "Barre de période › transactions");
  await page.goto("/budgets");
  await examinerEcran(page, "Barre de période › budgets");
  await page.goto("/parametres");
  await examinerEcran(page, "Barre de période › paramètres");
});

test("états vides et paramètres ignorés", async ({ page }) => {
  await page.goto("/transactions?toutesDates=1&texte=zzzz-aucun-resultat-e2e");
  await expect(page.getByText("Aucune transaction ne correspond aux filtres.", { exact: true })).toBeVisible();
  await examinerEcran(page, "Transactions › aucun résultat");
  await page.getByRole("button", { name: "Tout effacer", exact: true }).first().click();
  await page.waitForURL((url) => url.pathname === "/transactions" && url.search === "");
  await expect(page.getByText("Aucune transaction ne correspond aux filtres.", { exact: true })).toHaveCount(0);

  await page.goto("/transactions?montantMin=abc&aRevoir=oui");
  const avis = page.getByRole("status").filter({ hasText: "Paramètres d'adresse ignorés" });
  await expect(avis).toBeVisible();
  await expect(avis).toContainText("Montant minimum : « abc » ignoré.");
  await expect(avis).toContainText("À revoir : « oui » ignoré.");
  await expect(avis).not.toContainText("Montant en cents entier attendu.");
  await examinerEcran(page, "Transactions › paramètres ignorés");
});
