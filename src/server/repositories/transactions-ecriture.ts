// Écritures sur les transactions de l'écran /transactions — docs/lot-m2.md §6.
// Chaque fonction est une seule prisma.$transaction : une écriture à moitié
// appliquée serait pire qu'un échec propre. L'éligibilité (qui peut changer
// quoi) vient de domain/edition ; ce fichier lit les faits, applique la
// décision et écrit.

import { Prisma } from "@prisma/client";
import type { CriteresTransactions } from "@/domain/consultation";
import { depuisDateUtc, versDateUtc, type DateCivile } from "@/domain/dates";
import {
  apercuDepuisPartition,
  compteRenduDepuisPartition,
  contrepartieEligibilite,
  LIMITE_BALAYAGE,
  partitionnerMasse,
  refusDelierVirement,
  refusDeventilation,
  refusLierVirement,
  refusModification,
  refusSuppression,
  refusVentilation,
  type ApercuSuppression,
  type ApercusSuppression,
  type ChoixSuppressionVirement,
  type CompteRenduMasse,
  type ContrepartieEligibilite,
  type FaitsContrepartie,
  type GesteMasse,
  type LigneEligibilite,
  type LigneMasse,
  type MotifRefus,
  type PartitionMasse,
} from "@/domain/edition";
import { calculerEmpreinte, normaliserDescription, normaliserNom } from "@/domain/ingestion";
import type { Cents } from "@/domain/money";
import { type ErreurVentilation, validerVentilation } from "@/domain/ventilation";
import { empreinteLigneFille } from "@/domain/ventilation/empreinte";
import { descriptionContrepartie, peutLier, type CoteVirement, type RefusLiaison } from "@/domain/virement";
import { empreinteContrepartie } from "@/domain/virement/empreinte";
import { prisma } from "@/server/db";
import { CourseVirement, siCourseVirement, type ObjetCourse } from "./course-virement";
import { verrouillerTransactions } from "./verrous";
import { idsSelonCriteres } from "./transactions-lecture";
import { MAX_WAIT_TRANSACTION_MS, TIMEOUT_TRANSACTION_MS } from "./transactions";

export type SelectionResolue =
  | { readonly type: "IDS"; readonly ids: readonly string[] }
  | { readonly type: "CRITERES"; readonly criteres: CriteresTransactions };

export type ReferenceInvalide = "COMPTE" | "SOUS_CATEGORIE" | "BENEFICIAIRE" | "ETIQUETTE" | "BENEFICIAIRE_NOUVEAU_VIDE";

export interface EntreeCreationRepo {
  readonly accountId: string;
  readonly date: DateCivile;
  readonly description: string;
  readonly montantCents: Cents;
  readonly payeeId: string | null;
  readonly payeeNouveauNom: string | null;
  readonly subcategoryId: string | null;
  readonly note: string | null;
  readonly tagIds: readonly string[];
}
export type ResultatCreation =
  | { readonly statut: "REFERENCE_INVALIDE"; readonly quoi: ReferenceInvalide }
  | { readonly statut: "EMPREINTE_EXISTANTE" }
  | { readonly statut: "CREEE"; readonly id: string; readonly beneficiaireCree: boolean };

/** Absent = non touché. */
export interface EntreeModificationRepo {
  readonly description?: string;
  readonly date?: DateCivile;
  readonly montantCents?: Cents;
  readonly beneficiaire?: { readonly payeeId: string | null; readonly payeeNouveauNom: string | null };
  readonly subcategoryId?: string | null;
  readonly note?: string | null;
  readonly tagIds?: readonly string[];
  readonly aRevoir?: boolean;
  readonly exclureDuBudget?: boolean;
  readonly exclureDesRapports?: boolean;
}
export type ResultatModification =
  | { readonly statut: "INTROUVABLE" }
  | { readonly statut: "REFUS"; readonly motif: MotifRefus }
  | { readonly statut: "REFERENCE_INVALIDE"; readonly quoi: Exclude<ReferenceInvalide, "COMPTE"> }
  | { readonly statut: "MODIFIEE"; readonly id: string; readonly beneficiaireCree: boolean };

export type ResultatSuppression =
  | { readonly statut: "INTROUVABLE" }
  | { readonly statut: "REFUS"; readonly motif: MotifRefus }
  | { readonly statut: "CONFLIT"; readonly objet: ObjetCourse }
  | {
      readonly statut: "SUPPRIMEE";
      readonly lignesVentilationSupprimees: number;
      readonly contrepartie: "SUPPRIMEE" | "DELIEE" | null;
    };

export type ResultatMasse =
  | { readonly statut: "DEPASSEMENT" }
  | { readonly statut: "REFERENCE_INVALIDE"; readonly quoi: "SOUS_CATEGORIE" | "BENEFICIAIRE" | "ETIQUETTE" }
  | { readonly statut: "CONFLIT"; readonly objet: ObjetCourse }
  | { readonly statut: "APPLIQUE"; readonly compteRendu: CompteRenduMasse };

export type ResultatApercu =
  | { readonly statut: "DEPASSEMENT" }
  | { readonly statut: "APERCU"; readonly apercus: ApercusSuppression };

// Une ligne fille rattachée à une occurrence, une cotisation ou un objectif partirait en cascade
// avec son parent : refus qui dit pourquoi (docs/lot-m2.md §4.2). Au plus une fille suffit à le savoir.
// Un ajustement de solde n'en fait pas partie (docs/lot-m3.md §5.3 : sa suppression est permise).
const FILLE_LIEE = {
  OR: [
    { occurrence: { isNot: null } },
    { cotisation: { isNot: null } },
    { liensObjectif: { some: {} } },
  ],
} as const satisfies Prisma.TransactionWhereInput;

// Ce que l'éligibilité lit de l'autre côté d'un virement (docs/lot-m2.md §3.5).
const SELECTION_CONTREPARTIE = {
  id: true,
  ownerId: true,
  source: true,
  cotisation: { select: { id: true } },
  occurrence: { select: { id: true } },
  _count: { select: { liensObjectif: true } },
} as const satisfies Prisma.TransactionSelect;

type ContrepartieBrute = Prisma.TransactionGetPayload<{ select: typeof SELECTION_CONTREPARTIE }>;

const SELECTION_ECRITURE = {
  id: true,
  source: true,
  parentId: true,
  estVentilee: true,
  transferTransactionId: true,
  accountId: true,
  date: true,
  montantCents: true,
  description: true,
  descriptionNormalisee: true,
  typeOperation: true,
  empreinte: true,
  subcategoryId: true,
  payeeId: true,
  details: true,
  aRevoir: true,
  exclureDuBudget: true,
  exclureDesRapports: true,
  etiquettes: { select: { tagId: true } },
  contrepartie: { select: SELECTION_CONTREPARTIE },
  occurrence: { select: { id: true } },
  cotisation: { select: { id: true } },
  lignes: { where: FILLE_LIEE, select: { id: true }, take: 1 },
  _count: { select: { lignes: true, liensObjectif: true } },
} as const satisfies Prisma.TransactionSelect;

const SELECTION_MASSE = {
  id: true,
  source: true,
  parentId: true,
  estVentilee: true,
  transferTransactionId: true,
  montantCents: true,
  contrepartie: { select: SELECTION_CONTREPARTIE },
  subcategoryId: true,
  payeeId: true,
  aRevoir: true,
  exclureDuBudget: true,
  exclureDesRapports: true,
  etiquettes: { select: { tagId: true } },
  occurrence: { select: { id: true } },
  cotisation: { select: { id: true } },
  lignes: { where: FILLE_LIEE, select: { id: true }, take: 1 },
  _count: { select: { lignes: true, liensObjectif: true } },
} as const satisfies Prisma.TransactionSelect;

type LigneEcritureBrute = Prisma.TransactionGetPayload<{ select: typeof SELECTION_ECRITURE }>;
type LigneMasseBrute = Prisma.TransactionGetPayload<{ select: typeof SELECTION_MASSE }>;

function versLigneEligibilite(brute: LigneEcritureBrute | LigneMasseBrute): LigneEligibilite {
  return {
    montantCents: brute.montantCents,
    source: brute.source,
    parentId: brute.parentId,
    estVentilee: brute.estVentilee,
    transferTransactionId: brute.transferTransactionId,
    estLiee: brute.occurrence !== null || brute.cotisation !== null || brute._count.liensObjectif > 0,
    filleLiee: brute.lignes.length > 0,
    porteCotisation: brute.cotisation !== null,
  };
}

function faitsContrepartie(contrepartie: ContrepartieBrute | null): FaitsContrepartie | null {
  if (contrepartie === null) {
    return null;
  }
  return {
    ownerId: contrepartie.ownerId,
    source: contrepartie.source,
    porteCotisation: contrepartie.cotisation !== null,
    estLiee:
      contrepartie.occurrence !== null || contrepartie.cotisation !== null || contrepartie._count.liensObjectif > 0,
  };
}

function contrepartieDe(
  brute: { readonly transferTransactionId: string | null; readonly contrepartie: ContrepartieBrute | null },
  ownerId: string,
): ContrepartieEligibilite {
  return contrepartieEligibilite(brute.transferTransactionId, ownerId, faitsContrepartie(brute.contrepartie));
}

function versLigneMasse(brute: LigneMasseBrute, ownerId: string): LigneMasse {
  return {
    ...versLigneEligibilite(brute),
    contrepartie: contrepartieDe(brute, ownerId),
    id: brute.id,
    subcategoryId: brute.subcategoryId,
    payeeId: brute.payeeId,
    tagIds: brute.etiquettes.map((e) => e.tagId),
    aRevoir: brute.aRevoir,
    exclureDuBudget: brute.exclureDuBudget,
    exclureDesRapports: brute.exclureDesRapports,
    nbLignesVentilation: brute._count.lignes,
  };
}

function memeEnsemble(a: readonly string[], b: readonly string[]): boolean {
  const ensembleA = new Set(a);
  const ensembleB = new Set(b);
  return ensembleA.size === ensembleB.size && [...ensembleA].every((id) => ensembleB.has(id));
}

async function sousCategoriePossedee(tx: Prisma.TransactionClient, ownerId: string, id: string): Promise<boolean> {
  const trouvee = await tx.subcategory.findFirst({ where: { id, category: { ownerId } }, select: { id: true } });
  return trouvee !== null;
}

async function beneficiairePossede(tx: Prisma.TransactionClient, ownerId: string, id: string): Promise<boolean> {
  const trouve = await tx.payee.findFirst({ where: { id, ownerId }, select: { id: true } });
  return trouve !== null;
}

async function etiquettesPossedees(
  tx: Prisma.TransactionClient,
  ownerId: string,
  ids: readonly string[],
): Promise<boolean> {
  const distincts = [...new Set(ids)];
  if (distincts.length === 0) {
    return true;
  }
  const trouvees = await tx.tag.findMany({ where: { id: { in: distincts }, ownerId }, select: { id: true } });
  return trouvees.length === distincts.length;
}

/** Réutilise un bénéficiaire de même nom normalisé, sinon le crée (même forme que import-batches.ts). */
async function resoudreBeneficiaireNouveau(
  tx: Prisma.TransactionClient,
  ownerId: string,
  nom: string,
): Promise<{ readonly id: string; readonly cree: boolean }> {
  const nomNormalise = normaliserNom(nom);
  const existant = await tx.payee.findFirst({ where: { ownerId, nomNormalise }, select: { id: true } });
  if (existant !== null) {
    return { id: existant.id, cree: false };
  }
  const cree = await tx.payee.create({ data: { ownerId, nom, nomNormalise }, select: { id: true } });
  return { id: cree.id, cree: true };
}

// ── création

export async function creerTransactionManuelle(ownerId: string, entree: EntreeCreationRepo): Promise<ResultatCreation> {
  return prisma.$transaction(async (tx): Promise<ResultatCreation> => {
    const compte = await tx.account.findFirst({ where: { id: entree.accountId, ownerId }, select: { id: true } });
    if (compte === null) {
      return { statut: "REFERENCE_INVALIDE", quoi: "COMPTE" };
    }
    // Filet : un nom fait seulement d'accents combinants passe trim et se normalise en "".
    if (entree.payeeNouveauNom !== null && normaliserNom(entree.payeeNouveauNom) === "") {
      return { statut: "REFERENCE_INVALIDE", quoi: "BENEFICIAIRE_NOUVEAU_VIDE" };
    }
    if (entree.subcategoryId !== null && !(await sousCategoriePossedee(tx, ownerId, entree.subcategoryId))) {
      return { statut: "REFERENCE_INVALIDE", quoi: "SOUS_CATEGORIE" };
    }
    if (!(await etiquettesPossedees(tx, ownerId, entree.tagIds))) {
      return { statut: "REFERENCE_INVALIDE", quoi: "ETIQUETTE" };
    }
    if (entree.payeeId !== null && !(await beneficiairePossede(tx, ownerId, entree.payeeId))) {
      return { statut: "REFERENCE_INVALIDE", quoi: "BENEFICIAIRE" };
    }

    const descriptionNormalisee = normaliserDescription(entree.description);
    const empreinte = calculerEmpreinte(entree.accountId, entree.date, entree.montantCents, descriptionNormalisee);
    // Avant toute création de bénéficiaire : un refus ne laisse aucun effet de bord.
    const existante = await tx.transaction.findFirst({ where: { empreinte }, select: { id: true } });
    if (existante !== null) {
      return { statut: "EMPREINTE_EXISTANTE" };
    }

    let payeeId = entree.payeeId;
    let beneficiaireCree = false;
    if (entree.payeeNouveauNom !== null) {
      const resolu = await resoudreBeneficiaireNouveau(tx, ownerId, entree.payeeNouveauNom);
      payeeId = resolu.id;
      beneficiaireCree = resolu.cree;
    }

    const creee = await tx.transaction.create({
      data: {
        ownerId,
        accountId: entree.accountId,
        date: versDateUtc(entree.date),
        description: entree.description,
        descriptionNormalisee,
        details: entree.note,
        montantCents: entree.montantCents,
        payeeId,
        subcategoryId: entree.subcategoryId,
        source: "MANUELLE",
        etat: "COMPTABILISEE",
        empreinte,
        appliedRuleId: null,
        typeOperation: null,
      },
      select: { id: true },
    });

    const tagIds = [...new Set(entree.tagIds)];
    if (tagIds.length > 0) {
      await tx.transactionTag.createMany({ data: tagIds.map((tagId) => ({ transactionId: creee.id, tagId })) });
    }
    return { statut: "CREEE", id: creee.id, beneficiaireCree };
  });
}

// ── modification

export async function modifierTransaction(
  ownerId: string,
  id: string,
  entree: EntreeModificationRepo,
): Promise<ResultatModification> {
  return prisma.$transaction(async (tx): Promise<ResultatModification> => {
    const brute = await tx.transaction.findFirst({ where: { id, ownerId }, select: SELECTION_ECRITURE });
    if (brute === null) {
      return { statut: "INTROUVABLE" };
    }

    const tagsActuels = brute.etiquettes.map((e) => e.tagId);
    const date = entree.date !== undefined && entree.date !== depuisDateUtc(brute.date);
    const montant = entree.montantCents !== undefined && entree.montantCents !== brute.montantCents;
    const sousCategorieChangee = entree.subcategoryId !== undefined && entree.subcategoryId !== brute.subcategoryId;
    const sousCategoriePosee = sousCategorieChangee && entree.subcategoryId !== null;
    const descriptionChangee = entree.description !== undefined && entree.description !== brute.description;
    const beneficiaireChange =
      entree.beneficiaire !== undefined &&
      (entree.beneficiaire.payeeNouveauNom !== null || entree.beneficiaire.payeeId !== brute.payeeId);
    const noteChangee = entree.note !== undefined && entree.note !== brute.details;
    const etiquettesChangees = entree.tagIds !== undefined && !memeEnsemble(entree.tagIds, tagsActuels);
    const aRevoirChange = entree.aRevoir !== undefined && entree.aRevoir !== brute.aRevoir;
    const budgetChange = entree.exclureDuBudget !== undefined && entree.exclureDuBudget !== brute.exclureDuBudget;
    const rapportsChange = entree.exclureDesRapports !== undefined && entree.exclureDesRapports !== brute.exclureDesRapports;

    const autres =
      descriptionChangee ||
      beneficiaireChange ||
      noteChangee ||
      etiquettesChangees ||
      aRevoirChange ||
      budgetChange ||
      rapportsChange ||
      (sousCategorieChangee && !sousCategoriePosee);

    const motif = refusModification(versLigneEligibilite(brute), contrepartieDe(brute, ownerId), {
      date,
      montant,
      sousCategoriePosee,
      autres,
    });
    if (motif !== null) {
      return { statut: "REFUS", motif };
    }

    if (sousCategoriePosee && !(await sousCategoriePossedee(tx, ownerId, entree.subcategoryId))) {
      return { statut: "REFERENCE_INVALIDE", quoi: "SOUS_CATEGORIE" };
    }
    if (beneficiaireChange) {
      const { payeeId, payeeNouveauNom } = entree.beneficiaire;
      if (payeeNouveauNom !== null) {
        if (normaliserNom(payeeNouveauNom) === "") {
          return { statut: "REFERENCE_INVALIDE", quoi: "BENEFICIAIRE_NOUVEAU_VIDE" };
        }
      } else if (payeeId !== null && !(await beneficiairePossede(tx, ownerId, payeeId))) {
        return { statut: "REFERENCE_INVALIDE", quoi: "BENEFICIAIRE" };
      }
    }
    if (etiquettesChangees && !(await etiquettesPossedees(tx, ownerId, entree.tagIds))) {
      return { statut: "REFERENCE_INVALIDE", quoi: "ETIQUETTE" };
    }

    const quelqueChose = date || montant || sousCategorieChangee || autres;
    if (!quelqueChose) {
      return { statut: "MODIFIEE", id, beneficiaireCree: false };
    }

    let beneficiaireCree = false;
    let payeeIdFinal: string | null = brute.payeeId;
    if (beneficiaireChange) {
      if (entree.beneficiaire.payeeNouveauNom !== null) {
        const resolu = await resoudreBeneficiaireNouveau(tx, ownerId, entree.beneficiaire.payeeNouveauNom);
        payeeIdFinal = resolu.id;
        beneficiaireCree = resolu.cree;
      } else {
        payeeIdFinal = entree.beneficiaire.payeeId;
      }
    }

    const data: Prisma.TransactionUncheckedUpdateInput = {};
    const heritage: Prisma.TransactionUncheckedUpdateManyInput = {};
    if (descriptionChangee) {
      const descriptionNormalisee = normaliserDescription(entree.description);
      data.description = entree.description;
      data.descriptionNormalisee = descriptionNormalisee;
      heritage.description = entree.description;
      heritage.descriptionNormalisee = descriptionNormalisee;
    }
    if (date) {
      data.date = versDateUtc(entree.date);
      heritage.date = versDateUtc(entree.date);
    }
    if (montant) {
      data.montantCents = entree.montantCents;
    }
    if (beneficiaireChange) {
      data.payeeId = payeeIdFinal;
      heritage.payeeId = payeeIdFinal;
    }
    if (sousCategorieChangee) {
      data.subcategoryId = entree.subcategoryId;
      // Une liaison est un fait stocké : changer la sous-catégorie à la main défait la règle.
      data.appliedRuleId = null;
    }
    if (noteChangee) {
      data.details = entree.note;
    }
    if (aRevoirChange) {
      data.aRevoir = entree.aRevoir;
    }
    if (budgetChange) {
      data.exclureDuBudget = entree.exclureDuBudget;
    }
    if (rapportsChange) {
      data.exclureDesRapports = entree.exclureDesRapports;
    }

    if (Object.keys(data).length > 0) {
      await tx.transaction.update({ where: { id }, data });
    }

    if (montant && brute.transferTransactionId !== null) {
      const oppose = entree.montantCents === 0 ? 0 : -entree.montantCents;
      const ecrite = await tx.transaction.updateMany({
        where: { id: brute.transferTransactionId, ownerId },
        data: { montantCents: oppose },
      });
      if (ecrite.count !== 1) {
        // Course : la contrepartie lue plus haut a disparu. La $transaction est annulée.
        throw new Error("Contrepartie de virement introuvable pendant la modification du montant.");
      }
    }

    if (brute.estVentilee && Object.keys(heritage).length > 0) {
      await tx.transaction.updateMany({ where: { parentId: id, ownerId }, data: heritage });
    }

    if (etiquettesChangees) {
      const tagIds = [...new Set(entree.tagIds)];
      await tx.transactionTag.deleteMany({ where: { transactionId: id, tagId: { notIn: tagIds } } });
      if (tagIds.length > 0) {
        await tx.transactionTag.createMany({
          data: tagIds.map((tagId) => ({ transactionId: id, tagId })),
          skipDuplicates: true,
        });
      }
    }

    return { statut: "MODIFIEE", id, beneficiaireCree };
  });
}

// ── suppression

/**
 * Supprime une transaction. Pour un côté de virement, `choix` dit ce qu'il advient de l'autre côté (docs/lot-m2.md
 * §3.5) : supprimé avec lui, ou délié. Un count inattendu est une course : tout est annulé, `CONFLIT`.
 */
export async function supprimerTransaction(
  ownerId: string,
  id: string,
  choix: ChoixSuppressionVirement | null,
): Promise<ResultatSuppression> {
  return siCourseVirement<ResultatSuppression>(
    () =>
      prisma.$transaction(async (tx): Promise<ResultatSuppression> => {
        const brute = await tx.transaction.findFirst({ where: { id, ownerId }, select: SELECTION_ECRITURE });
        if (brute === null) {
          return { statut: "INTROUVABLE" };
        }
        const contrepartie = contrepartieDe(brute, ownerId);
        const motif = refusSuppression(versLigneEligibilite(brute), contrepartie, choix);
        if (motif !== null) {
          return { statut: "REFUS", motif };
        }

        return ecrireSuppression(
          tx,
          ownerId,
          {
            id,
            transferTransactionId: brute.transferTransactionId,
            contrepartieTrouvee: contrepartie.etat === "TROUVEE",
            lignesVentilation: brute._count.lignes,
          },
          choix,
        );
      }),
    (course) => ({ statut: "CONFLIT", objet: course.objet }),
  );
}

/** Ce que supprimerTransaction a lu, et sur quoi l'écriture se garde. */
export interface SuppressionLue {
  readonly id: string;
  /** transferTransactionId tel que lu ; null = ligne lue ordinaire. */
  readonly transferTransactionId: string | null;
  /** contrepartieDe(...).etat === "TROUVEE". */
  readonly contrepartieTrouvee: boolean;
  /** brute._count.lignes. */
  readonly lignesVentilation: number;
}

/** Exportée pour qu'un test la rejoue avec une lecture périmée : c'est la seule façon de rejouer une course. */
export async function ecrireSuppression(
  tx: Prisma.TransactionClient,
  ownerId: string,
  lue: SuppressionLue,
  choix: ChoixSuppressionVirement | null,
): Promise<ResultatSuppression> {
  const { id } = lue;
  const autre = lue.transferTransactionId;
  // Verrou ordonné : docs/lot-m2.md §4.4 et journal d'INDEX.md 2026-10-06 (pas d'interblocage avec lierVirement).
  await verrouillerTransactions(tx, ownerId, autre === null ? [id] : [id, autre]);
  if (autre === null || !lue.contrepartieTrouvee || choix === null) {
    // Les filles et les étiquettes partent en cascade. Une contrepartie introuvable ne bloque rien. Le pointeur lu
    // garde l'écriture : une ligne liée entre la lecture et ici n'est pas supprimée (docs/lot-m2.md §3.5, invariant 1).
    const { count } = await tx.transaction.deleteMany({
      where: { id, ownerId, transferTransactionId: autre },
    });
    if (count !== 1) {
      throw new CourseVirement("LIGNE");
    }
    return { statut: "SUPPRIMEE", lignesVentilationSupprimees: lue.lignesVentilation, contrepartie: null };
  }

  if (choix === "SUPPRIMER_LES_DEUX") {
    const { count } = await tx.transaction.deleteMany({
      where: { ownerId, OR: [{ id }, { id: autre, transferTransactionId: id }] },
    });
    if (count !== 2) {
      throw new CourseVirement("LIGNE_OU_AUTRE_COTE");
    }
    return { statut: "SUPPRIMEE", lignesVentilationSupprimees: lue.lignesVentilation, contrepartie: "SUPPRIMEE" };
  }

  const { count: deliees } = await tx.transaction.updateMany({
    where: { id: autre, ownerId, transferTransactionId: id },
    data: { transferTransactionId: null, transferAccountId: null },
  });
  if (deliees !== 1) {
    throw new CourseVirement("AUTRE_COTE");
  }
  await tx.transaction.deleteMany({ where: { id, ownerId } });
  return { statut: "SUPPRIMEE", lignesVentilationSupprimees: lue.lignesVentilation, contrepartie: "DELIEE" };
}

// ── virements — docs/lot-m2.md §4.4

const SELECTION_COTE = {
  id: true,
  accountId: true,
  date: true,
  montantCents: true,
  parentId: true,
  estVentilee: true,
  transferTransactionId: true,
  subcategoryId: true,
  account: { select: { nom: true } },
} as const satisfies Prisma.TransactionSelect;

type CoteBrut = Prisma.TransactionGetPayload<{ select: typeof SELECTION_COTE }>;

function versCote(brut: CoteBrut): CoteVirement {
  return {
    id: brut.id,
    accountId: brut.accountId,
    date: depuisDateUtc(brut.date),
    montantCents: brut.montantCents,
    parentId: brut.parentId,
    estVentilee: brut.estVentilee,
    transferTransactionId: brut.transferTransactionId,
  };
}

/** L'écriture gardée d'un côté préexistant : si une seule condition a bougé depuis la lecture, c'est une course. */
async function lierCotePreexistant(
  tx: Prisma.TransactionClient,
  ownerId: string,
  cote: CoteBrut,
  autre: { readonly id: string; readonly accountId: string },
): Promise<void> {
  const { count } = await tx.transaction.updateMany({
    where: {
      id: cote.id,
      ownerId,
      transferTransactionId: null,
      parentId: null,
      estVentilee: false,
      montantCents: cote.montantCents,
    },
    data: {
      transferTransactionId: autre.id,
      transferAccountId: autre.accountId,
      subcategoryId: null,
      appliedRuleId: null,
    },
  });
  if (count !== 1) {
    throw new CourseVirement();
  }
}

export type ResultatLiaison =
  | { readonly statut: "INTROUVABLE" }
  | { readonly statut: "REFUS"; readonly motif: MotifRefus }
  | { readonly statut: "INCOMPATIBLE"; readonly refus: RefusLiaison }
  | { readonly statut: "CONFLIT" }
  | {
      readonly statut: "LIEE";
      readonly id: string;
      readonly contrepartieId: string;
      readonly sousCategoriesRetirees: number;
    };

/** Lie deux transactions existantes : pointeurs croisés, sous-catégories et règles retirées des deux côtés. */
export async function lierVirement(ownerId: string, id: string, contrepartieId: string): Promise<ResultatLiaison> {
  if (id === contrepartieId) {
    return { statut: "INCOMPATIBLE", refus: { motif: "MEME_TRANSACTION" } };
  }
  return siCourseVirement<ResultatLiaison>(
    () =>
      prisma.$transaction(async (tx): Promise<ResultatLiaison> => {
        await verrouillerTransactions(tx, ownerId, [id, contrepartieId]);
        const lues = await tx.transaction.findMany({
          where: { id: { in: [id, contrepartieId] }, ownerId },
          select: SELECTION_COTE,
        });
        const premiere = lues.find((ligne) => ligne.id === id);
        const seconde = lues.find((ligne) => ligne.id === contrepartieId);
        if (premiere === undefined || seconde === undefined) {
          return { statut: "INTROUVABLE" };
        }
        const motif = refusLierVirement(premiere);
        if (motif !== null) {
          return { statut: "REFUS", motif };
        }
        const refus = peutLier(versCote(premiere), versCote(seconde));
        if (refus !== null) {
          return { statut: "INCOMPATIBLE", refus };
        }

        // Ordre croissant des id : deux liaisons concurrentes prennent leurs verrous dans le même ordre.
        const ordonnees = [
          { cote: premiere, autre: seconde },
          { cote: seconde, autre: premiere },
        ].sort((x, y) => (x.cote.id < y.cote.id ? -1 : x.cote.id > y.cote.id ? 1 : 0));
        for (const { cote, autre } of ordonnees) {
          await lierCotePreexistant(tx, ownerId, cote, autre);
        }
        const retirees = [premiere, seconde].filter((cote) => cote.subcategoryId !== null).length;
        return { statut: "LIEE", id, contrepartieId, sousCategoriesRetirees: retirees };
      }),
    () => ({ statut: "CONFLIT" }),
  );
}

export type ResultatDeliaison =
  | { readonly statut: "INTROUVABLE" }
  | { readonly statut: "REFUS"; readonly motif: MotifRefus }
  | { readonly statut: "CONFLIT" }
  | { readonly statut: "DELIEE"; readonly id: string; readonly contrepartieId: string | null };

/** Défait la paire : les deux pointeurs à null. Aucune sous-catégorie n'est restaurée (docs/lot-m2.md §3.4). */
export async function delierVirement(ownerId: string, id: string): Promise<ResultatDeliaison> {
  return siCourseVirement<ResultatDeliaison>(
    () =>
      prisma.$transaction(async (tx): Promise<ResultatDeliaison> => {
        const brute = await tx.transaction.findFirst({ where: { id, ownerId }, select: SELECTION_ECRITURE });
        if (brute === null) {
          return { statut: "INTROUVABLE" };
        }
        const contrepartie = contrepartieDe(brute, ownerId);
        const motif = refusDelierVirement(versLigneEligibilite(brute), contrepartie);
        if (motif !== null) {
          return { statut: "REFUS", motif };
        }
        const autre = brute.transferTransactionId;
        if (autre === null) {
          return { statut: "REFUS", motif: "NON_VIREMENT" };
        }
        // Verrou ordonné : docs/lot-m2.md §4.4 et journal d'INDEX.md 2026-10-06 (pas d'interblocage avec lierVirement).
        await verrouillerTransactions(tx, ownerId, [id, autre]);
        const attendu = contrepartie.etat === "TROUVEE" ? 2 : 1;
        const { count } = await tx.transaction.updateMany({
          where: {
            ownerId,
            OR: [
              { id, transferTransactionId: autre },
              { id: autre, transferTransactionId: id },
            ],
          },
          data: { transferTransactionId: null, transferAccountId: null },
        });
        if (count !== attendu) {
          throw new CourseVirement();
        }
        return { statut: "DELIEE", id, contrepartieId: contrepartie.etat === "TROUVEE" ? autre : null };
      }),
    () => ({ statut: "CONFLIT" }),
  );
}

export type ResultatContrepartie =
  | { readonly statut: "INTROUVABLE" }
  | { readonly statut: "REFUS"; readonly motif: MotifRefus }
  | { readonly statut: "REFERENCE_INVALIDE"; readonly quoi: "COMPTE" }
  | { readonly statut: "INCOMPATIBLE"; readonly refus: RefusLiaison }
  | {
      readonly statut: "CONTREPARTIE_EXISTANTE";
      readonly existante: { readonly id: string; readonly compteNom: string; readonly date: DateCivile };
    }
  | { readonly statut: "CONFLIT" }
  | {
      readonly statut: "CREEE";
      readonly id: string;
      readonly contrepartieId: string;
      readonly sousCategorieRetiree: boolean;
    };

/** Crée l'autre côté d'un virement sur `accountIdDestination` (même date, montant opposé) et lie les deux. */
export async function creerContrepartie(
  ownerId: string,
  id: string,
  accountIdDestination: string,
): Promise<ResultatContrepartie> {
  return siCourseVirement<ResultatContrepartie>(
    () =>
      prisma.$transaction(async (tx): Promise<ResultatContrepartie> => {
        await verrouillerTransactions(tx, ownerId, [id]);
        const source = await tx.transaction.findFirst({ where: { id, ownerId }, select: SELECTION_COTE });
        if (source === null) {
          return { statut: "INTROUVABLE" };
        }
        const motif = refusLierVirement(source);
        if (motif !== null) {
          return { statut: "REFUS", motif };
        }
        const destination = await tx.account.findFirst({
          where: { id: accountIdDestination, ownerId },
          select: { id: true },
        });
        if (destination === null) {
          return { statut: "REFERENCE_INVALIDE", quoi: "COMPTE" };
        }
        const date = depuisDateUtc(source.date);
        const oppose = -source.montantCents;
        const refus = peutLier(versCote(source), {
          id: null,
          accountId: destination.id,
          date,
          montantCents: oppose,
          parentId: null,
          estVentilee: false,
          transferTransactionId: null,
        });
        if (refus !== null) {
          return { statut: "INCOMPATIBLE", refus };
        }

        const empreinte = empreinteContrepartie(source.id);
        const existante = await tx.transaction.findFirst({
          where: { empreinte },
          select: { id: true, date: true, account: { select: { nom: true } } },
        });
        if (existante !== null) {
          return {
            statut: "CONTREPARTIE_EXISTANTE",
            existante: { id: existante.id, compteNom: existante.account.nom, date: depuisDateUtc(existante.date) },
          };
        }

        const description = descriptionContrepartie(oppose, source.account.nom);
        const creee = await tx.transaction.create({
          data: {
            ownerId,
            accountId: destination.id,
            date: source.date,
            description,
            descriptionNormalisee: normaliserDescription(description),
            montantCents: oppose,
            source: "MANUELLE",
            etat: "COMPTABILISEE",
            empreinte,
            payeeId: null,
            subcategoryId: null,
            appliedRuleId: null,
            typeOperation: null,
          },
          select: { id: true },
        });
        await lierCotePreexistant(tx, ownerId, source, { id: creee.id, accountId: destination.id });
        await tx.transaction.update({
          where: { id: creee.id },
          data: { transferTransactionId: source.id, transferAccountId: source.accountId },
        });
        return {
          statut: "CREEE",
          id: source.id,
          contrepartieId: creee.id,
          sousCategorieRetiree: source.subcategoryId !== null,
        };
      }),
    () => ({ statut: "CONFLIT" }),
  );
}

export interface EntreeSaisieVirementRepo {
  readonly accountId: string;
  readonly accountIdDestination: string;
  readonly date: DateCivile;
  readonly description: string;
  /** Celui du compte choisi ; la destination reçoit l'opposé. */
  readonly montantCents: Cents;
  readonly payeeId: string | null;
  readonly payeeNouveauNom: string | null;
  readonly note: string | null;
  readonly tagIds: readonly string[];
}

export type ResultatSaisieVirement =
  | { readonly statut: "REFERENCE_INVALIDE"; readonly quoi: ReferenceInvalide | "COMPTE_DESTINATION" }
  | { readonly statut: "INCOMPATIBLE"; readonly refus: RefusLiaison }
  | { readonly statut: "EMPREINTE_EXISTANTE" }
  | { readonly statut: "CREE"; readonly id: string; readonly contrepartieId: string; readonly beneficiaireCree: boolean };

/** Saisit les deux côtés d'un virement d'un seul geste, déjà liés. */
export async function saisirVirement(ownerId: string, entree: EntreeSaisieVirementRepo): Promise<ResultatSaisieVirement> {
  return prisma.$transaction(async (tx): Promise<ResultatSaisieVirement> => {
    const compte = await tx.account.findFirst({
      where: { id: entree.accountId, ownerId },
      select: { id: true, nom: true },
    });
    if (compte === null) {
      return { statut: "REFERENCE_INVALIDE", quoi: "COMPTE" };
    }
    const destination = await tx.account.findFirst({
      where: { id: entree.accountIdDestination, ownerId },
      select: { id: true },
    });
    if (destination === null) {
      return { statut: "REFERENCE_INVALIDE", quoi: "COMPTE_DESTINATION" };
    }
    const oppose = -entree.montantCents;
    const refus = peutLier(
      {
        id: null,
        accountId: compte.id,
        date: entree.date,
        montantCents: entree.montantCents,
        parentId: null,
        estVentilee: false,
        transferTransactionId: null,
      },
      {
        id: null,
        accountId: destination.id,
        date: entree.date,
        montantCents: oppose,
        parentId: null,
        estVentilee: false,
        transferTransactionId: null,
      },
    );
    if (refus !== null) {
      return { statut: "INCOMPATIBLE", refus };
    }
    if (entree.payeeNouveauNom !== null && normaliserNom(entree.payeeNouveauNom) === "") {
      return { statut: "REFERENCE_INVALIDE", quoi: "BENEFICIAIRE_NOUVEAU_VIDE" };
    }
    if (!(await etiquettesPossedees(tx, ownerId, entree.tagIds))) {
      return { statut: "REFERENCE_INVALIDE", quoi: "ETIQUETTE" };
    }
    if (entree.payeeId !== null && !(await beneficiairePossede(tx, ownerId, entree.payeeId))) {
      return { statut: "REFERENCE_INVALIDE", quoi: "BENEFICIAIRE" };
    }

    const descriptionNormalisee = normaliserDescription(entree.description);
    const empreinte = calculerEmpreinte(entree.accountId, entree.date, entree.montantCents, descriptionNormalisee);
    // Avant toute création de bénéficiaire : un refus ne laisse aucun effet de bord.
    const existante = await tx.transaction.findFirst({ where: { empreinte }, select: { id: true } });
    if (existante !== null) {
      return { statut: "EMPREINTE_EXISTANTE" };
    }

    let payeeId = entree.payeeId;
    let beneficiaireCree = false;
    if (entree.payeeNouveauNom !== null) {
      const resolu = await resoudreBeneficiaireNouveau(tx, ownerId, entree.payeeNouveauNom);
      payeeId = resolu.id;
      beneficiaireCree = resolu.cree;
    }

    const date = versDateUtc(entree.date);
    const cote = await tx.transaction.create({
      data: {
        ownerId,
        accountId: entree.accountId,
        date,
        description: entree.description,
        descriptionNormalisee,
        details: entree.note,
        montantCents: entree.montantCents,
        payeeId,
        subcategoryId: null,
        source: "MANUELLE",
        etat: "COMPTABILISEE",
        empreinte,
        appliedRuleId: null,
        typeOperation: null,
      },
      select: { id: true },
    });
    const tagIds = [...new Set(entree.tagIds)];
    if (tagIds.length > 0) {
      await tx.transactionTag.createMany({ data: tagIds.map((tagId) => ({ transactionId: cote.id, tagId })) });
    }

    const descriptionContre = descriptionContrepartie(oppose, compte.nom);
    const contre = await tx.transaction.create({
      data: {
        ownerId,
        accountId: destination.id,
        date,
        description: descriptionContre,
        descriptionNormalisee: normaliserDescription(descriptionContre),
        montantCents: oppose,
        source: "MANUELLE",
        etat: "COMPTABILISEE",
        empreinte: empreinteContrepartie(cote.id),
        payeeId: null,
        subcategoryId: null,
        appliedRuleId: null,
        typeOperation: null,
        transferTransactionId: cote.id,
        transferAccountId: compte.id,
      },
      select: { id: true },
    });
    await tx.transaction.update({
      where: { id: cote.id },
      data: { transferTransactionId: contre.id, transferAccountId: destination.id },
    });
    return { statut: "CREE", id: cote.id, contrepartieId: contre.id, beneficiaireCree };
  });
}

// ── ventilation — docs/lot-m2.md §4.2

export interface LigneVentilationRepo {
  readonly subcategoryId: string | null;
  readonly montantCents: Cents;
  readonly note: string | null;
  readonly tagIds: readonly string[];
}

export type ResultatVentilation =
  | { readonly statut: "INTROUVABLE" }
  | { readonly statut: "REFUS"; readonly motif: MotifRefus }
  | { readonly statut: "INVALIDE"; readonly erreurs: readonly ErreurVentilation[] }
  | { readonly statut: "REFERENCE_INVALIDE"; readonly quoi: "SOUS_CATEGORIE" | "ETIQUETTE" }
  | { readonly statut: "VENTILEE"; readonly id: string; readonly lignes: number; readonly lignesRemplacees: number };

export type ResultatDeventilation =
  | { readonly statut: "INTROUVABLE" }
  | { readonly statut: "REFUS"; readonly motif: MotifRefus }
  | { readonly statut: "DEVENTILEE"; readonly id: string; readonly lignesSupprimees: number };

/** Ventile une transaction ordinaire, ou remplace l'ensemble des lignes d'un parent déjà ventilé. */
export async function ventilerTransaction(
  ownerId: string,
  id: string,
  lignes: readonly LigneVentilationRepo[],
): Promise<ResultatVentilation> {
  return prisma.$transaction(async (tx): Promise<ResultatVentilation> => {
    const brute = await tx.transaction.findFirst({ where: { id, ownerId }, select: SELECTION_ECRITURE });
    if (brute === null) {
      return { statut: "INTROUVABLE" };
    }
    const motif = refusVentilation(versLigneEligibilite(brute));
    if (motif !== null) {
      return { statut: "REFUS", motif };
    }
    const erreurs = validerVentilation(
      { montantCents: brute.montantCents, estFille: brute.parentId !== null, estVirement: brute.transferTransactionId !== null },
      lignes,
    );
    if (erreurs.length > 0) {
      return { statut: "INVALIDE", erreurs };
    }

    const subcategoryIds = [...new Set(lignes.flatMap((l) => (l.subcategoryId === null ? [] : [l.subcategoryId])))];
    if (subcategoryIds.length > 0) {
      const trouvees = await tx.subcategory.findMany({
        where: { id: { in: subcategoryIds }, category: { ownerId } },
        select: { id: true },
      });
      if (trouvees.length !== subcategoryIds.length) {
        return { statut: "REFERENCE_INVALIDE", quoi: "SOUS_CATEGORIE" };
      }
    }
    if (!(await etiquettesPossedees(tx, ownerId, lignes.flatMap((l) => l.tagIds)))) {
      return { statut: "REFERENCE_INVALIDE", quoi: "ETIQUETTE" };
    }

    // Les étiquettes des anciennes filles partent en cascade ; leurs empreintes de rang sont libérées ici.
    const { count: lignesRemplacees } = await tx.transaction.deleteMany({ where: { parentId: id, ownerId } });
    const ecrite = await tx.transaction.updateMany({
      where: { id, ownerId, parentId: null, transferTransactionId: null },
      data: { estVentilee: true, subcategoryId: null, appliedRuleId: null },
    });
    if (ecrite.count !== 1) {
      // Course : la ligne est devenue une fille ou un côté de virement, ou a disparu, depuis la lecture. La $transaction est annulée.
      throw new Error("Transaction à ventiler modifiée ou supprimée pendant la ventilation.");
    }
    await tx.transaction.createMany({
      data: lignes.map((ligne, i) => ({
        ownerId,
        accountId: brute.accountId,
        date: brute.date,
        description: brute.description,
        descriptionNormalisee: brute.descriptionNormalisee,
        typeOperation: brute.typeOperation,
        payeeId: brute.payeeId,
        source: brute.source,
        montantCents: ligne.montantCents,
        subcategoryId: ligne.subcategoryId,
        details: ligne.note,
        empreinte: empreinteLigneFille(brute.empreinte, i + 1),
        parentId: id,
        etat: "COMPTABILISEE" as const,
        appliedRuleId: null,
        importBatchId: null,
      })),
    });

    if (lignes.some((l) => l.tagIds.length > 0)) {
      const creees = await tx.transaction.findMany({
        where: { parentId: id, ownerId },
        select: { id: true, empreinte: true },
      });
      const idParEmpreinte = new Map(creees.map((fille) => [fille.empreinte, fille.id]));
      const liens = lignes.flatMap((ligne, i) => {
        const filleId = idParEmpreinte.get(empreinteLigneFille(brute.empreinte, i + 1));
        if (filleId === undefined) {
          throw new Error("Ligne de ventilation introuvable après sa création.");
        }
        return [...new Set(ligne.tagIds)].map((tagId) => ({ transactionId: filleId, tagId }));
      });
      await tx.transactionTag.createMany({ data: liens });
    }

    return { statut: "VENTILEE", id, lignes: lignes.length, lignesRemplacees };
  });
}

export async function deventilerTransaction(ownerId: string, id: string): Promise<ResultatDeventilation> {
  return prisma.$transaction(async (tx): Promise<ResultatDeventilation> => {
    const brute = await tx.transaction.findFirst({ where: { id, ownerId }, select: SELECTION_ECRITURE });
    if (brute === null) {
      return { statut: "INTROUVABLE" };
    }
    const motif = refusDeventilation(versLigneEligibilite(brute));
    if (motif !== null) {
      return { statut: "REFUS", motif };
    }
    const { count: lignesSupprimees } = await tx.transaction.deleteMany({ where: { parentId: id, ownerId } });
    const ecrite = await tx.transaction.updateMany({
      where: { id, ownerId, parentId: null, transferTransactionId: null },
      data: { estVentilee: false, subcategoryId: null, appliedRuleId: null },
    });
    if (ecrite.count !== 1) {
      // Course : la ligne a changé de nature ou disparu depuis la lecture. La $transaction est annulée.
      throw new Error("Transaction à déventiler modifiée ou supprimée pendant la déventilation.");
    }
    return { statut: "DEVENTILEE", id, lignesSupprimees };
  });
}

// ── masse

async function identifiantsDeLaSelection(
  tx: Prisma.TransactionClient,
  ownerId: string,
  selection: SelectionResolue,
  limite: number,
): Promise<readonly string[] | null> {
  const ids =
    selection.type === "CRITERES" ? await idsSelonCriteres(tx, ownerId, selection.criteres, limite) : selection.ids;
  return ids.length > limite ? null : ids;
}

async function lignesDeLaSelection(
  tx: Prisma.TransactionClient,
  ownerId: string,
  ids: readonly string[],
  limite: number,
): Promise<LigneMasse[]> {
  const brutes = await tx.transaction.findMany({
    where: { id: { in: [...ids] }, ownerId },
    select: SELECTION_MASSE,
    take: limite,
  });
  return brutes.map((brute) => versLigneMasse(brute, ownerId));
}

async function referenceDuGesteInvalide(
  tx: Prisma.TransactionClient,
  ownerId: string,
  geste: GesteMasse,
): Promise<"SOUS_CATEGORIE" | "BENEFICIAIRE" | "ETIQUETTE" | null> {
  if (geste.type === "SOUS_CATEGORIE") {
    return (await sousCategoriePossedee(tx, ownerId, geste.subcategoryId)) ? null : "SOUS_CATEGORIE";
  }
  if (geste.type === "BENEFICIAIRE") {
    return (await beneficiairePossede(tx, ownerId, geste.payeeId)) ? null : "BENEFICIAIRE";
  }
  if (geste.type === "ETIQUETTES") {
    return (await etiquettesPossedees(tx, ownerId, [...geste.ajouter, ...geste.retirer])) ? null : "ETIQUETTE";
  }
  return null;
}

/** Exportée pour qu'un test l'appelle avec une partition périmée : c'est la seule façon de rejouer une course. */
export async function ecrireGeste(
  tx: Prisma.TransactionClient,
  ownerId: string,
  partition: PartitionMasse,
  geste: GesteMasse,
): Promise<void> {
  const aEcrire = partition.aEcrire;
  if (aEcrire.length === 0) {
    return;
  }
  const cible = { id: { in: [...aEcrire] }, ownerId };
  switch (geste.type) {
    case "SOUS_CATEGORIE":
      await tx.transaction.updateMany({
        where: cible,
        data: { subcategoryId: geste.subcategoryId, appliedRuleId: null },
      });
      return;
    case "BENEFICIAIRE":
      await tx.transaction.updateMany({ where: cible, data: { payeeId: geste.payeeId } });
      // Les lignes filles recopient le bénéficiaire de leur parent (docs/lot-m2.md §4.2).
      await tx.transaction.updateMany({
        where: { parentId: { in: [...aEcrire] }, ownerId },
        data: { payeeId: geste.payeeId },
      });
      return;
    case "ETIQUETTES": {
      if (geste.ajouter.length > 0) {
        await tx.transactionTag.createMany({
          data: aEcrire.flatMap((transactionId) => geste.ajouter.map((tagId) => ({ transactionId, tagId }))),
          skipDuplicates: true,
        });
      }
      if (geste.retirer.length > 0) {
        await tx.transactionTag.deleteMany({
          where: { transactionId: { in: [...aEcrire] }, tagId: { in: [...geste.retirer] } },
        });
      }
      return;
    }
    case "A_REVOIR":
      await tx.transaction.updateMany({ where: cible, data: { aRevoir: geste.valeur } });
      return;
    case "EXCLURE_BUDGET":
      await tx.transaction.updateMany({ where: cible, data: { exclureDuBudget: geste.valeur } });
      return;
    case "EXCLURE_RAPPORTS":
      await tx.transaction.updateMany({ where: cible, data: { exclureDesRapports: geste.valeur } });
      return;
    case "SUPPRIMER": {
      // Verrou ordonné : docs/lot-m2.md §4.4 et journal d'INDEX.md 2026-10-06 (pas d'interblocage avec lierVirement).
      await verrouillerTransactions(tx, ownerId, [...aEcrire, ...partition.contrepartiesAffectees]);
      // Un autre côté n'est touché que s'il pointe encore vers un côté de l'aperçu : sinon, c'est une course.
      const contreparties = [...partition.contrepartiesAffectees];
      // Chaque ligne n'est supprimée que si son pointeur est encore celui qui a été lu, comme l'unitaire : une liaison
      // posée entre-temps échoue, un côté dont la contrepartie est d'un autre propriétaire part (docs/lot-m2.md §3.5,
      // invariant 1).
      const garde = {
        OR: aEcrire.map((id) => ({ id, transferTransactionId: partition.pointeursLus[id] ?? null })),
      };
      if (geste.virements === "DELIER_L_AUTRE" && contreparties.length > 0) {
        // Les autres côtés sont déliés avant que le côté supprimé ne disparaisse (docs/lot-m2.md §6.4).
        const { count } = await tx.transaction.updateMany({
          where: { id: { in: contreparties }, ownerId, transferTransactionId: { in: [...aEcrire] } },
          data: { transferTransactionId: null, transferAccountId: null },
        });
        if (count !== contreparties.length) {
          throw new CourseVirement("AUTRE_COTE");
        }
      }
      // Les filles partent en cascade. SUPPRIMER_LES_DEUX emporte aussi les autres côtés, en une seule requête.
      if (geste.virements === "SUPPRIMER_LES_DEUX" && contreparties.length > 0) {
        const { count } = await tx.transaction.deleteMany({
          where: {
            ownerId,
            OR: [
              garde,
              { id: { in: contreparties }, transferTransactionId: { in: [...aEcrire] } },
            ],
          },
        });
        if (count !== aEcrire.length + contreparties.length) {
          throw new CourseVirement("LIGNE_OU_AUTRE_COTE");
        }
        return;
      }
      const { count } = await tx.transaction.deleteMany({ where: { ownerId, ...garde } });
      if (count !== aEcrire.length) {
        throw new CourseVirement("LIGNE");
      }
      return;
    }
  }
}

export async function modifierEnMasse(
  ownerId: string,
  selection: SelectionResolue,
  geste: GesteMasse,
  limite: number = LIMITE_BALAYAGE,
): Promise<ResultatMasse> {
  return siCourseVirement<ResultatMasse>(
    () =>
      prisma.$transaction(
        async (tx): Promise<ResultatMasse> => {
          const ids = await identifiantsDeLaSelection(tx, ownerId, selection, limite);
          if (ids === null) {
            return { statut: "DEPASSEMENT" };
          }
          const invalide = await referenceDuGesteInvalide(tx, ownerId, geste);
          if (invalide !== null) {
            return { statut: "REFERENCE_INVALIDE", quoi: invalide };
          }
          const lignes = await lignesDeLaSelection(tx, ownerId, ids, limite);
          const partition = partitionnerMasse(ids, lignes, geste);
          await ecrireGeste(tx, ownerId, partition, geste);
          return { statut: "APPLIQUE", compteRendu: compteRenduDepuisPartition(geste, partition) };
        },
        { timeout: TIMEOUT_TRANSACTION_MS, maxWait: MAX_WAIT_TRANSACTION_MS },
      ),
    (course) => ({ statut: "CONFLIT", objet: course.objet }),
  );
}

export async function apercevoirSuppression(
  ownerId: string,
  selection: SelectionResolue,
  limite: number = LIMITE_BALAYAGE,
): Promise<ResultatApercu> {
  const ids = await identifiantsDeLaSelection(prisma, ownerId, selection, limite);
  if (ids === null) {
    return { statut: "DEPASSEMENT" };
  }
  // Une lecture, trois partitions : sans choix, puis pour chacune des deux options.
  const lignes = await lignesDeLaSelection(prisma, ownerId, ids, limite);
  const apercu = (choix: ChoixSuppressionVirement | null): ApercuSuppression =>
    apercuDepuisPartition(partitionnerMasse(ids, lignes, { type: "SUPPRIMER", virements: choix }), choix);
  return {
    statut: "APERCU",
    apercus: { sansChoix: apercu(null), lesDeux: apercu("SUPPRIMER_LES_DEUX"), delier: apercu("DELIER_L_AUTRE") },
  };
}
