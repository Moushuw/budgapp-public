// Déballe un ActionResult pour TanStack Query — CLAUDE.md §6.5 : c'est le seul
// endroit du code client qui transforme un échec en exception, pour que
// onError se comporte pareil en dev et en production.

import type { ActionResult, ErrorCode } from "@/server/actions/define-action";

export const MESSAGE_DE_REPLI = "Une erreur inattendue est survenue.";

/** Échec d'action qui garde son code, pour qu'un écran distingue un refus de validation d'un autre échec. */
export class ErreurAction extends Error {
  readonly code: ErrorCode;

  constructor(code: ErrorCode, message: string) {
    super(message);
    this.name = "ErreurAction";
    this.code = code;
  }
}

export function deballer<T>(resultat: ActionResult<T>): T {
  if (!resultat.ok) {
    throw new Error(resultat.message || MESSAGE_DE_REPLI);
  }
  return resultat.data;
}

/** Comme deballer, mais lève une ErreurAction (message vide → MESSAGE_DE_REPLI). */
export function deballerAvecCode<T>(resultat: ActionResult<T>): T {
  if (!resultat.ok) {
    throw new ErreurAction(resultat.code, resultat.message || MESSAGE_DE_REPLI);
  }
  return resultat.data;
}
