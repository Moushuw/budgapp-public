// Teste la fusion état-avant/état-après de l'application rétroactive
// (etatApres, categorieProtegee, construireModification, evaluerLigne dans
// src/server/actions/rules.ts) — logique fragile signalée par le codeur
// (journal d'INDEX.md des 2026-09-18 et 2026-09-19),
// non couverte par src/domain/ car elle vit hors du domaine (elle fusionne
// le résultat du moteur avec l'état déjà en base, alors que le domaine rend
// un créneau vide quand aucune règle ne le pose).
//
// Ce test lit ET ÉCRIT dans la base de test (schéma `test`, seedée à chaque
// lancement de Vitest), comme prisma/*.test.ts. Toutes les données créées ici sont
// nettoyées dans afterAll. Les transactions de test portent une date en 2096
// pour ne jamais entrer dans les invariants de budget de
// prisma/coherence.test.ts et prisma/seed.test.ts (le seed ne couvre jamais
// cette année, et aucune date de relevé ne lui est postérieure) ; aucun autre
// fichier de test n'écrit en 2096.

import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { depuisDateUtc } from "@/domain/dates";
import { normaliserDescription, normaliserNom } from "@/domain/ingestion";
import { serialiserPartsVentilation } from "@/domain/ventilation";
import { empreinteLigneFille } from "@/domain/ventilation/empreinte";
import { exigerInvariants } from "../../../prisma/test/invariants";
import { apercuApplicationRetroactive, appliquerRegleRetroactivement } from "./rules";
import { EXTRAIT_APERCU } from "./rules-constantes";

const prisma = new PrismaClient();

const DATE_TEST = new Date(Date.UTC(2096, 0, 15));
// Antérieure à DATE_TEST : balayerTransactions trie par date desc, donc une
// transaction sur cette date est balayée après toutes celles sur DATE_TEST.
const DATE_TEST_ANTERIEURE = new Date(Date.UTC(2096, 0, 1));

// Fenêtre des aperçus : elle contient les données de ce fichier. Elle est en
// 2096 parce que les autres fichiers écrivent en 2099 et suppriment leurs
// comptes en parallèle : un balayage qui lirait leurs lignes pourrait voir le
// compte disparaître avant le chargement de la relation `account`
// (« Inconsistent query result »). Le balayage filtre sur le propriétaire, pas
// sur le compte : seule une année où ce fichier est seul à écrire l'isole.
const FENETRE_DU = "2096-01-01";
const FENETRE_AU = "2096-01-31";

let ownerId: string;
let accountId: string;
let subA: string;
let subB: string;
let tagId: string;

const idsTransactionACreer: string[] = [];
const idsRuleACreer: string[] = [];

beforeAll(async () => {
  const owner = await prisma.user.findFirstOrThrow({ orderBy: { createdAt: "asc" } });
  ownerId = owner.id;

  // Par son nom du seed : l'ordre physique n'est pas garanti et d'autres fichiers créent des comptes jetables.
  const compte = await prisma.account.findFirstOrThrow({ where: { ownerId, nom: "Chèque" } });
  accountId = compte.id;

  const sousCategories = await prisma.subcategory.findMany({
    where: { category: { ownerId }, masquee: false, systeme: false },
    take: 2,
    orderBy: { id: "asc" },
  });
  expect(sousCategories.length).toBeGreaterThanOrEqual(2); // la base doit être seedée avant ce test
  const [premiere, deuxieme] = sousCategories;
  if (premiere === undefined || deuxieme === undefined) {
    throw new Error("La base doit contenir au moins deux sous-catégories pour ce test.");
  }
  subA = premiere.id;
  subB = deuxieme.id;

  const tag = await prisma.tag.create({
    data: { ownerId, nom: `TEST_FUSION_${randomUUID().slice(0, 8)}` },
  });
  tagId = tag.id;
});

afterAll(async () => {
  await prisma.transactionTag.deleteMany({ where: { transactionId: { in: idsTransactionACreer } } });
  await prisma.transaction.deleteMany({ where: { id: { in: idsTransactionACreer } } });
  await prisma.ruleCondition.deleteMany({ where: { ruleId: { in: idsRuleACreer } } });
  await prisma.ruleAction.deleteMany({ where: { ruleId: { in: idsRuleACreer } } });
  await prisma.rule.deleteMany({ where: { id: { in: idsRuleACreer } } });
  if (tagId) {
    await prisma.tag.delete({ where: { id: tagId } });
  }
  await prisma.$disconnect();
});

function motifUnique(prefixe: string): string {
  return `${prefixe}${randomUUID().replace(/-/g, "").slice(0, 10)}`.toUpperCase();
}

async function creerTransactionTest(overrides: {
  description: string;
  subcategoryId?: string | null;
  appliedRuleId?: string | null;
  payeeId?: string | null;
  exclureDuBudget?: boolean;
  aRevoir?: boolean;
  details?: string | null;
  date?: Date;
}): Promise<string> {
  const transaction = await prisma.transaction.create({
    data: {
      ownerId,
      accountId,
      date: overrides.date ?? DATE_TEST,
      description: overrides.description,
      descriptionNormalisee: normaliserDescription(overrides.description),
      montantCents: -1000,
      subcategoryId: overrides.subcategoryId ?? null,
      appliedRuleId: overrides.appliedRuleId ?? null,
      payeeId: overrides.payeeId ?? null,
      exclureDuBudget: overrides.exclureDuBudget ?? false,
      aRevoir: overrides.aRevoir ?? false,
      details: overrides.details ?? null,
      source: "MANUELLE",
      empreinte: `test-fusion-${randomUUID()}`,
    },
  });
  idsTransactionACreer.push(transaction.id);
  return transaction.id;
}

async function creerRegle(
  libelle: string,
  motif: string,
  actions: { type: "ETIQUETER" | "CATEGORISER" | "RENOMMER_BENEFICIAIRE"; valeur?: string; subcategoryId?: string }[],
): Promise<string> {
  const regle = await prisma.rule.create({
    data: {
      ownerId,
      libelle: `${libelle} ${randomUUID().slice(0, 8)}`,
      priorite: 1,
      actif: true,
      conditions: {
        create: [{ champ: "DESCRIPTION_NORMALISEE", operateur: "CONTIENT", valeur: motif }],
      },
      actions: {
        create: actions.map((action, ordre) => ({
          type: action.type,
          subcategoryId: action.subcategoryId ?? null,
          valeur: action.valeur ?? null,
          ordre,
        })),
      },
    },
  });
  idsRuleACreer.push(regle.id);
  return regle.id;
}

/** Le chemin de l'écran : aperçu, puis confirmation avec les deux listes d'identifiants renvoyées telles quelles. */
async function apercuPuisApplication(ruleId: string, entreDeux?: () => Promise<void>) {
  const apercu = await apercuApplicationRetroactive({ ruleId, du: FENETRE_DU, au: FENETRE_AU });
  expect(apercu.ok).toBe(true);
  if (!apercu.ok) {
    throw new Error("aperçu en échec");
  }
  if (entreDeux !== undefined) {
    await entreDeux();
  }
  const recap = await appliquerRegleRetroactivement({
    ruleId,
    transactionIds: [...apercu.data.idsAEcrire],
    idsSansEcriture: [...apercu.data.idsSansEcriture],
  });
  expect(recap.ok).toBe(true);
  if (!recap.ok) {
    throw new Error("application en échec");
  }
  return { apercu: apercu.data, recap: recap.data };
}

describe("appliquerRegleRetroactivement — fusion état-avant/état-après", () => {
  it("une catégorie posée à la main (appliedRuleId nul) n'est pas écrasée par une règle qui ne fait qu'étiqueter", async () => {
    const motif = motifUnique("MOTIFMANUEL");
    const transactionId = await creerTransactionTest({ description: motif, subcategoryId: subA, appliedRuleId: null });
    const ruleId = await creerRegle("Étiqueter seul", motif, [{ type: "ETIQUETER", valeur: tagId }]);

    const resultat = await appliquerRegleRetroactivement({ ruleId, transactionIds: [transactionId], idsSansEcriture: [] });
    expect(resultat.ok).toBe(true);
    if (!resultat.ok) return;

    // Aucune action CATEGORISER n'est portée par cette règle : le verrou ne
    // bloque rien, donc rien à « préserver » au sens du compteur — la
    // sous-catégorie survit simplement parce qu'etatApres ne l'écrase que si
    // la règle en pose une (voir le test dédié à categorieProtegee ci-dessous).
    expect(resultat.data.categoriesPreservees).toBe(0);
    expect(resultat.data.modifiees).toBe(1); // le tag change bien quelque chose

    const apres = await prisma.transaction.findUniqueOrThrow({
      where: { id: transactionId },
      include: { etiquettes: true },
    });
    expect(apres.subcategoryId).toBe(subA); // jamais écrasé
    expect(apres.appliedRuleId).toBeNull(); // une étiquette seule ne pose jamais appliedRuleId
    expect(apres.etiquettes.map((e) => e.tagId)).toContain(tagId);
  });

  it("une transaction non catégorisée reçoit la sous-catégorie de la règle et appliedRuleId = son id", async () => {
    const motif = motifUnique("MOTIFAUTO");
    const transactionId = await creerTransactionTest({ description: motif, subcategoryId: null });
    const ruleId = await creerRegle("Catégoriser", motif, [{ type: "CATEGORISER", subcategoryId: subB }]);

    const resultat = await appliquerRegleRetroactivement({ ruleId, transactionIds: [transactionId], idsSansEcriture: [] });
    expect(resultat.ok).toBe(true);
    if (!resultat.ok) return;

    expect(resultat.data.categoriesPreservees).toBe(0);
    expect(resultat.data.modifiees).toBe(1);

    const apres = await prisma.transaction.findUniqueOrThrow({ where: { id: transactionId } });
    expect(apres.subcategoryId).toBe(subB);
    expect(apres.appliedRuleId).toBe(ruleId);
  });

  it("une transaction déjà catégorisée PAR une règle (appliedRuleId non nul) n'est pas protégée : une autre règle la recatégorise", async () => {
    const motif = motifUnique("MOTIFPARREGLE");
    const ancienneRegleId = await creerRegle("Ancienne règle", motif, [{ type: "CATEGORISER", subcategoryId: subA }]);
    const transactionId = await creerTransactionTest({ description: motif, subcategoryId: subA, appliedRuleId: ancienneRegleId });
    const nouvelleRegleId = await creerRegle("Nouvelle règle", motif, [{ type: "CATEGORISER", subcategoryId: subB }]);

    const resultat = await appliquerRegleRetroactivement({ ruleId: nouvelleRegleId, transactionIds: [transactionId], idsSansEcriture: [] });
    expect(resultat.ok).toBe(true);
    if (!resultat.ok) return;

    expect(resultat.data.categoriesPreservees).toBe(0); // pas une catégorisation manuelle

    const apres = await prisma.transaction.findUniqueOrThrow({ where: { id: transactionId } });
    expect(apres.subcategoryId).toBe(subB);
    expect(apres.appliedRuleId).toBe(nouvelleRegleId);
  });

  it("un drapeau déjà vrai (exclureDuBudget) n'est jamais redescendu à faux par une règle qui ne le pose pas", async () => {
    const motif = motifUnique("MOTIFDRAPEAU");
    const transactionId = await creerTransactionTest({ description: motif, exclureDuBudget: true });
    const ruleId = await creerRegle("Étiqueter seul", motif, [{ type: "ETIQUETER", valeur: tagId }]);

    const resultat = await appliquerRegleRetroactivement({ ruleId, transactionIds: [transactionId], idsSansEcriture: [] });
    expect(resultat.ok).toBe(true);

    const apres = await prisma.transaction.findUniqueOrThrow({ where: { id: transactionId } });
    expect(apres.exclureDuBudget).toBe(true);
  });

  it("RENOMMER_BENEFICIAIRE vers un nom introuvable ne crée aucun Payee, et compte la ligne dans beneficiairesIntrouvables", async () => {
    const motif = motifUnique("MOTIFBENEF");
    const nomIntrouvable = `Bénéficiaire Fantôme ${randomUUID().slice(0, 8)}`;
    const transactionId = await creerTransactionTest({ description: motif, payeeId: null });
    const ruleId = await creerRegle("Renommer bénéficiaire", motif, [
      { type: "RENOMMER_BENEFICIAIRE", valeur: nomIntrouvable },
    ]);

    const avantCompte = await prisma.payee.count({
      where: { ownerId, nomNormalise: normaliserNom(nomIntrouvable) },
    });
    expect(avantCompte).toBe(0);

    const resultat = await appliquerRegleRetroactivement({ ruleId, transactionIds: [transactionId], idsSansEcriture: [] });
    expect(resultat.ok).toBe(true);
    if (!resultat.ok) return;

    expect(resultat.data.beneficiairesIntrouvables).toBe(1);

    const apres = await prisma.transaction.findUniqueOrThrow({ where: { id: transactionId } });
    expect(apres.payeeId).toBeNull(); // le créneau bénéficiaire n'est pas écrit

    const apresCompte = await prisma.payee.count({
      where: { ownerId, nomNormalise: normaliserNom(nomIntrouvable) },
    });
    expect(apresCompte).toBe(0); // aucun Payee créé en effet de bord
  });

  it("réappliquer une règle sur une ligne déjà à jour compte une transaction inchangée, pas modifiée, et n'écrit rien", async () => {
    const motif = motifUnique("MOTIFIDEMPOTENT");
    const ruleId = await creerRegle("Catégoriser", motif, [{ type: "CATEGORISER", subcategoryId: subB }]);
    const transactionId = await creerTransactionTest({ description: motif, subcategoryId: subB, appliedRuleId: ruleId });

    const resultat = await appliquerRegleRetroactivement({ ruleId, transactionIds: [transactionId], idsSansEcriture: [] });
    expect(resultat.ok).toBe(true);
    if (!resultat.ok) return;

    expect(resultat.data.modifiees).toBe(0);
    expect(resultat.data.inchangees).toBe(1);
  });

  it("des étiquettes déjà posées sur la transaction ne sont pas redemandées à l'écriture (pas de doublon, pas de faux \"modifiée\")", async () => {
    const motif = motifUnique("MOTIFTAGDEJA");
    const transactionId = await creerTransactionTest({ description: motif });
    await prisma.transactionTag.create({ data: { transactionId, tagId } });
    const ruleId = await creerRegle("Étiqueter seul", motif, [{ type: "ETIQUETER", valeur: tagId }]);

    const resultat = await appliquerRegleRetroactivement({ ruleId, transactionIds: [transactionId], idsSansEcriture: [] });
    expect(resultat.ok).toBe(true);
    if (!resultat.ok) return;

    expect(resultat.data.modifiees).toBe(0);
    expect(resultat.data.inchangees).toBe(1);

    const apres = await prisma.transaction.findUniqueOrThrow({
      where: { id: transactionId },
      include: { etiquettes: true },
    });
    expect(apres.etiquettes.map((e) => e.tagId)).toEqual([tagId]); // toujours une seule fois
  });
});

describe("application rétroactive — par le chemin de l'écran (aperçu puis confirmation)", () => {
  it("C1 — une catégorie manuelle est préservée sans écriture, et comptée à l'aperçu comme au bilan", async () => {
    const motif = motifUnique("MOTIFC1");
    const t1 = await creerTransactionTest({ description: `${motif} un`, subcategoryId: subA, appliedRuleId: null });
    const t2 = await creerTransactionTest({ description: `${motif} deux`, subcategoryId: null });
    const ruleId = await creerRegle("Catégoriser (C1)", motif, [{ type: "CATEGORISER", subcategoryId: subB }]);

    const { apercu, recap } = await apercuPuisApplication(ruleId);

    expect(apercu.idsAEcrire).toEqual([t2]);
    expect(apercu.idsSansEcriture).toEqual([t1]);
    expect(apercu.categoriesPreservees).toBe(1);
    expect(recap.modifiees).toBe(1);
    expect(recap.inchangees).toBe(1);
    expect(recap.categoriesPreservees).toBe(1);
    expect(recap.ignorees).toBe(0);
    expect(recap.beneficiairesIntrouvables).toBe(0);

    const apres1 = await prisma.transaction.findUniqueOrThrow({ where: { id: t1 } });
    expect(apres1.subcategoryId).toBe(subA);
    expect(apres1.appliedRuleId).toBeNull();
    const apres2 = await prisma.transaction.findUniqueOrThrow({ where: { id: t2 } });
    expect(apres2.subcategoryId).toBe(subB);
  });

  it("C2 — « dont » non exclusif : une ligne écrite (étiquette) dont la catégorie est protégée compte aussi comme préservée", async () => {
    const motif = motifUnique("MOTIFC2");
    const t1 = await creerTransactionTest({ description: motif, subcategoryId: subA, appliedRuleId: null });
    const ruleId = await creerRegle("Catégoriser et étiqueter (C2)", motif, [
      { type: "CATEGORISER", subcategoryId: subB },
      { type: "ETIQUETER", valeur: tagId },
    ]);

    const { apercu, recap } = await apercuPuisApplication(ruleId);

    const ligne = apercu.extrait.find((c) => c.transactionId === t1);
    expect(ligne?.resultat).toBe("MODIFIEE");
    expect(ligne?.preservations).toContain("CATEGORIE_MANUELLE");
    expect(apercu.idsAEcrire).toContain(t1);
    expect(apercu.categoriesPreservees).toBe(1);
    expect(recap.modifiees).toBe(1);
    expect(recap.categoriesPreservees).toBe(1);
    expect(recap.inchangees).toBe(0);

    const apres = await prisma.transaction.findUniqueOrThrow({ where: { id: t1 }, include: { etiquettes: true } });
    expect(apres.subcategoryId).toBe(subA);
    expect(apres.etiquettes.map((e) => e.tagId)).toContain(tagId);
  });

  it("C3 — une ligne qui a gagné un diff entre l'aperçu et la confirmation part en ignorées, sans être écrite", async () => {
    const motif = motifUnique("MOTIFC3");
    const t1 = await creerTransactionTest({ description: `${motif} un`, subcategoryId: subA, appliedRuleId: null });
    const t2 = await creerTransactionTest({ description: `${motif} deux`, subcategoryId: null });
    const ruleId = await creerRegle("Catégoriser (C3)", motif, [{ type: "CATEGORISER", subcategoryId: subB }]);

    const { recap } = await apercuPuisApplication(ruleId, async () => {
      await prisma.transaction.update({ where: { id: t1 }, data: { subcategoryId: null } });
    });

    expect(recap.ignorees).toBe(1);
    expect(recap.modifiees).toBe(1);

    const apres1 = await prisma.transaction.findUniqueOrThrow({ where: { id: t1 } });
    expect(apres1.subcategoryId).toBeNull();
    const apres2 = await prisma.transaction.findUniqueOrThrow({ where: { id: t2 } });
    expect(apres2.subcategoryId).toBe(subB);
  });

  it("C4 — une ligne qui ne correspond plus à la confirmation part en ignorées", async () => {
    const motif = motifUnique("MOTIFC4");
    const t1 = await creerTransactionTest({ description: `${motif} un`, subcategoryId: subA, appliedRuleId: null });
    await creerTransactionTest({ description: `${motif} deux`, subcategoryId: null });
    const ruleId = await creerRegle("Catégoriser (C4)", motif, [{ type: "CATEGORISER", subcategoryId: subB }]);

    const { recap } = await apercuPuisApplication(ruleId, async () => {
      const description = "AUTRE LIBELLE SANS LE MOTIF";
      await prisma.transaction.update({
        where: { id: t1 },
        data: { description, descriptionNormalisee: normaliserDescription(description) },
      });
    });

    expect(recap.ignorees).toBe(1);
  });

  it("C6 — une ligne ignorée n'est jamais comptée comme préservée, même si sa catégorie reste protégée", async () => {
    // Contrairement à C3 et C4, la ligne ignorée ici porte TOUJOURS une
    // préservation à la confirmation : seul l'ordre des tests dans la boucle
    // idsSansEcriture (correspond / change avant estPreservee) l'écarte du
    // compteur. Déplacer le « categoriesPreservees += 1 » avant ce test fait
    // passer recap.categoriesPreservees à 1 et casse ce cas.
    const motif = motifUnique("MOTIFC6");
    const t1 = await creerTransactionTest({ description: `${motif} un`, subcategoryId: subA, appliedRuleId: null });
    await prisma.transactionTag.create({ data: { transactionId: t1, tagId } });
    const t2 = await creerTransactionTest({ description: `${motif} deux`, subcategoryId: null });
    const ruleId = await creerRegle("Catégoriser et étiqueter (C6)", motif, [
      { type: "CATEGORISER", subcategoryId: subB },
      { type: "ETIQUETER", valeur: tagId },
    ]);

    const { apercu, recap } = await apercuPuisApplication(ruleId, async () => {
      // t1 gagne un diff (l'étiquette manque) sans perdre sa protection.
      await prisma.transactionTag.delete({ where: { transactionId_tagId: { transactionId: t1, tagId } } });
    });

    expect(apercu.idsSansEcriture).toEqual([t1]);
    expect(apercu.idsAEcrire).toEqual([t2]);
    expect(apercu.categoriesPreservees).toBe(1);

    expect(recap.ignorees).toBe(1);
    expect(recap.categoriesPreservees).toBe(0);
    expect(recap.modifiees).toBe(1);

    const apres1 = await prisma.transaction.findUniqueOrThrow({ where: { id: t1 }, include: { etiquettes: true } });
    expect(apres1.subcategoryId).toBe(subA);
    expect(apres1.etiquettes).toEqual([]);
  });

  it("C5 — l'aperçu et le bilan comptent le même nombre de catégories préservées sur plusieurs lignes", async () => {
    const motif = motifUnique("MOTIFC5");
    for (let i = 0; i < 3; i += 1) {
      await creerTransactionTest({ description: `${motif} manuelle ${i}`, subcategoryId: subA, appliedRuleId: null });
    }
    for (let i = 0; i < 2; i += 1) {
      await creerTransactionTest({ description: `${motif} libre ${i}`, subcategoryId: null });
    }
    const ruleId = await creerRegle("Catégoriser (C5)", motif, [{ type: "CATEGORISER", subcategoryId: subB }]);

    const { apercu, recap } = await apercuPuisApplication(ruleId);

    expect(apercu.categoriesPreservees).toBe(3);
    expect(recap.categoriesPreservees).toBe(3);
    expect(recap.modifiees).toBe(2);
    expect(recap.inchangees).toBe(3);
  });
});

describe("apercuApplicationRetroactive — la même fusion, avant écriture", () => {
  it("une catégorie manuelle protégée d'une tentative de recatégorisation apparaît dans l'extrait, sans changer avant/après sur ce créneau (docs/lot-m1.md §4.6 : on ne défait pas le travail manuel)", async () => {
    const motif = motifUnique("MOTIFAPERCUVERROU");
    const transactionId = await creerTransactionTest({ description: motif, subcategoryId: subA, appliedRuleId: null });
    const ruleId = await creerRegle("Catégoriser (bloquée)", motif, [{ type: "CATEGORISER", subcategoryId: subB }]);

    const apercu = await apercuApplicationRetroactive({ ruleId, du: FENETRE_DU, au: FENETRE_AU });
    expect(apercu.ok).toBe(true);
    if (!apercu.ok) return;

    expect(apercu.data.correspondances).toBeGreaterThanOrEqual(1);
    const ligne = apercu.data.extrait.find((c) => c.transactionId === transactionId);
    expect(ligne).toBeDefined();
    expect(ligne?.avant.subcategoryId).toBe(subA);
    expect(ligne?.apres.subcategoryId).toBe(subA);
    expect(ligne?.preservations).toContain("CATEGORIE_MANUELLE");
    expect(ligne?.resultat).toBe("INCHANGEE");
    expect(apercu.data.idsAEcrire).not.toContain(transactionId); // rien à écrire sur cette ligne
    expect(apercu.data.idsSansEcriture).toContain(transactionId);
    expect(apercu.data.categoriesPreservees).toBeGreaterThanOrEqual(1);
  });

  it("une ligne dont le seul effet est un bénéficiaire introuvable est signalée dans l'aperçu (beneficiaireIntrouvable)", async () => {
    const motif = motifUnique("MOTIFAPERCUBENEF");
    const nomIntrouvable = `Bénéficiaire Fantôme Aperçu ${randomUUID().slice(0, 8)}`;
    const transactionId = await creerTransactionTest({ description: motif, payeeId: null });
    const ruleId = await creerRegle("Renommer bénéficiaire", motif, [
      { type: "RENOMMER_BENEFICIAIRE", valeur: nomIntrouvable },
    ]);

    const apercu = await apercuApplicationRetroactive({ ruleId, du: FENETRE_DU, au: FENETRE_AU });
    expect(apercu.ok).toBe(true);
    if (!apercu.ok) return;

    expect(apercu.data.correspondances).toBeGreaterThanOrEqual(1);
    const ligne = apercu.data.extrait.find((c) => c.transactionId === transactionId);
    expect(ligne?.beneficiaireIntrouvable).toBe(nomIntrouvable);
  });

  // Règle générale (pas un troisième cas particulier à ajouter à une liste
  // d'exceptions) : la visibilité d'une ligne dans l'aperçu doit venir du
  // fait qu'une règle a correspondu, jamais d'un diff d'état. Cette règle
  // n'a ni verrou de catégorie ni RENOMMER_BENEFICIAIRE — seulement une
  // étiquette déjà posée, donc un résultat rigoureusement identique à
  // l'avant sur tous les créneaux. Si la visibilité était corrigée en
  // ajoutant `preservations.length > 0 || beneficiaireIntrouvable !== null`
  // à la condition d'inclusion (patch des deux symptômes connus plutôt que
  // de la cause), ce test resterait rouge.
  it("une règle qui correspond mais dont aucune action n'aboutit reste visible dans l'aperçu, avec son motif (règle générale, pas les deux cas connus)", async () => {
    const motif = motifUnique("MOTIFAPERCUSANSEFFET");
    const transactionId = await creerTransactionTest({ description: motif });
    await prisma.transactionTag.create({ data: { transactionId, tagId } });
    const ruleId = await creerRegle("Étiqueter déjà posée", motif, [{ type: "ETIQUETER", valeur: tagId }]);

    const apercu = await apercuApplicationRetroactive({ ruleId, du: FENETRE_DU, au: FENETRE_AU });
    expect(apercu.ok).toBe(true);
    if (!apercu.ok) return;

    expect(apercu.data.correspondances).toBeGreaterThanOrEqual(1);
    const ligne = apercu.data.extrait.find((c) => c.transactionId === transactionId);
    expect(ligne).toBeDefined(); // visible malgré l'absence totale d'effet
    expect(ligne?.resultat).toBe("INCHANGEE");
    expect(apercu.data.idsAEcrire).not.toContain(transactionId); // mais rien à écrire
  });

  it("l'extrait garantit la présence d'une ligne à écrire même derrière plus de EXTRAIT_APERCU lignes sans effet (docs/lot-m1.md §11 : l'aperçu se montre avant d'écrire)", async () => {
    const motif = motifUnique("MOTIFEXTRAITGARANTI");
    const ruleId = await creerRegle("Étiqueter", motif, [{ type: "ETIQUETER", valeur: tagId }]);

    // Plus de EXTRAIT_APERCU transactions déjà à jour (étiquette déjà posée,
    // donc sans aucun effet), toutes datées après la ligne à écrire — donc
    // balayées avant elle (balayerTransactions trie par date desc).
    for (let i = 0; i < EXTRAIT_APERCU + 5; i += 1) {
      const idSansEffet = await creerTransactionTest({ description: `${motif} sans effet ${i}`, date: DATE_TEST });
      await prisma.transactionTag.create({ data: { transactionId: idSansEffet, tagId } });
    }

    // La seule ligne que la règle modifiera réellement, balayée en dernier.
    const transactionAEcrireId = await creerTransactionTest({
      description: `${motif} a ecrire`,
      date: DATE_TEST_ANTERIEURE,
    });

    const apercu = await apercuApplicationRetroactive({ ruleId, du: FENETRE_DU, au: FENETRE_AU });
    expect(apercu.ok).toBe(true);
    if (!apercu.ok) return;

    expect(apercu.data.correspondances).toBeGreaterThan(EXTRAIT_APERCU);
    expect(apercu.data.changements).toBe(1);
    expect(apercu.data.idsAEcrire).toContain(transactionAEcrireId);
    expect(apercu.data.extrait.length).toBeLessThanOrEqual(EXTRAIT_APERCU);

    // Une simple troncature « premières du balayage » l'aurait exclue : elle
    // est plus de EXTRAIT_APERCU rangs derrière dans l'ordre de balayage.
    const ligne = apercu.data.extrait.find((c) => c.transactionId === transactionAEcrireId);
    expect(ligne).toBeDefined();
    expect(ligne?.resultat).toBe("MODIFIEE");
  });
});

describe("rétroaction VENTILER et créneau fermé (docs/lot-m2.md §4.2 et §4.3)", () => {
  const R = motifUnique("RETROVENTIL");
  const DU = "2096-08-01";
  const AU = "2096-08-31";
  let compteB: string;
  let epicerie: string;
  let cafe: string;
  let restaurant: string;
  let regleVentiler: string;
  const ids: Record<string, string> = {};
  const idsRegles: string[] = [];
  const idsLignes: string[] = [];

  async function creerLigne(
    cle: string,
    jour: number,
    montantCents: number,
    extra: { subcategoryId?: string; appliedRuleId?: string; accountId?: string; parentId?: string } = {},
  ): Promise<string> {
    const description = `${R} ${cle}`;
    const ligne = await prisma.transaction.create({
      data: {
        ownerId,
        accountId: extra.accountId ?? accountId,
        date: new Date(Date.UTC(2096, 7, jour)),
        description,
        descriptionNormalisee: normaliserDescription(description),
        montantCents,
        source: "MANUELLE",
        empreinte: `retro-ventil-${cle}-${R}`,
        subcategoryId: extra.subcategoryId ?? null,
        appliedRuleId: extra.appliedRuleId ?? null,
        parentId: extra.parentId ?? null,
        estVentilee: cle === "P",
      },
      select: { id: true },
    });
    ids[cle] = ligne.id;
    idsLignes.push(ligne.id);
    return ligne.id;
  }

  async function creerRegleDirecte(
    libelle: string,
    valeurCondition: string,
    action: { type: "VENTILER" | "CATEGORISER"; valeur?: string; subcategoryId?: string },
  ): Promise<string> {
    const regle = await prisma.rule.create({
      data: {
        ownerId,
        libelle,
        priorite: 50,
        conditions: { create: [{ champ: "DESCRIPTION", operateur: "CONTIENT", valeur: valeurCondition }] },
        actions: {
          create: [{ type: action.type, subcategoryId: action.subcategoryId ?? null, valeur: action.valeur ?? null, ordre: 0 }],
        },
      },
      select: { id: true },
    });
    idsRegles.push(regle.id);
    return regle.id;
  }

  const id = (cle: string): string => {
    const valeur = ids[cle];
    if (valeur === undefined) throw new Error(`fixture inconnue : ${cle}`);
    return valeur;
  };

  async function filles(cle: string) {
    return prisma.transaction.findMany({
      where: { parentId: id(cle) },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { id: true, montantCents: true, subcategoryId: true, empreinte: true },
    });
  }

  async function etat(cle: string) {
    return prisma.transaction.findUniqueOrThrow({
      where: { id: id(cle) },
      select: { estVentilee: true, subcategoryId: true, appliedRuleId: true, empreinte: true },
    });
  }

  async function exigerSain(cles: readonly string[]): Promise<void> {
    const enfants = await prisma.transaction.findMany({
      where: { parentId: { in: cles.map(id) } },
      select: { id: true },
    });
    await exigerInvariants(prisma, { type: "TRANSACTIONS", ids: [...cles.map(id), ...enfants.map((e) => e.id)] });
  }

  async function sousCategorie(nom: string): Promise<string> {
    return (await prisma.subcategory.findFirstOrThrow({ where: { category: { ownerId }, nom }, select: { id: true } })).id;
  }

  beforeAll(async () => {
    epicerie = await sousCategorie("Épicerie");
    cafe = await sousCategorie("Café");
    restaurant = await sousCategorie("Restaurant");
    const regleIga = await prisma.rule.findFirstOrThrow({ where: { ownerId, libelle: "Épicerie IGA" }, select: { id: true } });
    compteB = (
      await prisma.account.create({
        data: { ownerId, nom: `Retro B ${R}`, dateSoldeInitial: new Date(Date.UTC(2096, 0, 1)), estBudgetaire: false },
        select: { id: true },
      })
    ).id;

    await creerLigne("N1", 1, -1000);
    await creerLigne("N2", 2, -2000, { subcategoryId: restaurant, appliedRuleId: regleIga.id });
    await creerLigne("H", 3, -3000, { subcategoryId: cafe });
    await creerLigne("P", 4, -4000);
    await creerLigne("P1", 4, -1000, { subcategoryId: cafe, parentId: id("P") });
    await creerLigne("P2", 4, -3000, { subcategoryId: epicerie, parentId: id("P") });
    await creerLigne("W1", 5, -500);
    await creerLigne("W2", 5, 500, { accountId: compteB });
    await prisma.transaction.update({
      where: { id: id("W1") },
      data: { transferAccountId: compteB, transferTransactionId: id("W2") },
    });
    await prisma.transaction.update({
      where: { id: id("W2") },
      data: { transferAccountId: accountId, transferTransactionId: id("W1") },
    });

    regleVentiler = await creerRegleDirecte(`Retro ventiler ${R}`, R, {
      type: "VENTILER",
      valeur: serialiserPartsVentilation([
        { subcategoryId: epicerie, partMille: 600 },
        { subcategoryId: cafe, partMille: 400 },
      ]),
    });
    await exigerSain(["N1", "N2", "H", "P", "W1", "W2"]);
  });

  afterAll(async () => {
    await prisma.transaction.deleteMany({ where: { id: { in: idsLignes } } });
    await prisma.rule.deleteMany({ where: { id: { in: idsRegles } } });
    await prisma.account.deleteMany({ where: { id: compteB } });
  });

  it("RR1 — l'aperçu annonce la ventilation de N1 et N2, et préserve H, P et le virement", async () => {
    const apercu = await apercuApplicationRetroactive({ ruleId: regleVentiler, du: DU, au: AU });
    expect(apercu.ok).toBe(true);
    if (!apercu.ok) return;
    const d = apercu.data;
    expect(d.correspondances).toBe(6);
    expect(d.changements).toBe(2);
    expect([...d.idsAEcrire].sort()).toEqual([id("N1"), id("N2")].sort());
    expect(d.categoriesPreservees).toBe(4);

    const ligne = (cle: string) => d.extrait.find((c) => c.transactionId === id(cle));
    expect(ligne("N1")?.apres.subcategoryId).toBeNull();
    expect(ligne("N1")?.apres.ventilation).toEqual([
      { subcategoryId: epicerie, sousCategorieNom: "Épicerie", montantCents: -600 },
      { subcategoryId: cafe, sousCategorieNom: "Café", montantCents: -400 },
    ]);
    expect(ligne("N2")?.apres.ventilation?.map((l) => l.montantCents)).toEqual([-1200, -800]);
    expect(ligne("N2")?.avant.sousCategorieNom).toBe("Restaurant");
    expect(ligne("H")?.preservations).toEqual(["CATEGORIE_MANUELLE"]);
    for (const cle of ["P", "W1", "W2"]) {
      expect(ligne(cle)?.preservations).toEqual(["VENTILEE_OU_VIREMENT"]);
    }
  });

  it("RR2 — l'application ventile N1 et N2 et laisse le reste intact", async () => {
    const avantP = await filles("P");
    const apercu = await apercuApplicationRetroactive({ ruleId: regleVentiler, du: DU, au: AU });
    if (!apercu.ok) throw new Error("aperçu en échec");
    const recap = await appliquerRegleRetroactivement({
      ruleId: regleVentiler,
      transactionIds: [...apercu.data.idsAEcrire],
      idsSansEcriture: [...apercu.data.idsSansEcriture],
    });
    expect(recap).toMatchObject({ ok: true, data: { modifiees: 2, inchangees: 4, ignorees: 0 } });

    for (const [cle, montants] of [
      ["N1", [-600, -400]],
      ["N2", [-1200, -800]],
    ] as const) {
      const parent = await etat(cle);
      expect(parent).toMatchObject({ estVentilee: true, subcategoryId: null, appliedRuleId: regleVentiler });
      const enfants = await filles(cle);
      expect(enfants.map((f) => f.montantCents)).toEqual(montants);
      expect(enfants.map((f) => f.subcategoryId)).toEqual([epicerie, cafe]);
      expect(enfants.map((f) => f.empreinte)).toEqual([1, 2].map((r) => empreinteLigneFille(parent.empreinte, r)));
    }
    expect(await etat("H")).toMatchObject({ estVentilee: false, subcategoryId: cafe, appliedRuleId: null });
    expect(await filles("P")).toEqual(avantP);
    expect(await etat("W1")).toMatchObject({ subcategoryId: null, appliedRuleId: null });
    expect(await etat("W2")).toMatchObject({ subcategoryId: null, appliedRuleId: null });
    await exigerSain(["N1", "N2", "H", "P", "W1", "W2"]);
  });

  it("RR3 — un second aperçu ne voit plus rien à changer", async () => {
    const apercu = await apercuApplicationRetroactive({ ruleId: regleVentiler, du: DU, au: AU });
    expect(apercu).toMatchObject({ ok: true, data: { changements: 0 } });
  });

  it("RR4 — une règle CATEGORISER ne pose rien sur une ventilée, une fille ou un côté de virement", async () => {
    const regle = await creerRegleDirecte(`Retro categoriser ${R}`, R, { type: "CATEGORISER", subcategoryId: cafe });
    const apercu = await apercuApplicationRetroactive({ ruleId: regle, du: DU, au: AU });
    expect(apercu.ok).toBe(true);
    if (!apercu.ok) return;
    expect(apercu.data.changements).toBe(0);
    expect(apercu.data.idsAEcrire).toEqual([]);
    for (const cle of ["N1", "N2", "P", "W1", "W2"]) {
      const ligne = apercu.data.extrait.find((c) => c.transactionId === id(cle));
      expect(ligne?.preservations).toEqual(["VENTILEE_OU_VIREMENT"]);
    }

    const avantP = await filles("P");
    const avantN1 = await filles("N1");
    const avantW1 = await etat("W1");
    const forge = await appliquerRegleRetroactivement({
      ruleId: regle,
      transactionIds: [id("N1"), id("P"), avantP[0]?.id ?? "", id("W1")],
      idsSansEcriture: [],
    });
    expect(forge).toMatchObject({ ok: true, data: { modifiees: 0, inchangees: 4, ignorees: 0, categoriesPreservees: 4 } });
    expect(await etat("N1")).toMatchObject({ estVentilee: true, subcategoryId: null });
    expect(await etat("P")).toMatchObject({ estVentilee: true, subcategoryId: null });
    expect(await filles("N1")).toEqual(avantN1);
    expect(await filles("P")).toEqual(avantP);
    expect(await etat("W1")).toEqual(avantW1);
    expect(await etat("W2")).toMatchObject({ subcategoryId: null });
    await exigerSain(["N1", "P", "W1", "W2"]);
  });

  it("RR5 — une ventilation qui vise une sous-catégorie supprimée rend la règle inapplicable, rien n'est écrit", async () => {
    const categorie = await prisma.subcategory.findUniqueOrThrow({ where: { id: epicerie }, select: { categoryId: true } });
    const orpheline = await prisma.subcategory.create({
      data: { categoryId: categorie.categoryId, nom: `Ventil orpheline ${R}` },
    });
    const regle = await creerRegleDirecte(`Retro orpheline ${R}`, R, {
      type: "VENTILER",
      valeur: serialiserPartsVentilation([
        { subcategoryId: orpheline.id, partMille: 500 },
        { subcategoryId: cafe, partMille: 500 },
      ]),
    });
    try {
      await prisma.subcategory.delete({ where: { id: orpheline.id } });
      const apercu = await apercuApplicationRetroactive({ ruleId: regle, du: DU, au: AU });
      expect(apercu.ok).toBe(true);
      if (!apercu.ok) return;
      expect(apercu.data.changements).toBe(0);
      expect(apercu.data.reglesInapplicables).toEqual([
        expect.objectContaining({ ruleId: regle, motif: "VENTILATION_ILLISIBLE" }),
      ]);

      const avantH = await etat("H");
      const forge = await appliquerRegleRetroactivement({ ruleId: regle, transactionIds: [id("H")], idsSansEcriture: [] });
      expect(forge).toMatchObject({ ok: true, data: { modifiees: 0, ignorees: 1 } });
      expect(await etat("H")).toEqual(avantH);
      expect(await prisma.transaction.count({ where: { parentId: id("H") } })).toBe(0);
    } finally {
      await prisma.subcategory.deleteMany({ where: { id: orpheline.id } });
    }
  });

  it("RR6 — un côté de virement du seed ne reçoit pas de sous-catégorie d'une règle", async () => {
    const S = await prisma.transaction.findFirstOrThrow({
      where: {
        ownerId,
        parentId: null,
        transferTransactionId: { not: null },
        description: { contains: "PAIEMENT VISA DESJARDINS" },
      },
      orderBy: [{ date: "asc" }, { id: "asc" }],
      select: { id: true, date: true, subcategoryId: true, appliedRuleId: true, transferTransactionId: true },
    });
    const idContrepartie = S.transferTransactionId;
    if (idContrepartie === null) {
      throw new Error("Le côté de virement du seed n'a pas de contrepartie.");
    }
    const contrepartie = await prisma.transaction.findUniqueOrThrow({
      where: { id: idContrepartie },
      select: { id: true, subcategoryId: true, appliedRuleId: true },
    });
    const regle = await creerRegleDirecte(`Retro virement ${R}`, "PAIEMENT VISA DESJARDINS", {
      type: "CATEGORISER",
      subcategoryId: cafe,
    });
    const jour = depuisDateUtc(S.date);
    const apercu = await apercuApplicationRetroactive({ ruleId: regle, du: jour, au: jour });
    expect(apercu.ok).toBe(true);
    if (!apercu.ok) return;
    expect(apercu.data.idsSansEcriture).toContain(S.id);
    expect(apercu.data.idsAEcrire).not.toContain(S.id);

    const forge = await appliquerRegleRetroactivement({ ruleId: regle, transactionIds: [S.id], idsSansEcriture: [] });
    expect(forge).toMatchObject({ ok: true, data: { modifiees: 0, inchangees: 1, ignorees: 0, categoriesPreservees: 1 } });
    const apres = await prisma.transaction.findUniqueOrThrow({
      where: { id: S.id },
      select: { subcategoryId: true, appliedRuleId: true },
    });
    expect(apres).toEqual({ subcategoryId: S.subcategoryId, appliedRuleId: S.appliedRuleId });
    const contrepartieApres = await prisma.transaction.findUniqueOrThrow({
      where: { id: contrepartie.id },
      select: { subcategoryId: true, appliedRuleId: true },
    });
    expect(contrepartieApres).toEqual({ subcategoryId: contrepartie.subcategoryId, appliedRuleId: contrepartie.appliedRuleId });
    await exigerInvariants(prisma, { type: "TRANSACTIONS", ids: [S.id, contrepartie.id] });
  });
});
