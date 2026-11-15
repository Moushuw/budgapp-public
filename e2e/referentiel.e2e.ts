import { expect, test, type Locator, type Page } from "@playwright/test";
import { dateCivileDansFuseau, FUSEAU_APPLICATION } from "@/domain/dates";
import { formatMontant } from "@/domain/money";
import { LIBELLES_TYPE_COMPTE, TYPES_COMPTE, type TypeCompte } from "@/domain/referentiel";
import { libelleEnteteSolde } from "@/domain/solde";
import { examinerEcran } from "./outils/examen";
import { etiquetteExisteDansE2e, etiquetteExisteDansPublic, fermerClientE2e, idCompteParNom } from "./outils/base";
import { soldeCalculeOracle } from "./outils/soldes";
import {
  choisirOption,
  elementReferentiel,
  nomUnique,
  ouvrirOnglet,
  projetDe,
  type OngletParametres,
} from "./outils/interface";

test.afterAll(fermerClientE2e);

interface Patron {
  readonly onglet: OngletParametres;
  readonly ecran: string;
  readonly temoin: string;
  readonly boutonCreation: string;
  readonly titreCreation: string;
  readonly titreModification: string;
  readonly champ: string;
  readonly recherche?: { readonly nom: string; readonly aucunResultat: string };
}

type Remplir = (page: Page) => Promise<void>;

async function afficher(page: Page, patron: Patron, nom: string): Promise<Locator> {
  if (patron.recherche !== undefined) {
    await page.getByRole("searchbox", { name: patron.recherche.nom }).fill(nom);
  }
  return elementReferentiel(page, nom);
}

async function creerElement(
  page: Page,
  patron: Patron,
  nom: string,
  contexte: string,
  remplirAutres?: Remplir,
): Promise<void> {
  await page.getByRole("button", { name: patron.boutonCreation, exact: true }).click();
  const dialogue = page.getByRole("dialog", { name: patron.titreCreation, exact: true });
  await expect(dialogue).toBeVisible();
  await dialogue.getByLabel(patron.champ, { exact: true }).fill(nom);
  if (remplirAutres !== undefined) {
    await remplirAutres(page);
  }
  await examinerEcran(page, `${patron.ecran} › ${contexte}`);
  await dialogue.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await expect(dialogue).toBeHidden();
  await expect(await afficher(page, patron, nom)).toBeVisible();
}

async function modifierElement(
  page: Page,
  patron: Patron,
  titreDialogue: string,
  ancienNom: string,
  nouveauNom: string,
  contexte: string,
): Promise<void> {
  const element = await afficher(page, patron, ancienNom);
  await element.getByRole("button", { name: "Modifier", exact: true }).click();
  const dialogue = page.getByRole("dialog", { name: titreDialogue, exact: true });
  await expect(dialogue).toBeVisible();
  const champ = dialogue.getByLabel(patron.champ, { exact: true });
  await expect(champ).toHaveValue(ancienNom);
  await champ.fill(nouveauNom);
  await examinerEcran(page, `${patron.ecran} › ${contexte}`);
  await dialogue.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await expect(dialogue).toBeHidden();
  await expect(await afficher(page, patron, nouveauNom)).toBeVisible();
  await expect(elementReferentiel(page, ancienNom)).toHaveCount(0);
}

async function supprimerElement(page: Page, patron: Patron, nom: string, contexte: string): Promise<void> {
  const element = await afficher(page, patron, nom);
  await element.getByRole("button", { name: "Supprimer", exact: true }).click();
  const confirmation = page.getByRole("alertdialog");
  await expect(confirmation).toBeVisible();
  await expect(confirmation).toContainText(nom);
  await examinerEcran(page, `${patron.ecran} › ${contexte}`);
  await confirmation.getByRole("button", { name: "Supprimer", exact: true }).click();
  await expect(confirmation).toBeHidden();
  await expect(elementReferentiel(page, nom)).toHaveCount(0);
}

async function parcours(
  page: Page,
  patron: Patron,
  nom: string,
  remplirAutres?: Remplir,
): Promise<void> {
  await ouvrirOnglet(page, patron.onglet, patron.temoin);
  await creerElement(page, patron, nom, "Nouveau", remplirAutres);
  const modifie = `${nom} modifié`;
  await modifierElement(page, patron, patron.titreModification, nom, modifie, "Modifier");
  await supprimerElement(page, patron, modifie, "Supprimer");
}

const COMPTES: Patron = {
  onglet: "comptes",
  ecran: "Paramètres › Comptes",
  temoin: "Chèque",
  boutonCreation: "Nouveau compte",
  titreCreation: "Nouveau compte",
  titreModification: "Modifier le compte",
  champ: "Nom",
};

const CATEGORIES: Patron = {
  onglet: "categories",
  ecran: "Paramètres › Catégories",
  temoin: "Alimentation",
  boutonCreation: "Nouvelle catégorie",
  titreCreation: "Nouvelle catégorie",
  titreModification: "Modifier la catégorie",
  champ: "Nom",
};

const BENEFICIAIRES: Patron = {
  onglet: "beneficiaires",
  ecran: "Paramètres › Bénéficiaires",
  temoin: "IGA VALBRUME",
  boutonCreation: "Nouveau bénéficiaire",
  titreCreation: "Nouveau bénéficiaire",
  titreModification: "Modifier le bénéficiaire",
  champ: "Nom",
  recherche: { nom: "Rechercher un bénéficiaire", aucunResultat: "Aucun bénéficiaire ne correspond à cette recherche." },
};

const ETIQUETTES: Patron = {
  onglet: "etiquettes",
  ecran: "Paramètres › Étiquettes",
  temoin: "Auto",
  boutonCreation: "Nouvelle étiquette",
  titreCreation: "Nouvelle étiquette",
  titreModification: "Modifier l'étiquette",
  champ: "Nom",
};

const FILTRES: Patron = {
  onglet: "filtres",
  ecran: "Paramètres › Filtres",
  temoin: "SOLDE PRECEDENT",
  boutonCreation: "Nouveau filtre",
  titreCreation: "Nouveau filtre",
  titreModification: "Modifier le filtre",
  champ: "Motif",
};

const REGLES: Patron = {
  onglet: "regles",
  ecran: "Paramètres › Règles",
  temoin: "Épicerie IGA",
  boutonCreation: "Nouvelle règle",
  titreCreation: "Nouvelle règle",
  titreModification: "Modifier la règle",
  champ: "Libellé",
  recherche: { nom: "Rechercher une règle", aucunResultat: "Aucune règle ne correspond à cette recherche." },
};

async function verifierFormeConditionnelle(page: Page, type: TypeCompte): Promise<void> {
  const dialogue = page.getByRole("dialog", { name: "Nouveau compte", exact: true });
  const credit = type === "CREDIT" || type === "MARGE";
  const placement = type === "PLACEMENT";
  const lie = type === "PRET" || type === "PASSIF" || type === "ACTIF";
  await expect(dialogue.getByLabel("Limite de crédit", { exact: true })).toHaveCount(credit ? 1 : 0);
  await expect(dialogue.getByRole("combobox", { name: "Régime fiscal", exact: true })).toHaveCount(placement ? 1 : 0);
  await expect(dialogue.getByRole("combobox", { name: "Compte lié", exact: true })).toHaveCount(lie ? 1 : 0);
}

test("comptes : chaque type se crée, se modifie et se supprime", async ({ page }, testInfo) => {
  test.setTimeout(240_000);
  const base = nomUnique("E2E compte", testInfo);
  await ouvrirOnglet(page, COMPTES.onglet, COMPTES.temoin);

  for (const type of TYPES_COMPTE) {
    const nom = `${base} ${type}`;
    await creerElement(page, COMPTES, nom, `Nouveau compte (${LIBELLES_TYPE_COMPTE[type]})`, async (p) => {
      const dialogue = p.getByRole("dialog", { name: "Nouveau compte", exact: true });
      await choisirOption(p, dialogue.getByRole("combobox", { name: "Type de compte", exact: true }), LIBELLES_TYPE_COMPTE[type]);
      await dialogue.getByLabel("Solde initial", { exact: true }).fill("0,00");
      await dialogue.getByLabel("Date du solde initial", { exact: true }).fill("2026-01-01");
      await verifierFormeConditionnelle(p, type);
    });
    await expect(elementReferentiel(page, nom)).toContainText(LIBELLES_TYPE_COMPTE[type]);

    const modifie = `${nom} modifié`;
    await modifierElement(page, COMPTES, COMPTES.titreModification, nom, modifie, `Modifier le compte (${LIBELLES_TYPE_COMPTE[type]})`);
    await supprimerElement(page, COMPTES, modifie, `Supprimer le compte (${LIBELLES_TYPE_COMPTE[type]})`);
  }
});

test("catégories et sous-catégories", async ({ page }, testInfo) => {
  const categorie = nomUnique("E2E cat", testInfo);
  const sousCategorie = nomUnique("E2E sous", testInfo);
  await ouvrirOnglet(page, CATEGORIES.onglet, CATEGORIES.temoin);
  await creerElement(page, CATEGORIES, categorie, "Nouvelle catégorie");

  await elementReferentiel(page, categorie).getByRole("button", { name: "Ajouter une sous-catégorie", exact: true }).click();
  const dialogueSous = page.getByRole("dialog", { name: "Nouvelle sous-catégorie", exact: true });
  await expect(dialogueSous).toBeVisible();
  await dialogueSous.getByLabel("Nom", { exact: true }).fill(sousCategorie);
  await examinerEcran(page, "Paramètres › Catégories › Nouvelle sous-catégorie");
  await dialogueSous.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await expect(dialogueSous).toBeHidden();
  await expect(elementReferentiel(page, sousCategorie)).toBeVisible();

  const sousModifiee = `${sousCategorie} modifiée`;
  await elementReferentiel(page, sousCategorie).getByRole("button", { name: "Modifier", exact: true }).click();
  const dialogueModifSous = page.getByRole("dialog", { name: "Modifier la sous-catégorie", exact: true });
  await expect(dialogueModifSous).toBeVisible();
  const champSous = dialogueModifSous.getByLabel("Nom", { exact: true });
  await expect(champSous).toHaveValue(sousCategorie);
  await champSous.fill(sousModifiee);
  await examinerEcran(page, "Paramètres › Catégories › Modifier la sous-catégorie");
  await dialogueModifSous.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await expect(dialogueModifSous).toBeHidden();
  await expect(elementReferentiel(page, sousModifiee)).toBeVisible();
  await expect(elementReferentiel(page, sousCategorie)).toHaveCount(0);

  const categorieModifiee = `${categorie} modifiée`;
  await modifierElement(page, CATEGORIES, CATEGORIES.titreModification, categorie, categorieModifiee, "Modifier la catégorie");

  await supprimerElement(page, CATEGORIES, sousModifiee, "Supprimer la sous-catégorie");
  await supprimerElement(page, CATEGORIES, categorieModifiee, "Supprimer la catégorie");
});

test("bénéficiaires", async ({ page }, testInfo) => {
  const nom = nomUnique("E2E bénéf", testInfo);
  await parcours(page, BENEFICIAIRES, nom);
  await expect(page.getByText("Aucun bénéficiaire ne correspond à cette recherche.", { exact: true })).toBeVisible();
});

test("étiquettes", async ({ page }, testInfo) => {
  const nom = nomUnique("E2E étiq", testInfo);
  await ouvrirOnglet(page, ETIQUETTES.onglet, ETIQUETTES.temoin);
  await creerElement(page, ETIQUETTES, nom, "Nouvelle");
  expect(await etiquetteExisteDansE2e(nom)).toBe(true);
  expect(await etiquetteExisteDansPublic(nom)).toBe(false);
  const modifie = `${nom} modifiée`;
  await modifierElement(page, ETIQUETTES, ETIQUETTES.titreModification, nom, modifie, "Modifier");
  await supprimerElement(page, ETIQUETTES, modifie, "Supprimer");
});

test("filtres d'import", async ({ page }, testInfo) => {
  const motif = nomUnique("E2E-MOTIF", testInfo).toUpperCase();
  await parcours(page, FILTRES, motif, async (p) => {
    const dialogue = p.getByRole("dialog", { name: FILTRES.titreCreation, exact: true });
    await choisirOption(p, dialogue.getByRole("combobox", { name: "Mode de correspondance", exact: true }), "Contient");
  });
});

test("règles", async ({ page }, testInfo) => {
  const libelle = nomUnique("E2E règle", testInfo);
  const suffixe = libelle.split(" ").slice(-1).join("").toUpperCase();
  if (projetDe(testInfo) === "bureau") {
    await ouvrirOnglet(page, REGLES.onglet, REGLES.temoin);
    await expect(page.getByRole("columnheader", { name: "Actions", exact: true })).toHaveCount(1);
    await expect(page.getByRole("columnheader", { name: "Effets", exact: true })).toHaveCount(1);
  }
  await parcours(page, REGLES, libelle, async (p) => {
    const dialogue = p.getByRole("dialog", { name: REGLES.titreCreation, exact: true });
    await dialogue.getByLabel("Priorité", { exact: true }).fill("1");
    await dialogue.getByLabel("Valeur", { exact: true }).fill(`E2E-REGLE-${suffixe}`);
    await choisirOption(p, dialogue.getByRole("combobox", { name: "Sous-catégorie", exact: true }), "Café");
  });
});

test("comptes : colonne Solde et accès aux soldes", async ({ page }) => {
  test.setTimeout(120_000);
  const aujourdhui = dateCivileDansFuseau(new Date(), FUSEAU_APPLICATION);
  await ouvrirOnglet(page, "comptes", "Chèque");
  await expect(page.getByRole("columnheader", { name: libelleEnteteSolde(aujourdhui), exact: true })).toHaveCount(1);

  for (const nom of ["Chèque", "Épargne", "Visa", "Marge", "CELIAPP", "REER", "Maison", "Hypothèque"]) {
    const attendu = formatMontant(await soldeCalculeOracle(await idCompteParNom(nom), aujourdhui), "CENTS");
    await expect(elementReferentiel(page, nom).locator("[data-solde-compte]"), nom).toHaveText(attendu);
  }
  await examinerEcran(page, "Paramètres › Comptes › colonne Solde");

  await elementReferentiel(page, "Chèque").getByRole("link", { name: "Soldes et réconciliation", exact: true }).click();
  const id = await idCompteParNom("Chèque");
  await expect(page).toHaveURL((url) => url.pathname === `/parametres/comptes/${id}`);
  await expect(page.getByRole("heading", { name: "Soldes et réconciliation", exact: true, level: 1 })).toBeVisible();
});
