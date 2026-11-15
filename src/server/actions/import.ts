"use server";

// Les trois actions du pipeline d'ingestion — docs/lot-m1.md §6.4 et §7. Toutes
// passent par defineActionProprietaire + tenter, sur le modèle exact de
// src/server/actions/rules.ts. Aucune ne lève d'erreur métier.

import { ajouterJours } from "@/domain/dates";
import {
  messageEmpreintesEnDouble,
  messageOccurrencesEnConflit,
  messageTransactionsIntrouvables,
} from "@/features/import/libelles-revue";
import type { RegleInapplicable } from "@/domain/categorization";
import type {
  ContexteIngestion,
  FiltreIngestion,
  FiltreInapplicable,
  LigneEnRevue,
  RawEntry,
  TransactionExistante,
} from "@/domain/ingestion";
import { preparerRevue } from "@/domain/ingestion";
import { analyserReleve, controlerTotal, profilImportParId } from "@/domain/statement";
import type { ControleTotal, LigneRejetee } from "@/domain/statement";
import { FENETRE_VIREMENT_JOURS } from "@/domain/virement";
import {
  MESSAGE_BENEFICIAIRE_NOUVEAU_VIDE,
  schemaAnalyse,
  schemaEnregistrementImport,
  schemaLigneManuelle,
} from "@/features/import/schema";
import { compteExiste } from "@/server/repositories/accounts";
import type { EntreeLotImport, LigneAEcrire } from "@/server/repositories/import-batches";
import { enregistrerLotImport, type RecapImport } from "@/server/repositories/import-batches";
import { listerFiltresImport } from "@/server/repositories/import-filters";
import { listerBeneficiairesIngestion } from "@/server/repositories/payees";
import { prolongerHorizonDuCompte, rechercherSuggestions } from "@/server/repositories/recurrences-ecriture";
import { lireOccurrencesARapprocher } from "@/server/repositories/recurrences-lecture";
import { aujourdhui } from "@/server/periode";
import { chargerReglesActives } from "@/server/repositories/rules";
import {
  lireTransactionsParExternalIds,
  lireTransactionsPourDedoublonnage,
  lireTransactionsPourVirement,
} from "@/server/repositories/transactions";
import { defineActionProprietaire } from "./define-action-proprietaire";
import { tenter } from "./tenter";

const MESSAGE_PROFIL_INCONNU = "Profil d'import inconnu.";
const MESSAGE_COMPTE_INTROUVABLE = "Ce compte n'existe plus.";
// P2002 (la course entre deux onglets) et P2028 (délai de transaction
// dépassé, src/server/repositories/erreurs-prisma.ts) : messages actionnables
// plutôt que le générique par défaut.
const MESSAGE_ECRITURE_TROP_LONGUE =
  "L'enregistrement a pris trop de temps pour ce nombre de lignes. Réduis la taille du lot, ou enregistre-le en plusieurs fois.";
const MESSAGE_DOUBLON_COURSE =
  "Une de ces lignes vient d'être enregistrée par ailleurs (deux onglets ouverts en même temps ?). Rien n'a été enregistré.";

const MESSAGES_REFERENCE_INVALIDE: Record<
  "SOUS_CATEGORIE" | "ETIQUETTE" | "BENEFICIAIRE" | "COMPTE_LIGNE" | "BENEFICIAIRE_NOUVEAU_VIDE",
  string
> = {
  SOUS_CATEGORIE: "Une sous-catégorie choisie n'existe plus.",
  ETIQUETTE: "Une étiquette choisie n'existe plus.",
  BENEFICIAIRE: "Un bénéficiaire choisi n'existe plus.",
  COMPTE_LIGNE: "Le compte d'une ligne n'existe plus.",
  BENEFICIAIRE_NOUVEAU_VIDE: MESSAGE_BENEFICIAIRE_NOUVEAU_VIDE,
};

export interface ResultatAnalyse {
  readonly profilId: string;
  readonly accountId: string;
  readonly annee: number;
  readonly lignes: readonly LigneEnRevue[];
  /** Les LigneRejetee du parser : texte brut, numéro, raison. Section « Non reconnues ». */
  readonly rejetees: readonly LigneRejetee[];
  /** docs/lot-m1.md §5.9 — null : pas de ligne de total lisible. Montants en cents. */
  readonly controleTotal: ControleTotal | null;
  readonly reglesInapplicables: readonly RegleInapplicable[];
  readonly filtresInapplicables: readonly FiltreInapplicable[];
  /**
   * Les filtres actifs, pour que la section « Filtrées » nomme le motif
   * responsable à partir de LigneEnRevue.filtreId sans une requête de plus.
   */
  readonly filtres: readonly FiltreIngestion[];
  readonly nbRegles: number;
  readonly nbBeneficiaires: number;
  /** true si les occurrences lues ont atteint LIMITE_OCCURRENCES_RAPPROCHEMENT (docs/lot-m3.md §4.5). */
  readonly occurrencesTronquees: boolean;
}

async function chargerContexte(
  ownerId: string,
  accountId: string,
  entreesPourDedoublonnage: readonly RawEntry[],
): Promise<{ readonly contexte: ContexteIngestion; readonly occurrencesTronquees: boolean }> {
  // docs/lot-m3.md §4.4 : les échéances sont prolongées avant la lecture des candidats.
  await prolongerHorizonDuCompte(ownerId, accountId, aujourdhui());

  const [filtres, beneficiaires, regles] = await Promise.all([
    listerFiltresImport(ownerId),
    listerBeneficiairesIngestion(ownerId),
    chargerReglesActives(ownerId),
  ]);

  if (entreesPourDedoublonnage.length === 0) {
    return {
      contexte: { filtres, beneficiaires, regles, existantes: [], transactionsAutresComptes: [], occurrencesOuvertes: [] },
      occurrencesTronquees: false,
    };
  }

  const dates = entreesPourDedoublonnage.map((entree) => entree.date);
  const premiere = dates.reduce((min, date) => (date < min ? date : min));
  const derniere = dates.reduce((max, date) => (date > max ? date : max));
  const du = ajouterJours(premiere, -3);
  const au = ajouterJours(derniere, 3);
  const montantsOpposes = [
    ...new Set(entreesPourDedoublonnage.filter((entree) => entree.montantCents !== 0).map((entree) => -entree.montantCents)),
  ];

  const [parFenetre, parExternalId, autresComptes, occurrences] = await Promise.all([
    lireTransactionsPourDedoublonnage(ownerId, { accountId, du, au }),
    lireTransactionsParExternalIds(
      ownerId,
      accountId,
      [...new Set(entreesPourDedoublonnage.map((entree) => entree.externalId).filter((id): id is string => id !== null))],
    ),
    lireTransactionsPourVirement(ownerId, {
      accountIdExclu: accountId,
      du: ajouterJours(premiere, -FENETRE_VIREMENT_JOURS),
      au: ajouterJours(derniere, FENETRE_VIREMENT_JOURS),
      montantsCents: montantsOpposes,
    }),
    lireOccurrencesARapprocher(ownerId, accountId, { premiere, derniere }),
  ]);

  const existantesParId = new Map<string, TransactionExistante>();
  for (const existante of [...parFenetre, ...parExternalId]) {
    existantesParId.set(existante.id, existante);
  }

  return {
    contexte: {
      filtres,
      beneficiaires,
      regles,
      existantes: [...existantesParId.values()],
      transactionsAutresComptes: autresComptes,
      occurrencesOuvertes: occurrences.occurrences,
    },
    occurrencesTronquees: occurrences.limiteAtteinte,
  };
}

/** docs/lot-m3.md §4.2 point b et §4.4 : hors de la $transaction du lot ; un échec se journalise, l'import reste enregistré. */
async function apresEnregistrement(ownerId: string, accountId: string): Promise<void> {
  try {
    await prolongerHorizonDuCompte(ownerId, accountId, aujourdhui());
  } catch (erreur) {
    console.error("Prolongation des échéances après import en échec", erreur);
  }
  try {
    await rechercherSuggestions(ownerId);
  } catch (erreur) {
    console.error("Détection des récurrences après import en échec", erreur);
  }
}

export const analyserReleveColle = defineActionProprietaire(schemaAnalyse, async (entree, ownerId) => {
  const profil = profilImportParId(entree.profilId);
  if (profil === null) {
    return { ok: false, code: "VALIDATION", message: MESSAGE_PROFIL_INCONNU };
  }

  const compteValide = await tenter(() => compteExiste(ownerId, entree.accountId), {});
  if (!compteValide.ok) {
    return compteValide;
  }
  if (!compteValide.data) {
    return { ok: false, code: "NOT_FOUND", message: MESSAGE_COMPTE_INTROUVABLE };
  }

  const { reconnues, rejetees } = analyserReleve(entree.texte, profil, entree.annee);

  const entrees: RawEntry[] = reconnues.map(
    (ligne, index): RawEntry => ({
      cle: `L${ligne.numeroLigne}.${index}`,
      date: ligne.date,
      description: ligne.description,
      typeOperation: ligne.typeOperation,
      montantCents: ligne.montantCents,
      accountId: entree.accountId,
      externalId: null,
      ligneBrute: ligne.ligneBrute,
      numeroLigne: ligne.numeroLigne,
    }),
  );

  const contexte = await tenter(() => chargerContexte(ownerId, entree.accountId, entrees), {});
  if (!contexte.ok) {
    return contexte;
  }

  const { lignes, reglesInapplicables, filtresInapplicables } = preparerRevue(entrees, contexte.data.contexte);

  return {
    ok: true,
    data: {
      profilId: entree.profilId,
      accountId: entree.accountId,
      annee: entree.annee,
      lignes,
      rejetees,
      controleTotal: controlerTotal(entree.texte, profil, reconnues),
      reglesInapplicables,
      filtresInapplicables,
      filtres: contexte.data.contexte.filtres,
      nbRegles: contexte.data.contexte.regles.length,
      nbBeneficiaires: contexte.data.contexte.beneficiaires.length,
      occurrencesTronquees: contexte.data.occurrencesTronquees,
    } satisfies ResultatAnalyse,
  };
});

export const preparerLigneManuelle = defineActionProprietaire(schemaLigneManuelle, async (entree, ownerId) => {
  const compteValide = await tenter(() => compteExiste(ownerId, entree.accountId), {});
  if (!compteValide.ok) {
    return compteValide;
  }
  if (!compteValide.data) {
    return { ok: false, code: "NOT_FOUND", message: MESSAGE_COMPTE_INTROUVABLE };
  }

  const rawEntry: RawEntry = {
    cle: entree.cle,
    date: entree.date,
    description: entree.description,
    typeOperation: null,
    montantCents: entree.montant,
    accountId: entree.accountId,
    externalId: null,
    ligneBrute: entree.ligneBrute,
    numeroLigne: entree.numeroLigne,
  };

  const contexte = await tenter(() => chargerContexte(ownerId, entree.accountId, [rawEntry]), {});
  if (!contexte.ok) {
    return contexte;
  }

  const { lignes } = preparerRevue([rawEntry], contexte.data.contexte);
  const ligne = lignes[0];
  if (ligne === undefined) {
    // Ne peut pas se produire : preparerRevue rend une ligne par entrée reçue.
    return { ok: false, code: "UNKNOWN", message: "Une erreur inattendue est survenue." };
  }

  return { ok: true, data: ligne };
});

export const enregistrerImport = defineActionProprietaire(schemaEnregistrementImport, async (entree, ownerId) => {
  const lignes: LigneAEcrire[] = entree.lignes.map(
    (ligne): LigneAEcrire => ({
      cle: ligne.cle,
      action: ligne.action,
      transactionExistanteId: ligne.transactionExistanteId,
      accountId: ligne.accountId,
      date: ligne.date,
      description: ligne.description,
      montantCents: ligne.montant,
      note: ligne.note,
      payeeId: ligne.payeeId,
      payeeNouveauNom: ligne.payeeNouveauNom,
      subcategoryId: ligne.subcategoryId,
      tagIds: ligne.tagIds,
      externalId: ligne.externalId,
      appliedRuleId: ligne.appliedRuleId,
      aRevoir: ligne.aRevoir,
      exclureDuBudget: ligne.exclureDuBudget,
      exclureDesRapports: ligne.exclureDesRapports,
      typeOperation: ligne.typeOperation,
      ventilation:
        ligne.ventilation === null
          ? null
          : ligne.ventilation.map((fille) => ({ subcategoryId: fille.subcategoryId, montantCents: fille.montant })),
      virementAvec: ligne.virementAvec,
      occurrenceAvec: ligne.occurrenceAvec,
      occurrenceAuto: ligne.occurrenceAuto,
    }),
  );

  const entreeLot: EntreeLotImport = { accountId: entree.accountId, libelle: entree.libelle, lignes };

  const resultat = await tenter(() => enregistrerLotImport(ownerId, entreeLot), {
    DUPLICATE: MESSAGE_DOUBLON_COURSE,
    UNKNOWN: MESSAGE_ECRITURE_TROP_LONGUE,
  });
  if (!resultat.ok) {
    return resultat;
  }

  const donnees = resultat.data;

  if (donnees.statut === "COMPTE_INTROUVABLE") {
    return { ok: false, code: "NOT_FOUND", message: MESSAGE_COMPTE_INTROUVABLE };
  }
  if (donnees.statut === "REFERENCE_INVALIDE") {
    return { ok: false, code: "NOT_FOUND", message: MESSAGES_REFERENCE_INVALIDE[donnees.quoi] };
  }
  if (donnees.statut === "TRANSACTION_INTROUVABLE") {
    return {
      ok: false,
      code: "NOT_FOUND",
      message: messageTransactionsIntrouvables(donnees.cles.length),
    };
  }
  if (donnees.statut === "EMPREINTE_EN_DOUBLE") {
    const detail = donnees.lignes
      .map((ligne) => `${ligne.date} ${ligne.description}`)
      .slice(0, 5)
      .join(" · ");
    return {
      ok: false,
      code: "DUPLICATE",
      message: messageEmpreintesEnDouble(donnees.lignes.length, detail),
      // Écart assumé (relecture tranche 6, point 4) : `deballer` (src/lib/
      // action-result.ts) ne conserve que `message` en jetant une Error —
      // `details` n'atteint donc PAS le navigateur aujourd'hui, seuls les
      // appels serveur directs (tests d'intégration) peuvent le lire. Il
      // n'est pas mort pour autant : le message ci-dessus nomme déjà les
      // lignes en clair (jusqu'à 5, date + description) pour l'utilisateur,
      // et `details` reste la donnée structurée nécessaire si un futur
      // écran veut surligner les lignes en cause plutôt que les nommer en
      // texte. Ne pas le retirer sans amender aussi la façon dont
      // `deballer`/les mutations transmettent une erreur.
      details: { lignes: donnees.lignes },
    };
  }

  if (donnees.statut === "VIREMENT_CONFLIT") {
    const n = donnees.lignes.length;
    const detail = donnees.lignes
      .map((ligne) => `${ligne.date} ${ligne.description}`)
      .slice(0, 5)
      .join(" · ");
    const debut =
      n === 1 ? "Le virement proposé pour 1 ligne n'est plus possible" : `Le virement proposé pour ${n} lignes n'est plus possible`;
    return {
      ok: false,
      code: "CONFLICT",
      message: `${debut} : ${detail}. Rien n'a été enregistré. Relance l'analyse du relevé.`,
      details: { lignes: donnees.lignes },
    };
  }

  if (donnees.statut === "OCCURRENCE_CONFLIT") {
    return {
      ok: false,
      code: "CONFLICT",
      message: messageOccurrencesEnConflit(donnees.lignes),
      details: { lignes: donnees.lignes },
    };
  }

  await apresEnregistrement(ownerId, entree.accountId);
  return { ok: true, data: donnees.recap satisfies RecapImport };
});
