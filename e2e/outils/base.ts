// Lectures de vérification, en lecture seule, hors de l'application : journal d'INDEX.md du 2026-10-02.

import { PrismaClient } from "@prisma/client";
import type { DetailTransaction } from "@/domain/consultation";
import { dateCivileDansFuseau, depuisDateUtc, FUSEAU_APPLICATION, type DateCivile } from "@/domain/dates";
import { refusEcriture, type ContrepartieEligibilite } from "@/domain/edition";
import { aplatirTexte } from "@/domain/ingestion";
import type { Cents } from "@/domain/money";
import { lireUrlE2e } from "./url-e2e";

let client: PrismaClient | null = null;

export function clientE2e(): PrismaClient {
  client ??= new PrismaClient({ datasourceUrl: lireUrlE2e() });
  return client;
}

export async function fermerClientE2e(): Promise<void> {
  if (client !== null) {
    const ouvert = client;
    client = null;
    await ouvert.$disconnect();
  }
}

export async function schemaCourant(): Promise<string> {
  const lignes = await clientE2e().$queryRaw<{ schema: string }[]>`SELECT current_schema() AS "schema"`;
  const premiere = lignes[0];
  if (premiere === undefined) {
    throw new Error("current_schema() n'a rien rendu.");
  }
  return premiere.schema;
}

export async function nbUtilisateurs(): Promise<number> {
  return clientE2e().user.count();
}

export interface TransactionLue {
  readonly id: string;
  readonly date: DateCivile;
  readonly montantCents: Cents;
  readonly description: string;
  readonly descriptionNormalisee: string;
  readonly source: string;
  readonly importBatchId: string | null;
  readonly payeeId: string | null;
  readonly subcategoryId: string | null;
  readonly appliedRuleId: string | null;
}

export interface LotLu {
  readonly id: string;
  readonly source: string;
  readonly nbLignes: number;
  readonly couvreDu: DateCivile | null;
  readonly couvreAu: DateCivile | null;
}

const SELECTION_TRANSACTION = {
  id: true,
  date: true,
  montantCents: true,
  description: true,
  descriptionNormalisee: true,
  source: true,
  importBatchId: true,
  payeeId: true,
  subcategoryId: true,
  appliedRuleId: true,
} as const;

interface LigneTransaction {
  readonly id: string;
  readonly date: Date;
  readonly montantCents: number;
  readonly description: string;
  readonly descriptionNormalisee: string;
  readonly source: string;
  readonly importBatchId: string | null;
  readonly payeeId: string | null;
  readonly subcategoryId: string | null;
  readonly appliedRuleId: string | null;
}

function versTransactionLue(ligne: LigneTransaction): TransactionLue {
  return { ...ligne, date: depuisDateUtc(ligne.date) };
}

export async function transactionsDuCompte(nomCompte: string): Promise<readonly TransactionLue[]> {
  const lignes = await clientE2e().transaction.findMany({
    where: { account: { nom: nomCompte } },
    select: SELECTION_TRANSACTION,
    orderBy: [{ date: "asc" }, { id: "asc" }],
    take: 1000,
  });
  return lignes.map(versTransactionLue);
}

export async function lotsImportDuCompte(nomCompte: string): Promise<readonly LotLu[]> {
  const lots = await clientE2e().importBatch.findMany({
    where: { account: { nom: nomCompte } },
    select: { id: true, source: true, nbLignes: true, couvreDu: true, couvreAu: true },
    orderBy: { id: "asc" },
    take: 100,
  });
  return lots.map((lot) => ({
    id: lot.id,
    source: lot.source,
    nbLignes: lot.nbLignes,
    couvreDu: lot.couvreDu === null ? null : depuisDateUtc(lot.couvreDu),
    couvreAu: lot.couvreAu === null ? null : depuisDateUtc(lot.couvreAu),
  }));
}

export async function nbTransactionsParDescription(description: string): Promise<number> {
  return clientE2e().transaction.count({ where: { description } });
}

export async function idBeneficiaire(nom: string): Promise<string | null> {
  const ligne = await clientE2e().payee.findFirst({ where: { nom }, select: { id: true } });
  return ligne?.id ?? null;
}

export async function idsTransactionsDuBeneficiaire(nom: string): Promise<readonly string[]> {
  const lignes = await clientE2e().transaction.findMany({
    where: { payee: { nom } },
    select: { id: true },
    orderBy: { id: "asc" },
    take: 1000,
  });
  return lignes.map((ligne) => ligne.id);
}

export async function beneficiairesDesTransactions(ids: readonly string[]): Promise<readonly (string | null)[]> {
  const lignes = await clientE2e().transaction.findMany({
    where: { id: { in: [...ids] } },
    select: { payeeId: true },
    take: 1000,
  });
  return lignes.map((ligne) => ligne.payeeId);
}

export async function idRegle(libelle: string): Promise<string | null> {
  const ligne = await clientE2e().rule.findFirst({ where: { libelle }, select: { id: true } });
  return ligne?.id ?? null;
}

export async function transactionsAppliqueesPar(ruleId: string): Promise<readonly TransactionLue[]> {
  const lignes = await clientE2e().transaction.findMany({
    where: { appliedRuleId: ruleId },
    select: SELECTION_TRANSACTION,
    orderBy: { id: "asc" },
    take: 5000,
  });
  return lignes.map(versTransactionLue);
}

export async function idSousCategorie(nom: string): Promise<string> {
  const lignes = await clientE2e().subcategory.findMany({ where: { nom }, select: { id: true }, take: 2 });
  const [premiere, seconde] = lignes;
  if (premiere === undefined || seconde !== undefined) {
    throw new Error(`Sous-catégorie « ${nom} » absente ou ambiguë.`);
  }
  return premiere.id;
}

/** L'id du compte de ce nom ; lève s'il est absent. */
export async function idCompteParNom(nom: string): Promise<string> {
  const compte = await clientE2e().account.findFirst({ where: { nom }, select: { id: true } });
  if (compte === null) {
    throw new Error(`Compte « ${nom} » absent.`);
  }
  return compte.id;
}

export async function etiquetteExisteDansE2e(nom: string): Promise<boolean> {
  return (await clientE2e().tag.count({ where: { nom } })) > 0;
}

/** Lecture qualifiée de public : prouve que le serveur n'écrit pas dans public. */
export async function etiquetteExisteDansPublic(nom: string): Promise<boolean> {
  const lignes = await clientE2e().$queryRaw<{ n: bigint }[]>`SELECT count(*) AS "n" FROM public."Tag" WHERE "nom" = ${nom}`;
  return Number(lignes[0]?.n ?? 0) > 0;
}

// ── consultation des transactions (docs/lot-m2.md §5, §8) : oracles indépendants du repository

async function proprietaireE2e(): Promise<string> {
  const proprietaire = await clientE2e().user.findFirstOrThrow({ orderBy: { createdAt: "asc" }, select: { id: true } });
  return proprietaire.id;
}

/** Lignes de la liste (parentId null) à revoir, toutes dates. */
export async function nbTransactionsARevoir(): Promise<number> {
  return clientE2e().transaction.count({ where: { ownerId: await proprietaireE2e(), parentId: null, aRevoir: true } });
}

export interface LigneOracle {
  readonly id: string;
  readonly date: DateCivile;
  readonly montantCents: Cents;
}

export async function lignesOracle(filtre: {
  readonly compteNom?: string;
  readonly sousCategorieNom?: string;
}): Promise<readonly LigneOracle[]> {
  const lignes = await clientE2e().transaction.findMany({
    where: {
      ownerId: await proprietaireE2e(),
      parentId: null,
      ...(filtre.compteNom === undefined ? {} : { account: { nom: filtre.compteNom } }),
      ...(filtre.sousCategorieNom === undefined
        ? {}
        : {
            OR: [
              { subcategory: { nom: filtre.sousCategorieNom } },
              { lignes: { some: { subcategory: { nom: filtre.sousCategorieNom } } } },
            ],
          }),
    },
    select: { id: true, date: true, montantCents: true },
    take: 5000,
  });
  return lignes.map((ligne) => ({ id: ligne.id, date: depuisDateUtc(ligne.date), montantCents: ligne.montantCents }));
}

/** Oracle indépendant de unaccent : le filtrage se fait en JS, sur le texte aplati. */
export async function compterParTexteAplati(texte: string): Promise<number> {
  const lignes = await clientE2e().transaction.findMany({
    where: { ownerId: await proprietaireE2e(), parentId: null },
    select: {
      description: true,
      typeOperation: true,
      details: true,
      payee: { select: { nom: true } },
      lignes: { select: { details: true } },
    },
    take: 5000,
  });
  const cherche = aplatirTexte(texte);
  return lignes.filter((ligne) =>
    [ligne.description, ligne.typeOperation, ligne.details, ligne.payee?.nom, ...ligne.lignes.map((fille) => fille.details)].some(
      (champ) => champ !== null && champ !== undefined && aplatirTexte(champ).includes(cherche),
    ),
  ).length;
}

/** La plus récente (date, puis id, décroissants). */
export async function premiereTransaction(filtre: {
  readonly description: string;
  readonly estVentilee?: boolean;
}): Promise<string> {
  const ligne = await clientE2e().transaction.findFirstOrThrow({
    where: {
      ownerId: await proprietaireE2e(),
      parentId: null,
      description: filtre.description,
      ...(filtre.estVentilee === undefined ? {} : { estVentilee: filtre.estVentilee }),
    },
    orderBy: [{ date: "desc" }, { id: "desc" }],
    select: { id: true },
  });
  return ligne.id;
}

const SELECTION_FILLE_ORACLE = {
  id: true,
  montantCents: true,
  subcategoryId: true,
  subcategory: { select: { nom: true, category: { select: { nom: true } } } },
  details: true,
  etiquettes: { select: { tag: { select: { id: true, nom: true, couleur: true } } } },
  // Les liens de la fille : une fille liée interdit de remodeler la ventilation (docs/lot-m2.md §4.2).
  occurrence: { select: { id: true } },
  cotisation: { select: { id: true } },
  ajustement: { select: { id: true } },
  _count: { select: { liensObjectif: true } },
} as const;

/** Le détail d'une transaction, lu et assemblé ici : un mapping propre à l'outillage, indépendant du repository. */
export async function detailLu(id: string): Promise<DetailTransaction> {
  const ligne = await clientE2e().transaction.findUniqueOrThrow({
    where: { id },
    select: {
      id: true,
      parentId: true,
      accountId: true,
      account: { select: { nom: true } },
      date: true,
      description: true,
      typeOperation: true,
      montantCents: true,
      payeeId: true,
      payee: { select: { nom: true } },
      subcategoryId: true,
      subcategory: { select: { nom: true, category: { select: { nom: true } } } },
      details: true,
      etiquettes: { select: { tag: { select: { id: true, nom: true, couleur: true } } } },
      aRevoir: true,
      exclureDuBudget: true,
      exclureDesRapports: true,
      source: true,
      etat: true,
      rapprochement: true,
      externalId: true,
      empreinte: true,
      importBatch: { select: { id: true, importeLe: true, libelle: true, couvreDu: true, couvreAu: true } },
      regle: { select: { id: true, libelle: true } },
      estVentilee: true,
      transferTransactionId: true,
      compteContrepartie: { select: { id: true, nom: true } },
      contrepartie: {
        select: {
          id: true,
          date: true,
          montantCents: true,
          description: true,
          source: true,
          ownerId: true,
          account: { select: { id: true, nom: true } },
          cotisation: { select: { id: true } },
          occurrence: { select: { id: true } },
          ajustement: { select: { id: true } },
          _count: { select: { liensObjectif: true } },
        },
      },
      ownerId: true,
      occurrence: {
        select: {
          id: true,
          ruleId: true,
          echeance: true,
          liaison: true,
          lieeLe: true,
          rule: { select: { libelle: true, ownerId: true } },
        },
      },
      cotisation: { select: { id: true } },
      ajustement: { select: { id: true } },
      lignes: { select: SELECTION_FILLE_ORACLE, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: 50 },
      _count: { select: { lignes: true, liensObjectif: true } },
    },
  });

  // `refus` est calculé ici par refusEcriture à partir des faits lus par cette
  // requête, pas recopié du repository.
  const contrepartieEligibilite: ContrepartieEligibilite =
    ligne.transferTransactionId === null
      ? { etat: "AUCUNE" }
      : ligne.contrepartie?.ownerId !== ligne.ownerId
        ? { etat: "INTROUVABLE" }
        : {
            etat: "TROUVEE",
            source: ligne.contrepartie.source,
            porteCotisation: ligne.contrepartie.cotisation !== null,
            estLiee:
              ligne.contrepartie.occurrence !== null ||
              ligne.contrepartie.cotisation !== null ||
              ligne.contrepartie.ajustement !== null ||
              ligne.contrepartie._count.liensObjectif > 0,
          };
  const refus = refusEcriture(
    {
      montantCents: ligne.montantCents,
      source: ligne.source,
      parentId: ligne.parentId,
      estVentilee: ligne.estVentilee,
      transferTransactionId: ligne.transferTransactionId,
      estLiee:
        ligne.occurrence !== null ||
        ligne.cotisation !== null ||
        ligne.ajustement !== null ||
        ligne._count.liensObjectif > 0,
      filleLiee: ligne.lignes.some(
        (fille) =>
          fille.occurrence !== null ||
          fille.cotisation !== null ||
          fille.ajustement !== null ||
          fille._count.liensObjectif > 0,
      ),
      porteCotisation: ligne.cotisation !== null,
    },
    contrepartieEligibilite,
  );

  const etiquettes = (brutes: readonly { tag: { id: string; nom: string; couleur: string | null } }[]) =>
    brutes.map(({ tag }) => tag).sort((a, b) => a.nom.localeCompare(b.nom, "fr-CA"));

  return {
    id: ligne.id,
    parentId: ligne.parentId,
    accountId: ligne.accountId,
    compteNom: ligne.account.nom,
    date: depuisDateUtc(ligne.date),
    description: ligne.description,
    typeOperation: ligne.typeOperation,
    montantCents: ligne.montantCents,
    payeeId: ligne.payeeId,
    beneficiaireNom: ligne.payee?.nom ?? null,
    subcategoryId: ligne.subcategoryId,
    sousCategorieNom: ligne.subcategory?.nom ?? null,
    categorieNom: ligne.subcategory?.category.nom ?? null,
    note: ligne.details,
    etiquettes: etiquettes(ligne.etiquettes),
    aRevoir: ligne.aRevoir,
    exclureDuBudget: ligne.exclureDuBudget,
    exclureDesRapports: ligne.exclureDesRapports,
    source: ligne.source,
    etat: ligne.etat,
    rapprochement: ligne.rapprochement,
    externalId: ligne.externalId,
    empreinte: ligne.empreinte,
    lotImport:
      ligne.importBatch === null
        ? null
        : {
            id: ligne.importBatch.id,
            importeLeDate: dateCivileDansFuseau(ligne.importBatch.importeLe, FUSEAU_APPLICATION),
            libelle: ligne.importBatch.libelle,
            couvreDu: ligne.importBatch.couvreDu === null ? null : depuisDateUtc(ligne.importBatch.couvreDu),
            couvreAu: ligne.importBatch.couvreAu === null ? null : depuisDateUtc(ligne.importBatch.couvreAu),
          },
    regle: ligne.regle,
    estVentilee: ligne.estVentilee,
    contrepartie:
      ligne.transferTransactionId === null
        ? null
        : {
            transactionId: ligne.transferTransactionId,
            compteId: ligne.contrepartie?.account.id ?? ligne.compteContrepartie?.id ?? null,
            compteNom: ligne.contrepartie?.account.nom ?? ligne.compteContrepartie?.nom ?? null,
            date: ligne.contrepartie === null ? null : depuisDateUtc(ligne.contrepartie.date),
            montantCents: ligne.contrepartie?.montantCents ?? null,
            description: ligne.contrepartie?.description ?? null,
          },
    lignesVentilation: ligne.lignes.map((fille) => ({
      id: fille.id,
      montantCents: fille.montantCents,
      subcategoryId: fille.subcategoryId,
      sousCategorieNom: fille.subcategory?.nom ?? null,
      categorieNom: fille.subcategory?.category.nom ?? null,
      note: fille.details,
      etiquettes: etiquettes(fille.etiquettes),
    })),
    nbLignesVentilation: ligne._count.lignes,
    recurrence:
      ligne.occurrence !== null && ligne.occurrence.rule.ownerId === ligne.ownerId && ligne.occurrence.liaison !== null
        ? {
            occurrenceId: ligne.occurrence.id,
            ruleId: ligne.occurrence.ruleId,
            libelle: ligne.occurrence.rule.libelle,
            echeance: depuisDateUtc(ligne.occurrence.echeance),
            liaison: ligne.occurrence.liaison,
            lieeLe:
              ligne.occurrence.lieeLe === null
                ? null
                : dateCivileDansFuseau(ligne.occurrence.lieeLe, FUSEAU_APPLICATION),
          }
        : null,
    refus,
  };
}

// ── écritures dans /transactions (docs/lot-m2.md §6, §8) : lectures d'oracle, jamais d'écriture

export interface TransactionEcrite {
  readonly id: string;
  readonly accountId: string;
  readonly date: DateCivile;
  readonly montantCents: Cents;
  readonly source: string;
  readonly subcategoryId: string | null;
  readonly sousCategorieNom: string | null;
  readonly payeeNom: string | null;
  readonly appliedRuleId: string | null;
  readonly empreinte: string;
  readonly descriptionNormalisee: string;
  readonly details: string | null;
}

/** Propriétaire, description exacte, ligne de la liste (parentId null). */
export async function transactionParDescription(description: string): Promise<TransactionEcrite | null> {
  const ligne = await clientE2e().transaction.findFirst({
    where: { ownerId: await proprietaireE2e(), parentId: null, description },
    select: {
      id: true,
      accountId: true,
      date: true,
      montantCents: true,
      source: true,
      subcategoryId: true,
      subcategory: { select: { nom: true } },
      payee: { select: { nom: true } },
      appliedRuleId: true,
      empreinte: true,
      descriptionNormalisee: true,
      details: true,
    },
  });
  if (ligne === null) {
    return null;
  }
  return {
    id: ligne.id,
    accountId: ligne.accountId,
    date: depuisDateUtc(ligne.date),
    montantCents: ligne.montantCents,
    source: ligne.source,
    subcategoryId: ligne.subcategoryId,
    sousCategorieNom: ligne.subcategory?.nom ?? null,
    payeeNom: ligne.payee?.nom ?? null,
    appliedRuleId: ligne.appliedRuleId,
    empreinte: ligne.empreinte,
    descriptionNormalisee: ligne.descriptionNormalisee,
    details: ligne.details,
  };
}

export async function idEtiquette(nom: string): Promise<string> {
  const ligne = await clientE2e().tag.findFirst({ where: { nom }, select: { id: true } });
  if (ligne === null) {
    throw new Error(`Étiquette « ${nom} » absente.`);
  }
  return ligne.id;
}

export interface FilleLue {
  readonly id: string;
  readonly montantCents: Cents;
  readonly subcategoryId: string | null;
  readonly sousCategorieNom: string | null;
  readonly details: string | null;
  readonly empreinte: string;
}

export interface VentilationLue {
  readonly estVentilee: boolean;
  readonly subcategoryId: string | null;
  readonly appliedRuleId: string | null;
  readonly empreinte: string;
  /** Ordre createdAt, id. */
  readonly filles: readonly FilleLue[];
}

/** L'état d'une transaction et de ses lignes de ventilation, lu en base (docs/lot-m2.md §4.2). */
export async function ventilationLue(id: string): Promise<VentilationLue> {
  const ligne = await clientE2e().transaction.findUniqueOrThrow({
    where: { id },
    select: {
      estVentilee: true,
      subcategoryId: true,
      appliedRuleId: true,
      empreinte: true,
      lignes: {
        select: {
          id: true,
          montantCents: true,
          subcategoryId: true,
          subcategory: { select: { nom: true } },
          details: true,
          empreinte: true,
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        take: 50,
      },
    },
  });
  return {
    estVentilee: ligne.estVentilee,
    subcategoryId: ligne.subcategoryId,
    appliedRuleId: ligne.appliedRuleId,
    empreinte: ligne.empreinte,
    filles: ligne.lignes.map((fille) => ({
      id: fille.id,
      montantCents: fille.montantCents,
      subcategoryId: fille.subcategoryId,
      sousCategorieNom: fille.subcategory?.nom ?? null,
      details: fille.details,
      empreinte: fille.empreinte,
    })),
  };
}

/** L'état d'un côté de virement, lu en base (docs/lot-m2.md §4.4) ; null si la transaction n'existe pas. */
export async function virementLu(id: string): Promise<{
  accountId: string;
  montantCents: number;
  subcategoryId: string | null;
  appliedRuleId: string | null;
  transferTransactionId: string | null;
  transferAccountId: string | null;
} | null> {
  return clientE2e().transaction.findUnique({
    where: { id },
    select: {
      accountId: true,
      montantCents: true,
      subcategoryId: true,
      appliedRuleId: true,
      transferTransactionId: true,
      transferAccountId: true,
    },
  });
}

/** Les actions d'une règle, dans l'ordre. */
export async function actionsRegle(
  ruleId: string,
): Promise<readonly { readonly type: string; readonly subcategoryId: string | null; readonly valeur: string | null }[]> {
  const actions = await clientE2e().ruleAction.findMany({
    where: { ruleId },
    select: { type: true, subcategoryId: true, valeur: true },
    orderBy: { ordre: "asc" },
    take: 50,
  });
  return actions;
}

export interface LigneEtat {
  readonly id: string;
  readonly subcategoryId: string | null;
  readonly appliedRuleId: string | null;
  readonly estVentilee: boolean;
  readonly estVirement: boolean;
}

/** Lignes de la liste du propriétaire ; `etiquetteNom` : étiquette posée sur la ligne elle-même. */
/**
 * Côtés de virement de la liste qui portent eux-mêmes un lien (échéance, cotisation, ajustement, objectif) :
 * une suppression sans choix les range avec les « liées », pas avec les « virements » (docs/lot-m2.md §3.5).
 */
export async function nbCotesVirementLies(): Promise<number> {
  return clientE2e().transaction.count({
    where: {
      ownerId: await proprietaireE2e(),
      parentId: null,
      transferTransactionId: { not: null },
      OR: [
        { occurrence: { isNot: null } },
        { cotisation: { isNot: null } },
        { ajustement: { isNot: null } },
        { liensObjectif: { some: {} } },
      ],
    },
  });
}

export async function lignesListe(filtre: {
  readonly cotesVirement?: true;
  readonly ventilees?: true;
  readonly etiquetteNom?: string;
}): Promise<readonly LigneEtat[]> {
  const lignes = await clientE2e().transaction.findMany({
    where: {
      ownerId: await proprietaireE2e(),
      parentId: null,
      ...(filtre.cotesVirement === undefined ? {} : { transferTransactionId: { not: null } }),
      ...(filtre.ventilees === undefined ? {} : { estVentilee: true }),
      ...(filtre.etiquetteNom === undefined ? {} : { etiquettes: { some: { tag: { nom: filtre.etiquetteNom } } } }),
    },
    select: { id: true, subcategoryId: true, appliedRuleId: true, estVentilee: true, transferTransactionId: true },
    orderBy: { id: "asc" },
    take: 5000,
  });
  return lignes.map((ligne) => ({
    id: ligne.id,
    subcategoryId: ligne.subcategoryId,
    appliedRuleId: ligne.appliedRuleId,
    estVentilee: ligne.estVentilee,
    estVirement: ligne.transferTransactionId !== null,
  }));
}
