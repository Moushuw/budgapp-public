// Contrôle du total du relevé — docs/lot-m1.md §5.9.
// Garde-fou du masquage des rejets AUCUNE_DATE : si une transaction a été perdue,
// la somme des lignes reconnues ne tombe plus sur le total écrit par la banque.

import { additionner } from "../money";
import { lireMontant } from "./analyser";
import type { ControleTotal, LigneReconnue, ProfilImport } from "./types";

/**
 * Ne lève jamais. Le texte n'est pas passé par `decouperEtNettoyer` :
 * `tronquerApres` viderait justement la ligne de total.
 */
export function controlerTotal(
  texte: string,
  profil: ProfilImport,
  reconnues: readonly LigneReconnue[],
): ControleTotal | null {
  const controle = profil.controleTotal;
  if (controle === undefined) {
    return null;
  }

  const lignes = texte.split(/\r?\n/);
  for (const [index, ligne] of lignes.entries()) {
    const correspondance = controle.motif.exec(ligne);
    if (correspondance === null) {
      continue;
    }
    const montant = lireMontant(ligne.slice(correspondance.index + correspondance[0].length), profil);
    if (montant === null) {
      continue;
    }
    const somme = additionner(...reconnues.map((l) => l.montantCents));
    return {
      numeroLigne: index + 1,
      totalReleveCents: montant,
      sommeReconnuesCents: somme,
      ecartCents: somme - montant,
    };
  }

  return null;
}
