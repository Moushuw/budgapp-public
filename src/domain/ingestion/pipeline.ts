// L'orchestration — docs/lot-m1.md §6.3 et §6.4.
// Calcul pur : ne lève jamais, ne mute aucun argument.

import { categoriser } from "../categorization";
import type { ContexteBeneficiaire, RegleInapplicable } from "../categorization";
import type { Cents } from "../money";
import { type PartVentilation, repartirParPourMille } from "../ventilation";
import { evaluerRapprochement } from "../recurrence";
import { candidatsVirement } from "../virement";
import { beneficiaireParNom, resoudreBeneficiaire } from "./beneficiaire";
import { classerDoublon } from "./dedoublonnage";
import { trouverFiltre } from "./filtres";
import { calculerEmpreinte } from "./empreinte";
import { sousCategorieHeritable } from "./heritage";
import { normaliserDescription } from "./normaliser";
import type {
  ActionLigne,
  CategorisationRetiree,
  ContexteIngestion,
  FiltreInapplicable,
  LigneEnRevue,
  LigneVentilationProposee,
  RawEntry,
  ResultatPreparation,
  SectionRevue,
} from "./types";

function contexteBeneficiaireDepuis(beneficiaire: ReturnType<typeof resoudreBeneficiaire>): ContexteBeneficiaire | null {
  if (beneficiaire === null) {
    return null;
  }
  return {
    payeeId: beneficiaire.id,
    nom: beneficiaire.nom,
    sousCategorieParDefautId: beneficiaire.sousCategorieParDefautId,
    autoCategorisation: beneficiaire.autoCategorisation,
    categorieVerrouillee: beneficiaire.categorieVerrouillee,
  };
}

function actionEtSection(
  filtreId: string | null,
  statutDoublon: LigneEnRevue["statutDoublon"],
  actionParDefautDoublon: ActionLigne,
): { readonly action: ActionLigne; readonly section: SectionRevue } {
  if (filtreId !== null) {
    return { action: "IGNORER", section: "FILTREES" };
  }
  if (statutDoublon === "EMPREINTE_EXISTANTE" || statutDoublon === "VIREMENT_EXISTANT") {
    return { action: "IGNORER", section: "DOUBLONS" };
  }
  if (statutDoublon === "EXTERNAL_ID_EXISTANT") {
    return { action: "METTRE_A_JOUR", section: "DOUBLONS" };
  }
  if (statutDoublon === "QUASI_DOUBLON") {
    return { action: actionParDefautDoublon, section: "DOUBLONS" };
  }
  return { action: "IMPORTER", section: "A_IMPORTER" };
}

/** docs/lot-m2.md §4.3 : les montants des filles viennent de repartirParPourMille. */
function ventilationProposee(
  montantCents: Cents,
  parts: readonly PartVentilation[] | null,
): readonly LigneVentilationProposee[] | null {
  if (parts === null) {
    return null;
  }
  const montants = repartirParPourMille(
    montantCents,
    parts.map((p) => p.partMille),
  );
  return parts.map((p, i) => ({ subcategoryId: p.subcategoryId, montantCents: montants[i] ?? 0 }));
}

interface LigneTraitee {
  readonly ligne: LigneEnRevue;
  readonly filtresInapplicables: readonly FiltreInapplicable[];
}

function traiterEntree(entree: RawEntry, contexte: ContexteIngestion): LigneTraitee {
  const descriptionNormalisee = normaliserDescription(entree.description);
  const empreinte = calculerEmpreinte(entree.accountId, entree.date, entree.montantCents, descriptionNormalisee);

  const { filtre, inapplicables: filtresInapplicables } = trouverFiltre(entree.description, contexte.filtres);

  const verdict = classerDoublon(
    { accountId: entree.accountId, date: entree.date, montantCents: entree.montantCents, externalId: entree.externalId },
    empreinte,
    descriptionNormalisee,
    contexte.existantes,
  );

  // La description brute, pas descriptionNormalisee : la clé agressive du
  // relevé tronque au premier jeton numérique, la clé des noms non.
  const beneficiaire = resoudreBeneficiaire(entree.description, contexte.beneficiaires);
  const contexteBeneficiaire = contexteBeneficiaireDepuis(beneficiaire);

  const resultat = categoriser(
    {
      description: entree.description,
      descriptionNormalisee,
      montantCents: entree.montantCents,
      accountId: entree.accountId,
      payeeNom: beneficiaire?.nom ?? null,
    },
    contexteBeneficiaire,
    contexte.regles,
  );

  let payeeId = beneficiaire?.id ?? null;
  let payeeNouveauNom: string | null = null;

  if (resultat.affectation.payeeNom !== null) {
    const beneficiaireRenomme = beneficiaireParNom(resultat.affectation.payeeNom, contexte.beneficiaires);
    if (beneficiaireRenomme !== null) {
      payeeId = beneficiaireRenomme.id;
    } else {
      payeeNouveauNom = resultat.affectation.payeeNom;
    }
  }

  const reglesEnConflit: string[] = [];
  const reglesVues = new Set<string>();
  for (const conflit of resultat.conflits) {
    for (const candidat of conflit.candidats) {
      if (!reglesVues.has(candidat.ruleId)) {
        reglesVues.add(candidat.ruleId);
        reglesEnConflit.push(candidat.ruleId);
      }
    }
  }

  const { action, section } = actionEtSection(filtre?.id ?? null, verdict.statut, verdict.actionParDefaut);

  const candidats = candidatsVirement(
    {
      id: null,
      accountId: entree.accountId,
      date: entree.date,
      montantCents: entree.montantCents,
      parentId: null,
      estVentilee: false,
      transferTransactionId: null,
    },
    contexte.transactionsAutresComptes,
  );
  const premierCandidat = candidats.length === 1 ? candidats[0] : undefined;
  const virementAvec = premierCandidat === undefined ? null : premierCandidat.id;

  const ventilation = ventilationProposee(entree.montantCents, resultat.affectation.ventilation);
  const categorisationRetiree: CategorisationRetiree | null =
    virementAvec !== null && (resultat.affectation.subcategoryId !== null || ventilation !== null)
      ? {
          subcategoryId: resultat.affectation.subcategoryId,
          ventilation,
          regleAppliqueeId: resultat.regleAppliqueeId,
        }
      : null;

  const evaluation = evaluerRapprochement(
    { date: entree.date, montantCents: entree.montantCents, descriptionNormalisee },
    contexte.occurrencesOuvertes,
  );
  const occurrenceAvec = action === "IMPORTER" ? evaluation.occurrenceAutoId : null;
  const sousCategorieRecurrence = occurrenceAvec === null ? null : (evaluation.candidats[0]?.occurrence.subcategoryId ?? null);

  let subcategoryId = virementAvec === null ? resultat.affectation.subcategoryId : null;
  const ventilationFinale = virementAvec === null ? ventilation : null;
  let categorieHeritee = false;
  if (
    sousCategorieRecurrence !== null &&
    sousCategorieHeritable({
      subcategoryId,
      ventilationPresente: ventilationFinale !== null,
      virementAvec,
      conflits: resultat.conflits,
      slotsArbitres: [],
    })
  ) {
    subcategoryId = sousCategorieRecurrence;
    categorieHeritee = true;
  }

  const ligne: LigneEnRevue = {
    cle: entree.cle,
    date: entree.date,
    description: entree.description,
    typeOperation: entree.typeOperation,
    descriptionNormalisee,
    montantCents: entree.montantCents,
    accountId: entree.accountId,
    externalId: entree.externalId,
    ligneBrute: entree.ligneBrute,
    numeroLigne: entree.numeroLigne,

    payeeId,
    payeeNouveauNom,
    subcategoryId,
    ventilation: ventilationFinale,
    tagIds: resultat.affectation.tagIds,
    note: resultat.affectation.note,
    exclureDuBudget: resultat.affectation.exclureDuBudget,
    exclureDesRapports: resultat.affectation.exclureDesRapports,
    aRevoir: resultat.affectation.aRevoir,

    empreinte,
    statutDoublon: verdict.statut,
    doublonDe: verdict.doublonDe,

    regleAppliqueeId: virementAvec === null ? resultat.regleAppliqueeId : null,
    reglesEnConflit,
    conflits: resultat.conflits,
    filtreId: filtre?.id ?? null,

    candidatsVirement: candidats,
    virementAvec,
    categorisationRetiree,

    candidatsOccurrence: evaluation.candidats,
    occurrenceAvec,
    categorieHeritee,

    action,
    section,
  };

  return { ligne, filtresInapplicables };
}

/**
 * Les règles inapplicables (AUCUNE_CONDITION, OPERATEUR_INCOMPATIBLE,
 * VALEUR_ILLISIBLE, REGEX_INVALIDE, VENTILATION_ILLISIBLE) ne dépendent que de la configuration de
 * la règle, jamais des données de la ligne évaluée (CLAUDE.md §7 : pas de
 * recalcul par ligne) : une sonde neutre suffit à les faire ressortir une
 * fois pour tout le lot.
 */
function reglesInapplicablesDuLot(contexte: ContexteIngestion): readonly RegleInapplicable[] {
  const sonde = categoriser(
    { description: "", descriptionNormalisee: "", montantCents: 0, accountId: "", payeeNom: null },
    null,
    contexte.regles,
  );

  const vues = new Set<string>();
  const resultat: RegleInapplicable[] = [];
  for (const inapplicable of sonde.reglesInapplicables) {
    if (!vues.has(inapplicable.ruleId)) {
      vues.add(inapplicable.ruleId);
      resultat.push(inapplicable);
    }
  }
  return resultat;
}

export function preparerRevue(entrees: readonly RawEntry[], contexte: ContexteIngestion): ResultatPreparation {
  const lignes: LigneEnRevue[] = [];
  const filtresInapplicables: FiltreInapplicable[] = [];
  const filtresInapplicablesVus = new Set<string>();

  for (const entree of entrees) {
    const traitee = traiterEntree(entree, contexte);
    lignes.push(traitee.ligne);

    for (const inapplicable of traitee.filtresInapplicables) {
      if (!filtresInapplicablesVus.has(inapplicable.filtreId)) {
        filtresInapplicablesVus.add(inapplicable.filtreId);
        filtresInapplicables.push(inapplicable);
      }
    }
  }

  return {
    lignes,
    reglesInapplicables: reglesInapplicablesDuLot(contexte),
    filtresInapplicables,
  };
}
