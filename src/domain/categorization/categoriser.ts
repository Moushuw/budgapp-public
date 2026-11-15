// Ordre exact bénéficiaire → règles → défaut
// (docs/lot-m1.md §6.3, étapes 2 à 4 ; l'étape 1, les filtres, est en tranche 6).

import { appliquerRegles } from "./resolution";
import type { ContexteBeneficiaire, LigneACategoriser, RegleCategorisation, ResultatCategorisation } from "./types";

export function categoriser(
  ligne: LigneACategoriser,
  beneficiaire: ContexteBeneficiaire | null,
  regles: readonly RegleCategorisation[],
): ResultatCategorisation {
  // 1. Verrou : la sous-catégorie du bénéficiaire prime, aucune règle ne peut la poser.
  const verrouille = beneficiaire?.categorieVerrouillee === true;

  // 2. Règles.
  const resultat = appliquerRegles(ligne, regles, { sousCategorieVerrouillee: verrouille });

  let subcategoryId = resultat.affectation.subcategoryId;

  if (verrouille) {
    // TS déduit que beneficiaire n'est pas null via la condition aliasée qui a produit `verrouille`.
    subcategoryId = beneficiaire.sousCategorieParDefautId;
  } else if (
    // 3. Défaut du bénéficiaire — seulement si les quatre conditions sont
    // réunies. Le défaut ne comble pas un créneau laissé vide par un
    // conflit : un conflit veut dire « on ne tranche pas ».
    beneficiaire !== null &&
    beneficiaire.autoCategorisation &&
    subcategoryId === null &&
    resultat.affectation.ventilation === null &&
    !resultat.conflits.some((conflit) => conflit.slot === "SOUS_CATEGORIE")
  ) {
    subcategoryId = beneficiaire.sousCategorieParDefautId;
  }

  // 4. Le défaut du bénéficiaire ne renseigne jamais regleAppliqueeId : ce
  // n'est pas une règle. resultat.regleAppliqueeId est déjà null sous verrou
  // (aucune action CATEGORISER n'a pu poser la sous-catégorie).
  return {
    ...resultat,
    affectation: { ...resultat.affectation, subcategoryId },
  };
}
