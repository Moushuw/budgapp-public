// Résumé lisible d'une condition de règle, pour les cartes et le tableau de
// l'écran des règles. Module pur : pas de JSX, pas de hook.

import {
  LIBELLES_CHAMP_CONDITION,
  LIBELLES_OPERATEUR_CONDITION,
  LIBELLES_SENS_CONDITION,
  SEPARATEUR_LISTE,
  TYPE_VALEUR_PAR_CHAMP,
} from "@/domain/categorization";
import { formatMontant } from "@/domain/money";
import type { ConditionListe } from "@/server/actions/rules";

export const LIBELLE_COMPTE_INTROUVABLE = "(compte introuvable)";
export const LIBELLE_COMPTES_EN_CHARGEMENT = "(chargement…)";
export const LIBELLE_COMPTES_INDISPONIBLES = "(comptes indisponibles)";

/**
 * Les noms de comptes tels que l'écran les connaît. « ERREUR » se distingue
 * de « CHARGEMENT » : sans ça, un chargement échoué afficherait
 * « (chargement…) » indéfiniment.
 */
export type NomsComptes = ReadonlyMap<string, string> | "CHARGEMENT" | "ERREUR";

function entreGuillemets(texte: string): string {
  return `« ${texte} »`;
}

/** Un montant stocké en cents entiers ; une valeur non entière s'affiche brute, sans deviner. */
function montantLisible(valeur: string): string {
  return /^-?\d+$/.test(valeur.trim()) ? formatMontant(Number(valeur), "CENTS") : entreGuillemets(valeur);
}

/** La valeur d'une condition, lisible. */
export function valeurLisible(condition: ConditionListe, nomsComptes: NomsComptes): string {
  const { champ, operateur, valeur, valeurFin } = condition;

  switch (TYPE_VALEUR_PAR_CHAMP[champ]) {
    case "TEXTE":
      return operateur === "DANS"
        ? valeur
            .split(SEPARATEUR_LISTE)
            .map((element) => entreGuillemets(element))
            .join(", ")
        : entreGuillemets(valeur);
    case "MONTANT":
      if (operateur === "ENTRE" && valeurFin !== null) {
        return `${montantLisible(valeur)} et ${montantLisible(valeurFin)}`;
      }
      return montantLisible(valeur);
    case "COMPTE": {
      if (nomsComptes === "CHARGEMENT") {
        return LIBELLE_COMPTES_EN_CHARGEMENT;
      }
      if (nomsComptes === "ERREUR") {
        return LIBELLE_COMPTES_INDISPONIBLES;
      }
      return valeur
        .split(SEPARATEUR_LISTE)
        .map((id) => id.trim())
        .filter((id) => id !== "")
        .map((id) => nomsComptes.get(id) ?? LIBELLE_COMPTE_INTROUVABLE)
        .join(", ");
    }
    case "SENS":
      if (valeur === "ENTREE" || valeur === "SORTIE") {
        return LIBELLES_SENS_CONDITION[valeur];
      }
      return entreGuillemets(valeur);
  }
}

/** « Aucune condition » si vide ; sinon la première : « <Champ> <opérateur> <valeur lisible> ». */
export function resumeCondition(
  conditions: readonly ConditionListe[],
  nomsComptes: NomsComptes,
): string {
  const [premiere] = conditions;
  if (premiere === undefined) {
    return "Aucune condition";
  }
  return `${LIBELLES_CHAMP_CONDITION[premiere.champ]} ${LIBELLES_OPERATEUR_CONDITION[premiere.operateur]} ${valeurLisible(premiere, nomsComptes)}`;
}
