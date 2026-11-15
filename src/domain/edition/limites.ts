/** Borne de tout balayage et de toute sélection en masse — docs/lot-m2.md §6.4. Était déclarée dans server/repositories/transactions.ts. */
export const LIMITE_BALAYAGE = 5000;
/** |montantCents| maximal : Transaction.montantCents est un Int PostgreSQL (32 bits). Symétrique, pour que −M reste représentable. */
export const MONTANT_MAX_CENTS = 2_147_483_647;
