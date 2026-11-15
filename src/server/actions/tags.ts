"use server";

// Le patron d'actions de référentiel — spec M1 tranche 1 §5.7. Import du
// repository en espace de noms : la frontière de couche se voit à l'œil nu
// sur chaque appel (CLAUDE.md §4).

import { z } from "zod";
import * as depot from "@/server/repositories/tags";
import {
  schemaEtiquette,
  schemaIdentifiantEtiquette,
  schemaModificationEtiquette,
} from "@/features/etiquettes/schema";
import { defineActionProprietaire } from "./define-action-proprietaire";
import { tenter } from "./tenter";

export type { EtiquetteListe } from "@/server/repositories/tags";

export const listerEtiquettes = defineActionProprietaire(z.object({}), (_entree, ownerId) =>
  tenter(() => depot.listerEtiquettes(ownerId), {}),
);

export const creerEtiquette = defineActionProprietaire(schemaEtiquette, (entree, ownerId) =>
  tenter(() => depot.creerEtiquette(ownerId, entree), {
    DUPLICATE: "Une étiquette porte déjà ce nom.",
  }),
);

export const modifierEtiquette = defineActionProprietaire(
  schemaModificationEtiquette,
  async ({ id, ...entree }, ownerId) => {
    const resultat = await tenter(() => depot.modifierEtiquette(ownerId, id, entree), {
      DUPLICATE: "Une étiquette porte déjà ce nom.",
    });
    if (!resultat.ok) {
      return resultat;
    }
    if (resultat.data === 0) {
      return { ok: false, code: "NOT_FOUND", message: "Cette étiquette n'existe plus." };
    }
    return { ok: true, data: { id } };
  },
);

export const supprimerEtiquette = defineActionProprietaire(schemaIdentifiantEtiquette, async ({ id }, ownerId) => {
  // Pas de mapping CONFLICT ici : TransactionTag.tag est en onDelete Cascade
  // (schema.prisma), donc supprimer une étiquette ne peut jamais violer une
  // clé étrangère. Le mécanisme reste utile ailleurs, où la contrainte est réelle.
  const resultat = await tenter(() => depot.supprimerEtiquette(ownerId, id), {});
  if (!resultat.ok) {
    return resultat;
  }
  if (resultat.data.supprimees === 0) {
    return { ok: false, code: "NOT_FOUND", message: "Cette étiquette n'existe plus." };
  }
  return { ok: true, data: { id, transactionsDetachees: resultat.data.transactionsDetachees } };
});
