// La frontière de mot, définie une seule fois : la résolution du bénéficiaire
// (beneficiaire.ts) et l'opérateur de règle MOT_ENTIER (categorization/) la
// partagent pour ne jamais diverger — docs/lot-m1.md §4.6.
//
// N'importe que ./normaliser, jamais le barillet ./index (il tire node:crypto).

import { aplatirTexte } from "./normaliser";

/** Caractère de mot : lettre ou chiffre (toute écriture), « & », apostrophe droite ou typographique (U+2019). */
export const CARACTERE_DE_MOT = /[\p{L}\p{N}&'’]/u;
/** Pour String.prototype.match uniquement (drapeau g). */
export const CARACTERES_DE_MOT = /[\p{L}\p{N}&'’]/gu;

/** false pour "" et pour tout caractère hors CARACTERE_DE_MOT. */
export function estCaractereDeMot(caractere: string): boolean {
  return caractere !== "" && CARACTERE_DE_MOT.test(caractere);
}

/**
 * Vrai si `motif`, aplati, apparaît dans `texte`, aplati, à une position où le
 * caractère qui précède et celui qui suit ne sont pas des caractères de mot
 * (début et fin de texte comptent comme frontières). Toutes les occurrences
 * sont essayées, pas seulement la première. Motif aplati vide ⇒ false.
 */
export function contientMotEntier(texte: string, motif: string): boolean {
  const cible = aplatirTexte(motif);
  if (cible === "") {
    return false;
  }
  const meule = aplatirTexte(texte);

  let depart = 0;
  for (;;) {
    const position = meule.indexOf(cible, depart);
    if (position === -1) {
      return false;
    }
    const avant = position === 0 ? "" : meule.charAt(position - 1);
    const apres = meule.charAt(position + cible.length);
    if (!estCaractereDeMot(avant) && !estCaractereDeMot(apres)) {
      return true;
    }
    depart = position + 1;
  }
}
