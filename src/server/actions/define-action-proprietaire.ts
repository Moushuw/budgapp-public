// Variante de defineAction qui résout l'ownerId avant d'appeler le handler —
// décision de plomberie §2 de la spec M1 tranche 1. Fichier séparé de
// define-action.ts, qui reste sans dépendance (CLAUDE.md §4).

import type { z } from "zod";
import { ownerIdCourant } from "@/server/owner";
import { defineAction } from "./define-action";
import type { ActionResult } from "./define-action";

export function defineActionProprietaire<TSchema extends z.ZodType, TResult>(
  schema: TSchema,
  handler: (entree: z.infer<TSchema>, ownerId: string) => Promise<ActionResult<TResult>>,
) {
  return defineAction(schema, async (entree: z.infer<TSchema>): Promise<ActionResult<TResult>> => {
    const ownerId = await ownerIdCourant();
    if (ownerId === null) {
      return {
        ok: false,
        code: "FORBIDDEN",
        message: "Aucun utilisateur n'est configuré. Lance `npm run seed`.",
      };
    }

    return handler(entree, ownerId);
  });
}
