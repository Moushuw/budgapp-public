// Le seul point où une erreur d'écriture Prisma devient un ActionResult —
// évite six try/catch copiés dans les actions de référentiel.

import { codeDepuisErreurPrisma } from "@/server/repositories/erreurs-prisma";
import type { ActionResult, ErrorCode } from "./define-action";

const MESSAGE_PAR_DEFAUT: Record<ErrorCode, string> = {
  VALIDATION: "Les données envoyées sont invalides.",
  NOT_FOUND: "Cet élément n'existe plus.",
  DUPLICATE: "Cet élément existe déjà.",
  CONFLICT: "Cet élément est encore utilisé.",
  FORBIDDEN: "Action non autorisée.",
  UNKNOWN: "Une erreur inattendue est survenue.",
};

export async function tenter<T>(
  operation: () => Promise<T>,
  messages: Partial<Record<ErrorCode, string>>,
): Promise<ActionResult<T>> {
  try {
    const data = await operation();
    return { ok: true, data };
  } catch (erreur) {
    const code = codeDepuisErreurPrisma(erreur);
    if (code === null) {
      // Erreur non répertoriée : elle remonte, defineAction la journalise et
      // la traduit en UNKNOWN — CLAUDE.md §2.6, rien ne s'avale en silence.
      throw erreur;
    }

    return { ok: false, code, message: messages[code] ?? MESSAGE_PAR_DEFAUT[code] };
  }
}
