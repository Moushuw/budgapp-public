// Messages d'échec des actions de solde — docs/lot-m3.md §5. Sans directive
// "use server" : un tel fichier n'exporte que des fonctions asynchrones.

import type { DateCivile } from "@/domain/dates";
import { LIBELLES_SOURCE_SOLDE, type SourceSolde } from "@/domain/referentiel";
import { dateLongue } from "@/domain/solde";

export const MESSAGE_COMPTE_INTROUVABLE = "Ce compte n'existe plus.";
export const MESSAGE_ANCRAGE_INTROUVABLE = "Ce solde n'existe plus.";
export const MESSAGE_ECART_SAISIE_HORS_LIMITE =
  "L'écart entre ce solde et le solde calculé dépasse le plus grand montant enregistrable.";
export const MESSAGE_EXPLICATION_ECART_NUL =
  "L'écart de ce solde est nul : il n'y a rien à expliquer.";
export const MESSAGE_AJUSTEMENT_LIE =
  "L'ajustement de ce solde est rattaché à une échéance récurrente, un virement, une cotisation ou un objectif : supprime-le d'abord depuis la consultation des transactions.";
export const MESSAGE_AJUSTEMENT_COURSE =
  "Un ajustement vient d'être enregistré en même temps : recharge la page et réessaie.";

export function messageDoublonAncrage(source: SourceSolde, date: DateCivile): string {
  return `Un solde « ${LIBELLES_SOURCE_SOLDE[source]} » existe déjà pour ce compte au ${dateLongue(date)}. Supprime-le d'abord, ou choisis une autre date ou une autre source.`;
}
