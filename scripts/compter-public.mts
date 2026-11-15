import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { lireDatabaseUrlSource } from "../prisma/test/environnement.mts";

const RACINE = fileURLToPath(new URL("../", import.meta.url));

const url = lireDatabaseUrlSource(RACINE);
if (url === undefined) {
  process.stderr.write("DATABASE_URL est absente.\n");
  process.exit(1);
}

const prisma = new PrismaClient({ datasourceUrl: url });
try {
  const lignes = await prisma.$queryRaw<Record<string, bigint>[]>`
    SELECT
      (SELECT count(*) FROM public."User") AS "User",
      (SELECT count(*) FROM public."Account") AS "Account",
      (SELECT count(*) FROM public."Category") AS "Category",
      (SELECT count(*) FROM public."Subcategory") AS "Subcategory",
      (SELECT count(*) FROM public."Payee") AS "Payee",
      (SELECT count(*) FROM public."Tag") AS "Tag",
      (SELECT count(*) FROM public."Rule") AS "Rule",
      (SELECT count(*) FROM public."ImportFilter") AS "ImportFilter",
      (SELECT count(*) FROM public."ImportBatch") AS "ImportBatch",
      (SELECT count(*) FROM public."Transaction") AS "Transaction"
  `;
  const premiere = lignes[0] ?? {};
  const sortie = Object.fromEntries(Object.entries(premiere).map(([table, n]) => [table, Number(n)]));
  process.stdout.write(`${JSON.stringify(sortie)}\n`);
} finally {
  await prisma.$disconnect();
}
