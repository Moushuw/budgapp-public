import { Prisma } from "@prisma/client";

/**
 * Verrouille les lignes en jeu, dans l'ordre croissant des id, avant toute lecture. L'index unique sur
 * transferTransactionId est une seconde ressource que deux liaisons concurrentes prennent avant le verrou de la ligne
 * elle-même : sans verrou préalable, la perdante lit un état périmé puis échoue en P2002 ou en interblocage au lieu de
 * lire l'état validé et de rendre son refus métier.
 */
export async function verrouillerTransactions(
  tx: Prisma.TransactionClient,
  ownerId: string,
  ids: readonly string[],
): Promise<void> {
  if (ids.length === 0) {
    return;
  }
  await tx.$queryRaw`SELECT "id" FROM "Transaction" WHERE "id" IN (${Prisma.join([...ids])}) AND "ownerId" = ${ownerId} ORDER BY "id" FOR UPDATE`;
}

/** Verrouille des occurrences du propriétaire (par leur règle), id croissants. Toujours APRÈS verrouillerTransactions. */
export async function verrouillerOccurrences(
  tx: Prisma.TransactionClient,
  ownerId: string,
  ids: readonly string[],
): Promise<void> {
  if (ids.length === 0) {
    return;
  }
  await tx.$queryRaw`SELECT o."id" FROM "ExpectedOccurrence" o JOIN "RecurringRule" r ON r."id" = o."ruleId" WHERE o."id" IN (${Prisma.join([...ids])}) AND r."ownerId" = ${ownerId} ORDER BY o."id" FOR UPDATE OF o`;
}
