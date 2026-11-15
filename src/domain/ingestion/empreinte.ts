import { createHash } from "node:crypto";
import type { DateCivile } from "@/domain/dates";
import type { Cents } from "@/domain/money";

/**
 * `hash(accountId, date, amountCents, descriptionNormalisee)`, unique en base —
 * docs/modele-ingestion-recurrences.md §2. Bloque le ré-import du même relevé.
 */
export function calculerEmpreinte(
  accountId: string,
  date: DateCivile,
  montantCents: Cents,
  descriptionNormalisee: string,
): string {
  return createHash("sha256").update(`${accountId}|${date}|${montantCents}|${descriptionNormalisee}`).digest("hex");
}
