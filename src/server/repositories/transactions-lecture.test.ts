// Test d'intégration de la lecture des transactions — docs/lot-m2.md §5 et §8.
// Même mise en place que src/server/actions/import.test.ts : schéma `test`,
// marqueur unique, dates en 2099, nettoyage complet en afterAll. Toutes les
// requêtes portent `comptes: [A]` ou `[A, B]`, ce qui isole la fixture du seed
// et des fichiers qui tournent en parallèle.

import { randomUUID } from "node:crypto";
import { PrismaClient, type Prisma } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  comparerLignes,
  FILTRES_VIDES,
  resoudreCriteres,
  type CriteresTransactions,
  type CurseurTransactions,
  type TriTransactions,
} from "@/domain/consultation";
import { dateCivileDansFuseau, depuisDateUtc, FUSEAU_APPLICATION, versDateUtc } from "@/domain/dates";
import { exigerInvariants } from "../../../prisma/test/invariants";
import {
  compterARevoir,
  listerTransactions,
  lireTransaction,
  possedeDesTransactions,
  totauxTransactions,
} from "./transactions-lecture";

const prisma = new PrismaClient();

const M = randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase();

const CRITERES_VIDES: CriteresTransactions = resoudreCriteres(FILTRES_VIDES, { type: "TOUT", mois: "2099-03" });

let ownerId: string;
let utilisateur2Id: string;
let compteA: string;
let compteB: string;
let compteC: string;
let compteANom: string;
let compteBNom: string;
let lotId: string;
let payeeId: string;
let etiquetteId: string;
let sousCatEpicerie: string;
let sousCatCafe: string;
let sousCatRestaurant: string;
let idRegleIga: string;

const ids: Record<string, string> = {};
const idsFixture: string[] = [];

function id(nom: string): string {
  const valeur = ids[nom];
  if (valeur === undefined) {
    throw new Error(`id de fixture inconnu : ${nom}`);
  }
  return valeur;
}

function criteres(partiel: Partial<CriteresTransactions>): CriteresTransactions {
  return { ...CRITERES_VIDES, ...partiel };
}

interface DonneesLigne {
  readonly cle: string;
  readonly accountId: string;
  readonly date: string;
  readonly montantCents: number;
  readonly description?: string;
  readonly extra?: Partial<Prisma.TransactionUncheckedCreateInput>;
}

async function creerLigne(client: Pick<PrismaClient, "transaction">, donnees: DonneesLigne): Promise<string> {
  const ligne = await client.transaction.create({
    data: {
      ownerId,
      accountId: donnees.accountId,
      date: versDateUtc(donnees.date),
      description: donnees.description ?? `Ligne ${donnees.cle} ${M}`,
      descriptionNormalisee: (donnees.description ?? `Ligne ${donnees.cle} ${M}`).toLowerCase(),
      montantCents: donnees.montantCents,
      source: "COPIER_COLLER",
      empreinte: `lecture-${donnees.cle}-${M}`,
      ...donnees.extra,
    },
    select: { id: true },
  });
  ids[donnees.cle] = ligne.id;
  idsFixture.push(ligne.id);
  return ligne.id;
}

beforeAll(async () => {
  const proprietaire = await prisma.user.findFirstOrThrow({ orderBy: { createdAt: "asc" } });
  ownerId = proprietaire.id;

  compteANom = `Lecture A ${M}`;
  compteBNom = `Lecture B ${M}`;
  const creerCompte = async (nom: string, proprietaireId: string) =>
    (
      await prisma.account.create({
        // Hors budget : ces comptes jetables ne doivent être candidats pour aucun autre fichier.
        data: { ownerId: proprietaireId, nom, dateSoldeInitial: versDateUtc("2099-01-01"), estBudgetaire: false },
        select: { id: true },
      })
    ).id;
  compteA = await creerCompte(compteANom, ownerId);
  compteB = await creerCompte(compteBNom, ownerId);

  const sousCat = async (nom: string) =>
    (await prisma.subcategory.findFirstOrThrow({ where: { nom, category: { ownerId } }, select: { id: true } })).id;
  sousCatEpicerie = await sousCat("Épicerie");
  sousCatCafe = await sousCat("Café");
  sousCatRestaurant = await sousCat("Restaurant");
  idRegleIga = (await prisma.rule.findFirstOrThrow({ where: { ownerId, libelle: "Épicerie IGA" }, select: { id: true } })).id;

  payeeId = (
    await prisma.payee.create({
      data: { ownerId, nom: `Épicerie Fine ${M}`, nomNormalise: `epicerie fine ${M}`.toLowerCase() },
      select: { id: true },
    })
  ).id;
  etiquetteId = (await prisma.tag.create({ data: { ownerId, nom: `Lecture ${M}` }, select: { id: true } })).id;
  lotId = (
    await prisma.importBatch.create({
      data: {
        ownerId,
        accountId: compteA,
        source: "COPIER_COLLER",
        libelle: `Lot lecture ${M}`,
        nbLignes: 1,
        couvreDu: versDateUtc("2099-03-01"),
        couvreAu: versDateUtc("2099-03-31"),
      },
      select: { id: true },
    })
  ).id;

  const montantsE = [-1000, -1000, -1000, -2500, 4000, -700];
  for (const [index, montantCents] of montantsE.entries()) {
    await creerLigne(prisma, { cle: `E${String(index + 1)}`, accountId: compteA, date: "2099-03-15", montantCents });
  }
  await creerLigne(prisma, {
    cle: "TXT",
    accountId: compteA,
    date: "2099-03-14",
    montantCents: -450,
    description: `Café Dépôt Lecture ${M}`,
    extra: {
      typeOperation: "Paiement préautorisé",
      details: `Crème brûlée ${M}`,
      payeeId,
      subcategoryId: sousCatCafe,
      importBatchId: lotId,
      appliedRuleId: idRegleIga,
      empreinte: `txt-${M}`,
    },
  });
  await creerLigne(prisma, {
    cle: "PCT",
    accountId: compteA,
    date: "2099-03-13",
    montantCents: -500,
    description: `Rabais 100% ${M}`,
  });
  await creerLigne(prisma, {
    cle: "P1000",
    accountId: compteA,
    date: "2099-03-13",
    montantCents: -600,
    description: `Rabais 1000 ${M}`,
  });

  await prisma.$transaction(async (tx) => {
    await creerLigne(tx, {
      cle: "P",
      accountId: compteA,
      date: "2099-03-10",
      montantCents: -9000,
      extra: { estVentilee: true },
    });
    await creerLigne(tx, {
      cle: "F1",
      accountId: compteA,
      date: "2099-03-10",
      montantCents: -6000,
      extra: { parentId: id("P"), subcategoryId: sousCatEpicerie },
    });
    await creerLigne(tx, {
      cle: "F2",
      accountId: compteA,
      date: "2099-03-10",
      montantCents: -3000,
      extra: {
        parentId: id("P"),
        subcategoryId: sousCatCafe,
        details: `Pourboire ${M}`,
        etiquettes: { create: { tagId: etiquetteId } },
      },
    });
  });

  await prisma.$transaction(async (tx) => {
    await creerLigne(tx, {
      cle: "V1",
      accountId: compteA,
      date: "2099-03-12",
      montantCents: -5000,
      extra: { transferAccountId: compteB },
    });
    await creerLigne(tx, {
      cle: "V2",
      accountId: compteB,
      date: "2099-03-12",
      montantCents: 5000,
      extra: { transferAccountId: compteA, transferTransactionId: id("V1") },
    });
    await tx.transaction.update({ where: { id: id("V1") }, data: { transferTransactionId: id("V2") } });
  });

  await creerLigne(prisma, { cle: "N1", accountId: compteA, date: "2099-03-11", montantCents: -300 });
  await creerLigne(prisma, { cle: "R1", accountId: compteA, date: "2099-03-09", montantCents: -200, extra: { aRevoir: true } });
  await creerLigne(prisma, {
    cle: "X1",
    accountId: compteA,
    date: "2099-03-08",
    montantCents: -100,
    extra: { exclureDuBudget: true },
  });
  await creerLigne(prisma, {
    cle: "X2",
    accountId: compteA,
    date: "2099-02-28",
    montantCents: 150,
    extra: { exclureDesRapports: true },
  });

  await exigerInvariants(prisma, { type: "TRANSACTIONS", ids: idsFixture });
});

afterAll(async () => {
  // Les étiquettes de transaction et les filles partent en cascade.
  await prisma.transaction.deleteMany({ where: { id: { in: idsFixture } } });
  if (lotId) await prisma.importBatch.delete({ where: { id: lotId } });
  if (payeeId) await prisma.payee.delete({ where: { id: payeeId } });
  if (etiquetteId) await prisma.tag.delete({ where: { id: etiquetteId } });
  await prisma.account.deleteMany({ where: { id: { in: [compteA, compteB] } } });
  await prisma.$disconnect();
});

/**
 * Un second utilisateur n'existe que le temps du describe qui en a besoin :
 * prisma/test/garde-schema.test.ts compte les utilisateurs du schéma partagé.
 */
async function creerAutreProprietaire(): Promise<void> {
  const u2 = await prisma.user.create({ data: { email: `lecture-u2-${M}@example.test` }, select: { id: true } });
  utilisateur2Id = u2.id;
  const compte = await prisma.account.create({
    data: { ownerId: utilisateur2Id, nom: `Lecture C ${M}`, dateSoldeInitial: versDateUtc("2099-01-01"), estBudgetaire: false },
    select: { id: true },
  });
  compteC = compte.id;
  const xu = await prisma.transaction.create({
    data: {
      ownerId: utilisateur2Id,
      accountId: compteC,
      date: versDateUtc("2099-03-15"),
      description: `Ligne XU ${M}`,
      descriptionNormalisee: "ligne xu",
      montantCents: -100,
      source: "COPIER_COLLER",
      empreinte: `lecture-XU-${M}`,
      aRevoir: true,
    },
    select: { id: true },
  });
  ids.XU = xu.id;
}

async function supprimerAutreProprietaire(): Promise<void> {
  await prisma.transaction.deleteMany({ where: { accountId: compteC } });
  await prisma.account.deleteMany({ where: { id: compteC } });
  await prisma.user.deleteMany({ where: { id: utilisateur2Id } });
}

const LIGNES_DE_LA_LISTE_A = ["E1", "E2", "E3", "E4", "E5", "E6", "TXT", "PCT", "P1000", "P", "V1", "N1", "R1", "X1", "X2"];

async function idsDe(partiel: Partial<CriteresTransactions>): Promise<string[]> {
  const page = await listerTransactions(ownerId, criteres(partiel), { champ: "DATE", ordre: "DESC" }, null, 100);
  return page.lignes.map((ligne) => ligne.id);
}

function noms(liste: readonly string[]): string[] {
  const inverse = new Map(Object.entries(ids).map(([nom, valeur]) => [valeur, nom]));
  return liste.map((valeur) => inverse.get(valeur) ?? valeur).sort();
}

describe("pagination par curseur", () => {
  const tris: TriTransactions[] = [
    { champ: "DATE", ordre: "DESC" },
    { champ: "DATE", ordre: "ASC" },
    { champ: "MONTANT", ordre: "ASC" },
    { champ: "MONTANT", ordre: "DESC" },
  ];

  it.each(tris)("sans doublon ni trou sur la fixture, tri %j", async (tri) => {
    const vues: { id: string; date: string; montantCents: number }[] = [];
    let curseur: CurseurTransactions | null = null;
    let nbPages = 0;
    do {
      const page: Awaited<ReturnType<typeof listerTransactions>> = await listerTransactions(
        ownerId,
        criteres({ comptes: [compteA] }),
        tri,
        curseur,
        4,
      );
      vues.push(...page.lignes);
      curseur = page.curseurSuivant;
      nbPages += 1;
    } while (curseur !== null && nbPages < 20);

    expect(new Set(vues.map((ligne) => ligne.id)).size).toBe(vues.length);
    expect(noms(vues.map((ligne) => ligne.id))).toEqual([...LIGNES_DE_LA_LISTE_A].sort());
    expect(vues.map((ligne) => ligne.id)).toEqual([...vues].sort((a, b) => comparerLignes(a, b, tri)).map((ligne) => ligne.id));
    expect(nbPages).toBe(4);
  });

  it.each(tris)("deux pages réelles sur le seed, tri %j", async (tri) => {
    const visa = await prisma.account.findFirstOrThrow({ where: { ownerId, nom: "Visa" }, select: { id: true } });
    const portee = criteres({ comptes: [visa.id], au: "2026-12-31" });
    const premiere = await listerTransactions(ownerId, portee, tri, null);
    expect(premiere.lignes).toHaveLength(50);
    expect(premiere.curseurSuivant).not.toBeNull();
    const seconde = await listerTransactions(ownerId, portee, tri, premiere.curseurSuivant);
    expect(seconde.lignes).toHaveLength(50);

    const idsPages = [...premiere.lignes, ...seconde.lignes].map((ligne) => ligne.id);
    expect(new Set(idsPages).size).toBe(100);

    const independantes = await prisma.transaction.findMany({
      where: { ownerId, accountId: visa.id, parentId: null, date: { lte: versDateUtc("2026-12-31") } },
      select: { id: true, date: true, montantCents: true },
      take: 5000,
    });
    const attendues = independantes
      .map((ligne) => ({ id: ligne.id, date: depuisDateUtc(ligne.date), montantCents: ligne.montantCents }))
      .sort((a, b) => comparerLignes(a, b, tri))
      .slice(0, 100)
      .map((ligne) => ligne.id);
    expect(idsPages).toEqual(attendues);
  });

  it("un curseur placé après la dernière ligne rend une page vide", async () => {
    const page = await listerTransactions(
      ownerId,
      criteres({ comptes: [compteA] }),
      { champ: "DATE", ordre: "ASC" },
      { champ: "DATE", date: "2099-03-15", id: "zzzzzzzzzzzzzzzzzzzzzzzzz" },
      4,
    );
    expect(page).toEqual({ lignes: [], curseurSuivant: null });
  });
});

describe("texte sans accents", () => {
  it("description", async () => {
    expect(noms(await idsDe({ comptes: [compteA, compteB], texte: `cafe depot lecture ${M.toLowerCase()}` }))).toEqual(["TXT"]);
  });

  it("note", async () => {
    expect(noms(await idsDe({ comptes: [compteA, compteB], texte: `CRÈME BRULEE ${M}` }))).toEqual(["TXT"]);
  });

  it("type d'opération", async () => {
    expect(noms(await idsDe({ comptes: [compteA], texte: "paiement preautorise" }))).toEqual(["TXT"]);
  });

  it("bénéficiaire", async () => {
    expect(noms(await idsDe({ comptes: [compteA, compteB], texte: `epicerie fine ${M}` }))).toEqual(["TXT"]);
  });

  it("échappe le « % » : « 100% » ne trouve pas « 1000 »", async () => {
    expect(noms(await idsDe({ comptes: [compteA], texte: `100% ${M}` }))).toEqual(["PCT"]);
  });

  it("la note d'une fille fait trouver son parent", async () => {
    expect(noms(await idsDe({ comptes: [compteA], texte: `pourboire ${M}` }))).toEqual(["P"]);
  });
});

describe("sous-catégorie et « non catégorisée »", () => {
  it("par la fille : Café → TXT et P, jamais une fille", async () => {
    expect(noms(await idsDe({ comptes: [compteA], sousCategories: [sousCatCafe] }))).toEqual(["P", "TXT"]);
  });

  it("Restaurant → aucune ; Épicerie → P seulement", async () => {
    expect(await idsDe({ comptes: [compteA], sousCategories: [sousCatRestaurant] })).toEqual([]);
    expect(noms(await idsDe({ comptes: [compteA], sousCategories: [sousCatEpicerie] }))).toEqual(["P"]);
  });

  it("non catégorisée : exclut les catégorisées, les virements et les parents aux filles catégorisées", async () => {
    const attendus = ["E1", "E2", "E3", "E4", "E5", "E6", "PCT", "P1000", "N1", "R1", "X1", "X2"].sort();
    expect(noms(await idsDe({ comptes: [compteA], nonCategorisee: true }))).toEqual(attendus);
  });
});

describe("états, montant, sens, bénéficiaire, étiquette, dates", () => {
  it("états", async () => {
    expect(noms(await idsDe({ comptes: [compteA], aRevoir: true }))).toEqual(["R1"]);
    expect(noms(await idsDe({ comptes: [compteA, compteB], virements: "SEULEMENT" }))).toEqual(["V1", "V2"]);
    expect(noms(await idsDe({ comptes: [compteA], virements: "EXCLURE" }))).toEqual(
      LIGNES_DE_LA_LISTE_A.filter((nom) => nom !== "V1").sort(),
    );
    expect(noms(await idsDe({ comptes: [compteA], ventileesSeulement: true }))).toEqual(["P"]);
    expect(noms(await idsDe({ comptes: [compteA], exclueDuBudget: true }))).toEqual(["X1"]);
    expect(noms(await idsDe({ comptes: [compteA], exclueDesRapports: true }))).toEqual(["X2"]);
  });

  it("montant sur la valeur absolue, et sens", async () => {
    expect(noms(await idsDe({ comptes: [compteA], montantMinCents: 1000, montantMaxCents: 2500 }))).toEqual(["E1", "E2", "E3", "E4"]);
    expect(noms(await idsDe({ comptes: [compteA], sens: "ENTREES" }))).toEqual(["E5", "X2"]);
    expect(noms(await idsDe({ comptes: [compteA], sens: "SORTIES" }))).toHaveLength(13);
  });

  it("un seuil de montant hors de la plage d'un entier 32 bits ne lève pas d'erreur", async () => {
    const hors = criteres({ comptes: [compteA], montantMinCents: 3_000_000_000 });
    expect(await idsDe({ comptes: [compteA], montantMinCents: 3_000_000_000 })).toEqual([]);
    expect(await totauxTransactions(ownerId, hors)).toEqual({ nombre: 0, sommeCents: 0 });
  });

  it("bénéficiaire et étiquette (par la fille)", async () => {
    expect(noms(await idsDe({ comptes: [compteA], beneficiaires: [payeeId] }))).toEqual(["TXT"]);
    expect(noms(await idsDe({ comptes: [compteA], etiquettes: [etiquetteId] }))).toEqual(["P"]);
  });

  it("dates : bornes incluses", async () => {
    expect(noms(await idsDe({ comptes: [compteA], du: "2099-03-15", au: "2099-03-15" }))).toEqual(["E1", "E2", "E3", "E4", "E5", "E6"]);
    expect(noms(await idsDe({ comptes: [compteA], au: "2099-02-28" }))).toEqual(["X2"]);
  });
});

describe("totaux", () => {
  it("compte le parent une fois, jamais ses filles", async () => {
    expect(await totauxTransactions(ownerId, criteres({ comptes: [compteA] }))).toEqual({ nombre: 15, sommeCents: -18200 });
  });

  it("filtrés par sous-catégorie", async () => {
    expect(await totauxTransactions(ownerId, criteres({ comptes: [compteA], sousCategories: [sousCatCafe] }))).toEqual({
      nombre: 2,
      sommeCents: -9450,
    });
  });
});

describe("lignes de la liste", () => {
  it("parent ventilé, virement, catégorie et bénéficiaire ; les filles ne sont pas des lignes", async () => {
    const page = await listerTransactions(ownerId, criteres({ comptes: [compteA, compteB] }), { champ: "DATE", ordre: "DESC" }, null, 100);
    const parNom = (nom: string) => page.lignes.find((ligne) => ligne.id === id(nom));

    const p = parNom("P");
    expect(p?.estVentilee).toBe(true);
    expect(p?.nbLignesVentilation).toBe(2);
    expect(new Set(p?.lignesVentilation.map((fille) => fille.id))).toEqual(new Set([id("F1"), id("F2")]));

    const v1 = parNom("V1");
    expect(v1?.virement).toEqual({ transactionId: id("V2"), compteId: compteB, compteNom: compteBNom });

    const txt = parNom("TXT");
    expect(txt?.categorieNom).not.toBeNull();
    expect(txt?.sousCategorieNom).toBe("Café");
    expect(txt?.beneficiaireNom).toBe(`Épicerie Fine ${M}`);

    expect(page.lignes.some((ligne) => ligne.id === id("F1") || ligne.id === id("F2"))).toBe(false);
  });
});

describe("détail", () => {
  it("TXT : tous les champs que M1 écrit", async () => {
    const detail = await lireTransaction(ownerId, id("TXT"));
    expect(detail).not.toBeNull();
    const lot = await prisma.importBatch.findUniqueOrThrow({ where: { id: lotId }, select: { importeLe: true } });
    expect(detail?.typeOperation).toBe("Paiement préautorisé");
    expect(detail?.note).toBe(`Crème brûlée ${M}`);
    expect(detail?.lotImport).toEqual({
      id: lotId,
      importeLeDate: dateCivileDansFuseau(lot.importeLe, FUSEAU_APPLICATION),
      libelle: `Lot lecture ${M}`,
      couvreDu: "2099-03-01",
      couvreAu: "2099-03-31",
    });
    expect(detail?.regle?.libelle).toBe("Épicerie IGA");
    expect(detail?.source).toBe("COPIER_COLLER");
    expect(detail?.etat).toBe("COMPTABILISEE");
    expect(detail?.rapprochement).toBe("NON_RAPPROCHEE");
    expect(detail?.externalId).toBeNull();
    expect(detail?.empreinte).toBe(`txt-${M}`);
  });

  it("V1 : la contrepartie porte date et montant", async () => {
    const detail = await lireTransaction(ownerId, id("V1"));
    expect(detail?.contrepartie).toEqual({
      transactionId: id("V2"),
      compteId: compteB,
      compteNom: compteBNom,
      date: "2099-03-12",
      montantCents: 5000,
      description: `Ligne V2 ${M}`,
    });
  });

  it("P et F2", async () => {
    expect((await lireTransaction(ownerId, id("P")))?.lignesVentilation).toHaveLength(2);
    expect((await lireTransaction(ownerId, id("F2")))?.parentId).toBe(id("P"));
  });
});

/**
 * Compare une lecture à un `count` indépendant, en tolérant les écritures
 * d'autres fichiers Vitest sur le même propriétaire (schéma partagé) : la
 * comparaison n'est tranchée que lorsque le compte n'a pas bougé autour de la lecture.
 */
async function compterARevoirStable(): Promise<{ lu: number; attendu: number }> {
  let dernier = { lu: -1, attendu: -2 };
  for (let essai = 0; essai < 10; essai += 1) {
    const avant = await prisma.transaction.count({ where: { ownerId, parentId: null, aRevoir: true } });
    const lu = await compterARevoir(ownerId);
    const apres = await prisma.transaction.count({ where: { ownerId, parentId: null, aRevoir: true } });
    dernier = { lu, attendu: avant };
    if (avant === apres) return dernier;
  }
  return dernier;
}

describe("appartenance", () => {
  // Un seul `it` : le second utilisateur n'existe que le temps de ses assertions,
  // car prisma/test/garde-schema.test.ts (G4) compte les utilisateurs du schéma partagé.
  it("un autre propriétaire ne voit rien ; compterARevoir et possedeDesTransactions", async () => {
    await creerAutreProprietaire();
    try {
      expect((await listerTransactions(ownerId, criteres({ comptes: [compteC] }), { champ: "DATE", ordre: "DESC" }, null)).lignes).toEqual([]);
      expect(await totauxTransactions(ownerId, criteres({ comptes: [compteC] }))).toEqual({ nombre: 0, sommeCents: 0 });
      expect(await lireTransaction(ownerId, id("XU"))).toBeNull();
      expect((await lireTransaction(utilisateur2Id, id("XU")))?.id).toBe(id("XU"));

      const { lu, attendu } = await compterARevoirStable();
      expect(lu).toBe(attendu);

      expect(await possedeDesTransactions(utilisateur2Id)).toBe(true);
      expect(await possedeDesTransactions("clx0000000000000000099999")).toBe(false);
    } finally {
      await supprimerAutreProprietaire();
    }
  });
});
