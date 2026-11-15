"use client";

// Ramène l'onglet actif au centre de sa bande à défilement horizontal, au chargement comme à chaque changement
// (docs/lot-m2.md §10.3). La page ne défile jamais : on pose scrollLeft sur la bande, sans scrollIntoView.

import { useEffect, type RefObject } from "react";
import { defilementCentre } from "./onglets";

const SELECTEUR_ONGLET_ACTIF = '[aria-current="page"], [role="tab"][aria-selected="true"]';

export function useCentrerOngletActif(bandeRef: RefObject<HTMLElement | null>, cle: string): void {
  useEffect(() => {
    const bande = bandeRef.current;
    if (bande === null) {
      return;
    }
    const actif = bande.querySelector<HTMLElement>(SELECTEUR_ONGLET_ACTIF);
    if (actif === null) {
      return;
    }
    const rectBande = bande.getBoundingClientRect();
    const rectOnglet = actif.getBoundingClientRect();
    bande.scrollLeft = defilementCentre(
      { largeurVisible: bande.clientWidth, largeurContenu: bande.scrollWidth },
      { gauche: rectOnglet.left - rectBande.left + bande.scrollLeft, largeur: rectOnglet.width },
    );
  }, [bandeRef, cle]);
}
