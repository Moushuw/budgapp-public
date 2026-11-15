// Vérification réutilisable des invariants 1 à 7 des occurrences attendues et
// des réconciliations, dans les définitions de docs/lot-m3.md §7.
//
// Outil de test, hors de l'application : il lit la base par Prisma en lecture
// seule, depuis prisma/test/ et non depuis src/ — même statut que
// prisma/test/invariants.ts et e2e/outils/base.ts.

import type { PrismaClient } from "@prisma/client";
import { depuisDateUtc, type DateCivile } from "../../src/domain/dates";
import { ecartsMontantsOccurrences } from "../../src/domain/recurrence/coherence-montants";
import type { EtatOccurrence, SourceIngestion, TypeLiaison } from "../../src/domain/referentiel";

export type PorteeInvariantsOccurrences =
  | { readonly type: "BASE" }
  | { readonly type: "PROPRIETAIRE"; readonly ownerId: string }
  | { readonly type: "COMPTES"; readonly ids: readonly string[] } // occurrences des règles dont le compte est dans ids ; réconciliations de ces comptes
  | { readonly type: "REGLES"; readonly ruleIds: readonly string[] }; // invariants 1 à 4, 6 et 7 seulement

export interface LigneOccurrenceInvariant {
  readonly id: string;
  readonly ruleId: string;
  readonly echeance: DateCivile;
  readonly etat: EtatOccurrence;
  readonly liaison: TypeLiaison | null;
  readonly lieeLe: Date | null;
  readonly montantCents: number;
  readonly transactionId: string | null;
  readonly regle: {
    readonly accountId: string;
    readonly ownerId: string;
    readonly dateFin: DateCivile | null;
    readonly montantCents: number | null;
  };
  readonly transaction: { readonly accountId: string; readonly ownerId: string; readonly parentId: string | null } | null;
}

export interface LigneReconciliationInvariant {
  readonly id: string;
  readonly accountId: string;
  readonly ajustementTxId: string | null;
  readonly ancrage: { readonly accountId: string; readonly date: DateCivile };
  readonly ajustement: { readonly accountId: string; readonly source: SourceIngestion; readonly date: DateCivile } | null;
}

export type NumeroInvariantOccurrence = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface EcartInvariantOccurrence {
  readonly invariant: NumeroInvariantOccurrence;
  readonly objetId: string; // id de l'occurrence (1 à 4) ou de la réconciliation (5)
  readonly message: string;
}

export interface BilanInvariantsOccurrences {
  /** Triés par invariant, objetId, message. */
  readonly ecarts: readonly EcartInvariantOccurrence[];
  readonly nbOccurrences: number;
  /** transactionId non nul. */
  readonly nbLiees: number;
  readonly nbReconciliations: number;
}

function comparer(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

export interface OptionsInvariantsOccurrences {
  /** Demande l'invariant 7 ; absent, il n'est pas vérifié. */
  readonly montantsAVenir?: {
    readonly aujourdhui: DateCivile;
    /** Ids des occurrences dont le montant a été fixé à la main (défaut : aucun). */
    readonly montantsFixesALaMain?: readonly string[];
  };
}

export function bilanInvariantsOccurrences(
  occurrences: readonly LigneOccurrenceInvariant[],
  reconciliations: readonly LigneReconciliationInvariant[],
  options?: OptionsInvariantsOccurrences,
): BilanInvariantsOccurrences {
  const ecarts: EcartInvariantOccurrence[] = [];
  const signaler = (invariant: NumeroInvariantOccurrence, objetId: string, message: string): void => {
    ecarts.push({ invariant, objetId, message });
  };

  for (const o of occurrences) {
    // Invariant 1 — l'état dit la vérité sur la liaison
    if (o.etat === "REALISEE" || o.etat === "REALISEE_MONTANT_DIFFERENT") {
      if (o.transactionId === null) signaler(1, o.id, `état ${o.etat} sans transactionId`);
      if (o.liaison === null) signaler(1, o.id, `état ${o.etat} sans liaison`);
      if (o.lieeLe === null) signaler(1, o.id, `état ${o.etat} sans lieeLe`);
    } else {
      if (o.transactionId !== null) signaler(1, o.id, `état ${o.etat} avec transactionId ${o.transactionId}`);
      if (o.liaison !== null) signaler(1, o.id, `état ${o.etat} avec liaison ${o.liaison}`);
      if (o.lieeLe !== null) signaler(1, o.id, `état ${o.etat} avec lieeLe`);
    }

    // Invariant 2 — la transaction liée est du même compte et du même propriétaire que la règle
    if (o.transactionId !== null) {
      if (o.transaction === null) {
        signaler(2, o.id, `transaction liée ${o.transactionId} introuvable`);
      } else {
        if (o.transaction.accountId !== o.regle.accountId) {
          signaler(
            2,
            o.id,
            `transaction ${o.transactionId} sur le compte ${o.transaction.accountId}, règle sur le compte ${o.regle.accountId}`,
          );
        }
        if (o.transaction.ownerId !== o.regle.ownerId) {
          signaler(
            2,
            o.id,
            `transaction ${o.transactionId} du propriétaire ${o.transaction.ownerId}, règle du propriétaire ${o.regle.ownerId}`,
          );
        }
        // Invariant 3 — jamais une ligne fille d'une ventilation
        if (o.transaction.parentId !== null) {
          signaler(3, o.id, `transaction ${o.transactionId} est une ligne fille de ${o.transaction.parentId}`);
        }
      }
    }

    // Invariant 4 — aucune échéance non liée après la dateFin
    if (o.regle.dateFin !== null && o.echeance > o.regle.dateFin && o.transactionId === null) {
      signaler(4, o.id, `échéance ${o.echeance} après la dateFin ${o.regle.dateFin} sans liaison`);
    }
  }

  // Invariants 6 et 7 — le montant d'une occurrence et celui de sa règle
  const aVenir = options?.montantsAVenir;
  const controle =
    aVenir === undefined
      ? null
      : { aujourdhui: aVenir.aujourdhui, montantsFixesALaMain: new Set(aVenir.montantsFixesALaMain ?? []) };
  const ecartsMontants = ecartsMontantsOccurrences(
    occurrences.map((o) => ({
      id: o.id,
      echeance: o.echeance,
      montantCents: o.montantCents,
      etat: o.etat,
      transactionId: o.transactionId,
      montantRegleCents: o.regle.montantCents,
    })),
    controle,
  );
  for (const e of ecartsMontants) {
    signaler(e.nature === "SIGNE" ? 6 : 7, e.occurrenceId, e.message);
  }

  // Invariant 5 — l'ajustement d'une réconciliation est celui de son ancrage
  for (const r of reconciliations) {
    if (r.accountId !== r.ancrage.accountId) {
      signaler(5, r.id, `compte ${r.accountId} ≠ compte de l'ancrage ${r.ancrage.accountId}`);
    }
    if (r.ajustementTxId !== null) {
      if (r.ajustement === null) {
        signaler(5, r.id, `ajustement ${r.ajustementTxId} introuvable`);
      } else {
        if (r.ajustement.source !== "AJUSTEMENT") {
          signaler(5, r.id, `ajustement ${r.ajustementTxId} de source ${r.ajustement.source}`);
        }
        if (r.ajustement.accountId !== r.accountId) {
          signaler(
            5,
            r.id,
            `ajustement ${r.ajustementTxId} sur le compte ${r.ajustement.accountId}, réconciliation sur le compte ${r.accountId}`,
          );
        }
        if (r.ajustement.date !== r.ancrage.date) {
          signaler(
            5,
            r.id,
            `ajustement ${r.ajustementTxId} daté du ${r.ajustement.date}, ancrage du ${r.ancrage.date}`,
          );
        }
      }
    }
  }

  ecarts.sort((a, b) => a.invariant - b.invariant || comparer(a.objetId, b.objetId) || comparer(a.message, b.message));

  return {
    ecarts,
    nbOccurrences: occurrences.length,
    nbLiees: occurrences.filter((o) => o.transactionId !== null).length,
    nbReconciliations: reconciliations.length,
  };
}

export async function chargerLignesInvariantsOccurrences(
  prisma: PrismaClient,
  portee: PorteeInvariantsOccurrences,
): Promise<{ occurrences: LigneOccurrenceInvariant[]; reconciliations: LigneReconciliationInvariant[] }> {
  const selectionOccurrence = {
    id: true,
    ruleId: true,
    echeance: true,
    etat: true,
    liaison: true,
    lieeLe: true,
    montantCents: true,
    transactionId: true,
    rule: { select: { accountId: true, ownerId: true, dateFin: true, montantCents: true } },
    transaction: { select: { accountId: true, ownerId: true, parentId: true } },
  } as const;

  const filtreOccurrences =
    portee.type === "BASE"
      ? {}
      : portee.type === "PROPRIETAIRE"
        ? { rule: { ownerId: portee.ownerId } }
        : portee.type === "COMPTES"
          ? { rule: { accountId: { in: [...portee.ids] } } }
          : { ruleId: { in: [...portee.ruleIds] } };
  const aucuneRegle = portee.type === "REGLES" && portee.ruleIds.length === 0;
  const brutes = aucuneRegle
    ? []
    : await prisma.expectedOccurrence.findMany({ where: filtreOccurrences, select: selectionOccurrence });

  const occurrences: LigneOccurrenceInvariant[] = brutes.map((o) => ({
    id: o.id,
    ruleId: o.ruleId,
    echeance: depuisDateUtc(o.echeance),
    etat: o.etat,
    liaison: o.liaison,
    lieeLe: o.lieeLe,
    montantCents: o.montantCents,
    transactionId: o.transactionId,
    regle: {
      accountId: o.rule.accountId,
      ownerId: o.rule.ownerId,
      dateFin: o.rule.dateFin === null ? null : depuisDateUtc(o.rule.dateFin),
      montantCents: o.rule.montantCents,
    },
    transaction: o.transaction,
  }));

  const selectionReconciliation = {
    id: true,
    accountId: true,
    ajustementTxId: true,
    statement: { select: { accountId: true, date: true } },
    ajustement: { select: { accountId: true, source: true, date: true } },
  } as const;

  const reconciliationsBrutes =
    portee.type === "REGLES"
      ? []
      : await prisma.reconciliation.findMany({
          where:
            portee.type === "BASE"
              ? {}
              : portee.type === "COMPTES"
                ? { accountId: { in: [...portee.ids] } }
                : { account: { ownerId: portee.ownerId } },
          select: selectionReconciliation,
        });

  const reconciliations: LigneReconciliationInvariant[] = reconciliationsBrutes.map((r) => ({
    id: r.id,
    accountId: r.accountId,
    ajustementTxId: r.ajustementTxId,
    ancrage: { accountId: r.statement.accountId, date: depuisDateUtc(r.statement.date) },
    ajustement:
      r.ajustement === null
        ? null
        : { accountId: r.ajustement.accountId, source: r.ajustement.source, date: depuisDateUtc(r.ajustement.date) },
  }));

  return { occurrences, reconciliations };
}

/** chargerLignesInvariantsOccurrences puis bilanInvariantsOccurrences. */
export async function verifierInvariantsOccurrences(
  prisma: PrismaClient,
  portee: PorteeInvariantsOccurrences,
  options?: OptionsInvariantsOccurrences,
): Promise<BilanInvariantsOccurrences> {
  const { occurrences, reconciliations } = await chargerLignesInvariantsOccurrences(prisma, portee);
  return bilanInvariantsOccurrences(occurrences, reconciliations, options);
}

/** verifierInvariantsOccurrences ; lève new Error(formaterEcartsOccurrences(ecarts)) s'il y a un écart. */
export async function exigerInvariantsOccurrences(
  prisma: PrismaClient,
  portee: PorteeInvariantsOccurrences,
  options?: OptionsInvariantsOccurrences,
): Promise<BilanInvariantsOccurrences> {
  const bilan = await verifierInvariantsOccurrences(prisma, portee, options);
  if (bilan.ecarts.length > 0) {
    throw new Error(formaterEcartsOccurrences(bilan.ecarts));
  }
  return bilan;
}

/** "" si aucun écart ; sinon "<k> écart(s) aux invariants des occurrences :" puis une ligne "invariant <n> · <objetId> · <message>" par écart. */
export function formaterEcartsOccurrences(ecarts: readonly EcartInvariantOccurrence[]): string {
  if (ecarts.length === 0) return "";
  const lignes = ecarts.map((e) => `invariant ${e.invariant} · ${e.objetId} · ${e.message}`);
  return [`${ecarts.length} écart(s) aux invariants des occurrences :`, ...lignes].join("\n");
}
