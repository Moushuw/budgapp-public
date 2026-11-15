// Profils d'import — le profil est une donnée, pas du code (docs/lot-m1.md §5.3).
// Non persisté en base en M1 (§3.1) : une simple liste codée en dur.

import type { ProfilImport } from "./types";

// Le motif de montant contient l'espace insécable (U+00A0) dans la classe
// [\s ] : c'est ce que produit le copier-coller d'une page web. Ne pas
// « nettoyer » ni simplifier ce motif (docs/lot-m1.md §5.4).
//
// Le préfixe (?:^|[\s ]) est la frontière gauche du montant : sans elle, le
// groupe de milliers avale le chiffre final du texte qui précède et
// « Boutique Web Ca Qz37*9kb2 164,90 $ » se lit 2 164,90 $. Pas de lookbehind,
// refusé par "target": "ES2017" (docs/lot-m1.md §5.4, amendement 2026-09-18).
export const DESJARDINS_ACCESD: ProfilImport = {
  id: "desjardins-accesd",
  libelle: "Desjardins — copier-coller AccèsD",
  institution: "Desjardins",
  nettoyage: {
    tabulationsEnSautsDeLigne: true,
    tronquerApres: /\bTotal\b/,
  },
  date: {
    motif:
      /^(\d{1,2})\s+(janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)\b/i,
    mois: [
      "janvier",
      "février",
      "mars",
      "avril",
      "mai",
      "juin",
      "juillet",
      "août",
      "septembre",
      "octobre",
      "novembre",
      "décembre",
    ],
    anneeDansLaLigne: false,
  },
  montant: {
    motif: /(?:^|[\s ])([+−-]?\d{1,3}(?:[\s ]\d{3})*|[+−-]?\d+)[,.](\d{2})\s*\$(?!\S)/,
    separateurDecimal: ",",
  },
  regleSigne: "PLUS_EXPLICITE",
  // docs/lot-m1.md §5.8 : la première occurrence de « / » sépare le type d'opération du marchand.
  operation: { separateur: / \// },
  // docs/lot-m1.md §5.9 : la ligne de total sert de garde-fou au masquage des fragments sans date.
  controleTotal: { motif: /^\s*Total\b/ },
};

export const PROFILS_IMPORT: readonly ProfilImport[] = [DESJARDINS_ACCESD];

export function profilImportParId(id: string): ProfilImport | null {
  return PROFILS_IMPORT.find((profil) => profil.id === id) ?? null;
}
