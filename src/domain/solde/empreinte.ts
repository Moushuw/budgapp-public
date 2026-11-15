import { createHash } from "node:crypto";

/**
 * sha256 hexadécimal de `ajustement:${statementId}` — même famille que docs/lot-m2.md §3.2 : une empreinte de
 * relevé hache `accountId|date|montant|description` (trois « | »), celle-ci n'en contient aucun.
 */
export function empreinteAjustement(statementId: string): string {
  return createHash("sha256").update(`ajustement:${statementId}`).digest("hex");
}
