// Découpage et nettoyage du texte collé — docs/lot-m1.md §5.1.
//
// La conversion des tabulations n'est pas cosmétique : certaines lignes
// d'AccèsD condensent tout un bloc et son récapitulatif sur une seule ligne,
// séparés par des tabulations. Sans cette conversion, la ligne récapitulative
// — la seule exploitable — reste collée au reste du bloc et le motif de date
// ne la reconnaît pas : la transaction est perdue (deux paiements du relevé
// Visa, notamment). Chaque morceau obtenu redevient un fragment autonome,
// tout en gardant le numéro de la ligne source d'où il vient : c'est ce
// numéro que la revue d'import montrera à l'utilisateur.

import type { FragmentSource, NettoyageProfil } from "./types";

export function decouperEtNettoyer(texte: string, nettoyage: NettoyageProfil): FragmentSource[] {
  const fragments: FragmentSource[] = [];
  const lignesSource = texte.split(/\r?\n/);

  lignesSource.forEach((ligneSource, index) => {
    const numeroLigne = index + 1;

    let ligne = ligneSource;
    if (nettoyage.tronquerApres) {
      const correspondance = nettoyage.tronquerApres.exec(ligne);
      if (correspondance) {
        ligne = ligne.slice(0, correspondance.index);
      }
    }

    const morceaux = nettoyage.tabulationsEnSautsDeLigne ? ligne.split("\t") : [ligne];

    for (const morceau of morceaux) {
      const texteNettoye = morceau.trim();
      if (texteNettoye === "") {
        // Fragment vide après trim : écarté sans trace — le seul cas autorisé
        // par docs/lot-m1.md §5.3 (règle 6 de CLAUDE.md).
        continue;
      }
      fragments.push({ numeroLigne, texte: texteNettoye });
    }
  });

  return fragments;
}
