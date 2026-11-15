// Repository des bénéficiaires — spec M1 tranche 3 §3.2. Mêmes six règles que
// src/server/repositories/tags.ts : ownerId en premier paramètre, select
// jamais include, écriture et appartenance en une seule requête, aucune
// erreur attrapée, aucun message utilisateur, tri explicite. Contient aussi
// le premier SQL brut du projet (candidatsFusion) — Prisma n'apparaît que
// dans ce fichier, y compris pour cette requête (CLAUDE.md §4 et §7).

import type { Prisma } from "@prisma/client";
import { normaliserNom } from "@/domain/ingestion";
import type { BeneficiaireIngestion } from "@/domain/ingestion";
import { prisma } from "@/server/db";

export interface BeneficiaireListe {
  readonly id: string;
  readonly nom: string;
  readonly nomNormalise: string;
  readonly sousCategorieParDefautId: string | null;
  readonly sousCategorieParDefautNom: string | null; // null si aucune
  readonly categorieParDefautNom: string | null; // la catégorie de la sous-catégorie ci-dessus
  readonly autoCategorisation: boolean;
  readonly categorieVerrouillee: boolean;
  readonly nbTransactions: number;
}

/** nomNormalise n'y figure pas : il est dérivé ici, jamais reçu. */
export interface EntreeBeneficiaireRepo {
  readonly nom: string;
  readonly sousCategorieParDefautId: string | null;
  readonly autoCategorisation: boolean;
  readonly categorieVerrouillee: boolean;
}

export interface SourceFusion {
  readonly id: string;
  readonly nom: string;
  readonly nomNormalise: string;
  readonly nbTransactions: number;
}

export interface CandidatFusion {
  readonly id: string;
  readonly nom: string;
  readonly nomNormalise: string;
  readonly similarite: number; // 0 à 1, tel que rendu par pg_trgm
}

export interface PropositionFusion {
  readonly seuil: number; // remonté pour que l'écran puisse l'afficher sans importer le repository
  readonly source: SourceFusion | null;
  readonly candidats: readonly CandidatFusion[];
}

export type ResultatFusion =
  | { readonly statut: "SOURCE_INTROUVABLE" }
  | { readonly statut: "CIBLE_INTROUVABLE" }
  | {
      readonly statut: "FUSIONNE";
      readonly nomSource: string;
      readonly nomCible: string;
      readonly transactionsTransferees: number;
    };

export const SEUIL_SIMILARITE_FUSION = 0.4;
export const LIMITE_CANDIDATS_FUSION = 10;

const SELECTION_LISTE = {
  id: true,
  nom: true,
  nomNormalise: true,
  autoCategorisation: true,
  categorieVerrouillee: true,
  sousCategorieParDefautId: true,
  sousCategorieParDefaut: { select: { nom: true, category: { select: { nom: true } } } },
  _count: { select: { transactions: true } },
} as const;

interface LigneBeneficiaire {
  id: string;
  nom: string;
  nomNormalise: string;
  autoCategorisation: boolean;
  categorieVerrouillee: boolean;
  sousCategorieParDefautId: string | null;
  sousCategorieParDefaut: { nom: string; category: { nom: string } } | null;
  _count: { transactions: number };
}

function versBeneficiaireListe(ligne: LigneBeneficiaire): BeneficiaireListe {
  return {
    id: ligne.id,
    nom: ligne.nom,
    nomNormalise: ligne.nomNormalise,
    sousCategorieParDefautId: ligne.sousCategorieParDefautId,
    sousCategorieParDefautNom: ligne.sousCategorieParDefaut?.nom ?? null,
    categorieParDefautNom: ligne.sousCategorieParDefaut?.category.nom ?? null,
    autoCategorisation: ligne.autoCategorisation,
    categorieVerrouillee: ligne.categorieVerrouillee,
    nbTransactions: ligne._count.transactions,
  };
}

/** nomNormalise est dérivé ici : c'est le seul endroit du projet où Payee.nomNormalise s'écrit. */
function versData(entree: EntreeBeneficiaireRepo) {
  return {
    nom: entree.nom,
    nomNormalise: normaliserNom(entree.nom),
    sousCategorieParDefautId: entree.sousCategorieParDefautId,
    autoCategorisation: entree.autoCategorisation,
    categorieVerrouillee: entree.categorieVerrouillee,
  };
}

/** Un identifiant venu du client ne prouve rien (CLAUDE.md §6.3) : vérifié dans la même transaction que l'écriture. */
async function sousCategorieValide(
  tx: Prisma.TransactionClient,
  ownerId: string,
  sousCategorieParDefautId: string | null,
): Promise<boolean> {
  if (sousCategorieParDefautId === null) {
    return true;
  }
  const sousCategorie = await tx.subcategory.findFirst({
    where: { id: sousCategorieParDefautId, category: { ownerId } },
    select: { id: true },
  });
  return sousCategorie !== null;
}

export async function listerBeneficiaires(ownerId: string): Promise<BeneficiaireListe[]> {
  const lignes = await prisma.payee.findMany({
    where: { ownerId },
    select: SELECTION_LISTE,
    orderBy: { nom: "asc" },
  });
  return lignes.map(versBeneficiaireListe);
}

const SELECTION_INGESTION = {
  id: true,
  nom: true,
  nomNormalise: true,
  sousCategorieParDefautId: true,
  autoCategorisation: true,
  categorieVerrouillee: true,
} as const;

/**
 * Lecture maigre pour l'ingestion — docs/lot-m1.md §6.3 (étape 2) : pas de _count,
 * pas de relation. listerBeneficiaires reste pour l'écran de référentiel, qui
 * ne doit pas porter deux usages.
 */
export async function listerBeneficiairesIngestion(ownerId: string): Promise<BeneficiaireIngestion[]> {
  return prisma.payee.findMany({
    where: { ownerId },
    select: SELECTION_INGESTION,
    orderBy: { nom: "asc" },
  });
}

/** null = la sous-catégorie par défaut choisie n'existe pas ou n'appartient pas au propriétaire. */
export async function creerBeneficiaire(
  ownerId: string,
  entree: EntreeBeneficiaireRepo,
): Promise<BeneficiaireListe | null> {
  return prisma.$transaction(async (tx) => {
    if (!(await sousCategorieValide(tx, ownerId, entree.sousCategorieParDefautId))) {
      return null;
    }
    const ligne = await tx.payee.create({
      data: { ownerId, ...versData(entree) },
      select: SELECTION_LISTE,
    });
    return versBeneficiaireListe(ligne);
  });
}

/** Nombre de lignes touchées ; 0 = inexistant ou pas à moi ; null = sous-catégorie invalide. */
export async function modifierBeneficiaire(
  ownerId: string,
  id: string,
  entree: EntreeBeneficiaireRepo,
): Promise<number | null> {
  return prisma.$transaction(async (tx) => {
    if (!(await sousCategorieValide(tx, ownerId, entree.sousCategorieParDefautId))) {
      return null;
    }
    const resultat = await tx.payee.updateMany({
      where: { id, ownerId },
      data: versData(entree),
    });
    return resultat.count;
  });
}

export async function supprimerBeneficiaire(
  ownerId: string,
  id: string,
): Promise<{ supprimes: number; transactionsDetachees: number }> {
  return prisma.$transaction(async (tx) => {
    const transactionsDetachees = await tx.transaction.count({ where: { payeeId: id, ownerId } });
    const { count: supprimes } = await tx.payee.deleteMany({ where: { id, ownerId } });
    return { supprimes, transactionsDetachees: supprimes > 0 ? transactionsDetachees : 0 };
  });
}

export async function candidatsFusion(ownerId: string, id: string): Promise<PropositionFusion> {
  const source = await prisma.payee.findFirst({
    where: { id, ownerId },
    select: { id: true, nom: true, nomNormalise: true, _count: { select: { transactions: true } } },
  });

  if (source === null) {
    return { seuil: SEUIL_SIMILARITE_FUSION, source: null, candidats: [] };
  }

  const sourceFusion: SourceFusion = {
    id: source.id,
    nom: source.nom,
    nomNormalise: source.nomNormalise,
    nbTransactions: source._count.transactions,
  };

  if (source.nomNormalise === "") {
    // similarity("", x) vaut 0 : la requête ne rendrait rien. L'écart est
    // explicite plutôt que silencieux (règle 6).
    return { seuil: SEUIL_SIMILARITE_FUSION, source: sourceFusion, candidats: [] };
  }

  const lignes = await prisma.$queryRaw<
    { id: string; nom: string; nomNormalise: string; similarite: number }[]
  >`
    SELECT p."id", p."nom", p."nomNormalise",
           public.similarity(p."nomNormalise", ${source.nomNormalise}) AS "similarite"
    FROM "Payee" p
    WHERE p."ownerId" = ${ownerId}
      AND p."id" <> ${id}
      AND public.similarity(p."nomNormalise", ${source.nomNormalise}) >= ${SEUIL_SIMILARITE_FUSION}
    ORDER BY "similarite" DESC, p."nom" ASC
    LIMIT ${LIMITE_CANDIDATS_FUSION}
  `;

  const candidats: CandidatFusion[] = lignes.map((ligne) => ({
    id: ligne.id,
    nom: ligne.nom,
    nomNormalise: ligne.nomNormalise,
    similarite: ligne.similarite,
  }));

  return { seuil: SEUIL_SIMILARITE_FUSION, source: sourceFusion, candidats };
}

/**
 * Résolution du bénéficiaire cible de RENOMMER_BENEFICIAIRE —
 * docs/lot-m1.md §4.6. L'action porte un nom, pas un identifiant : on
 * cherche un Payee de cet ownerId dont le nomNormalise égale
 * normaliserNom(nom) ; @@unique([ownerId, nomNormalise]) garantit qu'il y en
 * a au plus un. Introuvable (ou nom vide une fois normalisé, ce qui
 * correspondrait à n'importe quel Payee sans nom normalisé) ⇒ null : le
 * créneau bénéficiaire n'est pas écrit, aucun Payee n'est créé en effet de
 * bord (règle 6, CLAUDE.md §2).
 */
export async function trouverBeneficiaireParNomNormalise(
  ownerId: string,
  nom: string,
): Promise<{ id: string; nom: string } | null> {
  const nomNormalise = normaliserNom(nom);
  if (nomNormalise === "") {
    return null;
  }
  return prisma.payee.findFirst({
    where: { ownerId, nomNormalise },
    select: { id: true, nom: true },
    orderBy: { nom: "asc" },
  });
}

export async function fusionnerBeneficiaires(
  ownerId: string,
  sourceId: string,
  cibleId: string,
): Promise<ResultatFusion> {
  return prisma.$transaction(async (tx) => {
    const source = await tx.payee.findFirst({ where: { id: sourceId, ownerId }, select: { nom: true } });
    if (source === null) {
      return { statut: "SOURCE_INTROUVABLE" };
    }
    const cible = await tx.payee.findFirst({ where: { id: cibleId, ownerId }, select: { nom: true } });
    if (cible === null) {
      return { statut: "CIBLE_INTROUVABLE" };
    }
    const { count: transactionsTransferees } = await tx.transaction.updateMany({
      where: { payeeId: sourceId, ownerId },
      data: { payeeId: cibleId },
    });
    await tx.payee.deleteMany({ where: { id: sourceId, ownerId } });
    return { statut: "FUSIONNE", nomSource: source.nom, nomCible: cible.nom, transactionsTransferees };
  });
}
