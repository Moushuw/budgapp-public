import { expect, test } from "@playwright/test";
import {
  beneficiairesDesTransactions,
  fermerClientE2e,
  idBeneficiaire,
  idsTransactionsDuBeneficiaire,
} from "./outils/base";
import { examinerEcran } from "./outils/examen";
import { choisirOption, elementReferentiel, ouvrirOnglet, projetDe } from "./outils/interface";

test.afterAll(fermerClientE2e);

const CIBLE = "AMAZON.CA";
const AUCUN_RESULTAT = "Aucun bénéficiaire ne correspond à cette recherche.";

test("fusion de deux bénéficiaires Amazon du seed", async ({ page }, testInfo) => {
  const source = projetDe(testInfo) === "mobile" ? "AMAZON.COM" : "AMZN MKTP CA";

  const idsSource = await idsTransactionsDuBeneficiaire(source);
  expect(idsSource.length).toBeGreaterThan(0);
  const idCible = await idBeneficiaire(CIBLE);
  expect(idCible).not.toBeNull();
  const nbCibleAvant = (await idsTransactionsDuBeneficiaire(CIBLE)).length;

  await ouvrirOnglet(page, "beneficiaires", "IGA VALBRUME");
  const recherche = page.getByRole("searchbox", { name: "Rechercher un bénéficiaire" });
  await recherche.fill(source);
  await elementReferentiel(page, source).getByRole("button", { name: "Fusionner", exact: true }).click();

  const dialogue = page.getByRole("dialog", { name: `Fusionner « ${source} »`, exact: true });
  await expect(dialogue).toBeVisible();
  await choisirOption(
    page,
    dialogue.getByRole("combobox", { name: "Destination de la fusion", exact: true }),
    /^AMAZON\.CA( — proximité \d+ %)?$/,
  );
  await expect(
    dialogue.getByText(`${String(idsSource.length)} transaction(s) de « ${source} » passeront à « ${CIBLE} ».`, {
      exact: true,
    }),
  ).toBeVisible();
  await examinerEcran(page, "Paramètres › Bénéficiaires › Fusionner (destination choisie)");

  await dialogue.getByRole("button", { name: "Fusionner", exact: true }).click();
  await expect(dialogue).toBeHidden();

  await recherche.fill(source);
  await expect(page.getByText(AUCUN_RESULTAT, { exact: true })).toBeVisible();
  await recherche.fill(CIBLE);
  await expect(elementReferentiel(page, CIBLE)).toBeVisible();

  expect(await idBeneficiaire(source)).toBeNull();
  const beneficiaires = await beneficiairesDesTransactions(idsSource);
  expect(beneficiaires).toHaveLength(idsSource.length);
  expect(beneficiaires.every((id) => id === idCible)).toBe(true);
  expect((await idsTransactionsDuBeneficiaire(CIBLE)).length).toBe(nbCibleAvant + idsSource.length);
});
