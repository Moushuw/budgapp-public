// Test d'intégration des écritures sur les transactions — docs/lot-m2.md §6.
// Même mise en place que transactions-lecture.test.ts : schéma `test`,
// marqueur unique, dates en 2099, comptes hors budget, nettoyage complet en
// afterAll. Les cas tournent dans l'ordre du fichier : chacun part de l'état
// laissé par les précédents.

import { randomUUID } from "node:crypto";
import { PrismaClient, type Prisma } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FILTRES_VIDES, resoudreCriteres } from "@/domain/consultation";
import { versDateUtc, depuisDateUtc } from "@/domain/dates";
import { calculerEmpreinte, normaliserDescription, normaliserNom } from "@/domain/ingestion";
import type { SourceIngestion } from "@/domain/referentiel";
import { exigerInvariants } from "../../../prisma/test/invariants";
import {
  apercevoirSuppression,
  creerTransactionManuelle,
  modifierEnMasse,
  modifierTransaction,
  supprimerTransaction,
  type EntreeCreationRepo,
} from "./transactions-ecriture";

const prisma = new PrismaClient();

// Le préfixe en lettre empêche le marqueur d'être un jeton numérique, que
// normaliserDescription couperait.
const M = "X" + randomUUID().replace(/-/g, "").slice(0, 9).toUpperCase();
const CUID_INEXISTANT = "clx0000000000000000099999";

let ownerId: string;
let compteA: string;
let compteB: string;
let sousCatEpicerie: string;
let sousCatCafe: string;
let sousCatRestaurant: string;
let idRegleIga: string;
let tagT1: string;
let tagT2: string;
let payeeLie: string; // PY
let payeeLie2: string; // PY2

const ids: Record<string, string> = {};
const idsFixture: string[] = [];
let idContribution: string | null = null;

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
      empreinte: `ecriture-${d.cle}-${M}`,
      ...d.extra,
    },
    select: { id: true },
  });
  ids[d.cle] = ligne.id;
  idsFixture.push(ligne.id);
  return ligne.id;
}

async function invariants(...cibles: readonly string[]): Promise<void> {
  await exigerInvariants(prisma, { type: "TRANSACTIONS", ids: cibles });
}

async function lire(cle: string) {
  return prisma.transaction.findUniqueOrThrow({
    where: { id: id(cle) },
    select: {
      date: true,
      montantCents: true,
      description: true,
      descriptionNormalisee: true,
      empreinte: true,
      subcategoryId: true,
      appliedRuleId: true,
      payeeId: true,
      details: true,
      aRevoir: true,
      etiquettes: { select: { tagId: true } },
    },
  });
}

async function tags(cle: string): Promise<string[]> {
  const lignes = await prisma.transactionTag.findMany({ where: { transactionId: id(cle) }, select: { tagId: true } });
  return lignes.map((ligne) => ligne.tagId).sort();
}

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
  compteA = await creerCompte(`Ecriture A ${M}`);
  compteB = await creerCompte(`Ecriture B ${M}`);

  const sousCat = async (nom: string) =>
    (await prisma.subcategory.findFirstOrThrow({ where: { nom, category: { ownerId } }, select: { id: true } })).id;
  sousCatEpicerie = await sousCat("Épicerie");
  sousCatCafe = await sousCat("Café");
  sousCatRestaurant = await sousCat("Restaurant");
  idRegleIga = (await prisma.rule.findFirstOrThrow({ where: { ownerId, libelle: "Épicerie IGA" }, select: { id: true } })).id;

  tagT1 = (await prisma.tag.create({ data: { ownerId, nom: `Ecriture T1 ${M}` }, select: { id: true } })).id;
  tagT2 = (await prisma.tag.create({ data: { ownerId, nom: `Ecriture T2 ${M}` }, select: { id: true } })).id;
  payeeLie = (
    await prisma.payee.create({
      data: {
        ownerId,
        nom: `Beneficiaire Ecriture ${M}`,
        nomNormalise: normaliserNom(`Beneficiaire Ecriture ${M}`),
      },
      select: { id: true },
    })
  ).id;
  payeeLie2 = (
    await prisma.payee.create({
      data: {
        ownerId,
        nom: `Beneficiaire Ecriture 2 ${M}`,
        nomNormalise: normaliserNom(`Beneficiaire Ecriture 2 ${M}`),
      },
      select: { id: true },
    })
  ).id;

  await creerLigne(prisma, {
    cle: "IMP",
    accountId: compteA,
    date: "2099-05-10",
    montantCents: -1000,
    source: "COPIER_COLLER",
    description: `Achat Importe ${M}`,
    extra: { subcategoryId: sousCatCafe, appliedRuleId: idRegleIga, etiquettes: { create: { tagId: tagT1 } } },
  });
  await creerLigne(prisma, {
    cle: "MAN",
    accountId: compteA,
    date: "2099-05-11",
    montantCents: -2000,
    source: "MANUELLE",
    description: `Saisie Manuelle ${M}`,
  });

  const paire = async (
    cle1: string,
    cle2: string,
    date: string,
    montant: number,
    source1: SourceIngestion,
    source2: SourceIngestion,
  ): Promise<void> => {
    await prisma.$transaction(async (tx) => {
      await creerLigne(tx, {
        cle: cle1,
        accountId: compteA,
        date,
        montantCents: -montant,
        source: source1,
        description: `Virement ${cle1} ${M}`,
        extra: { transferAccountId: compteB },
      });
      await creerLigne(tx, {
        cle: cle2,
        accountId: compteB,
        date,
        montantCents: montant,
        source: source2,
        description: `Virement ${cle2} ${M}`,
        extra: { transferAccountId: compteA, transferTransactionId: id(cle1) },
      });
      await tx.transaction.update({ where: { id: id(cle1) }, data: { transferTransactionId: id(cle2) } });
    });
  };
  await paire("VM1", "VM2", "2099-05-12", 5000, "MANUELLE", "MANUELLE");
  await paire("VX1", "VX2", "2099-05-13", 3000, "MANUELLE", "COPIER_COLLER");

  const ventile = async (
    cleParent: string,
    cleG1: string,
    cleG2: string,
    date: string,
    total: number,
    source: SourceIngestion,
    montants: readonly [number, number],
    sousCats: readonly [string, string],
  ): Promise<void> => {
    await prisma.$transaction(async (tx) => {
      const description = `Ventile ${cleParent} ${M}`;
      await creerLigne(tx, {
        cle: cleParent,
        accountId: compteA,
        date,
        montantCents: total,
        source,
        description,
        extra: { estVentilee: true },
      });
      await creerLigne(tx, {
        cle: cleG1,
        accountId: compteA,
        date,
        montantCents: montants[0],
        source,
        description,
        extra: { parentId: id(cleParent), subcategoryId: sousCats[0] },
      });
      await creerLigne(tx, {
        cle: cleG2,
        accountId: compteA,
        date,
        montantCents: montants[1],
        source,
        description,
        extra: { parentId: id(cleParent), subcategoryId: sousCats[1] },
      });
    });
  };
  await ventile("P", "F1", "F2", "2099-05-14", -9000, "COPIER_COLLER", [-6000, -3000], [sousCatEpicerie, sousCatCafe]);
  await ventile("PM", "G1", "G2", "2099-05-15", -4000, "MANUELLE", [-1000, -3000], [sousCatCafe, sousCatEpicerie]);

  await creerLigne(prisma, {
    cle: "COT",
    accountId: compteA,
    date: "2099-05-16",
    montantCents: -700,
    source: "MANUELLE",
    description: `Cotisation ${M}`,
  });
  idContribution = (
    await prisma.contributionEntry.create({
      data: { accountId: compteA, transactionId: id("COT"), anneeImputation: 2099, montantCents: 700 },
      select: { id: true },
    })
  ).id;

  await creerLigne(prisma, {
    cle: "D1",
    accountId: compteA,
    date: "2099-05-17",
    montantCents: -100,
    source: "COPIER_COLLER",
    description: `Detail D1 ${M}`,
  });
  await creerLigne(prisma, { cle: "K1", accountId: compteA, date: "2099-05-18", montantCents: -110, source: "COPIER_COLLER", description: `Ligne K1 ${M}` });
  await creerLigne(prisma, { cle: "K2", accountId: compteA, date: "2099-05-18", montantCents: -120, source: "COPIER_COLLER", description: `Ligne K2 ${M}` });
  await creerLigne(prisma, {
    cle: "K3",
    accountId: compteA,
    date: "2099-05-18",
    montantCents: -130,
    source: "COPIER_COLLER",
    description: `Ligne K3 ${M}`,
    extra: { subcategoryId: sousCatRestaurant },
  });

  await invariants(...idsFixture);
});

afterAll(async () => {
  // Les étiquettes de transaction, les cotisations et les filles partent en cascade.
  await prisma.transaction.deleteMany({ where: { id: { in: idsFixture } } });
  await prisma.payee.deleteMany({ where: { ownerId, nomNormalise: { contains: M.toLowerCase() } } });
  await prisma.tag.deleteMany({ where: { id: { in: [tagT1, tagT2] } } });
  await prisma.account.deleteMany({ where: { id: { in: [compteA, compteB] } } });
  await prisma.$disconnect();
});

describe("édition", () => {
  it("1. une sous-catégorie qui change défait la règle appliquée", async () => {
    const r = await modifierTransaction(ownerId, id("IMP"), { subcategoryId: sousCatEpicerie });
    expect(r.statut).toBe("MODIFIEE");
    const ligne = await lire("IMP");
    expect(ligne.subcategoryId).toBe(sousCatEpicerie);
    expect(ligne.appliedRuleId).toBeNull();
    await invariants(id("IMP"));
  });

  it("2. la même valeur n'est pas un changement : la règle reste", async () => {
    await prisma.transaction.update({
      where: { id: id("IMP") },
      data: { subcategoryId: sousCatCafe, appliedRuleId: idRegleIga },
    });
    const r = await modifierTransaction(ownerId, id("IMP"), { subcategoryId: sousCatCafe });
    expect(r.statut).toBe("MODIFIEE");
    expect((await lire("IMP")).appliedRuleId).toBe(idRegleIga);
  });

  it("3. retirer la sous-catégorie remet aussi appliedRuleId à null", async () => {
    const r = await modifierTransaction(ownerId, id("IMP"), { subcategoryId: null });
    expect(r.statut).toBe("MODIFIEE");
    const ligne = await lire("IMP");
    expect(ligne.subcategoryId).toBeNull();
    expect(ligne.appliedRuleId).toBeNull();
    await invariants(id("IMP"));
  });

  it("4. la date d'une importée est refusée", async () => {
    const avant = await lire("IMP");
    expect(await modifierTransaction(ownerId, id("IMP"), { date: "2099-05-20" })).toEqual({
      statut: "REFUS",
      motif: "DATE_HORS_MANUELLE",
    });
    expect(await lire("IMP")).toEqual(avant);
  });

  it("5. le montant d'une importée est refusé", async () => {
    const avant = await lire("IMP");
    expect(await modifierTransaction(ownerId, id("IMP"), { montantCents: -1500 })).toEqual({
      statut: "REFUS",
      motif: "MONTANT_HORS_MANUELLE",
    });
    expect(await lire("IMP")).toEqual(avant);
  });

  it("6. la description change, l'empreinte jamais", async () => {
    const description = `Achat Renomme ${M}`;
    const r = await modifierTransaction(ownerId, id("IMP"), { date: "2099-05-10", description });
    expect(r.statut).toBe("MODIFIEE");
    const ligne = await lire("IMP");
    expect(ligne.description).toBe(description);
    expect(ligne.descriptionNormalisee).toBe(normaliserDescription(description));
    expect(ligne.empreinte).toBe(`ecriture-IMP-${M}`);
    await invariants(id("IMP"));
  });

  it("7. une MANUELLE change de date et de montant, l'empreinte reste", async () => {
    const r = await modifierTransaction(ownerId, id("MAN"), { date: "2099-05-21", montantCents: -2500 });
    expect(r.statut).toBe("MODIFIEE");
    const ligne = await lire("MAN");
    expect(depuisDateUtc(ligne.date)).toBe("2099-05-21");
    expect(ligne.montantCents).toBe(-2500);
    expect(ligne.empreinte).toBe(`ecriture-MAN-${M}`);
    await invariants(id("MAN"));
  });

  it("8. le montant d'un côté de virement change des deux côtés", async () => {
    const r = await modifierTransaction(ownerId, id("VM1"), { montantCents: -6500 });
    expect(r.statut).toBe("MODIFIEE");
    expect((await lire("VM1")).montantCents).toBe(-6500);
    expect((await lire("VM2")).montantCents).toBe(6500);
    await invariants(id("VM1"), id("VM2"));
  });

  it("9. depuis l'autre côté, la contrepartie suit", async () => {
    const r = await modifierTransaction(ownerId, id("VM2"), { montantCents: 100 });
    expect(r.statut).toBe("MODIFIEE");
    expect((await lire("VM2")).montantCents).toBe(100);
    expect((await lire("VM1")).montantCents).toBe(-100);
    await invariants(id("VM1"), id("VM2"));
  });

  it("10. une contrepartie importée interdit le changement de montant", async () => {
    const avant = [await lire("VX1"), await lire("VX2")];
    expect(await modifierTransaction(ownerId, id("VX1"), { montantCents: -3500 })).toEqual({
      statut: "REFUS",
      motif: "MONTANT_CONTREPARTIE_HORS_MANUELLE",
    });
    expect([await lire("VX1"), await lire("VX2")]).toEqual(avant);
  });

  it("11. aucune sous-catégorie sur un virement", async () => {
    expect(await modifierTransaction(ownerId, id("VM1"), { subcategoryId: sousCatCafe })).toEqual({
      statut: "REFUS",
      motif: "SOUS_CATEGORIE_VIREMENT",
    });
  });

  it("12. aucune sous-catégorie sur un parent ventilé", async () => {
    expect(await modifierTransaction(ownerId, id("P"), { subcategoryId: sousCatCafe })).toEqual({
      statut: "REFUS",
      motif: "SOUS_CATEGORIE_PARENT_VENTILE",
    });
  });

  it("13. le montant d'un parent ventilé est refusé", async () => {
    expect(await modifierTransaction(ownerId, id("PM"), { montantCents: -5000 })).toEqual({
      statut: "REFUS",
      motif: "MONTANT_PARENT_VENTILE",
    });
  });

  it("14. le parent ventilé transmet description, date et bénéficiaire à ses filles", async () => {
    const description = `Ventilee Renommee ${M}`;
    const r = await modifierTransaction(ownerId, id("PM"), {
      description,
      date: "2099-05-22",
      beneficiaire: { payeeId: payeeLie, payeeNouveauNom: null },
    });
    expect(r.statut).toBe("MODIFIEE");
    for (const cle of ["G1", "G2"]) {
      const fille = await lire(cle);
      expect(fille.description).toBe(description);
      expect(fille.descriptionNormalisee).toBe(normaliserDescription(description));
      expect(depuisDateUtc(fille.date)).toBe("2099-05-22");
      expect(fille.payeeId).toBe(payeeLie);
    }
    expect((await lire("G1")).montantCents).toBe(-1000);
    expect((await lire("G2")).montantCents).toBe(-3000);
    expect((await lire("G1")).subcategoryId).toBe(sousCatCafe);
    expect((await lire("G2")).subcategoryId).toBe(sousCatEpicerie);
    await invariants(id("PM"), id("G1"), id("G2"));
  });

  it("15. une ligne fille ne se modifie pas ici", async () => {
    expect(await modifierTransaction(ownerId, id("F1"), { note: "x" })).toEqual({ statut: "REFUS", motif: "LIGNE_FILLE" });
  });

  it("16. un bénéficiaire nouveau se crée, puis se réutilise par son nom normalisé", async () => {
    const nom = `Nouveau Benef ${M}`;
    const premier = await modifierTransaction(ownerId, id("MAN"), { beneficiaire: { payeeId: null, payeeNouveauNom: nom } });
    expect(premier).toMatchObject({ statut: "MODIFIEE", beneficiaireCree: true });
    const payeeIdMan = (await lire("MAN")).payeeId;
    expect(payeeIdMan).not.toBeNull();

    const second = await modifierTransaction(ownerId, id("IMP"), {
      beneficiaire: { payeeId: null, payeeNouveauNom: `nouveau  benef ${M.toLowerCase()}` },
    });
    expect(second).toMatchObject({ statut: "MODIFIEE", beneficiaireCree: false });
    expect((await lire("IMP")).payeeId).toBe(payeeIdMan);
    expect(await prisma.payee.count({ where: { ownerId, nomNormalise: normaliserNom(nom) } })).toBe(1);
    await invariants(id("MAN"), id("IMP"));
  });

  it("17. les étiquettes se remplacent par l'ensemble demandé", async () => {
    await modifierTransaction(ownerId, id("MAN"), { tagIds: [tagT1, tagT2] });
    expect(await tags("MAN")).toEqual([tagT1, tagT2].sort());
    await modifierTransaction(ownerId, id("MAN"), { tagIds: [tagT2] });
    expect(await tags("MAN")).toEqual([tagT2]);
    await invariants(id("MAN"));
  });

  it("18. une référence invalide n'écrit rien", async () => {
    const avant = await lire("MAN");
    expect(await modifierTransaction(ownerId, id("MAN"), { subcategoryId: CUID_INEXISTANT })).toEqual({
      statut: "REFERENCE_INVALIDE",
      quoi: "SOUS_CATEGORIE",
    });
    expect(
      await modifierTransaction(ownerId, id("MAN"), { beneficiaire: { payeeId: CUID_INEXISTANT, payeeNouveauNom: null } }),
    ).toEqual({ statut: "REFERENCE_INVALIDE", quoi: "BENEFICIAIRE" });
    expect(await modifierTransaction(ownerId, id("MAN"), { tagIds: [CUID_INEXISTANT] })).toEqual({
      statut: "REFERENCE_INVALIDE",
      quoi: "ETIQUETTE",
    });
    expect(
      await modifierTransaction(ownerId, id("MAN"), { beneficiaire: { payeeId: null, payeeNouveauNom: "́" } }),
    ).toEqual({ statut: "REFERENCE_INVALIDE", quoi: "BENEFICIAIRE_NOUVEAU_VIDE" });
    expect(await lire("MAN")).toEqual(avant);
  });

  it("19. un identifiant inexistant est introuvable", async () => {
    expect(await modifierTransaction(ownerId, CUID_INEXISTANT, { note: "x" })).toEqual({ statut: "INTROUVABLE" });
  });

  it("20. le montant d'une transaction qui porte une cotisation est refusé", async () => {
    expect(await modifierTransaction(ownerId, id("COT"), { montantCents: -800 })).toEqual({
      statut: "REFUS",
      motif: "MONTANT_COTISATION",
    });
  });
});

describe("création", () => {
  const description = `Saisie Neuve ${M}`;
  const entree = (): EntreeCreationRepo => ({
    accountId: compteA,
    date: "2099-06-01",
    description,
    montantCents: -1234,
    payeeId: null,
    payeeNouveauNom: `Benef Neuf ${M}`,
    subcategoryId: sousCatCafe,
    note: "n",
    tagIds: [tagT1],
  });

  async function compteurs(): Promise<{ transactions: number; beneficiaires: number }> {
    return {
      transactions: await prisma.transaction.count({ where: { ownerId, description: { contains: M } } }),
      beneficiaires: await prisma.payee.count({ where: { ownerId, nomNormalise: { contains: M.toLowerCase() } } }),
    };
  }

  it("21. une saisie manuelle écrit tout ce qu'il faut", async () => {
    const r = await creerTransactionManuelle(ownerId, entree());
    expect(r).toMatchObject({ statut: "CREEE", beneficiaireCree: true });
    if (r.statut !== "CREEE") return;
    idsFixture.push(r.id);
    const ligne = await prisma.transaction.findUniqueOrThrow({
      where: { id: r.id },
      select: {
        source: true,
        etat: true,
        descriptionNormalisee: true,
        empreinte: true,
        appliedRuleId: true,
        typeOperation: true,
        details: true,
        aRevoir: true,
        exclureDuBudget: true,
        exclureDesRapports: true,
        etiquettes: { select: { tagId: true } },
      },
    });
    const normalisee = normaliserDescription(description);
    expect(ligne).toMatchObject({
      source: "MANUELLE",
      etat: "COMPTABILISEE",
      descriptionNormalisee: normalisee,
      empreinte: calculerEmpreinte(compteA, "2099-06-01", -1234, normalisee),
      appliedRuleId: null,
      typeOperation: null,
      details: "n",
      aRevoir: false,
      exclureDuBudget: false,
      exclureDesRapports: false,
    });
    expect(ligne.etiquettes.map((e) => e.tagId)).toEqual([tagT1]);
    await invariants(r.id);
  });

  it("22. la même saisie est refusée sans effet de bord", async () => {
    const avant = await compteurs();
    expect(await creerTransactionManuelle(ownerId, entree())).toEqual({ statut: "EMPREINTE_EXISTANTE" });
    expect(await compteurs()).toEqual(avant);
  });

  it("23. un jeton numérique ne distingue pas la description ; un mot, si", async () => {
    expect(await creerTransactionManuelle(ownerId, { ...entree(), description: `${description} 43` })).toEqual({
      statut: "EMPREINTE_EXISTANTE",
    });
    const r = await creerTransactionManuelle(ownerId, { ...entree(), description: `${description} bis` });
    expect(r.statut).toBe("CREEE");
    if (r.statut !== "CREEE") return;
    idsFixture.push(r.id);
    await invariants(r.id);
  });

  it("24. un nom nouveau qui se normalise comme un bénéficiaire existant le réutilise", async () => {
    const r = await creerTransactionManuelle(ownerId, {
      ...entree(),
      description: `${description} ter`,
      payeeNouveauNom: `BENEFICIAIRE  ecriture ${M}`,
    });
    expect(r).toMatchObject({ statut: "CREEE", beneficiaireCree: false });
    if (r.statut !== "CREEE") return;
    idsFixture.push(r.id);
    const ligne = await prisma.transaction.findUniqueOrThrow({ where: { id: r.id }, select: { payeeId: true } });
    expect(ligne.payeeId).toBe(payeeLie);
    await invariants(r.id);
  });

  it("25. un compte inexistant est une référence invalide", async () => {
    expect(await creerTransactionManuelle(ownerId, { ...entree(), accountId: CUID_INEXISTANT })).toEqual({
      statut: "REFERENCE_INVALIDE",
      quoi: "COMPTE",
    });
  });
});

describe("suppression", () => {
  it("26. une ordinaire disparaît", async () => {
    expect(await supprimerTransaction(ownerId, id("D1"), null)).toEqual({
      statut: "SUPPRIMEE",
      lignesVentilationSupprimees: 0,
      contrepartie: null,
    });
    expect(await prisma.transaction.count({ where: { id: id("D1") } })).toBe(0);
    await invariants(id("K1"), id("MAN"), id("COT"), id("PM"), id("G1"), id("G2"));
  });

  it("27. un parent ventilé emporte ses filles", async () => {
    expect(await supprimerTransaction(ownerId, id("P"), null)).toEqual({
      statut: "SUPPRIMEE",
      lignesVentilationSupprimees: 2,
      contrepartie: null,
    });
    expect(await prisma.transaction.count({ where: { id: { in: [id("P"), id("F1"), id("F2")] } } })).toBe(0);
    await invariants(id("K1"), id("MAN"), id("COT"), id("PM"), id("G1"), id("G2"), id("VM1"), id("VM2"));
  });

  it("28. un côté de virement est refusé sans choix", async () => {
    expect(await supprimerTransaction(ownerId, id("VM1"), null)).toEqual({ statut: "REFUS", motif: "SUPPRESSION_VIREMENT" });
    expect(await prisma.transaction.count({ where: { id: { in: [id("VM1"), id("VM2")] } } })).toBe(2);
    await invariants(id("VM1"), id("VM2"));
  });

  it("29. une transaction rattachée à une cotisation est refusée", async () => {
    expect(await supprimerTransaction(ownerId, id("COT"), null)).toEqual({ statut: "REFUS", motif: "SUPPRESSION_LIEE" });
    expect(await prisma.transaction.count({ where: { id: id("COT") } })).toBe(1);
    expect(await prisma.contributionEntry.count({ where: { id: idContribution ?? "" } })).toBe(1);
  });

  it("30. une ligne fille ne se supprime pas seule", async () => {
    expect(await supprimerTransaction(ownerId, id("G1"), null)).toEqual({ statut: "REFUS", motif: "LIGNE_FILLE" });
  });
});

describe("masse", () => {
  it("31. une sous-catégorie en masse : écrites, inchangées, ignorées par raison", async () => {
    const avantK3 = await lire("K3");
    const r = await modifierEnMasse(
      ownerId,
      { type: "IDS", ids: [id("K1"), id("K2"), id("K3"), id("VX1"), id("PM"), id("G1"), CUID_INEXISTANT] },
      { type: "SOUS_CATEGORIE", subcategoryId: sousCatRestaurant },
    );
    expect(r.statut).toBe("APPLIQUE");
    if (r.statut !== "APPLIQUE") return;
    expect(r.compteRendu.traitees).toBe(2);
    expect(r.compteRendu.inchangees).toBe(1);
    expect(r.compteRendu.ignorees).toEqual({
      VIREMENT: 1,
      VENTILEE: 1,
      LIGNE_FILLE: 1,
      INTROUVABLE: 1,
      LIEE: 0,
      CONTREPARTIE_LIEE: 0,
    });
    for (const cle of ["K1", "K2"]) {
      const ligne = await lire(cle);
      expect(ligne.subcategoryId).toBe(sousCatRestaurant);
      expect(ligne.appliedRuleId).toBeNull();
    }
    expect((await lire("G1")).subcategoryId).toBe(sousCatCafe);
    expect((await lire("PM")).subcategoryId).toBeNull();
    expect((await lire("VX1")).subcategoryId).toBeNull();
    const apresK3 = await lire("K3");
    expect(apresK3.subcategoryId).toBe(sousCatRestaurant);
    expect(apresK3).toEqual(avantK3);
    await invariants(id("K1"), id("K2"), id("K3"), id("VX1"), id("PM"), id("G1"));
  });

  it("32. un bénéficiaire en masse : un virement et une ventilée sont éligibles", async () => {
    const r = await modifierEnMasse(
      ownerId,
      { type: "IDS", ids: [id("K2"), id("VM1"), id("PM")] },
      { type: "BENEFICIAIRE", payeeId: payeeLie2 },
    );
    expect(r.statut).toBe("APPLIQUE");
    if (r.statut !== "APPLIQUE") return;
    expect(r.compteRendu.traitees).toBe(3);
    expect(r.compteRendu.inchangees).toBe(0);
    for (const cle of ["K2", "VM1", "PM", "G1", "G2"]) {
      expect((await lire(cle)).payeeId).toBe(payeeLie2);
    }
    await invariants(id("K2"), id("VM1"), id("VM2"), id("PM"), id("G1"), id("G2"));
  });

  it("33. des étiquettes ajoutées puis retirées sur tout un compte", async () => {
    const criteres = resoudreCriteres({ ...FILTRES_VIDES, comptes: [compteB] }, { type: "TOUT", mois: "2099-05" });
    const ajout = await modifierEnMasse(ownerId, { type: "CRITERES", criteres }, { type: "ETIQUETTES", ajouter: [tagT1], retirer: [] });
    expect(ajout).toMatchObject({ statut: "APPLIQUE", compteRendu: { traitees: 2 } });
    expect(await tags("VM2")).toContain(tagT1);
    expect(await tags("VX2")).toContain(tagT1);
    const retrait = await modifierEnMasse(ownerId, { type: "CRITERES", criteres }, { type: "ETIQUETTES", ajouter: [], retirer: [tagT1] });
    expect(retrait).toMatchObject({ statut: "APPLIQUE", compteRendu: { traitees: 2 } });
    expect(await tags("VM2")).not.toContain(tagT1);
    expect(await tags("VX2")).not.toContain(tagT1);
    await invariants(id("VM1"), id("VM2"), id("VX1"), id("VX2"));
  });

  it("34. un drapeau déjà posé est compté inchangé", async () => {
    const selection = { type: "IDS", ids: [id("K2"), id("K3")] } as const;
    const geste = { type: "A_REVOIR", valeur: true } as const;
    expect(await modifierEnMasse(ownerId, selection, geste)).toMatchObject({
      statut: "APPLIQUE",
      compteRendu: { traitees: 2 },
    });
    expect(await modifierEnMasse(ownerId, selection, geste)).toMatchObject({
      statut: "APPLIQUE",
      compteRendu: { traitees: 0, inchangees: 2 },
    });
    expect((await lire("K2")).aRevoir).toBe(true);
    expect((await lire("K3")).aRevoir).toBe(true);
    await invariants(id("K2"), id("K3"));
  });

  it("35. une sélection au-delà de la limite est refusée en entier", async () => {
    const instantane = async () =>
      (
        await prisma.transaction.findMany({
          where: { accountId: compteA, parentId: null },
          select: { id: true, subcategoryId: true, aRevoir: true, exclureDuBudget: true, exclureDesRapports: true, etiquettes: { select: { tagId: true } } },
          orderBy: { id: "asc" },
        })
      ).map((ligne) => ({ ...ligne, etiquettes: ligne.etiquettes.map((e) => e.tagId).sort() }));
    const avant = await instantane();
    const criteres = resoudreCriteres({ ...FILTRES_VIDES, comptes: [compteA] }, { type: "TOUT", mois: "2099-05" });
    expect(
      await modifierEnMasse(ownerId, { type: "CRITERES", criteres }, { type: "A_REVOIR", valeur: true }, 3),
    ).toEqual({ statut: "DEPASSEMENT" });
    expect(await instantane()).toEqual(avant);
  });

  it("36. une sous-catégorie inexistante n'écrit rien", async () => {
    expect(
      await modifierEnMasse(ownerId, { type: "IDS", ids: [id("K1")] }, { type: "SOUS_CATEGORIE", subcategoryId: CUID_INEXISTANT }),
    ).toEqual({ statut: "REFERENCE_INVALIDE", quoi: "SOUS_CATEGORIE" });
  });

  it("37. l'aperçu d'une suppression ne supprime rien", async () => {
    const r = await apercevoirSuppression(ownerId, { type: "IDS", ids: [id("K1"), id("PM"), id("VX1"), id("COT")] });
    expect(r.statut).toBe("APERCU");
    if (r.statut !== "APERCU") return;
    expect(r.apercus.sansChoix).toEqual({
      aSupprimer: 2,
      parentsVentiles: 1,
      lignesVentilation: 2,
      ignorees: { VIREMENT: 1, LIEE: 1, VENTILEE: 0, LIGNE_FILLE: 0, CONTREPARTIE_LIEE: 0, INTROUVABLE: 0 },
      cotesVirement: 0,
      contrepartiesSupprimees: 0,
      contrepartiesDeliees: 0,
    });
    expect(await prisma.transaction.count({ where: { id: { in: [id("K1"), id("PM"), id("VX1"), id("COT")] } } })).toBe(4);
  });

  it("38. la suppression en masse emporte les filles et épargne virements et rattachées", async () => {
    const r = await modifierEnMasse(
      ownerId,
      { type: "IDS", ids: [id("K1"), id("PM"), id("VX1"), id("COT")] },
      { type: "SUPPRIMER", virements: null },
    );
    expect(r.statut).toBe("APPLIQUE");
    if (r.statut !== "APPLIQUE") return;
    expect(r.compteRendu.traitees).toBe(2);
    expect(r.compteRendu.lignesVentilationSupprimees).toBe(2);
    expect(r.compteRendu.ignorees).toEqual({
      VIREMENT: 1,
      LIEE: 1,
      VENTILEE: 0,
      LIGNE_FILLE: 0,
      CONTREPARTIE_LIEE: 0,
      INTROUVABLE: 0,
    });
    expect(await prisma.transaction.count({ where: { id: { in: [id("K1"), id("PM"), id("G1"), id("G2")] } } })).toBe(0);
    expect(await prisma.transaction.count({ where: { id: { in: [id("VX1"), id("COT")] } } })).toBe(2);
    await invariants(id("VX1"), id("VX2"), id("COT"));
  });
});

describe("appartenance", () => {
  let utilisateur2Id: string;
  let compteC: string;
  let transactionXU: string;

  beforeAll(async () => {
    // Un second utilisateur n'existe que le temps de ce describe : prisma/test/garde-schema.test.ts compte les utilisateurs.
    utilisateur2Id = (await prisma.user.create({ data: { email: `ecriture-u2-${M}@example.test` }, select: { id: true } })).id;
    compteC = (
      await prisma.account.create({
        data: { ownerId: utilisateur2Id, nom: `Ecriture C ${M}`, dateSoldeInitial: versDateUtc("2099-01-01"), estBudgetaire: false },
        select: { id: true },
      })
    ).id;
    transactionXU = (
      await prisma.transaction.create({
        data: {
          ownerId: utilisateur2Id,
          accountId: compteC,
          date: versDateUtc("2099-05-30"),
          description: `Etranger ${M}`,
          descriptionNormalisee: normaliserDescription(`Etranger ${M}`),
          montantCents: -500,
          source: "COPIER_COLLER",
          empreinte: `ecriture-XU-${M}`,
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

  async function etatXU() {
    return prisma.transaction.findUniqueOrThrow({
      where: { id: transactionXU },
      select: { details: true, aRevoir: true, subcategoryId: true },
    });
  }

  it("39. le propriétaire ne modifie ni ne supprime la transaction d'un autre", async () => {
    const avant = await etatXU();
    expect(await modifierTransaction(ownerId, transactionXU, { note: "x" })).toEqual({ statut: "INTROUVABLE" });
    expect(await supprimerTransaction(ownerId, transactionXU, null)).toEqual({ statut: "INTROUVABLE" });
    expect(await etatXU()).toEqual(avant);
  });

  it("40. la masse range la transaction d'un autre parmi les introuvables", async () => {
    const avant = await etatXU();
    const r = await modifierEnMasse(ownerId, { type: "IDS", ids: [transactionXU] }, { type: "A_REVOIR", valeur: true });
    expect(r).toMatchObject({ statut: "APPLIQUE", compteRendu: { traitees: 0, ignorees: { INTROUVABLE: 1 } } });
    expect(await etatXU()).toEqual(avant);
  });

  it("41. une saisie sur le compte d'un autre est une référence invalide", async () => {
    const r = await creerTransactionManuelle(ownerId, {
      accountId: compteC,
      date: "2099-06-02",
      description: `Intrus ${M}`,
      montantCents: -100,
      payeeId: null,
      payeeNouveauNom: null,
      subcategoryId: null,
      note: null,
      tagIds: [],
    });
    expect(r).toEqual({ statut: "REFERENCE_INVALIDE", quoi: "COMPTE" });
  });
});
