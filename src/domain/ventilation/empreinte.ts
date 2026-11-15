import { createHash } from "node:crypto";

/**
 * docs/lot-m2.md §3.2 : sha256 hexadécimal de `ventilation:${empreinteParent}:${rang}`. Une empreinte de relevé
 * hache `accountId|date|montant|description` (trois « | ») : les deux chaînes ne peuvent jamais être égales.
 * rang : 1-based (première fille = 1).
 */
export function empreinteLigneFille(empreinteParent: string, rang: number): string {
  return createHash("sha256").update(`ventilation:${empreinteParent}:${rang}`).digest("hex");
}
