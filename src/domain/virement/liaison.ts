// Ce qui permet, ou interdit, de lier deux transactions en virement — docs/lot-m2.md §4.4.

import { ecartJours } from "../dates";
import { formatMontant } from "../money";
import {
  FENETRE_VIREMENT_JOURS,
  type CoteDeLaPaire,
  type CoteVirement,
  type RefusLiaison,
} from "./types";

function refusDunCote(c: CoteVirement, cote: CoteDeLaPaire): RefusLiaison | null {
  if (c.parentId !== null) {
    return { motif: "LIGNE_FILLE", cote };
  }
  if (c.estVentilee) {
    return { motif: "VENTILEE", cote };
  }
  if (c.transferTransactionId !== null) {
    return { motif: "DEJA_LIEE", cote };
  }
  return null;
}

/**
 * null si a et b peuvent former une paire. Sinon le premier motif : MEME_TRANSACTION, puis pour a puis b
 * LIGNE_FILLE, VENTILEE, DEJA_LIEE, puis MEME_COMPTE, MONTANT_NUL, MONTANT_NON_OPPOSE, HORS_FENETRE.
 * Le même propriétaire est garanti par l'appelant (requête filtrée sur ownerId).
 */
export function peutLier(a: CoteVirement, b: CoteVirement): RefusLiaison | null {
  if (a.id !== null && b.id !== null && a.id === b.id) {
    return { motif: "MEME_TRANSACTION" };
  }
  const refusA = refusDunCote(a, "PREMIERE");
  if (refusA !== null) {
    return refusA;
  }
  const refusB = refusDunCote(b, "SECONDE");
  if (refusB !== null) {
    return refusB;
  }
  if (a.accountId === b.accountId) {
    return { motif: "MEME_COMPTE" };
  }
  if (a.montantCents === 0) {
    return { motif: "MONTANT_NUL" };
  }
  const somme = a.montantCents + b.montantCents;
  if (somme !== 0) {
    return { motif: "MONTANT_NON_OPPOSE", sommeCents: somme };
  }
  const ecart = Math.abs(ecartJours(a.date, b.date));
  if (ecart > FENETRE_VIREMENT_JOURS) {
    return { motif: "HORS_FENETRE", ecartJours: ecart };
  }
  return null;
}

export function messageRefusLiaison(refus: RefusLiaison): string {
  switch (refus.motif) {
    case "MEME_TRANSACTION":
      return "Une transaction ne se lie pas à elle-même.";
    case "LIGNE_FILLE":
      return "Une ligne de ventilation ne devient pas un côté de virement.";
    case "VENTILEE":
      return refus.cote === "PREMIERE"
        ? "Cette transaction est ventilée : déventile-la avant de la lier en virement."
        : "L'autre transaction est ventilée : déventile-la avant de la lier en virement.";
    case "DEJA_LIEE":
      return refus.cote === "PREMIERE"
        ? "Cette transaction est déjà un côté de virement : délie-la d'abord."
        : "L'autre transaction est déjà un côté de virement : délie-la d'abord.";
    case "MEME_COMPTE":
      return "Les deux côtés d'un virement sont sur deux comptes différents.";
    case "MONTANT_NUL":
      return "Une transaction de 0,00 $ ne devient pas un virement.";
    case "MONTANT_NON_OPPOSE":
      return `Les deux montants ne s'annulent pas : leur somme vaut ${formatMontant(refus.sommeCents, "CENTS")}.`;
    case "HORS_FENETRE":
      return `Les deux dates sont à ${refus.ecartJours} jours l'une de l'autre : un virement se lie à ${FENETRE_VIREMENT_JOURS} jours près au plus.`;
  }
}
