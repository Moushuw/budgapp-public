// Phrases à accord grammatical de l'écran des règles : 0 et 1 au singulier (accorder), jamais « (s) ».

import { accorder } from "@/features/import/libelles-revue";
import type { RecapApplication } from "@/server/actions/rules";

const PRESERVEES = "(saisie manuelle, bénéficiaire verrouillé, ventilée ou virement)";

export function libelleApercuCorrespondances(correspondances: number, changements: number): string {
  const modifiee = changements >= 2 ? "seraient modifiées" : "serait modifiée";
  return `${accorder(correspondances, "transaction correspond", "transactions correspondent")}, dont ${String(changements)} ${modifiee}.`;
}

export function libelleApercuPreservees(n: number): string {
  const garde = n >= 2 ? "ces lignes gardent leur catégorie actuelle" : "cette ligne garde sa catégorie actuelle";
  return `${accorder(n, "catégorie préservée", "catégories préservées")} ${PRESERVEES} : ${garde}.`;
}

/** Pied de la liste de l'aperçu, quand `affichees` < `correspondances`. */
export function libelleApercuTronque(affichees: number, correspondances: number, changements: number): string {
  const modifiee = changements >= 2 ? "seront modifiées" : "sera modifiée";
  return `${accorder(affichees, "première", "premières")} des ${String(correspondances)} transactions correspondantes — ${String(changements)} ${modifiee} au total.`;
}

/** Les cinq phrases du bilan, dans l'ordre affiché. */
export function lignesRecapApplication(r: RecapApplication): readonly string[] {
  const ignorees = r.ignorees;
  const pluriel = ignorees >= 2;
  return [
    `${accorder(r.modifiees, "transaction modifiée", "transactions modifiées")}.`,
    `${accorder(r.inchangees, "transaction inchangée", "transactions inchangées")}.`,
    `${accorder(r.beneficiairesIntrouvables, "bénéficiaire introuvable", "bénéficiaires introuvables")}.`,
    `Parmi les lignes qui correspondent, ${accorder(r.categoriesPreservees, "catégorie préservée", "catégories préservées")} ${PRESERVEES}.`,
    `${accorder(ignorees, "transaction ignorée", "transactions ignorées")}, rien n'y a été écrit : ${
      pluriel ? "elles ne correspondaient plus à la règle, ou elles avaient changé" : "elle ne correspondait plus à la règle, ou elle avait changé"
    } depuis l'aperçu. Relance l'aperçu pour ${pluriel ? "les" : "la"} traiter.`,
  ];
}

/** Toast d'application. */
export function libelleBilanApplication(modifiees: number, inchangees: number, ignorees: number): string {
  return `${accorder(modifiees, "transaction modifiée", "transactions modifiées")}, ${String(inchangees)} ${inchangees >= 2 ? "inchangées" : "inchangée"}, ${String(ignorees)} ${ignorees >= 2 ? "ignorées" : "ignorée"}.`;
}

export function consequenceSuppressionRegle(
  nbConditions: number,
  nbActions: number,
  nbTransactions: number,
  libelle: string,
): string {
  const debut = `La règle « ${libelle} » sera supprimée, avec ${accorder(nbConditions, "condition", "conditions")} et ${accorder(nbActions, "action", "actions")}.`;
  if (nbTransactions === 0) {
    return `${debut} Aucune transaction ne porte la trace de cette règle.`;
  }
  const consequence = nbTransactions >= 2 ? "elles ne sont ni recatégorisées, ni supprimées" : "elle n'est ni recatégorisée, ni supprimée";
  return `${debut} ${accorder(nbTransactions, "transaction perdra", "transactions perdront")} la trace de la règle appliquée ; ${consequence}.`;
}

export function libelleRegleSupprimee(transactionsDetachees: number): string {
  return transactionsDetachees > 0
    ? `Règle supprimée, ${accorder(transactionsDetachees, "transaction a perdu", "transactions ont perdu")} la trace de la règle appliquée.`
    : "Règle supprimée.";
}
