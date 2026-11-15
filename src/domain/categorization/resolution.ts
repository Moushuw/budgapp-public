// L'algorithme de résolution des règles, écrit une fois pour toutes —
// docs/lot-m1.md §3.2 et §6.3. Ne lève jamais, ne mute jamais ses arguments.

import { champInapplicable, evaluerConditions } from "./conditions";
import type {
  ActionNonAppliquee,
  Affectation,
  CandidatConflit,
  ConflitRegles,
  LigneACategoriser,
  OptionsApplication,
  RegleCategorisation,
  RegleInapplicable,
  ResultatCategorisation,
  SlotAffectation,
} from "./types";
import { cleVentilation, lirePartsVentilation, type PartVentilation } from "../ventilation";

function ventilationIllisible(regle: RegleCategorisation): boolean {
  return regle.actions.some((action) => action.type === "VENTILER" && lirePartsVentilation(action.valeur) === null);
}

function comparerRegles(a: RegleCategorisation, b: RegleCategorisation): number {
  if (a.priorite !== b.priorite) {
    return b.priorite - a.priorite;
  }
  const parLibelle = a.libelle.localeCompare(b.libelle, "fr-CA");
  if (parLibelle !== 0) {
    return parLibelle;
  }
  return a.id.localeCompare(b.id);
}

interface CandidatSlot {
  readonly regle: RegleCategorisation;
  /** Clé d'égalité : un identifiant, un nom, une note, ou cleVentilation(parts) pour VENTILER. */
  readonly valeur: string;
  readonly ventilation?: readonly PartVentilation[];
}

interface ResolutionSlot {
  readonly valeur: string | null;
  /** Les parts du candidat retenu quand c'est une ventilation (docs/lot-m2.md §4.3), sinon null. */
  readonly ventilation: readonly PartVentilation[] | null;
  readonly regleCreditee: RegleCategorisation | null;
  readonly conflit: ConflitRegles | null;
}

/** candidats déjà dans l'ordre de résolution (étape 3). */
function resoudreSlot(slot: SlotAffectation, candidats: readonly CandidatSlot[]): ResolutionSlot {
  if (candidats.length === 0) {
    return { valeur: null, ventilation: null, regleCreditee: null, conflit: null };
  }

  const pMax = Math.max(...candidats.map((candidat) => candidat.regle.priorite));
  const tete = candidats.filter((candidat) => candidat.regle.priorite === pMax);
  const valeursDistinctes = new Set(tete.map((candidat) => candidat.valeur));

  const [premier] = tete;
  if (premier === undefined) {
    // Ne peut pas se produire : tete est extrait de candidats non vide par sa priorité maximale.
    return { valeur: null, ventilation: null, regleCreditee: null, conflit: null };
  }

  if (valeursDistinctes.size === 1) {
    // Priorités inférieures écrasées silencieusement : l'arbitrage que
    // l'utilisateur a lui-même écrit (docs/lot-m1.md §3.2).
    return {
      valeur: premier.valeur,
      ventilation: premier.ventilation ?? null,
      regleCreditee: premier.regle,
      conflit: null,
    };
  }

  const conflit: ConflitRegles = {
    slot,
    priorite: pMax,
    candidats: tete.map(
      (candidat): CandidatConflit => ({
        ruleId: candidat.regle.id,
        libelle: candidat.regle.libelle,
        valeur: candidat.valeur,
        ...(candidat.ventilation === undefined ? {} : { ventilation: candidat.ventilation }),
      }),
    ),
  };
  return { valeur: null, ventilation: null, regleCreditee: null, conflit };
}

export function appliquerRegles(
  ligne: LigneACategoriser,
  regles: readonly RegleCategorisation[],
  options?: OptionsApplication,
): ResultatCategorisation {
  const verrou = options?.sousCategorieVerrouillee === true;

  // Étape 1 — sélection : les règles inactives ne sont ni correspondantes,
  // ni inapplicables, ni signalées.
  const reglesActives = regles.filter((regle) => regle.actif);

  // Étape 2 — évaluation.
  const correspondantes: RegleCategorisation[] = [];
  const reglesInapplicables: RegleInapplicable[] = [];

  for (const regle of reglesActives) {
    const verdict = evaluerConditions(regle.conditions, ligne);
    if (verdict.statut !== "INAPPLICABLE" && ventilationIllisible(regle)) {
      // Une ventilation illisible ou orpheline ne dépend que de la configuration : la règle est inapplicable,
      // donc visible, plutôt qu'une action qui s'ignore en silence (docs/lot-m2.md §4.3).
      reglesInapplicables.push({
        ruleId: regle.id,
        libelle: regle.libelle,
        motif: "VENTILATION_ILLISIBLE",
        champ: null,
        detail: "Ventilation illisible ou sous-catégorie supprimée.",
      });
      continue;
    }
    if (verdict.statut === "INAPPLICABLE") {
      reglesInapplicables.push({
        ruleId: regle.id,
        libelle: regle.libelle,
        motif: verdict.motif,
        champ: champInapplicable(regle.conditions, ligne),
        detail: verdict.detail,
      });
      continue;
    }
    if (verdict.statut === "VRAI") {
      correspondantes.push(regle);
    }
    // FAUX : la règle sort, sans trace.
  }

  // Étape 3 — ordre de résolution : total et déterministe.
  const ordre = [...correspondantes].sort(comparerRegles);
  const reglesCorrespondantes = ordre.map((regle) => regle.id);

  // Étapes 4 à 6 — classement des actions par créneau, étiquettes et drapeaux.
  const candidatsSousCategorie: CandidatSlot[] = [];
  const candidatsBeneficiaire: CandidatSlot[] = [];
  const candidatsNote: CandidatSlot[] = [];
  const tagIds: string[] = [];
  const tagsVus = new Set<string>();
  const actionsNonAppliquees: ActionNonAppliquee[] = [];
  let exclureDuBudget = false;
  let exclureDesRapports = false;
  let aRevoirDrapeau = false;

  for (const regle of ordre) {
    const actionsTriees = [...regle.actions].sort((a, b) => a.ordre - b.ordre);
    const slotsPosesParCetteRegle = new Set<SlotAffectation>();

    for (const action of actionsTriees) {
      if (action.type === "VENTILER") {
        if (verrou) {
          actionsNonAppliquees.push({
            ruleId: regle.id,
            libelle: regle.libelle,
            type: "VENTILER",
            motif: "CATEGORIE_VERROUILLEE",
          });
          continue;
        }
        const parts = lirePartsVentilation(action.valeur);
        if (parts === null) {
          // Ne peut pas se produire : une ventilation illisible rend la règle inapplicable à l'étape 2.
          continue;
        }
        if (!slotsPosesParCetteRegle.has("SOUS_CATEGORIE")) {
          candidatsSousCategorie.push({ regle, valeur: cleVentilation(parts), ventilation: parts });
          slotsPosesParCetteRegle.add("SOUS_CATEGORIE");
        }
        continue;
      }

      if (action.type === "CATEGORISER") {
        if (verrou) {
          actionsNonAppliquees.push({
            ruleId: regle.id,
            libelle: regle.libelle,
            type: "CATEGORISER",
            motif: "CATEGORIE_VERROUILLEE",
          });
          continue;
        }
        const valeur = action.subcategoryId;
        if (valeur === null || valeur.trim() === "") {
          actionsNonAppliquees.push({
            ruleId: regle.id,
            libelle: regle.libelle,
            type: "CATEGORISER",
            motif: "ACTION_NON_SUPPORTEE",
          });
          continue;
        }
        if (!slotsPosesParCetteRegle.has("SOUS_CATEGORIE")) {
          candidatsSousCategorie.push({ regle, valeur });
          slotsPosesParCetteRegle.add("SOUS_CATEGORIE");
        }
        continue;
      }

      if (action.type === "RENOMMER_BENEFICIAIRE" || action.type === "NOTER") {
        const slot: SlotAffectation = action.type === "RENOMMER_BENEFICIAIRE" ? "BENEFICIAIRE" : "NOTE";
        const valeur = action.valeur;
        if (valeur === null || valeur.trim() === "") {
          actionsNonAppliquees.push({
            ruleId: regle.id,
            libelle: regle.libelle,
            type: action.type,
            motif: "ACTION_NON_SUPPORTEE",
          });
          continue;
        }
        if (!slotsPosesParCetteRegle.has(slot)) {
          (slot === "BENEFICIAIRE" ? candidatsBeneficiaire : candidatsNote).push({ regle, valeur });
          slotsPosesParCetteRegle.add(slot);
        }
        continue;
      }

      if (action.type === "ETIQUETER") {
        const valeur = action.valeur;
        if (valeur === null || valeur.trim() === "") {
          actionsNonAppliquees.push({
            ruleId: regle.id,
            libelle: regle.libelle,
            type: "ETIQUETER",
            motif: "ACTION_NON_SUPPORTEE",
          });
          continue;
        }
        if (!tagsVus.has(valeur)) {
          tagsVus.add(valeur);
          tagIds.push(valeur);
        }
        continue;
      }

      // EXCLURE_BUDGET, EXCLURE_RAPPORTS, MARQUER_A_REVOIR : drapeaux, jamais remis à false.
      if (action.type === "EXCLURE_BUDGET") {
        exclureDuBudget = true;
      } else if (action.type === "EXCLURE_RAPPORTS") {
        exclureDesRapports = true;
      } else {
        aRevoirDrapeau = true;
      }
    }
  }

  // Étape 5 — résolution indépendante des trois créneaux valués.
  const resolutionSousCategorie = resoudreSlot("SOUS_CATEGORIE", candidatsSousCategorie);
  const resolutionBeneficiaire = resoudreSlot("BENEFICIAIRE", candidatsBeneficiaire);
  const resolutionNote = resoudreSlot("NOTE", candidatsNote);

  const conflits = [resolutionSousCategorie.conflit, resolutionBeneficiaire.conflit, resolutionNote.conflit].filter(
    (conflit): conflit is ConflitRegles => conflit !== null,
  );

  const affectation: Affectation = {
    payeeNom: resolutionBeneficiaire.valeur,
    subcategoryId: resolutionSousCategorie.ventilation === null ? resolutionSousCategorie.valeur : null,
    ventilation: resolutionSousCategorie.ventilation,
    tagIds,
    note: resolutionNote.valeur,
    exclureDuBudget,
    exclureDesRapports,
    aRevoir: aRevoirDrapeau || conflits.length > 0,
  };

  return {
    affectation,
    // Étape 7 — sens exact d'appliedRuleId.
    regleAppliqueeId: resolutionSousCategorie.regleCreditee?.id ?? null,
    reglesCorrespondantes,
    conflits,
    reglesInapplicables,
    actionsNonAppliquees,
  };
}
