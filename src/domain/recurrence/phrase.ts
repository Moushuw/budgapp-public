// Libellé et phrase d'une suggestion — docs/lot-m3.md §4.2 et §4.3.

import { formatMontant } from "../money";
import { uniteCadence } from "./cadence";
import { casseDeTitre, jourDuMois, libelleCadence, moisEtAnnee, nomJourSemaine } from "./libelles";
import { jourModal, jourSemaineModal } from "./statistiques";
import type { SuggestionAPhraser, TransactionDeGroupe } from "./types";

/** Nom du bénéficiaire si toutes les transactions ont un bénéficiaire non nul de même id (le nom de la première), sinon casseDeTitre(motif). */
export function libelleSuggestion(motif: string, transactions: readonly Pick<TransactionDeGroupe, "beneficiaire">[]): string {
  const premier = transactions[0]?.beneficiaire ?? null;
  if (premier === null) {
    return casseDeTitre(motif);
  }
  const tousLeMeme = transactions.every((t) => t.beneficiaire !== null && t.beneficiaire.id === premier.id);
  return tousLeMeme ? premier.nom : casseDeTitre(motif);
}

export function phraseSuggestion(suggestion: SuggestionAPhraser): string {
  const premiereDate = [...suggestion.dates].sort()[0];
  if (premiereDate === undefined) {
    throw new Error("phraseSuggestion : aucune date");
  }

  const approximatif = suggestion.nature === "VARIABLE" ? "environ " : "";
  const montant = `${approximatif}${formatMontant(Math.abs(suggestion.montantMedianCents))}`;
  const liaison = suggestion.montantMedianCents > 0 ? " reçu " : ", ";

  let jour = "";
  if (suggestion.cadence !== "DEUX_FOIS_PAR_MOIS") {
    const unite = uniteCadence(suggestion.cadence);
    if (unite === "MOIS") {
      jour = ` vers le ${jourDuMois(jourModal(suggestion.dates))}`;
    } else if (unite === "SEMAINES") {
      jour = ` le ${nomJourSemaine(jourSemaineModal(suggestion.dates))}`;
    }
  }

  const occurrences = suggestion.nbOccurrences <= 1 ? "occurrence" : "occurrences";
  return `${suggestion.libelle} — ${montant}${liaison}${libelleCadence(suggestion.cadence)}${jour}. ${suggestion.nbOccurrences} ${occurrences} depuis ${moisEtAnnee(premiereDate)}.`;
}
