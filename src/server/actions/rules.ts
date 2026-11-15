"use server";

// Actions de l'éditeur de règles et de l'application rétroactive —
// docs/lot-m1.md §4.6. Toutes passent par defineActionProprietaire +
// tenter, sur le modèle exact de src/server/actions/payees.ts. Aucune ne
// lève d'erreur métier.

import { z } from "zod";
import { appliquerRegles } from "@/domain/categorization";
import type {
  LigneACategoriser,
  RegleCategorisation,
  RegleInapplicable,
  ResultatCategorisation,
} from "@/domain/categorization";
import type { DateCivile } from "@/domain/dates";
import { lirePartsVentilation, repartirParPourMille, type PartVentilation } from "@/domain/ventilation";
import {
  schemaApercuApplication,
  schemaApplicationRetroactive,
  schemaIdentifiantRegle,
  schemaModificationRegle,
  schemaRegle,
} from "@/features/regles/schema";
import { trouverBeneficiaireParNomNormalise } from "@/server/repositories/payees";
import * as depotRegles from "@/server/repositories/rules";
import * as depotTransactions from "@/server/repositories/transactions";
import { LIMITE_BALAYAGE, type LigneTransactionCandidate, type ModificationTransaction } from "@/server/repositories/transactions";
import { defineActionProprietaire } from "./define-action-proprietaire";
import { EXTRAIT_APERCU } from "./rules-constantes";
import { tenter } from "./tenter";

export type { RegleListe, ConditionListe, ActionListe } from "@/server/repositories/rules";

const MESSAGE_REFERENCE_INVALIDE = "Une sous-catégorie, une étiquette ou un compte choisi n'existe plus.";
const MESSAGE_REGLE_INTROUVABLE = "Cette règle n'existe plus.";
// P2028 (délai de transaction dépassé, src/server/repositories/erreurs-prisma.ts) :
// message actionnable plutôt que le générique UNKNOWN par défaut.
const MESSAGE_ECRITURE_TROP_LONGUE =
  "L'application a pris trop de temps pour ce nombre de transactions. Réduis la période visée par l'aperçu, ou applique la règle en plusieurs fois sur moins de lignes.";
const MARQUEUR_SOUS_CATEGORIE_INTROUVABLE = "(sous-catégorie introuvable)";

export const listerRegles = defineActionProprietaire(z.object({}), (_entree, ownerId) =>
  tenter(() => depotRegles.listerRegles(ownerId), {}),
);

export const creerRegle = defineActionProprietaire(schemaRegle, async (entree, ownerId) => {
  const resultat = await tenter(() => depotRegles.creerRegle(ownerId, entree), {});
  if (!resultat.ok) {
    return resultat;
  }
  if (resultat.data === null) {
    return { ok: false, code: "NOT_FOUND", message: MESSAGE_REFERENCE_INVALIDE };
  }
  return { ok: true, data: resultat.data };
});

export const modifierRegle = defineActionProprietaire(schemaModificationRegle, async ({ id, ...entree }, ownerId) => {
  const resultat = await tenter(() => depotRegles.modifierRegle(ownerId, id, entree), {});
  if (!resultat.ok) {
    return resultat;
  }
  if (resultat.data === null) {
    return { ok: false, code: "NOT_FOUND", message: MESSAGE_REFERENCE_INVALIDE };
  }
  if (resultat.data === 0) {
    return { ok: false, code: "NOT_FOUND", message: MESSAGE_REGLE_INTROUVABLE };
  }
  return { ok: true, data: { id } };
});

export const supprimerRegle = defineActionProprietaire(schemaIdentifiantRegle, async ({ id }, ownerId) => {
  const resultat = await tenter(() => depotRegles.supprimerRegle(ownerId, id), {});
  if (!resultat.ok) {
    return resultat;
  }
  if (resultat.data.supprimes === 0) {
    return { ok: false, code: "NOT_FOUND", message: MESSAGE_REGLE_INTROUVABLE };
  }
  return { ok: true, data: { id, transactionsDetachees: resultat.data.transactionsDetachees } };
});

// ── application rétroactive : types de frontière (pas du domaine)
// EXTRAIT_APERCU vit dans ./rules-constantes (un fichier "use server" ne
// peut exporter que des fonctions asynchrones — Next.js 16).

export type MotifPreservation = "CATEGORIE_MANUELLE" | "BENEFICIAIRE_VERROUILLE" | "VENTILEE_OU_VIREMENT";

/**
 * Le sort d'une ligne, exclusif (une ligne reçoit exactement une valeur) —
 * même partition pour l'aperçu (champ `resultat` de `ChangementApercu`) et
 * pour le récapitulatif (`modifiees`, `inchangees`, `beneficiairesIntrouvables`,
 * `ignorees`). « Une règle a correspondu » et « l'état a changé » sont deux
 * faits distincts ; l'écriture reste pilotée par `evaluation.change`, jamais
 * par cette étiquette. La préservation de catégorie n'en fait plus partie :
 * c'est un compteur « dont », non exclusif (INDEX, journal du 2026-09-29).
 */
export type ResultatLigneApercu = "MODIFIEE" | "BENEFICIAIRE_INTROUVABLE" | "INCHANGEE";

/** Une ligne de la ventilation qu'une règle VENTILER poserait (docs/lot-m2.md §4.3). */
export interface LigneVentilationApercu {
  readonly subcategoryId: string;
  readonly sousCategorieNom: string;
  readonly montantCents: number;
}

export interface EtatApercu {
  readonly subcategoryId: string | null;
  readonly sousCategorieNom: string | null;
  readonly ventilation: readonly LigneVentilationApercu[] | null;
  readonly payeeId: string | null;
  readonly payeeNom: string | null;
  readonly note: string | null;
  readonly tagIds: readonly string[];
  readonly aRevoir: boolean;
  readonly exclureDuBudget: boolean;
  readonly exclureDesRapports: boolean;
}

export interface ChangementApercu {
  readonly transactionId: string;
  readonly date: DateCivile;
  readonly description: string;
  readonly montantCents: number;
  readonly compteNom: string;
  readonly avant: EtatApercu;
  readonly apres: EtatApercu;
  readonly resultat: ResultatLigneApercu;
  readonly preservations: readonly MotifPreservation[];
  /** Nom demandé par RENOMMER_BENEFICIAIRE et introuvable au référentiel, sinon null. */
  readonly beneficiaireIntrouvable: string | null;
}

export interface ApercuApplication {
  readonly ruleId: string;
  readonly libelle: string;
  readonly balayees: number;
  readonly tronque: boolean;
  readonly limiteBalayage: number;
  readonly correspondances: number;
  /** Lignes dont l'état après diffère réellement de l'état avant ; c'est aussi la longueur d'`idsAEcrire`. */
  readonly changements: number;
  /** Les transactions que l'écriture touchera, toutes ; c'est ce que la confirmation renvoie. */
  readonly idsAEcrire: readonly string[];
  /** Correspondances que l'écriture ne touchera pas ; renvoyées telles quelles à la confirmation. */
  readonly idsSansEcriture: readonly string[];
  /** Correspondances dont un CATEGORISER a été bloqué par la protection — compteur « dont », non exclusif, sur TOUTES les correspondances. */
  readonly categoriesPreservees: number;
  /**
   * Les EXTRAIT_APERCU premières lignes à montrer : d'abord celles qui
   * seront écrites (`idsAEcrire`), puis les autres correspondances jusqu'au
   * plafond — jamais l'inverse, pour qu'une ligne écrite soit toujours
   * visible dans l'aperçu. Chaque tri interne suit l'ordre du balayage.
   */
  readonly extrait: readonly ChangementApercu[];
  readonly reglesInapplicables: readonly RegleInapplicable[];
}

export interface RecapApplication {
  readonly ruleId: string;
  readonly modifiees: number;
  readonly inchangees: number;
  readonly ignorees: number; // ne correspondaient plus, ou ont gagné un diff non annoncé, au moment d'écrire
  readonly beneficiairesIntrouvables: number;
  /** « dont » : lignes évaluées (écrites ou non) dont un CATEGORISER a été bloqué par la protection. Hors partition. */
  readonly categoriesPreservees: number;
}

// ── résolution des cibles d'une règle, une fois par appel (pas par ligne)

interface CiblesRegle {
  readonly beneficiaire: { readonly id: string; readonly nom: string } | null;
  readonly sousCategorie: { readonly nom: string; readonly categorieNom: string } | null;
  /** Première action VENTILER lisible, par ordre croissant ; null si la règle n'en porte pas. */
  readonly ventilation: readonly PartVentilation[] | null;
  readonly nomsVentilation: ReadonlyMap<string, string>;
}

function partsVentilationCible(regle: RegleCategorisation): readonly PartVentilation[] | null {
  const actionsTriees = [...regle.actions].sort((a, b) => a.ordre - b.ordre);
  for (const action of actionsTriees) {
    if (action.type === "VENTILER") {
      const parts = lirePartsVentilation(action.valeur);
      if (parts !== null) {
        return parts;
      }
    }
  }
  return null;
}

/** Première action RENOMMER_BENEFICIAIRE valuée, par ordre croissant. Une seule par règle (schéma de l'éditeur). */
function nomBeneficiaireCible(regle: RegleCategorisation): string | null {
  const actionsTriees = [...regle.actions].sort((a, b) => a.ordre - b.ordre);
  for (const action of actionsTriees) {
    if (action.type === "RENOMMER_BENEFICIAIRE" && action.valeur !== null && action.valeur.trim() !== "") {
      return action.valeur;
    }
  }
  return null;
}

/** Première action CATEGORISER valuée, par ordre croissant. Une seule par règle (schéma de l'éditeur). */
function subcategoryIdCible(regle: RegleCategorisation): string | null {
  const actionsTriees = [...regle.actions].sort((a, b) => a.ordre - b.ordre);
  for (const action of actionsTriees) {
    if (action.type === "CATEGORISER" && action.subcategoryId !== null && action.subcategoryId.trim() !== "") {
      return action.subcategoryId;
    }
  }
  return null;
}

async function resoudreCibles(ownerId: string, regle: RegleCategorisation): Promise<CiblesRegle> {
  const nomCible = nomBeneficiaireCible(regle);
  const idSousCategorieCible = subcategoryIdCible(regle);

  const ventilation = partsVentilationCible(regle);

  const [beneficiaire, sousCategorie, nomsVentilation] = await Promise.all([
    nomCible === null ? Promise.resolve(null) : trouverBeneficiaireParNomNormalise(ownerId, nomCible),
    idSousCategorieCible === null ? Promise.resolve(null) : depotRegles.sousCategorieAffichage(ownerId, idSousCategorieCible),
    ventilation === null
      ? Promise.resolve(new Map<string, string>())
      : depotRegles.nomsSousCategories(
          ownerId,
          ventilation.map((part) => part.subcategoryId),
        ),
  ]);

  return { beneficiaire, sousCategorie, ventilation, nomsVentilation };
}

// ── recalcul intégral, partagé par l'aperçu et l'écriture

function versLigneACategoriser(ligne: LigneTransactionCandidate): LigneACategoriser {
  return {
    description: ligne.description,
    descriptionNormalisee: ligne.descriptionNormalisee,
    montantCents: ligne.montantCents,
    accountId: ligne.accountId,
    payeeNom: ligne.payeeNom,
  };
}

/**
 * Catégorie corrigée à la main au sens de docs/lot-m1.md §4.6 : une
 * transaction catégorisée sans qu'aucune règle n'en soit créditée l'a été
 * par un humain. On ne défait pas son travail (docs/lot-m1.md §4.6).
 */
function categorieProtegee(ligne: LigneTransactionCandidate): boolean {
  return ligne.payeeCategorieVerrouillee || (ligne.subcategoryId !== null && ligne.appliedRuleId === null);
}

/**
 * Une ventilée, une ligne de ventilation et un côté de virement ne reçoivent pas de sous-catégorie d'une règle :
 * le parent porte `subcategoryId = null` (docs/lot-m2.md §4.2) et un virement n'est ni une dépense ni un revenu (§3.4).
 */
function creneauIndisponible(ligne: LigneTransactionCandidate): boolean {
  return ligne.parentId !== null || ligne.estVentilee || ligne.transferTransactionId !== null;
}

function etatAvant(ligne: LigneTransactionCandidate): EtatApercu {
  return {
    subcategoryId: ligne.subcategoryId,
    sousCategorieNom: ligne.sousCategorieNom,
    ventilation: null,
    payeeId: ligne.payeeId,
    payeeNom: ligne.payeeNom,
    note: ligne.note,
    tagIds: ligne.tagIds,
    aRevoir: ligne.aRevoir,
    exclureDuBudget: ligne.exclureDuBudget,
    exclureDesRapports: ligne.exclureDesRapports,
  };
}

/**
 * L'état « après » est une FUSION de l'état avant et de ce que la règle a
 * effectivement posé — pas un remplacement intégral. `appliquerRegles` rend
 * un créneau vide quand aucune règle ne le pose (comportement correct pour
 * une transaction neuve à l'ingestion) ; ici la transaction existe déjà, un
 * créneau non posé par la règle doit rester tel quel, sans quoi appliquer une
 * règle qui ne fait qu'étiqueter effacerait la sous-catégorie existante.
 * Décision consignée au journal d'INDEX.md du 2026-09-18.
 */
function etatApres(
  avant: EtatApercu,
  resultat: ResultatCategorisation,
  cibles: CiblesRegle,
  montantCents: number,
): { readonly etat: EtatApercu; readonly beneficiaireIntrouvable: string | null } {
  const partsPosees = resultat.affectation.ventilation;
  // Une ventilation posée remplace la sous-catégorie : le parent n'en porte plus (docs/lot-m2.md §4.2).
  const subcategoryId = partsPosees === null ? (resultat.affectation.subcategoryId ?? avant.subcategoryId) : null;
  let ventilation: readonly LigneVentilationApercu[] | null = avant.ventilation;
  if (partsPosees !== null) {
    const montants = repartirParPourMille(
      montantCents,
      partsPosees.map((part) => part.partMille),
    );
    ventilation = partsPosees.map((part, i) => ({
      subcategoryId: part.subcategoryId,
      sousCategorieNom: cibles.nomsVentilation.get(part.subcategoryId) ?? MARQUEUR_SOUS_CATEGORIE_INTROUVABLE,
      montantCents: montants[i] ?? 0,
    }));
  }
  let sousCategorieNom = avant.sousCategorieNom;
  if (partsPosees !== null) {
    sousCategorieNom = null;
  } else if (resultat.affectation.subcategoryId !== null) {
    // Cible non résolue (sousCategorieAffichage rend null) : la fenêtre de
    // course est étroite mais réelle — la sous-catégorie visée a pu être
    // supprimée entre le chargement de la règle et la résolution de ses
    // cibles. Un marqueur explicite, jamais le nom d'avant réaffiché
    // comme si de rien n'était : l'identifiant change bel et bien, même
    // si son nom d'affichage, lui, est devenu introuvable.
    sousCategorieNom = cibles.sousCategorie?.nom ?? MARQUEUR_SOUS_CATEGORIE_INTROUVABLE;
  }

  let payeeId = avant.payeeId;
  let payeeNom = avant.payeeNom;
  let beneficiaireIntrouvable: string | null = null;

  if (resultat.affectation.payeeNom !== null) {
    if (cibles.beneficiaire !== null) {
      payeeId = cibles.beneficiaire.id;
      payeeNom = cibles.beneficiaire.nom;
    } else {
      // Bénéficiaire cible introuvable : le créneau n'est pas écrit, aucun
      // Payee n'est créé en effet de bord.
      beneficiaireIntrouvable = resultat.affectation.payeeNom;
    }
  }

  const note = resultat.affectation.note ?? avant.note;
  const tagIds =
    resultat.affectation.tagIds.length > 0
      ? [...new Set([...avant.tagIds, ...resultat.affectation.tagIds])]
      : avant.tagIds;

  return {
    etat: {
      subcategoryId,
      sousCategorieNom,
      ventilation,
      payeeId,
      payeeNom,
      note,
      tagIds,
      aRevoir: avant.aRevoir || resultat.affectation.aRevoir,
      exclureDuBudget: avant.exclureDuBudget || resultat.affectation.exclureDuBudget,
      exclureDesRapports: avant.exclureDesRapports || resultat.affectation.exclureDesRapports,
    },
    beneficiaireIntrouvable,
  };
}

function ventilationsEgales(
  a: readonly LigneVentilationApercu[] | null,
  b: readonly LigneVentilationApercu[] | null,
): boolean {
  if (a === null || b === null) {
    return a === b;
  }
  return (
    a.length === b.length &&
    a.every((ligne, i) => {
      const autre = b[i];
      return autre?.subcategoryId === ligne.subcategoryId && autre.montantCents === ligne.montantCents;
    })
  );
}

function etatsEgaux(a: EtatApercu, b: EtatApercu): boolean {
  return (
    a.subcategoryId === b.subcategoryId &&
    ventilationsEgales(a.ventilation, b.ventilation) &&
    a.payeeId === b.payeeId &&
    a.payeeNom === b.payeeNom &&
    a.note === b.note &&
    a.aRevoir === b.aRevoir &&
    a.exclureDuBudget === b.exclureDuBudget &&
    a.exclureDesRapports === b.exclureDesRapports &&
    a.tagIds.length === b.tagIds.length &&
    a.tagIds.every((tagId, index) => tagId === b.tagIds[index])
  );
}

interface EvaluationLigne {
  readonly correspond: boolean;
  readonly avant: EtatApercu;
  readonly apres: EtatApercu;
  readonly change: boolean;
  readonly preservations: readonly MotifPreservation[];
  readonly beneficiaireIntrouvable: string | null;
}

function evaluerLigne(ligne: LigneTransactionCandidate, regle: RegleCategorisation, cibles: CiblesRegle): EvaluationLigne {
  const indisponible = creneauIndisponible(ligne);
  const resultat = appliquerRegles(versLigneACategoriser(ligne), [regle], {
    sousCategorieVerrouillee: categorieProtegee(ligne) || indisponible,
  });

  const avant = etatAvant(ligne);

  if (resultat.reglesCorrespondantes.length === 0) {
    return { correspond: false, avant, apres: avant, change: false, preservations: [], beneficiaireIntrouvable: null };
  }

  const { etat: apres, beneficiaireIntrouvable } = etatApres(avant, resultat, cibles, ligne.montantCents);

  const preservations: MotifPreservation[] = [];
  if (resultat.actionsNonAppliquees.some((action) => action.motif === "CATEGORIE_VERROUILLEE")) {
    if (indisponible) {
      preservations.push("VENTILEE_OU_VIREMENT");
    } else {
      preservations.push(ligne.payeeCategorieVerrouillee ? "BENEFICIAIRE_VERROUILLE" : "CATEGORIE_MANUELLE");
    }
  }

  return { correspond: true, avant, apres, change: !etatsEgaux(avant, apres), preservations, beneficiaireIntrouvable };
}

/**
 * Le résultat affiché n'est **pas** un second calcul de « est-ce que ça a
 * changé » : il nomme, pour une ligne déjà `correspond`, lequel des trois
 * compteurs exclusifs de la partition elle rejoindrait. Priorité à `MODIFIEE`
 * (quelque chose s'écrira). Le détail par créneau reste lisible via
 * `preservations` / `beneficiaireIntrouvable`, qui ne sont pas exclusifs. Ni
 * l'aperçu ni l'application ne pilotent une écriture sur la seule foi de cette
 * fonction : elle choisit *quel compteur/quelle pastille*, jamais *si on écrit*.
 */
function resultatLigne(evaluation: EvaluationLigne): ResultatLigneApercu {
  if (evaluation.change) {
    return "MODIFIEE";
  }
  if (evaluation.beneficiaireIntrouvable !== null) {
    return "BENEFICIAIRE_INTROUVABLE";
  }
  return "INCHANGEE";
}

function estPreservee(evaluation: EvaluationLigne): boolean {
  return evaluation.preservations.length > 0;
}

// Sonde neutre : sert uniquement à extraire reglesInapplicables, qui ne
// dépend que de la configuration de la règle (opérateur compatible, valeur
// lisible, regex valide), jamais des données de la ligne évaluée.
const LIGNE_SONDE: LigneACategoriser = {
  description: "",
  descriptionNormalisee: "",
  montantCents: 0,
  accountId: "",
  payeeNom: null,
};

function reglesInapplicablesPourRegle(regle: RegleCategorisation): readonly RegleInapplicable[] {
  return appliquerRegles(LIGNE_SONDE, [regle]).reglesInapplicables;
}

export const apercuApplicationRetroactive = defineActionProprietaire(schemaApercuApplication, async (entree, ownerId) => {
  const regleResultat = await tenter(() => depotRegles.chargerRegle(ownerId, entree.ruleId), {});
  if (!regleResultat.ok) {
    return regleResultat;
  }
  const regle = regleResultat.data;
  if (regle === null) {
    return { ok: false, code: "NOT_FOUND", message: MESSAGE_REGLE_INTROUVABLE };
  }

  const cibles = await resoudreCibles(ownerId, regle);

  const balayageResultat = await tenter(
    () => depotTransactions.balayerTransactions(ownerId, { du: entree.du, au: entree.au }),
    {},
  );
  if (!balayageResultat.ok) {
    return balayageResultat;
  }
  const balayage = balayageResultat.data;

  let correspondances = 0;
  let changements = 0;
  let categoriesPreservees = 0;
  const idsAEcrire: string[] = [];
  const idsSansEcriture: string[] = [];
  // Bornées par LIMITE_BALAYAGE (CLAUDE.md §7 : jamais de findMany sans
  // borne — et cette collection n'excède jamais la taille du balayage lui-
  // même). Séparées en deux files pour que `extrait` garantisse toujours la
  // présence des lignes qui seront écrites (docs/lot-m1.md §4.6, §11 : « une
  // règle appliquée rétroactivement montre son aperçu … avant d'écrire ») —
  // sans quoi une règle qui correspond surtout à des lignes déjà à jour
  // pourrait écrire des transactions jamais montrées à l'écran.
  const aEcrirePourExtrait: ChangementApercu[] = [];
  const autresPourExtrait: ChangementApercu[] = [];

  for (const ligne of balayage.lignes) {
    const evaluation = evaluerLigne(ligne, regle, cibles);
    if (!evaluation.correspond) {
      continue;
    }
    correspondances += 1;

    // L'écriture est pilotée directement par `evaluation.change`, jamais par
    // `resultatLigne` : ce dernier n'est qu'une étiquette d'affichage, dont
    // l'ordre de priorité pourrait changer un jour sans que ça ne doive
    // toucher un seul octet écrit en base.
    if (evaluation.change) {
      changements += 1;
      idsAEcrire.push(ligne.id);
    } else {
      idsSansEcriture.push(ligne.id);
    }
    if (estPreservee(evaluation)) {
      categoriesPreservees += 1;
    }

    const ligneApercu: ChangementApercu = {
      transactionId: ligne.id,
      date: ligne.date,
      description: ligne.description,
      montantCents: ligne.montantCents,
      compteNom: ligne.compteNom,
      avant: evaluation.avant,
      apres: evaluation.apres,
      resultat: resultatLigne(evaluation),
      preservations: evaluation.preservations,
      beneficiaireIntrouvable: evaluation.beneficiaireIntrouvable,
    };
    // La visibilité dans l'aperçu vient de « la règle a correspondu », pas
    // d'un diff d'état — sans quoi une ligne bloquée (verrou, bénéficiaire
    // introuvable, ou tout futur cas non encore prévu) disparaîtrait en
    // silence au lieu d'être signalée (CLAUDE.md règle 6).
    if (evaluation.change) {
      aEcrirePourExtrait.push(ligneApercu);
    } else {
      autresPourExtrait.push(ligneApercu);
    }
  }

  // Les lignes à écrire d'abord (même tri que le balayage entre elles),
  // le reste ensuite jusqu'au plafond : l'aperçu ne doit jamais permettre
  // d'écrire une ligne qu'il n'a pas montrée.
  const extrait = [...aEcrirePourExtrait, ...autresPourExtrait].slice(0, EXTRAIT_APERCU);

  return {
    ok: true,
    data: {
      ruleId: regle.id,
      libelle: regle.libelle,
      balayees: balayage.lignes.length,
      tronque: balayage.tronque,
      limiteBalayage: LIMITE_BALAYAGE,
      correspondances,
      changements,
      idsAEcrire,
      idsSansEcriture,
      categoriesPreservees,
      extrait,
      reglesInapplicables: reglesInapplicablesPourRegle(regle),
    } satisfies ApercuApplication,
  };
});

function construireModification(
  ligne: LigneTransactionCandidate,
  apres: EtatApercu,
  regleId: string,
): ModificationTransaction {
  const modification: {
    transactionId: string;
    subcategoryId?: string | null;
    payeeId?: string;
    note?: string;
    aRevoir?: boolean;
    exclureDuBudget?: boolean;
    exclureDesRapports?: boolean;
    tagIdsAAjouter: string[];
    appliedRuleId?: string;
    ventilation?: { subcategoryId: string; montantCents: number }[];
  } = {
    transactionId: ligne.id,
    tagIdsAAjouter: apres.tagIds.filter((tagId) => !ligne.tagIds.includes(tagId)),
  };

  const subcategorieChangee = apres.subcategoryId !== ligne.subcategoryId;
  if (apres.ventilation !== null) {
    // Le parent devient ventilé : le repository écrit la sous-catégorie à null et crée les lignes (docs/lot-m2.md §4.3).
    modification.subcategoryId = null;
    modification.appliedRuleId = regleId;
    modification.ventilation = apres.ventilation.map(({ subcategoryId, montantCents }) => ({
      subcategoryId,
      montantCents,
    }));
  } else if (subcategorieChangee) {
    modification.subcategoryId = apres.subcategoryId;
    // Écrit uniquement quand la modification pose ou change la sous-catégorie
    // (sens exact d'appliedRuleId : resolution.ts, étape 7).
    if (apres.subcategoryId !== null) {
      modification.appliedRuleId = regleId;
    }
  }
  if (apres.payeeId !== null && apres.payeeId !== ligne.payeeId) {
    modification.payeeId = apres.payeeId;
  }
  if (apres.note !== null && apres.note !== ligne.note) {
    modification.note = apres.note;
  }
  if (apres.aRevoir !== ligne.aRevoir) {
    modification.aRevoir = apres.aRevoir;
  }
  if (apres.exclureDuBudget !== ligne.exclureDuBudget) {
    modification.exclureDuBudget = apres.exclureDuBudget;
  }
  if (apres.exclureDesRapports !== ligne.exclureDesRapports) {
    modification.exclureDesRapports = apres.exclureDesRapports;
  }

  return modification;
}

export const appliquerRegleRetroactivement = defineActionProprietaire(schemaApplicationRetroactive, async (entree, ownerId) => {
  const regleResultat = await tenter(() => depotRegles.chargerRegle(ownerId, entree.ruleId), {});
  if (!regleResultat.ok) {
    return regleResultat;
  }
  const regle = regleResultat.data;
  if (regle === null) {
    return { ok: false, code: "NOT_FOUND", message: MESSAGE_REGLE_INTROUVABLE };
  }

  const cibles = await resoudreCibles(ownerId, regle);

  const lignesResultat = await tenter(
    () => depotTransactions.lireTransactionsParIds(ownerId, [...entree.transactionIds, ...entree.idsSansEcriture]),
    {},
  );
  if (!lignesResultat.ok) {
    return lignesResultat;
  }
  const lignesParId = new Map(lignesResultat.data.map((ligne) => [ligne.id, ligne]));

  let ignorees = 0;
  let inchangees = 0;
  let categoriesPreservees = 0;
  let beneficiairesIntrouvables = 0;
  const modifications: ModificationTransaction[] = [];

  for (const transactionId of entree.transactionIds) {
    const ligne = lignesParId.get(transactionId);
    if (ligne === undefined) {
      ignorees += 1;
      continue;
    }

    const evaluation = evaluerLigne(ligne, regle, cibles);
    if (!evaluation.correspond) {
      ignorees += 1;
      continue;
    }

    // L'écriture reste pilotée par `evaluation.change` directement (voir le
    // commentaire de `resultatLigne`). La préservation est un « dont » : elle
    // se compte que la ligne s'écrive ou non.
    if (estPreservee(evaluation)) {
      categoriesPreservees += 1;
    }
    if (evaluation.change) {
      modifications.push(construireModification(ligne, evaluation.apres, regle.id));
      continue;
    }

    if (resultatLigne(evaluation) === "BENEFICIAIRE_INTROUVABLE") {
      beneficiairesIntrouvables += 1;
    } else {
      inchangees += 1;
    }
  }

  // Lignes que l'aperçu n'a pas annoncées comme écrites : réévaluées pour les
  // compteurs, jamais écrites. Une ligne qui a gagné un diff depuis l'aperçu
  // part en `ignorees` plutôt que d'être écrite en douce.
  for (const transactionId of entree.idsSansEcriture) {
    const ligne = lignesParId.get(transactionId);
    if (ligne === undefined) {
      ignorees += 1;
      continue;
    }

    const evaluation = evaluerLigne(ligne, regle, cibles);
    if (!evaluation.correspond || evaluation.change) {
      ignorees += 1;
      continue;
    }

    if (estPreservee(evaluation)) {
      categoriesPreservees += 1;
    }
    if (resultatLigne(evaluation) === "BENEFICIAIRE_INTROUVABLE") {
      beneficiairesIntrouvables += 1;
    } else {
      inchangees += 1;
    }
  }

  const ecritureResultat =
    modifications.length > 0
      ? await tenter(() => depotTransactions.appliquerModifications(ownerId, modifications), {
          UNKNOWN: MESSAGE_ECRITURE_TROP_LONGUE,
        })
      : ({ ok: true, data: 0 } as const);
  if (!ecritureResultat.ok) {
    return ecritureResultat;
  }

  return {
    ok: true,
    data: {
      ruleId: regle.id,
      modifiees: ecritureResultat.data,
      inchangees,
      ignorees,
      beneficiairesIntrouvables,
      categoriesPreservees,
    } satisfies RecapApplication,
  };
});
