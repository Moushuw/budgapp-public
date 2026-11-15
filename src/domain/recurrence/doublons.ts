/**
 * Lignes qui visent une occurrence déjà visée par une ligne précédente : clé de la ligne bloquée → clé de la
 * première. Les occurrenceAvec null sont ignorés. L'appelant passe seulement les lignes envoyées.
 */
export function occurrencesEnDouble(
  lignes: readonly { readonly cle: string; readonly occurrenceAvec: string | null }[],
): ReadonlyMap<string, string> {
  const premiereParOccurrence = new Map<string, string>();
  const doublons = new Map<string, string>();
  for (const ligne of lignes) {
    if (ligne.occurrenceAvec === null) {
      continue;
    }
    const premiere = premiereParOccurrence.get(ligne.occurrenceAvec);
    if (premiere === undefined) {
      premiereParOccurrence.set(ligne.occurrenceAvec, ligne.cle);
    } else {
      doublons.set(ligne.cle, premiere);
    }
  }
  return doublons;
}
