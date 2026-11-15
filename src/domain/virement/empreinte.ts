import { createHash } from "node:crypto";

/**
 * docs/lot-m2.md §3.2 : sha256 hexadécimal de `virement:${idAutreCote}`. Une empreinte de relevé hache
 * `accountId|date|montant|description` (trois « | ») : les deux chaînes ne peuvent jamais être égales.
 */
export function empreinteContrepartie(idAutreCote: string): string {
  return createHash("sha256").update(`virement:${idAutreCote}`).digest("hex");
}
