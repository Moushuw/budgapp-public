// Vérifie la cohérence du seed — docs/lot-m0.md §2.4 : pour chaque compte,
// soldeInitialCents + somme des transactions (lignes filles exclues : le parent
// porte le montant, docs/lot-m3.md §3.7) doit égaler le dernier relevé
// de solde, sauf le compte à l'écart volontaire (Épargne — voir seed.ts).
//
// Ce test lit la base de test (schéma `test` de budgapp_dev), migrée et seedée par prisma/test/preparer-base-de-test.ts à chaque lancement de Vitest ; il ne touche jamais la base de dev.

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";

const prisma = new PrismaClient();

const COMPTE_A_ECART_VOLONTAIRE = "Épargne";

const COMPTES_DU_SEED = ["Chèque", "Épargne", "Visa", "Marge", "CELIAPP", "REER", "Maison", "Hypothèque"] as const;

let comptes: { id: string; nom: string; soldeInitialCents: number }[] = [];

beforeAll(async () => {
  // Seulement les huit comptes du seed : d'autres tests créent des comptes (et des écarts volontaires) dans le même schéma.
  const proprietaire = await prisma.user.findFirstOrThrow({ orderBy: { createdAt: "asc" }, select: { id: true } });
  comptes = await prisma.account.findMany({
    where: { ownerId: proprietaire.id, nom: { in: [...COMPTES_DU_SEED] } },
    select: { id: true, nom: true, soldeInitialCents: true },
  });
  expect(comptes).toHaveLength(COMPTES_DU_SEED.length);
  expect(comptes.length).toBeGreaterThan(0); // la base doit être seedée avant ce test
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("cohérence des soldes après le seed", () => {
  it("chaque compte réconcilie avec son dernier relevé, sauf l'écart volontaire", async () => {
    for (const compte of comptes) {
      const dernierReleve = await prisma.balanceStatement.findFirst({
        where: { accountId: compte.id },
        orderBy: { date: "desc" },
      });
      if (!dernierReleve) {
        continue;
      }

      const agregat = await prisma.transaction.aggregate({
        where: { accountId: compte.id, parentId: null, date: { lte: dernierReleve.date } },
        _sum: { montantCents: true },
      });
      const soldeCalcule = compte.soldeInitialCents + (agregat._sum.montantCents ?? 0);

      if (compte.nom === COMPTE_A_ECART_VOLONTAIRE) {
        expect(dernierReleve.soldeCents).not.toBe(soldeCalcule);

        const reconciliation = await prisma.reconciliation.findUnique({
          where: { statementId: dernierReleve.id },
        });
        expect(reconciliation).not.toBeNull();
        expect(reconciliation?.ecartCents).toBe(dernierReleve.soldeCents - soldeCalcule);
      } else {
        expect(dernierReleve.soldeCents).toBe(soldeCalcule);
      }
    }
  });

  it("tous les identifiants de transaction et les groupeId de mouvement sont des cuid", async () => {
    const cuid = z.string().cuid();
    const transactions = await prisma.transaction.findMany({ select: { id: true } });
    expect(transactions.length).toBeGreaterThan(0);
    for (const { id } of transactions) {
      expect(cuid.safeParse(id).success).toBe(true);
    }

    const mouvements = await prisma.moneyMovement.findMany({
      where: { groupeId: { not: null } },
      select: { groupeId: true },
    });
    expect(mouvements.length).toBeGreaterThan(0);
    for (const { groupeId } of mouvements) {
      expect(cuid.safeParse(groupeId).success).toBe(true);
    }
  });
});
