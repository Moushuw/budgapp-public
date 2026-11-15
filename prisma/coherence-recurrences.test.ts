// Vérifications de cohérence du seed pour les récurrences — docs/lot-m3.md §7.
// Ce test lit la base de test (schéma `test` de budgapp_dev), migrée et seedée par prisma/test/preparer-base-de-test.ts à chaque lancement de Vitest ; il ne touche jamais la base de dev.
// CR3 et CR4 lisent l'état des cinq règles du seed : un test d'intégration qui écrit doit travailler sur ses propres règles.

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { depuisDateUtc, echeances, versDateUtc, type DateCivile } from "../src/domain/dates";
import { etatAffiche } from "../src/domain/recurrence";
import { verifierInvariantsOccurrences } from "./test/invariants-occurrences";

const prisma = new PrismaClient();

// Le AUJOURDHUI de prisma/seed.ts.
const SEED_AUJOURDHUI: DateCivile = "2026-09-13";

const LIBELLES_SEED = ["Hydro-Québec", "Internet", "Assurance auto", "Dépôt paie", "Versement hypothécaire", "Streaming"];

const ATTENDU_PAR_REGLE: Record<string, { total: number; REALISEE: number; PREVUE: number; MANQUEE: number }> = {
  "Hydro-Québec": { total: 22, REALISEE: 19, PREVUE: 3, MANQUEE: 0 },
  Internet: { total: 22, REALISEE: 18, PREVUE: 4, MANQUEE: 0 },
  "Assurance auto": { total: 22, REALISEE: 17, PREVUE: 4, MANQUEE: 1 },
  "Dépôt paie": { total: 48, REALISEE: 40, PREVUE: 8, MANQUEE: 0 },
  "Versement hypothécaire": { total: 22, REALISEE: 19, PREVUE: 3, MANQUEE: 0 },
};

let ownerId: string;

beforeAll(async () => {
  const owner = await prisma.user.findFirstOrThrow({ orderBy: { createdAt: "asc" } });
  ownerId = owner.id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function reglesDuSeed() {
  return prisma.recurringRule.findMany({
    where: { ownerId, libelle: { in: LIBELLES_SEED } },
    select: { id: true, libelle: true, toleranceJours: true },
  });
}

describe("cohérence des récurrences du seed (docs/lot-m3.md §7)", () => {
  it("CR1 — invariants 1 à 5 sur toute la base", async () => {
    const bilan = await verifierInvariantsOccurrences(prisma, { type: "BASE" });
    expect(bilan.ecarts).toEqual([]);
    expect(bilan.nbOccurrences).toBeGreaterThanOrEqual(136);
    expect(bilan.nbReconciliations).toBeGreaterThanOrEqual(1);
  });

  it("CR2 — cinq règles confirmées, Streaming (Netflix) absente", async () => {
    const regles = await reglesDuSeed();
    expect(regles.map((r) => r.libelle).sort()).toEqual([
      "Assurance auto",
      "Dépôt paie",
      "Hydro-Québec",
      "Internet",
      "Versement hypothécaire",
    ]);
  });

  it("CR3 — occurrences par état, règle par règle", async () => {
    const regles = await reglesDuSeed();
    for (const regle of regles) {
      const attendu = ATTENDU_PAR_REGLE[regle.libelle];
      expect(attendu, regle.libelle).toBeDefined();
      const groupes = await prisma.expectedOccurrence.groupBy({
        by: ["etat"],
        where: { ruleId: regle.id },
        _count: { _all: true },
      });
      const compte = (etat: string): number => groupes.find((g) => g.etat === etat)?._count._all ?? 0;
      expect(
        {
          total: groupes.reduce((somme, g) => somme + g._count._all, 0),
          REALISEE: compte("REALISEE"),
          PREVUE: compte("PREVUE"),
          MANQUEE: compte("MANQUEE"),
        },
        regle.libelle,
      ).toEqual(attendu);
    }
  });

  it("CR3b — toutes les occurrences REALISEE du seed ont une liaison RETROACTIVE", async () => {
    const regles = await reglesDuSeed();
    const autres = await prisma.expectedOccurrence.count({
      where: { ruleId: { in: regles.map((r) => r.id) }, etat: "REALISEE", NOT: { liaison: "RETROACTIVE" } },
    });
    expect(autres).toBe(0);
  });

  it("CR4 — l'unique MANQUEE d'Assurance auto est passée et non liée", async () => {
    const regle = await prisma.recurringRule.findFirstOrThrow({
      where: { ownerId, libelle: "Assurance auto" },
      select: { id: true, toleranceJours: true },
    });
    const manquees = await prisma.expectedOccurrence.findMany({
      where: { ruleId: regle.id, etat: "MANQUEE" },
      select: { echeance: true, etat: true, transactionId: true },
      take: 5,
    });
    expect(manquees).toHaveLength(1);
    const manquee = manquees[0];
    expect(manquee).toBeDefined();
    if (manquee === undefined) return;
    expect(depuisDateUtc(manquee.echeance)).toBe("2026-06-20");
    expect(manquee.transactionId).toBeNull();
    expect(etatAffiche({ echeance: depuisDateUtc(manquee.echeance), etat: manquee.etat }, regle.toleranceJours, "2026-09-13")).toBe(
      "MANQUEE",
    );
  });

  it("CR5 — les 19 prélèvements Netflix existent toujours, identiques", async () => {
    const transactions = await prisma.transaction.findMany({
      where: {
        ownerId,
        account: { nom: "Visa" },
        descriptionNormalisee: "NETFLIX.COM",
        date: { lte: versDateUtc("2026-09-13") },
        parentId: null,
      },
      select: { date: true, montantCents: true, payeeId: true, subcategory: { select: { nom: true } } },
      orderBy: { date: "asc" },
    });
    expect(transactions.map((t) => depuisDateUtc(t.date))).toEqual(echeances("MENSUEL", "2025-03-12", "2026-09-13"));
    expect(transactions).toHaveLength(19);
    for (const t of transactions) {
      expect(t.montantCents).toBe(-1799);
      expect(t.subcategory?.nom).toBe("Streaming");
      expect(t.payeeId).toBeNull();
    }
  });

  it("CR6 — invariants 1 à 7 sur les règles du seed", async () => {
    const regles = await reglesDuSeed();
    const bilan = await verifierInvariantsOccurrences(
      prisma,
      { type: "REGLES", ruleIds: regles.map((r) => r.id) },
      { montantsAVenir: { aujourdhui: SEED_AUJOURDHUI } },
    );
    expect(bilan.ecarts).toEqual([]);
    expect(bilan.nbOccurrences).toBe(136);
  });

  it("CR7 — montants signés des règles du seed, échéances à venir au montant de la règle", async () => {
    const regles = await prisma.recurringRule.findMany({
      where: { ownerId, libelle: { in: LIBELLES_SEED } },
      select: { id: true, libelle: true, montantCents: true },
    });
    expect(Object.fromEntries(regles.map((r) => [r.libelle, r.montantCents]))).toEqual({
      "Hydro-Québec": -10500,
      Internet: -8499,
      "Assurance auto": -14200,
      "Dépôt paie": 240600,
      "Versement hypothécaire": -198000,
    });
    const attendu: Record<string, number> = {
      "Hydro-Québec": 3,
      Internet: 4,
      "Assurance auto": 4,
      "Dépôt paie": 8,
      "Versement hypothécaire": 3,
    };
    for (const regle of regles) {
      expect(regle.montantCents).not.toBeNull();
      const nb = await prisma.expectedOccurrence.count({
        where: {
          ruleId: regle.id,
          transactionId: null,
          etat: "PREVUE",
          echeance: { gte: versDateUtc(SEED_AUJOURDHUI) },
          montantCents: regle.montantCents ?? 0,
        },
      });
      expect(nb, regle.libelle).toBe(attendu[regle.libelle]);
    }
  });
});
