// Garde d'isolation : les tests d'intégration lisent le schéma `test`, par
// src/server/db.ts comme par un PrismaClient construit dans le test. Lecture seule.

import { PrismaClient } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";
import { prisma as prismaApplication } from "@/server/db";
import { estUrlBaseDeTest } from "./url-base-de-test.mts";

const prismaLocal = new PrismaClient();

// E-mail de l'utilisateur du seed (prisma/seed.ts) ; les utilisateurs jetables des
// tests d'intégration portent un e-mail d'un de ces domaines de test.
const EMAIL_SEED = "demo@budgapp.example";
const DOMAINES_DE_TEST = ["@example.test", "@exemple.invalid"];

afterAll(async () => {
  await prismaLocal.$disconnect();
});

describe("isolation du schéma test", () => {
  it("G1 DATABASE_URL vise le schéma test", () => {
    expect(estUrlBaseDeTest(process.env.DATABASE_URL ?? "")).toBe(true);
  });

  it("G2 src/server/db.ts lit current_schema() = test", async () => {
    const lignes = await prismaApplication.$queryRaw<{ schema: string }[]>`SELECT current_schema() AS "schema"`;
    expect(lignes).toEqual([{ schema: "test" }]);
  });

  it("G3 un PrismaClient local lit current_schema() = test", async () => {
    const lignes = await prismaLocal.$queryRaw<{ schema: string }[]>`SELECT current_schema() AS "schema"`;
    expect(lignes).toEqual([{ schema: "test" }]);
  });

  it("G4 le schéma test est seedé (un seul utilisateur du seed, hors utilisateurs jetables des tests)", async () => {
    const utilisateurs = await prismaLocal.user.findMany({ select: { email: true } });
    const duSeed = utilisateurs.filter(({ email }) => !DOMAINES_DE_TEST.some((domaine) => email.endsWith(domaine)));
    expect(duSeed.map(({ email }) => email)).toEqual([EMAIL_SEED]);
  });
});
