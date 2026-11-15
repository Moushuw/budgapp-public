// Partition d'une sélection en masse — docs/lot-m2.md §6.4. Chaque identifiant
// demandé tombe dans exactement une case : rien ne disparaît en silence.

import { raisonIgnoree, refusGesteMasse } from "./eligibilite";
import {
  IGNOREES_VIDES,
  type ApercuSuppression,
  type ChoixSuppressionVirement,
  type CompteIgnorees,
  type CompteRenduMasse,
  type GesteMasse,
  type LigneMasse,
  type PartitionMasse,
  type RaisonIgnoree,
} from "./types";

function dejaDansLEtat(ligne: LigneMasse, geste: GesteMasse): boolean {
  switch (geste.type) {
    case "SOUS_CATEGORIE":
      return ligne.subcategoryId === geste.subcategoryId;
    case "BENEFICIAIRE":
      return ligne.payeeId === geste.payeeId;
    case "ETIQUETTES": {
      const presentes = new Set(ligne.tagIds);
      return geste.ajouter.every((id) => presentes.has(id)) && geste.retirer.every((id) => !presentes.has(id));
    }
    case "A_REVOIR":
      return ligne.aRevoir === geste.valeur;
    case "EXCLURE_BUDGET":
      return ligne.exclureDuBudget === geste.valeur;
    case "EXCLURE_RAPPORTS":
      return ligne.exclureDesRapports === geste.valeur;
    case "SUPPRIMER":
      return false;
  }
}

export function partitionnerMasse(
  idsDemandes: readonly string[],
  lignes: readonly LigneMasse[],
  geste: GesteMasse,
): PartitionMasse {
  const parId = new Map(lignes.map((ligne) => [ligne.id, ligne]));
  const ignorees: Record<RaisonIgnoree, number> = { ...IGNOREES_VIDES };
  const aEcrire: string[] = [];
  let inchangees = 0;
  let parentsVentilesEcrits = 0;
  let lignesVentilationEcrites = 0;
  let cotesVirementEcrits = 0;
  const contreparties: string[] = [];
  const pointeursLus: Record<string, string | null> = {};

  for (const id of idsDemandes) {
    const ligne = parId.get(id);
    if (ligne === undefined) {
      ignorees.INTROUVABLE += 1;
      continue;
    }
    const motif = refusGesteMasse(ligne, geste);
    if (motif !== null) {
      ignorees[raisonIgnoree(motif)] += 1;
      continue;
    }
    if (dejaDansLEtat(ligne, geste)) {
      inchangees += 1;
      continue;
    }
    aEcrire.push(id);
    pointeursLus[id] = ligne.transferTransactionId;
    if (ligne.estVentilee) {
      parentsVentilesEcrits += 1;
      lignesVentilationEcrites += ligne.nbLignesVentilation;
    }
    if (ligne.transferTransactionId !== null) {
      cotesVirementEcrits += 1;
      if (geste.type === "SUPPRIMER" && ligne.contrepartie.etat === "TROUVEE") {
        contreparties.push(ligne.transferTransactionId);
      }
    }
  }

  // Après la boucle : une contrepartie sélectionnée plus loin dans la liste est elle-même écrite.
  const ecrites = new Set(aEcrire);
  const contrepartiesAffectees = [...new Set(contreparties)].filter((cible) => !ecrites.has(cible));

  return {
    aEcrire,
    inchangees,
    ignorees,
    parentsVentilesEcrits,
    lignesVentilationEcrites,
    cotesVirementEcrits,
    contrepartiesAffectees,
    pointeursLus,
  };
}

export function apercuDepuisPartition(p: PartitionMasse, choix: ChoixSuppressionVirement | null): ApercuSuppression {
  return {
    aSupprimer: p.aEcrire.length,
    parentsVentiles: p.parentsVentilesEcrits,
    lignesVentilation: p.lignesVentilationEcrites,
    ignorees: p.ignorees,
    cotesVirement: p.cotesVirementEcrits,
    contrepartiesSupprimees: choix === "SUPPRIMER_LES_DEUX" ? p.contrepartiesAffectees.length : 0,
    contrepartiesDeliees: choix === "DELIER_L_AUTRE" ? p.contrepartiesAffectees.length : 0,
  };
}

export function compteRenduDepuisPartition(geste: GesteMasse, p: PartitionMasse): CompteRenduMasse {
  const ignorees: CompteIgnorees = p.ignorees;
  const choix = geste.type === "SUPPRIMER" ? geste.virements : null;
  return {
    geste: geste.type,
    traitees: p.aEcrire.length,
    inchangees: p.inchangees,
    ignorees,
    lignesVentilationSupprimees: geste.type === "SUPPRIMER" ? p.lignesVentilationEcrites : 0,
    contrepartiesSupprimees: choix === "SUPPRIMER_LES_DEUX" ? p.contrepartiesAffectees.length : 0,
    contrepartiesDeliees: choix === "DELIER_L_AUTRE" ? p.contrepartiesAffectees.length : 0,
  };
}
