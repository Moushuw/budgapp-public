"use server";

// Actions des soldes et de la réconciliation — docs/lot-m3.md §5. Aucun statut de
// repository n'est levé : chacun devient un ActionResult. Un fichier "use
// server" n'exporte que des fonctions asynchrones et des types.

import { explicationsProbables, MESSAGES_REFUS_AJUSTEMENT } from "@/domain/solde";
import {
  schemaExplication,
  schemaIdentifiantAncrage,
  schemaIdentifiantCompteSolde,
  schemaSaisieSolde,
} from "@/features/soldes/schema";
import * as depot from "@/server/repositories/soldes";
import { aujourdhui } from "@/server/periode";
import { defineActionProprietaire } from "./define-action-proprietaire";
import {
  MESSAGE_AJUSTEMENT_COURSE,
  MESSAGE_AJUSTEMENT_LIE,
  MESSAGE_ANCRAGE_INTROUVABLE,
  MESSAGE_COMPTE_INTROUVABLE,
  MESSAGE_ECART_SAISIE_HORS_LIMITE,
  MESSAGE_EXPLICATION_ECART_NUL,
  messageDoublonAncrage,
} from "./soldes-messages";
import { tenter } from "./tenter";

export type { AncrageAffiche, DiagnosticAncrage, FicheCompte } from "@/domain/solde";

export const lireFicheCompte = defineActionProprietaire(
  schemaIdentifiantCompteSolde,
  async ({ accountId }, ownerId) => {
    const resultat = await tenter(() => depot.lireFicheCompte(ownerId, accountId, aujourdhui()), {});
    if (!resultat.ok) {
      return resultat;
    }
    if (resultat.data === null) {
      return { ok: false, code: "NOT_FOUND", message: MESSAGE_COMPTE_INTROUVABLE };
    }
    return { ok: true, data: resultat.data };
  },
);

export const lireDiagnosticAncrage = defineActionProprietaire(
  schemaIdentifiantAncrage,
  async ({ statementId }, ownerId) => {
    const resultat = await tenter(() => depot.lireDiagnostic(ownerId, statementId), {});
    if (!resultat.ok) {
      return resultat;
    }
    if (resultat.data === null) {
      return { ok: false, code: "NOT_FOUND", message: MESSAGE_ANCRAGE_INTROUVABLE };
    }
    const { ancrage, contexte } = resultat.data;
    return { ok: true, data: { ancrage, explications: explicationsProbables(contexte) } };
  },
);

export const saisirSolde = defineActionProprietaire(schemaSaisieSolde, async (entree, ownerId) => {
  const messageDoublon = messageDoublonAncrage(entree.source, entree.date);
  const resultat = await tenter(
    () =>
      depot.saisirSolde(ownerId, {
        accountId: entree.accountId,
        date: entree.date,
        soldeCents: entree.montant,
        source: entree.source,
      }),
    { DUPLICATE: messageDoublon },
  );
  if (!resultat.ok) {
    return resultat;
  }
  const r = resultat.data;
  switch (r.statut) {
    case "COMPTE_INTROUVABLE":
      return { ok: false, code: "NOT_FOUND", message: MESSAGE_COMPTE_INTROUVABLE };
    case "DOUBLON":
      return { ok: false, code: "DUPLICATE", message: messageDoublon };
    case "ECART_HORS_LIMITE":
      return { ok: false, code: "VALIDATION", message: MESSAGE_ECART_SAISIE_HORS_LIMITE };
    case "SAISI":
      return {
        ok: true,
        data: { statementId: r.statementId, soldeCalculeCents: r.soldeCalculeCents, ecartCents: r.ecartCents },
      };
  }
});

export const expliquerEcart = defineActionProprietaire(
  schemaExplication,
  async ({ statementId, explication }, ownerId) => {
    const resultat = await tenter(() => depot.expliquerEcart(ownerId, statementId, explication), {});
    if (!resultat.ok) {
      return resultat;
    }
    const r = resultat.data;
    switch (r.statut) {
      case "INTROUVABLE":
        return { ok: false, code: "NOT_FOUND", message: MESSAGE_ANCRAGE_INTROUVABLE };
      case "ECART_HORS_LIMITE":
        return { ok: false, code: "VALIDATION", message: MESSAGES_REFUS_AJUSTEMENT.ECART_HORS_LIMITE };
      case "ECART_NUL":
        return { ok: false, code: "VALIDATION", message: MESSAGE_EXPLICATION_ECART_NUL };
      case "EXPLIQUE":
        return { ok: true, data: { statementId, reconciliationCreee: r.reconciliationCreee } };
    }
  },
);

export const creerAjustement = defineActionProprietaire(schemaIdentifiantAncrage, async ({ statementId }, ownerId) => {
  const resultat = await tenter(() => depot.creerAjustement(ownerId, statementId), {
    DUPLICATE: MESSAGE_AJUSTEMENT_COURSE,
  });
  if (!resultat.ok) {
    return resultat;
  }
  const r = resultat.data;
  switch (r.statut) {
    case "INTROUVABLE":
      return { ok: false, code: "NOT_FOUND", message: MESSAGE_ANCRAGE_INTROUVABLE };
    case "REFUS":
      return {
        ok: false,
        code: r.motif === "ECART_HORS_LIMITE" ? "VALIDATION" : "CONFLICT",
        message: MESSAGES_REFUS_AJUSTEMENT[r.motif],
      };
    case "AJUSTE":
      return {
        ok: true,
        data: {
          transactionId: r.transactionId,
          date: r.date,
          montantCents: r.montantCents,
          sousCategorieCreee: r.sousCategorieCreee,
        },
      };
  }
});

export const supprimerAncrage = defineActionProprietaire(schemaIdentifiantAncrage, async ({ statementId }, ownerId) => {
  const resultat = await tenter(() => depot.supprimerAncrage(ownerId, statementId), {});
  if (!resultat.ok) {
    return resultat;
  }
  const r = resultat.data;
  switch (r.statut) {
    case "INTROUVABLE":
      return { ok: false, code: "NOT_FOUND", message: MESSAGE_ANCRAGE_INTROUVABLE };
    case "AJUSTEMENT_LIE":
      return { ok: false, code: "CONFLICT", message: MESSAGE_AJUSTEMENT_LIE };
    case "SUPPRIME":
      return { ok: true, data: { statementId, ajustementSupprime: r.ajustementSupprime } };
  }
});
