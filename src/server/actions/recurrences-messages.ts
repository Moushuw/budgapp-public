// Messages d'échec des actions de récurrence — docs/lot-m3.md §4. Sans directive
// "use server" : un tel fichier n'exporte que des fonctions asynchrones.

import type { DateCivile } from "@/domain/dates";
import { FENETRE_LIAISON_MANUELLE_JOURS } from "@/domain/recurrence/constantes";
import { jourEtMois } from "@/domain/recurrence/libelles";

export const MESSAGE_SUGGESTION_INTROUVABLE = "Cette suggestion n'existe plus : relance la recherche.";
export const MESSAGE_SUGGESTION_TRAITEE = "Cette suggestion a déjà été confirmée ou refusée.";
export const MESSAGE_COMPTE_INTROUVABLE = "Ce compte n'existe plus.";
export const MESSAGE_SOUS_CATEGORIE_INTROUVABLE = "Cette sous-catégorie n'existe plus.";
export const MESSAGE_RECURRENCE_INTROUVABLE = "Cette récurrence n'existe plus.";
export const MESSAGE_ECHEANCE_INTROUVABLE = "Cette échéance n'existe plus.";
export const MESSAGE_TRANSACTION_INTROUVABLE = "Cette transaction est introuvable.";
export const MESSAGE_ECHEANCE_PRISE = "Cette échéance vient d'être liée ou ignorée ailleurs. Rien n'a été modifié.";
export const MESSAGE_TRANSACTION_PRISE = "Cette transaction est déjà liée à une échéance : délie-la d'abord.";
export const MESSAGE_LIGNE_FILLE =
  "Une ligne de ventilation ne se lie pas à une échéance : lie la transaction ventilée elle-même.";
export const MESSAGE_AUTRE_COMPTE = "Cette transaction n'est pas sur le compte de la récurrence.";
export const MESSAGE_HORS_FENETRE = `Cette transaction est à plus de ${FENETRE_LIAISON_MANUELLE_JOURS} jours de l'échéance.`;
export const MESSAGE_NON_LIEE = "Cette échéance n'est plus liée. Rien n'a été modifié.";
export const MESSAGE_IGNORER_NON_OUVERTE = "Seule une échéance ouverte (prévue ou manquée, sans paiement) s'ignore.";
export const MESSAGE_RETABLIR_NON_IGNOREE = "Cette échéance n'est pas ignorée : il n'y a rien à rétablir.";
export const MESSAGE_MONTANT_NON_OUVERTE =
  "Seul le montant d'une échéance ouverte (prévue ou manquée, sans paiement) se modifie.";
export const MESSAGE_SIGNE_SERIE =
  "Ce montant change de signe, mais des échéances liées, ignorées ou passées de la série gardent l'ancien. Une sortie reste une sortie : pour changer de sens, supprime la série et crée-en une nouvelle.";
export const MESSAGE_SIGNE_ECHEANCE =
  "Le montant d'une échéance garde le signe de sa série : négatif pour une sortie, positif pour une entrée.";
export const MESSAGE_DEJA_TERMINEE = "Cette série est déjà terminée.";
export const MESSAGE_FIN_AVANT_ANCRAGE = "La date de fin précède la date d'ancrage de la série.";

export function messageFinAvantLiee(echeance: DateCivile): string {
  return `La série a un paiement lié le ${jourEtMois(echeance)} ${echeance.slice(0, 4)} : la date de fin ne peut pas le précéder.`;
}
