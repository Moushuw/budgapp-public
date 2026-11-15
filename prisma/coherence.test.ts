// Vérifications de cohérence du seed — docs/lot-m0-revision.md §5.
// Ce test lit la base de test (schéma `test` de budgapp_dev), migrée et seedée par prisma/test/preparer-base-de-test.ts à chaque lancement de Vitest ; il ne touche jamais la base de dev.

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { disponible, report, resteAAssigner, type ModeReport } from "../src/domain/budget";
import { depuisDateUtc, moisDe, moisSuivant } from "../src/domain/dates";
import { verifierInvariants, type BilanInvariants, type EcartInvariant } from "./test/invariants";

const prisma = new PrismaClient();

let ownerId: string;
let moisBudget: string[] = [];

// Lignes brutes rapatriées une seule fois (beforeAll), jamais un agrégat
// Postgres par sous-catégorie × mois : la somme se fait ci-dessous, en JS,
// avec une arithmétique indépendante de toute requête du code applicatif.
// Sans ce regroupement en mémoire, le test §3 fait 216 sous-catégories × 12
// mois = 432 allers-retours séquentiels vers une base distante — cf. journal
// INDEX.md du 2026-09-19.
const allocationParCle = new Map<string, number>(); // clé: `${subcategoryId}|${mois}`
const activiteParCle = new Map<string, number>(); // clé: `${subcategoryId}|${mois}`

beforeAll(async () => {
  const owner = await prisma.user.findFirstOrThrow({ orderBy: { createdAt: "asc" } });
  ownerId = owner.id;

  const allocations = await prisma.budgetAllocation.findMany({
    where: { ownerId },
    select: { subcategoryId: true, mois: true, montantAssigneCents: true },
    orderBy: { mois: "asc" },
  });
  moisBudget = [...new Set(allocations.map((a) => a.mois))];
  expect(moisBudget.length).toBeGreaterThan(0); // la base doit être seedée avant ce test

  for (const a of allocations) {
    if (a.subcategoryId === null) continue;
    allocationParCle.set(`${a.subcategoryId}|${a.mois}`, a.montantAssigneCents);
  }

  const transactions = await prisma.transaction.findMany({
    where: { ownerId, exclureDuBudget: false, subcategoryId: { not: null } },
    select: { subcategoryId: true, date: true, montantCents: true },
  });
  for (const t of transactions) {
    if (t.subcategoryId === null) continue;
    const mois = moisDe(depuisDateUtc(t.date));
    const cle = `${t.subcategoryId}|${mois}`;
    activiteParCle.set(cle, (activiteParCle.get(cle) ?? 0) + t.montantCents);
  }
});

afterAll(async () => {
  await prisma.$disconnect();
});

// ───────────────────────── 1. virements : paires symétriques

function ecarts(bilan: BilanInvariants, invariant: number): readonly EcartInvariant[] {
  return bilan.ecarts.filter((e) => e.invariant === invariant);
}

describe("1. chaque virement est une paire symétrique liée", () => {
  it("T1.montantCents + T2.montantCents = 0, et les deux pointent l'un vers l'autre", async () => {
    const bilan = await verifierInvariants(prisma, { type: "BASE" });
    expect(bilan.nbCotesVirement).toBeGreaterThan(0);
    expect(ecarts(bilan, 1)).toEqual([]);
  });
});

// ───────────────────────── 2. ventilations : somme des filles = parent

describe("2. chaque parent ventilé égale la somme de ses lignes filles", () => {
  it("Σ enfants = parent, pour chaque transaction ventilée", async () => {
    const bilan = await verifierInvariants(prisma, { type: "BASE" });
    expect(bilan.nbParentsVentiles).toBeGreaterThan(0);
    expect(ecarts(bilan, 2)).toEqual([]);
  });
});

// ───────────────────────── helpers partagés (activité, allocations)

function activiteDuMois(subcategoryId: string, mois: string): number {
  return activiteParCle.get(`${subcategoryId}|${mois}`) ?? 0;
}

function alloueDuMois(subcategoryId: string, mois: string): number {
  return allocationParCle.get(`${subcategoryId}|${mois}`) ?? 0;
}

// ───────────────────────── 3. disponible = report + assigné + activité

describe("3. le disponible de chaque enveloppe respecte la formule, mois après mois", () => {
  it("disponible(s, m) = report(s, m) + alloué(s, m) + activité(s, m), en cascade", async () => {
    const subcategories = await prisma.subcategory.findMany({
      where: { allocations: { some: { ownerId } } },
    });
    expect(subcategories.length).toBeGreaterThan(0);

    for (const subcategorie of subcategories) {
      let dispoPrecedent = 0;
      for (const mois of moisBudget) {
        const alloue = alloueDuMois(subcategorie.id, mois);
        const activite = activiteDuMois(subcategorie.id, mois);
        const modeEffectif: ModeReport = subcategorie.reportActif ? subcategorie.reportMode : "AUCUN";
        const rep = report(dispoPrecedent, modeEffectif);
        const dispo = disponible(rep, alloue, activite);

        expect(dispo).toBe(rep + alloue + activite);
        dispoPrecedent = dispo;
      }
    }
  });

  it("Épicerie (AUCUN) ne reporte jamais, même après un mois excédentaire", async () => {
    const epicerie = await prisma.subcategory.findFirstOrThrow({ where: { nom: "Épicerie" } });
    expect(epicerie.reportMode).toBe("AUCUN");

    const premierMois = moisBudget[0];
    expect(premierMois).toBeDefined();
    if (!premierMois) return;
    const activite = activiteDuMois(epicerie.id, premierMois);
    const alloue = alloueDuMois(epicerie.id, premierMois);
    const dispoMois1 = disponible(report(999_999, "AUCUN"), alloue, activite);
    // Le report est nul quel que soit le disponible précédent.
    expect(dispoMois1).toBe(alloue + activite);
  });

  it("le dépassement réel de mars 2026 au restaurant (SIGNE) se propage à avril", async () => {
    const restaurant = await prisma.subcategory.findFirstOrThrow({ where: { nom: "Restaurant" } });
    expect(restaurant.reportMode).toBe("SIGNE");
    expect(moisBudget).toContain("2026-03");

    let dispoPrecedent = 0;
    for (const mois of moisBudget) {
      const alloue = alloueDuMois(restaurant.id, mois);
      const activite = activiteDuMois(restaurant.id, mois);
      dispoPrecedent = disponible(report(dispoPrecedent, "SIGNE"), alloue, activite);
      if (mois === "2026-03") {
        expect(dispoPrecedent).toBeLessThan(0); // le dépassement volontaire du seed
      }
      if (mois === moisSuivant("2026-03") && moisBudget.includes(moisSuivant("2026-03"))) {
        // Le report négatif de mars a bien réduit le disponible d'avril.
        const alloueAvril = alloueDuMois(restaurant.id, "2026-04");
        const activiteAvril = activiteDuMois(restaurant.id, "2026-04");
        expect(dispoPrecedent).toBeLessThan(alloueAvril + activiteAvril);
      }
    }
  });

  it("Essence (POSITIF_SEULEMENT) ne reporte jamais un solde négatif", async () => {
    const essence = await prisma.subcategory.findFirstOrThrow({ where: { nom: "Essence" } });
    expect(essence.reportMode).toBe("POSITIF_SEULEMENT");
    expect(report(-12_345, essence.reportMode)).toBe(0);
    expect(report(12_345, essence.reportMode)).toBe(12_345);
  });
});

// ───────────────────────── 4. les allocations ne dépassent jamais les revenus disponibles

describe("4. le total des allocations d'un mois ne dépasse jamais les revenus cumulés disponibles", () => {
  it("resteAAssigner reste positif ou nul à chaque mois du budget", async () => {
    let reste = 0;

    for (const mois of moisBudget) {
      const paie = await prisma.subcategory.findFirst({ where: { nom: "Paie" } });
      const autresRevenus = await prisma.subcategory.findFirst({ where: { nom: "Autres revenus" } });
      const revenusPaie = paie ? activiteDuMois(paie.id, mois) : 0;
      const revenusAutres = autresRevenus ? activiteDuMois(autresRevenus.id, mois) : 0;
      const revenus = revenusPaie + revenusAutres;

      const allocationsAgg = await prisma.budgetAllocation.aggregate({
        where: { ownerId, mois },
        _sum: { montantAssigneCents: true },
      });
      const mouvementsDepuisReste = await prisma.moneyMovement.aggregate({
        where: { ownerId, mois, deId: null, annuleLe: null },
        _sum: { montantCents: true },
      });
      const mouvementsVersReste = await prisma.moneyMovement.aggregate({
        where: { ownerId, mois, versId: null, annuleLe: null },
        _sum: { montantCents: true },
      });

      const allocations =
        (allocationsAgg._sum.montantAssigneCents ?? 0) +
        (mouvementsDepuisReste._sum.montantCents ?? 0) -
        (mouvementsVersReste._sum.montantCents ?? 0);

      reste = resteAAssigner(reste, revenus, allocations);
      expect(reste, `reste à assigner négatif en ${mois}`).toBeGreaterThanOrEqual(0);
    }
  });
});

// ───────────────────────── 5. aucun virement ni parent ventilé dans l'activité

describe("5. aucun virement et aucun parent ventilé n'apparaît dans l'activité d'une enveloppe", () => {
  it("une transaction catégorisée n'est jamais un virement ni un parent ventilé", async () => {
    const bilan = await verifierInvariants(prisma, { type: "BASE" });
    expect(ecarts(bilan, 5)).toEqual([]);
  });
});
