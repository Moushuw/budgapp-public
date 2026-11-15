// Vérification réutilisable des invariants 1, 2 et 5 de prisma/coherence.test.ts
// (virements : paires symétriques ; ventilations : somme des filles ; aucune
// transaction catégorisée qui soit un côté de virement ou un parent ventilé),
// dans les définitions de docs/lot-m2.md §4.2 et §4.4.
//
// Outil de test, hors de l'application : il lit la base par Prisma en lecture
// seule, depuis prisma/test/ et non depuis src/ — même statut que
// e2e/outils/base.ts (journal d'INDEX.md du 2026-10-02).

import type { PrismaClient } from "@prisma/client";

export type PorteeInvariants =
  | { readonly type: "BASE" }
  | { readonly type: "PROPRIETAIRE"; readonly ownerId: string }
  | { readonly type: "TRANSACTIONS"; readonly ids: readonly string[] };

export interface LigneInvariant {
  readonly id: string;
  readonly accountId: string;
  readonly montantCents: number;
  readonly subcategoryId: string | null;
  readonly transferAccountId: string | null;
  readonly transferTransactionId: string | null;
  readonly parentId: string | null;
  readonly estVentilee: boolean;
}

export type NumeroInvariant = 1 | 2 | 5;

export interface EcartInvariant {
  readonly invariant: NumeroInvariant;
  readonly transactionId: string;
  readonly message: string;
}

export interface BilanInvariants {
  /** Triés par invariant, puis transactionId, puis message. */
  readonly ecarts: readonly EcartInvariant[];
  /** Lignes de l'univers dont transferTransactionId n'est pas null. */
  readonly nbCotesVirement: number;
  /** Lignes de l'univers dont estVentilee est vrai. */
  readonly nbParentsVentiles: number;
}

function comparer(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/** Pur : l'univers est `lignes` ; toute référence hors de l'univers est un écart. */
export function bilanInvariants(lignes: readonly LigneInvariant[]): BilanInvariants {
  const parId = new Map(lignes.map((ligne) => [ligne.id, ligne]));
  const fillesParParent = new Map<string, LigneInvariant[]>();
  for (const ligne of lignes) {
    if (ligne.parentId === null) continue;
    const filles = fillesParParent.get(ligne.parentId) ?? [];
    filles.push(ligne);
    fillesParParent.set(ligne.parentId, filles);
  }

  const ecarts: EcartInvariant[] = [];
  const signaler = (invariant: NumeroInvariant, ligne: LigneInvariant, message: string): void => {
    ecarts.push({ invariant, transactionId: ligne.id, message });
  };

  for (const ligne of lignes) {
    // Invariant 1 — virements
    if (ligne.transferTransactionId !== null) {
      const idAutre = ligne.transferTransactionId;
      const autre = parId.get(idAutre);
      if (autre === undefined) {
        signaler(1, ligne, `contrepartie ${idAutre} introuvable`);
      } else {
        if (autre.transferTransactionId !== ligne.id) {
          signaler(1, ligne, `la contrepartie ${idAutre} ne pointe pas vers cette transaction`);
        }
        if (ligne.montantCents + autre.montantCents !== 0) {
          signaler(
            1,
            ligne,
            `montants non opposés : ${ligne.montantCents} + ${autre.montantCents} = ${ligne.montantCents + autre.montantCents}`,
          );
        }
        if (ligne.transferAccountId !== autre.accountId) {
          signaler(
            1,
            ligne,
            `transferAccountId ${String(ligne.transferAccountId)} ≠ compte de la contrepartie ${autre.accountId}`,
          );
        }
        if (ligne.accountId === autre.accountId) {
          signaler(1, ligne, `les deux côtés sont sur le même compte ${ligne.accountId}`);
        }
      }
    } else if (ligne.transferAccountId !== null) {
      signaler(1, ligne, `transferAccountId ${ligne.transferAccountId} sans contrepartie`);
    }

    // Invariant 2 — ventilations
    if (ligne.estVentilee) {
      const filles = fillesParParent.get(ligne.id) ?? [];
      if (filles.length === 0) {
        signaler(2, ligne, "parent ventilé sans ligne fille");
      } else {
        const somme = filles.reduce((total, fille) => total + fille.montantCents, 0);
        if (somme !== ligne.montantCents) {
          signaler(2, ligne, `somme des filles ${somme} ≠ parent ${ligne.montantCents}`);
        }
      }
    }
    if (ligne.parentId !== null) {
      const parent = parId.get(ligne.parentId);
      if (parent === undefined) {
        signaler(2, ligne, `parent ${ligne.parentId} introuvable`);
      } else if (!parent.estVentilee) {
        signaler(2, ligne, `le parent ${ligne.parentId} n'est pas marqué ventilé`);
      }
    }

    // Invariant 5 — aucune catégorie sur un côté de virement ni sur un parent ventilé
    if (ligne.subcategoryId !== null && ligne.transferTransactionId !== null) {
      signaler(5, ligne, "catégorisée alors que côté de virement");
    }
    if (ligne.subcategoryId !== null && ligne.estVentilee) {
      signaler(5, ligne, "catégorisée alors que parent ventilé");
    }
  }

  ecarts.sort(
    (a, b) =>
      a.invariant - b.invariant || comparer(a.transactionId, b.transactionId) || comparer(a.message, b.message),
  );

  return {
    ecarts,
    nbCotesVirement: lignes.filter((ligne) => ligne.transferTransactionId !== null).length,
    nbParentsVentiles: lignes.filter((ligne) => ligne.estVentilee).length,
  };
}

const SELECTION = {
  id: true,
  accountId: true,
  montantCents: true,
  subcategoryId: true,
  transferAccountId: true,
  transferTransactionId: true,
  parentId: true,
  estVentilee: true,
} as const;

const FILTRE_PHASE_1 = [
  { transferTransactionId: { not: null } },
  { transferAccountId: { not: null } },
  { estVentilee: true },
  { parentId: { not: null } },
];

export async function chargerLignesInvariants(
  prisma: PrismaClient,
  portee: PorteeInvariants,
): Promise<LigneInvariant[]> {
  // Une transaction catégorisée qui viole l'invariant 5 est forcément un côté
  // de virement ou un parent ventilé : le filtre de phase 1 la ramène.
  let chargees: LigneInvariant[];
  switch (portee.type) {
    case "BASE":
      chargees = await prisma.transaction.findMany({ where: { OR: FILTRE_PHASE_1 }, select: SELECTION });
      break;
    case "PROPRIETAIRE":
      chargees = await prisma.transaction.findMany({
        where: { ownerId: portee.ownerId, OR: FILTRE_PHASE_1 },
        select: SELECTION,
      });
      break;
    case "TRANSACTIONS":
      chargees =
        portee.ids.length === 0
          ? []
          : await prisma.transaction.findMany({ where: { id: { in: [...portee.ids] } }, select: SELECTION });
      break;
  }

  const parId = new Map(chargees.map((ligne) => [ligne.id, ligne]));
  const ajouter = (lignes: readonly LigneInvariant[]): void => {
    for (const ligne of lignes) parId.set(ligne.id, ligne);
  };

  // Complétion en une passe, un seul niveau (une fille ne se ventile pas,
  // docs/lot-m2.md §3.6) : références, miroirs, filles des parents chargés.
  const referencees = new Set<string>();
  for (const ligne of parId.values()) {
    for (const id of [ligne.transferTransactionId, ligne.parentId]) {
      if (id !== null && !parId.has(id)) referencees.add(id);
    }
  }
  if (referencees.size > 0) {
    ajouter(await prisma.transaction.findMany({ where: { id: { in: [...referencees] } }, select: SELECTION }));
  }

  const idsCharges = [...parId.keys()];
  if (idsCharges.length > 0) {
    ajouter(
      await prisma.transaction.findMany({
        where: { transferTransactionId: { in: idsCharges }, id: { notIn: idsCharges } },
        select: SELECTION,
      }),
    );
  }

  const idsParents = [...parId.values()].filter((ligne) => ligne.estVentilee).map((ligne) => ligne.id);
  if (idsParents.length > 0) {
    ajouter(
      await prisma.transaction.findMany({
        where: { parentId: { in: idsParents }, id: { notIn: [...parId.keys()] } },
        select: SELECTION,
      }),
    );
  }

  return [...parId.values()];
}

/** chargerLignesInvariants puis bilanInvariants. */
export async function verifierInvariants(prisma: PrismaClient, portee: PorteeInvariants): Promise<BilanInvariants> {
  return bilanInvariants(await chargerLignesInvariants(prisma, portee));
}

/** verifierInvariants ; lève `new Error(formaterEcarts(ecarts))` s'il y a au moins un écart, rend le bilan sinon. */
export async function exigerInvariants(prisma: PrismaClient, portee: PorteeInvariants): Promise<BilanInvariants> {
  const bilan = await verifierInvariants(prisma, portee);
  if (bilan.ecarts.length > 0) {
    throw new Error(formaterEcarts(bilan.ecarts));
  }
  return bilan;
}

/** Une ligne par écart : `invariant <n> · <transactionId> · <message>`, jointes par "\n", précédées de `<k> écart(s) aux invariants 1, 2, 5 :`. "" si aucun écart. */
export function formaterEcarts(ecarts: readonly EcartInvariant[]): string {
  if (ecarts.length === 0) return "";
  const lignes = ecarts.map((ecart) => `invariant ${ecart.invariant} · ${ecart.transactionId} · ${ecart.message}`);
  return [`${ecarts.length} écart(s) aux invariants 1, 2, 5 :`, ...lignes].join("\n");
}
