// L'étape 1 de docs/lot-m1.md §6.3. Porté de la v1
// (docs/description-fonctionnelle-v1.md §5.3), généralisé aux quatre modes de
// ModeCorrespondance. Ne lève jamais : une regex invalide ressort typée.

import { aplatirTexte } from "./normaliser";
import type { FiltreInapplicable, FiltreIngestion } from "./types";

export interface ResultatFiltrage {
  readonly filtre: FiltreIngestion | null;
  readonly inapplicables: readonly FiltreInapplicable[];
}

function jetons(texteAplati: string): string[] {
  return texteAplati.split(/[^A-Z0-9]+/).filter((jeton) => jeton !== "");
}

/** Vrai si la suite de jetons `motif` apparaît contiguë dans `texte`. */
function motEntierTrouve(texteJetons: readonly string[], motifJetons: readonly string[]): boolean {
  if (motifJetons.length === 0) {
    return false;
  }
  for (let depart = 0; depart <= texteJetons.length - motifJetons.length; depart += 1) {
    let correspond = true;
    for (let i = 0; i < motifJetons.length; i += 1) {
      if (texteJetons[depart + i] !== motifJetons[i]) {
        correspond = false;
        break;
      }
    }
    if (correspond) {
      return true;
    }
  }
  return false;
}

function correspond(
  description: string,
  filtre: FiltreIngestion,
  inapplicables: FiltreInapplicable[],
): boolean {
  const descriptionAplatie = aplatirTexte(description);
  const motifAplati = aplatirTexte(filtre.motif);

  if (motifAplati === "") {
    // Un motif vide ne correspond jamais : sinon il filtrerait tout.
    return false;
  }

  switch (filtre.mode) {
    case "EXACT":
      return descriptionAplatie === motifAplati;
    case "CONTIENT":
      return descriptionAplatie.includes(motifAplati);
    case "MOT_ENTIER":
      return motEntierTrouve(jetons(descriptionAplatie), jetons(motifAplati));
    case "REGEX": {
      try {
        const regex = new RegExp(filtre.motif, "i");
        return regex.test(description);
      } catch (erreur) {
        inapplicables.push({
          filtreId: filtre.id,
          motif: filtre.motif,
          detail: erreur instanceof Error ? erreur.message : "Expression régulière invalide.",
        });
        return false;
      }
    }
  }
}

/** Le premier filtre correspondant, dans l'ordre reçu. Ne lève jamais. */
export function trouverFiltre(
  description: string,
  filtres: readonly FiltreIngestion[],
): ResultatFiltrage {
  const inapplicables: FiltreInapplicable[] = [];
  const dejaSignales = new Set<string>();

  for (const filtre of filtres) {
    const avant = inapplicables.length;
    const trouve = correspond(description, filtre, inapplicables);
    // Un même filtre à regex invalide ne doit être signalé qu'une fois par
    // appel — ici un seul appel évalue une seule ligne, donc au plus une
    // occurrence est possible ; la garde reste défensive et sans coût.
    if (inapplicables.length > avant) {
      const dernier = inapplicables[inapplicables.length - 1];
      if (dernier !== undefined) {
        if (dejaSignales.has(dernier.filtreId)) {
          inapplicables.pop();
        } else {
          dejaSignales.add(dernier.filtreId);
        }
      }
    }
    if (trouve) {
      return { filtre, inapplicables };
    }
  }

  return { filtre: null, inapplicables };
}
