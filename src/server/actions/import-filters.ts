"use server";

// Patron d'actions de référentiel — copié de src/server/actions/tags.ts.

import { z } from "zod";
import * as depot from "@/server/repositories/import-filters";
import {
  schemaFiltreImport,
  schemaIdentifiantFiltreImport,
  schemaModificationFiltreImport,
} from "@/features/import-filters/schema";
import { defineActionProprietaire } from "./define-action-proprietaire";
import { tenter } from "./tenter";

export type { FiltreImportListe } from "@/server/repositories/import-filters";

const MESSAGE_DOUBLON = "Un filtre identique existe déjà (même motif, même mode).";
const MESSAGE_INTROUVABLE = "Ce filtre n'existe plus.";

export const listerFiltresImport = defineActionProprietaire(z.object({}), (_entree, ownerId) =>
  tenter(() => depot.listerFiltresImport(ownerId), {}),
);

export const creerFiltreImport = defineActionProprietaire(schemaFiltreImport, (entree, ownerId) =>
  tenter(() => depot.creerFiltreImport(ownerId, entree), {
    DUPLICATE: MESSAGE_DOUBLON,
  }),
);

export const modifierFiltreImport = defineActionProprietaire(
  schemaModificationFiltreImport,
  async ({ id, ...entree }, ownerId) => {
    const resultat = await tenter(() => depot.modifierFiltreImport(ownerId, id, entree), {
      DUPLICATE: MESSAGE_DOUBLON,
    });
    if (!resultat.ok) {
      return resultat;
    }
    if (resultat.data === 0) {
      return { ok: false, code: "NOT_FOUND", message: MESSAGE_INTROUVABLE };
    }
    return { ok: true, data: { id } };
  },
);

export const supprimerFiltreImport = defineActionProprietaire(schemaIdentifiantFiltreImport, async ({ id }, ownerId) => {
  const resultat = await tenter(() => depot.supprimerFiltreImport(ownerId, id), {});
  if (!resultat.ok) {
    return resultat;
  }
  if (resultat.data === 0) {
    return { ok: false, code: "NOT_FOUND", message: MESSAGE_INTROUVABLE };
  }
  return { ok: true, data: { id } };
});
