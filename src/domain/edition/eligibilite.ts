// Éligibilité d'une transaction aux écritures — docs/lot-m2.md §6. Pur : la
// lecture (repository) fournit les faits, ce module décide et dit pourquoi.

import { messageErreurVentilation } from "../ventilation";
import type {
  ChangementsDemandes,
  ChoixSuppressionVirement,
  ContrepartieEligibilite,
  FaitsContrepartie,
  GesteMasse,
  LigneEligibilite,
  LigneMasse,
  MotifRefus,
  MotifRefusMasse,
  RaisonIgnoree,
  RefusEcriture,
} from "./types";

export const AUCUN_REFUS: RefusEcriture = {
  modification: null,
  date: null,
  montant: null,
  sousCategorie: null,
  suppression: null,
  suppressionLesDeux: null,
  suppressionDelier: null,
  ventilation: null,
  deventilation: null,
  lierVirement: null,
  delierVirement: null,
};

/** AUCUNE si transferTransactionId est null ; INTROUVABLE si faits est null ou d'un autre propriétaire ; TROUVEE sinon. */
export function contrepartieEligibilite(
  transferTransactionId: string | null,
  ownerIdAttendu: string,
  faits: FaitsContrepartie | null,
): ContrepartieEligibilite {
  if (transferTransactionId === null) {
    return { etat: "AUCUNE" };
  }
  if (faits?.ownerId !== ownerIdAttendu) {
    return { etat: "INTROUVABLE" };
  }
  return { etat: "TROUVEE", source: faits.source, porteCotisation: faits.porteCotisation, estLiee: faits.estLiee };
}

function estFille(l: Pick<LigneEligibilite, "parentId">): boolean {
  return l.parentId !== null;
}

export function refusDate(l: LigneEligibilite): MotifRefus | null {
  if (estFille(l)) {
    return "LIGNE_FILLE";
  }
  if (l.source !== "MANUELLE") {
    return "DATE_HORS_MANUELLE";
  }
  return null;
}

export function refusMontant(l: LigneEligibilite, c: ContrepartieEligibilite): MotifRefus | null {
  if (estFille(l)) {
    return "LIGNE_FILLE";
  }
  if (l.source !== "MANUELLE") {
    return "MONTANT_HORS_MANUELLE";
  }
  if (l.estVentilee) {
    return "MONTANT_PARENT_VENTILE";
  }
  if (l.porteCotisation) {
    return "MONTANT_COTISATION";
  }
  if (l.transferTransactionId !== null) {
    if (c.etat !== "TROUVEE") {
      return "MONTANT_CONTREPARTIE_INTROUVABLE";
    }
    if (c.source !== "MANUELLE") {
      return "MONTANT_CONTREPARTIE_HORS_MANUELLE";
    }
    if (c.porteCotisation) {
      return "MONTANT_COTISATION";
    }
  }
  return null;
}

export function refusSousCategorie(
  l: Pick<LigneEligibilite, "parentId" | "estVentilee" | "transferTransactionId">,
): MotifRefusMasse | null {
  if (estFille(l)) {
    return "LIGNE_FILLE";
  }
  if (l.transferTransactionId !== null) {
    return "SOUS_CATEGORIE_VIREMENT";
  }
  if (l.estVentilee) {
    return "SOUS_CATEGORIE_PARENT_VENTILE";
  }
  return null;
}

/** Ce qui interdit toute suppression, quel que soit le choix pour un côté de virement. */
export function refusSuppressionBase(l: LigneEligibilite): MotifRefusMasse | null {
  if (estFille(l)) {
    return "LIGNE_FILLE";
  }
  if (l.estLiee) {
    return "SUPPRESSION_LIEE";
  }
  if (l.filleLiee) {
    return "SUPPRESSION_FILLE_LIEE";
  }
  return null;
}

/**
 * refusSuppressionBase, puis pour un côté de virement : pas de choix → SUPPRESSION_VIREMENT ; délier une contrepartie
 * qui porte une cotisation → VIREMENT_COTISATION ; supprimer une contrepartie rattachée → SUPPRESSION_CONTREPARTIE_LIEE.
 * Une contrepartie introuvable ne bloque rien : seule cette ligne part.
 */
export function refusSuppression(
  l: LigneEligibilite,
  c: ContrepartieEligibilite,
  choix: ChoixSuppressionVirement | null,
): MotifRefusMasse | null {
  const base = refusSuppressionBase(l);
  if (base !== null) {
    return base;
  }
  if (l.transferTransactionId === null) {
    return null;
  }
  if (choix === null) {
    return "SUPPRESSION_VIREMENT";
  }
  if (c.etat !== "TROUVEE") {
    return null;
  }
  if (choix === "DELIER_L_AUTRE" && c.porteCotisation) {
    return "VIREMENT_COTISATION";
  }
  if (choix === "SUPPRIMER_LES_DEUX" && c.estLiee) {
    return "SUPPRESSION_CONTREPARTIE_LIEE";
  }
  return null;
}

/** Lier et créer la contrepartie : mêmes conditions. */
export function refusLierVirement(
  l: Pick<LigneEligibilite, "parentId" | "estVentilee" | "transferTransactionId" | "montantCents">,
): MotifRefus | null {
  if (estFille(l)) {
    return "LIGNE_FILLE";
  }
  if (l.transferTransactionId !== null) {
    return "VIREMENT_DEJA_LIE";
  }
  if (l.estVentilee) {
    return "VIREMENT_VENTILEE";
  }
  if (l.montantCents === 0) {
    return "VIREMENT_MONTANT_NUL";
  }
  return null;
}

export function refusDelierVirement(l: LigneEligibilite, c: ContrepartieEligibilite): MotifRefus | null {
  if (l.transferTransactionId === null) {
    return "NON_VIREMENT";
  }
  if (l.porteCotisation || (c.etat === "TROUVEE" && c.porteCotisation)) {
    return "VIREMENT_COTISATION";
  }
  return null;
}

/**
 * Ventiler, ou modifier la ventilation : docs/lot-m2.md §4.2 et §10.3. Une transaction de 0,00 $ est refusée
 * d'avance (journal d'INDEX.md, 2026-10-05, M2-T4, Q-1).
 */
export function refusVentilation(l: LigneEligibilite): MotifRefus | null {
  if (estFille(l)) {
    return "LIGNE_FILLE";
  }
  if (l.transferTransactionId !== null) {
    return "VENTILATION_VIREMENT";
  }
  if (l.estVentilee && l.filleLiee) {
    return "VENTILATION_FILLE_LIEE";
  }
  if (l.montantCents === 0) {
    return "VENTILATION_MONTANT_NUL";
  }
  return null;
}

export function refusDeventilation(l: LigneEligibilite): MotifRefus | null {
  if (estFille(l)) {
    return "LIGNE_FILLE";
  }
  if (!l.estVentilee) {
    return "NON_VENTILEE";
  }
  if (l.filleLiee) {
    return "VENTILATION_FILLE_LIEE";
  }
  return null;
}

export function refusEcriture(l: LigneEligibilite, c: ContrepartieEligibilite): RefusEcriture {
  const estCoteVirement = l.transferTransactionId !== null;
  return {
    modification: estFille(l) ? "LIGNE_FILLE" : null,
    date: refusDate(l),
    montant: refusMontant(l, c),
    sousCategorie: refusSousCategorie(l),
    suppression: refusSuppressionBase(l),
    suppressionLesDeux: estCoteVirement ? refusSuppression(l, c, "SUPPRIMER_LES_DEUX") : null,
    suppressionDelier: estCoteVirement ? refusSuppression(l, c, "DELIER_L_AUTRE") : null,
    ventilation: refusVentilation(l),
    deventilation: refusDeventilation(l),
    lierVirement: refusLierVirement(l),
    delierVirement: refusDelierVirement(l, c),
  };
}

export function refusModification(
  l: LigneEligibilite,
  c: ContrepartieEligibilite,
  ch: ChangementsDemandes,
): MotifRefus | null {
  if (!ch.date && !ch.montant && !ch.sousCategoriePosee && !ch.autres) {
    return null;
  }
  if (estFille(l)) {
    return "LIGNE_FILLE";
  }
  if (ch.date) {
    const motif = refusDate(l);
    if (motif !== null) {
      return motif;
    }
  }
  if (ch.montant) {
    const motif = refusMontant(l, c);
    if (motif !== null) {
      return motif;
    }
  }
  if (ch.sousCategoriePosee) {
    const motif = refusSousCategorie(l);
    if (motif !== null) {
      return motif;
    }
  }
  return null;
}

export function refusGesteMasse(l: LigneMasse, geste: GesteMasse): MotifRefusMasse | null {
  switch (geste.type) {
    case "SOUS_CATEGORIE":
      return refusSousCategorie(l);
    case "SUPPRIMER":
      return refusSuppression(l, l.contrepartie, geste.virements);
    default:
      return estFille(l) ? "LIGNE_FILLE" : null;
  }
}

export function raisonIgnoree(motif: MotifRefusMasse): RaisonIgnoree {
  switch (motif) {
    case "SOUS_CATEGORIE_VIREMENT":
    case "SUPPRESSION_VIREMENT":
      return "VIREMENT";
    case "SOUS_CATEGORIE_PARENT_VENTILE":
      return "VENTILEE";
    case "LIGNE_FILLE":
      return "LIGNE_FILLE";
    case "SUPPRESSION_LIEE":
    case "SUPPRESSION_FILLE_LIEE":
      return "LIEE";
    case "SUPPRESSION_CONTREPARTIE_LIEE":
    case "VIREMENT_COTISATION":
      return "CONTREPARTIE_LIEE";
  }
}

const MESSAGES_REFUS: Record<MotifRefus, string> = {
  LIGNE_FILLE: "Cette ligne fait partie d'une ventilation : elle se modifie depuis la ventilation de sa transaction.",
  DATE_HORS_MANUELLE:
    "La date d'une transaction importée vient de la banque : elle ne se modifie pas. Seule une transaction saisie à la main change de date.",
  MONTANT_HORS_MANUELLE:
    "Le montant d'une transaction importée vient de la banque : il ne se modifie pas. Seule une transaction saisie à la main change de montant.",
  MONTANT_PARENT_VENTILE:
    "Cette transaction est ventilée : son montant doit rester égal à la somme de ses lignes. Modifie sa ventilation plutôt que son montant.",
  MONTANT_COTISATION: "Ce montant est aussi celui d'une cotisation enregistrée : il ne se modifie pas depuis cet écran.",
  MONTANT_CONTREPARTIE_INTROUVABLE:
    "L'autre côté de ce virement est introuvable : le montant ne peut pas changer des deux côtés à la fois.",
  MONTANT_CONTREPARTIE_HORS_MANUELLE:
    "L'autre côté de ce virement vient d'un relevé : son montant ne se modifie pas, donc celui-ci non plus. Les deux côtés d'un virement changent ensemble ou pas du tout.",
  SOUS_CATEGORIE_VIREMENT:
    "Un virement n'est ni une dépense ni un revenu : il ne reçoit pas de sous-catégorie. Pour la catégoriser, délie d'abord le virement.",
  SOUS_CATEGORIE_PARENT_VENTILE:
    "Cette transaction est ventilée : ce sont ses lignes qui portent les sous-catégories. Modifie sa ventilation pour en changer.",
  SUPPRESSION_VIREMENT:
    "Cette transaction est un côté de virement : choisis de supprimer aussi l'autre côté, ou de supprimer celle-ci seule en déliant l'autre.",
  SUPPRESSION_LIEE:
    "Cette transaction est rattachée à une échéance récurrente, une cotisation ou un objectif : la supprimer déferait ce lien sans le montrer. Elle ne se supprime pas depuis cet écran.",
  SUPPRESSION_FILLE_LIEE:
    "Une ligne de la ventilation de cette transaction est rattachée à une échéance récurrente, une cotisation ou un objectif : la supprimer déferait ce lien sans le montrer. Elle ne se supprime pas depuis cet écran.",
  VENTILATION_VIREMENT: messageErreurVentilation({ motif: "PARENT_VIREMENT" }),
  VENTILATION_FILLE_LIEE:
    "Une ligne de cette ventilation est rattachée à une échéance récurrente, une cotisation ou un objectif : la remplacer ou la retirer déferait ce lien sans le montrer. La ventilation ne se modifie pas depuis cet écran.",
  VENTILATION_MONTANT_NUL: messageErreurVentilation({ motif: "PARENT_NUL" }),
  NON_VENTILEE: "Cette transaction n'est pas ventilée : il n'y a rien à déventiler.",
  SUPPRESSION_CONTREPARTIE_LIEE:
    "L'autre côté de ce virement est rattaché à une échéance récurrente, une cotisation ou un objectif : il ne se supprime pas depuis cet écran.",
  VIREMENT_DEJA_LIE: "Cette transaction est déjà un côté de virement : délie-la d'abord pour la lier autrement.",
  VIREMENT_VENTILEE: "Une transaction ventilée ne devient pas un côté de virement : déventile-la d'abord.",
  VIREMENT_MONTANT_NUL: "Une transaction de 0,00 $ ne devient pas un virement.",
  VIREMENT_COTISATION: "Ce virement porte une cotisation enregistrée : il ne se délie pas depuis cet écran.",
  NON_VIREMENT: "Cette transaction n'est pas un côté de virement : il n'y a rien à délier.",
};

export function messageRefus(motif: MotifRefus): string {
  return MESSAGES_REFUS[motif];
}
