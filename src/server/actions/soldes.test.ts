// Test d'intégration des actions de soldes et de réconciliation — docs/lot-m3.md §3.4, §3.7, §3.8, §5 et §7
// (invariant 5). Schéma `test`, fixture jetable en 2099 (deux comptes hors budget), nettoyée en afterAll.
// Les cas tournent dans l'ordre du fichier : chacun part de l'état laissé par les précédents.

import { randomUUID } from "node:crypto";
import { PrismaClient, type Prisma } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { depuisDateUtc, versDateUtc, type DateCivile } from "@/domain/dates";
import { normaliserDescription } from "@/domain/ingestion";
import type { SourceIngestion } from "@/domain/referentiel";
import { empreinteAjustement } from "@/domain/solde/empreinte";
import { aujourdhui } from "@/server/periode";
import { exigerInvariants } from "../../../prisma/test/invariants";
import { exigerInvariantsOccurrences } from "../../../prisma/test/invariants-occurrences";
import { listerComptes } from "./accounts";
import {
  creerAjustement,
  expliquerEcart,
  lireDiagnosticAncrage,
  lireFicheCompte,
  saisirSolde,
  supprimerAncrage,
  type AncrageAffiche,
} from "./soldes";
import { MESSAGE_AJUSTEMENT_LIE, MESSAGE_ECART_SAISIE_HORS_LIMITE, MESSAGE_EXPLICATION_ECART_NUL } from "./soldes-messages";
import { supprimerTransaction } from "./transactions";

const prisma = new PrismaClient();

const M = "X" + randomUUID().replace(/-/g, "").slice(0, 9).toUpperCase();
const CUID_INEXISTANT = "clx0000000000000000099999";

let ownerId = "";
let compteA = "";
let compteB = "";
let sousCategorieSysteme = "";
const idsTransactions = new Map<string, string>();
const ancrages = new Map<string, string>();
let n = 0;

function tx(cle: string): string {
  const id = idsTransactions.get(cle);
  if (id === undefined) throw new Error(`transaction absente : ${cle}`);
  return id;
}
function ancre(cle: string): string {
  const id = ancrages.get(cle);
  if (id === undefined) throw new Error(`ancrage absent : ${cle}`);
  return id;
}

async function creerTransaction(
  cle: string,
  accountId: string,
  date: DateCivile,
  montantCents: number,
  source: SourceIngestion,
  etat: "COMPTABILISEE" | "EN_ATTENTE",
  description: string,
  extra: Partial<Prisma.TransactionUncheckedCreateInput> = {},
  client: Pick<PrismaClient, "transaction"> = prisma,
): Promise<string> {
  n += 1;
  const creee = await client.transaction.create({
    data: {
      ownerId,
      accountId,
      date: versDateUtc(date),
      description,
      descriptionNormalisee: normaliserDescription(description),
      montantCents,
      source,
      etat,
      empreinte: `soldes-${String(n)}-${M}`,
      ...extra,
    },
    select: { id: true },
  });
  idsTransactions.set(cle, creee.id);
  return creee.id;
}

/** Les invariants 1, 2 et 5 de M2 et les sept invariants d'occurrences (dont le 5 : réconciliation) après un cas qui écrit. */
async function verifierInvariants(): Promise<void> {
  await exigerInvariantsOccurrences(prisma, { type: "COMPTES", ids: [compteA, compteB] });
  const lignes = await prisma.transaction.findMany({
    where: { accountId: { in: [compteA, compteB] } },
    select: { id: true },
    take: 500,
  });
  await exigerInvariants(prisma, { type: "TRANSACTIONS", ids: lignes.map((l) => l.id) });
}

async function saisir(accountId: string, date: DateCivile, montant: string, source: "MANUEL" | "RELEVE", cle?: string) {
  const r = await saisirSolde({ accountId, date, montant, source });
  if (r.ok && cle !== undefined) ancrages.set(cle, r.data.statementId);
  return r;
}

async function fiche(accountId = compteA) {
  const r = await lireFicheCompte({ accountId });
  if (!r.ok) throw new Error(`fiche : ${r.message}`);
  return r.data;
}
async function ancrageAffiche(cle: string, accountId = compteA): Promise<AncrageAffiche> {
  const trouve = (await fiche(accountId)).ancrages.find((a) => a.id === ancre(cle));
  if (trouve === undefined) throw new Error(`ancrage non affiché : ${cle}`);
  return trouve;
}

beforeAll(async () => {
  ownerId = (await prisma.user.findFirstOrThrow({ orderBy: { createdAt: "asc" } })).id;
  sousCategorieSysteme = (
    await prisma.subcategory.findFirstOrThrow({
      where: { systeme: true, nom: "Ajustement de solde", category: { ownerId } },
      orderBy: { id: "asc" },
      select: { id: true },
    })
  ).id;
  compteA = (
    await prisma.account.create({
      data: {
        ownerId,
        nom: `Soldes A ${M}`,
        soldeInitialCents: 100_000,
        dateSoldeInitial: versDateUtc("2099-01-01"),
        estBudgetaire: false,
      },
      select: { id: true },
    })
  ).id;
  compteB = (
    await prisma.account.create({
      data: { ownerId, nom: `Soldes B ${M}`, soldeInitialCents: 0, dateSoldeInitial: versDateUtc("2099-01-01"), estBudgetaire: false },
      select: { id: true },
    })
  ).id;

  await creerTransaction("T0", compteA, "2020-01-15", -1_000, "COPIER_COLLER", "COMPTABILISEE", `PASSEE ${M}`);
  await creerTransaction("T1", compteA, "2099-02-10", -2_000, "COPIER_COLLER", "COMPTABILISEE", `T1 ${M}`);
  // Parent ventilé et filles dans une seule transaction : les lectures BASE des autres fichiers ne voient jamais un parent sans filles.
  await prisma.$transaction(async (client) => {
    const t2 = await creerTransaction(
      "T2",
      compteA,
      "2099-03-05",
      -10_000,
      "COPIER_COLLER",
      "COMPTABILISEE",
      `T2 ${M}`,
      { estVentilee: true },
      client,
    );
    await creerTransaction("F1", compteA, "2099-03-05", -6_000, "COPIER_COLLER", "COMPTABILISEE", `F1 ${M}`, { parentId: t2 }, client);
    await creerTransaction("F2", compteA, "2099-03-05", -4_000, "COPIER_COLLER", "COMPTABILISEE", `F2 ${M}`, { parentId: t2 }, client);
  });
  await creerTransaction("T3", compteA, "2099-03-20", -1_500, "COPIER_COLLER", "EN_ATTENTE", `T3 ${M}`);

  await creerTransaction("B1", compteB, "2099-07-01", -2_000, "COPIER_COLLER", "COMPTABILISEE", `CAFE ${M}`);
  await creerTransaction("B1p", compteB, "2099-07-02", -2_000, "COPIER_COLLER", "COMPTABILISEE", `CAFE ${M}`);
  await creerTransaction("B2", compteB, "2099-08-10", -3_000, "COPIER_COLLER", "COMPTABILISEE", `EPICERIE ${M}`);
  await creerTransaction("B3", compteB, "2099-08-12", -3_000, "COPIER_COLLER", "COMPTABILISEE", `EPICERIE ${M}`);
  await creerTransaction("B4", compteB, "2099-08-14", -450, "MANUELLE", "COMPTABILISEE", `SAISIE ${M}`);
  await creerTransaction("B5", compteB, "2099-08-16", -5_000, "COPIER_COLLER", "EN_ATTENTE", `GARAGE ${M}`);
  await creerTransaction("B6", compteB, "2099-08-25", -1_200, "COPIER_COLLER", "EN_ATTENTE", `DIVERS ${M}`);
  await creerTransaction("B7", compteB, "2099-09-05", -100, "COPIER_COLLER", "COMPTABILISEE", `APRES ${M}`);
});

afterAll(async () => {
  // Une seule transaction : les lectures BASE des autres fichiers ne voient aucun état intermédiaire (parent sans filles, réconciliation sans ancrage).
  await prisma.$transaction(async (client) => {
    const comptes = { in: [compteA, compteB] };
    await client.recurringRule.deleteMany({ where: { accountId: comptes } });
    await client.transaction.deleteMany({ where: { accountId: comptes, parentId: { not: null } } });
    await client.transaction.deleteMany({ where: { accountId: comptes } });
    await client.importBatch.deleteMany({ where: { accountId: comptes } });
    await client.account.deleteMany({ where: { id: comptes } });
  });
  await prisma.$disconnect();
});

describe("actions de soldes — compte A", () => {
  it("S1 — fiche d'un compte sans ancrage : solde d'aujourd'hui, liste vide", async () => {
    const f = await fiche();
    expect(f.soldeAujourdhuiCents).toBe(99_000);
    expect(f.ancrages).toEqual([]);
    expect(f.nbAncrages).toBe(0);
  });

  it("S2 — saisie équilibrée : les lignes filles ne sont pas comptées, aucune réconciliation", async () => {
    const r = await saisir(compteA, "2099-03-31", "855,00", "RELEVE", "A1");
    expect(r).toMatchObject({ ok: true, data: { ecartCents: 0, soldeCalculeCents: 85_500 } });
    expect(await prisma.reconciliation.count({ where: { accountId: compteA } })).toBe(0);
    expect((await ancrageAffiche("A1")).statut).toBe("EQUILIBRE");
    await verifierInvariants();
  });

  it("S3 — même saisie : DUPLICATE avec un message qui le dit, toujours un seul ancrage", async () => {
    const r = await saisir(compteA, "2099-03-31", "855,00", "RELEVE");
    expect(r).toMatchObject({
      ok: false,
      code: "DUPLICATE",
      message:
        "Un solde « Relevé » existe déjà pour ce compte au 31 mars 2099. Supprime-le d'abord, ou choisis une autre date ou une autre source.",
    });
    expect(await prisma.balanceStatement.count({ where: { accountId: compteA } })).toBe(1);
  });

  it("S4 — saisie avec écart : une réconciliation ouverte naît ; un écart nul plus tard n'en crée pas", async () => {
    const r = await saisir(compteA, "2099-03-31", "890,00", "MANUEL", "A2");
    expect(r).toMatchObject({ ok: true, data: { ecartCents: 3_500 } });
    const rec = await prisma.reconciliation.findUniqueOrThrow({ where: { statementId: ancre("A2") } });
    expect(rec.ecartCents).toBe(3_500);
    expect(rec.explication).toBeNull();
    const a2 = await ancrageAffiche("A2");
    expect(a2.statut).toBe("ECART_OUVERT");
    expect(a2.refusAjustement).toBeNull();

    const r3 = await saisir(compteA, "2099-04-30", "855,00", "RELEVE", "A3");
    expect(r3).toMatchObject({ ok: true, data: { ecartCents: 0 } });
    expect(await prisma.reconciliation.count({ where: { statementId: ancre("A3") } })).toBe(0);
    await verifierInvariants();
  });

  it("S5 — l'écart se recalcule après un import ; l'écart constaté à la saisie reste un fait", async () => {
    const lot = await prisma.importBatch.create({
      data: {
        ownerId,
        accountId: compteA,
        source: "COPIER_COLLER",
        nbLignes: 1,
        couvreDu: versDateUtc("2099-03-25"),
        couvreAu: versDateUtc("2099-03-25"),
      },
      select: { id: true },
    });
    const idImport = await creerTransaction("IMP", compteA, "2099-03-25", 3_500, "COPIER_COLLER", "COMPTABILISEE", `IMPORT ${M}`, {
      importBatchId: lot.id,
    });
    const f = await fiche();
    const a2 = f.ancrages.find((a) => a.id === ancre("A2"));
    expect(a2).toMatchObject({ ecartCourantCents: 0, statut: "EQUILIBRE" });
    expect(a2?.reconciliation?.ecartConstateCents).toBe(3_500);
    for (const cle of ["A1", "A3"]) {
      expect(f.ancrages.find((a) => a.id === ancre(cle))).toMatchObject({ ecartCourantCents: -3_500, statut: "ECART_OUVERT" });
    }
    await verifierInvariants();

    await prisma.$transaction([
      prisma.transaction.delete({ where: { id: idImport } }),
      prisma.importBatch.delete({ where: { id: lot.id } }),
    ]);
    idsTransactions.delete("IMP");
    expect((await ancrageAffiche("A2")).ecartCourantCents).toBe(3_500);
  });

  it("S6 — créer un ajustement : une transaction AJUSTEMENT à la date de l'ancrage, qui change les ancrages postérieurs", async () => {
    const r = await creerAjustement({ statementId: ancre("A2") });
    expect(r).toMatchObject({
      ok: true,
      data: { montantCents: 3_500, date: "2099-03-31", sousCategorieCreee: false },
    });
    if (!r.ok) return;
    idsTransactions.set("AJ", r.data.transactionId);
    const t = await prisma.transaction.findUniqueOrThrow({ where: { id: r.data.transactionId } });
    expect(t).toMatchObject({
      source: "AJUSTEMENT",
      description: "Ajustement de solde",
      subcategoryId: sousCategorieSysteme,
      empreinte: empreinteAjustement(ancre("A2")),
      parentId: null,
      etat: "COMPTABILISEE",
      accountId: compteA,
      montantCents: 3_500,
    });
    expect(depuisDateUtc(t.date)).toBe("2099-03-31");
    const rec = await prisma.reconciliation.findUniqueOrThrow({ where: { statementId: ancre("A2") } });
    expect(rec.ajustementTxId).toBe(t.id);
    expect(rec.regleeLe).not.toBeNull();

    const f = await fiche();
    expect(f.ancrages.find((a) => a.id === ancre("A2"))).toMatchObject({
      ecartCourantCents: 0,
      statut: "EQUILIBRE",
      refusAjustement: "AJUSTEMENT_EXISTANT",
    });
    expect(f.ancrages.find((a) => a.id === ancre("A1"))?.ecartCourantCents).toBe(-3_500);
    expect(f.ancrages.find((a) => a.id === ancre("A3"))?.ecartCourantCents).toBe(-3_500);
    expect(f.soldeAujourdhuiCents).toBe(99_000);
    await verifierInvariants();
  });

  it("S7 — un second ajustement sur le même solde : CONFLICT, une seule transaction AJUSTEMENT", async () => {
    expect(await creerAjustement({ statementId: ancre("A2") })).toMatchObject({
      ok: false,
      code: "CONFLICT",
      message: "Ce solde a déjà un ajustement.",
    });
    expect(await prisma.transaction.count({ where: { accountId: compteA, source: "AJUSTEMENT" } })).toBe(1);
  });

  it("S8 — supprimer l'ajustement depuis la consultation est permis ; l'écart redevient ouvert", async () => {
    const r = await supprimerTransaction({ id: tx("AJ"), virement: null });
    expect(r.ok).toBe(true);
    idsTransactions.delete("AJ");
    const rec = await prisma.reconciliation.findUniqueOrThrow({ where: { statementId: ancre("A2") } });
    expect(rec.ajustementTxId).toBeNull();
    const f = await fiche();
    expect(f.ancrages.find((a) => a.id === ancre("A2"))).toMatchObject({ ecartCourantCents: 3_500, statut: "ECART_OUVERT" });
    expect(f.ancrages.find((a) => a.id === ancre("A1"))?.ecartCourantCents).toBe(0);
    expect(f.ancrages.find((a) => a.id === ancre("A3"))?.ecartCourantCents).toBe(0);
    await verifierInvariants();
  });

  it("S9 — expliquer : l'explication est rognée et le statut devient EXPLIQUE", async () => {
    const r = await expliquerEcart({ statementId: ancre("A2"), explication: "  transactions de mars pas encore importées  " });
    expect(r).toMatchObject({ ok: true, data: { reconciliationCreee: false } });
    const rec = await prisma.reconciliation.findUniqueOrThrow({ where: { statementId: ancre("A2") } });
    expect(rec.explication).toBe("transactions de mars pas encore importées");
    expect((await ancrageAffiche("A2")).statut).toBe("EXPLIQUE");
    await verifierInvariants();
  });

  it("S10 — une explication vide : VALIDATION", async () => {
    expect(await expliquerEcart({ statementId: ancre("A2"), explication: "   " })).toMatchObject({
      ok: false,
      code: "VALIDATION",
      message: "Écris l'explication.",
    });
    const rec = await prisma.reconciliation.findUniqueOrThrow({ where: { statementId: ancre("A2") } });
    expect(rec.explication).toBe("transactions de mars pas encore importées");
  });

  it("S11 — expliquer un écart né après la saisie crée la réconciliation à la demande", async () => {
    const r = await saisir(compteA, "2099-05-31", "855,00", "RELEVE", "A4");
    expect(r).toMatchObject({ ok: true, data: { ecartCents: 0 } });
    expect(await prisma.reconciliation.count({ where: { statementId: ancre("A4") } })).toBe(0);
    await creerTransaction("T4", compteA, "2099-05-10", -1_000, "COPIER_COLLER", "COMPTABILISEE", `T4 ${M}`);
    const a4 = await ancrageAffiche("A4");
    expect(a4).toMatchObject({ ecartCourantCents: 1_000, reconciliation: null, statut: "ECART_OUVERT" });

    expect(await expliquerEcart({ statementId: ancre("A4"), explication: "frais" })).toMatchObject({
      ok: true,
      data: { reconciliationCreee: true },
    });
    const rec = await prisma.reconciliation.findUniqueOrThrow({ where: { statementId: ancre("A4") } });
    expect(rec.ecartCents).toBe(1_000);
    expect((await ancrageAffiche("A4")).statut).toBe("EXPLIQUE");
    await verifierInvariants();
  });

  it("S12 — ajuster un écart nul : CONFLICT, rien n'est créé", async () => {
    expect(await saisir(compteA, "2099-06-30", "845,00", "RELEVE", "A5")).toMatchObject({ ok: true, data: { ecartCents: 0 } });
    const avant = await prisma.transaction.count({ where: { accountId: compteA } });
    expect(await creerAjustement({ statementId: ancre("A5") })).toMatchObject({
      ok: false,
      code: "CONFLICT",
      message: "L'écart de ce solde est déjà nul : aucun ajustement à créer.",
    });
    expect(await prisma.reconciliation.count({ where: { statementId: ancre("A5") } })).toBe(0);
    expect(await prisma.transaction.count({ where: { accountId: compteA } })).toBe(avant);
    await verifierInvariants();
  });

  it("S12 bis — expliquer un écart nul sans réconciliation : VALIDATION, aucune réconciliation créée", async () => {
    expect(await expliquerEcart({ statementId: ancre("A5"), explication: "rien" })).toMatchObject({
      ok: false,
      code: "VALIDATION",
      message: MESSAGE_EXPLICATION_ECART_NUL,
    });
    expect(await prisma.reconciliation.count({ where: { statementId: ancre("A5") } })).toBe(0);
    await verifierInvariants();
  });

  it("S13 — supprimer un ancrage emporte sa réconciliation et son ajustement, et le dit", async () => {
    expect(await creerAjustement({ statementId: ancre("A2") })).toMatchObject({ ok: true });
    const ajustement = await prisma.reconciliation.findUniqueOrThrow({
      where: { statementId: ancre("A2") },
      select: { ajustementTxId: true },
    });
    expect(ajustement.ajustementTxId).not.toBeNull();
    const r = await supprimerAncrage({ statementId: ancre("A2") });
    expect(r).toMatchObject({ ok: true, data: { ajustementSupprime: { date: "2099-03-31", montantCents: 3_500 } } });
    expect(await prisma.balanceStatement.count({ where: { id: ancre("A2") } })).toBe(0);
    expect(await prisma.reconciliation.count({ where: { statementId: ancre("A2") } })).toBe(0);
    expect(await prisma.transaction.count({ where: { id: ajustement.ajustementTxId ?? "" } })).toBe(0);
    await verifierInvariants();
  });

  it("S13 bis — supprimer un ancrage sans ajustement ne supprime aucune transaction", async () => {
    const avant = await prisma.transaction.count({ where: { accountId: compteA } });
    const r = await supprimerAncrage({ statementId: ancre("A5") });
    expect(r).toMatchObject({ ok: true, data: { ajustementSupprime: null } });
    expect(await prisma.transaction.count({ where: { accountId: compteA } })).toBe(avant);
    expect(await prisma.balanceStatement.count({ where: { id: ancre("A5") } })).toBe(0);
  });

  it("S14 — un ajustement rattaché à une échéance bloque la suppression de son ancrage (D6)", async () => {
    expect(await saisir(compteA, "2099-07-31", "900,00", "MANUEL", "A6")).toMatchObject({ ok: true, data: { ecartCents: 5_500 } });
    const aj = await creerAjustement({ statementId: ancre("A6") });
    expect(aj).toMatchObject({ ok: true, data: { montantCents: 5_500 } });
    if (!aj.ok) return;
    const regle = await prisma.recurringRule.create({
      data: {
        ownerId,
        accountId: compteA,
        libelle: `Rattache ${M}`,
        nature: "FIXE",
        montantCents: 5_500,
        cadence: "MENSUEL",
        dateAncrage: versDateUtc("2099-07-31"),
        subcategoryId: null,
        motifRapprochement: normaliserDescription(`AJUSTEMENT ${M}`),
        toleranceCents: 500,
        toleranceJours: 3,
        scoreConfiance: 0.9,
        actif: true,
      },
      select: { id: true },
    });
    await prisma.expectedOccurrence.create({
      data: {
        ruleId: regle.id,
        echeance: versDateUtc("2099-07-31"),
        montantCents: 5_500,
        etat: "REALISEE",
        transactionId: aj.data.transactionId,
        liaison: "MANUELLE",
        lieeLe: new Date(),
      },
    });
    try {
      expect(await supprimerAncrage({ statementId: ancre("A6") })).toMatchObject({
        ok: false,
        code: "CONFLICT",
        message: MESSAGE_AJUSTEMENT_LIE,
      });
      expect(await prisma.balanceStatement.count({ where: { id: ancre("A6") } })).toBe(1);
      const rec = await prisma.reconciliation.findUniqueOrThrow({ where: { statementId: ancre("A6") } });
      expect(rec.ajustementTxId).toBe(aj.data.transactionId);
      expect(await prisma.transaction.count({ where: { id: aj.data.transactionId } })).toBe(1);
      await verifierInvariants();
    } finally {
      await prisma.recurringRule.delete({ where: { id: regle.id } });
    }
  });

  it("S15 — un écart qui dépasse l'entier 32 bits : VALIDATION, aucun ancrage créé (D7)", async () => {
    const avant = await prisma.balanceStatement.count({ where: { accountId: compteA } });
    expect(await saisir(compteA, "2099-08-31", "-21 474 836,47", "MANUEL")).toMatchObject({
      ok: false,
      code: "VALIDATION",
      message: MESSAGE_ECART_SAISIE_HORS_LIMITE,
    });
    expect(await prisma.balanceStatement.count({ where: { accountId: compteA } })).toBe(avant);
  });

  it("S16 — un identifiant inexistant : NOT_FOUND avec le bon message", async () => {
    expect(await lireFicheCompte({ accountId: CUID_INEXISTANT })).toMatchObject({
      ok: false,
      code: "NOT_FOUND",
      message: "Ce compte n'existe plus.",
    });
    expect(await saisir(CUID_INEXISTANT, "2099-03-31", "1,00", "RELEVE")).toMatchObject({
      ok: false,
      code: "NOT_FOUND",
      message: "Ce compte n'existe plus.",
    });
    const msg = "Ce solde n'existe plus.";
    expect(await lireDiagnosticAncrage({ statementId: CUID_INEXISTANT })).toMatchObject({ ok: false, code: "NOT_FOUND", message: msg });
    expect(await expliquerEcart({ statementId: CUID_INEXISTANT, explication: "x" })).toMatchObject({
      ok: false,
      code: "NOT_FOUND",
      message: msg,
    });
    expect(await creerAjustement({ statementId: CUID_INEXISTANT })).toMatchObject({ ok: false, code: "NOT_FOUND", message: msg });
    expect(await supprimerAncrage({ statementId: CUID_INEXISTANT })).toMatchObject({ ok: false, code: "NOT_FOUND", message: msg });
  });

  it("S17 — validation des entrées de saisie", async () => {
    expect(await saisir(compteA, "2099-09-30", "", "RELEVE")).toMatchObject({
      ok: false,
      code: "VALIDATION",
      message: "Ce montant est obligatoire.",
    });
    const agregateur = await saisirSolde({ accountId: compteA, date: "2099-09-30", montant: "1,00", source: "AGREGATEUR" as never });
    expect(agregateur).toMatchObject({ ok: false, code: "VALIDATION", message: "Choisis une source." });
    expect(await saisirSolde({ accountId: "x", date: "2099-09-30", montant: "1,00", source: "RELEVE" })).toMatchObject({
      ok: false,
      code: "VALIDATION",
    });
    expect(await prisma.balanceStatement.count({ where: { accountId: compteA, date: versDateUtc("2099-09-30") } })).toBe(0);
  });

  it("S18 — la liste des comptes porte le solde calculé à aujourd'hui", async () => {
    const r = await listerComptes({});
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.find((c) => c.id === compteA)?.soldeCalculeCents).toBe(99_000);
    expect(r.data.find((c) => c.id === compteB)?.soldeCalculeCents).toBe(0);
    expect(r.data.length).toBeGreaterThan(0);
    for (const compte of r.data) {
      expect(compte.soldeAu).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(compte.soldeAu).toBe(aujourdhui());
    }
  });
});

describe("actions de soldes — compte B (diagnostic)", () => {
  it("S19 — diagnostic de l'écart de +50,00 $ : les cinq explications, dans l'ordre, avec leurs pistes", async () => {
    expect(await saisir(compteB, "2099-07-15", "-40,00", "RELEVE", "P")).toMatchObject({ ok: true, data: { ecartCents: 0 } });
    const q = await saisir(compteB, "2099-08-31", "-116,50", "RELEVE", "Q");
    expect(q).toMatchObject({ ok: true, data: { ecartCents: 5_000, soldeCalculeCents: -16_650 } });

    const r = await lireDiagnosticAncrage({ statementId: ancre("Q") });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.ancrage.ecartCourantCents).toBe(5_000);
    expect(r.data.explications.map((e) => e.nature)).toEqual([
      "PERIODE_NON_COUVERTE",
      "EN_ATTENTE",
      "DOUBLON",
      "LIGNE_NON_RECONNUE",
      "MONTANT_ERRONE",
    ]);
    const [periode, attente, doublon, ligne, montant] = r.data.explications;
    expect(periode).toMatchObject({ constat: "RIEN" });
    expect(attente).toMatchObject({ constat: "PISTE", nombre: 2, sommeCents: -6_200 });
    expect(doublon?.nature === "DOUBLON" && doublon.constat).toBe("PISTE");
    if (doublon?.nature === "DOUBLON") {
      expect(doublon.paires).toHaveLength(1);
      const ids = new Set([doublon.paires[0]?.a.id, doublon.paires[0]?.b.id]);
      expect(ids).toEqual(new Set([tx("B2"), tx("B3")]));
    }
    expect(ligne).toMatchObject({ constat: "RAPPEL" });
    expect(montant?.constat).toBe("PISTE");
    if (montant?.nature === "MONTANT_ERRONE") {
      expect(montant.lignes.map((l) => [l.transaction.id, l.motif])).toEqual([
        [tx("B5"), "MONTANT_EGAL_ECART"],
        [tx("B4"), "MANUELLE"],
      ]);
    } else {
      throw new Error("MONTANT_ERRONE attendu");
    }
  });

  it("S20 — diagnostic du premier ancrage : période depuis le début, aucune piste de montant", async () => {
    const r = await lireDiagnosticAncrage({ statementId: ancre("P") });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const [periode, attente, doublon, , montant] = r.data.explications;
    expect(periode).toMatchObject({ constat: "RIEN" });
    expect(attente).toMatchObject({ constat: "RIEN", nombre: 0 });
    expect(doublon?.constat).toBe("PISTE");
    if (doublon?.nature === "DOUBLON") {
      expect(doublon.message).toContain("jusqu'à cet ancrage");
      expect(doublon.paires).toHaveLength(1);
      expect(new Set([doublon.paires[0]?.a.id, doublon.paires[0]?.b.id])).toEqual(new Set([tx("B1"), tx("B1p")]));
    } else {
      throw new Error("DOUBLON attendu");
    }
    expect(montant).toMatchObject({ constat: "RIEN" });
  });
});
