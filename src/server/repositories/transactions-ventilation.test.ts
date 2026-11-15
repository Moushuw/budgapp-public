// Test d'intégration de la ventilation — docs/lot-m2.md §4.2. Même mise en place que
// transactions-ecriture.test.ts : schéma `test`, marqueur unique, dates en 2099, comptes hors budget,
// nettoyage complet en afterAll. Les cas tournent dans l'ordre du fichier : chacun part de l'état laissé
// par les précédents.

import { randomUUID } from "node:crypto";
import { PrismaClient, type Prisma } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { versDateUtc } from "@/domain/dates";
import { normaliserDescription, normaliserNom } from "@/domain/ingestion";
import type { SourceIngestion } from "@/domain/referentiel";
import { empreinteLigneFille } from "@/domain/ventilation/empreinte";
import { exigerInvariants } from "../../../prisma/test/invariants";
import { lireTransaction } from "./transactions-lecture";
import {
  apercevoirSuppression,
  deventilerTransaction,
  modifierEnMasse,
  supprimerTransaction,
  ventilerTransaction,
} from "./transactions-ecriture";

const prisma = new PrismaClient();

const M = "X" + randomUUID().replace(/-/g, "").slice(0, 9).toUpperCase();
const CUID_INEXISTANT = "clx0000000000000000099999";

let ownerId: string;
let compteA: string;
let compteB: string;
let sousCatEpicerie: string;
let sousCatCafe: string;
let sousCatRestaurant: string;
let idRegleIga: string;
let tagTA: string;
let tagTB: string;
let payeePY: string;
let goalId: string;

const ids: Record<string, string> = {};
const idsFixture: string[] = [];

function id(cle: string): string {
  const valeur = ids[cle];
  if (valeur === undefined) {
    throw new Error(`id de fixture inconnu : ${cle}`);
  }
  return valeur;
}

interface DonneesLigne {
  readonly cle: string;
  readonly accountId: string;
  readonly date: string;
  readonly montantCents: number;
  readonly source: SourceIngestion;
  readonly description: string;
  readonly extra?: Partial<Prisma.TransactionUncheckedCreateInput>;
}

async function creerLigne(client: Pick<PrismaClient, "transaction">, d: DonneesLigne): Promise<string> {
  const ligne = await client.transaction.create({
    data: {
      ownerId,
      accountId: d.accountId,
      date: versDateUtc(d.date),
      description: d.description,
      descriptionNormalisee: normaliserDescription(d.description),
      montantCents: d.montantCents,
      source: d.source,
      empreinte: `ventilation-${d.cle}-${M}`,
      ...d.extra,
    },
    select: { id: true },
  });
  ids[d.cle] = ligne.id;
  idsFixture.push(ligne.id);
  return ligne.id;
}

async function filles(cle: string) {
  return prisma.transaction.findMany({
    where: { parentId: id(cle) },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      ownerId: true,
      accountId: true,
      date: true,
      description: true,
      descriptionNormalisee: true,
      typeOperation: true,
      payeeId: true,
      source: true,
      montantCents: true,
      subcategoryId: true,
      details: true,
      empreinte: true,
      parentId: true,
      appliedRuleId: true,
      importBatchId: true,
      aRevoir: true,
      exclureDuBudget: true,
      exclureDesRapports: true,
      etiquettes: { select: { tagId: true } },
    },
  });
}

async function parent(cle: string) {
  return prisma.transaction.findUniqueOrThrow({
    where: { id: id(cle) },
    select: {
      estVentilee: true,
      subcategoryId: true,
      appliedRuleId: true,
      empreinte: true,
      etiquettes: { select: { tagId: true } },
    },
  });
}

async function invariantsDe(cle: string): Promise<void> {
  const enfants = await prisma.transaction.findMany({ where: { parentId: id(cle) }, select: { id: true } });
  await exigerInvariants(prisma, { type: "TRANSACTIONS", ids: [id(cle), ...enfants.map((e) => e.id)] });
}

const ligne = (
  subcategoryId: string | null,
  montantCents: number,
  note: string | null = null,
  tagIds: readonly string[] = [],
) => ({ subcategoryId, montantCents, note, tagIds });

beforeAll(async () => {
  const proprietaire = await prisma.user.findFirstOrThrow({ orderBy: { createdAt: "asc" } });
  ownerId = proprietaire.id;

  const creerCompte = async (nom: string) =>
    (
      await prisma.account.create({
        data: { ownerId, nom, dateSoldeInitial: versDateUtc("2099-01-01"), estBudgetaire: false },
        select: { id: true },
      })
    ).id;
  compteA = await creerCompte(`Ventil A ${M}`);
  compteB = await creerCompte(`Ventil B ${M}`);

  const sousCat = async (nom: string) =>
    (await prisma.subcategory.findFirstOrThrow({ where: { nom, category: { ownerId } }, select: { id: true } })).id;
  sousCatEpicerie = await sousCat("Épicerie");
  sousCatCafe = await sousCat("Café");
  sousCatRestaurant = await sousCat("Restaurant");
  idRegleIga = (await prisma.rule.findFirstOrThrow({ where: { ownerId, libelle: "Épicerie IGA" }, select: { id: true } })).id;

  tagTA = (await prisma.tag.create({ data: { ownerId, nom: `Ventil TA ${M}` }, select: { id: true } })).id;
  tagTB = (await prisma.tag.create({ data: { ownerId, nom: `Ventil TB ${M}` }, select: { id: true } })).id;
  payeePY = (
    await prisma.payee.create({
      data: { ownerId, nom: `Beneficiaire Ventil ${M}`, nomNormalise: normaliserNom(`Beneficiaire Ventil ${M}`) },
      select: { id: true },
    })
  ).id;

  await creerLigne(prisma, {
    cle: "T1",
    accountId: compteA,
    date: "2099-07-01",
    montantCents: -9000,
    source: "COPIER_COLLER",
    description: `Ventil T1 ${M}`,
    extra: {
      typeOperation: "Achat",
      subcategoryId: sousCatCafe,
      appliedRuleId: idRegleIga,
      payeeId: payeePY,
      etiquettes: { create: { tagId: tagTA } },
    },
  });
  await creerLigne(prisma, {
    cle: "TM",
    accountId: compteA,
    date: "2099-07-02",
    montantCents: -5000,
    source: "MANUELLE",
    description: `Ventil TM ${M}`,
  });

  await prisma.$transaction(async (tx) => {
    await creerLigne(tx, {
      cle: "VV1",
      accountId: compteA,
      date: "2099-07-03",
      montantCents: -3000,
      source: "MANUELLE",
      description: `Ventil VV1 ${M}`,
      extra: { transferAccountId: compteB },
    });
    await creerLigne(tx, {
      cle: "VV2",
      accountId: compteB,
      date: "2099-07-03",
      montantCents: 3000,
      source: "MANUELLE",
      description: `Ventil VV2 ${M}`,
      extra: { transferAccountId: compteA, transferTransactionId: id("VV1") },
    });
    await tx.transaction.update({ where: { id: id("VV1") }, data: { transferTransactionId: id("VV2") } });
  });

  const ventile = async (
    cleParent: string,
    date: string,
    total: number,
    lignesFilles: readonly [string, number, string][],
  ): Promise<void> => {
    await prisma.$transaction(async (tx) => {
      const description = `Ventil ${cleParent} ${M}`;
      await creerLigne(tx, {
        cle: cleParent,
        accountId: compteA,
        date,
        montantCents: total,
        source: "COPIER_COLLER",
        description,
        extra: { estVentilee: true },
      });
      for (const [cle, montantCents, sousCategorie] of lignesFilles) {
        await creerLigne(tx, {
          cle,
          accountId: compteA,
          date,
          montantCents,
          source: "COPIER_COLLER",
          description,
          extra: { parentId: id(cleParent), subcategoryId: sousCategorie },
        });
      }
    });
  };
  await ventile("PL", "2099-07-04", -6000, [
    ["FL1", -4000, sousCatEpicerie],
    ["FL2", -2000, sousCatCafe],
  ]);
  await prisma.contributionEntry.create({
    data: { accountId: compteA, transactionId: id("FL1"), anneeImputation: 2099, montantCents: 4000 },
  });

  await ventile("PG", "2099-07-05", -2500, [
    ["GL1", -1500, sousCatCafe],
    ["GL2", -1000, sousCatEpicerie],
  ]);
  goalId = (
    await prisma.goal.create({
      data: { ownerId, nom: `Objectif ${M}`, type: "EPARGNE", dateDebut: versDateUtc("2099-01-01") },
      select: { id: true },
    })
  ).id;
  await prisma.goalTransaction.create({ data: { goalId, transactionId: id("GL1") } });

  await creerLigne(prisma, {
    cle: "Z0",
    accountId: compteA,
    date: "2099-07-06",
    montantCents: 0,
    source: "MANUELLE",
    description: `Ventil Z0 ${M}`,
  });
  await creerLigne(prisma, {
    cle: "K",
    accountId: compteA,
    date: "2099-07-07",
    montantCents: -700,
    source: "COPIER_COLLER",
    description: `Ventil K ${M}`,
  });

  await exigerInvariants(prisma, { type: "TRANSACTIONS", ids: idsFixture });
});

afterAll(async () => {
  // Les filles, les étiquettes, les cotisations et les liens d'objectif partent en cascade avec leur parent.
  await prisma.transaction.deleteMany({ where: { id: { in: idsFixture } } });
  await prisma.goal.deleteMany({ where: { id: goalId } });
  await prisma.payee.deleteMany({ where: { ownerId, nomNormalise: { contains: M.toLowerCase() } } });
  await prisma.tag.deleteMany({ where: { id: { in: [tagTA, tagTB] } } });
  await prisma.account.deleteMany({ where: { id: { in: [compteA, compteB] } } });
  await prisma.$disconnect();
});

describe("ventiler et déventiler", () => {
  it("V1 — ventiler une importée : trois filles aux empreintes dérivées, le parent perd sa sous-catégorie et sa règle", async () => {
    const resultat = await ventilerTransaction(ownerId, id("T1"), [
      ligne(sousCatEpicerie, -5000, "n1", [tagTA]),
      ligne(sousCatCafe, -3000),
      ligne(null, -1000, null, [tagTB]),
    ]);
    expect(resultat).toEqual({ statut: "VENTILEE", id: id("T1"), lignes: 3, lignesRemplacees: 0 });

    const p = await parent("T1");
    expect(p).toMatchObject({ estVentilee: true, subcategoryId: null, appliedRuleId: null });
    expect(p.etiquettes.map((e) => e.tagId)).toEqual([tagTA]);

    const enfants = await filles("T1");
    expect(enfants).toHaveLength(3);
    const attendues = [
      { montantCents: -5000, subcategoryId: sousCatEpicerie, details: "n1", tags: [tagTA] },
      { montantCents: -3000, subcategoryId: sousCatCafe, details: null, tags: [] },
      { montantCents: -1000, subcategoryId: null, details: null, tags: [tagTB] },
    ];
    for (const [i, attendue] of attendues.entries()) {
      const fille = enfants.find((e) => e.empreinte === empreinteLigneFille(p.empreinte, i + 1));
      expect(fille).toBeDefined();
      expect(fille).toMatchObject({
        montantCents: attendue.montantCents,
        subcategoryId: attendue.subcategoryId,
        details: attendue.details,
        parentId: id("T1"),
        ownerId,
        accountId: compteA,
        description: `Ventil T1 ${M}`,
        descriptionNormalisee: normaliserDescription(`Ventil T1 ${M}`),
        typeOperation: "Achat",
        payeeId: payeePY,
        source: "COPIER_COLLER",
        appliedRuleId: null,
        importBatchId: null,
        aRevoir: false,
        exclureDuBudget: false,
        exclureDesRapports: false,
      });
      expect(fille?.date.toISOString().slice(0, 10)).toBe("2099-07-01");
      expect(fille?.etiquettes.map((e) => e.tagId)).toEqual(attendue.tags);
    }
    await invariantsDe("T1");
  });

  it("V2 — modifier la ventilation remplace toutes les lignes", async () => {
    const anciennes = (await filles("T1")).map((f) => f.id);
    const resultat = await ventilerTransaction(ownerId, id("T1"), [
      ligne(sousCatRestaurant, -6000),
      ligne(sousCatCafe, -3000),
    ]);
    expect(resultat).toEqual({ statut: "VENTILEE", id: id("T1"), lignes: 2, lignesRemplacees: 3 });
    expect(await prisma.transaction.count({ where: { id: { in: anciennes } } })).toBe(0);
    const enfants = await filles("T1");
    const empreinte = (await parent("T1")).empreinte;
    expect(enfants.map((f) => f.empreinte).sort()).toEqual(
      [empreinteLigneFille(empreinte, 1), empreinteLigneFille(empreinte, 2)].sort(),
    );
    await invariantsDe("T1");
  });

  it("V3 — une somme fausse n'écrit rien", async () => {
    const avant = (await filles("T1")).map((f) => f.id);
    const resultat = await ventilerTransaction(ownerId, id("T1"), [ligne(sousCatCafe, -6000), ligne(sousCatCafe, -2000)]);
    expect(resultat).toEqual({
      statut: "INVALIDE",
      erreurs: [{ motif: "SOMME_INEXACTE", resteCents: -1000, sensParent: "SORTIE" }],
    });
    expect((await filles("T1")).map((f) => f.id)).toEqual(avant);
  });

  it("V4 — un seul motif, une ligne à zéro, un signe opposé : rien n'a changé", async () => {
    const avant = (await filles("T1")).map((f) => f.id);
    expect(await ventilerTransaction(ownerId, id("T1"), [ligne(sousCatCafe, -9000)])).toEqual({
      statut: "INVALIDE",
      erreurs: [{ motif: "MOINS_DE_DEUX_LIGNES" }],
    });
    expect(await ventilerTransaction(ownerId, id("T1"), [ligne(sousCatCafe, -9500), ligne(sousCatCafe, 500)])).toEqual({
      statut: "INVALIDE",
      erreurs: [{ motif: "SIGNE_OPPOSE", rang: 1, sensParent: "SORTIE" }],
    });
    expect(await ventilerTransaction(ownerId, id("T1"), [ligne(sousCatCafe, -9000), ligne(sousCatCafe, 0)])).toEqual({
      statut: "INVALIDE",
      erreurs: [{ motif: "LIGNE_A_ZERO", rang: 1 }],
    });
    expect((await filles("T1")).map((f) => f.id)).toEqual(avant);
  });

  it("V5 — une transaction de 0,00 $ ne se ventile pas", async () => {
    expect(await ventilerTransaction(ownerId, id("Z0"), [ligne(sousCatCafe, -100), ligne(sousCatCafe, 100)])).toEqual({
      statut: "REFUS",
      motif: "VENTILATION_MONTANT_NUL",
    });
    expect((await parent("Z0")).estVentilee).toBe(false);
  });

  it("V5b — le détail annonce le refus d'avance", async () => {
    expect((await lireTransaction(ownerId, id("Z0")))?.refus.ventilation).toBe("VENTILATION_MONTANT_NUL");
  });

  it("V6 — un côté de virement ne se ventile pas", async () => {
    expect(await ventilerTransaction(ownerId, id("VV1"), [ligne(sousCatCafe, -1000), ligne(sousCatCafe, -2000)])).toEqual({
      statut: "REFUS",
      motif: "VENTILATION_VIREMENT",
    });
    expect((await parent("VV1")).estVentilee).toBe(false);
    expect((await parent("VV2")).estVentilee).toBe(false);
  });

  it("V7 — une ligne de ventilation ne se ventile pas", async () => {
    const [premiere] = await filles("T1");
    expect(premiere).toBeDefined();
    expect(
      await ventilerTransaction(ownerId, premiere?.id ?? "", [ligne(sousCatCafe, -3000), ligne(sousCatCafe, -3000)]),
    ).toEqual({ statut: "REFUS", motif: "LIGNE_FILLE" });
  });

  it("V8 — références inexistantes : rien ne bouge", async () => {
    const avant = (await filles("T1")).map((f) => f.id);
    expect(await ventilerTransaction(ownerId, id("T1"), [ligne(CUID_INEXISTANT, -6000), ligne(sousCatCafe, -3000)])).toEqual({
      statut: "REFERENCE_INVALIDE",
      quoi: "SOUS_CATEGORIE",
    });
    expect(
      await ventilerTransaction(ownerId, id("T1"), [ligne(sousCatCafe, -6000, null, [CUID_INEXISTANT]), ligne(sousCatCafe, -3000)]),
    ).toEqual({ statut: "REFERENCE_INVALIDE", quoi: "ETIQUETTE" });
    expect((await filles("T1")).map((f) => f.id)).toEqual(avant);
  });

  it("V9 — déventiler supprime les lignes et remet le parent à neutre", async () => {
    expect(await deventilerTransaction(ownerId, id("T1"))).toEqual({
      statut: "DEVENTILEE",
      id: id("T1"),
      lignesSupprimees: 2,
    });
    expect(await parent("T1")).toMatchObject({ estVentilee: false, subcategoryId: null, appliedRuleId: null });
    expect(await filles("T1")).toHaveLength(0);
    await invariantsDe("T1");
  });

  it("V10 — déventiler une non ventilée", async () => {
    expect(await deventilerTransaction(ownerId, id("TM"))).toEqual({ statut: "REFUS", motif: "NON_VENTILEE" });
  });

  it("V11 — les filles d'une saisie manuelle sont manuelles", async () => {
    const resultat = await ventilerTransaction(ownerId, id("TM"), [ligne(sousCatCafe, -2000), ligne(sousCatEpicerie, -3000)]);
    expect(resultat.statut).toBe("VENTILEE");
    const enfants = await filles("TM");
    expect(enfants).toHaveLength(2);
    expect(enfants.every((f) => f.source === "MANUELLE")).toBe(true);
    await invariantsDe("TM");
  });

  it("V12 — une fille liée à une cotisation : ni remodelée, ni déventilée, ni supprimée", async () => {
    expect(await ventilerTransaction(ownerId, id("PL"), [ligne(sousCatCafe, -3000), ligne(sousCatCafe, -3000)])).toEqual({
      statut: "REFUS",
      motif: "VENTILATION_FILLE_LIEE",
    });
    expect(await deventilerTransaction(ownerId, id("PL"))).toEqual({ statut: "REFUS", motif: "VENTILATION_FILLE_LIEE" });
    expect(await supprimerTransaction(ownerId, id("PL"), null)).toEqual({ statut: "REFUS", motif: "SUPPRESSION_FILLE_LIEE" });
    expect(await prisma.transaction.count({ where: { id: { in: [id("FL1"), id("FL2")] } } })).toBe(2);
    expect(await prisma.contributionEntry.count({ where: { transactionId: id("FL1") } })).toBe(1);
  });

  it("V13 — une fille liée à un objectif ne part pas avec son parent", async () => {
    expect(await supprimerTransaction(ownerId, id("PG"), null)).toEqual({ statut: "REFUS", motif: "SUPPRESSION_FILLE_LIEE" });
    expect(await prisma.goalTransaction.count({ where: { goalId } })).toBe(1);
  });

  it("V13 (suite) — une fille liée à un objectif bloque aussi ventiler et déventiler, rien n'est touché", async () => {
    const avant = (await filles("PG")).map((f) => f.id);
    expect(await ventilerTransaction(ownerId, id("PG"), [ligne(sousCatCafe, -1000), ligne(sousCatCafe, -1500)])).toEqual({
      statut: "REFUS",
      motif: "VENTILATION_FILLE_LIEE",
    });
    expect(await deventilerTransaction(ownerId, id("PG"))).toEqual({ statut: "REFUS", motif: "VENTILATION_FILLE_LIEE" });
    expect((await filles("PG")).map((f) => f.id)).toEqual(avant);
    expect(await prisma.goalTransaction.count({ where: { goalId } })).toBe(1);
    expect((await parent("PG")).estVentilee).toBe(true);
  });

  it("V14 — en masse, les parents à fille liée sont ignorés et comptés", async () => {
    const selection = { type: "IDS", ids: [id("PL"), id("PG"), id("K")] } as const;
    const apercu = await apercevoirSuppression(ownerId, selection);
    expect(apercu).toMatchObject({
      statut: "APERCU",
      apercus: { sansChoix: { aSupprimer: 1, ignorees: { LIEE: 2 } } },
    });
    expect(await prisma.transaction.count({ where: { id: id("K") } })).toBe(1);

    const resultat = await modifierEnMasse(ownerId, selection, { type: "SUPPRIMER", virements: null });
    expect(resultat).toMatchObject({ statut: "APPLIQUE", compteRendu: { traitees: 1, ignorees: { LIEE: 2 } } });
    expect(await prisma.transaction.count({ where: { id: id("K") } })).toBe(0);
    expect(await prisma.transaction.count({ where: { id: { in: [id("PL"), id("PG"), id("FL1"), id("FL2"), id("GL1"), id("GL2")] } } })).toBe(6);
    await exigerInvariants(prisma, {
      type: "TRANSACTIONS",
      ids: [id("PL"), id("PG"), id("FL1"), id("FL2"), id("GL1"), id("GL2")],
    });
  });

  it("V15 — la lecture porte les trois refus", async () => {
    const pl = await lireTransaction(ownerId, id("PL"));
    expect(pl?.refus).toMatchObject({
      suppression: "SUPPRESSION_FILLE_LIEE",
      ventilation: "VENTILATION_FILLE_LIEE",
      deventilation: "VENTILATION_FILLE_LIEE",
    });
    const tm = await lireTransaction(ownerId, id("TM"));
    expect(tm?.refus).toMatchObject({ ventilation: null, deventilation: null });
  });
});

describe("appartenance", () => {
  let utilisateur2Id: string;
  let compteC: string;
  let transactionXU: string;

  beforeAll(async () => {
    // Un second utilisateur n'existe que le temps de ce describe : prisma/test/garde-schema.test.ts compte les utilisateurs.
    utilisateur2Id = (await prisma.user.create({ data: { email: `ventil-u2-${M}@example.test` }, select: { id: true } })).id;
    compteC = (
      await prisma.account.create({
        data: { ownerId: utilisateur2Id, nom: `Ventil C ${M}`, dateSoldeInitial: versDateUtc("2099-01-01"), estBudgetaire: false },
        select: { id: true },
      })
    ).id;
    transactionXU = (
      await prisma.transaction.create({
        data: {
          ownerId: utilisateur2Id,
          accountId: compteC,
          date: versDateUtc("2099-07-30"),
          description: `Etranger ${M}`,
          descriptionNormalisee: normaliserDescription(`Etranger ${M}`),
          montantCents: -500,
          source: "COPIER_COLLER",
          empreinte: `ventilation-XU-${M}`,
        },
        select: { id: true },
      })
    ).id;
  });

  afterAll(async () => {
    await prisma.transaction.deleteMany({ where: { ownerId: utilisateur2Id } });
    await prisma.account.deleteMany({ where: { ownerId: utilisateur2Id } });
    await prisma.user.deleteMany({ where: { id: utilisateur2Id } });
  });

  it("V16 — le propriétaire ne ventile ni ne déventile la transaction d'un autre", async () => {
    expect(await ventilerTransaction(ownerId, transactionXU, [ligne(sousCatCafe, -200), ligne(sousCatCafe, -300)])).toEqual({
      statut: "INTROUVABLE",
    });
    expect(await deventilerTransaction(ownerId, transactionXU)).toEqual({ statut: "INTROUVABLE" });
    const lue = await prisma.transaction.findUniqueOrThrow({
      where: { id: transactionXU },
      select: { estVentilee: true, _count: { select: { lignes: true } } },
    });
    expect(lue).toEqual({ estVentilee: false, _count: { lignes: 0 } });
  });
});
