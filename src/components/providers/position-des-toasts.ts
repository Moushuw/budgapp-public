// Où s'affichent les toasts. Les dialogues sont centrés et les panneaux (détail, échéances, réconciliation) sont à
// droite avec leur barre « Fermer » : le haut-centre couvre le titre et la croix d'un dialogue haut ainsi que les
// onglets, le bas à droite couvre la barre « Fermer ». En bureau, le bas à gauche ne gêne que le panneau Filtres.

import { useSyncExternalStore } from "react";

export type PositionToast = "top-center" | "bottom-left";

export const REQUETE_BUREAU = "(min-width: 768px)";

export function positionDesToasts(bureau: boolean): PositionToast {
  return bureau ? "bottom-left" : "top-center";
}

function abonner(rappel: () => void): () => void {
  const media = window.matchMedia(REQUETE_BUREAU);
  media.addEventListener("change", rappel);
  return () => {
    media.removeEventListener("change", rappel);
  };
}

function lireBureau(): boolean {
  return window.matchMedia(REQUETE_BUREAU).matches;
}

/** Le snapshot serveur est « pas bureau » : le premier rendu client se réaligne à l'hydratation. */
export function usePositionDesToasts(): PositionToast {
  return positionDesToasts(useSyncExternalStore(abonner, lireBureau, () => false));
}
