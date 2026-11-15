// Le seul endroit qui écrit un lot d'import — docs/lot-m1.md §6.4. Une
// seule prisma.$transaction, avec le timeout et le maxWait de
// ./transactions (mécanisme de la tranche 5b, réutilisé, pas redoublé).

import type { Prisma } from "@prisma/client";
import { poseSousCategorie, regleJustifieCreneau, type PoseSousCategorie } from "@/domain/categorization";
import { depuisDateUtc, versDateUtc, type DateCivile } from "@/domain/dates";
import { calculerEmpreinte, normaliserDescription, normaliserNom } from "@/domain/ingestion";
import type { Cents } from "@/domain/money";
import { empreinteLigneFille } from "@/domain/ventilation/empreinte";
import {
  candidatsOccurrence,
  estOccurrenceOuverte,
  etatApresLiaison,
  evaluerRapprochement,
  type OccurrenceCandidate,
} from "@/domain/recurrence";
import { peutLier, type CoteVirement, type RefusLiaison } from "@/domain/virement";
import { prisma } from "@/server/db";
import { CourseOccurrence } from "./course-occurrence";
import { CourseVirement } from "./course-virement";
import { verrouillerOccurrences, verrouillerTransactions } from "./verrous";
import { MAX_WAIT_TRANSACTION_MS, TIMEOUT_TRANSACTION_MS } from "./transactions";

export interface LigneAEcrire {
  readonly cle: string;
  readonly action: "IMPORTER" | "METTRE_A_JOUR";
  /** Renseigné seulement si METTRE_A_JOUR. */
  readonly transactionExistanteId: string | null;
  readonly accountId: string;
  readonly date: DateCivile;
  readonly description: string;
  readonly montantCents: number;
  readonly note: string | null;
  readonly payeeId: string | null;
  readonly payeeNouveauNom: string | null;
  readonly subcategoryId: string | null;
  readonly tagIds: readonly string[];
  readonly externalId: string | null;
  readonly appliedRuleId: string | null;
  readonly aRevoir: boolean;
  readonly exclureDuBudget: boolean;
  readonly exclureDesRapports: boolean;
  /** docs/lot-m2.md §3.1 — écrit tel quel, jamais lu par l'empreinte ni le dédoublonnage. */
  readonly typeOperation: string | null;
  /** docs/lot-m2.md §4.3 — non nulle : la ligne devient un parent ventilé, subcategoryId est null. Jamais sur METTRE_A_JOUR. */
  readonly ventilation: readonly { readonly subcategoryId: string | null; readonly montantCents: Cents }[] | null;
  /** docs/lot-m2.md §4.5 — la transaction d'un autre compte dont cette ligne est l'autre côté. Jamais sur METTRE_A_JOUR (schéma). */
  readonly virementAvec: string | null;
  /** docs/lot-m3.md §4.5 — l'occurrence ouverte que cette ligne réalise. Jamais sur METTRE_A_JOUR (schéma). */
  readonly occurrenceAvec: string | null;
  /** true : valeur pré-remplie par l'analyse, restée telle quelle. Revérifiée ici. */
  readonly occurrenceAuto: boolean;
}

export interface EntreeLotImport {
  /** Le compte du relevé — celui du formulaire, porté par l'ImportBatch. */
  readonly accountId: string;
  readonly libelle: string | null;
  readonly lignes: readonly LigneAEcrire[];
}

export interface RecapImport {
  readonly importBatchId: string;
  readonly importees: number;
  readonly misesAJour: number;
  readonly beneficiairesCrees: number;
  readonly etiquettesPosees: number;
  readonly couvreDu: DateCivile | null;
  readonly couvreAu: DateCivile | null;
  readonly virementsLies: number;
  readonly occurrencesLiees: number;
}

export type MotifOccurrenceEnConflit = "INTROUVABLE" | "AUTRE_COMPTE" | "PRISE" | "PLUS_CANDIDATE" | "LIEE_ENTRE_TEMPS";

export interface LigneOccurrenceEnConflit {
  readonly cle: string;
  readonly date: DateCivile;
  readonly description: string;
  readonly motif: MotifOccurrenceEnConflit;
  /** null si INTROUVABLE. */
  readonly libelle: string | null;
  readonly echeance: DateCivile | null;
}

export interface LigneVirementEnConflit {
  readonly cle: string;
  readonly date: DateCivile;
  readonly description: string;
  /** INTROUVABLE : la cible n'existe pas ou n'appartient pas au propriétaire ; LIEE_ENTRE_TEMPS : course à l'écriture. */
  readonly motif: RefusLiaison | { readonly motif: "INTROUVABLE" } | { readonly motif: "LIEE_ENTRE_TEMPS" };
}

export interface LigneEnDouble {
  readonly cle: string;
  readonly date: DateCivile;
  readonly description: string;
  readonly montantCents: number;
  /** true = le doublon est à l'intérieur du lot lui-même, pas en base. */
  readonly dansLeLot: boolean;
}

export type ResultatLotImport =
  | { readonly statut: "COMPTE_INTROUVABLE" }
  | {
      readonly statut: "REFERENCE_INVALIDE";
      readonly quoi: "SOUS_CATEGORIE" | "ETIQUETTE" | "BENEFICIAIRE" | "COMPTE_LIGNE" | "BENEFICIAIRE_NOUVEAU_VIDE";
    }
  | { readonly statut: "TRANSACTION_INTROUVABLE"; readonly cles: readonly string[] }
  | { readonly statut: "EMPREINTE_EN_DOUBLE"; readonly lignes: readonly LigneEnDouble[] }
  | { readonly statut: "VIREMENT_CONFLIT"; readonly lignes: readonly LigneVirementEnConflit[] }
  | { readonly statut: "OCCURRENCE_CONFLIT"; readonly lignes: readonly LigneOccurrenceEnConflit[] }
  | { readonly statut: "ENREGISTRE"; readonly recap: RecapImport };

function distinctNonNull<T>(valeurs: readonly (T | null)[]): T[] {
  return [...new Set(valeurs.filter((valeur): valeur is T => valeur !== null))];
}

async function accountsExistants(tx: Prisma.TransactionClient, ownerId: string, ids: readonly string[]): Promise<Set<string>> {
  if (ids.length === 0) {
    return new Set();
  }
  const trouves = await tx.account.findMany({ where: { id: { in: [...ids] }, ownerId }, select: { id: true } });
  return new Set(trouves.map((ligne) => ligne.id));
}

async function tagsExistants(tx: Prisma.TransactionClient, ownerId: string, ids: readonly string[]): Promise<Set<string>> {
  if (ids.length === 0) {
    return new Set();
  }
  const trouves = await tx.tag.findMany({ where: { id: { in: [...ids] }, ownerId }, select: { id: true } });
  return new Set(trouves.map((ligne) => ligne.id));
}

async function payeesExistants(tx: Prisma.TransactionClient, ownerId: string, ids: readonly string[]): Promise<Set<string>> {
  if (ids.length === 0) {
    return new Set();
  }
  const trouves = await tx.payee.findMany({ where: { id: { in: [...ids] }, ownerId }, select: { id: true } });
  return new Set(trouves.map((ligne) => ligne.id));
}

/** Une requête pour toutes les règles nommées du lot, filtrée sur ownerId : une règle absente de la Map est inexistante ou d'un autre propriétaire. */
async function posesDesRegles(
  tx: Prisma.TransactionClient,
  ownerId: string,
  ids: readonly string[],
): Promise<ReadonlyMap<string, PoseSousCategorie | null>> {
  if (ids.length === 0) {
    return new Map();
  }
  const regles = await tx.rule.findMany({
    where: { id: { in: [...ids] }, ownerId },
    select: {
      id: true,
      actions: { select: { type: true, subcategoryId: true, valeur: true, ordre: true }, orderBy: { ordre: "asc" } },
    },
  });
  return new Map(regles.map((regle) => [regle.id, poseSousCategorie(regle.actions)]));
}

/** docs/lot-m2.md §10.1.2 : la règle nommée doit poser exactement ce que la ligne porte, sinon null — jamais un refus du lot. */
function appliedRuleIdRetenu(ligne: LigneAEcrire, poses: ReadonlyMap<string, PoseSousCategorie | null>): string | null {
  if (ligne.appliedRuleId === null) {
    return null;
  }
  return regleJustifieCreneau(poses.get(ligne.appliedRuleId) ?? null, {
    subcategoryId: ligne.subcategoryId,
    montantCents: ligne.montantCents,
    ventilation: ligne.ventilation,
  })
    ? ligne.appliedRuleId
    : null;
}

async function sousCategoriesExistantes(
  tx: Prisma.TransactionClient,
  ownerId: string,
  ids: readonly string[],
): Promise<Set<string>> {
  if (ids.length === 0) {
    return new Set();
  }
  const trouvees = await tx.subcategory.findMany({
    where: { id: { in: [...ids] }, category: { ownerId } },
    select: { id: true },
  });
  return new Set(trouvees.map((ligne) => ligne.id));
}

async function transactionsExistantes(
  tx: Prisma.TransactionClient,
  ownerId: string,
  ids: readonly string[],
): Promise<Set<string>> {
  if (ids.length === 0) {
    return new Set();
  }
  const trouvees = await tx.transaction.findMany({
    where: { id: { in: [...ids] }, ownerId },
    select: { id: true },
  });
  return new Set(trouvees.map((ligne) => ligne.id));
}

interface LigneCalculee {
  readonly ligne: LigneAEcrire;
  readonly descriptionNormalisee: string;
  readonly empreinte: string;
}

interface CibleVirement {
  readonly id: string;
  readonly accountId: string;
  readonly cote: CoteVirement;
}

/**
 * Étape 0 bis — les cibles des lignes virement sont relues et revérifiées par peutLier avant toute écriture : elles
 * ont pu être liées, ventilées, supprimées ou changer de montant entre l'analyse et l'enregistrement.
 */
async function verifierVirements(
  tx: Prisma.TransactionClient,
  ownerId: string,
  lignes: readonly LigneAEcrire[],
): Promise<{ readonly cibles: ReadonlyMap<string, CibleVirement>; readonly conflits: readonly LigneVirementEnConflit[] }> {
  const visees = lignes.filter((ligne) => ligne.action === "IMPORTER" && ligne.virementAvec !== null);
  const ids = distinctNonNull(visees.map((ligne) => ligne.virementAvec));
  if (ids.length === 0) {
    return { cibles: new Map(), conflits: [] };
  }
  // Verrou ordonné : docs/lot-m2.md §4.4 et journal d'INDEX.md 2026-10-06. La lecture voit l'état validé : une cible
  // liée pendant l'attente est refusée par peutLier au lieu de finir en LIEE_ENTRE_TEMPS.
  await verrouillerTransactions(tx, ownerId, ids);
  const trouvees = await tx.transaction.findMany({
    where: { id: { in: ids }, ownerId },
    select: {
      id: true,
      accountId: true,
      date: true,
      montantCents: true,
      parentId: true,
      estVentilee: true,
      transferTransactionId: true,
    },
  });
  const cibles = new Map<string, CibleVirement>(
    trouvees.map((brute) => [
      brute.id,
      {
        id: brute.id,
        accountId: brute.accountId,
        cote: {
          id: brute.id,
          accountId: brute.accountId,
          date: depuisDateUtc(brute.date),
          montantCents: brute.montantCents,
          parentId: brute.parentId,
          estVentilee: brute.estVentilee,
          transferTransactionId: brute.transferTransactionId,
        },
      },
    ]),
  );
  const conflits: LigneVirementEnConflit[] = [];
  for (const ligne of visees) {
    const cible = ligne.virementAvec === null ? undefined : cibles.get(ligne.virementAvec);
    const refus =
      cible === undefined
        ? ({ motif: "INTROUVABLE" } as const)
        : peutLier(
            {
              id: null,
              accountId: ligne.accountId,
              date: ligne.date,
              montantCents: ligne.montantCents,
              parentId: null,
              estVentilee: ligne.ventilation !== null,
              transferTransactionId: null,
            },
            cible.cote,
          );
    if (refus !== null) {
      conflits.push({ cle: ligne.cle, date: ligne.date, description: ligne.description, motif: refus });
    }
  }
  return { cibles, conflits };
}

interface OccurrenceVisee {
  readonly id: string;
  readonly montantCents: Cents;
  readonly toleranceCents: Cents;
  readonly candidate: OccurrenceCandidate;
}

/**
 * Étape 0 ter — les occurrences visées sont verrouillées (après les transactions, journal d'INDEX.md 2026-10-09),
 * relues et revérifiées avant toute écriture : elles ont pu être liées, supprimées ou ne plus convenir à la ligne
 * envoyée (docs/lot-m3.md §4.5).
 */
async function verifierOccurrences(
  tx: Prisma.TransactionClient,
  ownerId: string,
  lignes: readonly LigneAEcrire[],
): Promise<{ readonly occurrences: ReadonlyMap<string, OccurrenceVisee>; readonly conflits: readonly LigneOccurrenceEnConflit[] }> {
  const visees = lignes.filter((ligne) => ligne.action === "IMPORTER" && ligne.occurrenceAvec !== null);
  const ids = distinctNonNull(visees.map((ligne) => ligne.occurrenceAvec));
  if (ids.length === 0) {
    return { occurrences: new Map(), conflits: [] };
  }
  await verrouillerOccurrences(tx, ownerId, ids);
  const trouvees = await tx.expectedOccurrence.findMany({
    where: { id: { in: ids }, rule: { ownerId } },
    select: {
      id: true,
      echeance: true,
      montantCents: true,
      etat: true,
      transactionId: true,
      ruleId: true,
      rule: {
        select: {
          accountId: true,
          libelle: true,
          motifRapprochement: true,
          toleranceCents: true,
          toleranceJours: true,
          subcategoryId: true,
        },
      },
    },
  });
  const brutes = new Map(trouvees.map((o) => [o.id, o]));
  const occurrences = new Map<string, OccurrenceVisee>();
  for (const o of trouvees) {
    occurrences.set(o.id, {
      id: o.id,
      montantCents: o.montantCents,
      toleranceCents: o.rule.toleranceCents,
      candidate: {
        id: o.id,
        ruleId: o.ruleId,
        echeance: depuisDateUtc(o.echeance),
        montantCents: o.montantCents,
        libelle: o.rule.libelle,
        motifRapprochement: o.rule.motifRapprochement,
        toleranceCents: o.rule.toleranceCents,
        toleranceJours: o.rule.toleranceJours,
        subcategoryId: o.rule.subcategoryId,
      },
    });
  }
  const conflits: LigneOccurrenceEnConflit[] = [];
  for (const ligne of visees) {
    const brute = ligne.occurrenceAvec === null ? undefined : brutes.get(ligne.occurrenceAvec);
    const visee = ligne.occurrenceAvec === null ? undefined : occurrences.get(ligne.occurrenceAvec);
    const base = { cle: ligne.cle, date: ligne.date, description: ligne.description };
    if (brute === undefined || visee === undefined) {
      conflits.push({ ...base, motif: "INTROUVABLE", libelle: null, echeance: null });
      continue;
    }
    const nommee = { libelle: brute.rule.libelle, echeance: visee.candidate.echeance };
    let motif: MotifOccurrenceEnConflit | null = null;
    if (brute.rule.accountId !== ligne.accountId) {
      motif = "AUTRE_COMPTE";
    } else if (!estOccurrenceOuverte({ etat: brute.etat, transactionId: brute.transactionId })) {
      motif = "PRISE";
    } else if (
      candidatsOccurrence(
        { date: ligne.date, montantCents: ligne.montantCents, descriptionNormalisee: normaliserDescription(ligne.description) },
        [visee.candidate],
      ).length !== 1
    ) {
      motif = "PLUS_CANDIDATE";
    }
    if (motif !== null) {
      conflits.push({ ...base, motif, ...nommee });
    }
  }
  return { occurrences, conflits };
}

/**
 * Étape 0 — appartenance et références, avant toute écriture (CLAUDE.md §6.3,
 * un identifiant venu du client ne prouve rien). Un findMany par type, jamais
 * une boucle (docs/lot-m1.md §7, patron referencesValides de rules.ts).
 */
async function verifierReferences(
  tx: Prisma.TransactionClient,
  ownerId: string,
  entree: EntreeLotImport,
): Promise<ResultatLotImport | null> {
  const compte = await tx.account.findFirst({ where: { id: entree.accountId, ownerId }, select: { id: true } });
  if (compte === null) {
    return { statut: "COMPTE_INTROUVABLE" };
  }

  // Filet : zod a déjà refusé un nom vide après trim, mais un nom fait
  // seulement d'accents combinants (« \u0301 ») passe trim et se normalise
  // en "". Le laisser passer écrirait la transaction sans bénéficiaire, sans
  // un mot, alors que l'écran a affiché « Bénéficiaire à créer ».
  const nomVide = entree.lignes.some(
    (ligne) => ligne.payeeNouveauNom !== null && normaliserNom(ligne.payeeNouveauNom) === "",
  );
  if (nomVide) {
    return { statut: "REFERENCE_INVALIDE", quoi: "BENEFICIAIRE_NOUVEAU_VIDE" };
  }

  const accountIdsLignes = distinctNonNull(entree.lignes.map((ligne) => ligne.accountId));
  const comptesTrouves = await accountsExistants(tx, ownerId, accountIdsLignes);
  if (comptesTrouves.size !== accountIdsLignes.length) {
    return { statut: "REFERENCE_INVALIDE", quoi: "COMPTE_LIGNE" };
  }

  const subcategoryIds = distinctNonNull([
    ...entree.lignes.map((ligne) => ligne.subcategoryId),
    ...entree.lignes.flatMap((ligne) => (ligne.ventilation ?? []).map((fille) => fille.subcategoryId)),
  ]);
  const sousCategoriesTrouvees = await sousCategoriesExistantes(tx, ownerId, subcategoryIds);
  if (sousCategoriesTrouvees.size !== subcategoryIds.length) {
    return { statut: "REFERENCE_INVALIDE", quoi: "SOUS_CATEGORIE" };
  }

  const tagIds = distinctNonNull(entree.lignes.flatMap((ligne) => [...ligne.tagIds]));
  const tagsTrouves = await tagsExistants(tx, ownerId, tagIds);
  if (tagsTrouves.size !== tagIds.length) {
    return { statut: "REFERENCE_INVALIDE", quoi: "ETIQUETTE" };
  }

  const payeeIds = distinctNonNull(entree.lignes.map((ligne) => ligne.payeeId));
  const payeesTrouves = await payeesExistants(tx, ownerId, payeeIds);
  if (payeesTrouves.size !== payeeIds.length) {
    return { statut: "REFERENCE_INVALIDE", quoi: "BENEFICIAIRE" };
  }

  const lignesMiseAJour = entree.lignes.filter((ligne) => ligne.action === "METTRE_A_JOUR");
  const transactionIds = distinctNonNull(lignesMiseAJour.map((ligne) => ligne.transactionExistanteId));
  const transactionsTrouvees = await transactionsExistantes(tx, ownerId, transactionIds);
  if (transactionsTrouvees.size !== transactionIds.length) {
    const cles = lignesMiseAJour
      .filter((ligne) => ligne.transactionExistanteId !== null && !transactionsTrouvees.has(ligne.transactionExistanteId))
      .map((ligne) => ligne.cle);
    return { statut: "TRANSACTION_INTROUVABLE", cles };
  }

  return null;
}

/**
 * Étape 1 — bénéficiaires nouveaux. Une Map nom → id ; deux lignes portant le
 * même nom nouveau (comparé sur normaliserNom, la clé d'identité) créent un
 * seul Payee.
 */
async function resoudreBeneficiairesNouveaux(
  tx: Prisma.TransactionClient,
  ownerId: string,
  entree: EntreeLotImport,
): Promise<{ readonly parNomNormalise: Map<string, string>; readonly crees: number }> {
  const parNomNormalise = new Map<string, string>();
  const premiereOccurrence = new Map<string, string>();
  let crees = 0;

  for (const ligne of entree.lignes) {
    if (ligne.payeeNouveauNom === null) {
      continue;
    }
    const nomNormalise = normaliserNom(ligne.payeeNouveauNom);
    if (nomNormalise === "" || premiereOccurrence.has(nomNormalise)) {
      continue;
    }
    premiereOccurrence.set(nomNormalise, ligne.payeeNouveauNom);
  }

  for (const [nomNormalise, nom] of premiereOccurrence) {
    const existant = await tx.payee.findFirst({ where: { ownerId, nomNormalise }, select: { id: true } });
    if (existant !== null) {
      parNomNormalise.set(nomNormalise, existant.id);
      continue;
    }
    const cree = await tx.payee.create({
      data: { ownerId, nom, nomNormalise },
      select: { id: true },
    });
    parNomNormalise.set(nomNormalise, cree.id);
    crees += 1;
  }

  return { parNomNormalise, crees };
}

function resoudrePayeeId(ligne: LigneAEcrire, beneficiairesNouveaux: Map<string, string>): string | null {
  if (ligne.payeeNouveauNom !== null) {
    const nomNormalise = normaliserNom(ligne.payeeNouveauNom);
    return beneficiairesNouveaux.get(nomNormalise) ?? ligne.payeeId;
  }
  return ligne.payeeId;
}

function minMaxDates(dates: readonly DateCivile[]): { readonly du: DateCivile | null; readonly au: DateCivile | null } {
  const [premiere, ...reste] = dates;
  if (premiere === undefined) {
    return { du: null, au: null };
  }
  let du = premiere;
  let au = premiere;
  for (const date of reste) {
    if (date < du) du = date;
    if (date > au) au = date;
  }
  return { du, au };
}

export async function enregistrerLotImport(ownerId: string, entree: EntreeLotImport): Promise<ResultatLotImport> {
  // La ligne en cours d'écriture : si une course annule la $transaction, elle dit laquelle a échoué.
  const enCours: EnCours = { ligne: null, occurrence: null };
  try {
    return await ecrireLotImport(ownerId, entree, enCours);
  } catch (erreur) {
    if (erreur instanceof CourseOccurrence) {
      const lignesOccurrence = entree.lignes.filter((ligne) => ligne.action === "IMPORTER" && ligne.occurrenceAvec !== null);
      const fautives =
        enCours.occurrence === null
          ? lignesOccurrence.map((ligne) => ({ ligne, libelle: null, echeance: null }))
          : [enCours.occurrence];
      return {
        statut: "OCCURRENCE_CONFLIT",
        lignes: fautives.map(({ ligne, libelle, echeance }) => ({
          cle: ligne.cle,
          date: ligne.date,
          description: ligne.description,
          motif: "LIEE_ENTRE_TEMPS",
          libelle,
          echeance,
        })),
      };
    }
    if (!(erreur instanceof CourseVirement)) {
      throw erreur;
    }
  }
  const lignesVirement = entree.lignes.filter((ligne) => ligne.action === "IMPORTER" && ligne.virementAvec !== null);
  const fautives = enCours.ligne === null ? lignesVirement : [enCours.ligne];
  return {
    statut: "VIREMENT_CONFLIT",
    lignes: fautives.map((ligne) => ({
      cle: ligne.cle,
      date: ligne.date,
      description: ligne.description,
      motif: { motif: "LIEE_ENTRE_TEMPS" },
    })),
  };
}

interface EnCours {
  ligne: LigneAEcrire | null;
  occurrence: { readonly ligne: LigneAEcrire; readonly libelle: string; readonly echeance: DateCivile } | null;
}

async function ecrireLotImport(ownerId: string, entree: EntreeLotImport, enCours: EnCours): Promise<ResultatLotImport> {
  return prisma.$transaction(
    async (tx): Promise<ResultatLotImport> => {
      const erreurReferences = await verifierReferences(tx, ownerId, entree);
      if (erreurReferences !== null) {
        return erreurReferences;
      }

      const { cibles, conflits: conflitsVirement } = await verifierVirements(tx, ownerId, entree.lignes);
      if (conflitsVirement.length > 0) {
        return { statut: "VIREMENT_CONFLIT", lignes: conflitsVirement };
      }

      const { occurrences, conflits: conflitsOccurrence } = await verifierOccurrences(tx, ownerId, entree.lignes);
      if (conflitsOccurrence.length > 0) {
        return { statut: "OCCURRENCE_CONFLIT", lignes: conflitsOccurrence };
      }

      // Étape 2 — empreintes recalculées ici, jamais reçues du client : la
      // revue a pu modifier la date, la description, le montant ou le compte.
      const lignesCalculees: LigneCalculee[] = entree.lignes.map((ligne) => {
        const descriptionNormalisee = normaliserDescription(ligne.description);
        const empreinte = calculerEmpreinte(ligne.accountId, ligne.date, ligne.montantCents, descriptionNormalisee);
        return { ligne, descriptionNormalisee, empreinte };
      });

      const lignesImporter = lignesCalculees.filter((calculee) => calculee.ligne.action === "IMPORTER");
      const lignesMiseAJour = lignesCalculees.filter((calculee) => calculee.ligne.action === "METTRE_A_JOUR");
      const lignesVirement = lignesImporter.filter((calculee) => calculee.ligne.virementAvec !== null);
      const lignesOccurrence = lignesImporter.filter((calculee) => calculee.ligne.occurrenceAvec !== null);
      const estVirement = (ligne: LigneAEcrire): boolean => ligne.virementAvec !== null;

      const empreintesVues = new Map<string, LigneCalculee>();
      const doublonsDansLeLot: LigneEnDouble[] = [];
      for (const calculee of lignesImporter) {
        const existante = empreintesVues.get(calculee.empreinte);
        if (existante !== undefined) {
          doublonsDansLeLot.push({
            cle: calculee.ligne.cle,
            date: calculee.ligne.date,
            description: calculee.ligne.description,
            montantCents: calculee.ligne.montantCents,
            dansLeLot: true,
          });
        } else {
          empreintesVues.set(calculee.empreinte, calculee);
        }
      }
      if (doublonsDansLeLot.length > 0) {
        return { statut: "EMPREINTE_EN_DOUBLE", lignes: doublonsDansLeLot };
      }

      if (lignesImporter.length > 0) {
        const empreintesEnBase = await tx.transaction.findMany({
          where: { empreinte: { in: lignesImporter.map((calculee) => calculee.empreinte) } },
          select: { empreinte: true },
        });
        if (empreintesEnBase.length > 0) {
          const enBase = new Set(empreintesEnBase.map((ligne) => ligne.empreinte));
          const doublonsEnBase = lignesImporter
            .filter((calculee) => enBase.has(calculee.empreinte))
            .map(
              (calculee): LigneEnDouble => ({
                cle: calculee.ligne.cle,
                date: calculee.ligne.date,
                description: calculee.ligne.description,
                montantCents: calculee.ligne.montantCents,
                dansLeLot: false,
              }),
            );
          return { statut: "EMPREINTE_EN_DOUBLE", lignes: doublonsEnBase };
        }
      }

      const poses = await posesDesRegles(
        tx,
        ownerId,
        distinctNonNull(lignesImporter.map((calculee) => calculee.ligne.appliedRuleId)),
      );

      // Étape 1 (avant l'écriture des transactions, mais après le contrôle de
      // doublon : pas de Payee créé en effet de bord si le lot est rejeté).
      const { parNomNormalise: beneficiairesNouveaux, crees: beneficiairesCrees } = await resoudreBeneficiairesNouveaux(
        tx,
        ownerId,
        entree,
      );

      const toutesLesDates = entree.lignes.map((ligne) => ligne.date);
      const { du: couvreDu, au: couvreAu } = minMaxDates(toutesLesDates);

      // Étape 3 — l'ImportBatch.
      const importBatch = await tx.importBatch.create({
        data: {
          ownerId,
          accountId: entree.accountId,
          source: "COPIER_COLLER",
          libelle: entree.libelle,
          nbLignes: entree.lignes.length,
          couvreDu: couvreDu === null ? null : versDateUtc(couvreDu),
          couvreAu: couvreAu === null ? null : versDateUtc(couvreAu),
        },
        select: { id: true },
      });

      // Étape 4 — les transactions IMPORTER.
      if (lignesImporter.length > 0) {
        await tx.transaction.createMany({
          data: lignesImporter.map((calculee) => {
            const ligne = calculee.ligne;
            return {
              ownerId,
              accountId: ligne.accountId,
              date: versDateUtc(ligne.date),
              description: ligne.description,
              descriptionNormalisee: calculee.descriptionNormalisee,
              details: ligne.note,
              montantCents: ligne.montantCents,
              payeeId: resoudrePayeeId(ligne, beneficiairesNouveaux),
              // Un côté de virement ne porte ni sous-catégorie ni règle (docs/lot-m2.md §3.4).
              subcategoryId: estVirement(ligne) ? null : ligne.subcategoryId,
              estVentilee: ligne.ventilation !== null,
              source: "COPIER_COLLER" as const,
              etat: "COMPTABILISEE" as const,
              aRevoir: ligne.aRevoir,
              exclureDuBudget: ligne.exclureDuBudget,
              exclureDesRapports: ligne.exclureDesRapports,
              empreinte: calculee.empreinte,
              externalId: ligne.externalId,
              importBatchId: importBatch.id,
              appliedRuleId: estVirement(ligne) ? null : appliedRuleIdRetenu(ligne, poses),
              typeOperation: ligne.typeOperation,
            };
          }),
        });
      }

      // Étape 5 — étiquettes et lignes de ventilation : createMany ne rend pas
      // les identifiants, un findMany reconstruit la correspondance par
      // empreinte (unique). Les filles ont importBatchId null (docs/lot-m2.md
      // §4.2) : elles n'apparaissent pas dans cette relecture.
      let etiquettesPosees = 0;
      const lignesVentilees = lignesImporter.filter((calculee) => calculee.ligne.ventilation !== null);
      if (
        lignesImporter.some((calculee) => calculee.ligne.tagIds.length > 0) ||
        lignesVentilees.length > 0 ||
        lignesVirement.length > 0 ||
        lignesOccurrence.length > 0
      ) {
        const creees = await tx.transaction.findMany({
          where: { importBatchId: importBatch.id },
          select: { id: true, empreinte: true },
        });
        const idParEmpreinte = new Map(creees.map((ligne) => [ligne.empreinte, ligne.id]));

        // Étape 5 bis — un seul createMany pour toutes les filles du lot.
        const filles = lignesVentilees.flatMap((calculee) => {
          const ligne = calculee.ligne;
          const parentId = idParEmpreinte.get(calculee.empreinte);
          if (parentId === undefined) {
            // Incohérence interne : la $transaction est annulée plutôt que d'écrire une fille sans parent.
            throw new Error("Parent d'une ventilation introuvable après sa création.");
          }
          return (ligne.ventilation ?? []).map((fille, i) => ({
            ownerId,
            accountId: ligne.accountId,
            date: versDateUtc(ligne.date),
            description: ligne.description,
            descriptionNormalisee: calculee.descriptionNormalisee,
            typeOperation: ligne.typeOperation,
            payeeId: resoudrePayeeId(ligne, beneficiairesNouveaux),
            source: "COPIER_COLLER" as const,
            etat: "COMPTABILISEE" as const,
            montantCents: fille.montantCents,
            subcategoryId: fille.subcategoryId,
            details: null,
            empreinte: empreinteLigneFille(calculee.empreinte, i + 1),
            parentId,
            appliedRuleId: null,
            importBatchId: null,
          }));
        });
        if (filles.length > 0) {
          await tx.transaction.createMany({ data: filles });
        }

        const donneesEtiquettes: { transactionId: string; tagId: string }[] = [];
        for (const calculee of lignesImporter) {
          const transactionId = idParEmpreinte.get(calculee.empreinte);
          if (transactionId === undefined) {
            continue;
          }
          for (const tagId of calculee.ligne.tagIds) {
            donneesEtiquettes.push({ transactionId, tagId });
          }
        }

        if (donneesEtiquettes.length > 0) {
          await tx.transactionTag.createMany({ data: donneesEtiquettes });
          etiquettesPosees = donneesEtiquettes.length;
        }

        // Étape 5 ter — les pointeurs des virements, par ordre croissant d'id de cible (anti-interblocage). La cible
        // préexistante s'écrit la première, par un updateMany gardé ; la ligne neuve pointe ensuite vers elle.
        const aLier = lignesVirement
          .flatMap((calculee) => {
            const cible = calculee.ligne.virementAvec === null ? undefined : cibles.get(calculee.ligne.virementAvec);
            const nouvelleId = idParEmpreinte.get(calculee.empreinte);
            if (cible === undefined || nouvelleId === undefined) {
              throw new Error("Cible ou ligne d'un virement introuvable après la création du lot.");
            }
            return [{ ligne: calculee.ligne, cible, nouvelleId }];
          })
          .sort((x, y) => (x.cible.id < y.cible.id ? -1 : x.cible.id > y.cible.id ? 1 : 0));
        for (const { ligne, cible, nouvelleId } of aLier) {
          enCours.ligne = ligne;
          const { count } = await tx.transaction.updateMany({
            where: {
              id: cible.id,
              ownerId,
              transferTransactionId: null,
              parentId: null,
              estVentilee: false,
              montantCents: -ligne.montantCents,
            },
            data: {
              transferTransactionId: nouvelleId,
              transferAccountId: ligne.accountId,
              subcategoryId: null,
              appliedRuleId: null,
            },
          });
          if (count !== 1) {
            throw new CourseVirement();
          }
          await tx.transaction.update({
            where: { id: nouvelleId },
            data: { transferTransactionId: cible.id, transferAccountId: cible.accountId },
          });
        }

        // Étape 5 quater — les liaisons d'occurrences, par ordre croissant d'id d'occurrence (anti-interblocage),
        // chacune par un updateMany gardé (docs/lot-m3.md §4.5).
        const aLierOccurrences = lignesOccurrence
          .flatMap((calculee) => {
            const visee = calculee.ligne.occurrenceAvec === null ? undefined : occurrences.get(calculee.ligne.occurrenceAvec);
            const nouvelleId = idParEmpreinte.get(calculee.empreinte);
            if (visee === undefined || nouvelleId === undefined) {
              throw new Error("Occurrence ou ligne d'un rapprochement introuvable après la création du lot.");
            }
            return [{ calculee, visee, nouvelleId }];
          })
          .sort((x, y) => (x.visee.id < y.visee.id ? -1 : x.visee.id > y.visee.id ? 1 : 0));
        const lieeLe = new Date();
        for (const { calculee, visee, nouvelleId } of aLierOccurrences) {
          const ligne = calculee.ligne;
          const auto =
            ligne.occurrenceAuto &&
            evaluerRapprochement(
              { date: ligne.date, montantCents: ligne.montantCents, descriptionNormalisee: calculee.descriptionNormalisee },
              [visee.candidate],
            ).verdict === "AUTO";
          const etat = etatApresLiaison(ligne.montantCents, visee, visee.toleranceCents);
          enCours.occurrence = { ligne, libelle: visee.candidate.libelle, echeance: visee.candidate.echeance };
          const { count } = await tx.expectedOccurrence.updateMany({
            where: { id: visee.id, transactionId: null, etat: { in: ["PREVUE", "MANQUEE"] } },
            data: { transactionId: nouvelleId, liaison: auto ? "AUTO" : "MANUELLE", lieeLe, etat },
          });
          if (count !== 1) {
            throw new CourseOccurrence();
          }
        }
      }

      // Étape 6 — mises à jour (couche 1 du dédoublonnage). Ni la catégorie ni
      // les étiquettes : une révision de la source ne défait pas le travail
      // de l'utilisateur.
      let misesAJour = 0;
      for (const calculee of lignesMiseAJour) {
        const ligne = calculee.ligne;
        if (ligne.transactionExistanteId === null) {
          continue;
        }
        const { count } = await tx.transaction.updateMany({
          where: { id: ligne.transactionExistanteId, ownerId },
          data: {
            date: versDateUtc(ligne.date),
            description: ligne.description,
            descriptionNormalisee: calculee.descriptionNormalisee,
            typeOperation: ligne.typeOperation,
            montantCents: ligne.montantCents,
            empreinte: calculee.empreinte,
            etat: "COMPTABILISEE",
            importBatchId: importBatch.id,
          },
        });
        misesAJour += count;
      }

      return {
        statut: "ENREGISTRE",
        recap: {
          importBatchId: importBatch.id,
          importees: lignesImporter.length,
          misesAJour,
          beneficiairesCrees,
          etiquettesPosees,
          couvreDu,
          couvreAu,
          virementsLies: lignesVirement.length,
          occurrencesLiees: lignesOccurrence.length,
        },
      };
    },
    { timeout: TIMEOUT_TRANSACTION_MS, maxWait: MAX_WAIT_TRANSACTION_MS },
  );
}
