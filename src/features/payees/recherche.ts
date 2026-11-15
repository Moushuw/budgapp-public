// Filtrage de la liste des bénéficiaires par la barre de recherche de
// l'écran — vit dans features/ et non dans domain/ parce qu'il travaille sur
// une forme venue du repository ; features/ a le droit d'importer domain/,
// l'inverse est interdit (CLAUDE.md §4, règle 5).

// Import direct, pas depuis le barillet @/domain/ingestion : ce module est
// tiré par des composants "use client" (BeneficiairesEcran.tsx,
// DialogueFusion.tsx), et le barillet réexporte aussi calculerEmpreinte
// (node:crypto, ./empreinte.ts) dans le même index.ts — même précédent que
// src/features/import/etat-revue.ts, corrigé à la relecture de la tranche 6
// point 8 (journal INDEX.md du 2026-09-20).
import { aplatirTexte } from "@/domain/ingestion/normaliser";

/** Recherche vide = tout passe. Insensible à la casse et aux accents, sur le nom saisi comme sur le nom normalisé. */
export function correspondARecherche(
  beneficiaire: { readonly nom: string; readonly nomNormalise: string },
  recherche: string,
): boolean {
  const q = aplatirTexte(recherche);
  if (q === "") {
    return true;
  }
  // aplatirTexte sur la saisie : une recherche partielle, pas une clé d'identité.
  return aplatirTexte(beneficiaire.nom).includes(q) || beneficiaire.nomNormalise.includes(q);
}
