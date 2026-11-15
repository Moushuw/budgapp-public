import { FILTRES_VIDES, TRI_PAR_DEFAUT } from "@/domain/consultation";
import type { DateCivile } from "@/domain/dates";
import { hrefTransactions } from "@/features/transactions/filtres-url";

/** La consultation des transactions d'un compte, ce seul jour. */
export function hrefTransactionsDuJour(accountId: string, date: DateCivile): string {
  return hrefTransactions({ ...FILTRES_VIDES, du: date, au: date, comptes: [accountId] }, TRI_PAR_DEFAUT);
}
