"use server";

// Patron d'actions de référentiel — copié de src/server/actions/tags.ts.

import { z } from "zod";
import * as depot from "@/server/repositories/categories";
import {
  schemaCategorie,
  schemaCreationSousCategorie,
  schemaDeplacement,
  schemaIdentifiantCategorie,
  schemaIdentifiantSousCategorie,
  schemaModificationCategorie,
  schemaModificationSousCategorie,
} from "@/features/categories/schema";
import { defineActionProprietaire } from "./define-action-proprietaire";
import { tenter } from "./tenter";

export type { CategorieListe, SousCategorieListe } from "@/server/repositories/categories";

export const listerCategories = defineActionProprietaire(z.object({}), (_entree, ownerId) =>
  tenter(() => depot.listerCategories(ownerId), {}),
);

export const creerCategorie = defineActionProprietaire(schemaCategorie, (entree, ownerId) =>
  tenter(() => depot.creerCategorie(ownerId, entree), {
    DUPLICATE: "Une catégorie porte déjà ce nom.",
  }),
);

export const modifierCategorie = defineActionProprietaire(
  schemaModificationCategorie,
  async ({ id, ...entree }, ownerId) => {
    const resultat = await tenter(() => depot.modifierCategorie(ownerId, id, entree), {
      DUPLICATE: "Une catégorie porte déjà ce nom.",
    });
    if (!resultat.ok) {
      return resultat;
    }
    if (resultat.data === 0) {
      return { ok: false, code: "NOT_FOUND", message: "Cette catégorie n'existe plus." };
    }
    return { ok: true, data: { id } };
  },
);

export const supprimerCategorie = defineActionProprietaire(schemaIdentifiantCategorie, async ({ id }, ownerId) => {
  const resultat = await tenter(() => depot.supprimerCategorie(ownerId, id), {});
  if (!resultat.ok) {
    return resultat;
  }
  const { supprimees, sousCategoriesSysteme } = resultat.data;
  if (sousCategoriesSysteme.length > 0) {
    return {
      ok: false,
      code: "CONFLICT",
      message: `Cette catégorie contient des sous-catégories système (${sousCategoriesSysteme.join(", ")}) : elles ne peuvent pas être supprimées.`,
    };
  }
  if (supprimees === 0) {
    return { ok: false, code: "NOT_FOUND", message: "Cette catégorie n'existe plus." };
  }
  return { ok: true, data: { id } };
});

export const deplacerCategorie = defineActionProprietaire(schemaDeplacement, async ({ id, direction }, ownerId) => {
  const resultat = await tenter(() => depot.deplacerCategorie(ownerId, id, direction), {});
  if (!resultat.ok) {
    return resultat;
  }
  if (!resultat.data.trouvee) {
    return { ok: false, code: "NOT_FOUND", message: "Cette catégorie n'existe plus." };
  }
  return { ok: true, data: { id, deplacee: resultat.data.deplacee } };
});

export const creerSousCategorie = defineActionProprietaire(
  schemaCreationSousCategorie,
  async ({ categoryId, ...entree }, ownerId) => {
    const resultat = await tenter(() => depot.creerSousCategorie(ownerId, categoryId, entree), {
      DUPLICATE: "Une sous-catégorie porte déjà ce nom dans cette catégorie.",
    });
    if (!resultat.ok) {
      return resultat;
    }
    if (resultat.data === null) {
      return { ok: false, code: "NOT_FOUND", message: "Cette catégorie n'existe plus." };
    }
    return { ok: true, data: resultat.data };
  },
);

export const modifierSousCategorie = defineActionProprietaire(
  schemaModificationSousCategorie,
  async ({ id, ...entree }, ownerId) => {
    const resultat = await tenter(() => depot.modifierSousCategorie(ownerId, id, entree), {
      DUPLICATE: "Une sous-catégorie porte déjà ce nom dans cette catégorie.",
    });
    if (!resultat.ok) {
      return resultat;
    }
    if (resultat.data === 0) {
      return { ok: false, code: "NOT_FOUND", message: "Cette sous-catégorie n'existe plus." };
    }
    return { ok: true, data: { id } };
  },
);

export const supprimerSousCategorie = defineActionProprietaire(
  schemaIdentifiantSousCategorie,
  async ({ id }, ownerId) => {
    const resultat = await tenter(() => depot.supprimerSousCategorie(ownerId, id), {});
    if (!resultat.ok) {
      return resultat;
    }
    const { trouvee, systeme, supprimees } = resultat.data;
    if (!trouvee) {
      return { ok: false, code: "NOT_FOUND", message: "Cette sous-catégorie n'existe plus." };
    }
    if (systeme) {
      return {
        ok: false,
        code: "CONFLICT",
        message: "Cette sous-catégorie est une sous-catégorie système : elle se renomme, elle ne se supprime pas.",
      };
    }
    if (supprimees === 0) {
      return { ok: false, code: "NOT_FOUND", message: "Cette sous-catégorie n'existe plus." };
    }
    return { ok: true, data: { id } };
  },
);

export const deplacerSousCategorie = defineActionProprietaire(
  schemaDeplacement,
  async ({ id, direction }, ownerId) => {
    const resultat = await tenter(() => depot.deplacerSousCategorie(ownerId, id, direction), {});
    if (!resultat.ok) {
      return resultat;
    }
    if (!resultat.data.trouvee) {
      return { ok: false, code: "NOT_FOUND", message: "Cette sous-catégorie n'existe plus." };
    }
    return { ok: true, data: { id, deplacee: resultat.data.deplacee } };
  },
);
