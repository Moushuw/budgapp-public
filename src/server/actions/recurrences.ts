"use server";

// Actions des récurrences — docs/lot-m3.md §4.2, §4.3 et §4.6. Aucun statut de
// repository n'est levé : chacun devient un ActionResult. Un fichier "use
// server" n'exporte que des fonctions asynchrones et des types.

import { z } from "zod";
import {
  schemaConfirmationSuggestion,
  schemaCreationRecurrence,
  schemaIdentifiant,
  schemaIdentifiantOccurrence,
  schemaIdentifiantTransactionRecurrence,
  schemaLiaisonOccurrence,
  schemaModificationRecurrence,
  schemaMontantOccurrence,
  schemaPageOccurrences,
  schemaTerminaisonRecurrence,
  versChampsRecurrence,
} from "@/features/recurrences/schema";
import * as ecriture from "@/server/repositories/recurrences-ecriture";
import * as lecture from "@/server/repositories/recurrences-lecture";
import { aujourdhui } from "@/server/periode";
import { defineActionProprietaire } from "./define-action-proprietaire";
import {
  MESSAGE_AUTRE_COMPTE,
  MESSAGE_COMPTE_INTROUVABLE,
  MESSAGE_DEJA_TERMINEE,
  MESSAGE_ECHEANCE_INTROUVABLE,
  MESSAGE_ECHEANCE_PRISE,
  MESSAGE_FIN_AVANT_ANCRAGE,
  MESSAGE_HORS_FENETRE,
  MESSAGE_IGNORER_NON_OUVERTE,
  MESSAGE_LIGNE_FILLE,
  MESSAGE_MONTANT_NON_OUVERTE,
  MESSAGE_NON_LIEE,
  MESSAGE_RECURRENCE_INTROUVABLE,
  MESSAGE_RETABLIR_NON_IGNOREE,
  MESSAGE_SIGNE_ECHEANCE,
  MESSAGE_SIGNE_SERIE,
  MESSAGE_SOUS_CATEGORIE_INTROUVABLE,
  MESSAGE_SUGGESTION_INTROUVABLE,
  MESSAGE_SUGGESTION_TRAITEE,
  MESSAGE_TRANSACTION_INTROUVABLE,
  MESSAGE_TRANSACTION_PRISE,
  messageFinAvantLiee,
} from "./recurrences-messages";
import { tenter } from "./tenter";

export type {
  CandidatOccurrenceLiaison,
  CandidatTransactionLiaison,
  CompteRenduLiaisonRetroactive,
  EcranRecurrences,
  PageOccurrences,
} from "@/domain/recurrence";
export type { ResultatRecherche } from "@/server/repositories/recurrences-ecriture";

interface Echec {
  ok: false;
  code: "NOT_FOUND" | "CONFLICT" | "VALIDATION";
  message: string;
}

function echecReference(quoi: "COMPTE" | "SOUS_CATEGORIE" | "TRANSACTION"): Echec {
  switch (quoi) {
    case "COMPTE":
      return { ok: false, code: "NOT_FOUND", message: MESSAGE_COMPTE_INTROUVABLE };
    case "SOUS_CATEGORIE":
      return { ok: false, code: "NOT_FOUND", message: MESSAGE_SOUS_CATEGORIE_INTROUVABLE };
    case "TRANSACTION":
      return { ok: false, code: "NOT_FOUND", message: MESSAGE_TRANSACTION_INTROUVABLE };
  }
}

function echecTransactionIndisponible(motif: "DEJA_LIEE" | "LIGNE_FILLE" | "AUTRE_COMPTE"): Echec {
  switch (motif) {
    case "DEJA_LIEE":
      return { ok: false, code: "CONFLICT", message: MESSAGE_TRANSACTION_PRISE };
    case "LIGNE_FILLE":
      return { ok: false, code: "CONFLICT", message: MESSAGE_LIGNE_FILLE };
    case "AUTRE_COMPTE":
      return { ok: false, code: "VALIDATION", message: MESSAGE_AUTRE_COMPTE };
  }
}

export const lireEcranRecurrences = defineActionProprietaire(z.object({}), (_entree, ownerId) =>
  tenter(() => lecture.lireEcranRecurrences(ownerId, aujourdhui()), {}),
);

export const rechercherRecurrences = defineActionProprietaire(z.object({}), (_entree, ownerId) =>
  tenter(() => ecriture.rechercherSuggestions(ownerId), {}),
);

export const refuserSuggestion = defineActionProprietaire(schemaIdentifiant, async ({ id }, ownerId) => {
  const resultat = await tenter(() => ecriture.refuserSuggestion(ownerId, id), {});
  if (!resultat.ok) {
    return resultat;
  }
  switch (resultat.data) {
    case "INTROUVABLE":
      return { ok: false, code: "NOT_FOUND", message: MESSAGE_SUGGESTION_INTROUVABLE };
    case "DEJA_TRAITEE":
      return { ok: false, code: "CONFLICT", message: MESSAGE_SUGGESTION_TRAITEE };
    case "REFUSEE":
      return { ok: true, data: { id } };
  }
});

export const confirmerSuggestion = defineActionProprietaire(
  schemaConfirmationSuggestion,
  async ({ suggestionId, champs }, ownerId) => {
    const resultat = await tenter(
      () => ecriture.confirmerSuggestion(ownerId, suggestionId, versChampsRecurrence(champs), aujourdhui()),
      {},
    );
    if (!resultat.ok) {
      return resultat;
    }
    const r = resultat.data;
    switch (r.statut) {
      case "INTROUVABLE":
        return { ok: false, code: "NOT_FOUND", message: MESSAGE_SUGGESTION_INTROUVABLE };
      case "DEJA_TRAITEE":
        return { ok: false, code: "CONFLICT", message: MESSAGE_SUGGESTION_TRAITEE };
      case "REFERENCE_INVALIDE":
        return echecReference(r.quoi);
      case "CONFIRMEE":
        return { ok: true, data: r.compteRendu };
    }
  },
);

export const creerRecurrence = defineActionProprietaire(
  schemaCreationRecurrence,
  async ({ accountId, transactionId, champs }, ownerId) => {
    const resultat = await tenter(
      () =>
        ecriture.creerRecurrence(
          ownerId,
          { accountId, transactionId, champs: versChampsRecurrence(champs) },
          aujourdhui(),
        ),
      { DUPLICATE: MESSAGE_TRANSACTION_PRISE },
    );
    if (!resultat.ok) {
      return resultat;
    }
    const r = resultat.data;
    switch (r.statut) {
      case "REFERENCE_INVALIDE":
        return echecReference(r.quoi);
      case "TRANSACTION_INDISPONIBLE":
        return echecTransactionIndisponible(r.motif);
      case "CREEE":
        return { ok: true, data: { ruleId: r.ruleId, libelle: r.libelle, transaction: r.transaction } };
    }
  },
);

export const modifierRecurrence = defineActionProprietaire(schemaModificationRecurrence, async ({ id, champs }, ownerId) => {
  const resultat = await tenter(
    () => ecriture.modifierRecurrence(ownerId, id, versChampsRecurrence(champs), aujourdhui()),
    {},
  );
  if (!resultat.ok) {
    return resultat;
  }
  const r = resultat.data;
  switch (r.statut) {
    case "INTROUVABLE":
      return { ok: false, code: "NOT_FOUND", message: MESSAGE_RECURRENCE_INTROUVABLE };
    case "REFERENCE_INVALIDE":
      return echecReference(r.quoi);
    case "SIGNE_CONTRAIRE":
      return { ok: false, code: "VALIDATION", message: MESSAGE_SIGNE_SERIE };
    case "MODIFIEE":
      return { ok: true, data: { id, echeancesSupprimees: r.echeancesSupprimees, echeancesCreees: r.echeancesCreees } };
  }
});

export const terminerRecurrence = defineActionProprietaire(schemaTerminaisonRecurrence, async ({ id, dateFin }, ownerId) => {
  const resultat = await tenter(() => ecriture.terminerRecurrence(ownerId, id, dateFin), {});
  if (!resultat.ok) {
    return resultat;
  }
  const r = resultat.data;
  switch (r.statut) {
    case "INTROUVABLE":
      return { ok: false, code: "NOT_FOUND", message: MESSAGE_RECURRENCE_INTROUVABLE };
    case "DEJA_TERMINEE":
      return { ok: false, code: "CONFLICT", message: MESSAGE_DEJA_TERMINEE };
    case "FIN_AVANT_ANCRAGE":
      return { ok: false, code: "VALIDATION", message: MESSAGE_FIN_AVANT_ANCRAGE };
    case "FIN_AVANT_LIEE":
      return { ok: false, code: "VALIDATION", message: messageFinAvantLiee(r.echeance) };
    case "TERMINEE":
      return { ok: true, data: { id, echeancesRetirees: r.echeancesRetirees, dontIgnorees: r.dontIgnorees } };
  }
});

export const supprimerRecurrence = defineActionProprietaire(schemaIdentifiant, async ({ id }, ownerId) => {
  const resultat = await tenter(() => ecriture.supprimerRecurrence(ownerId, id), {});
  if (!resultat.ok) {
    return resultat;
  }
  const r = resultat.data;
  switch (r.statut) {
    case "INTROUVABLE":
      return { ok: false, code: "NOT_FOUND", message: MESSAGE_RECURRENCE_INTROUVABLE };
    case "SUPPRIMEE":
      return { ok: true, data: { id, liaisonsDefaites: r.liaisonsDefaites } };
  }
});

export const listerOccurrences = defineActionProprietaire(schemaPageOccurrences, async ({ ruleId, curseur, portion }, ownerId) => {
  const resultat = await tenter(() => lecture.lireOccurrences(ownerId, ruleId, aujourdhui(), portion, curseur), {});
  if (!resultat.ok) {
    return resultat;
  }
  if (resultat.data === null) {
    return { ok: false, code: "NOT_FOUND", message: MESSAGE_RECURRENCE_INTROUVABLE };
  }
  return { ok: true, data: resultat.data };
});

export const listerCandidatsTransaction = defineActionProprietaire(
  schemaIdentifiantOccurrence,
  async ({ occurrenceId }, ownerId) => {
    const resultat = await tenter(() => lecture.lireCandidatsTransaction(ownerId, occurrenceId), {});
    if (!resultat.ok) {
      return resultat;
    }
    const r = resultat.data;
    switch (r.statut) {
      case "INTROUVABLE":
        return { ok: false, code: "NOT_FOUND", message: MESSAGE_ECHEANCE_INTROUVABLE };
      case "NON_OUVERTE":
        return { ok: false, code: "CONFLICT", message: MESSAGE_ECHEANCE_PRISE };
      case "CANDIDATS":
        return { ok: true, data: r.candidats };
    }
  },
);

export const listerCandidatsOccurrence = defineActionProprietaire(
  schemaIdentifiantTransactionRecurrence,
  async ({ transactionId }, ownerId) => {
    const resultat = await tenter(() => lecture.lireCandidatsOccurrence(ownerId, transactionId), {});
    if (!resultat.ok) {
      return resultat;
    }
    const r = resultat.data;
    switch (r.statut) {
      case "INTROUVABLE":
        return { ok: false, code: "NOT_FOUND", message: MESSAGE_TRANSACTION_INTROUVABLE };
      case "REFUS":
        return r.motif === "LIGNE_FILLE"
          ? { ok: false, code: "CONFLICT", message: MESSAGE_LIGNE_FILLE }
          : { ok: false, code: "CONFLICT", message: MESSAGE_TRANSACTION_PRISE };
      case "CANDIDATS":
        return { ok: true, data: r.candidats };
    }
  },
);

export const lierOccurrence = defineActionProprietaire(
  schemaLiaisonOccurrence,
  async ({ occurrenceId, transactionId }, ownerId) => {
    const resultat = await tenter(() => ecriture.lierOccurrence(ownerId, occurrenceId, transactionId), {
      DUPLICATE: MESSAGE_TRANSACTION_PRISE,
    });
    if (!resultat.ok) {
      return resultat;
    }
    const r = resultat.data;
    switch (r.statut) {
      case "ECHEANCE_INTROUVABLE":
        return { ok: false, code: "NOT_FOUND", message: MESSAGE_ECHEANCE_INTROUVABLE };
      case "TRANSACTION_INTROUVABLE":
        return { ok: false, code: "NOT_FOUND", message: MESSAGE_TRANSACTION_INTROUVABLE };
      case "ECHEANCE_PRISE":
        return { ok: false, code: "CONFLICT", message: MESSAGE_ECHEANCE_PRISE };
      case "LIGNE_FILLE":
        return { ok: false, code: "CONFLICT", message: MESSAGE_LIGNE_FILLE };
      case "TRANSACTION_PRISE":
        return { ok: false, code: "CONFLICT", message: MESSAGE_TRANSACTION_PRISE };
      case "AUTRE_COMPTE":
        return { ok: false, code: "VALIDATION", message: MESSAGE_AUTRE_COMPTE };
      case "HORS_FENETRE":
        return { ok: false, code: "VALIDATION", message: MESSAGE_HORS_FENETRE };
      case "LIEE":
        return { ok: true, data: { occurrenceId, transactionId, etat: r.etat } };
    }
  },
);

export const delierOccurrence = defineActionProprietaire(schemaIdentifiantOccurrence, async ({ occurrenceId }, ownerId) => {
  const resultat = await tenter(() => ecriture.delierOccurrence(ownerId, occurrenceId), {});
  if (!resultat.ok) {
    return resultat;
  }
  const r = resultat.data;
  switch (r.statut) {
    case "INTROUVABLE":
      return { ok: false, code: "NOT_FOUND", message: MESSAGE_ECHEANCE_INTROUVABLE };
    case "NON_LIEE":
      return { ok: false, code: "CONFLICT", message: MESSAGE_NON_LIEE };
    case "DELIEE":
      return { ok: true, data: { occurrenceId, transactionId: r.transactionId } };
  }
});

function gesteSimple(statut: ecriture.ResultatGesteOccurrence["statut"], inapplicable: string, occurrenceId: string) {
  switch (statut) {
    case "INTROUVABLE":
      return { ok: false, code: "NOT_FOUND", message: MESSAGE_ECHEANCE_INTROUVABLE } as const;
    case "NON_APPLICABLE":
      return { ok: false, code: "CONFLICT", message: inapplicable } as const;
    case "FAIT":
      return { ok: true, data: { occurrenceId } } as const;
  }
}

export const ignorerOccurrence = defineActionProprietaire(schemaIdentifiantOccurrence, async ({ occurrenceId }, ownerId) => {
  const resultat = await tenter(() => ecriture.ignorerOccurrence(ownerId, occurrenceId), {});
  return resultat.ok ? gesteSimple(resultat.data.statut, MESSAGE_IGNORER_NON_OUVERTE, occurrenceId) : resultat;
});

export const retablirOccurrence = defineActionProprietaire(schemaIdentifiantOccurrence, async ({ occurrenceId }, ownerId) => {
  const resultat = await tenter(() => ecriture.retablirOccurrence(ownerId, occurrenceId), {});
  return resultat.ok ? gesteSimple(resultat.data.statut, MESSAGE_RETABLIR_NON_IGNOREE, occurrenceId) : resultat;
});

export const modifierMontantOccurrence = defineActionProprietaire(
  schemaMontantOccurrence,
  async ({ occurrenceId, montant }, ownerId) => {
    const resultat = await tenter(() => ecriture.modifierMontantOccurrence(ownerId, occurrenceId, montant), {});
    if (!resultat.ok) {
      return resultat;
    }
    const statut = resultat.data.statut;
    if (statut === "SIGNE_CONTRAIRE") {
      return { ok: false, code: "VALIDATION", message: MESSAGE_SIGNE_ECHEANCE } as const;
    }
    return gesteSimple(statut, MESSAGE_MONTANT_NON_OUVERTE, occurrenceId);
  },
);
