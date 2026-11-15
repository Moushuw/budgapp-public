// Test d'intégration des comptes liés — docs/lot-m1.md §4.1 (A5, amendement du
// 1er octobre 2026). Même forme que src/server/actions/import.test.ts : écrit
// dans la base de test (schéma `test`, seedée à chaque lancement de Vitest), noms uniques par
// randomUUID, nettoyage complet en afterAll.

import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { EntreeCompte } from "@/features/accounts/schema";
import { creerCompte } from "./accounts";

const prisma = new PrismaClient();

const idsPassifs: string[] = [];
const idsActifs: string[] = [];

let ownerId: string;

beforeAll(async () => {
  const owner = await prisma.user.findFirstOrThrow({ orderBy: { createdAt: "asc" } });
  ownerId = owner.id;
});

afterAll(async () => {
  const ids = [...idsPassifs, ...idsActifs];
  await prisma.transaction.deleteMany({ where: { accountId: { in: ids } } });
  await prisma.account.deleteMany({ where: { id: { in: idsPassifs } } });
  await prisma.account.deleteMany({ where: { id: { in: idsActifs } } });
  await prisma.$disconnect();
});

function nomUnique(prefixe: string): string {
  return `${prefixe} ${randomUUID().slice(0, 8)}`;
}

function entreeCompte(overrides: Partial<EntreeCompte>): EntreeCompte {
  return {
    nom: nomUnique("TEST_COMPTE"),
    type: "CHEQUE",
    institution: null,
    soldeInitialCents: "0,00",
    dateSoldeInitial: "2026-01-01",
    estBudgetaire: false,
    inclureDansPrevision: true,
    inclureDansValeurNette: true,
    perdDelaiDeGrace: true,
    archive: false,
    seuilSecuriteCents: "",
    ordre: "0",
    limiteCreditCents: "",
    tauxAnnuel: "",
    jourReleve: "",
    jourEcheance: "",
    regimeFiscal: "NON_ENREGISTRE",
    tauxRendementAnnuel: "",
    compteLieId: null,
    ...overrides,
  };
}

describe("accounts.ts — creerCompte, comptes liés (A5)", () => {
  it("A5-1. un actif porte deux passifs : les trois créations réussissent, deux comptes pointent sur l'actif", async () => {
    const actif = await creerCompte(entreeCompte({ type: "ACTIF" }));
    expect(actif.ok).toBe(true);
    if (!actif.ok) return;
    idsActifs.push(actif.data.id);

    const pret = await creerCompte(entreeCompte({ type: "PRET", compteLieId: actif.data.id }));
    expect(pret.ok).toBe(true);
    if (pret.ok) idsPassifs.push(pret.data.id);

    const passif = await creerCompte(entreeCompte({ type: "PASSIF", compteLieId: actif.data.id }));
    expect(passif.ok).toBe(true);
    if (passif.ok) idsPassifs.push(passif.data.id);

    expect(await prisma.account.count({ where: { ownerId, compteLieId: actif.data.id } })).toBe(2);
  });

  it("A5-2. un second compte au nom de l'actif est refusé avec le message qui ne parle que du nom", async () => {
    const nom = nomUnique("TEST_ACTIF_DOUBLON");
    const actif = await creerCompte(entreeCompte({ type: "ACTIF", nom }));
    expect(actif.ok).toBe(true);
    if (!actif.ok) return;
    idsActifs.push(actif.data.id);

    const doublon = await creerCompte(entreeCompte({ type: "ACTIF", nom }));
    expect(doublon.ok).toBe(false);
    if (doublon.ok) return;
    expect(doublon.code).toBe("DUPLICATE");
    expect(doublon.message).toBe("Un compte porte déjà ce nom.");

    expect(await prisma.account.count({ where: { ownerId, nom } })).toBe(1);
  });
});
