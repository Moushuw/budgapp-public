// Étape 2 de docs/lot-m1.md §6.3 — recherche d'un Payee dont le nomNormalise
// égale la description d'une ligne, puis en est un préfixe. Les deux côtés
// passent par normaliserNom : la clé agressive des relevés
// (normaliserDescription) tronquait les noms au premier jeton numérique, et un
// bénéficiaire tronqué captait toutes les lignes commençant par ce qui
// restait (« Pizza 900 » → « PIZZA » captait « PIZZA HUT ») — journal
// INDEX.md du 2026-09-29.
//
// La règle de rapprochement, en entier :
//
// 1. Un nom compte ses « caractères de mot » : lettres et chiffres (toute
//    écriture), plus les liants « & » et apostrophes, qui soudent un nom
//    (A&W, H&M, MCDONALD'S). Espaces et ponctuation de séparation (. * # / -
//    ( ) , etc.) ne comptent pas.
// 2. Égalité : la description entière égale le nom. Aucune longueur minimale :
//    une description strictement égale à « BP » n'appartient à personne
//    d'autre que le bénéficiaire « BP ».
// 3. Préfixe : la description commence par le nom, le caractère suivant n'est
//    pas un caractère de mot, ET le nom compte au moins LONGUEUR_MIN_PREFIXE
//    caractères de mot. « A&W » ne se découpe donc jamais en « A » ; « IGA »
//    ne capte pas « IGAME » ; « AMZN MKTP CA » capte « AMZN MKTP CA*2K4LM9 ».
//    Le minimum ne vaut que pour le préfixe, seul endroit où un nom court
//    capte ce qui ne lui appartient pas. Trois, parce que c'est la longueur
//    des enseignes-sigles qu'on doit reconnaître par préfixe (IGA, SAQ, A&W,
//    BMO), et que les mots d'une ou deux lettres sont surtout des articles et
//    des abréviations françaises (LE, LA, DE, DU, AU, ST) qui ouvrent
//    n'importe quelle description. « BP » reconnaît « BP », pas « BP GAS ».
// 4. Plusieurs préfixes : le plus long gagne, puis le premier par nom.

import { CARACTERE_DE_MOT, CARACTERES_DE_MOT } from "./frontiere-mot";
import { normaliserNom } from "./normaliser";
import type { BeneficiaireIngestion } from "./types";

export const LONGUEUR_MIN_PREFIXE = 3;

/** true si ce nom normalisé peut reconnaître une ligne par préfixe (règle 3). L'égalité, elle, n'a pas de minimum. */
export function prefixeAutorise(nomNormalise: string): boolean {
  return (nomNormalise.match(CARACTERES_DE_MOT) ?? []).length >= LONGUEUR_MIN_PREFIXE;
}

/** Le premier par nom croissant (localeCompare fr-CA), puis par id — jamais l'ordre de la liste. */
function meilleurExAequo(candidats: readonly BeneficiaireIngestion[]): BeneficiaireIngestion | null {
  let meilleur: BeneficiaireIngestion | null = null;
  for (const candidat of candidats) {
    if (meilleur === null) {
      meilleur = candidat;
      continue;
    }
    const comparaison = candidat.nom.localeCompare(meilleur.nom, "fr-CA");
    if (comparaison < 0 || (comparaison === 0 && candidat.id < meilleur.id)) {
      meilleur = candidat;
    }
  }
  return meilleur;
}

/** `description` est la description brute de la ligne ; la normalisation se fait ici, du même côté que les noms. */
export function resoudreBeneficiaire(
  description: string,
  beneficiaires: readonly BeneficiaireIngestion[],
): BeneficiaireIngestion | null {
  const cle = normaliserNom(description);
  if (cle === "") {
    return null;
  }

  const parEgalite = beneficiaires.filter((beneficiaire) => beneficiaire.nomNormalise === cle);
  if (parEgalite.length > 0) {
    return meilleurExAequo(parEgalite);
  }

  const parPrefixe = beneficiaires.filter((beneficiaire) => {
    if (!prefixeAutorise(beneficiaire.nomNormalise)) {
      return false;
    }
    const nomNormalise = beneficiaire.nomNormalise;
    if (!cle.startsWith(nomNormalise)) {
      return false;
    }
    const caractereSuivant = cle.charAt(nomNormalise.length);
    return caractereSuivant === "" || !CARACTERE_DE_MOT.test(caractereSuivant);
  });
  if (parPrefixe.length === 0) {
    return null;
  }

  const longueurMax = Math.max(...parPrefixe.map((beneficiaire) => beneficiaire.nomNormalise.length));
  const plusLongs = parPrefixe.filter((beneficiaire) => beneficiaire.nomNormalise.length === longueurMax);

  return meilleurExAequo(plusLongs);
}

/**
 * Résout le nom posé par RENOMMER_BENEFICIAIRE. Égalité de clé d'identité
 * uniquement, jamais par préfixe — donc sans longueur minimale (règle 2).
 */
export function beneficiaireParNom(
  nom: string,
  beneficiaires: readonly BeneficiaireIngestion[],
): BeneficiaireIngestion | null {
  const nomNormalise = normaliserNom(nom);
  if (nomNormalise === "") {
    return null;
  }
  const candidats = beneficiaires.filter((beneficiaire) => beneficiaire.nomNormalise === nomNormalise);
  return meilleurExAequo(candidats);
}
