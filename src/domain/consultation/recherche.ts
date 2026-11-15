// Motif de recherche textuelle — docs/lot-m2.md §5.2. Le SQL qui l'emploie
// déclare `ESCAPE '!'` : un « % » ou un « _ » saisi se cherche tel quel.

export const CARACTERE_ECHAPPEMENT_LIKE = "!";

/** Échappe « ! », « % » et « _ » par « ! » (dans cet ordre : « ! » d'abord). */
export function echapperMotifLike(texte: string): string {
  return texte.replace(/!/g, "!!").replace(/%/g, "!%").replace(/_/g, "!_");
}

export function motifRecherche(texte: string): string {
  return `%${echapperMotifLike(texte.trim())}%`;
}
