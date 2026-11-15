// Test d'intégration des virements — docs/lot-m2.md §4.4. Même mise en place que
// transactions-ventilation.test.ts : schéma `test`, marqueur unique, dates en 2099, comptes hors budget, nettoyage
// complet en afterAll. Chaque cas crée ses propres lignes (montants distincts d'un cas à l'autre : les candidats se
// cherchent par montant opposé, et d'autres fichiers écrivent dans le même schéma en parallèle).

import { randomUUID } from "node:crypto";
import { PrismaClient, type Prisma } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FILTRES_VIDES, resoudreCriteres, TRI_PAR_DEFAUT } from "@/domain/consultation";
import { versDateUtc } from "@/domain/dates";
import { IGNOREES_VIDES, type PartitionMasse } from "@/domain/edition";
import { normaliserDescription, normaliserNom } from "@/domain/ingestion";
import { empreinteContrepartie } from "@/domain/virement/empreinte";
import { exigerInvariants, verifierInvariants } from "../../../prisma/test/invariants";
import { ordreBase, tenirVerrou } from "../../../prisma/test/verrou-tenu";
import { appliquerModifications } from "./transactions";
import { lireCandidatsVirement, listerTransactions, lireTransaction } from "./transactions-lecture";
import { CourseVirement } from "./course-virement";
import {
  apercevoirSuppression,
  creerContrepartie,
  delierVirement,
  ecrireGeste,
  ecrireSuppression,
  lierVirement,
  modifierEnMasse,
  saisirVirement,
  supprimerTransaction,
  ventilerTransaction,
} from "./transactions-ecriture";

const prisma = new PrismaClient();

const M = "X" + randomUUID().replace(/-/g, "").slice(0, 9).toUpperCase();
const CUID_INEXISTANT = "clx0000000000000000099999";

let ownerId: string;
let compte1: string;
let compte2: string;
let compte3: string;
let nomCompte1: string;
let nomCompte2: string;
let sousCatEpicerie: string;
let sousCatCafe: string;
let idRegleIga: string;
let tagTA: string;
let compteEtranger: string;
let utilisateur2Id: string;
const goalIds: string[] = [];
let compteurLigne = 0;

async function ligne(
  accountId: string,
  date: string,
  montantCents: number,
  extra: Partial<Prisma.TransactionUncheckedCreateInput> = {},
  source: "MANUELLE" | "COPIER_COLLER" = "MANUELLE",
): Promise<string> {
  compteurLigne += 1;
  const description = `Vir ${String(compteurLigne)} ${M}`;
  const creee = await prisma.transaction.create({
    data: {
      ownerId,
      accountId,
      date: versDateUtc(date),
      description,
      descriptionNormalisee: normaliserDescription(description),
      montantCents,
      source,
      empreinte: `virement-${String(compteurLigne)}-${M}`,
      ...extra,
    },
    select: { id: true },
  });
  return creee.id;
}

async function lue(id: string) {
  return prisma.transaction.findUnique({
    where: { id },
    select: {
      id: true,
      accountId: true,
      date: true,
      montantCents: true,
      description: true,
      source: true,
      etat: true,
      empreinte: true,
      subcategoryId: true,
      appliedRuleId: true,
      payeeId: true,
      details: true,
      transferTransactionId: true,
      transferAccountId: true,
      etiquettes: { select: { tagId: true } },
    },
  });
}

async function lueOuEchoue(id: string) {
  const l = await lue(id);
  if (l === null) {
    throw new Error(`transaction absente : ${id}`);
  }
  return l;
}

async function invariants(...ids: readonly string[]): Promise<void> {
  await exigerInvariants(prisma, { type: "TRANSACTIONS", ids });
}

/** Une paire déjà liée, par le geste lui-même. */
async function paire(date: string, montantCents: number): Promise<{ a: string; b: string }> {
  const a = await ligne(compte1, date, montantCents);
  const b = await ligne(compte2, date, -montantCents);
  const r = await lierVirement(ownerId, a, b);
  expect(r.statut).toBe("LIEE");
  return { a, b };
}

const lignesVentilation = (...montants: readonly number[]) =>
  montants.map((montantCents, i) => ({
    subcategoryId: i % 2 === 0 ? sousCatEpicerie : sousCatCafe,
    montantCents,
    note: null,
    tagIds: [] as readonly string[],
  }));

beforeAll(async () => {
  const proprietaire = await prisma.user.findFirstOrThrow({ orderBy: { createdAt: "asc" } });
  ownerId = proprietaire.id;

  const creerCompte = async (nom: string, proprio: string = ownerId) =>
    (
      await prisma.account.create({
        data: { ownerId: proprio, nom, dateSoldeInitial: versDateUtc("2099-01-01"), estBudgetaire: false },
        select: { id: true },
      })
    ).id;
  nomCompte1 = `Vir C1 ${M}`;
  nomCompte2 = `Vir C2 ${M}`;
  compte1 = await creerCompte(nomCompte1);
  compte2 = await creerCompte(nomCompte2);
  compte3 = await creerCompte(`Vir C3 ${M}`);

  const sousCat = async (nom: string) =>
    (await prisma.subcategory.findFirstOrThrow({ where: { nom, category: { ownerId } }, select: { id: true } })).id;
  sousCatEpicerie = await sousCat("Épicerie");
  sousCatCafe = await sousCat("Café");
  idRegleIga = (await prisma.rule.findFirstOrThrow({ where: { ownerId, libelle: "Épicerie IGA" }, select: { id: true } })).id;
  tagTA = (await prisma.tag.create({ data: { ownerId, nom: `Vir TA ${M}` }, select: { id: true } })).id;

  // Un second utilisateur n'existe que le temps de ce fichier : prisma/test/garde-schema.test.ts compte les utilisateurs.
  utilisateur2Id = (await prisma.user.create({ data: { email: `vir-u2-${M}@example.test` }, select: { id: true } })).id;
  compteEtranger = await creerCompte(`Vir Etranger ${M}`, utilisateur2Id);
});

afterAll(async () => {
  const comptes = [compte1, compte2, compte3, compteEtranger];
  // Délier d'abord : le pointeur est une clé étrangère, et la suppression d'un côté ne doit rien laisser d'orphelin.
  await prisma.transaction.updateMany({
    where: { accountId: { in: comptes } },
    data: { transferTransactionId: null, transferAccountId: null },
  });
  await prisma.transaction.deleteMany({ where: { accountId: { in: comptes } } });
  await prisma.goal.deleteMany({ where: { id: { in: goalIds } } });
  await prisma.payee.deleteMany({ where: { ownerId, nom: { contains: M } } });
  await prisma.tag.deleteMany({ where: { id: tagTA } });
  await prisma.account.deleteMany({ where: { id: { in: comptes } } });
  await prisma.user.deleteMany({ where: { id: utilisateur2Id } });
  await prisma.$disconnect();
});

describe("lier", () => {
  it("VI1 — nominal : pointeurs croisés, sous-catégories et règles retirées des deux côtés", async () => {
    const a = await ligne(compte1, "2099-10-01", -2501, { subcategoryId: sousCatCafe, appliedRuleId: idRegleIga });
    const b = await ligne(compte2, "2099-10-03", 2501, { subcategoryId: sousCatEpicerie });
    const resultat = await lierVirement(ownerId, a, b);
    expect(resultat).toEqual({ statut: "LIEE", id: a, contrepartieId: b, sousCategoriesRetirees: 2 });

    const la = await lueOuEchoue(a);
    const lb = await lueOuEchoue(b);
    expect(la).toMatchObject({ transferTransactionId: b, transferAccountId: compte2, subcategoryId: null, appliedRuleId: null });
    expect(lb).toMatchObject({ transferTransactionId: a, transferAccountId: compte1, subcategoryId: null, appliedRuleId: null });
    // Les montants ne bougent pas.
    expect([la.montantCents, lb.montantCents]).toEqual([-2501, 2501]);
    await invariants(a, b);
  });

  it("VI1 — un seul côté catégorisé : sousCategoriesRetirees vaut 1 ; aucun : 0", async () => {
    const a = await ligne(compte1, "2099-10-01", -2502, { subcategoryId: sousCatCafe });
    const b = await ligne(compte2, "2099-10-01", 2502);
    expect(await lierVirement(ownerId, a, b)).toMatchObject({ statut: "LIEE", sousCategoriesRetirees: 1 });
    const c = await ligne(compte1, "2099-10-01", -2503);
    const d = await ligne(compte2, "2099-10-01", 2503);
    expect(await lierVirement(ownerId, c, d)).toMatchObject({ statut: "LIEE", sousCategoriesRetirees: 0 });
    await invariants(a, b, c, d);
  });

  it("VI1 — un écart de 5 jours est dans la fenêtre, avec ou sans traversée de mois", async () => {
    const a = await ligne(compte1, "2099-10-29", -2504);
    const b = await ligne(compte2, "2099-11-03", 2504);
    expect((await lierVirement(ownerId, a, b)).statut).toBe("LIEE");
    await invariants(a, b);
  });

  it("VI2 — l'autre côté déjà lié : INCOMPATIBLE DEJA_LIEE SECONDE, la première ligne est inchangée", async () => {
    const b = await ligne(compte2, "2099-10-05", 3101);
    const c = await ligne(compte3, "2099-10-05", -3101);
    expect((await lierVirement(ownerId, b, c)).statut).toBe("LIEE");
    const a = await ligne(compte1, "2099-10-05", -3101, { subcategoryId: sousCatCafe });

    const resultat = await lierVirement(ownerId, a, b);
    expect(resultat).toEqual({ statut: "INCOMPATIBLE", refus: { motif: "DEJA_LIEE", cote: "SECONDE" } });
    expect(await lueOuEchoue(a)).toMatchObject({ transferTransactionId: null, transferAccountId: null, subcategoryId: sousCatCafe });
    expect((await lueOuEchoue(b)).transferTransactionId).toBe(c);
    await invariants(a, b, c);
  });

  // Les id sont fixés pour forcer l'ordre croissant que lierVirement suit : le cas « a < b et c < b » est celui qui
  // échouait en P2002 ou en interblocage avant le verrou préalable. Les préfixes diffèrent par leur deuxième lettre,
  // après le « c » qui garde des cuid valides, pour que l'ordre de JavaScript et celui de la base s'accordent quelle
  // que soit la collation : prisma/seed.test.ts lit toutes les transactions du schéma partagé.
  const ORDRES_VI3 = [
    { nom: "a < b et c < b", prefixes: { a: "a", c: "b", b: "d" } },
    { nom: "a < b < c", prefixes: { a: "a", b: "b", c: "c" } },
  ] as const;
  for (const ordre of ORDRES_VI3) {
    it(`VI3 — course : deux liaisons concurrentes vers le même côté, une seule gagne (${ordre.nom})`, async () => {
      for (let essai = 0; essai < 5; essai += 1) {
        const suffixe = `${ordre.prefixes.a}${ordre.prefixes.b}${ordre.prefixes.c}${String(essai)}${M}`;
        const a = await ligne(compte1, "2099-10-06", -4101, { id: `c${ordre.prefixes.a}${suffixe}` });
        const b = await ligne(compte2, "2099-10-06", 4101, { id: `c${ordre.prefixes.b}${suffixe}` });
        const c = await ligne(compte3, "2099-10-06", -4101, { id: `c${ordre.prefixes.c}${suffixe}` });
        const [r1, r2] = await Promise.all([lierVirement(ownerId, a, b), lierVirement(ownerId, c, b)]);

        const gagnantes = [r1, r2].filter((r) => r.statut === "LIEE");
        expect(gagnantes).toHaveLength(1);
        const perdante = [r1, r2].find((r) => r.statut !== "LIEE");
        const motifAdmis =
          perdante?.statut === "CONFLIT" ||
          (perdante?.statut === "INCOMPATIBLE" && perdante.refus.motif === "DEJA_LIEE");
        expect(motifAdmis).toBe(true);

        const lb = await lueOuEchoue(b);
        const partenaire = lb.transferTransactionId;
        expect([a, c]).toContain(partenaire);
        const perdant = partenaire === a ? c : a;
        expect(await lueOuEchoue(perdant)).toMatchObject({ transferTransactionId: null, transferAccountId: null });
        await invariants(a, b, c);
      }
    });
  }

  it("VI4 — même compte : INCOMPATIBLE MEME_COMPTE", async () => {
    const a = await ligne(compte1, "2099-10-07", -4201);
    const b = await ligne(compte1, "2099-10-07", 4201);
    expect(await lierVirement(ownerId, a, b)).toEqual({ statut: "INCOMPATIBLE", refus: { motif: "MEME_COMPTE" } });
    expect(await lueOuEchoue(a)).toMatchObject({ transferTransactionId: null });
  });

  it("VI4 — 6 jours : HORS_FENETRE, dans les deux sens", async () => {
    const a = await ligne(compte1, "2099-10-07", -4202);
    const b = await ligne(compte2, "2099-10-13", 4202);
    expect(await lierVirement(ownerId, a, b)).toEqual({ statut: "INCOMPATIBLE", refus: { motif: "HORS_FENETRE", ecartJours: 6 } });
    expect(await lierVirement(ownerId, b, a)).toEqual({ statut: "INCOMPATIBLE", refus: { motif: "HORS_FENETRE", ecartJours: 6 } });
  });

  it("VI4 — montants qui ne s'annulent pas : INCOMPATIBLE MONTANT_NON_OPPOSE avec la somme", async () => {
    const a = await ligne(compte1, "2099-10-07", -4203);
    const b = await ligne(compte2, "2099-10-07", 4202);
    expect(await lierVirement(ownerId, a, b)).toEqual({
      statut: "INCOMPATIBLE",
      refus: { motif: "MONTANT_NON_OPPOSE", sommeCents: -1 },
    });
  });

  it("VI4 — une transaction à 0,00 $ : REFUS VIREMENT_MONTANT_NUL", async () => {
    const a = await ligne(compte1, "2099-10-07", 0);
    const b = await ligne(compte2, "2099-10-07", 0);
    expect(await lierVirement(ownerId, a, b)).toEqual({ statut: "REFUS", motif: "VIREMENT_MONTANT_NUL" });
  });

  it("VI4 — parent ventilé : REFUS VIREMENT_VENTILEE (première) ou INCOMPATIBLE VENTILEE SECONDE", async () => {
    const parent = await ligne(compte1, "2099-10-08", -4301);
    expect((await ventilerTransaction(ownerId, parent, lignesVentilation(-2000, -2301))).statut).toBe("VENTILEE");
    const autre = await ligne(compte2, "2099-10-08", 4301);
    expect(await lierVirement(ownerId, parent, autre)).toEqual({ statut: "REFUS", motif: "VIREMENT_VENTILEE" });
    expect(await lierVirement(ownerId, autre, parent)).toEqual({
      statut: "INCOMPATIBLE",
      refus: { motif: "VENTILEE", cote: "SECONDE" },
    });
    expect(await lueOuEchoue(autre)).toMatchObject({ transferTransactionId: null });
    const filles = await prisma.transaction.findMany({ where: { parentId: parent }, select: { id: true } });
    await invariants(parent, autre, ...filles.map((f) => f.id));
  });

  it("VI4 — une ligne fille : REFUS LIGNE_FILLE", async () => {
    const parent = await ligne(compte1, "2099-10-08", -4302);
    await ventilerTransaction(ownerId, parent, lignesVentilation(-2000, -2302));
    const fille = await prisma.transaction.findFirstOrThrow({ where: { parentId: parent }, select: { id: true, montantCents: true } });
    const autre = await ligne(compte2, "2099-10-08", -fille.montantCents);
    expect(await lierVirement(ownerId, fille.id, autre)).toEqual({ statut: "REFUS", motif: "LIGNE_FILLE" });
  });

  it("VI4 — l'id d'un autre propriétaire, d'un côté ou de l'autre, ou un id inexistant : INTROUVABLE", async () => {
    const a = await ligne(compte1, "2099-10-09", -4401);
    const etrangere = (
      await prisma.transaction.create({
        data: {
          ownerId: utilisateur2Id,
          accountId: compteEtranger,
          date: versDateUtc("2099-10-09"),
          description: `Etranger ${M} 1`,
          descriptionNormalisee: normaliserDescription(`Etranger ${M} 1`),
          montantCents: 4401,
          source: "MANUELLE",
          empreinte: `virement-etranger-1-${M}`,
        },
        select: { id: true },
      })
    ).id;
    expect(await lierVirement(ownerId, a, etrangere)).toEqual({ statut: "INTROUVABLE" });
    expect(await lierVirement(ownerId, etrangere, a)).toEqual({ statut: "INTROUVABLE" });
    expect(await lierVirement(ownerId, a, CUID_INEXISTANT)).toEqual({ statut: "INTROUVABLE" });
    expect(await lueOuEchoue(a)).toMatchObject({ transferTransactionId: null });
    expect(await lueOuEchoue(etrangere)).toMatchObject({ transferTransactionId: null });
  });

  it("VI4 — une transaction ne se lie pas à elle-même", async () => {
    const a = await ligne(compte1, "2099-10-09", -4402);
    expect(await lierVirement(ownerId, a, a)).toEqual({ statut: "INCOMPATIBLE", refus: { motif: "MEME_TRANSACTION" } });
  });
});

describe("délier", () => {
  it("VI5 — pointeurs à null des deux côtés, transferAccountId compris, aucune sous-catégorie restaurée", async () => {
    const a = await ligne(compte1, "2099-10-10", -5101, { subcategoryId: sousCatCafe });
    const b = await ligne(compte2, "2099-10-10", 5101);
    await lierVirement(ownerId, a, b);
    expect(await lueOuEchoue(a)).toMatchObject({ subcategoryId: null });

    expect(await delierVirement(ownerId, a)).toEqual({ statut: "DELIEE", id: a, contrepartieId: b });
    for (const id of [a, b]) {
      expect(await lueOuEchoue(id)).toMatchObject({ transferTransactionId: null, transferAccountId: null, subcategoryId: null });
    }
    await invariants(a, b);
  });

  it("VI5 — délier depuis l'autre côté marche aussi, et on peut relier ensuite", async () => {
    const { a, b } = await paire("2099-10-10", -5102);
    expect(await delierVirement(ownerId, b)).toEqual({ statut: "DELIEE", id: b, contrepartieId: a });
    expect((await lierVirement(ownerId, a, b)).statut).toBe("LIEE");
    await invariants(a, b);
  });

  it("VI5 — délier une ligne ordinaire : REFUS NON_VIREMENT ; ligne absente ou étrangère : INTROUVABLE", async () => {
    const a = await ligne(compte1, "2099-10-10", -5103);
    expect(await delierVirement(ownerId, a)).toEqual({ statut: "REFUS", motif: "NON_VIREMENT" });
    expect(await delierVirement(ownerId, CUID_INEXISTANT)).toEqual({ statut: "INTROUVABLE" });
  });

  it("VI6 — un côté porte une cotisation : REFUS VIREMENT_COTISATION, depuis chaque côté, rien ne bouge", async () => {
    const { a, b } = await paire("2099-10-11", -5201);
    await prisma.contributionEntry.create({ data: { accountId: compte1, transactionId: a, anneeImputation: 2099, montantCents: 5201 } });
    expect(await delierVirement(ownerId, a)).toEqual({ statut: "REFUS", motif: "VIREMENT_COTISATION" });
    expect(await delierVirement(ownerId, b)).toEqual({ statut: "REFUS", motif: "VIREMENT_COTISATION" });
    expect((await lueOuEchoue(a)).transferTransactionId).toBe(b);
    expect((await lueOuEchoue(b)).transferTransactionId).toBe(a);
    await invariants(a, b);
  });
});

describe("créer la contrepartie", () => {
  it("VI7 — nominal : même date, montant opposé, MANUELLE, description, empreinte, liée ; sous-catégorie retirée", async () => {
    const a = await ligne(compte1, "2099-10-12", -6201, { subcategoryId: sousCatCafe, appliedRuleId: idRegleIga });
    const resultat = await creerContrepartie(ownerId, a, compte2);
    expect(resultat.statut).toBe("CREEE");
    if (resultat.statut !== "CREEE") {
      return;
    }
    expect(resultat).toMatchObject({ id: a, sousCategorieRetiree: true });
    const c = await lueOuEchoue(resultat.contrepartieId);
    const la = await lueOuEchoue(a);
    expect(c).toMatchObject({
      accountId: compte2,
      montantCents: 6201,
      source: "MANUELLE",
      etat: "COMPTABILISEE",
      description: `Virement depuis ${nomCompte1}`,
      empreinte: empreinteContrepartie(a),
      payeeId: null,
      details: null,
      subcategoryId: null,
      appliedRuleId: null,
      transferTransactionId: a,
      transferAccountId: compte1,
    });
    expect(c.date).toEqual(la.date);
    expect(c.etiquettes).toEqual([]);
    expect(la).toMatchObject({ transferTransactionId: c.id, transferAccountId: compte2, subcategoryId: null, appliedRuleId: null });
    await invariants(a, c.id);
  });

  it("VI7 — source positive : « Virement vers », montant négatif ; sans sous-catégorie : sousCategorieRetiree faux", async () => {
    const a = await ligne(compte1, "2099-10-12", 6202);
    const resultat = await creerContrepartie(ownerId, a, compte2);
    expect(resultat).toMatchObject({ statut: "CREEE", sousCategorieRetiree: false });
    if (resultat.statut !== "CREEE") {
      return;
    }
    expect(await lueOuEchoue(resultat.contrepartieId)).toMatchObject({
      montantCents: -6202,
      description: `Virement vers ${nomCompte1}`,
    });
    await invariants(a, resultat.contrepartieId);
  });

  it("VI8 — destination = compte de la source : INCOMPATIBLE MEME_COMPTE, rien créé", async () => {
    const a = await ligne(compte1, "2099-10-12", -6301);
    const avant = await prisma.transaction.count({ where: { accountId: { in: [compte1, compte2, compte3] } } });
    expect(await creerContrepartie(ownerId, a, compte1)).toEqual({ statut: "INCOMPATIBLE", refus: { motif: "MEME_COMPTE" } });
    expect(await prisma.transaction.count({ where: { accountId: { in: [compte1, compte2, compte3] } } })).toBe(avant);
  });

  it("VI8 — compte d'un autre propriétaire ou inexistant : REFERENCE_INVALIDE", async () => {
    const a = await ligne(compte1, "2099-10-12", -6302);
    expect(await creerContrepartie(ownerId, a, compteEtranger)).toEqual({ statut: "REFERENCE_INVALIDE", quoi: "COMPTE" });
    expect(await creerContrepartie(ownerId, a, CUID_INEXISTANT)).toEqual({ statut: "REFERENCE_INVALIDE", quoi: "COMPTE" });
    expect(await lueOuEchoue(a)).toMatchObject({ transferTransactionId: null });
  });

  it("VI8 — source déjà virement : REFUS VIREMENT_DEJA_LIE ; 0,00 $ : REFUS VIREMENT_MONTANT_NUL ; absente : INTROUVABLE", async () => {
    const { a } = await paire("2099-10-12", -6303);
    expect(await creerContrepartie(ownerId, a, compte3)).toEqual({ statut: "REFUS", motif: "VIREMENT_DEJA_LIE" });
    const zero = await ligne(compte1, "2099-10-12", 0);
    expect(await creerContrepartie(ownerId, zero, compte2)).toEqual({ statut: "REFUS", motif: "VIREMENT_MONTANT_NUL" });
    expect(await creerContrepartie(ownerId, CUID_INEXISTANT, compte2)).toEqual({ statut: "INTROUVABLE" });
  });

  it("VI9 — recréer après délier : CONTREPARTIE_EXISTANTE, avec l'id, le compte et la date de la première ; rien de plus créé", async () => {
    const a = await ligne(compte1, "2099-10-14", -6401);
    const premiere = await creerContrepartie(ownerId, a, compte2);
    expect(premiere.statut).toBe("CREEE");
    if (premiere.statut !== "CREEE") {
      return;
    }
    expect((await delierVirement(ownerId, a)).statut).toBe("DELIEE");
    const avant = await prisma.transaction.count({ where: { accountId: { in: [compte1, compte2, compte3] } } });

    expect(await creerContrepartie(ownerId, a, compte2)).toEqual({
      statut: "CONTREPARTIE_EXISTANTE",
      existante: { id: premiere.contrepartieId, compteNom: nomCompte2, date: "2099-10-14" },
    });
    // Même refus vers un autre compte : l'empreinte ne dépend que de la source.
    expect((await creerContrepartie(ownerId, a, compte3)).statut).toBe("CONTREPARTIE_EXISTANTE");
    expect(await prisma.transaction.count({ where: { accountId: { in: [compte1, compte2, compte3] } } })).toBe(avant);
    await invariants(a, premiere.contrepartieId);
  });
});

describe("saisir un virement", () => {
  const entree = (surcharge: Partial<Parameters<typeof saisirVirement>[1]> = {}): Parameters<typeof saisirVirement>[1] => ({
    accountId: compte1,
    accountIdDestination: compte2,
    date: "2099-10-15",
    description: `Saisie vir ${M}`,
    montantCents: -7501,
    payeeId: null,
    payeeNouveauNom: null,
    note: null,
    tagIds: [],
    ...surcharge,
  });

  it("VI10 — les deux côtés liés, bénéficiaire, note et étiquette au côté saisi seulement ; seconde saisie refusée", async () => {
    const nom = `Beneficiaire vir ${M}`;
    const saisie = entree({ payeeNouveauNom: nom, note: "une note", tagIds: [tagTA] });
    const resultat = await saisirVirement(ownerId, saisie);
    expect(resultat.statut).toBe("CREE");
    if (resultat.statut !== "CREE") {
      return;
    }
    expect(resultat.beneficiaireCree).toBe(true);

    const a = await lueOuEchoue(resultat.id);
    const b = await lueOuEchoue(resultat.contrepartieId);
    const beneficiaire = await prisma.payee.findFirstOrThrow({ where: { ownerId, nomNormalise: normaliserNom(nom) } });
    expect(a).toMatchObject({
      accountId: compte1,
      montantCents: -7501,
      payeeId: beneficiaire.id,
      details: "une note",
      subcategoryId: null,
      appliedRuleId: null,
      source: "MANUELLE",
      transferTransactionId: b.id,
      transferAccountId: compte2,
    });
    expect(a.etiquettes.map((e) => e.tagId)).toEqual([tagTA]);
    expect(b).toMatchObject({
      accountId: compte2,
      montantCents: 7501,
      description: `Virement depuis ${nomCompte1}`,
      payeeId: null,
      details: null,
      subcategoryId: null,
      empreinte: empreinteContrepartie(a.id),
      source: "MANUELLE",
      transferTransactionId: a.id,
      transferAccountId: compte1,
    });
    expect(b.etiquettes).toEqual([]);
    expect(b.date).toEqual(a.date);
    await invariants(a.id, b.id);

    const nbTransactions = await prisma.transaction.count({ where: { accountId: { in: [compte1, compte2, compte3] } } });
    const nbBeneficiaires = await prisma.payee.count({ where: { ownerId, nom: { contains: M } } });
    expect(await saisirVirement(ownerId, saisie)).toEqual({ statut: "EMPREINTE_EXISTANTE" });
    expect(await prisma.transaction.count({ where: { accountId: { in: [compte1, compte2, compte3] } } })).toBe(nbTransactions);
    expect(await prisma.payee.count({ where: { ownerId, nom: { contains: M } } })).toBe(nbBeneficiaires);
  });

  it("VI10 — une entrée d'argent : la destination reçoit une sortie, « Virement vers »", async () => {
    const resultat = await saisirVirement(ownerId, entree({ description: `Saisie entree ${M}`, montantCents: 7502 }));
    expect(resultat.statut).toBe("CREE");
    if (resultat.statut !== "CREE") {
      return;
    }
    expect(await lueOuEchoue(resultat.contrepartieId)).toMatchObject({
      montantCents: -7502,
      description: `Virement vers ${nomCompte1}`,
    });
    await invariants(resultat.id, resultat.contrepartieId);
  });

  it("VI10 — refus : même compte, 0,00 $, compte de destination étranger ou inexistant, compte de départ étranger", async () => {
    const avant = await prisma.transaction.count({ where: { accountId: { in: [compte1, compte2, compte3] } } });
    expect(await saisirVirement(ownerId, entree({ accountIdDestination: compte1, description: `s1 ${M}` }))).toEqual({
      statut: "INCOMPATIBLE",
      refus: { motif: "MEME_COMPTE" },
    });
    expect(await saisirVirement(ownerId, entree({ montantCents: 0, description: `s2 ${M}` }))).toEqual({
      statut: "INCOMPATIBLE",
      refus: { motif: "MONTANT_NUL" },
    });
    expect(await saisirVirement(ownerId, entree({ accountIdDestination: compteEtranger, description: `s3 ${M}` }))).toEqual({
      statut: "REFERENCE_INVALIDE",
      quoi: "COMPTE_DESTINATION",
    });
    expect(await saisirVirement(ownerId, entree({ accountIdDestination: CUID_INEXISTANT, description: `s4 ${M}` }))).toEqual({
      statut: "REFERENCE_INVALIDE",
      quoi: "COMPTE_DESTINATION",
    });
    expect(await saisirVirement(ownerId, entree({ accountId: compteEtranger, description: `s5 ${M}` }))).toEqual({
      statut: "REFERENCE_INVALIDE",
      quoi: "COMPTE",
    });
    expect(await prisma.transaction.count({ where: { accountId: { in: [compte1, compte2, compte3] } } })).toBe(avant);
  });

  it("VI10 — étiquette ou bénéficiaire étranger, ou nom de bénéficiaire vide : rien d'écrit", async () => {
    const avant = await prisma.transaction.count({ where: { accountId: { in: [compte1, compte2, compte3] } } });
    expect(await saisirVirement(ownerId, entree({ description: `s6 ${M}`, tagIds: [CUID_INEXISTANT] }))).toEqual({
      statut: "REFERENCE_INVALIDE",
      quoi: "ETIQUETTE",
    });
    expect(await saisirVirement(ownerId, entree({ description: `s7 ${M}`, payeeId: CUID_INEXISTANT }))).toEqual({
      statut: "REFERENCE_INVALIDE",
      quoi: "BENEFICIAIRE",
    });
    expect(await saisirVirement(ownerId, entree({ description: `s8 ${M}`, payeeNouveauNom: "   " }))).toEqual({
      statut: "REFERENCE_INVALIDE",
      quoi: "BENEFICIAIRE_NOUVEAU_VIDE",
    });
    expect(await prisma.transaction.count({ where: { accountId: { in: [compte1, compte2, compte3] } } })).toBe(avant);
  });
});

describe("supprimer un côté", () => {
  it("VI11 — sans choix : REFUS SUPPRESSION_VIREMENT, rien ne bouge", async () => {
    const { a, b } = await paire("2099-10-16", -8101);
    expect(await supprimerTransaction(ownerId, a, null)).toEqual({ statut: "REFUS", motif: "SUPPRESSION_VIREMENT" });
    expect((await lueOuEchoue(a)).transferTransactionId).toBe(b);
    expect((await lueOuEchoue(b)).transferTransactionId).toBe(a);
  });

  it("VI11 — SUPPRIMER_LES_DEUX : les deux disparus", async () => {
    const { a, b } = await paire("2099-10-16", -8102);
    expect(await supprimerTransaction(ownerId, a, "SUPPRIMER_LES_DEUX")).toEqual({
      statut: "SUPPRIMEE",
      lignesVentilationSupprimees: 0,
      contrepartie: "SUPPRIMEE",
    });
    expect(await lue(a)).toBeNull();
    expect(await lue(b)).toBeNull();
  });

  it("VI11 — DELIER_L_AUTRE : la ligne disparue, l'autre existe, déliée, sans sous-catégorie", async () => {
    const { a, b } = await paire("2099-10-16", -8103);
    expect(await supprimerTransaction(ownerId, b, "DELIER_L_AUTRE")).toEqual({
      statut: "SUPPRIMEE",
      lignesVentilationSupprimees: 0,
      contrepartie: "DELIEE",
    });
    expect(await lue(b)).toBeNull();
    expect(await lueOuEchoue(a)).toMatchObject({ transferTransactionId: null, transferAccountId: null, subcategoryId: null });
    await invariants(a);
  });

  it("VI11 — une transaction ordinaire se supprime sans choix, contrepartie null ; absente : INTROUVABLE", async () => {
    const a = await ligne(compte1, "2099-10-16", -8104);
    expect(await supprimerTransaction(ownerId, a, null)).toEqual({
      statut: "SUPPRIMEE",
      lignesVentilationSupprimees: 0,
      contrepartie: null,
    });
    expect(await supprimerTransaction(ownerId, a, "SUPPRIMER_LES_DEUX")).toEqual({ statut: "INTROUVABLE" });
  });

  it("VI12 — l'autre côté rattaché à un objectif : SUPPRIMER_LES_DEUX refusé, DELIER_L_AUTRE permis, le lien reste", async () => {
    const { a, b } = await paire("2099-10-17", -8201);
    const goal = await prisma.goal.create({
      data: { ownerId, nom: `Objectif vir ${M}`, type: "EPARGNE", dateDebut: versDateUtc("2099-01-01") },
      select: { id: true },
    });
    goalIds.push(goal.id);
    await prisma.goalTransaction.create({ data: { goalId: goal.id, transactionId: b } });

    expect(await supprimerTransaction(ownerId, a, "SUPPRIMER_LES_DEUX")).toEqual({
      statut: "REFUS",
      motif: "SUPPRESSION_CONTREPARTIE_LIEE",
    });
    expect(await lue(a)).not.toBeNull();
    expect((await lueOuEchoue(b)).transferTransactionId).toBe(a);

    expect(await supprimerTransaction(ownerId, a, "DELIER_L_AUTRE")).toMatchObject({ statut: "SUPPRIMEE", contrepartie: "DELIEE" });
    expect(await lue(a)).toBeNull();
    expect(await lueOuEchoue(b)).toMatchObject({ transferTransactionId: null, transferAccountId: null });
    expect(await prisma.goalTransaction.count({ where: { goalId: goal.id, transactionId: b } })).toBe(1);
    await invariants(b);
  });

  it("VI12 — la ligne elle-même rattachée : SUPPRESSION_LIEE, quel que soit le choix", async () => {
    const { a } = await paire("2099-10-17", -8202);
    const goal = await prisma.goal.create({
      data: { ownerId, nom: `Objectif vir 2 ${M}`, type: "EPARGNE", dateDebut: versDateUtc("2099-01-01") },
      select: { id: true },
    });
    goalIds.push(goal.id);
    await prisma.goalTransaction.create({ data: { goalId: goal.id, transactionId: a } });
    for (const choix of [null, "SUPPRIMER_LES_DEUX", "DELIER_L_AUTRE"] as const) {
      expect(await supprimerTransaction(ownerId, a, choix)).toEqual({ statut: "REFUS", motif: "SUPPRESSION_LIEE" });
    }
    expect(await lue(a)).not.toBeNull();
  });

  it("VI12 — DELIER_L_AUTRE avec une cotisation de l'autre côté : REFUS VIREMENT_COTISATION", async () => {
    const { a, b } = await paire("2099-10-17", -8203);
    await prisma.contributionEntry.create({ data: { accountId: compte2, transactionId: b, anneeImputation: 2099, montantCents: 8203 } });
    expect(await supprimerTransaction(ownerId, a, "DELIER_L_AUTRE")).toEqual({ statut: "REFUS", motif: "VIREMENT_COTISATION" });
    expect(await lue(a)).not.toBeNull();
  });
});

describe("suppression et modification en masse", () => {
  /** P1 (contrepartie P2 hors sélection), une paire complète Q1 et Q2, une ordinaire O. */
  async function fixture(date: string, base: number) {
    const { a: p1, b: p2 } = await paire(date, -base);
    const { a: q1, b: q2 } = await paire(date, -(base + 1));
    const o = await ligne(compte1, date, -(base + 2));
    return { p1, p2, q1, q2, o, selection: { type: "IDS" as const, ids: [p1, q1, q2, o] } };
  }

  it("VI13 — virements null : l'ordinaire part, trois côtés ignorés (VIREMENT)", async () => {
    const f = await fixture("2099-10-18", 9101);
    const r = await modifierEnMasse(ownerId, f.selection, { type: "SUPPRIMER", virements: null });
    expect(r.statut).toBe("APPLIQUE");
    if (r.statut !== "APPLIQUE") {
      return;
    }
    expect(r.compteRendu).toMatchObject({ geste: "SUPPRIMER", traitees: 1, contrepartiesSupprimees: 0, contrepartiesDeliees: 0 });
    expect(r.compteRendu.ignorees.VIREMENT).toBe(3);
    expect(await lue(f.o)).toBeNull();
    for (const id of [f.p1, f.p2, f.q1, f.q2]) {
      expect(await lue(id)).not.toBeNull();
    }
    await invariants(f.p1, f.p2, f.q1, f.q2);
  });

  it("VI13 — SUPPRIMER_LES_DEUX : tout parti, P2 compris ; compte rendu des contreparties", async () => {
    const f = await fixture("2099-10-18", 9111);
    const r = await modifierEnMasse(ownerId, f.selection, { type: "SUPPRIMER", virements: "SUPPRIMER_LES_DEUX" });
    expect(r.statut).toBe("APPLIQUE");
    if (r.statut !== "APPLIQUE") {
      return;
    }
    expect(r.compteRendu).toMatchObject({ traitees: 4, contrepartiesSupprimees: 1, contrepartiesDeliees: 0 });
    for (const id of [f.p1, f.p2, f.q1, f.q2, f.o]) {
      expect(await lue(id)).toBeNull();
    }
  });

  it("VI13 — DELIER_L_AUTRE : P2 reste, délié ; compte rendu des contreparties", async () => {
    const f = await fixture("2099-10-18", 9121);
    const r = await modifierEnMasse(ownerId, f.selection, { type: "SUPPRIMER", virements: "DELIER_L_AUTRE" });
    expect(r.statut).toBe("APPLIQUE");
    if (r.statut !== "APPLIQUE") {
      return;
    }
    expect(r.compteRendu).toMatchObject({ traitees: 4, contrepartiesSupprimees: 0, contrepartiesDeliees: 1 });
    for (const id of [f.p1, f.q1, f.q2, f.o]) {
      expect(await lue(id)).toBeNull();
    }
    expect(await lueOuEchoue(f.p2)).toMatchObject({ transferTransactionId: null, transferAccountId: null });
    await invariants(f.p2);
  });

  it("VI13 — les trois aperçus sont cohérents avec les comptes rendus", async () => {
    const f = await fixture("2099-10-18", 9131);
    const apercu = await apercevoirSuppression(ownerId, f.selection);
    expect(apercu.statut).toBe("APERCU");
    if (apercu.statut !== "APERCU") {
      return;
    }
    const { sansChoix, lesDeux, delier } = apercu.apercus;
    expect(sansChoix).toMatchObject({ aSupprimer: 1, cotesVirement: 0, contrepartiesSupprimees: 0, contrepartiesDeliees: 0 });
    expect(sansChoix.ignorees.VIREMENT).toBe(3);
    expect(lesDeux).toMatchObject({ aSupprimer: 4, cotesVirement: 3, contrepartiesSupprimees: 1, contrepartiesDeliees: 0 });
    expect(delier).toMatchObject({ aSupprimer: 4, cotesVirement: 3, contrepartiesSupprimees: 0, contrepartiesDeliees: 1 });

    // L'aperçu n'écrit rien.
    for (const id of [f.p1, f.p2, f.q1, f.q2, f.o]) {
      expect(await lue(id)).not.toBeNull();
    }

    const r = await modifierEnMasse(ownerId, f.selection, { type: "SUPPRIMER", virements: "SUPPRIMER_LES_DEUX" });
    if (r.statut !== "APPLIQUE") {
      throw new Error("masse non appliquée");
    }
    expect(r.compteRendu.traitees).toBe(lesDeux.aSupprimer);
    expect(r.compteRendu.contrepartiesSupprimees).toBe(lesDeux.contrepartiesSupprimees);
  });

  it("VI13 — un côté dont l'autre côté est rattaché : ignoré (CONTREPARTIE_LIEE) avec SUPPRIMER_LES_DEUX, supprimé avec DELIER_L_AUTRE", async () => {
    const { a, b } = await paire("2099-10-19", -9141);
    const goal = await prisma.goal.create({
      data: { ownerId, nom: `Objectif vir 3 ${M}`, type: "EPARGNE", dateDebut: versDateUtc("2099-01-01") },
      select: { id: true },
    });
    goalIds.push(goal.id);
    await prisma.goalTransaction.create({ data: { goalId: goal.id, transactionId: b } });
    const selection = { type: "IDS" as const, ids: [a] };

    const r1 = await modifierEnMasse(ownerId, selection, { type: "SUPPRIMER", virements: "SUPPRIMER_LES_DEUX" });
    if (r1.statut !== "APPLIQUE") {
      throw new Error("masse non appliquée");
    }
    expect(r1.compteRendu).toMatchObject({ traitees: 0, contrepartiesSupprimees: 0 });
    expect(r1.compteRendu.ignorees.CONTREPARTIE_LIEE).toBe(1);
    expect(await lue(a)).not.toBeNull();

    const r2 = await modifierEnMasse(ownerId, selection, { type: "SUPPRIMER", virements: "DELIER_L_AUTRE" });
    if (r2.statut !== "APPLIQUE") {
      throw new Error("masse non appliquée");
    }
    expect(r2.compteRendu).toMatchObject({ traitees: 1, contrepartiesDeliees: 1 });
    expect(await lue(a)).toBeNull();
    expect(await prisma.goalTransaction.count({ where: { transactionId: b } })).toBe(1);
  });

  describe("VI13 — course : la contrepartie a changé entre la lecture et l'écriture", () => {
    /** P1 et P2 liés ; puis P2 est délié de P1 et relié à X : la partition lue plus tôt est périmée. */
    async function partitionPerimee() {
      const { a: p1, b: p2 } = await paire("2099-10-20", -9161);
      const x = await ligne(compte3, "2099-10-20", -9161);
      expect((await delierVirement(ownerId, p1)).statut).toBe("DELIEE");
      expect((await lierVirement(ownerId, p2, x)).statut).toBe("LIEE");
      const partition: PartitionMasse = {
        aEcrire: [p1],
        inchangees: 0,
        ignorees: IGNOREES_VIDES,
        parentsVentilesEcrits: 0,
        lignesVentilationEcrites: 0,
        cotesVirementEcrits: 1,
        contrepartiesAffectees: [p2],
        pointeursLus: { [p1]: p2 },
      };
      return { p1, p2, x, partition };
    }

    it("DELIER_L_AUTRE : CourseVirement, rien n'est écrit", async () => {
      const { p1, p2, x, partition } = await partitionPerimee();
      const course = prisma.$transaction((tx) =>
        ecrireGeste(tx, ownerId, partition, { type: "SUPPRIMER", virements: "DELIER_L_AUTRE" }),
      );
      await expect(course).rejects.toBeInstanceOf(CourseVirement);
      await expect(course).rejects.toMatchObject({ objet: "AUTRE_COTE" });
      expect(await lue(p1)).not.toBeNull();
      expect(await lueOuEchoue(p2)).toMatchObject({ transferTransactionId: x });
      expect(await lueOuEchoue(x)).toMatchObject({ transferTransactionId: p2 });
      await invariants(p1, p2, x);
    });

    it("SUPPRIMER_LES_DEUX : CourseVirement, P2 reste lié à X et P1 n'est pas supprimé", async () => {
      const { p1, p2, x, partition } = await partitionPerimee();
      const course = prisma.$transaction((tx) =>
        ecrireGeste(tx, ownerId, partition, { type: "SUPPRIMER", virements: "SUPPRIMER_LES_DEUX" }),
      );
      await expect(course).rejects.toBeInstanceOf(CourseVirement);
      await expect(course).rejects.toMatchObject({ objet: "LIGNE_OU_AUTRE_COTE" });
      expect(await lue(p1)).not.toBeNull();
      expect(await lueOuEchoue(p2)).toMatchObject({ transferTransactionId: x });
      expect(await lueOuEchoue(x)).toMatchObject({ transferTransactionId: p2 });
      await invariants(p1, p2, x);
    });
  });

  it("VI13 — la sélection d'un autre propriétaire est comptée introuvable, jamais supprimée", async () => {
    const etrangere = (
      await prisma.transaction.create({
        data: {
          ownerId: utilisateur2Id,
          accountId: compteEtranger,
          date: versDateUtc("2099-10-19"),
          description: `Etranger ${M} 2`,
          descriptionNormalisee: normaliserDescription(`Etranger ${M} 2`),
          montantCents: -9151,
          source: "MANUELLE",
          empreinte: `virement-etranger-2-${M}`,
        },
        select: { id: true },
      })
    ).id;
    const r = await modifierEnMasse(ownerId, { type: "IDS", ids: [etrangere] }, { type: "SUPPRIMER", virements: null });
    if (r.statut !== "APPLIQUE") {
      throw new Error("masse non appliquée");
    }
    expect(r.compteRendu.traitees).toBe(0);
    expect(r.compteRendu.ignorees.INTROUVABLE).toBe(1);
    expect(await lue(etrangere)).not.toBeNull();
  });
});

describe("suppression gardée contre une liaison concurrente (relecteur M2-T5)", () => {
  it("VI17 — suppression unitaire en course : la ligne lue ordinaire, liée entre-temps, n'est pas supprimée", async () => {
    const a = await ligne(compte1, "2099-12-10", -9401);
    const b = await ligne(compte2, "2099-12-10", 9401);
    const lecture = { id: a, transferTransactionId: null, contrepartieTrouvee: false, lignesVentilation: 0 };
    expect((await lierVirement(ownerId, a, b)).statut).toBe("LIEE");

    const course = prisma.$transaction((tx) => ecrireSuppression(tx, ownerId, lecture, null));
    await expect(course).rejects.toBeInstanceOf(CourseVirement);
    await expect(course).rejects.toMatchObject({ objet: "LIGNE" });
    expect(await lueOuEchoue(a)).toMatchObject({ transferTransactionId: b, transferAccountId: compte2 });
    expect(await lueOuEchoue(b)).toMatchObject({ transferTransactionId: a, transferAccountId: compte1 });
    await invariants(a, b);
  });

  it("VI17 — contre-épreuve : une ligne ordinaire non liée se supprime", async () => {
    const c = await ligne(compte1, "2099-12-10", -9402);
    const r = await prisma.$transaction((tx) =>
      ecrireSuppression(tx, ownerId, { id: c, transferTransactionId: null, contrepartieTrouvee: false, lignesVentilation: 0 }, null),
    );
    expect(r).toEqual({ statut: "SUPPRIMEE", lignesVentilationSupprimees: 0, contrepartie: null });
    expect(await lue(c)).toBeNull();
  });

  it("VI18 — masse en course, sans choix : l'ordinaire liée entre-temps à une ligne hors aperçu reste", async () => {
    const o = await ligne(compte1, "2099-12-11", -9403);
    const x = await ligne(compte3, "2099-12-11", 9403);
    const partition: PartitionMasse = {
      aEcrire: [o],
      inchangees: 0,
      ignorees: IGNOREES_VIDES,
      parentsVentilesEcrits: 0,
      lignesVentilationEcrites: 0,
      cotesVirementEcrits: 0,
      contrepartiesAffectees: [],
      pointeursLus: { [o]: null },
    };
    expect((await lierVirement(ownerId, o, x)).statut).toBe("LIEE");

    const course = prisma.$transaction((tx) => ecrireGeste(tx, ownerId, partition, { type: "SUPPRIMER", virements: null }));
    await expect(course).rejects.toBeInstanceOf(CourseVirement);
    await expect(course).rejects.toMatchObject({ objet: "LIGNE" });
    expect(await lueOuEchoue(o)).toMatchObject({ transferTransactionId: x });
    expect(await lueOuEchoue(x)).toMatchObject({ transferTransactionId: o });
    await invariants(o, x);
  });

  it("VI18 — masse en course, avec un vrai virement dans la sélection : les deux choix échouent en CourseVirement", async () => {
    const { a: p1, b: p2 } = await paire("2099-12-11", -9404);
    const o2 = await ligne(compte1, "2099-12-11", -9405);
    const x2 = await ligne(compte3, "2099-12-11", 9405);
    const partition: PartitionMasse = {
      aEcrire: [p1, o2],
      inchangees: 0,
      ignorees: IGNOREES_VIDES,
      parentsVentilesEcrits: 0,
      lignesVentilationEcrites: 0,
      cotesVirementEcrits: 1,
      contrepartiesAffectees: [p2],
      pointeursLus: { [p1]: p2, [o2]: null },
    };
    expect((await lierVirement(ownerId, o2, x2)).statut).toBe("LIEE");

    for (const [virements, objet] of [
      ["SUPPRIMER_LES_DEUX", "LIGNE_OU_AUTRE_COTE"],
      ["DELIER_L_AUTRE", "LIGNE"],
    ] as const) {
      const course = prisma.$transaction((tx) => ecrireGeste(tx, ownerId, partition, { type: "SUPPRIMER", virements }));
      await expect(course).rejects.toBeInstanceOf(CourseVirement);
      await expect(course).rejects.toMatchObject({ objet });
    }
    expect(await lueOuEchoue(p1)).toMatchObject({ transferTransactionId: p2 });
    expect(await lueOuEchoue(p2)).toMatchObject({ transferTransactionId: p1 });
    expect(await lueOuEchoue(o2)).toMatchObject({ transferTransactionId: x2 });
    expect(await lueOuEchoue(x2)).toMatchObject({ transferTransactionId: o2 });
    await invariants(p1, p2, o2, x2);
  });

  describe("VI20 — masse : un côté dont la contrepartie est d'un autre propriétaire part", () => {
    /** x au propriétaire, y au second utilisateur, pointeurs croisés. */
    async function montageEtranger(jour: string, montantCents: number) {
      const x = await ligne(compte1, jour, -montantCents);
      const y = (
        await prisma.transaction.create({
          data: {
            ownerId: utilisateur2Id,
            accountId: compteEtranger,
            date: versDateUtc(jour),
            description: `Etranger masse ${String(montantCents)} ${M}`,
            descriptionNormalisee: normaliserDescription(`Etranger masse ${String(montantCents)} ${M}`),
            montantCents,
            source: "MANUELLE",
            empreinte: `virement-etranger-masse-${String(montantCents)}-${M}`,
            transferTransactionId: x,
            transferAccountId: compte1,
          },
          select: { id: true },
        })
      ).id;
      await prisma.transaction.update({ where: { id: x }, data: { transferTransactionId: y, transferAccountId: compteEtranger } });
      return { x, y };
    }

    for (const [virements, montantCents] of [
      ["DELIER_L_AUTRE", 9601],
      ["SUPPRIMER_LES_DEUX", 9602],
    ] as const) {
      it(`${virements} : APPLIQUE, x supprimée, y intacte`, async () => {
        const { x, y } = await montageEtranger("2099-12-13", montantCents);
        try {
          const r = await modifierEnMasse(ownerId, { type: "IDS", ids: [x] }, { type: "SUPPRIMER", virements });
          expect(r.statut).toBe("APPLIQUE");
          if (r.statut === "APPLIQUE") {
            expect(r.compteRendu.traitees).toBe(1);
          }
          expect(await lue(x)).toBeNull();
          // La clé étrangère du pointeur est SetNull : la suppression de x remet celui de y à null.
          expect(await lueOuEchoue(y)).toMatchObject({ montantCents, transferTransactionId: null, transferAccountId: compte1 });
          // Limite connue : la clé étrangère SetNull ne remet à null que transferTransactionId. Le transferAccountId
          // résiduel d'une ligne d'un autre propriétaire n'est pas écrit par cette action (journal d'INDEX.md, 2026-10-06).
          expect((await verifierInvariants(prisma, { type: "TRANSACTIONS", ids: [y] })).ecarts).toEqual([
            { invariant: 1, transactionId: y, message: `transferAccountId ${compte1} sans contrepartie` },
          ]);
        } finally {
          await prisma.transaction.updateMany({ where: { id: y }, data: { transferTransactionId: null, transferAccountId: null } });
          await prisma.transaction.updateMany({ where: { id: x }, data: { transferTransactionId: null, transferAccountId: null } });
        }
      });
    }
  });
});

describe("verrou ordonné contre une liaison concurrente (relecteur M2-T6)", () => {
  /**
   * Une session tient la première ligne dans l'ordre de la base ; l'opération se met en attente ; puis la session
   * prend la seconde, comme le ferait lierVirement, et valide. Sans verrou ordonné, l'opération tient déjà l'une des
   * deux lignes et c'est l'interblocage.
   */
  async function contreLiaisonConcurrente<T>(a: string, b: string, operation: () => Promise<T>): Promise<T> {
    const [l1, l2] = await ordreBase(prisma, a, b);
    const verrou = await tenirVerrou(prisma, l1);
    const attendue = operation();
    try {
      await verrou.attendreUnBloque();
    } catch (erreur) {
      await verrou.relacher();
      await attendue.catch(() => undefined);
      throw erreur;
    }
    await verrou.relacher(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Transaction" WHERE "id" = ${l2} FOR UPDATE`;
    });
    return attendue;
  }

  it("VI21 — délier : l'opération attend le verrou, puis aboutit", async () => {
    const { a, b } = await paire("2099-12-21", -9701);
    const r = await contreLiaisonConcurrente(a, b, () => delierVirement(ownerId, a));
    expect(r).toEqual({ statut: "DELIEE", id: a, contrepartieId: b });
    expect(await lueOuEchoue(a)).toMatchObject({ transferTransactionId: null, transferAccountId: null });
    expect(await lueOuEchoue(b)).toMatchObject({ transferTransactionId: null, transferAccountId: null });
    await invariants(a, b);
  });

  it("VI22 — suppression unitaire : SUPPRIMER_LES_DEUX, puis DELIER_L_AUTRE", async () => {
    const lesDeux = await paire("2099-12-22", -9711);
    const r1 = await contreLiaisonConcurrente(lesDeux.a, lesDeux.b, () =>
      supprimerTransaction(ownerId, lesDeux.a, "SUPPRIMER_LES_DEUX"),
    );
    expect(r1).toEqual({ statut: "SUPPRIMEE", lignesVentilationSupprimees: 0, contrepartie: "SUPPRIMEE" });
    expect(await lue(lesDeux.a)).toBeNull();
    expect(await lue(lesDeux.b)).toBeNull();

    const delie = await paire("2099-12-22", -9712);
    const r2 = await contreLiaisonConcurrente(delie.a, delie.b, () =>
      supprimerTransaction(ownerId, delie.a, "DELIER_L_AUTRE"),
    );
    expect(r2).toEqual({ statut: "SUPPRIMEE", lignesVentilationSupprimees: 0, contrepartie: "DELIEE" });
    expect(await lue(delie.a)).toBeNull();
    expect(await lueOuEchoue(delie.b)).toMatchObject({ transferTransactionId: null, transferAccountId: null });
    await invariants(delie.b);
  });

  it("VI23 — masse : SUPPRIMER_LES_DEUX sur un côté", async () => {
    const { a, b } = await paire("2099-12-23", -9721);
    const r = await contreLiaisonConcurrente(a, b, () =>
      modifierEnMasse(ownerId, { type: "IDS", ids: [a] }, { type: "SUPPRIMER", virements: "SUPPRIMER_LES_DEUX" }),
    );
    expect(r.statut).toBe("APPLIQUE");
    if (r.statut === "APPLIQUE") {
      expect(r.compteRendu.traitees).toBe(1);
    }
    expect(await lue(a)).toBeNull();
    expect(await lue(b)).toBeNull();
  });
});

describe("lireCandidatsVirement", () => {
  it("VI14 — rend les candidats triés et exclut même compte, déjà lié, ventilée, 6 jours et autre propriétaire", async () => {
    const montant = 5301;
    const source = await ligne(compte1, "2099-11-10", -montant);
    const ok1 = await ligne(compte2, "2099-11-12", montant);
    const ok2 = await ligne(compte3, "2099-11-09", montant);
    await ligne(compte1, "2099-11-10", montant); // même compte
    const lie = await ligne(compte2, "2099-11-10", montant);
    const partenaire = await ligne(compte3, "2099-11-10", -montant);
    expect((await lierVirement(ownerId, lie, partenaire)).statut).toBe("LIEE");
    const ventilee = await ligne(compte2, "2099-11-10", montant);
    expect((await ventilerTransaction(ownerId, ventilee, lignesVentilation(2000, 3301))).statut).toBe("VENTILEE");
    await ligne(compte2, "2099-11-16", montant); // 6 jours
    await prisma.transaction.create({
      data: {
        ownerId: utilisateur2Id,
        accountId: compteEtranger,
        date: versDateUtc("2099-11-10"),
        description: `Etranger ${M} 3`,
        descriptionNormalisee: normaliserDescription(`Etranger ${M} 3`),
        montantCents: montant,
        source: "MANUELLE",
        empreinte: `virement-etranger-3-${M}`,
      },
    });

    const resultat = await lireCandidatsVirement(ownerId, source);
    expect(resultat.statut).toBe("CANDIDATS");
    if (resultat.statut !== "CANDIDATS") {
      return;
    }
    // ok2 est à 1 jour, ok1 à 2 jours.
    expect(resultat.candidats.map((c) => c.id)).toEqual([ok2, ok1]);
    expect(resultat.candidats[0]).toMatchObject({ compteNom: `Vir C3 ${M}`, montantCents: montant, date: "2099-11-09" });
  });

  it("VI14 — un côté de virement : REFUS VIREMENT_DEJA_LIE ; une ligne absente ou étrangère : INTROUVABLE", async () => {
    const { a } = await paire("2099-11-11", -5302);
    expect(await lireCandidatsVirement(ownerId, a)).toEqual({ statut: "REFUS", motif: "VIREMENT_DEJA_LIE" });
    expect(await lireCandidatsVirement(ownerId, CUID_INEXISTANT)).toEqual({ statut: "INTROUVABLE" });
    const etrangere = await prisma.transaction.create({
      data: {
        ownerId: utilisateur2Id,
        accountId: compteEtranger,
        date: versDateUtc("2099-11-11"),
        description: `Etranger ${M} 4`,
        descriptionNormalisee: normaliserDescription(`Etranger ${M} 4`),
        montantCents: -5303,
        source: "MANUELLE",
        empreinte: `virement-etranger-4-${M}`,
      },
      select: { id: true },
    });
    expect(await lireCandidatsVirement(ownerId, etrangere.id)).toEqual({ statut: "INTROUVABLE" });
  });

  it("VI14 — une transaction à 0,00 $ : REFUS VIREMENT_MONTANT_NUL ; sans correspondance : liste vide", async () => {
    const zero = await ligne(compte1, "2099-11-11", 0);
    expect(await lireCandidatsVirement(ownerId, zero)).toEqual({ statut: "REFUS", motif: "VIREMENT_MONTANT_NUL" });
    const seule = await ligne(compte1, "2099-11-11", -5304);
    expect(await lireCandidatsVirement(ownerId, seule)).toEqual({ statut: "CANDIDATS", candidats: [] });
  });
});

describe("versRefus et l'ownerId (relecteur M2-T3)", () => {
  it("VI15 — la contrepartie d'un autre propriétaire est introuvable : rien d'elle ne fuit", async () => {
    const x = await ligne(compte1, "2099-12-01", -801);
    const y = (
      await prisma.transaction.create({
        data: {
          ownerId: utilisateur2Id,
          accountId: compteEtranger,
          date: versDateUtc("2099-12-01"),
          description: `Etranger secret ${M}`,
          descriptionNormalisee: normaliserDescription(`Etranger secret ${M}`),
          montantCents: 801,
          source: "MANUELLE",
          empreinte: `virement-etranger-5-${M}`,
          transferTransactionId: x,
        },
        select: { id: true },
      })
    ).id;
    await prisma.transaction.update({ where: { id: x }, data: { transferTransactionId: y, transferAccountId: compteEtranger } });

    const detail = await lireTransaction(ownerId, x);
    expect(detail?.contrepartie).toMatchObject({ transactionId: null, compteId: null, compteNom: null });
    expect(JSON.stringify(detail)).not.toContain(compteEtranger);
    expect(JSON.stringify(detail?.contrepartie)).not.toContain(y);
    expect(detail?.refus.montant).toBe("MONTANT_CONTREPARTIE_INTROUVABLE");
    expect(detail?.contrepartie).not.toBeNull();
    expect(detail?.contrepartie?.date).toBeNull();
    expect(detail?.contrepartie?.description).toBeNull();
    expect(detail?.contrepartie?.montantCents).toBeNull();
    // Aucun fait de l'autre propriétaire ne nourrit les gestes de virement.
    expect(detail?.refus.delierVirement).toBeNull();
    expect(JSON.stringify(detail)).not.toContain("Etranger secret");

    await prisma.transaction.update({ where: { id: x }, data: { transferTransactionId: null, transferAccountId: null } });
    await prisma.transaction.update({ where: { id: y }, data: { transferTransactionId: null } });
  });

  it("VI15 — contre-épreuve : avec une contrepartie du même propriétaire, le montant est modifiable", async () => {
    const x = await ligne(compte1, "2099-12-02", -802);
    const y = await ligne(compte2, "2099-12-02", 802);
    await prisma.transaction.update({ where: { id: y }, data: { transferTransactionId: x, transferAccountId: compte1 } });
    await prisma.transaction.update({ where: { id: x }, data: { transferTransactionId: y, transferAccountId: compte2 } });
    const detail = await lireTransaction(ownerId, x);
    expect(detail?.refus.montant).toBeNull();
    expect(detail?.contrepartie).toMatchObject({ transactionId: y, date: "2099-12-02", montantCents: 802 });
    await invariants(x, y);
  });
});

describe("la liste et l'ownerId (relecteur M2-T5)", () => {
  const criteresDuJour = (compte: string, jour: string) => ({
    ...resoudreCriteres(FILTRES_VIDES, { type: "TOUT", mois: "2099-12" }),
    comptes: [compte],
    du: jour,
    au: jour,
  });

  it("VI19 — la liste ne montre pas l'id d'une contrepartie d'un autre propriétaire", async () => {
    const x = await ligne(compte1, "2099-12-12", -9501);
    const y = (
      await prisma.transaction.create({
        data: {
          ownerId: utilisateur2Id,
          accountId: compteEtranger,
          date: versDateUtc("2099-12-12"),
          description: `Etranger liste ${M}`,
          descriptionNormalisee: normaliserDescription(`Etranger liste ${M}`),
          montantCents: 9501,
          source: "MANUELLE",
          empreinte: `virement-etranger-liste-${M}`,
          transferTransactionId: x,
        },
        select: { id: true },
      })
    ).id;
    try {
      await prisma.transaction.update({ where: { id: x }, data: { transferTransactionId: y, transferAccountId: compteEtranger } });

      const page = await listerTransactions(ownerId, criteresDuJour(compte1, "2099-12-12"), TRI_PAR_DEFAUT, null);
      const ligneX = page.lignes.find((l) => l.id === x);
      expect(ligneX?.virement).toEqual({ transactionId: null, compteId: null, compteNom: null });
      expect(JSON.stringify(page)).not.toContain(y);
      expect(JSON.stringify(page)).not.toContain(compteEtranger);
    } finally {
      await prisma.transaction.updateMany({ where: { id: x }, data: { transferTransactionId: null, transferAccountId: null } });
      await prisma.transaction.updateMany({ where: { id: y }, data: { transferTransactionId: null } });
    }
  });

  it("VI19 — contre-épreuve : avec une contrepartie du même propriétaire, l'id et le compte sont montrés", async () => {
    const { a, b } = await paire("2099-12-12", -9502);
    const page = await listerTransactions(ownerId, criteresDuJour(compte1, "2099-12-12"), TRI_PAR_DEFAUT, null);
    expect(page.lignes.find((l) => l.id === a)?.virement).toEqual({
      transactionId: b,
      compteId: compte2,
      compteNom: nomCompte2,
    });
  });
});

describe("appliquerModifications (docs/lot-m2.md §3.4)", () => {
  it("VI16 — poser une sous-catégorie sur une transaction devenue côté de virement : rejeté, rien n'est écrit sur le lot", async () => {
    const ordinaire = await ligne(compte1, "2099-12-03", -901);
    const a = await ligne(compte1, "2099-12-03", -902);
    const b = await ligne(compte2, "2099-12-03", 902);
    expect((await lierVirement(ownerId, a, b)).statut).toBe("LIEE");

    await expect(
      appliquerModifications(ownerId, [
        { transactionId: ordinaire, note: "ne doit pas rester", tagIdsAAjouter: [tagTA] },
        { transactionId: a, subcategoryId: sousCatCafe, appliedRuleId: idRegleIga, tagIdsAAjouter: [] },
      ]),
    ).rejects.toThrow("Une transaction a changé de nature pendant l'application de la règle.");

    expect(await lueOuEchoue(a)).toMatchObject({ subcategoryId: null, appliedRuleId: null, transferTransactionId: b });
    const o = await prisma.transaction.findUniqueOrThrow({
      where: { id: ordinaire },
      select: { details: true, etiquettes: { select: { tagId: true } } },
    });
    expect(o).toEqual({ details: null, etiquettes: [] });
    await invariants(a, b);
  });

  it("VI16 — contre-épreuve : la même modification sur une ligne ordinaire passe", async () => {
    const ordinaire = await ligne(compte1, "2099-12-03", -903);
    expect(
      await appliquerModifications(ownerId, [
        { transactionId: ordinaire, subcategoryId: sousCatCafe, appliedRuleId: idRegleIga, tagIdsAAjouter: [] },
      ]),
    ).toBe(1);
    expect(await lueOuEchoue(ordinaire)).toMatchObject({ subcategoryId: sousCatCafe, appliedRuleId: idRegleIga });
  });

  it("VI16 — retirer une sous-catégorie (null) d'un côté de virement n'est pas bloqué par la garde", async () => {
    const { a } = await paire("2099-12-03", -904);
    expect(await appliquerModifications(ownerId, [{ transactionId: a, subcategoryId: null, tagIdsAAjouter: [] }])).toBe(1);
  });
});
