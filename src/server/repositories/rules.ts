// Repository des règles de catégorisation — docs/lot-m1.md §7. Mêmes six
// règles que src/server/repositories/tags.ts et payees.ts : ownerId en
// premier paramètre, select jamais include, écriture et vérification
// d'appartenance dans la même requête ou la même $transaction, aucune erreur
// attrapée, aucun message destiné à l'utilisateur, tri explicite.

import type { Prisma } from "@prisma/client";
import type { ChampCondition, OperateurCondition, RegleCategorisation, TypeAction } from "@/domain/categorization";
import { SEPARATEUR_LISTE } from "@/domain/categorization";
import { lirePartsVentilation } from "@/domain/ventilation";
import { prisma } from "@/server/db";

export interface ConditionListe {
  readonly id: string;
  readonly champ: ChampCondition;
  readonly operateur: OperateurCondition;
  readonly valeur: string;
  readonly valeurFin: string | null;
}

export interface ActionListe {
  readonly id: string;
  readonly type: TypeAction;
  readonly subcategoryId: string | null;
  readonly sousCategorieNom: string | null; // pour l'affichage, jamais pour le moteur
  readonly categorieNom: string | null;
  readonly valeur: string | null;
  readonly ordre: number;
}

export interface RegleListe {
  readonly id: string;
  readonly libelle: string;
  readonly priorite: number;
  readonly actif: boolean;
  readonly conditions: readonly ConditionListe[];
  readonly actions: readonly ActionListe[];
  /** Transactions portant appliedRuleId = cette règle ; ce que sa suppression détacherait (SetNull). */
  readonly nbTransactions: number;
}

export interface EntreeConditionRepo {
  readonly champ: ChampCondition;
  readonly operateur: OperateurCondition;
  readonly valeur: string;
  readonly valeurFin: string | null;
}

export interface EntreeActionRepo {
  readonly type: TypeAction;
  readonly subcategoryId: string | null;
  readonly valeur: string | null;
}

export interface EntreeRegleRepo {
  readonly libelle: string;
  readonly priorite: number;
  readonly actif: boolean;
  readonly conditions: readonly EntreeConditionRepo[];
  readonly actions: readonly EntreeActionRepo[]; // l'ordre du tableau devient RuleAction.ordre
}

const SELECTION_CONDITION = {
  id: true,
  champ: true,
  operateur: true,
  valeur: true,
  valeurFin: true,
} as const;

const SELECTION_ACTION_LISTE = {
  id: true,
  type: true,
  subcategoryId: true,
  valeur: true,
  ordre: true,
  subcategory: { select: { nom: true, category: { select: { nom: true } } } },
} as const;

const SELECTION_LISTE = {
  id: true,
  libelle: true,
  priorite: true,
  actif: true,
  conditions: { select: SELECTION_CONDITION, orderBy: { id: "asc" } },
  actions: { select: SELECTION_ACTION_LISTE, orderBy: { ordre: "asc" } },
  _count: { select: { transactions: true } },
} as const;

const SELECTION_ACTION_MOTEUR = {
  id: true,
  type: true,
  subcategoryId: true,
  valeur: true,
  ordre: true,
} as const;

const SELECTION_MOTEUR = {
  id: true,
  libelle: true,
  priorite: true,
  actif: true,
  conditions: { select: SELECTION_CONDITION, orderBy: { id: "asc" } },
  actions: { select: SELECTION_ACTION_MOTEUR, orderBy: { ordre: "asc" } },
} as const;

interface LigneConditionListe {
  id: string;
  champ: ChampCondition;
  operateur: OperateurCondition;
  valeur: string;
  valeurFin: string | null;
}

interface LigneActionListe {
  id: string;
  type: TypeAction;
  subcategoryId: string | null;
  valeur: string | null;
  ordre: number;
  subcategory: { nom: string; category: { nom: string } } | null;
}

interface LigneRegleListe {
  id: string;
  libelle: string;
  priorite: number;
  actif: boolean;
  conditions: LigneConditionListe[];
  actions: LigneActionListe[];
  _count: { transactions: number };
}

interface LigneActionMoteur {
  id: string;
  type: TypeAction;
  subcategoryId: string | null;
  valeur: string | null;
  ordre: number;
}

interface LigneRegleMoteur {
  id: string;
  libelle: string;
  priorite: number;
  actif: boolean;
  conditions: LigneConditionListe[];
  actions: LigneActionMoteur[];
}

function versConditionListe(ligne: LigneConditionListe): ConditionListe {
  return {
    id: ligne.id,
    champ: ligne.champ,
    operateur: ligne.operateur,
    valeur: ligne.valeur,
    valeurFin: ligne.valeurFin,
  };
}

function versActionListe(ligne: LigneActionListe): ActionListe {
  return {
    id: ligne.id,
    type: ligne.type,
    subcategoryId: ligne.subcategoryId,
    sousCategorieNom: ligne.subcategory?.nom ?? null,
    categorieNom: ligne.subcategory?.category.nom ?? null,
    valeur: ligne.valeur,
    ordre: ligne.ordre,
  };
}

function versRegleListe(ligne: LigneRegleListe): RegleListe {
  return {
    id: ligne.id,
    libelle: ligne.libelle,
    priorite: ligne.priorite,
    actif: ligne.actif,
    conditions: ligne.conditions.map(versConditionListe),
    actions: ligne.actions.map(versActionListe),
    nbTransactions: ligne._count.transactions,
  };
}

function versRegleCategorisation(ligne: LigneRegleMoteur): RegleCategorisation {
  return {
    id: ligne.id,
    libelle: ligne.libelle,
    priorite: ligne.priorite,
    actif: ligne.actif,
    conditions: ligne.conditions.map((condition) => ({
      id: condition.id,
      champ: condition.champ,
      operateur: condition.operateur,
      valeur: condition.valeur,
      valeurFin: condition.valeurFin,
    })),
    actions: ligne.actions.map((action) => ({
      id: action.id,
      type: action.type,
      subcategoryId: action.subcategoryId,
      valeur: action.valeur,
      ordre: action.ordre,
    })),
  };
}

function idsCompteDepuisConditions(conditions: readonly EntreeConditionRepo[]): string[] {
  const ids = new Set<string>();
  for (const condition of conditions) {
    if (condition.champ !== "COMPTE") {
      continue;
    }
    for (const id of condition.valeur.split(SEPARATEUR_LISTE)) {
      const nettoye = id.trim();
      if (nettoye !== "") {
        ids.add(nettoye);
      }
    }
  }
  return [...ids];
}

function estActionCategoriser(action: EntreeActionRepo): action is EntreeActionRepo & { subcategoryId: string } {
  return action.type === "CATEGORISER" && action.subcategoryId !== null;
}

/** Les sous-catégories citées par une action VENTILER lisible (docs/lot-m2.md §4.3) ; rien pour les autres types. */
function idsSousCategoriesVentilees(type: TypeAction, valeur: string | null): string[] {
  if (type !== "VENTILER") {
    return [];
  }
  return (lirePartsVentilation(valeur) ?? []).map((part) => part.subcategoryId);
}

/**
 * Une ventilation de règle est un JSON : supprimer une sous-catégorie qu'il cite laisse un identifiant mort.
 * L'action est alors rendue au moteur avec `valeur: null`, qui déclare la règle inapplicable
 * (VENTILATION_ILLISIBLE) plutôt que de laisser l'import ou la rétroaction échouer (docs/lot-m2.md §4.3).
 * Une seule requête pour toutes les règles chargées.
 */
async function neutraliserVentilationsOrphelines(
  ownerId: string,
  regles: readonly RegleCategorisation[],
): Promise<RegleCategorisation[]> {
  const cites = new Set<string>();
  for (const regle of regles) {
    for (const action of regle.actions) {
      for (const id of idsSousCategoriesVentilees(action.type, action.valeur)) {
        cites.add(id);
      }
    }
  }
  if (cites.size === 0) {
    return [...regles];
  }
  const presentes = new Set(
    (
      await prisma.subcategory.findMany({
        where: { id: { in: [...cites] }, category: { ownerId } },
        select: { id: true },
      })
    ).map((sousCategorie) => sousCategorie.id),
  );
  return regles.map((regle) => ({
    ...regle,
    actions: regle.actions.map((action) =>
      idsSousCategoriesVentilees(action.type, action.valeur).every((id) => presentes.has(id))
        ? action
        : { ...action, valeur: null },
    ),
  }));
}

function estActionEtiqueter(action: EntreeActionRepo): action is EntreeActionRepo & { valeur: string } {
  return action.type === "ETIQUETER" && action.valeur !== null;
}

/**
 * referencesValides — sur le modèle de sousCategorieValide de payees.ts : un
 * seul findMany par type de référence, jamais une boucle de requêtes
 * (CLAUDE.md §7). Un identifiant venu du client ne prouve rien (CLAUDE.md
 * §6.3) : vérifié dans la même transaction que l'écriture.
 */
async function referencesValides(
  tx: Prisma.TransactionClient,
  ownerId: string,
  entree: EntreeRegleRepo,
): Promise<boolean> {
  const subcategoryIds = [
    ...new Set([
      ...entree.actions.filter(estActionCategoriser).map((action) => action.subcategoryId),
      ...entree.actions.flatMap((action) => idsSousCategoriesVentilees(action.type, action.valeur)),
    ]),
  ];
  const tagIds = [...new Set(entree.actions.filter(estActionEtiqueter).map((action) => action.valeur))];
  const accountIds = idsCompteDepuisConditions(entree.conditions);

  if (subcategoryIds.length > 0) {
    const trouvees = await tx.subcategory.findMany({
      where: { id: { in: subcategoryIds }, category: { ownerId } },
      select: { id: true },
    });
    if (trouvees.length !== subcategoryIds.length) {
      return false;
    }
  }

  if (tagIds.length > 0) {
    const trouvees = await tx.tag.findMany({ where: { id: { in: tagIds }, ownerId }, select: { id: true } });
    if (trouvees.length !== tagIds.length) {
      return false;
    }
  }

  if (accountIds.length > 0) {
    const trouvees = await tx.account.findMany({ where: { id: { in: accountIds }, ownerId }, select: { id: true } });
    if (trouvees.length !== accountIds.length) {
      return false;
    }
  }

  return true;
}

export async function listerRegles(ownerId: string): Promise<RegleListe[]> {
  const lignes = await prisma.rule.findMany({
    where: { ownerId },
    select: SELECTION_LISTE,
    orderBy: [{ priorite: "desc" }, { libelle: "asc" }],
  });
  return lignes.map(versRegleListe);
}

/** null = une référence (sous-catégorie, étiquette, compte) n'existe pas ou n'est pas à moi. */
export async function creerRegle(ownerId: string, entree: EntreeRegleRepo): Promise<RegleListe | null> {
  return prisma.$transaction(async (tx) => {
    if (!(await referencesValides(tx, ownerId, entree))) {
      return null;
    }

    const ligne = await tx.rule.create({
      data: {
        ownerId,
        libelle: entree.libelle,
        priorite: entree.priorite,
        actif: entree.actif,
        conditions: {
          createMany: {
            data: entree.conditions.map((condition) => ({
              champ: condition.champ,
              operateur: condition.operateur,
              valeur: condition.valeur,
              valeurFin: condition.valeurFin,
            })),
          },
        },
        actions: {
          createMany: {
            data: entree.actions.map((action, ordre) => ({
              type: action.type,
              subcategoryId: action.subcategoryId,
              valeur: action.valeur,
              ordre,
            })),
          },
        },
      },
      select: SELECTION_LISTE,
    });

    return versRegleListe(ligne);
  });
}

/**
 * Nombre de lignes touchées ; 0 = inexistante ou pas à moi ; null = référence
 * invalide. Remplace conditions et actions en bloc : RuleCondition et
 * RuleAction n'ont pas d'identité métier stable, un diff fin n'apporterait
 * rien et ouvrirait la porte à des lignes orphelines.
 */
export async function modifierRegle(
  ownerId: string,
  id: string,
  entree: EntreeRegleRepo,
): Promise<number | null> {
  return prisma.$transaction(async (tx) => {
    if (!(await referencesValides(tx, ownerId, entree))) {
      return null;
    }

    const { count } = await tx.rule.updateMany({
      where: { id, ownerId },
      data: { libelle: entree.libelle, priorite: entree.priorite, actif: entree.actif },
    });
    if (count === 0) {
      return 0;
    }

    await tx.ruleCondition.deleteMany({ where: { ruleId: id } });
    await tx.ruleAction.deleteMany({ where: { ruleId: id } });

    await tx.ruleCondition.createMany({
      data: entree.conditions.map((condition) => ({
        ruleId: id,
        champ: condition.champ,
        operateur: condition.operateur,
        valeur: condition.valeur,
        valeurFin: condition.valeurFin,
      })),
    });
    await tx.ruleAction.createMany({
      data: entree.actions.map((action, ordre) => ({
        ruleId: id,
        type: action.type,
        subcategoryId: action.subcategoryId,
        valeur: action.valeur,
        ordre,
      })),
    });

    return count;
  });
}

export async function supprimerRegle(
  ownerId: string,
  id: string,
): Promise<{ supprimes: number; transactionsDetachees: number }> {
  return prisma.$transaction(async (tx) => {
    const transactionsDetachees = await tx.transaction.count({ where: { appliedRuleId: id, ownerId } });
    const { count: supprimes } = await tx.rule.deleteMany({ where: { id, ownerId } });
    return { supprimes, transactionsDetachees: supprimes > 0 ? transactionsDetachees : 0 };
  });
}

/** Règles actives, en forme moteur — sert à la tranche 6. Aucun champ d'affichage. */
export async function chargerReglesActives(ownerId: string): Promise<RegleCategorisation[]> {
  const lignes = await prisma.rule.findMany({
    where: { ownerId, actif: true },
    select: SELECTION_MOTEUR,
    orderBy: [{ priorite: "desc" }, { libelle: "asc" }],
  });
  return neutraliserVentilationsOrphelines(ownerId, lignes.map(versRegleCategorisation));
}

/** Une règle, active ou non, en forme moteur. null = inexistante ou pas à moi. */
export async function chargerRegle(ownerId: string, id: string): Promise<RegleCategorisation | null> {
  const ligne = await prisma.rule.findFirst({ where: { id, ownerId }, select: SELECTION_MOTEUR });
  if (ligne === null) {
    return null;
  }
  const [regle] = await neutraliserVentilationsOrphelines(ownerId, [versRegleCategorisation(ligne)]);
  return regle ?? null;
}

/** Noms des sous-catégories du propriétaire, une requête. Absentes = absentes de la Map. */
export async function nomsSousCategories(
  ownerId: string,
  ids: readonly string[],
): Promise<ReadonlyMap<string, string>> {
  if (ids.length === 0) {
    return new Map();
  }
  const lignes = await prisma.subcategory.findMany({
    where: { id: { in: [...ids] }, category: { ownerId } },
    select: { id: true, nom: true },
  });
  return new Map(lignes.map((ligne) => [ligne.id, ligne.nom]));
}

/**
 * Nom d'affichage d'une sous-catégorie et de sa catégorie — sert à
 * l'aperçu d'application rétroactive (docs/lot-m1.md §4.6), qui doit
 * afficher le nom de la sous-catégorie qu'une règle CATEGORISER poserait
 * sans réimporter tout `RegleListe` pour un seul champ. Ajout consigné au
 * journal d'INDEX.md du 2026-09-18.
 */
export async function sousCategorieAffichage(
  ownerId: string,
  id: string,
): Promise<{ nom: string; categorieNom: string } | null> {
  const sousCategorie = await prisma.subcategory.findFirst({
    where: { id, category: { ownerId } },
    select: { nom: true, category: { select: { nom: true } } },
  });
  return sousCategorie === null ? null : { nom: sousCategorie.nom, categorieNom: sousCategorie.category.nom };
}
