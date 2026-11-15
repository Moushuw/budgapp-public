"use server";

// Patron d'actions de référentiel — copié de src/server/actions/tags.ts.

import { z } from "zod";
import type { DateCivile } from "@/domain/dates";
import type { Cents } from "@/domain/money";
import { soldeCalcule } from "@/domain/solde";
import * as depot from "@/server/repositories/accounts";
import type { CompteListe } from "@/server/repositories/accounts";
import * as soldes from "@/server/repositories/soldes";
import { aujourdhui } from "@/server/periode";
import {
  schemaArchivageCompte,
  schemaCompte,
  schemaIdentifiantCompte,
  schemaModificationCompte,
} from "@/features/accounts/schema";
import { defineActionProprietaire } from "./define-action-proprietaire";
import { tenter } from "./tenter";

export type { CompteListe } from "@/server/repositories/accounts";

/** Le solde calculé à `soldeAu` (aujourd'hui, docs/lot-m3.md §3.7), jamais stocké. */
export type CompteListeAvecSolde = CompteListe & { readonly soldeCalculeCents: Cents; readonly soldeAu: DateCivile };

const MESSAGE_DOUBLON = "Un compte porte déjà ce nom.";
const MESSAGE_COMPTE_LIE_INTROUVABLE = "Le compte lié choisi n'existe plus.";

export const listerComptes = defineActionProprietaire(z.object({}), async (_entree, ownerId) => {
  const comptes = await tenter(() => depot.listerComptes(ownerId), {});
  if (!comptes.ok) {
    return comptes;
  }
  const soldeAu = aujourdhui();
  const sommes = await tenter(() => soldes.sommesParCompte(ownerId, soldeAu), {});
  if (!sommes.ok) {
    return sommes;
  }
  const data: CompteListeAvecSolde[] = comptes.data.map((c) => ({
    ...c,
    soldeCalculeCents: soldeCalcule(c.soldeInitialCents, sommes.data.get(c.id) ?? 0),
    soldeAu,
  }));
  return { ok: true, data };
});

export const creerCompte = defineActionProprietaire(schemaCompte, async (entree, ownerId) => {
  const resultat = await tenter(() => depot.creerCompte(ownerId, entree), {
    DUPLICATE: MESSAGE_DOUBLON,
  });
  if (!resultat.ok) {
    return resultat;
  }
  if (resultat.data === null) {
    return { ok: false, code: "NOT_FOUND", message: MESSAGE_COMPTE_LIE_INTROUVABLE };
  }
  return { ok: true, data: resultat.data };
});

export const modifierCompte = defineActionProprietaire(schemaModificationCompte, async ({ id, ...entree }, ownerId) => {
  const resultat = await tenter(() => depot.modifierCompte(ownerId, id, entree), {
    DUPLICATE: MESSAGE_DOUBLON,
  });
  if (!resultat.ok) {
    return resultat;
  }
  if (resultat.data === null) {
    return { ok: false, code: "NOT_FOUND", message: MESSAGE_COMPTE_LIE_INTROUVABLE };
  }
  if (resultat.data === 0) {
    return { ok: false, code: "NOT_FOUND", message: "Ce compte n'existe plus." };
  }
  return { ok: true, data: { id } };
});

export const archiverCompte = defineActionProprietaire(schemaArchivageCompte, async ({ id, archive }, ownerId) => {
  const resultat = await tenter(() => depot.archiverCompte(ownerId, id, archive), {});
  if (!resultat.ok) {
    return resultat;
  }
  if (resultat.data === 0) {
    return { ok: false, code: "NOT_FOUND", message: "Ce compte n'existe plus." };
  }
  return { ok: true, data: { id, archive } };
});

export const supprimerCompte = defineActionProprietaire(schemaIdentifiantCompte, async ({ id }, ownerId) => {
  const resultat = await tenter(() => depot.supprimerCompte(ownerId, id), {});
  if (!resultat.ok) {
    return resultat;
  }
  const { supprimes, nbTransactions } = resultat.data;
  if (nbTransactions > 0) {
    return {
      ok: false,
      code: "CONFLICT",
      message: `Ce compte porte ${nbTransactions} transaction(s) : archive-le plutôt que de le supprimer.`,
    };
  }
  if (supprimes === 0) {
    return { ok: false, code: "NOT_FOUND", message: "Ce compte n'existe plus." };
  }
  return { ok: true, data: { id } };
});
