// Libellés français des soldes et de la réconciliation — docs/lot-m3.md §5.

import type { DateCivile } from "../dates";
import { jourEtMois } from "../recurrence/libelles";
import { LIBELLES_TYPE_COMPTE, type TypeCompte } from "../referentiel";
import type { ConstatExplication, MotifRefusAjustement, NatureExplication, StatutAncrage } from "./types";

export const LIBELLES_STATUT_ANCRAGE: Record<StatutAncrage, string> = {
  EQUILIBRE: "Équilibré",
  EXPLIQUE: "Expliqué",
  ECART_OUVERT: "Écart ouvert",
};

export const LIBELLES_NATURE_EXPLICATION: Record<NatureExplication, string> = {
  PERIODE_NON_COUVERTE: "Période non couverte",
  EN_ATTENTE: "Transactions en attente",
  DOUBLON: "Doublon possible",
  LIGNE_NON_RECONNUE: "Ligne jamais reconnue",
  MONTANT_ERRONE: "Montant erroné",
};

export const LIBELLES_CONSTAT: Record<ConstatExplication, string> = {
  PISTE: "Piste à vérifier",
  RIEN: "Rien de ce côté",
  RAPPEL: "Rappel",
};

export const MESSAGES_REFUS_AJUSTEMENT: Record<MotifRefusAjustement, string> = {
  AJUSTEMENT_EXISTANT: "Ce solde a déjà un ajustement.",
  ECART_NUL: "L'écart de ce solde est déjà nul : aucun ajustement à créer.",
  ECART_HORS_LIMITE:
    "L'écart dépasse le plus grand montant qu'une transaction peut porter : aucun ajustement possible.",
};

/** « 20 septembre 2026 », « 1er mars 2099 » (jourEtMois de domain/recurrence/libelles + année). */
export function dateLongue(d: DateCivile): string {
  return `${jourEtMois(d)} ${d.slice(0, 4)}`;
}

function sansAccentsNiCasse(texte: string): string {
  return texte
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim();
}

/** `nom` seul si nom et libellé du type coïncident (casse, accents et espaces de bord ignorés), sinon « nom · type ». */
export function sousTitreCompte(nom: string, type: TypeCompte): string {
  const libelleType = LIBELLES_TYPE_COMPTE[type];
  return sansAccentsNiCasse(nom) === sansAccentsNiCasse(libelleType) ? nom.trim() : `${nom} · ${libelleType}`;
}

/** « Solde au 10 octobre 2026 » ; « Solde » quand la liste est vide (aucune date de calcul). */
export function libelleEnteteSolde(soldeAu: DateCivile | null): string {
  return soldeAu === null ? "Solde" : `Solde au ${dateLongue(soldeAu)}`;
}

/** jourEtMois(d), suivi de l'année seulement si elle diffère de celle de `reference`. */
export function dateLisible(d: DateCivile, reference: DateCivile): string {
  return d.slice(0, 4) === reference.slice(0, 4) ? jourEtMois(d) : dateLongue(d);
}
