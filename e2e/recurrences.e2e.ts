import { expect, test, type Page } from "@playwright/test";
import { dateCivileDansFuseau, FUSEAU_APPLICATION } from "@/domain/dates";
import { normaliserDescription } from "@/domain/ingestion";
import { formatMontant } from "@/domain/money";
import {
  libelleCandidatAttendu,
  jourEtMois,
  libellePaiementAttendu,
  messageSuppressionLieeDetail,
  phraseLiaison,
  phraseSuggestion,
} from "@/domain/recurrence";
import { LIBELLES_TYPE_LIAISON } from "@/domain/referentiel";
import { accorder } from "@/features/import/libelles-revue";
import {
  AVERTISSEMENT_MODIFICATION,
  consequenceSuppressionSerie,
  libelleCreation,
  libelleMontantSerie,
  libelleTerminaison,
} from "@/features/recurrences/libelles";
import { libelleNombreTransactions, valeursDetail } from "@/features/transactions/presentation";
import { formatMontantChamp } from "@/lib/champs-formulaire";
import { clientE2e, detailLu, fermerClientE2e, premiereTransaction } from "./outils/base";
import { verifierToastNeCouvrePas } from "./outils/dialogues";
import { examinerEcran } from "./outils/examen";
import { lireOracleFixture, lireTexteFixture } from "./outils/fixtures";
import { verifierAucunRecouvrement, verifierBordsHautsEgaux } from "./outils/formulaires";
import { analyserReleve, choisirOption, enteteSection, racineDe } from "./outils/interface";
import { verifierEnTetesAlignes, verifierEnTetesSectionsContenus } from "./outils/revue-import";
import {
  attendreEcranRecurrences,
  blocRapprochement,
  carteSuggestion,
  dateMaxTransactions,
  ligneNonVu,
  ligneReleveVisa,
  ligneSerie,
  mesurerColonnes,
  mesurerPolices,
  nbSeriesTerminees,
  occurrenceParEcheance,
  occurrencesDeRegle,
  ouvrirActionSerie,
  panneauEcheances,
  piedEcheances,
  policeDesMontants,
  regleParLibelle,
  repartirEcheances,
  sectionEcheances,
  sectionRecurrences,
  tableauSeriesActives,
  tableauSeriesTerminees,
  transactionAvecEcheancesCandidates,
  transactionsNetflix,
  verifierListeChoixLiaison,
} from "./outils/recurrences";
import { attendreToast, lignesVisibles, lireChampDetail, ouvrirDetail, panneauFiltres } from "./outils/transactions";

test.describe.configure({ mode: "serial" });
test.afterAll(fermerClientE2e);

const aujourdhui = dateCivileDansFuseau(new Date(), FUSEAU_APPLICATION);

function urlFiltree(texte: string): string {
  return `/transactions?toutesDates=1&texte=${encodeURIComponent(texte)}`;
}

async function allerAuxRecurrences(page: Page): Promise<void> {
  await page.goto("/transactions/recurrences");
  await attendreEcranRecurrences(page);
}

test("Netflix détecté, confirmé, lié rétroactivement ; la consultation montre la liaison", async ({ page }) => {
  test.setTimeout(180_000);
  const max = await dateMaxTransactions();
  expect(
    max !== null && max < "2099-01-01",
    "Une transaction datée de 2099 rendrait Netflix « morte » pour la détection (docs/lot-m3.md §3.2).",
  ).toBe(true);

  // Le lien de l'onglet secondaire mène à l'écran.
  await page.goto("/transactions");
  const onglets = page.getByRole("navigation", { name: "Sections des transactions", exact: true });
  const lien = onglets.getByRole("link", { name: "Récurrences", exact: true });
  await lien.click();
  await expect(page).toHaveURL((url) => url.pathname === "/transactions/recurrences");
  await expect(lien).toHaveAttribute("aria-current", "page");
  await attendreEcranRecurrences(page);

  // Calculés avant la recherche : le toast « Recherche terminée » doit encore être affiché quand le dialogue s'ouvre.
  const netflix = await transactionsNetflix();
  expect(netflix).toHaveLength(19);
  const phrase = phraseSuggestion({
    libelle: "Netflix.com",
    montantMedianCents: -1799,
    nature: "FIXE",
    cadence: "MENSUEL",
    nbOccurrences: 19,
    dates: netflix.map((t) => t.date),
  });

  await page.getByRole("button", { name: "Rechercher des récurrences", exact: true }).click();
  await expect(page.getByText(/^Recherche terminée : /).first()).toBeVisible();

  const carte = carteSuggestion(page, phrase);
  await expect(carte).toBeVisible();
  await expect(carte).toContainText("Netflix");
  await expect(carte).toContainText("17,99 $");
  await expect(carte).toContainText("tous les mois vers le 12");
  await examinerEcran(page, "Récurrences › suggestions");

  await carte.getByRole("button", { name: "Confirmer", exact: true }).click();
  const dialogue = page.getByRole("dialog", { name: "Confirmer la récurrence", exact: true });
  await expect(dialogue).toBeVisible();
  // Le dialogue et le toast de recherche coexistent : le toast ne couvre ni le titre ni la croix.
  const contexteToast = "Récurrences › confirmer Netflix (toast affiché)";
  await verifierToastNeCouvrePas(page, contexteToast);
  await examinerEcran(page, contexteToast);
  await expect(dialogue.getByLabel("Libellé", { exact: true })).toHaveValue("Netflix.com");
  await expect(dialogue.getByLabel("Montant", { exact: true })).toHaveValue(formatMontantChamp(-1799));
  await expect(dialogue.getByRole("combobox", { name: "Cadence", exact: true })).toHaveText("Tous les mois");
  await expect(dialogue.getByLabel("Date d'ancrage", { exact: true })).toHaveValue("2025-03-12");
  await expect(dialogue.getByRole("combobox", { name: "Sous-catégorie", exact: true })).toContainText("Streaming");
  await expect(dialogue.getByLabel("Motif de rapprochement", { exact: true })).toHaveValue("NETFLIX.COM");
  await expect(dialogue.getByLabel("Tolérance de montant", { exact: true })).toHaveValue(formatMontantChamp(500));
  await expect(dialogue.getByLabel("Tolérance de jours", { exact: true })).toHaveValue("3");
  await expect(dialogue.locator("[data-barre-action]")).toHaveCount(1);
  await verifierBordsHautsEgaux(
    dialogue.getByRole("combobox", { name: "Nature", exact: true }),
    dialogue.getByLabel("Montant", { exact: true }),
    "Récurrences › confirmer Netflix (Nature et Montant)",
  );
  await examinerEcran(page, "Récurrences › confirmer Netflix");

  await dialogue.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await attendreToast(page, "Récurrence Netflix.com créée : 19 paiements liés.");
  await expect(dialogue).toBeHidden();

  const regle = await regleParLibelle("Netflix.com");
  expect(regle).not.toBeNull();
  if (regle === null) return;
  const liees = await clientE2e().expectedOccurrence.findMany({
    where: { transactionId: { in: netflix.map((t) => t.id) } },
    select: { transactionId: true, liaison: true, ruleId: true },
    take: 100,
  });
  expect(liees).toHaveLength(19);
  expect(new Set(liees.map((o) => o.transactionId)).size).toBe(19);
  expect(liees.every((o) => o.liaison === "RETROACTIVE" && o.ruleId === regle.id)).toBe(true);

  // La série, et sa prochaine échéance ouverte.
  const occurrences = await occurrencesDeRegle(regle.id);
  const prochaine =
    occurrences.find(
      (o) => o.transactionId === null && (o.etat === "PREVUE" || o.etat === "MANQUEE") && o.echeance >= aujourdhui,
    )?.echeance ?? "—";
  const serie = ligneSerie(page, "Netflix.com");
  await expect(serie).toBeVisible();
  await expect(serie.locator('[data-colonne="liees"]')).toHaveText("19");
  await expect(serie.locator('[data-colonne="prochaine"]')).toHaveText(prochaine);
  await examinerEcran(page, "Récurrences › séries");

  // Les échéances de la série.
  await ouvrirActionSerie(page, "Netflix.com", "Voir les échéances");
  const panneau = panneauEcheances(page, "Netflix.com");
  await expect(panneau).toBeVisible();
  // À venir (3, les plus proches d'abord), puis Passées (25, les plus récentes d'abord) : l'historique des paiements
  // liés se voit à l'ouverture, sans défiler.
  const { aVenir, passees } = repartirEcheances(occurrences, aujourdhui);
  const sectionAVenir = sectionEcheances(panneau, "a-venir");
  const sectionPassees = sectionEcheances(panneau, "passees");
  await expect(sectionAVenir.getByRole("heading", { level: 3, name: `À venir (${String(aVenir.length)})`, exact: true })).toBeVisible();
  const titrePassees = sectionPassees.getByRole("heading", { level: 3, name: `Passées (${String(passees.length)})`, exact: true });
  await expect(titrePassees).toBeVisible();

  const elementsAVenir = sectionAVenir.locator("li[data-occurrence-id]");
  const attenduAVenir = aVenir.slice(0, 3);
  await expect(elementsAVenir).toHaveCount(attenduAVenir.length);
  expect(attenduAVenir.length, "Le seed doit porter au moins 3 échéances à venir pour Netflix").toBe(3);
  expect(await elementsAVenir.evaluateAll((noeuds) => noeuds.map((n) => n.getAttribute("data-occurrence-id")))).toEqual(
    attenduAVenir.map((o) => o.id),
  );
  const elementsPassees = sectionPassees.locator("li[data-occurrence-id]");
  const attenduesPassees = passees.slice(0, 25);
  await expect(elementsPassees).toHaveCount(attenduesPassees.length);
  await expect(elementsPassees.first()).toHaveAttribute("data-occurrence-id", passees[0]?.id ?? "");
  await expect(piedEcheances(panneau, "a-venir")).toHaveText(
    `${accorder(attenduAVenir.length, "échéance affichée", "échéances affichées")} sur ${String(aVenir.length)}`,
  );
  await expect(piedEcheances(panneau, "passees")).toHaveText(
    `${accorder(attenduesPassees.length, "échéance affichée", "échéances affichées")} sur ${String(passees.length)}`,
  );

  const echeanceLiee = await occurrenceParEcheance("Netflix.com", "2026-09-12");
  const elementLie = panneau.locator(`li[data-occurrence-id="${echeanceLiee.id}"]`);
  await expect(titrePassees).toBeInViewport();
  await expect(elementLie).toBeInViewport();
  await examinerEcran(page, "Récurrences › échéances de la série");
  await expect(elementLie.locator("[data-provenance]")).toHaveText(
    `2026-09-12 · ${formatMontant(-1799, "CENTS")} · ${LIBELLES_TYPE_LIAISON.RETROACTIVE}`,
  );
  await examinerEcran(page, "Récurrences › provenance d'une échéance liée");
  await panneau.getByRole("button", { name: "Fermer", exact: true }).click();
  await expect(panneau).toBeHidden();

  // La consultation : la dernière transaction Netflix dit à quoi elle est liée.
  await page.goto(urlFiltree("netflix"));
  const idRecente = await premiereTransaction({ description: "NETFLIX.COM" });
  const detailRecente = await ouvrirDetail(page, idRecente);
  const attendue = phraseLiaison({
    libelle: "Netflix.com",
    echeance: "2026-09-12",
    liaison: "RETROACTIVE",
    lieeLe: aujourdhui,
  });
  await expect(lireChampDetail(detailRecente, "recurrence")).toHaveText(attendue);
  await expect(lireChampDetail(detailRecente, "recurrence")).toHaveText(valeursDetail(await detailLu(idRecente)).recurrence);
  // La phrase de liaison, longue, a toute la largeur sous son étiquette (pas écrasée à côté).
  const etiquetteLiaison = await detailRecente.locator('[data-champ="recurrence"] dt').boundingBox();
  const valeurLiaison = await lireChampDetail(detailRecente, "recurrence").boundingBox();
  const sectionLiaison = await detailRecente
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "Récurrence", exact: true, level: 3 }) })
    .boundingBox();
  expect(etiquetteLiaison).not.toBeNull();
  expect(valeurLiaison).not.toBeNull();
  expect(sectionLiaison).not.toBeNull();
  expect(Math.abs((valeurLiaison?.x ?? 0) - (etiquetteLiaison?.x ?? 1000))).toBeLessThanOrEqual(1);
  expect(valeurLiaison?.width ?? 0).toBeGreaterThanOrEqual((sectionLiaison?.width ?? 0) * 0.9);
  await expect(detailRecente.getByRole("button", { name: "Supprimer", exact: true })).toBeDisabled();
  const messageDetail = messageSuppressionLieeDetail("Netflix.com", "2026-09-12");
  await expect(detailRecente.locator('[data-raison="suppression"]')).toHaveText(messageDetail);
  expect(messageDetail).toContain("ci-dessous");
  await detailRecente.getByRole("heading", { name: "Récurrence", exact: true }).scrollIntoViewIfNeeded();
  await expect(detailRecente.getByRole("heading", { name: "Récurrence", exact: true })).toBeInViewport();
  await examinerEcran(page, "Transactions › détail (récurrence liée à la confirmation)");

  // Le filtre de consultation.
  await page.goto(`${urlFiltree("netflix")}&recurrences=seulement`);
  await expect(lignesVisibles(page)).toHaveCount(19);
  expect(((await page.locator("[data-totaux]").first().textContent()) ?? "").trim().startsWith(libelleNombreTransactions(19))).toBe(
    true,
  );
  await page.getByRole("button", { name: "Filtres", exact: true }).click();
  await expect(panneauFiltres(page)).toBeVisible();
  const champ = panneauFiltres(page).getByRole("combobox", { name: "Liées à une récurrence", exact: true });
  await champ.scrollIntoViewIfNeeded();
  await expect(champ).toHaveText("Seulement");
  await expect(champ).toBeInViewport();
  await examinerEcran(page, "Transactions › filtres (liées à une récurrence)");
  await panneauFiltres(page).getByRole("button", { name: "Annuler", exact: true }).click();
  await expect(panneauFiltres(page)).toBeHidden();
  await page.goto(`${urlFiltree("netflix")}&recurrences=exclure`);
  await expect(page.locator("[data-totaux]").first()).toBeVisible();
  await expect(lignesVisibles(page)).toHaveCount(0);
});

test("Rapprochement à l'import : un prélèvement Netflix conforme est rapproché, un montant différent attend un choix", async ({
  page,
}, testInfo) => {
  test.setTimeout(180_000);
  const racine = racineDe(testInfo);
  const oracle = lireOracleFixture(racine, "netflix-visa-conforme");
  const boutonEnregistrer = page.getByRole("button", { name: "Enregistrer", exact: true });
  const dialogue = page.getByRole("dialog", { name: "Confirmer l'enregistrement", exact: true });
  const texteLiee = "1 ligne sera liée à une échéance récurrente.";

  expect((await occurrenceParEcheance("Netflix.com", "2026-10-12")).transactionId).toBeNull();
  expect((await occurrenceParEcheance("Netflix.com", "2026-11-12")).transactionId).toBeNull();

  // Un relevé conforme : rapprochement automatique.
  await analyserReleve(page, "Visa", oracle.annee, lireTexteFixture(racine, "netflix-visa-conforme"));
  await expect(enteteSection(page, "À importer (1)")).toBeVisible();
  await expect(page.locator("[data-virement-propose]")).toHaveCount(0);

  const auto = blocRapprochement(page, "auto");
  await expect(auto).toHaveCount(1);
  const libelleAttendu = libellePaiementAttendu("Netflix.com", "2026-10-12");
  await expect(auto.locator("[data-paiement-attendu]")).toHaveText(libelleAttendu);
  await expect(auto.getByRole("button", { name: "Défaire", exact: true })).toBeVisible();
  await expect(page.getByText(texteLiee, { exact: true }).first()).toBeVisible();

  const contexteAuto = "Revue de l'import › rapprochement automatique";
  await examinerEcran(page, contexteAuto);
  await verifierEnTetesSectionsContenus(page, contexteAuto);
  await verifierEnTetesAlignes(page, contexteAuto);
  await verifierAucunRecouvrement(page.locator("[data-tableau-revue]").filter({ visible: true }).first(), contexteAuto);

  await boutonEnregistrer.click();
  await expect(dialogue).toBeVisible();
  await expect(dialogue).toContainText("1 ligne à importer.");
  await expect(dialogue).toContainText(texteLiee);
  await examinerEcran(page, "Revue de l'import › confirmer l'enregistrement (rapprochement)");
  await dialogue.getByRole("button", { name: "Confirmer", exact: true }).click();

  await expect(page.getByRole("heading", { name: "Import enregistré" })).toBeVisible();
  await expect(page.getByText("1 paiement lié à son échéance.", { exact: true })).toBeVisible();

  const netflix = (await transactionsNetflix()).find((t) => t.date === "2026-10-12");
  expect(netflix?.montantCents).toBe(-1799);
  if (netflix === undefined) return;
  expect(await occurrenceParEcheance("Netflix.com", "2026-10-12")).toMatchObject({
    transactionId: netflix.id,
    liaison: "AUTO",
    etat: "REALISEE",
  });

  await page.goto(urlFiltree("netflix"));
  const detail = await ouvrirDetail(page, netflix.id);
  const phraseAuto = phraseLiaison({ libelle: "Netflix.com", echeance: "2026-10-12", liaison: "AUTO", lieeLe: aujourdhui });
  await expect(lireChampDetail(detail, "recurrence")).toHaveText(phraseAuto);
  // Le détail et la revue disent l'échéance avec les mêmes mots.
  expect(phraseAuto.startsWith(`${libelleAttendu} — `)).toBe(true);
  await detail.getByRole("heading", { name: "Récurrence", exact: true }).scrollIntoViewIfNeeded();
  await examinerEcran(page, "Transactions › détail (rapprochement à l'import)");

  // Un montant différent : aucune liaison sans un choix.
  await analyserReleve(page, "Visa", oracle.annee, lireTexteFixture(racine, "netflix-visa-ecart"));
  await expect(enteteSection(page, "À importer (1)")).toBeVisible();
  await expect(blocRapprochement(page, "auto")).toHaveCount(0);
  const aConfirmer = blocRapprochement(page, "a-confirmer");
  await expect(aConfirmer).toHaveCount(1);
  const novembre = await occurrenceParEcheance("Netflix.com", "2026-11-12");
  const candidat = aConfirmer.locator(`[data-candidat-occurrence="${novembre.id}"]`);
  await expect(candidat).toContainText(`montant de ${formatMontant(2499)} au lieu de ${formatMontant(1799)} attendu`);
  // Valeurs absolues : un seul signe dit quelque chose (l'écart), et « attendu » n'est pas répété dans le libellé.
  await expect(candidat.locator("label")).toHaveText(libelleCandidatAttendu("Netflix.com", "2026-11-12", -1799));
  await expect(candidat.locator("label")).not.toContainText("attendu");
  const montants = aConfirmer.locator("[data-montant]");
  const police = await policeDesMontants(page);
  const polices = await mesurerPolices(montants);
  expect(polices.length, "Au moins le montant du libellé et les deux de la ligne « ce qui cloche »").toBeGreaterThanOrEqual(3);
  for (const mesure of polices) {
    expect(mesure.chiffres).toContain("tabular-nums");
    expect(mesure.famille).toBe(police.famille);
  }
  await expect(aConfirmer.getByRole("radio", { name: "Ne pas lier", exact: true })).toBeChecked();
  await expect(page.getByText("sera liée à une échéance récurrente")).toHaveCount(0);

  const contexteConfirmer = "Revue de l'import › rapprochement à confirmer";
  await examinerEcran(page, contexteConfirmer);
  await verifierEnTetesSectionsContenus(page, contexteConfirmer);
  await verifierEnTetesAlignes(page, contexteConfirmer);
  await verifierAucunRecouvrement(page.locator("[data-tableau-revue]").filter({ visible: true }).first(), contexteConfirmer);

  await boutonEnregistrer.click();
  await expect(dialogue).toBeVisible();
  await dialogue.getByRole("button", { name: "Confirmer", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Import enregistré" })).toBeVisible();
  await expect(page.getByText("1 transaction importée.", { exact: true })).toBeVisible();

  const importee = (await transactionsNetflix()).find((t) => t.date === "2026-11-12");
  expect(importee?.montantCents).toBe(-2499);
  if (importee === undefined) return;
  expect((await occurrenceParEcheance("Netflix.com", "2026-11-12")).transactionId).toBeNull();
  expect(await clientE2e().expectedOccurrence.count({ where: { transactionId: importee.id } })).toBe(0);
});

test("Rapprochement à l'import : Défaire, les autres motifs de « ce qui cloche », la catégorie de la récurrence", async ({
  page,
}) => {
  test.setTimeout(240_000);
  // Rien ne s'enregistre ici : trois analyses, aucune écriture.
  const decembre = await occurrenceParEcheance("Netflix.com", "2026-12-12");
  expect(decembre.transactionId).toBeNull();
  const libelleCandidat = libelleCandidatAttendu("Netflix.com", "2026-12-12", -1799);
  const boutonEnregistrer = page.getByRole("button", { name: "Enregistrer", exact: true });
  const dialogue = page.getByRole("dialog", { name: "Confirmer l'enregistrement", exact: true });
  const texteLiee = "1 ligne sera liée à une échéance récurrente.";
  const categorieRecurrence = page.locator("[data-categorie-recurrence]").filter({ visible: true });

  // T-1 : après « Défaire », la ligne attend un choix.
  await analyserReleve(page, "Visa", 2026, ligneReleveVisa(12, "Décembre", "NETFLIX.COM", -1799));
  await expect(enteteSection(page, "À importer (1)")).toBeVisible();
  await expect(blocRapprochement(page, "auto")).toHaveCount(1);
  await blocRapprochement(page, "auto").getByRole("button", { name: "Défaire", exact: true }).click();
  await expect(blocRapprochement(page, "auto")).toHaveCount(0);
  const aConfirmer = blocRapprochement(page, "a-confirmer");
  await expect(aConfirmer).toHaveCount(1);
  const candidat = aConfirmer.locator(`[data-candidat-occurrence="${decembre.id}"]`);
  await expect(candidat).toContainText("Concorde sur la description, le montant et la date.");
  await expect(aConfirmer.getByRole("radio", { name: "Ne pas lier", exact: true })).toBeChecked();
  await expect(page.getByText("sera liée à une échéance récurrente")).toHaveCount(0);
  await expect(categorieRecurrence).toHaveCount(0);
  await examinerEcran(page, "Revue de l'import › rapprochement après Défaire");
  await boutonEnregistrer.click();
  await expect(dialogue).toBeVisible();
  await expect(dialogue).toContainText("1 ligne à importer.");
  await expect(dialogue).not.toContainText(texteLiee);
  await page.keyboard.press("Escape");
  await expect(dialogue).toBeHidden();
  // Le choix rend le bloc automatique : le radio disparaît aussitôt, `check()` ne pourrait plus le vérifier.
  await aConfirmer.getByRole("radio", { name: libelleCandidat, exact: true }).click();
  await expect(blocRapprochement(page, "auto")).toHaveCount(1);
  await expect(page.getByText(texteLiee, { exact: true }).first()).toBeVisible();

  // T-4, motif de date.
  await analyserReleve(page, "Visa", 2026, ligneReleveVisa(20, "Décembre", "NETFLIX.COM", -1799));
  await expect(enteteSection(page, "À importer (1)")).toBeVisible();
  await expect(blocRapprochement(page, "a-confirmer")).toHaveCount(1);
  await expect(blocRapprochement(page, "auto")).toHaveCount(0);
  const candidatDate = blocRapprochement(page, "a-confirmer").locator(`[data-candidat-occurrence="${decembre.id}"]`);
  await expect(candidatDate.locator("[data-cloche]")).toHaveCount(1);
  await expect(candidatDate.locator("[data-cloche]")).toHaveText(
    `le ${jourEtMois("2026-12-20")}, échéance attendue le ${jourEtMois("2026-12-12")} à ± 3 jours`,
  );
  await expect(blocRapprochement(page, "a-confirmer").getByRole("radio", { name: "Ne pas lier", exact: true })).toBeChecked();
  await blocRapprochement(page, "a-confirmer").getByRole("radio", { name: libelleCandidat, exact: true }).check();
  await expect(blocRapprochement(page, "a-confirmer")).toHaveCount(1);
  await expect(categorieRecurrence).toHaveCount(0);
  await examinerEcran(page, "Revue de l'import › rapprochement, motif de date");

  // T-4, motif de description, et T-3 : la catégorie héritée de la récurrence.
  await analyserReleve(page, "Visa", 2026, ligneReleveVisa(12, "Décembre", "NTFLX", -1799));
  await expect(enteteSection(page, "À importer (1)")).toBeVisible();
  const blocDescription = blocRapprochement(page, "a-confirmer");
  await expect(blocDescription).toHaveCount(1);
  const candidatDescription = blocDescription.locator(`[data-candidat-occurrence="${decembre.id}"]`);
  await expect(candidatDescription.locator("[data-cloche]")).toHaveCount(1);
  await expect(candidatDescription.locator("[data-cloche]")).toHaveText(
    `description « ${normaliserDescription("NTFLX")} » sans « NETFLIX.COM »`,
  );
  await expect(categorieRecurrence).toHaveCount(0);
  await examinerEcran(page, "Revue de l'import › rapprochement, motif de description");
  await blocDescription.getByRole("radio", { name: libelleCandidat, exact: true }).check();
  await expect(categorieRecurrence).toHaveCount(1);
  await expect(categorieRecurrence).toHaveText("Sous-catégorie « Streaming » : catégorie de la récurrence.");
  await examinerEcran(page, "Revue de l'import › rapprochement, catégorie de la récurrence");
  await blocRapprochement(page, "a-confirmer").getByRole("radio", { name: "Ne pas lier", exact: true }).check();
  await expect(categorieRecurrence).toHaveCount(0);

  expect((await occurrenceParEcheance("Netflix.com", "2026-12-12")).transactionId).toBeNull();
});

test("Gestes à la main : ignorer et rétablir, délier et relier", async ({ page }) => {
  test.setTimeout(180_000);
  const assurance = await occurrenceParEcheance("Assurance auto", "2026-06-20");

  await allerAuxRecurrences(page);
  await expect(ligneNonVu(page, assurance.id)).toBeVisible();
  await examinerEcran(page, "Récurrences › paiements attendus non vus");

  await ligneNonVu(page, assurance.id).getByRole("button", { name: "Ignorer", exact: true }).click();
  await attendreToast(page, "Échéance ignorée.");
  await expect(ligneNonVu(page, assurance.id)).toHaveCount(0);
  expect((await occurrenceParEcheance("Assurance auto", "2026-06-20")).etat).toBe("IGNOREE");

  await ouvrirActionSerie(page, "Assurance auto", "Voir les échéances");
  const panneau = panneauEcheances(page, "Assurance auto");
  await expect(panneau).toBeVisible();
  const element = panneau.locator(`li[data-occurrence-id="${assurance.id}"]`);
  await expect(element).toHaveAttribute("data-etat", "IGNOREE");
  await expect(element).toContainText("Ignorée");
  await element.getByRole("button", { name: "Rétablir", exact: true }).click();
  await attendreToast(page, "Échéance rétablie.");
  await expect.poll(async () => (await occurrenceParEcheance("Assurance auto", "2026-06-20")).etat).toBe("PREVUE");
  await panneau.getByRole("button", { name: "Fermer", exact: true }).click();
  await expect(panneau).toBeHidden();
  await expect(ligneNonVu(page, assurance.id)).toBeVisible();

  // Délier depuis le détail de la transaction.
  const netflix = (await transactionsNetflix()).find((t) => t.date === "2026-08-12");
  expect(netflix).toBeDefined();
  if (netflix === undefined) return;
  await page.goto(urlFiltree("netflix"));
  const detail = await ouvrirDetail(page, netflix.id);
  await detail.getByRole("button", { name: "Délier de l'échéance", exact: true }).click();
  await attendreToast(page, "Paiement délié de son échéance.");
  await expect(lireChampDetail(detail, "recurrence")).toHaveText("Aucune récurrence");
  await expect(detail.getByRole("button", { name: "Lier à une échéance", exact: true })).toBeVisible();
  await expect(detail.getByRole("button", { name: "Créer une récurrence", exact: true })).toBeVisible();
  const deliee = await occurrenceParEcheance("Netflix.com", "2026-08-12");
  expect(deliee.etat).toBe("PREVUE");
  expect(deliee.transactionId).toBeNull();

  // La relier depuis l'écran des récurrences.
  await allerAuxRecurrences(page);
  const ligne = ligneNonVu(page, deliee.id);
  await expect(ligne).toBeVisible();
  await expect(ligne).toContainText("Netflix.com");
  await expect(ligne).toContainText("2026-08-12");
  await ligne.getByRole("button", { name: "Lier à une transaction", exact: true }).click();
  const dialogue = page.getByRole("dialog", { name: "Lier à une transaction", exact: true });
  await expect(dialogue).toBeVisible();
  const radio = dialogue
    .locator("label")
    .filter({ hasText: "NETFLIX.COM" })
    .filter({ hasText: "2026-08-12" })
    .getByRole("radio");
  await expect(radio).toHaveCount(1);
  await radio.check();

  // La liste est lisible : colonnes alignées, montants en police des montants, ordre dit.
  await verifierListeChoixLiaison(page, dialogue, "description", 2);
  await examinerEcran(page, "Récurrences › lier à une transaction");
  await dialogue.getByRole("button", { name: "Lier", exact: true }).click();
  await attendreToast(page, "Paiement lié à son échéance.");
  await expect(dialogue).toBeHidden();
  const reliee = await occurrenceParEcheance("Netflix.com", "2026-08-12");
  expect(reliee).toMatchObject({ liaison: "MANUELLE", etat: "REALISEE", transactionId: netflix.id });

  // Le détail le dit.
  await page.goto(urlFiltree("netflix"));
  const detailRelie = await ouvrirDetail(page, netflix.id);
  await expect(lireChampDetail(detailRelie, "recurrence")).toHaveText(
    phraseLiaison({ libelle: "Netflix.com", echeance: "2026-08-12", liaison: "MANUELLE", lieeLe: aujourdhui }),
  );
  await expect(detailRelie.getByRole("button", { name: "Supprimer", exact: true })).toBeDisabled();
  await expect(detailRelie.locator('[data-raison="suppression"]')).toHaveText(
    messageSuppressionLieeDetail("Netflix.com", "2026-08-12"),
  );
  await examinerEcran(page, "Transactions › détail (récurrence liée à la main)");
});

test("Chaque dialogue de récurrence passe les contrôles", async ({ page }) => {
  test.setTimeout(240_000);
  const regle = await regleParLibelle("Netflix.com");
  expect(regle).not.toBeNull();
  if (regle === null) return;
  const nbReglesAvant = await clientE2e().recurringRule.count();
  const occurrencesAvant = await occurrencesDeRegle(regle.id);

  await allerAuxRecurrences(page);

  // Nouvelle récurrence : rien ne se soumet vide, et chaque champ le dit.
  await page.getByRole("button", { name: "Nouvelle récurrence", exact: true }).click();
  const nouvelle = page.getByRole("dialog", { name: "Nouvelle récurrence", exact: true });
  await expect(nouvelle).toBeVisible();
  await nouvelle.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await expect(nouvelle.getByText("Le libellé est obligatoire.", { exact: true })).toBeVisible();
  await expect(nouvelle.getByText("Choisis un compte.", { exact: true })).toBeVisible();
  await expect(nouvelle.getByText("Ce montant est obligatoire.", { exact: true })).toBeVisible();
  await expect(nouvelle.getByText("Le motif de rapprochement est obligatoire.", { exact: true })).toBeVisible();
  await verifierBordsHautsEgaux(
    nouvelle.getByRole("combobox", { name: "Nature", exact: true }),
    nouvelle.getByLabel("Montant", { exact: true }),
    "Récurrences › nouvelle récurrence (Nature et Montant)",
  );
  await expect(nouvelle).toBeVisible();
  await expect(nouvelle.locator("[data-barre-action]")).toHaveCount(1);
  await examinerEcran(page, "Récurrences › nouvelle récurrence");
  await nouvelle.getByRole("button", { name: "Annuler", exact: true }).click();
  await expect(nouvelle).toBeHidden();

  // Modifier la série.
  await ouvrirActionSerie(page, "Netflix.com", "Modifier");
  const modifier = page.getByRole("dialog", { name: "Modifier la récurrence", exact: true });
  await expect(modifier).toBeVisible();
  await expect(modifier.getByText(AVERTISSEMENT_MODIFICATION, { exact: true })).toBeVisible();
  await expect(modifier.locator("[data-barre-action]")).toHaveCount(1);
  await examinerEcran(page, "Récurrences › modifier la série");
  await modifier.getByRole("button", { name: "Annuler", exact: true }).click();
  await expect(modifier).toBeHidden();

  // Terminer la série.
  await ouvrirActionSerie(page, "Netflix.com", "Terminer");
  const terminer = page.getByRole("dialog", { name: "Terminer la série", exact: true });
  await expect(terminer).toBeVisible();
  await expect(terminer.getByLabel("Date de fin", { exact: true })).toHaveValue(aujourdhui);
  await examinerEcran(page, "Récurrences › terminer la série");
  await terminer.getByRole("button", { name: "Annuler", exact: true }).click();
  await expect(terminer).toBeHidden();

  // Supprimer la série : la conséquence est chiffrée.
  await ouvrirActionSerie(page, "Netflix.com", "Supprimer");
  const supprimer = page.getByRole("alertdialog", { name: "Supprimer la récurrence", exact: true });
  await expect(supprimer).toBeVisible();
  const nbLiees = occurrencesAvant.filter((o) => o.transactionId !== null).length;
  await expect(supprimer).toContainText(consequenceSuppressionSerie(nbLiees));
  await examinerEcran(page, "Récurrences › supprimer la série");
  await supprimer.getByRole("button", { name: "Annuler", exact: true }).click();
  await expect(supprimer).toBeHidden();

  // Modifier le montant d'une échéance ouverte, depuis le panneau des échéances.
  await ouvrirActionSerie(page, "Netflix.com", "Voir les échéances");
  const panneau = panneauEcheances(page, "Netflix.com");
  await expect(panneau).toBeVisible();
  const ouverte = panneau.locator('li[data-occurrence-id][data-etat="PREVUE"]').first();
  await ouverte.getByRole("button", { name: "Modifier le montant", exact: true }).click();
  const montant = page.getByRole("dialog", { name: "Modifier le montant de l'échéance", exact: true });
  await expect(montant).toBeVisible();
  await expect(montant.locator("[data-barre-action]")).toHaveCount(1);
  await examinerEcran(page, "Récurrences › modifier le montant d'une échéance");
  await montant.getByRole("button", { name: "Annuler", exact: true }).click();
  await expect(montant).toBeHidden();
  await panneau.getByRole("button", { name: "Fermer", exact: true }).click();
  await expect(panneau).toBeHidden();

  // Depuis le détail d'une transaction : lier à une échéance, créer une récurrence.
  const idPetro = await premiereTransaction({ description: "PETRO-CANADA" });
  const petro = await detailLu(idPetro);
  await page.goto(urlFiltree("petro-canada"));
  const detail = await ouvrirDetail(page, idPetro);
  await detail.getByRole("button", { name: "Lier à une échéance", exact: true }).click();
  const lier = page.getByRole("dialog", { name: "Lier à une échéance", exact: true });
  await expect(lier).toBeVisible();
  await examinerEcran(page, "Transactions › lier à une échéance (récurrence)");
  await lier.getByRole("button", { name: "Annuler", exact: true }).click();
  await expect(lier).toBeHidden();

  await detail.getByRole("button", { name: "Créer une récurrence", exact: true }).click();
  const creer = page.getByRole("dialog", { name: "Créer une récurrence", exact: true });
  await expect(creer).toBeVisible();
  await expect(creer.getByLabel("Motif de rapprochement", { exact: true })).toHaveValue(normaliserDescription(petro.description));
  await expect(creer.getByLabel("Compte", { exact: true })).toBeDisabled();
  await expect(creer.getByLabel("Compte", { exact: true })).toHaveValue(petro.compteNom);
  await expect(creer.getByLabel("Montant", { exact: true })).toHaveValue(formatMontantChamp(petro.montantCents));
  await expect(creer.locator("[data-barre-action]")).toHaveCount(1);
  await examinerEcran(page, "Transactions › créer une récurrence depuis une transaction");
  await creer.getByRole("button", { name: "Annuler", exact: true }).click();
  await expect(creer).toBeHidden();

  // Rien n'a été enregistré.
  expect(await clientE2e().recurringRule.count()).toBe(nbReglesAvant);
  expect(await occurrencesDeRegle(regle.id)).toEqual(occurrencesAvant);
});

test("Lier à une échéance : la liste des échéances candidates est lisible", async ({ page }) => {
  test.setTimeout(180_000);
  // Le seed ne laisse aucune transaction du Chèque non liée près d'une échéance ouverte : la série jetable, créée
  // par l'interface sur la Visa, donne deux candidates (Netflix du 12 novembre et elle) à la transaction Netflix
  // importée du 12 novembre par le parcours précédent ; elle est supprimée à la fin.
  const LIBELLE = "Série échéance E2E";
  await allerAuxRecurrences(page);
  await page.getByRole("button", { name: "Nouvelle récurrence", exact: true }).click();
  const nouvelle = page.getByRole("dialog", { name: "Nouvelle récurrence", exact: true });
  await expect(nouvelle).toBeVisible();
  await nouvelle.getByLabel("Libellé", { exact: true }).fill(LIBELLE);
  await choisirOption(page, nouvelle.getByRole("combobox", { name: "Compte", exact: true }), "Visa");
  await nouvelle.getByLabel("Montant", { exact: true }).fill("-25,00");
  await nouvelle.getByLabel("Date d'ancrage", { exact: true }).fill("2026-11-20");
  await nouvelle.getByLabel("Motif de rapprochement", { exact: true }).fill("E2E ECHEANCE");
  await nouvelle.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await attendreToast(page, libelleCreation({ libelle: LIBELLE, toleranceJours: 3, transaction: null }).titre);
  await expect(nouvelle).toBeHidden();

  const cible = await transactionAvecEcheancesCandidates("Visa", 2);

  await page.goto(`/transactions?du=${cible.date}&au=${cible.date}&compte=${cible.accountId}`);
  const detail = await ouvrirDetail(page, cible.id);
  await detail.getByRole("button", { name: "Lier à une échéance", exact: true }).click();
  const dialogue = page.getByRole("dialog", { name: "Lier à une échéance", exact: true });
  await expect(dialogue).toBeVisible();

  await expect(dialogue.locator("fieldset label")).toHaveCount(cible.candidates.length);
  const colonnes: readonly (readonly [string, readonly string[]])[] = [
    ["serie", cible.candidates.map((c) => c.libelle)],
    ["echeance", cible.candidates.map((c) => c.echeance)],
    ["montant", cible.candidates.map((c) => formatMontant(c.montantCents, "CENTS"))],
    ["ecart", cible.candidates.map((c) => accorder(c.ecartJours, "jour", "jours"))],
  ];
  for (const [colonne, attendues] of colonnes) {
    const lues = await dialogue
      .locator(`[data-colonne="${colonne}"]`)
      .evaluateAll((noeuds) => noeuds.map((n) => n.textContent.trim()));
    expect(lues, `colonne ${colonne}`).toEqual(attendues);
  }

  await verifierListeChoixLiaison(page, dialogue, "serie", 2);
  await examinerEcran(page, "Transactions › lier à une échéance (récurrence, liste remplie)");

  await dialogue.getByRole("button", { name: "Annuler", exact: true }).click();
  await expect(dialogue).toBeHidden();
  expect(await clientE2e().expectedOccurrence.count({ where: { transactionId: cible.id } })).toBe(0);

  // Nettoyage par l'interface : la série jetable disparaît avec ses échéances.
  await allerAuxRecurrences(page);
  await ouvrirActionSerie(page, LIBELLE, "Supprimer");
  const supprimer = page.getByRole("alertdialog", { name: "Supprimer la récurrence", exact: true });
  await expect(supprimer).toBeVisible();
  await supprimer.getByRole("button", { name: "Supprimer", exact: true }).click();
  await expect(supprimer).toBeHidden();
  await expect(ligneSerie(page, LIBELLE)).toHaveCount(0);
});

test("Une série variable affiche ≈, puis rejoint les séries terminées repliées", async ({ page }) => {
  test.setTimeout(180_000);
  const LIBELLE = "Série variable E2E";
  const MOTIF = "E2E SERIE VARIABLE";

  await allerAuxRecurrences(page);
  await page.getByRole("button", { name: "Nouvelle récurrence", exact: true }).click();
  const nouvelle = page.getByRole("dialog", { name: "Nouvelle récurrence", exact: true });
  await expect(nouvelle).toBeVisible();
  await nouvelle.getByLabel("Libellé", { exact: true }).fill(LIBELLE);
  await choisirOption(page, nouvelle.getByRole("combobox", { name: "Compte", exact: true }), "Épargne");
  await choisirOption(page, nouvelle.getByRole("combobox", { name: "Nature", exact: true }), "Variable");
  await nouvelle.getByLabel("Montant", { exact: true }).fill("-50,00");
  await nouvelle.getByLabel("Motif de rapprochement", { exact: true }).fill(MOTIF);
  await nouvelle.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await attendreToast(page, libelleCreation({ libelle: LIBELLE, toleranceJours: 3, transaction: null }).titre);
  await expect(nouvelle).toBeHidden();

  const serie = ligneSerie(page, LIBELLE);
  await expect(serie).toBeVisible();
  const attenduMontant = libelleMontantSerie({ nature: "VARIABLE", montantCents: -5000 });
  await expect(serie.locator('[data-colonne="montant"]')).toHaveText(attenduMontant);
  await expect(serie.locator('[data-colonne="montant"]')).toContainText("≈");
  await expect(serie.locator('[data-colonne="prochaine"]')).toHaveText(aujourdhui);
  await examinerEcran(page, "Récurrences › série variable");

  const regle = await regleParLibelle(LIBELLE);
  expect(regle).not.toBeNull();
  if (regle === null) return;
  const n = (await occurrencesDeRegle(regle.id)).filter((o) => o.echeance > aujourdhui).length;

  await ouvrirActionSerie(page, LIBELLE, "Terminer");
  const terminer = page.getByRole("dialog", { name: "Terminer la série", exact: true });
  await expect(terminer).toBeVisible();
  await terminer.getByLabel("Date de fin", { exact: true }).fill(aujourdhui);
  await terminer.getByRole("button", { name: "Terminer", exact: true }).click();
  await attendreToast(page, libelleTerminaison(n, 0));
  expect((await regleParLibelle(LIBELLE))?.dateFin).toBe(aujourdhui);

  const terminees = sectionRecurrences(page, "series").locator('details[data-section="series-terminees"]');
  await expect(terminees).toBeVisible();
  await expect(terminees).toHaveJSProperty("open", false);
  await expect(terminees.locator("summary")).toHaveText(`Séries terminées (${String(await nbSeriesTerminees())})`);
  await expect(ligneSerie(page, LIBELLE)).toBeHidden();
  await examinerEcran(page, "Récurrences › séries terminées repliées");

  await terminees.locator("summary").click();
  await expect(terminees).toHaveJSProperty("open", true);
  await expect(ligneSerie(page, LIBELLE)).toBeVisible();
  await expect(ligneSerie(page, LIBELLE).locator('[data-colonne="montant"]')).toHaveText(attenduMontant);
  // Une série terminée n'a plus de prochaine échéance : « — ».
  await expect(ligneSerie(page, LIBELLE).locator('[data-colonne="prochaine"]')).toHaveText("—");

  // Les deux tableaux partagent la même grille.
  const colonnesActives = await mesurerColonnes(tableauSeriesActives(page));
  const colonnesTerminees = await mesurerColonnes(tableauSeriesTerminees(page));
  expect(Object.keys(colonnesActives).length).toBe(8);
  expect(Object.keys(colonnesTerminees)).toEqual(Object.keys(colonnesActives));
  for (const [cle, active] of Object.entries(colonnesActives)) {
    const terminee = colonnesTerminees[cle];
    expect(terminee, `colonne ${cle}`).toBeDefined();
    expect(Math.abs((terminee?.left ?? 0) - active.left), `bord gauche de « ${cle} »`).toBeLessThanOrEqual(1);
    expect(Math.abs((terminee?.width ?? 0) - active.width), `largeur de « ${cle} »`).toBeLessThanOrEqual(1);
  }
  await examinerEcran(page, "Récurrences › séries terminées dépliées");
});
