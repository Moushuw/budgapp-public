// Repository des transactions — docs/lot-m1.md §4.6 (balayage rétroactif) et §6.2 (dédoublonnage).
// Ce n'est PAS le repository complet des transactions ; M2 l'étendra encore.

import type { Prisma } from "@prisma/client";
import { depuisDateUtc, versDateUtc, type DateCivile } from "@/domain/dates";
import { LIMITE_BALAYAGE } from "@/domain/edition";
import type { TransactionExistante } from "@/domain/ingestion";
import type { Cents } from "@/domain/money";
import type { CandidatVirement } from "@/domain/virement";
import { empreinteLigneFille } from "@/domain/ventilation/empreinte";
import { prisma } from "@/server/db";

// Déménagée dans le domaine : le schéma client en a besoin (docs/lot-m2.md §6.4).
export { LIMITE_BALAYAGE };

export interface LigneTransactionCandidate {
  readonly id: string;
  readonly date: DateCivile;
  readonly description: string;
  readonly descriptionNormalisee: string;
  readonly montantCents: number;
  readonly accountId: string;
  readonly compteNom: string;
  readonly payeeId: string | null;
  readonly payeeNom: string | null;
  readonly payeeCategorieVerrouillee: boolean;
  readonly subcategoryId: string | null;
  readonly sousCategorieNom: string | null;
  readonly note: string | null; // Transaction.details
  readonly tagIds: readonly string[];
  readonly aRevoir: boolean;
  readonly exclureDuBudget: boolean;
  readonly exclureDesRapports: boolean;
  readonly appliedRuleId: string | null;
  readonly parentId: string | null;
  readonly estVentilee: boolean;
  readonly transferTransactionId: string | null;
}

export interface PorteeBalayage {
  readonly du: DateCivile | null;
  readonly au: DateCivile | null;
}

export interface ResultatBalayage {
  readonly lignes: readonly LigneTransactionCandidate[];
  readonly tronque: boolean;
}

export interface ModificationTransaction {
  readonly transactionId: string;
  readonly subcategoryId?: string | null; // absent = champ non touché
  readonly payeeId?: string;
  readonly note?: string;
  readonly aRevoir?: boolean;
  readonly exclureDuBudget?: boolean;
  readonly exclureDesRapports?: boolean;
  readonly tagIdsAAjouter: readonly string[];
  /** Écrit uniquement quand la modification pose ou change la sous-catégorie. */
  readonly appliedRuleId?: string;
  /** Pose une ventilation : la ligne devient parent (estVentilee, subcategoryId null). docs/lot-m2.md §4.3. */
  readonly ventilation?: readonly { readonly subcategoryId: string; readonly montantCents: Cents }[];
}

const SELECTION_CANDIDATE = {
  id: true,
  date: true,
  description: true,
  descriptionNormalisee: true,
  montantCents: true,
  accountId: true,
  account: { select: { nom: true } },
  payeeId: true,
  payee: { select: { nom: true, categorieVerrouillee: true } },
  subcategoryId: true,
  subcategory: { select: { nom: true } },
  details: true,
  etiquettes: { select: { tagId: true } },
  aRevoir: true,
  exclureDuBudget: true,
  exclureDesRapports: true,
  appliedRuleId: true,
  parentId: true,
  estVentilee: true,
  transferTransactionId: true,
} as const;

interface LigneCandidateBrute {
  id: string;
  date: Date;
  description: string;
  descriptionNormalisee: string;
  montantCents: number;
  accountId: string;
  account: { nom: string };
  payeeId: string | null;
  payee: { nom: string; categorieVerrouillee: boolean } | null;
  subcategoryId: string | null;
  subcategory: { nom: string } | null;
  details: string | null;
  etiquettes: { tagId: string }[];
  aRevoir: boolean;
  exclureDuBudget: boolean;
  exclureDesRapports: boolean;
  appliedRuleId: string | null;
  parentId: string | null;
  estVentilee: boolean;
  transferTransactionId: string | null;
}

function versLigneCandidate(ligne: LigneCandidateBrute): LigneTransactionCandidate {
  return {
    id: ligne.id,
    date: depuisDateUtc(ligne.date),
    description: ligne.description,
    descriptionNormalisee: ligne.descriptionNormalisee,
    montantCents: ligne.montantCents,
    accountId: ligne.accountId,
    compteNom: ligne.account.nom,
    payeeId: ligne.payeeId,
    payeeNom: ligne.payee?.nom ?? null,
    payeeCategorieVerrouillee: ligne.payee?.categorieVerrouillee ?? false,
    subcategoryId: ligne.subcategoryId,
    sousCategorieNom: ligne.subcategory?.nom ?? null,
    note: ligne.details,
    tagIds: ligne.etiquettes.map((etiquette) => etiquette.tagId),
    aRevoir: ligne.aRevoir,
    exclureDuBudget: ligne.exclureDuBudget,
    exclureDesRapports: ligne.exclureDesRapports,
    appliedRuleId: ligne.appliedRuleId,
    parentId: ligne.parentId,
    estVentilee: ligne.estVentilee,
    transferTransactionId: ligne.transferTransactionId,
  };
}

// LIMITE_BALAYAGE + 1 lignes et leurs relations : le délai par défaut (5000 ms) est trop juste.
const TIMEOUT_BALAYAGE_MS = 20_000;

/** Borné à LIMITE_BALAYAGE + 1 lignes ; `tronque` dit si la borne a mordu. */
export async function balayerTransactions(ownerId: string, portee: PorteeBalayage): Promise<ResultatBalayage> {
  // parentId: null — une ligne fille de ventilation n'est pas une transaction
  // autonome ; les ventilations n'existent pas encore (M2) mais le filtre
  // coûte zéro et évite une surprise.
  const where: Prisma.TransactionWhereInput = {
    ownerId,
    parentId: null,
    ...(portee.du !== null || portee.au !== null
      ? {
          date: {
            ...(portee.du !== null ? { gte: versDateUtc(portee.du) } : {}),
            ...(portee.au !== null ? { lte: versDateUtc(portee.au) } : {}),
          },
        }
      : {}),
  };

  // Une seule transaction à instantané : la ligne et ses relations (compte, bénéficiaire,
  // sous-catégorie, étiquettes) se lisent sous le même état de la base, même si une
  // écriture concurrente supprime une relation entre deux requêtes.
  const lignes = await prisma.$transaction(
    async (tx) =>
      tx.transaction.findMany({
        where,
        select: SELECTION_CANDIDATE,
        orderBy: [{ date: "desc" }, { id: "asc" }],
        take: LIMITE_BALAYAGE + 1,
      }),
    { isolationLevel: "RepeatableRead", maxWait: MAX_WAIT_TRANSACTION_MS, timeout: TIMEOUT_BALAYAGE_MS },
  );

  const tronque = lignes.length > LIMITE_BALAYAGE;
  const bornees = tronque ? lignes.slice(0, LIMITE_BALAYAGE) : lignes;

  return { lignes: bornees.map(versLigneCandidate), tronque };
}

export async function lireTransactionsParIds(
  ownerId: string,
  ids: readonly string[],
): Promise<LigneTransactionCandidate[]> {
  const lignes = await prisma.transaction.findMany({
    where: { ownerId, id: { in: [...ids] } },
    select: SELECTION_CANDIDATE,
  });
  return lignes.map(versLigneCandidate);
}

// Une seule ligne de modification peut faire jusqu'à deux écritures
// séquentielles (updateMany + createMany des étiquettes) à l'intérieur du
// $transaction ci-dessous — jamais de découpage en lots : un lot à moitié
// appliqué serait pire qu'un échec propre (décision du 2026-09-19, journal
// INDEX.md). Le délai par défaut de Prisma pour une transaction interactive
// (5000 ms) ne tient donc pas à l'échelle de LIMITE_BALAYAGE.
//
// Mesuré (pas deviné), sur la base distante de développement, avec
// appliquerModifications directement : 500 lignes jetables, chacune avec ses
// deux écritures (updateMany + createMany, le pire cas réel — une règle
// CATEGORISER + ETIQUETER) → 3 097 ms, soit 6,19 ms/ligne (déjà les deux
// écritures comprises). Extrapolé linéairement à LIMITE_BALAYAGE (5000
// lignes) : ~31 000 ms. TIMEOUT_TRANSACTION_MS double cette extrapolation
// pour absorber la marge de latence déjà observée sur cette base entre une
// exécution isolée et une exécution sous charge (facteur ~1,5 mesuré sur
// prisma/coherence.test.ts, cf. journal INDEX.md du 2026-09-19).
const MS_PAR_LIGNE_MESURE = 6.2;
export const TIMEOUT_TRANSACTION_MS = Math.ceil(MS_PAR_LIGNE_MESURE * LIMITE_BALAYAGE * 2);
// Exportée (docs/lot-m1.md §6.4) : import-batches.ts réutilise
// le même mécanisme de $transaction bornée en temps plutôt que d'en ouvrir
// un second.
export const MAX_WAIT_TRANSACTION_MS = 10_000;

/** Une seule prisma.$transaction. Rend le nombre de transactions réellement écrites. */
export async function appliquerModifications(
  ownerId: string,
  modifications: readonly ModificationTransaction[],
): Promise<number> {
  return prisma.$transaction(
    async (tx) => {
      // Une seule requête pour toutes les modifications : TransactionTag n'a
      // pas d'ownerId propre, l'appartenance de la transaction doit donc être
      // vérifiée avant toute écriture, y compris quand la modification ne
      // touche que des étiquettes (CLAUDE.md §6.3 et §7 : pas de N+1).
      const ids = modifications.map((modification) => modification.transactionId);
      const possedees = await tx.transaction.findMany({
        where: { id: { in: ids }, ownerId },
        select: { id: true },
      });
      const idsPossedes = new Set(possedees.map((ligne) => ligne.id));

      // Les parents à ventiler : une seule lecture, jamais une boucle de requêtes (CLAUDE.md §7).
      const idsVentilation = modifications
        .filter((modification) => modification.ventilation !== undefined)
        .map((modification) => modification.transactionId);
      const parents =
        idsVentilation.length === 0
          ? []
          : await tx.transaction.findMany({
              where: { id: { in: idsVentilation }, ownerId },
              select: {
                id: true,
                accountId: true,
                date: true,
                description: true,
                descriptionNormalisee: true,
                typeOperation: true,
                payeeId: true,
                source: true,
                empreinte: true,
              },
            });
      const parentParId = new Map(parents.map((parent) => [parent.id, parent]));
      const filles: Prisma.TransactionCreateManyInput[] = [];

      let ecrites = 0;

      for (const modification of modifications) {
        if (!idsPossedes.has(modification.transactionId)) {
          continue;
        }

        const data: Prisma.TransactionUncheckedUpdateManyInput = {};
        if (modification.subcategoryId !== undefined) {
          data.subcategoryId = modification.subcategoryId;
        }
        if (modification.payeeId !== undefined) {
          data.payeeId = modification.payeeId;
        }
        if (modification.note !== undefined) {
          data.details = modification.note;
        }
        if (modification.aRevoir !== undefined) {
          data.aRevoir = modification.aRevoir;
        }
        if (modification.exclureDuBudget !== undefined) {
          data.exclureDuBudget = modification.exclureDuBudget;
        }
        if (modification.exclureDesRapports !== undefined) {
          data.exclureDesRapports = modification.exclureDesRapports;
        }
        if (modification.appliedRuleId !== undefined) {
          data.appliedRuleId = modification.appliedRuleId;
        }

        let ecrite = false;

        const ventilation = modification.ventilation;
        if (ventilation !== undefined) {
          const parent = parentParId.get(modification.transactionId);
          // Le parent devient ventilé et ne porte plus de sous-catégorie (docs/lot-m2.md §4.2).
          const { count } = await tx.transaction.updateMany({
            where: {
              id: modification.transactionId,
              ownerId,
              parentId: null,
              estVentilee: false,
              transferTransactionId: null,
            },
            data: { ...data, estVentilee: true, subcategoryId: null },
          });
          if (parent === undefined || count !== 1) {
            // Course : la ligne a été ventilée, liée ou supprimée depuis la lecture. La transaction est annulée.
            throw new Error("Une transaction à ventiler a changé pendant l'application de la règle.");
          }
          ventilation.forEach((fille, i) => {
            filles.push({
              ownerId,
              accountId: parent.accountId,
              date: parent.date,
              description: parent.description,
              descriptionNormalisee: parent.descriptionNormalisee,
              typeOperation: parent.typeOperation,
              source: parent.source,
              payeeId: modification.payeeId ?? parent.payeeId,
              montantCents: fille.montantCents,
              subcategoryId: fille.subcategoryId,
              details: null,
              empreinte: empreinteLigneFille(parent.empreinte, i + 1),
              parentId: parent.id,
              etat: "COMPTABILISEE",
              appliedRuleId: null,
              importBatchId: null,
            });
          });
          ecrite = true;
        } else if (Object.keys(data).length > 0) {
          // L'appartenance est revérifiée à l'écriture : un identifiant venu
          // du client ne prouve rien (CLAUDE.md §6.3).
          // Une sous-catégorie posée est gardée contre un côté de virement apparu depuis la lecture
          // (docs/lot-m2.md §3.4) : la transaction est annulée, comme pour la ventilation.
          const poseSousCategorie = modification.subcategoryId !== undefined && modification.subcategoryId !== null;
          const { count } = await tx.transaction.updateMany({
            where: {
              id: modification.transactionId,
              ownerId,
              ...(poseSousCategorie ? { transferTransactionId: null, estVentilee: false, parentId: null } : {}),
            },
            data,
          });
          if (poseSousCategorie && count !== 1) {
            throw new Error("Une transaction a changé de nature pendant l'application de la règle.");
          }
          ecrite = true;
        }

        if (modification.tagIdsAAjouter.length > 0) {
          await tx.transactionTag.createMany({
            data: modification.tagIdsAAjouter.map((tagId) => ({
              transactionId: modification.transactionId,
              tagId,
            })),
            skipDuplicates: true,
          });
          ecrite = true;
        }

        if (ecrite) {
          ecrites += 1;
        }
      }

      if (filles.length > 0) {
        await tx.transaction.createMany({ data: filles });
      }

      return ecrites;
    },
    { timeout: TIMEOUT_TRANSACTION_MS, maxWait: MAX_WAIT_TRANSACTION_MS },
  );
}

// ── dédoublonnage à l'import — docs/lot-m1.md §6.2 et §7

export interface FenetreDedoublonnage {
  readonly accountId: string;
  readonly du: DateCivile;
  readonly au: DateCivile;
}

const SELECTION_EXISTANTE = {
  id: true,
  accountId: true,
  date: true,
  description: true,
  descriptionNormalisee: true,
  montantCents: true,
  empreinte: true,
  externalId: true,
  transferTransactionId: true,
  compteContrepartie: { select: { nom: true } },
} as const;

interface LigneExistanteBrute {
  id: string;
  accountId: string;
  date: Date;
  description: string;
  descriptionNormalisee: string;
  montantCents: number;
  empreinte: string;
  externalId: string | null;
  transferTransactionId: string | null;
  compteContrepartie: { nom: string } | null;
}

function versTransactionExistante(ligne: LigneExistanteBrute): TransactionExistante {
  return {
    id: ligne.id,
    accountId: ligne.accountId,
    date: depuisDateUtc(ligne.date),
    description: ligne.description,
    descriptionNormalisee: ligne.descriptionNormalisee,
    montantCents: ligne.montantCents,
    empreinte: ligne.empreinte,
    externalId: ligne.externalId,
    virement:
      ligne.transferTransactionId === null
        ? null
        : { compteNom: ligne.compteContrepartie?.nom ?? "un autre compte" },
  };
}

/**
 * Les transactions à comparer — docs/lot-m1.md §7 : select, jamais include,
 * bornée au compte ET à la fenêtre du relevé ± 3 jours, jamais à tout le
 * compte. Une correspondance exacte d'empreinte implique la même date, donc
 * tombe forcément dans cette fenêtre.
 */
export async function lireTransactionsPourDedoublonnage(
  ownerId: string,
  fenetre: FenetreDedoublonnage,
): Promise<TransactionExistante[]> {
  const lignes = await prisma.transaction.findMany({
    where: {
      ownerId,
      accountId: fenetre.accountId,
      parentId: null,
      date: { gte: versDateUtc(fenetre.du), lte: versDateUtc(fenetre.au) },
    },
    select: SELECTION_EXISTANTE,
    orderBy: [{ date: "asc" }, { id: "asc" }],
    take: LIMITE_BALAYAGE,
  });
  return lignes.map(versTransactionExistante);
}

export interface FenetreVirement {
  readonly accountIdExclu: string;
  readonly du: DateCivile;
  readonly au: DateCivile;
  /** Montants recherchés (les opposés des lignes du relevé, 0 exclu) ; vide → [] sans requête. */
  readonly montantsCents: readonly Cents[];
}

export const SELECTION_CANDIDAT_VIREMENT = {
  id: true,
  accountId: true,
  account: { select: { nom: true } },
  date: true,
  montantCents: true,
  description: true,
  parentId: true,
  estVentilee: true,
  transferTransactionId: true,
  subcategory: { select: { nom: true } },
} as const;

interface LigneCandidatVirementBrute {
  id: string;
  accountId: string;
  account: { nom: string };
  date: Date;
  montantCents: number;
  description: string;
  parentId: string | null;
  estVentilee: boolean;
  transferTransactionId: string | null;
  subcategory: { nom: string } | null;
}

export function versCandidatVirement(ligne: LigneCandidatVirementBrute): CandidatVirement {
  return {
    id: ligne.id,
    accountId: ligne.accountId,
    compteNom: ligne.account.nom,
    date: depuisDateUtc(ligne.date),
    montantCents: ligne.montantCents,
    description: ligne.description,
    parentId: ligne.parentId,
    estVentilee: ligne.estVentilee,
    transferTransactionId: ligne.transferTransactionId,
    sousCategorieNom: ligne.subcategory?.nom ?? null,
  };
}

/**
 * Les côtés de virement possibles d'un relevé — docs/lot-m2.md §4.5 : select minimal, bornée à la fenêtre et aux
 * montants recherchés, jamais à tous les autres comptes. Un côté déjà lié, ventilé ou fille n'est pas un candidat.
 */
export async function lireTransactionsPourVirement(
  ownerId: string,
  fenetre: FenetreVirement,
): Promise<CandidatVirement[]> {
  const montants = [...new Set(fenetre.montantsCents.filter((m) => m !== 0))];
  if (montants.length === 0) {
    return [];
  }
  const lignes = await prisma.transaction.findMany({
    where: {
      ownerId,
      accountId: { not: fenetre.accountIdExclu },
      parentId: null,
      estVentilee: false,
      transferTransactionId: null,
      date: { gte: versDateUtc(fenetre.du), lte: versDateUtc(fenetre.au) },
      montantCents: { in: montants },
    },
    select: SELECTION_CANDIDAT_VIREMENT,
    orderBy: [{ date: "asc" }, { id: "asc" }],
    take: LIMITE_BALAYAGE,
  });
  return lignes.map(versCandidatVirement);
}

/**
 * La couche 1 du dédoublonnage : un externalId connu peut être hors fenêtre
 * (une source révise une ligne ancienne). Liste vide en entrée ⇒ aucune requête.
 */
export async function lireTransactionsParExternalIds(
  ownerId: string,
  accountId: string,
  externalIds: readonly string[],
): Promise<TransactionExistante[]> {
  if (externalIds.length === 0) {
    return [];
  }
  const lignes = await prisma.transaction.findMany({
    where: { ownerId, accountId, parentId: null, externalId: { in: [...externalIds] } },
    select: SELECTION_EXISTANTE,
    orderBy: [{ date: "asc" }, { id: "asc" }],
  });
  return lignes.map(versTransactionExistante);
}
