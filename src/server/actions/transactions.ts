"use server";

// Actions de la consultation et des écritures sur les transactions —
// docs/lot-m2.md §5, §6 et §7. Un fichier "use server" n'exporte que des
// fonctions asynchrones et des types.

import { z } from "zod";
import { resoudreCriteres } from "@/domain/consultation";
import type { CurseurTransactions, LigneTransactionListe, TotauxPremierePage } from "@/domain/consultation";
import { messageRefus } from "@/domain/edition";
import { messageSuppressionLiee } from "@/domain/recurrence";
import { messageErreurVentilation } from "@/domain/ventilation";
import { messageRefusLiaison } from "@/domain/virement";
import {
  MESSAGE_BENEFICIAIRE_NOUVEAU_VIDE,
  MESSAGE_EMPREINTE_EXISTANTE,
  MESSAGE_SELECTION_TROP_GRANDE,
  schemaApercuSuppression,
  schemaCreationContrepartie,
  schemaCreationTransaction,
  schemaIdentifiantTransaction,
  schemaLiaisonVirement,
  schemaModificationMasse,
  schemaModificationTransaction,
  schemaRequetePageTransactions,
  schemaSaisieVirement,
  schemaSelectionTransactions,
  schemaSuppressionTransaction,
  schemaVentilation,
} from "@/features/transactions/schema";
import { lireOccurrenceLiee } from "@/server/repositories/recurrences-lecture";
import * as ecriture from "@/server/repositories/transactions-ecriture";
import type { SelectionResolue } from "@/server/repositories/transactions-ecriture";
import * as depot from "@/server/repositories/transactions-lecture";
import { defineActionProprietaire } from "./define-action-proprietaire";
import { tenter } from "./tenter";
import { MESSAGE_VIREMENT_COURSE, messageCourse } from "./transactions-messages";

export type { DetailTransaction, LigneTransactionListe, TotauxPremierePage } from "@/domain/consultation";
export type { ApercuSuppression, ApercusSuppression, CompteRenduMasse } from "@/domain/edition";
export type { CandidatVirement } from "@/domain/virement";

export interface PageListeTransactions {
  readonly lignes: readonly LigneTransactionListe[];
  readonly curseurSuivant: CurseurTransactions | null;
  /** Première page seulement (curseur null) ; null ensuite. */
  readonly totaux: TotauxPremierePage | null;
}

export const listerTransactions = defineActionProprietaire(
  schemaRequetePageTransactions,
  (entree, ownerId) =>
    tenter(async (): Promise<PageListeTransactions> => {
      const criteres = resoudreCriteres(entree.filtres, entree.periode);
      const page = await depot.listerTransactions(ownerId, criteres, entree.tri, entree.curseur);
      if (entree.curseur !== null) {
        return { ...page, totaux: null };
      }
      const totaux = await depot.totauxTransactions(ownerId, criteres);
      const proprietaireSansTransaction = totaux.nombre === 0 ? !(await depot.possedeDesTransactions(ownerId)) : false;
      return { ...page, totaux: { ...totaux, proprietaireSansTransaction } };
    }, {}),
);

export const lireTransaction = defineActionProprietaire(schemaIdentifiantTransaction, async ({ id }, ownerId) => {
  const resultat = await tenter(() => depot.lireTransaction(ownerId, id), {});
  if (!resultat.ok) {
    return resultat;
  }
  if (resultat.data === null) {
    return { ok: false, code: "NOT_FOUND", message: "Cette transaction est introuvable." };
  }
  return { ok: true, data: resultat.data };
});

export const compterTransactionsARevoir = defineActionProprietaire(z.object({}), (_entree, ownerId) =>
  tenter(() => depot.compterARevoir(ownerId), {}),
);

// ── écritures — docs/lot-m2.md §6. Aucun refus n'est levé : chaque statut du
// repository devient un ActionResult. Aucune page ne lit ces données par le
// cache de Next : le rafraîchissement passe par TanStack Query.

const MESSAGE_INTROUVABLE = "Cette transaction est introuvable.";

function messageContrepartieExistante(e: { readonly compteNom: string; readonly date: string }): string {
  return `Une contrepartie de cette transaction existe déjà sur ${e.compteNom}, le ${e.date} : lie-la plutôt que d'en créer une autre.`;
}

const MESSAGE_TROP_LONG = "La modification a pris trop de temps pour ce nombre de transactions. Rien n'a été modifié : resserre la sélection et recommence.";

type ReferenceEnEchec = "COMPTE" | "SOUS_CATEGORIE" | "BENEFICIAIRE" | "ETIQUETTE" | "BENEFICIAIRE_NOUVEAU_VIDE";

function echecReference(quoi: ReferenceEnEchec): { ok: false; code: "NOT_FOUND" | "VALIDATION"; message: string } {
  switch (quoi) {
    case "COMPTE":
      return { ok: false, code: "NOT_FOUND", message: "Ce compte n'existe plus." };
    case "SOUS_CATEGORIE":
      return { ok: false, code: "NOT_FOUND", message: "Cette sous-catégorie n'existe plus." };
    case "BENEFICIAIRE":
      return { ok: false, code: "NOT_FOUND", message: "Ce bénéficiaire n'existe plus." };
    case "ETIQUETTE":
      return { ok: false, code: "NOT_FOUND", message: "Une des étiquettes choisies n'existe plus." };
    case "BENEFICIAIRE_NOUVEAU_VIDE":
      return { ok: false, code: "VALIDATION", message: MESSAGE_BENEFICIAIRE_NOUVEAU_VIDE };
  }
}

function resoudreSelection(selection: z.output<typeof schemaSelectionTransactions>): SelectionResolue {
  return selection.type === "FILTRE"
    ? { type: "CRITERES", criteres: resoudreCriteres(selection.filtres, selection.periode) }
    : { type: "IDS", ids: selection.ids };
}

export const creerTransaction = defineActionProprietaire(schemaCreationTransaction, async (entree, ownerId) => {
  const resultat = await tenter(
    () =>
      ecriture.creerTransactionManuelle(ownerId, {
        accountId: entree.accountId,
        date: entree.date,
        description: entree.description,
        montantCents: entree.montant,
        payeeId: entree.payeeId,
        payeeNouveauNom: entree.payeeNouveauNom,
        subcategoryId: entree.subcategoryId,
        note: entree.note,
        tagIds: entree.tagIds,
      }),
    { DUPLICATE: MESSAGE_EMPREINTE_EXISTANTE },
  );
  if (!resultat.ok) {
    return resultat;
  }
  const r = resultat.data;
  switch (r.statut) {
    case "REFERENCE_INVALIDE":
      return echecReference(r.quoi);
    case "EMPREINTE_EXISTANTE":
      return { ok: false, code: "DUPLICATE", message: MESSAGE_EMPREINTE_EXISTANTE };
    case "CREEE":
      return { ok: true, data: { id: r.id, beneficiaireCree: r.beneficiaireCree } };
  }
});

export const modifierTransaction = defineActionProprietaire(schemaModificationTransaction, async (entree, ownerId) => {
  const resultat = await tenter(
    () =>
      ecriture.modifierTransaction(ownerId, entree.id, {
        ...(entree.description !== undefined ? { description: entree.description } : {}),
        ...(entree.date !== undefined ? { date: entree.date } : {}),
        ...(entree.montant !== undefined ? { montantCents: entree.montant } : {}),
        ...(entree.payeeId !== undefined && entree.payeeNouveauNom !== undefined
          ? { beneficiaire: { payeeId: entree.payeeId, payeeNouveauNom: entree.payeeNouveauNom } }
          : {}),
        ...(entree.subcategoryId !== undefined ? { subcategoryId: entree.subcategoryId } : {}),
        ...(entree.note !== undefined ? { note: entree.note } : {}),
        ...(entree.tagIds !== undefined ? { tagIds: entree.tagIds } : {}),
        ...(entree.aRevoir !== undefined ? { aRevoir: entree.aRevoir } : {}),
        ...(entree.exclureDuBudget !== undefined ? { exclureDuBudget: entree.exclureDuBudget } : {}),
        ...(entree.exclureDesRapports !== undefined ? { exclureDesRapports: entree.exclureDesRapports } : {}),
      }),
    { DUPLICATE: MESSAGE_EMPREINTE_EXISTANTE },
  );
  if (!resultat.ok) {
    return resultat;
  }
  const r = resultat.data;
  switch (r.statut) {
    case "INTROUVABLE":
      return { ok: false, code: "NOT_FOUND", message: MESSAGE_INTROUVABLE };
    case "REFUS":
      return { ok: false, code: "CONFLICT", message: messageRefus(r.motif) };
    case "REFERENCE_INVALIDE":
      return echecReference(r.quoi);
    case "MODIFIEE":
      return { ok: true, data: { id: r.id, beneficiaireCree: r.beneficiaireCree } };
  }
});

export const supprimerTransaction = defineActionProprietaire(
  schemaSuppressionTransaction,
  async ({ id, virement }, ownerId) => {
    const resultat = await tenter(() => ecriture.supprimerTransaction(ownerId, id, virement), {});
    if (!resultat.ok) {
      return resultat;
    }
    const r = resultat.data;
    switch (r.statut) {
      case "INTROUVABLE":
        return { ok: false, code: "NOT_FOUND", message: MESSAGE_INTROUVABLE };
      case "REFUS": {
        if (r.motif === "SUPPRESSION_LIEE") {
          const liee = await lireOccurrenceLiee(ownerId, id);
          if (liee !== null) {
            return { ok: false, code: "CONFLICT", message: messageSuppressionLiee(liee.libelle, liee.echeance) };
          }
        }
        return { ok: false, code: "CONFLICT", message: messageRefus(r.motif) };
      }
      case "CONFLIT":
        return { ok: false, code: "CONFLICT", message: messageCourse(r.objet, "UNITAIRE") };
      case "SUPPRIMEE":
        return {
          ok: true,
          data: { id, lignesVentilationSupprimees: r.lignesVentilationSupprimees, contrepartie: r.contrepartie },
        };
    }
  },
);

// ── virements — docs/lot-m2.md §4.4. Chaque geste revérifie en base et rend CONFLICT si l'autre côté a bougé.

export const listerCandidatsVirement = defineActionProprietaire(schemaIdentifiantTransaction, async ({ id }, ownerId) => {
  const resultat = await tenter(() => depot.lireCandidatsVirement(ownerId, id), {});
  if (!resultat.ok) {
    return resultat;
  }
  const r = resultat.data;
  switch (r.statut) {
    case "INTROUVABLE":
      return { ok: false, code: "NOT_FOUND", message: MESSAGE_INTROUVABLE };
    case "REFUS":
      return { ok: false, code: "CONFLICT", message: messageRefus(r.motif) };
    case "CANDIDATS":
      return { ok: true, data: r.candidats };
  }
});

export const lierVirement = defineActionProprietaire(schemaLiaisonVirement, async ({ id, contrepartieId }, ownerId) => {
  const resultat = await tenter(() => ecriture.lierVirement(ownerId, id, contrepartieId), {
    DUPLICATE: MESSAGE_VIREMENT_COURSE,
  });
  if (!resultat.ok) {
    return resultat;
  }
  const r = resultat.data;
  switch (r.statut) {
    case "INTROUVABLE":
      return { ok: false, code: "NOT_FOUND", message: MESSAGE_INTROUVABLE };
    case "REFUS":
      return { ok: false, code: "CONFLICT", message: messageRefus(r.motif) };
    case "INCOMPATIBLE":
      return { ok: false, code: "CONFLICT", message: messageRefusLiaison(r.refus) };
    case "CONFLIT":
      return { ok: false, code: "CONFLICT", message: MESSAGE_VIREMENT_COURSE };
    case "LIEE":
      return {
        ok: true,
        data: { id: r.id, contrepartieId: r.contrepartieId, sousCategoriesRetirees: r.sousCategoriesRetirees },
      };
  }
});

export const delierVirement = defineActionProprietaire(schemaIdentifiantTransaction, async ({ id }, ownerId) => {
  const resultat = await tenter(() => ecriture.delierVirement(ownerId, id), { DUPLICATE: MESSAGE_VIREMENT_COURSE });
  if (!resultat.ok) {
    return resultat;
  }
  const r = resultat.data;
  switch (r.statut) {
    case "INTROUVABLE":
      return { ok: false, code: "NOT_FOUND", message: MESSAGE_INTROUVABLE };
    case "REFUS":
      return { ok: false, code: "CONFLICT", message: messageRefus(r.motif) };
    case "CONFLIT":
      return { ok: false, code: "CONFLICT", message: MESSAGE_VIREMENT_COURSE };
    case "DELIEE":
      return { ok: true, data: { id: r.id, contrepartieId: r.contrepartieId } };
  }
});

export const creerContrepartie = defineActionProprietaire(
  schemaCreationContrepartie,
  async ({ id, accountId }, ownerId) => {
    const resultat = await tenter(() => ecriture.creerContrepartie(ownerId, id, accountId), {
      DUPLICATE: MESSAGE_VIREMENT_COURSE,
    });
    if (!resultat.ok) {
      return resultat;
    }
    const r = resultat.data;
    switch (r.statut) {
      case "INTROUVABLE":
        return { ok: false, code: "NOT_FOUND", message: MESSAGE_INTROUVABLE };
      case "REFUS":
        return { ok: false, code: "CONFLICT", message: messageRefus(r.motif) };
      case "REFERENCE_INVALIDE":
        return { ok: false, code: "NOT_FOUND", message: "Ce compte n'existe plus." };
      case "INCOMPATIBLE":
        return { ok: false, code: "CONFLICT", message: messageRefusLiaison(r.refus) };
      case "CONTREPARTIE_EXISTANTE":
        return { ok: false, code: "DUPLICATE", message: messageContrepartieExistante(r.existante) };
      case "CONFLIT":
        return { ok: false, code: "CONFLICT", message: MESSAGE_VIREMENT_COURSE };
      case "CREEE":
        return {
          ok: true,
          data: { id: r.id, contrepartieId: r.contrepartieId, sousCategorieRetiree: r.sousCategorieRetiree },
        };
    }
  },
);

export const saisirVirement = defineActionProprietaire(schemaSaisieVirement, async (entree, ownerId) => {
  const resultat = await tenter(
    () =>
      ecriture.saisirVirement(ownerId, {
        accountId: entree.accountId,
        accountIdDestination: entree.accountIdDestination,
        date: entree.date,
        description: entree.description,
        montantCents: entree.montant,
        payeeId: entree.payeeId,
        payeeNouveauNom: entree.payeeNouveauNom,
        note: entree.note,
        tagIds: entree.tagIds,
      }),
    { DUPLICATE: MESSAGE_EMPREINTE_EXISTANTE },
  );
  if (!resultat.ok) {
    return resultat;
  }
  const r = resultat.data;
  switch (r.statut) {
    case "REFERENCE_INVALIDE":
      return r.quoi === "COMPTE_DESTINATION"
        ? { ok: false, code: "NOT_FOUND", message: "Le compte de destination n'existe plus." }
        : echecReference(r.quoi);
    case "INCOMPATIBLE":
      return { ok: false, code: "VALIDATION", message: messageRefusLiaison(r.refus) };
    case "EMPREINTE_EXISTANTE":
      return { ok: false, code: "DUPLICATE", message: MESSAGE_EMPREINTE_EXISTANTE };
    case "CREE":
      return { ok: true, data: { id: r.id, contrepartieId: r.contrepartieId, beneficiaireCree: r.beneficiaireCree } };
  }
});

// ── ventilation — docs/lot-m2.md §4.2. La forme est validée par schemaVentilation ; le montant du parent n'est
// connu que du repository, qui applique validerVentilation contre la ligne lue.

const MESSAGE_VENTILATION_EN_COURSE =
  "Une ligne de cette ventilation vient d'être enregistrée par ailleurs (deux onglets ouverts ?). Rien n'a été modifié.";

export const ventilerTransaction = defineActionProprietaire(schemaVentilation, async ({ id, lignes }, ownerId) => {
  const resultat = await tenter(
    () =>
      ecriture.ventilerTransaction(
        ownerId,
        id,
        lignes.map((ligne) => ({
          subcategoryId: ligne.subcategoryId,
          montantCents: ligne.montant,
          note: ligne.note,
          tagIds: ligne.tagIds,
        })),
      ),
    { DUPLICATE: MESSAGE_VENTILATION_EN_COURSE },
  );
  if (!resultat.ok) {
    return resultat;
  }
  const r = resultat.data;
  switch (r.statut) {
    case "INTROUVABLE":
      return { ok: false, code: "NOT_FOUND", message: MESSAGE_INTROUVABLE };
    case "REFUS":
      return { ok: false, code: "CONFLICT", message: messageRefus(r.motif) };
    case "INVALIDE": {
      const [premiere] = r.erreurs;
      if (premiere === undefined) {
        return { ok: false, code: "UNKNOWN", message: "La ventilation n'a pas pu être validée." };
      }
      return {
        ok: false,
        code: premiere.motif === "PARENT_FILLE" || premiere.motif === "PARENT_VIREMENT" ? "CONFLICT" : "VALIDATION",
        message: messageErreurVentilation(premiere),
        details: { erreurs: r.erreurs },
      };
    }
    case "REFERENCE_INVALIDE":
      return echecReference(r.quoi);
    case "VENTILEE":
      return { ok: true, data: { id: r.id, lignes: r.lignes } };
  }
});

export const deventilerTransaction = defineActionProprietaire(schemaIdentifiantTransaction, async ({ id }, ownerId) => {
  const resultat = await tenter(() => ecriture.deventilerTransaction(ownerId, id), {});
  if (!resultat.ok) {
    return resultat;
  }
  const r = resultat.data;
  switch (r.statut) {
    case "INTROUVABLE":
      return { ok: false, code: "NOT_FOUND", message: MESSAGE_INTROUVABLE };
    case "REFUS":
      return { ok: false, code: "CONFLICT", message: messageRefus(r.motif) };
    case "DEVENTILEE":
      return { ok: true, data: { id: r.id, lignesSupprimees: r.lignesSupprimees } };
  }
});

export const modifierTransactionsEnMasse = defineActionProprietaire(
  schemaModificationMasse,
  async ({ selection, geste }, ownerId) => {
    const resultat = await tenter(() => ecriture.modifierEnMasse(ownerId, resoudreSelection(selection), geste), {
      UNKNOWN: MESSAGE_TROP_LONG,
    });
    if (!resultat.ok) {
      return resultat;
    }
    const r = resultat.data;
    switch (r.statut) {
      case "DEPASSEMENT":
        return { ok: false, code: "VALIDATION", message: MESSAGE_SELECTION_TROP_GRANDE };
      case "REFERENCE_INVALIDE":
        return echecReference(r.quoi);
      case "CONFLIT":
        return { ok: false, code: "CONFLICT", message: messageCourse(r.objet, "MASSE") };
      case "APPLIQUE":
        return { ok: true, data: r.compteRendu };
    }
  },
);

export const apercevoirSuppressionEnMasse = defineActionProprietaire(
  schemaApercuSuppression,
  async ({ selection }, ownerId) => {
    const resultat = await tenter(() => ecriture.apercevoirSuppression(ownerId, resoudreSelection(selection)), {});
    if (!resultat.ok) {
      return resultat;
    }
    const r = resultat.data;
    switch (r.statut) {
      case "DEPASSEMENT":
        return { ok: false, code: "VALIDATION", message: MESSAGE_SELECTION_TROP_GRANDE };
      case "APERCU":
        return { ok: true, data: r.apercus };
    }
  },
);
