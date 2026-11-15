// Test d'intégration du balayage rétroactif : lecture sous un instantané unique.
// Schéma `test`, dates en 2095, nettoyage en afterAll.

import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { versDateUtc } from "@/domain/dates";
import { prisma } from "@/server/db";
import { balayerTransactions } from "./transactions";

const M = randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase();
const FENETRE = { du: "2095-01-01", au: "2095-12-31" } as const;

let ownerId: string;
let compteId: string;
let sousCategorieId: string;
let sousCategorieNom: string;
let compteNom: string;
const idsCrees: string[] = [];

async function creerLigne(cle: string, date: string, extra: Record<string, unknown> = {}): Promise<string> {
  const ligne = await prisma.transaction.create({
    data: {
      ownerId,
      accountId: compteId,
      date: versDateUtc(date),
      description: `Balayage ${cle} ${M}`,
      descriptionNormalisee: `balayage ${cle} ${M}`.toLowerCase(),
      montantCents: -1000,
      source: "COPIER_COLLER",
      empreinte: `balayage-${cle}-${M}`,
      ...extra,
    },
    select: { id: true },
  });
  idsCrees.push(ligne.id);
  return ligne.id;
}

beforeAll(async () => {
  const proprietaire = await prisma.user.findFirstOrThrow({ orderBy: { createdAt: "asc" } });
  ownerId = proprietaire.id;
  compteNom = `Balayage ${M}`;
  compteId = (
    await prisma.account.create({
      data: { ownerId, nom: compteNom, dateSoldeInitial: versDateUtc("2095-01-01"), estBudgetaire: false },
      select: { id: true },
    })
  ).id;
  const sousCategorie = await prisma.subcategory.findFirstOrThrow({
    where: { category: { ownerId } },
    select: { id: true, nom: true },
  });
  sousCategorieId = sousCategorie.id;
  sousCategorieNom = sousCategorie.nom;

  await creerLigne("B", "2095-06-10", { subcategoryId: sousCategorieId });
  await creerLigne("A", "2095-06-10");
  const parent = await creerLigne("P", "2095-03-01", { estVentilee: true });
  await creerLigne("F", "2095-03-01", { parentId: parent });
});

afterAll(async () => {
  await prisma.transaction.deleteMany({ where: { id: { in: idsCrees }, parentId: { not: null } } });
  await prisma.transaction.deleteMany({ where: { id: { in: idsCrees } } });
  await prisma.account.deleteMany({ where: { id: compteId } });
});

describe("balayerTransactions", () => {
  it("B1 — rend les lignes dans l'ordre (date desc, id asc), avec les noms de relation", async () => {
    const resultat = await balayerTransactions(ownerId, FENETRE);
    const nos = resultat.lignes.filter((l) => l.accountId === compteId);
    expect(resultat.tronque).toBe(false);
    expect(nos.map((l) => l.date)).toEqual(["2095-06-10", "2095-06-10", "2095-03-01"]);
    const memeDate = nos.slice(0, 2).map((l) => l.id);
    expect([...memeDate].sort()).toEqual(memeDate);
    for (const ligne of nos) {
      expect(ligne.compteNom).toBe(compteNom);
    }
    const avecSousCategorie = nos.find((l) => l.subcategoryId === sousCategorieId);
    expect(avecSousCategorie?.sousCategorieNom).toBe(sousCategorieNom);
  });

  it("B2 — une seule prisma.$transaction en RepeatableRead, aucun findMany direct", async () => {
    const espionTransaction = vi.spyOn(prisma, "$transaction");
    const espionFindMany = vi.spyOn(prisma.transaction, "findMany");
    try {
      await balayerTransactions(ownerId, FENETRE);
      expect(espionTransaction).toHaveBeenCalledTimes(1);
      expect(espionTransaction.mock.calls[0]?.[1]).toMatchObject({ isolationLevel: "RepeatableRead" });
      expect(espionFindMany).not.toHaveBeenCalled();
    } finally {
      espionTransaction.mockRestore();
      espionFindMany.mockRestore();
    }
  });

  it("B3 — un propriétaire sans ligne rend une liste vide ; les lignes filles sont exclues", async () => {
    const autre = await balayerTransactions(`inconnu-${M}`, FENETRE);
    expect(autre).toEqual({ lignes: [], tronque: false });
    const resultat = await balayerTransactions(ownerId, FENETRE);
    expect(resultat.lignes.every((l) => l.parentId === null)).toBe(true);
    expect(resultat.lignes.filter((l) => l.accountId === compteId)).toHaveLength(3);
  });
});
