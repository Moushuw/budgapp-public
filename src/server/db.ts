// Client Prisma singleton — CLAUDE.md §7 : survit au rechargement à chaud du
// dev en s'accrochant à `globalThis`. Ce fichier et `src/server/repositories/*`
// sont les seuls à importer quoi que ce soit de `@prisma/client` (CLAUDE.md §4).

import { PrismaClient } from "@prisma/client";

const globalPourPrisma = globalThis as unknown as { prismaGlobal?: PrismaClient };

export const prisma: PrismaClient =
  globalPourPrisma.prismaGlobal ??
  new PrismaClient({
    log: process.env.NODE_ENV === "production" ? ["error"] : ["error", "warn"],
  });

if (process.env.NODE_ENV !== "production") {
  globalPourPrisma.prismaGlobal = prisma;
}
