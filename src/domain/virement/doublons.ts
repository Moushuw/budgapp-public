/**
 * Lignes qui visent une cible déjà visée par une ligne précédente du tableau : clé de la ligne bloquée → clé de la
 * première ligne qui vise la même cible. Les virementAvec null sont ignorés. L'appelant passe seulement les lignes
 * envoyées (action ≠ IGNORER).
 */
export function ciblesEnDouble(
  lignes: readonly { readonly cle: string; readonly virementAvec: string | null }[],
): ReadonlyMap<string, string> {
  const premiereParCible = new Map<string, string>();
  const doublons = new Map<string, string>();
  for (const ligne of lignes) {
    if (ligne.virementAvec === null) {
      continue;
    }
    const premiere = premiereParCible.get(ligne.virementAvec);
    if (premiere === undefined) {
      premiereParCible.set(ligne.virementAvec, ligne.cle);
    } else {
      doublons.set(ligne.cle, premiere);
    }
  }
  return doublons;
}
