// descriptionNormalisee — docs/modele-ingestion-recurrences.md §3.
// Sert au dédoublonnage, à la catégorisation et à la détection des récurrences.

const JETON_NUMERIQUE = /^#?\d+([.,]\d+)?$/;

/** Majuscules, accents retir\u00e9s, espaces de bord coup\u00e9s. Ne tronque rien. */
export function aplatirTexte(texte: string): string {
  return texte
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .trim();
}

/**
 * Clé d'identité d'un nom de bénéficiaire (Payee.nomNormalise) : aplatirTexte
 * et espaces internes réduits à un seul, rien d'autre. Surtout pas les jetons
 * numériques que normaliserDescription retire d'un relevé : ils distinguent
 * « Les 3 Brasseurs » de « Les 5 Saisons » (journal INDEX.md du 2026-09-29).
 * Sert aussi, appliquée à une description, à chercher un bénéficiaire par
 * préfixe (beneficiaire.ts) : les deux côtés doivent partager la même clé.
 */
export function normaliserNom(nom: string): string {
  return aplatirTexte(nom).replace(/\s+/g, " ");
}

/** Clé d'une ligne de relevé : empreinte, dédoublonnage, conditions de règle, récurrences. Jamais un nom de bénéficiaire. */
export function normaliserDescription(descriptionBrute: string): string {
  const sansAccents = aplatirTexte(descriptionBrute);

  if (sansAccents === "") {
    return "";
  }

  const retenus: string[] = [];

  for (const token of sansAccents.split(/\s+/)) {
    if (JETON_NUMERIQUE.test(token)) {
      // Numéro de succursale, de terminal, date interne ou montant : lui et
      // ce qui suit sont écartés (ex. « PETRO-CANADA 07421 VALBRUME »).
      break;
    }

    const positionEtoile = token.indexOf("*");
    if (positionEtoile !== -1) {
      // Suffixe de référence après « * » (ex. « CA*2K4LM9 » → « CA »).
      const prefixe = token.slice(0, positionEtoile);
      if (prefixe !== "") {
        retenus.push(prefixe);
      }
      continue;
    }

    retenus.push(token);
  }

  return retenus.join(" ");
}
