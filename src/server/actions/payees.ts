"use server";

// Patron d'actions de référentiel — copié de src/server/actions/accounts.ts.

import { z } from "zod";
import * as depot from "@/server/repositories/payees";
import {
  schemaBeneficiaire,
  schemaFusionBeneficiaires,
  schemaIdentifiantBeneficiaire,
  schemaModificationBeneficiaire,
} from "@/features/payees/schema";
import { defineActionProprietaire } from "./define-action-proprietaire";
import { tenter } from "./tenter";

export type { BeneficiaireListe, CandidatFusion, PropositionFusion, SourceFusion } from "@/server/repositories/payees";

const MESSAGE_DOUBLON = "Un bénéficiaire porte déjà ce nom (aux majuscules, accents et espaces près).";
const MESSAGE_SOUS_CATEGORIE_INTROUVABLE = "La sous-catégorie par défaut choisie n'existe plus.";

export const listerBeneficiaires = defineActionProprietaire(z.object({}), (_entree, ownerId) =>
  tenter(() => depot.listerBeneficiaires(ownerId), {}),
);

export const creerBeneficiaire = defineActionProprietaire(schemaBeneficiaire, async (entree, ownerId) => {
  const resultat = await tenter(() => depot.creerBeneficiaire(ownerId, entree), {
    DUPLICATE: MESSAGE_DOUBLON,
  });
  if (!resultat.ok) {
    return resultat;
  }
  if (resultat.data === null) {
    return { ok: false, code: "NOT_FOUND", message: MESSAGE_SOUS_CATEGORIE_INTROUVABLE };
  }
  return { ok: true, data: resultat.data };
});

export const modifierBeneficiaire = defineActionProprietaire(
  schemaModificationBeneficiaire,
  async ({ id, ...entree }, ownerId) => {
    const resultat = await tenter(() => depot.modifierBeneficiaire(ownerId, id, entree), {
      DUPLICATE: MESSAGE_DOUBLON,
    });
    if (!resultat.ok) {
      return resultat;
    }
    if (resultat.data === null) {
      return { ok: false, code: "NOT_FOUND", message: MESSAGE_SOUS_CATEGORIE_INTROUVABLE };
    }
    if (resultat.data === 0) {
      return { ok: false, code: "NOT_FOUND", message: "Ce bénéficiaire n'existe plus." };
    }
    return { ok: true, data: { id } };
  },
);

export const supprimerBeneficiaire = defineActionProprietaire(schemaIdentifiantBeneficiaire, async ({ id }, ownerId) => {
  const resultat = await tenter(() => depot.supprimerBeneficiaire(ownerId, id), {});
  if (!resultat.ok) {
    return resultat;
  }
  if (resultat.data.supprimes === 0) {
    return { ok: false, code: "NOT_FOUND", message: "Ce bénéficiaire n'existe plus." };
  }
  return { ok: true, data: { id, transactionsDetachees: resultat.data.transactionsDetachees } };
});

export const candidatsFusion = defineActionProprietaire(schemaIdentifiantBeneficiaire, ({ id }, ownerId) =>
  tenter(() => depot.candidatsFusion(ownerId, id), {}),
);

export const fusionnerBeneficiaires = defineActionProprietaire(
  schemaFusionBeneficiaires,
  async ({ sourceId, cibleId }, ownerId) => {
    const resultat = await tenter(() => depot.fusionnerBeneficiaires(ownerId, sourceId, cibleId), {});
    if (!resultat.ok) {
      return resultat;
    }
    if (resultat.data.statut === "SOURCE_INTROUVABLE") {
      return { ok: false, code: "NOT_FOUND", message: "Le bénéficiaire à fusionner n'existe plus." };
    }
    if (resultat.data.statut === "CIBLE_INTROUVABLE") {
      return { ok: false, code: "NOT_FOUND", message: "Le bénéficiaire de destination n'existe plus." };
    }
    return {
      ok: true,
      data: {
        sourceId,
        cibleId,
        nomSource: resultat.data.nomSource,
        nomCible: resultat.data.nomCible,
        transactionsTransferees: resultat.data.transactionsTransferees,
      },
    };
  },
);
