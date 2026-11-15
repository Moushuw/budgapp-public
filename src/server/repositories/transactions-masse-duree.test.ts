// Mesure de la garde de masse en OR (docs/lot-m2.md §4.4) : une suppression de 5000 lignes, face au délai de la
// transaction. La durée mesurée couvre tout le geste (lecture, verrou ordonné, garde en OR, cascades) : c'est un
// majorant de la garde seule. Un compte jetable, des dates en 2097 : les autres fichiers écrivent en 2099.

import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { versDateUtc } from "@/domain/dates";
import { normaliserDescription } from "@/domain/ingestion";
import { modifierEnMasse } from "./transactions-ecriture";
import { TIMEOUT_TRANSACTION_MS } from "./transactions";

const prisma = new PrismaClient();

const M = "X" + randomUUID().replace(/-/g, "").slice(0, 9).toUpperCase();
const NOMBRE = 5000;
const MARGE = 4;

let ownerId: string;
let compteId: string;

beforeAll(async () => {
  const proprietaire = await prisma.user.findFirstOrThrow({ orderBy: { createdAt: "asc" } });
  ownerId = proprietaire.id;
  compteId = (
    await prisma.account.create({
      data: { ownerId, nom: `Duree ${M}`, dateSoldeInitial: versDateUtc("2097-01-01"), estBudgetaire: false },
      select: { id: true },
    })
  ).id;
  await prisma.transaction.createMany({
    data: Array.from({ length: NOMBRE }, (_, i) => {
      const description = `Duree ${String(i)} ${M}`;
      return {
        ownerId,
        accountId: compteId,
        date: versDateUtc("2097-06-15"),
        description,
        descriptionNormalisee: normaliserDescription(description),
        montantCents: -(i + 1),
        source: "MANUELLE" as const,
        empreinte: `duree-${String(i)}-${M}`,
      };
    }),
  });
}, 60_000);

afterAll(async () => {
  await prisma.transaction.deleteMany({ where: { accountId: compteId } });
  await prisma.account.deleteMany({ where: { id: compteId } });
  await prisma.$disconnect();
});

describe("garde de masse en OR", () => {
  it("MD1 — 5000 bras restent sous le quart du délai de la transaction", async () => {
    const lignes = await prisma.transaction.findMany({ where: { accountId: compteId }, select: { id: true }, take: NOMBRE });
    expect(lignes).toHaveLength(NOMBRE);
    const ids = lignes.map((l) => l.id);

    const t0 = performance.now();
    const r = await modifierEnMasse(ownerId, { type: "IDS", ids }, { type: "SUPPRIMER", virements: null });
    const duree = performance.now() - t0;

    expect(r.statut).toBe("APPLIQUE");
    if (r.statut === "APPLIQUE") {
      expect(r.compteRendu.traitees).toBe(NOMBRE);
    }
    expect(await prisma.transaction.count({ where: { accountId: compteId } })).toBe(0);
    expect(
      duree,
      `garde de masse en OR, ${String(NOMBRE)} bras : ${String(Math.round(duree))} ms mesurés, plafond ${String(TIMEOUT_TRANSACTION_MS / MARGE)} ms (TIMEOUT_TRANSACTION_MS / ${String(MARGE)})`,
    ).toBeLessThan(TIMEOUT_TRANSACTION_MS / MARGE);
  }, 120_000);
});
