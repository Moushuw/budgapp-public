// Textes des toasts et des confirmations des soldes — docs/lot-m3.md §5. Pur.

import type { Cents } from "@/domain/money";
import { formatMontant } from "@/domain/money";
import { LIBELLES_SOURCE_SOLDE } from "@/domain/referentiel";
import { dateLongue, type AncrageAffiche } from "@/domain/solde";

function fmt(c: Cents): string {
  return formatMontant(c, "CENTS");
}

export function libelleSaisie(ecartCents: Cents): string {
  return ecartCents === 0
    ? "Solde enregistré : il correspond au solde calculé."
    : `Solde enregistré : écart de ${fmt(ecartCents)} à expliquer.`;
}

export const LIBELLE_EXPLICATION = "Explication enregistrée.";

export function libelleAjustement(montantCents: Cents): string {
  return `Ajustement de ${fmt(montantCents)} créé : l'écart est soldé.`;
}

export function detailAjustement(sousCategorieCreee: boolean): string | null {
  return sousCategorieCreee
    ? "La sous-catégorie « Ajustement de solde » a été créée dans la catégorie « Ajustements »."
    : null;
}

export function libelleSuppressionAncrage(ajustementSupprime: { readonly montantCents: Cents } | null): string {
  return ajustementSupprime === null
    ? "Solde supprimé."
    : `Solde supprimé, avec son ajustement de ${fmt(ajustementSupprime.montantCents)}.`;
}

export function consequenceSuppressionAncrage(ancrage: AncrageAffiche): string {
  const phrases = [
    `Le solde « ${LIBELLES_SOURCE_SOLDE[ancrage.source]} » du ${dateLongue(ancrage.date)} (${fmt(ancrage.soldeDeclareCents)}) sera supprimé.`,
  ];
  const reconciliation = ancrage.reconciliation;
  if (reconciliation?.explication != null && reconciliation.explication.trim() !== "") {
    phrases.push("Son explication part avec lui.");
  }
  if (reconciliation?.ajustement != null) {
    phrases.push(
      `Son ajustement de ${fmt(reconciliation.ajustement.montantCents)} sera supprimé avec lui : le solde calculé à partir du ${dateLongue(reconciliation.ajustement.date)} changera d'autant.`,
    );
  }
  return phrases.join(" ");
}

/** Le montant n'apparaît que si l'action est possible : un bouton refusé ne promet aucun montant. */
export function libelleBoutonAjustement(ecartCents: Cents, refuse = false): string {
  return refuse ? "Créer un ajustement" : `Créer un ajustement de ${fmt(ecartCents)}`;
}
