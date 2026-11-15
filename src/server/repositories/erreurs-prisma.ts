// Traduit une erreur Prisma en ErrorCode du contrat d'action — CLAUDE.md §7 :
// Prisma n'apparaît que dans src/server/repositories/. Aucun type Prisma ne
// fuit dans la signature, pour que src/server/actions/ puisse l'utiliser sans
// violer la règle des couches.

import { Prisma } from "@prisma/client";
import type { ErrorCode } from "@/server/actions/define-action";

const CODES_CONNUS: Record<string, ErrorCode> = {
  P2002: "DUPLICATE", // violation d'unicité
  P2025: "NOT_FOUND", // enregistrement requis introuvable
  P2003: "CONFLICT", // violation de clé étrangère
  // Délai d'une transaction interactive dépassé (`prisma.$transaction`) —
  // typiquement une écriture par lots trop grande pour tenir dans le
  // `timeout` configuré. Reste UNKNOWN (ce n'est ni une validation, ni une
  // référence manquante, ni un conflit de données) : c'est au site d'appel
  // de fournir, via `tenter(..., { UNKNOWN: "…" })`, un message qui dit à
  // l'utilisateur quoi faire plutôt que le générique par défaut.
  P2028: "UNKNOWN",
};

/** Retourne null si l'erreur n'est pas une erreur Prisma connue : elle doit alors remonter. */
export function codeDepuisErreurPrisma(erreur: unknown): ErrorCode | null {
  if (!(erreur instanceof Prisma.PrismaClientKnownRequestError)) {
    return null;
  }

  return CODES_CONNUS[erreur.code] ?? null;
}
