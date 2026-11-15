// Test d'intégration de la persistance de l'ingestion (docs/lot-m1.md §9).
// Sur le modèle exact de src/server/actions/rules.test.ts :
// écrit dans la base de test (schéma `test`, seedée à chaque lancement de Vitest),
// nettoyage complet en afterAll, marqueurs uniques par randomUUID, dates en
// 2099 pour ne jamais entrer dans les invariants de prisma/coherence.test.ts
// ni de prisma/seed.test.ts.

import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { entreDansActivite } from "@/domain/budget";
import { ajouterJours, dateCivileDansFuseau, FUSEAU_APPLICATION, versDateUtc } from "@/domain/dates";
import { horizonOccurrences, occurrencesAMaterialiser, occurrencesAPartirDe } from "@/domain/recurrence";
import { prolongerHorizonDuCompte, rechercherSuggestions } from "@/server/repositories/recurrences-ecriture";
import { lierOccurrence } from "./recurrences";
import { exigerInvariantsOccurrences } from "../../../prisma/test/invariants-occurrences";
import { calculerEmpreinte, normaliserDescription } from "@/domain/ingestion";
import type { LigneEnRevue } from "@/domain/ingestion";
import { formatMontant } from "@/domain/money";
import { empreinteLigneFille } from "@/domain/ventilation/empreinte";
import { serialiserPartsVentilation } from "@/domain/ventilation";
import { formatMontantChamp } from "@/lib/champs-formulaire";
import { analyserReleveColle, enregistrerImport } from "./import";
import { creerContrepartie, lierVirement } from "./transactions";
import { choisirOccurrence, choisirSousCategorie, depuisLigneEnRevue, versLigneImport } from "@/features/import/etat-revue";
import { MESSAGE_BENEFICIAIRE_NOUVEAU_VIDE, type EntreeLigneImport } from "@/features/import/schema";
import { exigerInvariants } from "../../../prisma/test/invariants";
import { tenirVerrou } from "../../../prisma/test/verrou-tenu";

// Isolation (docs/lot-m3.md §4.5, journal d'INDEX.md 2026-10-09) : la détection réelle remplacerait les suggestions
// EN_ATTENTE du propriétaire et la prolongation réelle du compte Chèque du seed changerait les échéances que lisent
// d'autres fichiers qui tournent en parallèle.
const espions = vi.hoisted(() => ({ comptesProlonges: new Set<string>() }));
vi.mock("@/server/repositories/recurrences-ecriture", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/server/repositories/recurrences-ecriture")>();
  return {
    ...original,
    rechercherSuggestions: vi.fn(() => Promise.resolve({ dateReference: null, nbSuggestions: 0, limiteAtteinte: false })),
    prolongerHorizonDuCompte: vi.fn(async (ownerId: string, accountId: string, aujourdhui: string) =>
      espions.comptesProlonges.has(accountId)
        ? original.prolongerHorizonDuCompte(ownerId, accountId, aujourdhui)
        : { echeancesCreees: 0 },
    ),
  };
});

const prisma = new PrismaClient();

const ANNEE_TEST = 2099;
const PROFIL_ID = "desjardins-accesd";

// cuid syntaxiquement valide (passe z.string().cuid()) mais qui n'existe pas
// en base — même style que les fixtures de src/features/regles/schema.test.ts.
const CUID_INEXISTANT = "clx0000000000000000099999";

let ownerId: string;
let accountId: string;
let subcategoryId: string;
let tagId: string;

const idsTransactionACreer: string[] = [];
const idsImportBatchACreer: string[] = [];
const idsPayeeACreer: string[] = [];

beforeAll(async () => {
  const owner = await prisma.user.findFirstOrThrow({ orderBy: { createdAt: "asc" } });
  ownerId = owner.id;

  // Par son nom du seed : l'ordre physique n'est pas garanti et d'autres fichiers créent des comptes jetables.
  const compte = await prisma.account.findFirstOrThrow({ where: { ownerId, nom: "Chèque" } });
  accountId = compte.id;

  const sousCategorie = await prisma.subcategory.findFirstOrThrow({
    where: { category: { ownerId }, masquee: false, systeme: false },
  });
  subcategoryId = sousCategorie.id;

  const tag = await prisma.tag.create({ data: { ownerId, nom: `TEST_IMPORT_${randomUUID().slice(0, 8)}` } });
  tagId = tag.id;
});

afterAll(async () => {
  await prisma.transactionTag.deleteMany({ where: { transactionId: { in: idsTransactionACreer } } });
  await prisma.transaction.deleteMany({ where: { id: { in: idsTransactionACreer } } });
  await prisma.importBatch.deleteMany({ where: { id: { in: idsImportBatchACreer } } });
  await prisma.payee.deleteMany({ where: { id: { in: idsPayeeACreer } } });
  if (tagId) {
    await prisma.tag.delete({ where: { id: tagId } });
  }
  await prisma.$disconnect();
});

function marqueur(prefixe: string): string {
  return `${prefixe}${randomUUID().replace(/-/g, "").slice(0, 10)}`.toUpperCase();
}

/** Construit une entrée pour enregistrerImport, sans passer par la revue cliente. */
function versEntree(ligne: LigneEnRevue, overrides: Partial<EntreeLigneImport> = {}): EntreeLigneImport {
  return {
    cle: ligne.cle,
    action: ligne.action === "METTRE_A_JOUR" ? "METTRE_A_JOUR" : "IMPORTER",
    transactionExistanteId: ligne.action === "METTRE_A_JOUR" ? (ligne.doublonDe?.id ?? null) : null,
    accountId: ligne.accountId,
    date: ligne.date,
    description: ligne.description,
    montant: formatMontantChamp(ligne.montantCents),
    note: ligne.note,
    payeeId: ligne.payeeId,
    payeeNouveauNom: ligne.payeeNouveauNom,
    subcategoryId: ligne.subcategoryId,
    tagIds: [...ligne.tagIds],
    externalId: ligne.externalId,
    appliedRuleId: ligne.regleAppliqueeId,
    aRevoir: ligne.aRevoir,
    exclureDuBudget: ligne.exclureDuBudget,
    exclureDesRapports: ligne.exclureDesRapports,
    typeOperation: ligne.typeOperation,
    ventilation: null,
    virementAvec: null,
    occurrenceAvec: null,
    occurrenceAuto: false,
    ...overrides,
  };
}

function ligneManuelle(overrides: Partial<EntreeLigneImport> & { cle: string }): EntreeLigneImport {
  return {
    action: "IMPORTER",
    transactionExistanteId: null,
    accountId,
    date: "2099-02-01",
    description: marqueur("TESTMANUEL"),
    montant: "10,00",
    note: null,
    payeeId: null,
    payeeNouveauNom: null,
    subcategoryId: null,
    tagIds: [],
    externalId: null,
    appliedRuleId: null,
    aRevoir: false,
    exclureDuBudget: false,
    exclureDesRapports: false,
    typeOperation: null,
    ventilation: null,
    virementAvec: null,
    occurrenceAvec: null,
    occurrenceAuto: false,
    ...overrides,
  };
}

function texteReleve(marque: string): string {
  return [
    `15 janvier ${marque} UN 12,34 $`,
    `16 janvier ${marque} DEUX 56,78 $`,
    `17 janvier ${marque} TROIS 9,00 $`,
  ].join("\n");
}

describe("import.ts — analyserReleveColle + enregistrerImport (M1 tranche 6, docs/lot-m1.md §9)", () => {
  it("1. un lot de trois lignes s'écrit : trois Transaction avec source COPIER_COLLER, importBatchId, descriptionNormalisee et empreinte posées ; l'ImportBatch porte nbLignes = 3, couvreDu/couvreAu justes", async () => {
    const marque = marqueur("TESTLOT1");
    const analyse = await analyserReleveColle({
      accountId,
      annee: ANNEE_TEST,
      profilId: PROFIL_ID,
      texte: texteReleve(marque),
    });
    expect(analyse.ok).toBe(true);
    if (!analyse.ok) return;
    expect(analyse.data.rejetees).toHaveLength(0);
    expect(analyse.data.lignes).toHaveLength(3);
    for (const ligne of analyse.data.lignes) {
      expect(ligne.action).toBe("IMPORTER");
      expect(ligne.statutDoublon).toBe("AUCUN");
    }

    const lignes = analyse.data.lignes.map((ligne) => versEntree(ligne));
    const resultat = await enregistrerImport({ accountId, libelle: null, lignes });
    expect(resultat.ok).toBe(true);
    if (!resultat.ok) return;

    expect(resultat.data.importees).toBe(3);
    expect(resultat.data.misesAJour).toBe(0);
    expect(resultat.data.couvreDu).toBe("2099-01-15");
    expect(resultat.data.couvreAu).toBe("2099-01-17");

    idsImportBatchACreer.push(resultat.data.importBatchId);

    const transactions = await prisma.transaction.findMany({ where: { importBatchId: resultat.data.importBatchId } });
    idsTransactionACreer.push(...transactions.map((t) => t.id));
    expect(transactions).toHaveLength(3);
    for (const transaction of transactions) {
      expect(transaction.source).toBe("COPIER_COLLER");
      expect(transaction.importBatchId).toBe(resultat.data.importBatchId);
      expect(transaction.descriptionNormalisee.length).toBeGreaterThan(0);
      expect(transaction.empreinte.length).toBeGreaterThan(0);
    }

    const batch = await prisma.importBatch.findUniqueOrThrow({ where: { id: resultat.data.importBatchId } });
    expect(batch.nbLignes).toBe(3);
  });

  it("2. ré-import du même texte : rien ne s'écrit. Les trois lignes ressortent EMPREINTE_EXISTANTE avec action IGNORER", async () => {
    const marque = marqueur("TESTLOT2");
    const texte = texteReleve(marque);

    const premiereAnalyse = await analyserReleveColle({ accountId, annee: ANNEE_TEST, profilId: PROFIL_ID, texte });
    expect(premiereAnalyse.ok).toBe(true);
    if (!premiereAnalyse.ok) return;
    const lignes = premiereAnalyse.data.lignes.map((ligne) => versEntree(ligne));
    const premierEnregistrement = await enregistrerImport({ accountId, libelle: null, lignes });
    expect(premierEnregistrement.ok).toBe(true);
    if (!premierEnregistrement.ok) return;
    idsImportBatchACreer.push(premierEnregistrement.data.importBatchId);
    const transactionsCreees = await prisma.transaction.findMany({
      where: { importBatchId: premierEnregistrement.data.importBatchId },
    });
    idsTransactionACreer.push(...transactionsCreees.map((t) => t.id));

    // Le compte est partagé avec d'autres suites d'intégration qui tournent en
    // parallèle (rules.test.ts, etc.) : un total ownerId+accountId serait
    // instable sous course. On scope au marqueur unique de cette ligne.
    const compteAvant = await prisma.transaction.count({ where: { ownerId, description: { contains: marque } } });

    const deuxiemeAnalyse = await analyserReleveColle({ accountId, annee: ANNEE_TEST, profilId: PROFIL_ID, texte });
    expect(deuxiemeAnalyse.ok).toBe(true);
    if (!deuxiemeAnalyse.ok) return;
    expect(deuxiemeAnalyse.data.lignes).toHaveLength(3);
    for (const ligne of deuxiemeAnalyse.data.lignes) {
      expect(ligne.statutDoublon).toBe("EMPREINTE_EXISTANTE");
      expect(ligne.action).toBe("IGNORER");
      expect(ligne.section).toBe("DOUBLONS");
    }

    const compteApres = await prisma.transaction.count({ where: { ownerId, description: { contains: marque } } });
    expect(compteApres).toBe(compteAvant); // rien écrit par la seule analyse
    expect(compteApres).toBe(3);
  });

  it("3. import forcé de lignes déjà en base (action IMPORTER malgré EMPREINTE_EXISTANTE) → DUPLICATE, zéro transaction créée en plus", async () => {
    const marque = marqueur("TESTLOT3");
    const texte = texteReleve(marque);

    const premiereAnalyse = await analyserReleveColle({ accountId, annee: ANNEE_TEST, profilId: PROFIL_ID, texte });
    expect(premiereAnalyse.ok).toBe(true);
    if (!premiereAnalyse.ok) return;
    const premierEnregistrement = await enregistrerImport({
      accountId,
      libelle: null,
      lignes: premiereAnalyse.data.lignes.map((ligne) => versEntree(ligne)),
    });
    expect(premierEnregistrement.ok).toBe(true);
    if (!premierEnregistrement.ok) return;
    idsImportBatchACreer.push(premierEnregistrement.data.importBatchId);
    const transactionsCreees = await prisma.transaction.findMany({
      where: { importBatchId: premierEnregistrement.data.importBatchId },
    });
    idsTransactionACreer.push(...transactionsCreees.map((t) => t.id));

    const deuxiemeAnalyse = await analyserReleveColle({ accountId, annee: ANNEE_TEST, profilId: PROFIL_ID, texte });
    expect(deuxiemeAnalyse.ok).toBe(true);
    if (!deuxiemeAnalyse.ok) return;

    const compteAvant = await prisma.transaction.count({ where: { ownerId, description: { contains: marque } } });

    const lignesForcees = deuxiemeAnalyse.data.lignes.map((ligne) =>
      versEntree(ligne, { action: "IMPORTER", transactionExistanteId: null }),
    );
    const resultatForce = await enregistrerImport({ accountId, libelle: null, lignes: lignesForcees });
    expect(resultatForce.ok).toBe(false);
    if (resultatForce.ok) return;
    expect(resultatForce.code).toBe("DUPLICATE");
    // Ces deux assertions sont ce qui distingue le contrôle préalable propre
    // (EMPREINTE_EN_DOUBLE, avant toute écriture) d'un P2002 brut rattrapé
    // après coup par tenter() — sans elles, le test ne prouve pas que c'est
    // bien le chemin attendu qui a servi (docs/lot-m1.md §9 : « un message
    // qui nomme les lignes »).
    expect(resultatForce.message).toContain(marque);
    const detailsForce = resultatForce.details as { lignes: readonly { dansLeLot: boolean }[] } | undefined;
    expect(detailsForce?.lignes.length).toBeGreaterThan(0);
    expect(detailsForce?.lignes.every((l) => !l.dansLeLot)).toBe(true); // déjà en base, pas doublon interne au lot

    const compteApres = await prisma.transaction.count({ where: { ownerId, description: { contains: marque } } });
    expect(compteApres).toBe(compteAvant);
    expect(compteApres).toBe(3);
  });

  it("4. deux lignes du même lot portant la même empreinte → DUPLICATE, dansLeLot: true, rien d'écrit", async () => {
    const description = marqueur("TESTDOUBLONLOT");
    const ligne1 = ligneManuelle({ cle: "l1", description, montant: "20,00", date: "2099-03-01" });
    const ligne2 = ligneManuelle({ cle: "l2", description, montant: "20,00", date: "2099-03-01" });

    const compteAvant = await prisma.transaction.count({ where: { ownerId, description } });

    const resultat = await enregistrerImport({ accountId, libelle: null, lignes: [ligne1, ligne2] });
    expect(resultat.ok).toBe(false);
    if (resultat.ok) return;
    expect(resultat.code).toBe("DUPLICATE");
    const details = resultat.details as { lignes: readonly { dansLeLot: boolean }[] } | undefined;
    expect(details?.lignes.every((l) => l.dansLeLot)).toBe(true);

    const compteApres = await prisma.transaction.count({ where: { ownerId, description } });
    expect(compteApres).toBe(compteAvant);
  });

  it("5. payeeNouveauNom identique sur deux lignes → un seul Payee créé, les deux transactions le portent, beneficiairesCrees === 1", async () => {
    const nomNouveau = `Nouveau Bénéficiaire ${randomUUID().slice(0, 8)}`;
    const ligne1 = ligneManuelle({ cle: "l1", description: marqueur("TESTBENEFA"), payeeNouveauNom: nomNouveau });
    const ligne2 = ligneManuelle({ cle: "l2", description: marqueur("TESTBENEFB"), payeeNouveauNom: nomNouveau });

    const resultat = await enregistrerImport({ accountId, libelle: null, lignes: [ligne1, ligne2] });
    expect(resultat.ok).toBe(true);
    if (!resultat.ok) return;
    expect(resultat.data.beneficiairesCrees).toBe(1);
    idsImportBatchACreer.push(resultat.data.importBatchId);

    const transactions = await prisma.transaction.findMany({ where: { importBatchId: resultat.data.importBatchId } });
    idsTransactionACreer.push(...transactions.map((t) => t.id));
    expect(transactions).toHaveLength(2);
    const payeeIds = new Set(transactions.map((t) => t.payeeId));
    expect(payeeIds.size).toBe(1);
    const [payeeId] = [...payeeIds];
    expect(payeeId).not.toBeNull();
    if (payeeId !== null && payeeId !== undefined) {
      idsPayeeACreer.push(payeeId);
    }

    const payeesAvecCeNom = await prisma.payee.count({ where: { ownerId, nom: nomNouveau } });
    expect(payeesAvecCeNom).toBe(1);
  });

  it("5b. payeeNouveauNom qui passe trim mais se normalise en vide (accent combinant seul) → REFERENCE_INVALIDE, rien d'écrit, aucun Payee créé (relecture tranche 6, point 1)", async () => {
    const description = marqueur("TESTBENEFNUM");
    const ligne = ligneManuelle({ cle: "l1", description, payeeNouveauNom: "\u0301" });

    // Comptage borné à ce que le bug créerait : un total sur l'ownerId courrait
    // contre payees.test.ts, qui crée et supprime des bénéficiaires en parallèle.
    const whereBugPayee = { ownerId, OR: [{ nom: "\u0301" }, { nomNormalise: "" }] };
    expect(await prisma.payee.count({ where: whereBugPayee })).toBe(0);

    const resultat = await enregistrerImport({ accountId, libelle: null, lignes: [ligne] });
    expect(resultat.ok).toBe(false);
    if (resultat.ok) return;
    expect(resultat.code).toBe("NOT_FOUND");
    expect(resultat.message).toBe(MESSAGE_BENEFICIAIRE_NOUVEAU_VIDE);

    const compteTransactions = await prisma.transaction.count({ where: { ownerId, description } });
    expect(compteTransactions).toBe(0);
    expect(await prisma.payee.count({ where: whereBugPayee })).toBe(0); // aucun Payee créé en effet de bord
  });

  it("5c. clé douce : « Les 3 Brasseurs » et « Les 5 Saisons » créent deux Payee ; deux graphies qui ne diffèrent que par la casse et les espaces n'en créent qu'un (journal du 2026-09-29)", async () => {
    const suffixe = randomUUID().slice(0, 8);
    const lignes = [
      ligneManuelle({ cle: "l1", description: marqueur("TESTCLEA"), payeeNouveauNom: `Les 3 Brasseurs ${suffixe}` }),
      ligneManuelle({ cle: "l2", description: marqueur("TESTCLEB"), payeeNouveauNom: `Les 5 Saisons ${suffixe}` }),
      ligneManuelle({ cle: "l3", description: marqueur("TESTCLEC"), payeeNouveauNom: `Tim Hortons ${suffixe}` }),
      ligneManuelle({ cle: "l4", description: marqueur("TESTCLED"), payeeNouveauNom: `TIM   HORTONS ${suffixe}` }),
    ];

    const resultat = await enregistrerImport({ accountId, libelle: null, lignes });
    expect(resultat.ok).toBe(true);
    if (!resultat.ok) return;
    idsImportBatchACreer.push(resultat.data.importBatchId);
    expect(resultat.data.beneficiairesCrees).toBe(3);

    const transactions = await prisma.transaction.findMany({
      where: { importBatchId: resultat.data.importBatchId },
      select: { id: true, description: true, payeeId: true },
    });
    idsTransactionACreer.push(...transactions.map((t) => t.id));
    const payeeDe = (motif: string) => transactions.find((t) => t.description.includes(motif))?.payeeId ?? null;
    for (const payeeId of new Set(transactions.map((t) => t.payeeId))) {
      if (payeeId !== null) idsPayeeACreer.push(payeeId);
    }

    expect(payeeDe("TESTCLEA")).not.toBeNull();
    expect(payeeDe("TESTCLEA")).not.toBe(payeeDe("TESTCLEB"));
    expect(payeeDe("TESTCLEC")).toBe(payeeDe("TESTCLED"));
  });

  it("6. les tagIds produisent bien les TransactionTag correspondants", async () => {
    const ligne = ligneManuelle({ cle: "l1", description: marqueur("TESTTAG"), tagIds: [tagId] });

    const resultat = await enregistrerImport({ accountId, libelle: null, lignes: [ligne] });
    expect(resultat.ok).toBe(true);
    if (!resultat.ok) return;
    idsImportBatchACreer.push(resultat.data.importBatchId);
    expect(resultat.data.etiquettesPosees).toBe(1);

    const transactions = await prisma.transaction.findMany({
      where: { importBatchId: resultat.data.importBatchId },
      include: { etiquettes: true },
    });
    idsTransactionACreer.push(...transactions.map((t) => t.id));
    expect(transactions).toHaveLength(1);
    expect(transactions[0]?.etiquettes.map((e) => e.tagId)).toEqual([tagId]);
  });

  it("7. une subcategoryId qui n'appartient pas au propriétaire → NOT_FOUND, rien d'écrit", async () => {
    const description = marqueur("TESTSCINVALIDE");
    const ligne = ligneManuelle({ cle: "l1", description, subcategoryId: CUID_INEXISTANT });

    const compteAvant = await prisma.transaction.count({ where: { ownerId, description } });
    const resultat = await enregistrerImport({ accountId, libelle: null, lignes: [ligne] });
    expect(resultat.ok).toBe(false);
    if (resultat.ok) return;
    expect(resultat.code).toBe("NOT_FOUND");

    const compteApres = await prisma.transaction.count({ where: { ownerId, description } });
    expect(compteApres).toBe(compteAvant);
    expect(compteApres).toBe(0);
  });

  it("8. les montants traversent en cents : une ligne saisie « 1 234,56 » ressort 123456 en base", async () => {
    const ligne = ligneManuelle({ cle: "l1", description: marqueur("TESTMONTANT"), montant: "1 234,56" });

    const resultat = await enregistrerImport({ accountId, libelle: null, lignes: [ligne] });
    expect(resultat.ok).toBe(true);
    if (!resultat.ok) return;
    idsImportBatchACreer.push(resultat.data.importBatchId);

    const transactions = await prisma.transaction.findMany({ where: { importBatchId: resultat.data.importBatchId } });
    idsTransactionACreer.push(...transactions.map((t) => t.id));
    expect(transactions).toHaveLength(1);
    expect(transactions[0]?.montantCents).toBe(123456);
  });

  /** Analyse un texte à une ligne en conflit seed « Restaurant (conflit A/B) » et vérifie les préconditions. */
  async function analyserLigneEnConflit(marque: string) {
    const analyse = await analyserReleveColle({
      accountId,
      annee: ANNEE_TEST,
      profilId: PROFIL_ID,
      texte: `15 janvier ${marque} RESTAURANT 12,34 $`,
    });
    expect(analyse.ok).toBe(true);
    if (!analyse.ok) throw new Error("analyse refusée");
    expect(analyse.data.lignes).toHaveLength(1);
    const ligne = analyse.data.lignes[0];
    if (ligne === undefined) throw new Error("aucune ligne");

    expect(ligne.montantCents).toBe(-1234);
    expect(ligne.subcategoryId).toBeNull();
    expect(ligne.regleAppliqueeId).toBeNull();
    const conflit = ligne.conflits.find((c) => c.slot === "SOUS_CATEGORIE");
    expect(conflit).toBeDefined();
    const libelles = (conflit?.candidats ?? []).map((c) => c.libelle).sort();
    expect(libelles).toEqual(["Restaurant (conflit A)", "Restaurant (conflit B)"]);
    return { ligne, conflit };
  }

  async function enregistrerEtLire(ligne: LigneEnRevue, choisie: string) {
    const resultat = await enregistrerImport({
      accountId,
      libelle: null,
      lignes: [versEntree(ligne, { subcategoryId: choisie })],
    });
    expect(resultat.ok).toBe(true);
    if (!resultat.ok) throw new Error(resultat.message);
    idsImportBatchACreer.push(resultat.data.importBatchId);
    const transactions = await prisma.transaction.findMany({ where: { importBatchId: resultat.data.importBatchId } });
    idsTransactionACreer.push(...transactions.map((t) => t.id));
    expect(transactions).toHaveLength(1);
    return transactions[0];
  }

  it("9. A6 : une sous-catégorie hors des candidates, choisie sur une ligne en conflit, est celle qui est persistée, appliedRuleId à null", async () => {
    const { ligne } = await analyserLigneEnConflit(marqueur("TESTA6"));
    const horsCandidates = await prisma.subcategory.findFirstOrThrow({
      where: { category: { ownerId }, masquee: false, systeme: false, nom: { notIn: ["Restaurant", "Sorties"] } },
    });

    const transaction = await enregistrerEtLire(ligne, horsCandidates.id);
    expect(transaction?.subcategoryId).toBe(horsCandidates.id);
    expect(transaction?.appliedRuleId).toBeNull();
  });

  it("9b. A6 : la sous-catégorie de la règle « (conflit B) » choisie est persistée, appliedRuleId à null", async () => {
    const { ligne, conflit } = await analyserLigneEnConflit(marqueur("TESTA6B"));
    const candidateB = conflit?.candidats.find((c) => c.libelle === "Restaurant (conflit B)");
    expect(candidateB).toBeDefined();
    if (candidateB === undefined) return;

    const transaction = await enregistrerEtLire(ligne, candidateB.valeur);
    expect(transaction?.subcategoryId).toBe(candidateB.valeur);
    expect(transaction?.appliedRuleId).toBeNull();
  });

  /**
   * Le chemin de l'écran : analyse, ligne éditée, geste « choisir une
   * sous-catégorie », versLigneImport, puis enregistrement.
   */
  async function recategoriserEtEnregistrer(marque: string, choisirAutre: boolean) {
    const regle = await prisma.rule.findFirstOrThrow({ where: { ownerId, libelle: "Dépôt de paie" } });
    const paie = await prisma.subcategory.findFirstOrThrow({ where: { category: { ownerId }, nom: "Paie" } });
    const analyse = await analyserReleveColle({
      accountId,
      annee: ANNEE_TEST,
      profilId: PROFIL_ID,
      texte: `15 septembre ${marque} DEPOT PAIE +100,00 $`,
    });
    expect(analyse.ok).toBe(true);
    if (!analyse.ok) throw new Error("analyse refusée");
    expect(analyse.data.lignes).toHaveLength(1);
    const ligne = analyse.data.lignes[0];
    if (ligne === undefined) throw new Error("aucune ligne");
    expect(ligne.regleAppliqueeId).toBe(regle.id);
    expect(ligne.subcategoryId).toBe(paie.id);
    expect(ligne.montantCents).toBe(10000);

    const autre = await prisma.subcategory.findFirstOrThrow({
      where: { category: { ownerId }, masquee: false, systeme: false, nom: { not: "Paie" } },
    });
    const editee = depuisLigneEnRevue(ligne);
    const modifiee = { ...editee, ...choisirSousCategorie(editee, choisirAutre ? autre.id : paie.id) };
    const entree = versLigneImport(modifiee);
    expect(entree).not.toBeNull();
    if (entree === null) throw new Error("ligne ignorée");

    const resultat = await enregistrerImport({ accountId, libelle: null, lignes: [entree] });
    expect(resultat.ok).toBe(true);
    if (!resultat.ok) throw new Error(resultat.message);
    idsImportBatchACreer.push(resultat.data.importBatchId);
    const transactions = await prisma.transaction.findMany({ where: { importBatchId: resultat.data.importBatchId } });
    idsTransactionACreer.push(...transactions.map((t) => t.id));
    expect(transactions).toHaveLength(1);
    return { transaction: transactions[0], regle, paie, autre };
  }

  it("13. une sous-catégorie changée à la main sur une ligne posée par une règle est persistée, appliedRuleId à null", async () => {
    const { transaction, autre } = await recategoriserEtEnregistrer(marqueur("TESTP13"), true);
    expect(transaction?.subcategoryId).toBe(autre.id);
    expect(transaction?.appliedRuleId).toBeNull();
  });

  it("13b. la sous-catégorie de la règle, choisie à nouveau, garde appliedRuleId", async () => {
    const { transaction, paie, regle } = await recategoriserEtEnregistrer(marqueur("TESTP13B"), false);
    expect(transaction?.subcategoryId).toBe(paie.id);
    expect(transaction?.appliedRuleId).toBe(regle.id);
  });

  it("10. A3 : la règle seed « Dépôt de paie » est en MOT_ENTIER et ne capte plus « Paiement. », mais capte « DEPOT PAIE »", async () => {
    const regle = await prisma.rule.findFirstOrThrow({
      where: { ownerId, libelle: "Dépôt de paie" },
      include: { conditions: true },
    });
    expect(regle.conditions).toHaveLength(1);
    expect(regle.conditions[0]?.operateur).toBe("MOT_ENTIER");
    const paie = await prisma.subcategory.findFirstOrThrow({ where: { category: { ownerId }, nom: "Paie" } });

    const marque = marqueur("TESTA3");
    const analyse = await analyserReleveColle({
      accountId,
      annee: ANNEE_TEST,
      profilId: PROFIL_ID,
      texte: `14 septembre Paiement. +8,75 $\n15 septembre ${marque} DEPOT PAIE +100,00 $`,
    });
    expect(analyse.ok).toBe(true);
    if (!analyse.ok) return;
    expect(analyse.data.lignes).toHaveLength(2);

    const paiement = analyse.data.lignes.find((l) => l.description === "Paiement.");
    const depot = analyse.data.lignes.find((l) => l.description.includes("DEPOT PAIE"));
    expect(paiement).toBeDefined();
    expect(depot).toBeDefined();

    expect(paiement?.regleAppliqueeId).not.toBe(regle.id);
    expect(paiement?.subcategoryId).not.toBe(paie.id);
    expect(depot?.regleAppliqueeId).toBe(regle.id);
    expect(depot?.subcategoryId).toBe(paie.id);
  });

  it("11. A1 et docs/lot-m2.md §3.1 : le type d'opération est persisté ; description et empreinte restent celles du marchand", async () => {
    const marque = marqueur("TESTA1");
    const analyse = await analyserReleveColle({
      accountId,
      annee: ANNEE_TEST,
      profilId: PROFIL_ID,
      texte: `15 janvier Achat /${marque} 12,34 $`,
    });
    expect(analyse.ok).toBe(true);
    if (!analyse.ok) return;
    const ligne = analyse.data.lignes[0];
    expect(analyse.data.lignes).toHaveLength(1);
    expect(ligne?.typeOperation).toBe("Achat");
    expect(ligne?.description).toBe(marque);
    if (ligne === undefined) return;

    const transaction = await enregistrerEtLire(ligne, subcategoryId);
    expect(transaction?.description).toBe(marque);
    expect(transaction?.typeOperation).toBe("Achat");
    expect(transaction?.descriptionNormalisee).toBe(normaliserDescription(marque));
    expect(transaction?.empreinte).toBe(
      calculerEmpreinte(accountId, "2099-01-15", -1234, normaliserDescription(marque)),
    );
  });

  it("12. A2 à travers l'action : l'écart du total est rendu en cents, sans ligne Total le contrôle est null", async () => {
    const marque = marqueur("TESTA2");
    const avecTotal = await analyserReleveColle({
      accountId,
      annee: ANNEE_TEST,
      profilId: PROFIL_ID,
      texte: `15 janvier ${marque} 12,34 $\nTotal 5,00 $`,
    });
    expect(avecTotal.ok).toBe(true);
    if (!avecTotal.ok) return;
    expect(avecTotal.data.controleTotal).toEqual({
      numeroLigne: 2,
      totalReleveCents: -500,
      sommeReconnuesCents: -1234,
      ecartCents: -734,
    });

    const sansTotal = await analyserReleveColle({
      accountId,
      annee: ANNEE_TEST,
      profilId: PROFIL_ID,
      texte: `15 janvier ${marque} 12,34 $`,
    });
    expect(sansTotal.ok).toBe(true);
    if (!sansTotal.ok) return;
    expect(sansTotal.data.controleTotal).toBeNull();
  });

  it("bonus : une sous-catégorie valide se pose bien sur la transaction créée", async () => {
    const ligne = ligneManuelle({ cle: "l1", description: marqueur("TESTSCVALIDE"), subcategoryId });

    const resultat = await enregistrerImport({ accountId, libelle: null, lignes: [ligne] });
    expect(resultat.ok).toBe(true);
    if (!resultat.ok) return;
    idsImportBatchACreer.push(resultat.data.importBatchId);

    const transactions = await prisma.transaction.findMany({ where: { importBatchId: resultat.data.importBatchId } });
    idsTransactionACreer.push(...transactions.map((t) => t.id));
    expect(transactions[0]?.subcategoryId).toBe(subcategoryId);
  });

  it("5d. docs/lot-m2.md §10.1.1 : un nouveau nom vide est refusé par la validation, avec le message du schéma, rien d'écrit", async () => {
    const description = marqueur("TESTBENEFVIDE");
    const ligne = ligneManuelle({ cle: "l1", description, payeeNouveauNom: "" });

    const resultat = await enregistrerImport({ accountId, libelle: null, lignes: [ligne] });
    expect(resultat.ok).toBe(false);
    if (resultat.ok) return;
    expect(resultat.code).toBe("VALIDATION");
    expect(resultat.message).toBe(MESSAGE_BENEFICIAIRE_NOUVEAU_VIDE);
    expect(await prisma.transaction.count({ where: { ownerId, description } })).toBe(0);
  });

  it("T2. le type d'opération est écrit ligne par ligne, hors empreinte ; les invariants tiennent", async () => {
    const marqueA = marqueur("TESTT2A");
    const marqueB = marqueur("TESTT2B");
    const analyse = await analyserReleveColle({
      accountId,
      annee: ANNEE_TEST,
      profilId: PROFIL_ID,
      texte: `15 janvier Paie /${marqueA} +100,00 $\n16 janvier ${marqueB} 5,00 $`,
    });
    expect(analyse.ok).toBe(true);
    if (!analyse.ok) return;
    expect(analyse.data.lignes).toHaveLength(2);

    const resultat = await enregistrerImport({
      accountId,
      libelle: null,
      lignes: analyse.data.lignes.map((ligne) => versEntree(ligne)),
    });
    expect(resultat.ok).toBe(true);
    if (!resultat.ok) return;
    idsImportBatchACreer.push(resultat.data.importBatchId);

    const transactions = await prisma.transaction.findMany({
      where: { importBatchId: resultat.data.importBatchId },
      orderBy: { date: "asc" },
    });
    idsTransactionACreer.push(...transactions.map((t) => t.id));
    expect(transactions.map((t) => t.typeOperation)).toEqual(["Paie", null]);
    expect(transactions[0]?.empreinte).toBe(
      calculerEmpreinte(accountId, "2099-01-15", 10000, normaliserDescription(marqueA)),
    );

    await exigerInvariants(prisma, { type: "TRANSACTIONS", ids: transactions.map((t) => t.id) });
  });

  it("T3. un type d'opération forgé vide est refusé par la validation, rien d'écrit", async () => {
    const description = marqueur("TESTT3");
    const resultat = await enregistrerImport({
      accountId,
      libelle: null,
      lignes: [ligneManuelle({ cle: "l1", description, typeOperation: "" })],
    });
    expect(resultat.ok).toBe(false);
    if (resultat.ok) return;
    expect(resultat.code).toBe("VALIDATION");
    expect(await prisma.transaction.count({ where: { ownerId, description } })).toBe(0);
  });
});

describe("import.ts — contrôle serveur d'appliedRuleId (docs/lot-m2.md §10.1)", () => {
  const idsControle: string[] = [];
  let reglePaieId: string;
  let paieId: string;
  let autreId: string;

  beforeAll(async () => {
    reglePaieId = (await prisma.rule.findFirstOrThrow({ where: { ownerId, libelle: "Dépôt de paie" } })).id;
    paieId = (await prisma.subcategory.findFirstOrThrow({ where: { category: { ownerId }, nom: "Paie" } })).id;
    autreId = (
      await prisma.subcategory.findFirstOrThrow({
        where: { category: { ownerId }, masquee: false, systeme: false, nom: { not: "Paie" } },
      })
    ).id;
  });

  async function enregistrer(lignes: EntreeLigneImport[]) {
    const resultat = await enregistrerImport({ accountId, libelle: null, lignes });
    if (resultat.ok) {
      idsImportBatchACreer.push(resultat.data.importBatchId);
      const creees = await prisma.transaction.findMany({
        where: { importBatchId: resultat.data.importBatchId },
        orderBy: { description: "asc" },
      });
      idsTransactionACreer.push(...creees.map((t) => t.id));
      idsControle.push(...creees.map((t) => t.id));
      return { resultat, creees };
    }
    return { resultat, creees: [] };
  }

  async function uneLigne(appliedRuleId: string | null, subcategoryId: string | null) {
    return enregistrer([ligneManuelle({ cle: "l1", description: marqueur("TESTR"), appliedRuleId, subcategoryId })]);
  }

  it("R1. la règle pose bien la sous-catégorie reçue : appliedRuleId conservé", async () => {
    const { resultat, creees } = await uneLigne(reglePaieId, paieId);
    expect(resultat.ok).toBe(true);
    expect(creees[0]?.appliedRuleId).toBe(reglePaieId);
    expect(creees[0]?.subcategoryId).toBe(paieId);
  });

  it("R2. la règle ne pose pas la sous-catégorie reçue : écrit avec elle, appliedRuleId à null, pas un refus", async () => {
    const { resultat, creees } = await uneLigne(reglePaieId, autreId);
    expect(resultat.ok).toBe(true);
    expect(creees[0]?.subcategoryId).toBe(autreId);
    expect(creees[0]?.appliedRuleId).toBeNull();
  });

  it("R3. sous-catégorie reçue null : appliedRuleId à null", async () => {
    const { resultat, creees } = await uneLigne(reglePaieId, null);
    expect(resultat.ok).toBe(true);
    expect(creees[0]?.appliedRuleId).toBeNull();
  });

  it("R4. règle inexistante : plus de NOT_FOUND, appliedRuleId à null", async () => {
    const { resultat, creees } = await uneLigne(CUID_INEXISTANT, paieId);
    expect(resultat.ok).toBe(true);
    expect(creees[0]?.appliedRuleId).toBeNull();
    expect(creees[0]?.subcategoryId).toBe(paieId);
  });

  it("R5. règle d'un autre propriétaire : appliedRuleId à null", async () => {
    const autre = await prisma.user.create({ data: { email: `autre-${randomUUID()}@exemple.invalid` } });
    try {
      const regle = await prisma.rule.create({
        data: {
          ownerId: autre.id,
          libelle: marqueur("TESTR5"),
          actions: { create: [{ type: "CATEGORISER", subcategoryId: paieId, ordre: 0 }] },
        },
      });
      const { resultat, creees } = await uneLigne(regle.id, paieId);
      expect(resultat.ok).toBe(true);
      expect(creees[0]?.appliedRuleId).toBeNull();
    } finally {
      await prisma.user.delete({ where: { id: autre.id } });
    }
  });

  it("R6. règle sans CATEGORISER : appliedRuleId à null", async () => {
    const regle = await prisma.rule.findFirstOrThrow({
      where: { ownerId, conditions: { some: { valeur: { contains: "AMAZON", mode: "insensitive" } } } },
    });
    expect(await prisma.ruleAction.count({ where: { ruleId: regle.id, type: "CATEGORISER" } })).toBe(0);
    const { resultat, creees } = await uneLigne(regle.id, paieId);
    expect(resultat.ok).toBe(true);
    expect(creees[0]?.appliedRuleId).toBeNull();
  });

  it("R7. règle inactive : l'activité n'est pas contrôlée, appliedRuleId conservé", async () => {
    const regle = await prisma.rule.create({
      data: {
        ownerId,
        libelle: marqueur("TESTR7"),
        actif: false,
        actions: { create: [{ type: "CATEGORISER", subcategoryId: paieId, ordre: 0 }] },
      },
    });
    try {
      const { resultat, creees } = await uneLigne(regle.id, paieId);
      expect(resultat.ok).toBe(true);
      expect(creees[0]?.appliedRuleId).toBe(regle.id);
    } finally {
      await prisma.rule.delete({ where: { id: regle.id } });
    }
  });

  it("R8. dans un même lot, chaque ligne est jugée seule ; les invariants tiennent", async () => {
    const { resultat, creees } = await enregistrer([
      ligneManuelle({ cle: "l1", description: marqueur("TESTR8A"), appliedRuleId: reglePaieId, subcategoryId: paieId }),
      ligneManuelle({ cle: "l2", description: marqueur("TESTR8B"), appliedRuleId: reglePaieId, subcategoryId: autreId }),
    ]);
    expect(resultat.ok).toBe(true);
    expect(creees).toHaveLength(2);
    expect(creees[0]?.appliedRuleId).toBe(reglePaieId);
    expect(creees[1]?.appliedRuleId).toBeNull();

    await exigerInvariants(prisma, { type: "TRANSACTIONS", ids: idsControle });
  });
});

describe("import.ts — VENTILER (docs/lot-m2.md §4.3)", () => {
  // Un préfixe commun : la règle jetable reconnaît toutes les marques du describe, chaque cas a la sienne.
  const BASE = marqueur("TESTVENTIL");
  let regleId: string;
  let epicerieId: string;
  let cafeId: string;
  let restaurantId: string;
  const idsRegleACreer: string[] = [];

  beforeAll(async () => {
    const trouver = async (nom: string) =>
      (await prisma.subcategory.findFirstOrThrow({ where: { category: { ownerId }, nom } })).id;
    epicerieId = await trouver("Épicerie");
    cafeId = await trouver("Café");
    restaurantId = await trouver("Restaurant");
    const regle = await prisma.rule.create({
      data: {
        ownerId,
        libelle: `Ventil import ${BASE}`,
        priorite: 50,
        conditions: { create: [{ champ: "DESCRIPTION", operateur: "CONTIENT", valeur: BASE }] },
        actions: {
          create: [
            {
              type: "VENTILER",
              valeur: serialiserPartsVentilation([
                { subcategoryId: epicerieId, partMille: 333 },
                { subcategoryId: cafeId, partMille: 333 },
                { subcategoryId: restaurantId, partMille: 334 },
              ]),
              ordre: 0,
            },
          ],
        },
      },
    });
    regleId = regle.id;
    idsRegleACreer.push(regle.id);
  });

  afterAll(async () => {
    await prisma.rule.deleteMany({ where: { id: { in: idsRegleACreer } } });
  });

  async function analyser(marque: string) {
    const analyse = await analyserReleveColle({
      accountId,
      annee: ANNEE_TEST,
      profilId: PROFIL_ID,
      texte: `15 janvier ${marque} VENTIL 100,01 $`,
    });
    if (!analyse.ok) {
      throw new Error("l'analyse a échoué");
    }
    return analyse;
  }

  async function enregistrer(lignes: EntreeLigneImport[]) {
    const resultat = await enregistrerImport({ accountId, libelle: null, lignes });
    if (resultat.ok) {
      idsImportBatchACreer.push(resultat.data.importBatchId);
      const creees = await prisma.transaction.findMany({ where: { importBatchId: resultat.data.importBatchId } });
      idsTransactionACreer.push(...creees.map((t) => t.id));
    }
    return resultat;
  }

  it("IM1 — la ligne ventilée par la règle s'écrit : un parent et trois filles qui somment exactement", async () => {
    const analyse = await analyser(`${BASE}1`);
    const ligne = analyse.data.lignes[0];
    expect(ligne).toBeDefined();
    if (ligne === undefined) return;
    expect(ligne.montantCents).toBe(-10001);
    expect(ligne.subcategoryId).toBeNull();
    expect(ligne.ventilation).toEqual([
      { subcategoryId: epicerieId, montantCents: -3330 },
      { subcategoryId: cafeId, montantCents: -3330 },
      { subcategoryId: restaurantId, montantCents: -3341 },
    ]);
    expect(ligne.regleAppliqueeId).toBe(regleId);

    const entree = versLigneImport(depuisLigneEnRevue(ligne));
    expect(entree).not.toBeNull();
    if (entree === null) return;
    const resultat = await enregistrer([entree]);
    expect(resultat.ok).toBe(true);
    if (!resultat.ok) return;

    const parent = await prisma.transaction.findFirstOrThrow({
      where: { importBatchId: resultat.data.importBatchId },
    });
    expect(parent).toMatchObject({ estVentilee: true, subcategoryId: null, appliedRuleId: regleId });

    const filles = await prisma.transaction.findMany({
      where: { parentId: parent.id },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    expect(filles.map((f) => f.montantCents)).toEqual([-3330, -3330, -3341]);
    expect(filles.reduce((somme, f) => somme + f.montantCents, 0)).toBe(-10001);
    expect(filles.map((f) => f.subcategoryId)).toEqual([epicerieId, cafeId, restaurantId]);
    expect(filles.map((f) => f.empreinte)).toEqual([1, 2, 3].map((r) => empreinteLigneFille(parent.empreinte, r)));
    for (const fille of filles) {
      expect(fille).toMatchObject({
        importBatchId: null,
        aRevoir: false,
        exclureDuBudget: false,
        exclureDesRapports: false,
        typeOperation: parent.typeOperation,
        descriptionNormalisee: parent.descriptionNormalisee,
        appliedRuleId: null,
      });
    }
    await exigerInvariants(prisma, { type: "TRANSACTIONS", ids: [parent.id, ...filles.map((f) => f.id)] });
  });

  it("IM2 — une ventilation modifiée à la main est écrite telle que reçue, sans crédit à la règle", async () => {
    const analyse = await analyser(`${BASE}2`);
    const ligne = analyse.data.lignes[0];
    if (ligne === undefined) throw new Error("ligne absente");
    const editee = versLigneImport(depuisLigneEnRevue(ligne));
    if (editee === null) throw new Error("ligne ignorée");
    const modifiee: EntreeLigneImport = {
      ...editee,
      ventilation: [
        { subcategoryId: epicerieId, montant: "-33,31" },
        { subcategoryId: cafeId, montant: "-33,29" },
        { subcategoryId: restaurantId, montant: "-33,41" },
      ],
    };
    const resultat = await enregistrer([modifiee]);
    expect(resultat.ok).toBe(true);
    if (!resultat.ok) return;
    const parent = await prisma.transaction.findFirstOrThrow({ where: { importBatchId: resultat.data.importBatchId } });
    expect(parent.appliedRuleId).toBeNull();
    const filles = await prisma.transaction.findMany({
      where: { parentId: parent.id },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    expect(filles.map((f) => f.montantCents)).toEqual([-3331, -3329, -3341]);
    await exigerInvariants(prisma, { type: "TRANSACTIONS", ids: [parent.id, ...filles.map((f) => f.id)] });
  });

  it("IM3 — choisir une sous-catégorie sur la ligne annule la ventilation", async () => {
    const analyse = await analyser(`${BASE}3`);
    const ligne = analyse.data.lignes[0];
    if (ligne === undefined) throw new Error("ligne absente");
    const editee = depuisLigneEnRevue(ligne);
    const entree = versLigneImport({ ...editee, ...choisirSousCategorie(editee, cafeId) });
    if (entree === null) throw new Error("ligne ignorée");
    const resultat = await enregistrer([entree]);
    expect(resultat.ok).toBe(true);
    if (!resultat.ok) return;
    const parent = await prisma.transaction.findFirstOrThrow({ where: { importBatchId: resultat.data.importBatchId } });
    expect(parent).toMatchObject({ estVentilee: false, subcategoryId: cafeId, appliedRuleId: null });
    expect(await prisma.transaction.count({ where: { parentId: parent.id } })).toBe(0);
    await exigerInvariants(prisma, { type: "TRANSACTIONS", ids: [parent.id] });
  });

  it("IM4 — une ventilation forgée qui ne somme pas au montant est refusée, rien n'est écrit", async () => {
    const analyse = await analyser(`${BASE}4`);
    const ligne = analyse.data.lignes[0];
    if (ligne === undefined) throw new Error("ligne absente");
    const editee = versLigneImport(depuisLigneEnRevue(ligne));
    if (editee === null) throw new Error("ligne ignorée");
    const nbLotsAvant = await prisma.importBatch.count({ where: { accountId } });
    const resultat = await enregistrerImport({
      accountId,
      libelle: null,
      lignes: [
        {
          ...editee,
          ventilation: [
            { subcategoryId: epicerieId, montant: "-33,30" },
            { subcategoryId: cafeId, montant: "-33,30" },
            { subcategoryId: restaurantId, montant: "-33,40" },
          ],
        },
      ],
    });
    expect(resultat).toMatchObject({
      ok: false,
      code: "VALIDATION",
      message: `Il reste ${formatMontant(1)} à répartir.`,
    });
    expect(await prisma.transaction.count({ where: { ownerId, description: { contains: `${BASE}4` } } })).toBe(0);
    expect(await prisma.importBatch.count({ where: { accountId } })).toBe(nbLotsAvant);
  });

  it("IM5 — le garde-fou actionsVentilationIgnorees n'existe plus", async () => {
    const analyse = await analyser(`${BASE}5`);
    expect("actionsVentilationIgnorees" in analyse.data).toBe(false);
  });

  it("IM6 — une ventilation qui vise une sous-catégorie supprimée rend la règle inapplicable, visiblement", async () => {
    const marque6 = marqueur("TESTORPH");
    const categorie = await prisma.subcategory.findUniqueOrThrow({ where: { id: epicerieId }, select: { categoryId: true } });
    const orpheline = await prisma.subcategory.create({
      data: { categoryId: categorie.categoryId, nom: `Ventil orpheline ${marque6}` },
    });
    const seconde = await prisma.rule.create({
      data: {
        ownerId,
        libelle: `Ventil orpheline import ${marque6}`,
        priorite: 50,
        conditions: { create: [{ champ: "DESCRIPTION", operateur: "CONTIENT", valeur: marque6 }] },
        actions: {
          create: [
            {
              type: "VENTILER",
              valeur: serialiserPartsVentilation([
                { subcategoryId: orpheline.id, partMille: 500 },
                { subcategoryId: cafeId, partMille: 500 },
              ]),
              ordre: 0,
            },
          ],
        },
      },
    });
    idsRegleACreer.push(seconde.id);
    try {
      await prisma.subcategory.delete({ where: { id: orpheline.id } });
      expect(await prisma.ruleAction.count({ where: { ruleId: seconde.id } })).toBe(1);

      const analyse = await analyser(marque6);
      expect(analyse.data.reglesInapplicables.filter((r) => r.ruleId === seconde.id)).toEqual([
        expect.objectContaining({ ruleId: seconde.id, motif: "VENTILATION_ILLISIBLE" }),
      ]);
      const ligne = analyse.data.lignes[0];
      if (ligne === undefined) throw new Error("ligne absente");
      expect(ligne).toMatchObject({ ventilation: null, subcategoryId: null, regleAppliqueeId: null });

      const entree = versLigneImport(depuisLigneEnRevue(ligne));
      if (entree === null) throw new Error("ligne ignorée");
      const resultat = await enregistrer([entree]);
      expect(resultat.ok).toBe(true);
      if (!resultat.ok) return;
      const parent = await prisma.transaction.findFirstOrThrow({ where: { importBatchId: resultat.data.importBatchId } });
      expect(parent).toMatchObject({ estVentilee: false, subcategoryId: null, appliedRuleId: null });
      expect(await prisma.transaction.count({ where: { parentId: parent.id } })).toBe(0);
      await exigerInvariants(prisma, { type: "TRANSACTIONS", ids: [parent.id] });
    } finally {
      await prisma.rule.deleteMany({ where: { id: seconde.id } });
      await prisma.subcategory.deleteMany({ where: { id: orpheline.id } });
    }
  });
});

describe("import.ts — virements à l'import (docs/lot-m2.md §4.5)", () => {
  const MARQUE = marqueur("TESTVIR");
  const idsComptes: string[] = [];
  let idUtilisateur2 = "";

  function fixture(nom: "virement-cheque" | "virement-visa"): string {
    return readFileSync(new URL(`../../domain/statement/fixtures/${nom}.txt`, import.meta.url), "utf8");
  }

  async function creerCompte(nom: string, type: "CHEQUE" | "CREDIT", proprietaire: string = ownerId): Promise<string> {
    const compte = await prisma.account.create({
      data: { ownerId: proprietaire, nom: `${nom} ${MARQUE}`, type, dateSoldeInitial: versDateUtc("2099-01-01"), estBudgetaire: false },
      select: { id: true },
    });
    idsComptes.push(compte.id);
    return compte.id;
  }

  async function creerCouple(suffixe: string): Promise<{ cheque: string; visa: string; nomCheque: string }> {
    const cheque = await creerCompte(`Chq ${suffixe}`, "CHEQUE");
    const visa = await creerCompte(`Visa ${suffixe}`, "CREDIT");
    return { cheque, visa, nomCheque: `Chq ${suffixe} ${MARQUE}` };
  }

  async function analyser(compte: string, nom: "virement-cheque" | "virement-visa") {
    const analyse = await analyserReleveColle({ accountId: compte, annee: ANNEE_TEST, profilId: PROFIL_ID, texte: fixture(nom) });
    if (!analyse.ok) {
      throw new Error(`l'analyse a échoué : ${analyse.message}`);
    }
    return analyse.data;
  }

  function ligneDe(lignes: readonly LigneEnRevue[], description: string): LigneEnRevue {
    const ligne = lignes.find((l) => l.description === description);
    if (ligne === undefined) {
      throw new Error(`ligne absente : ${description}`);
    }
    return ligne;
  }

  function entrees(lignes: readonly LigneEnRevue[]): EntreeLigneImport[] {
    return lignes.map((l) => {
      const entree = versLigneImport(depuisLigneEnRevue(l));
      if (entree === null) {
        throw new Error("ligne ignorée");
      }
      return entree;
    });
  }

  async function enregistrer(compte: string, lignes: EntreeLigneImport[]) {
    const resultat = await enregistrerImport({ accountId: compte, libelle: null, lignes });
    if (resultat.ok) {
      idsImportBatchACreer.push(resultat.data.importBatchId);
    }
    return resultat;
  }

  beforeAll(async () => {
    idUtilisateur2 = (await prisma.user.create({ data: { email: `import-vir-u2-${MARQUE}@example.test` }, select: { id: true } })).id;
  });

  afterAll(async () => {
    // Délier d'abord : le pointeur est une clé étrangère.
    await prisma.transaction.updateMany({
      where: { accountId: { in: idsComptes } },
      data: { transferTransactionId: null, transferAccountId: null },
    });
    await prisma.transaction.deleteMany({ where: { accountId: { in: idsComptes } } });
    await prisma.importBatch.deleteMany({ where: { accountId: { in: idsComptes } } });
    await prisma.account.deleteMany({ where: { id: { in: idsComptes } } });
    await prisma.user.deleteMany({ where: { id: idUtilisateur2 } });
  });

  it("IV1 — import d'un lot qui crée un virement : paire liée, rien de catégorisé, hors de l'activité, invariants tenus", async () => {
    const { cheque, visa } = await creerCouple("IV1");

    // 1. Le chèque.
    const analyseCheque = await analyser(cheque, "virement-cheque");
    expect(analyseCheque.lignes).toHaveLength(2);
    expect(analyseCheque.lignes.every((l) => l.virementAvec === null)).toBe(true);
    const enregistreCheque = await enregistrer(cheque, entrees(analyseCheque.lignes));
    expect(enregistreCheque.ok).toBe(true);
    const ligneChequeEnBase = await prisma.transaction.findFirstOrThrow({
      where: { accountId: cheque, description: "VISA DESJARDINS" },
      select: { id: true },
    });

    // 2. La Visa : « Paiement. » a un seul candidat, la ligne du chèque ; la librairie aucun.
    const analyseVisa = await analyser(visa, "virement-visa");
    const paiement = ligneDe(analyseVisa.lignes, "Paiement.");
    expect(paiement.candidatsVirement).toHaveLength(1);
    expect(paiement.candidatsVirement[0]).toMatchObject({
      id: ligneChequeEnBase.id,
      accountId: cheque,
      description: "VISA DESJARDINS",
      date: "2099-05-12",
      montantCents: -48713,
    });
    expect(paiement.virementAvec).toBe(ligneChequeEnBase.id);
    const librairie = ligneDe(analyseVisa.lignes, "Librairie Imaginaire");
    expect(librairie.candidatsVirement).toEqual([]);
    expect(librairie.virementAvec).toBeNull();

    // 3. Enregistrement.
    const resultat = await enregistrer(visa, entrees(analyseVisa.lignes));
    expect(resultat.ok).toBe(true);
    if (!resultat.ok) {
      return;
    }
    expect(resultat.data.virementsLies).toBe(1);

    // 4. En base.
    const cote = await prisma.transaction.findFirstOrThrow({ where: { accountId: visa, description: "Paiement." } });
    const autre = await prisma.transaction.findUniqueOrThrow({ where: { id: ligneChequeEnBase.id } });
    expect(cote).toMatchObject({
      transferTransactionId: autre.id,
      transferAccountId: cheque,
      subcategoryId: null,
      appliedRuleId: null,
      montantCents: 48713,
    });
    expect(autre).toMatchObject({
      transferTransactionId: cote.id,
      transferAccountId: visa,
      subcategoryId: null,
      appliedRuleId: null,
      montantCents: -48713,
    });
    // La ligne qui n'est pas un virement reste ordinaire.
    const libEnBase = await prisma.transaction.findFirstOrThrow({ where: { accountId: visa, description: "Librairie Imaginaire" } });
    expect(libEnBase.transferTransactionId).toBeNull();

    // 5. Hors de l'activité des enveloppes.
    for (const t of [cote, autre]) {
      expect(
        entreDansActivite({
          subcategoryId: t.subcategoryId,
          estVentilee: t.estVentilee,
          transferTransactionId: t.transferTransactionId,
          exclureDuBudget: t.exclureDuBudget,
          parent: null,
        }),
      ).toBe(false);
    }

    // 6. Invariants.
    await exigerInvariants(prisma, { type: "TRANSACTIONS", ids: [cote.id, autre.id, libEnBase.id] });
  });

  it("IV1 — une règle appliquée forgée par le client n'est pas écrite sur une ligne virement", async () => {
    const { cheque, visa } = await creerCouple("IV1b");
    await enregistrer(cheque, entrees((await analyser(cheque, "virement-cheque")).lignes));
    const analyseVisa = await analyser(visa, "virement-visa");
    const paiement = ligneDe(analyseVisa.lignes, "Paiement.");
    const regle = await prisma.rule.findFirstOrThrow({ where: { ownerId }, select: { id: true } });
    const forgee = versEntree(paiement, { subcategoryId: null, appliedRuleId: regle.id, virementAvec: paiement.virementAvec });
    expect(forgee.virementAvec).not.toBeNull();
    const resultat = await enregistrer(visa, [forgee]);
    expect(resultat.ok).toBe(true);
    const cote = await prisma.transaction.findFirstOrThrow({ where: { accountId: visa, description: "Paiement." } });
    expect(cote.transferTransactionId).not.toBeNull();
    expect(cote).toMatchObject({ subcategoryId: null, appliedRuleId: null });
  });

  it("IV2 — CONFLICT : la ligne du chèque est liée ailleurs avant l'enregistrement, rien n'est écrit", async () => {
    const { cheque, visa } = await creerCouple("IV2");
    const tiers = await creerCompte("Tiers IV2", "CHEQUE");
    await enregistrer(cheque, entrees((await analyser(cheque, "virement-cheque")).lignes));
    const ligneCheque = await prisma.transaction.findFirstOrThrow({
      where: { accountId: cheque, description: "VISA DESJARDINS" },
      select: { id: true },
    });

    const analyseVisa = await analyser(visa, "virement-visa");
    expect(ligneDe(analyseVisa.lignes, "Paiement.").virementAvec).toBe(ligneCheque.id);

    // Entre l'analyse et l'enregistrement, la ligne du chèque est liée à une transaction manuelle du compte tiers.
    const manuelle = await prisma.transaction.create({
      data: {
        ownerId,
        accountId: tiers,
        date: versDateUtc("2099-05-13"),
        description: `Tiers IV2 ${MARQUE}`,
        descriptionNormalisee: normaliserDescription(`Tiers IV2 ${MARQUE}`),
        montantCents: 48713,
        source: "MANUELLE",
        empreinte: `iv2-${MARQUE}`,
      },
      select: { id: true },
    });
    const liee = await lierVirement({ id: ligneCheque.id, contrepartieId: manuelle.id });
    expect(liee.ok).toBe(true);

    const resultat = await enregistrerImport({ accountId: visa, libelle: null, lignes: entrees(analyseVisa.lignes) });
    expect(resultat.ok).toBe(false);
    if (resultat.ok) {
      return;
    }
    expect(resultat.code).toBe("CONFLICT");
    expect(resultat.message).toContain("Rien n'a été enregistré");
    expect(await prisma.transaction.count({ where: { accountId: visa } })).toBe(0);
    expect(await prisma.importBatch.count({ where: { accountId: visa } })).toBe(0);
    // La paire existante n'a pas bougé.
    expect(await prisma.transaction.findUniqueOrThrow({ where: { id: ligneCheque.id } })).toMatchObject({
      transferTransactionId: manuelle.id,
    });
    await exigerInvariants(prisma, { type: "TRANSACTIONS", ids: [ligneCheque.id, manuelle.id] });
  });

  it("IV6 — course : la cible est liée pendant l'attente du verrou ; refus métier lu après le verrou, rien n'est écrit", async () => {
    const { cheque, visa } = await creerCouple("IV6");
    const tiers = await creerCompte("Tiers IV6", "CHEQUE");
    await enregistrer(cheque, entrees((await analyser(cheque, "virement-cheque")).lignes));
    const ligneCheque = await prisma.transaction.findFirstOrThrow({
      where: { accountId: cheque, description: "VISA DESJARDINS" },
      select: { id: true },
    });
    const analyseVisa = await analyser(visa, "virement-visa");
    const paiement = ligneDe(analyseVisa.lignes, "Paiement.");
    expect(paiement.virementAvec).toBe(ligneCheque.id);
    const manuelle = await prisma.transaction.create({
      data: {
        ownerId,
        accountId: tiers,
        date: versDateUtc("2099-05-13"),
        description: `Tiers IV6 ${MARQUE}`,
        descriptionNormalisee: normaliserDescription(`Tiers IV6 ${MARQUE}`),
        montantCents: 48713,
        source: "MANUELLE",
        empreinte: `iv6-${MARQUE}`,
      },
      select: { id: true },
    });

    const verrou = await tenirVerrou(prisma, ligneCheque.id);
    const enCours = enregistrerImport({ accountId: visa, libelle: null, lignes: entrees(analyseVisa.lignes) });
    try {
      await verrou.attendreUnBloque();
    } catch (erreur) {
      await verrou.relacher();
      await enCours.catch(() => undefined);
      throw erreur;
    }
    await verrou.relacher(async (tx) => {
      await tx.transaction.update({
        where: { id: ligneCheque.id },
        data: { transferTransactionId: manuelle.id, transferAccountId: tiers },
      });
      await tx.transaction.update({
        where: { id: manuelle.id },
        data: { transferTransactionId: ligneCheque.id, transferAccountId: cheque },
      });
    });

    const resultat = await enCours;
    expect(resultat).toMatchObject({
      ok: false,
      code: "CONFLICT",
      details: { lignes: [{ cle: paiement.cle, motif: { motif: "DEJA_LIEE", cote: "SECONDE" } }] },
    });
    expect(await prisma.transaction.count({ where: { accountId: visa } })).toBe(0);
    expect(await prisma.importBatch.count({ where: { accountId: visa } })).toBe(0);
    expect(await prisma.transaction.findUniqueOrThrow({ where: { id: ligneCheque.id } })).toMatchObject({
      transferTransactionId: manuelle.id,
    });
    await exigerInvariants(prisma, { type: "TRANSACTIONS", ids: [ligneCheque.id, manuelle.id] });
  });

  it("IV3 — VIREMENT_EXISTANT : une contrepartie créée à la main ressort en doublon réactivable, sans candidat", async () => {
    const { cheque, visa, nomCheque } = await creerCouple("IV3");
    await enregistrer(cheque, entrees((await analyser(cheque, "virement-cheque")).lignes));
    const ligneCheque = await prisma.transaction.findFirstOrThrow({
      where: { accountId: cheque, description: "VISA DESJARDINS" },
      select: { id: true },
    });
    const creee = await creerContrepartie({ id: ligneCheque.id, accountId: visa });
    expect(creee.ok).toBe(true);
    if (!creee.ok) {
      return;
    }

    const analyseVisa = await analyser(visa, "virement-visa");
    const paiement = ligneDe(analyseVisa.lignes, "Paiement.");
    expect(paiement).toMatchObject({ statutDoublon: "VIREMENT_EXISTANT", action: "IGNORER", section: "DOUBLONS" });
    expect(paiement.doublonDe?.id).toBe(creee.data.contrepartieId);
    expect(paiement.doublonDe?.virement).toEqual({ compteNom: nomCheque });
    expect(paiement.candidatsVirement).toEqual([]);
    expect(paiement.virementAvec).toBeNull();
    // La ligne en regard dit ce qu'elle est.
    expect(ligneDe(analyseVisa.lignes, "Librairie Imaginaire").statutDoublon).toBe("AUCUN");
    await exigerInvariants(prisma, { type: "TRANSACTIONS", ids: [ligneCheque.id, creee.data.contrepartieId] });
  });

  it("IV4 — refus du schéma : virementAvec avec une sous-catégorie, ou deux lignes sur la même cible ; rien d'écrit", async () => {
    const { visa } = await creerCouple("IV4");
    const cible = "clx0000000000000000000041";
    const avecSousCategorie = await enregistrerImport({
      accountId: visa,
      libelle: null,
      lignes: [ligneManuelle({ cle: "a", accountId: visa, virementAvec: cible, subcategoryId })],
    });
    expect(avecSousCategorie).toMatchObject({ ok: false, code: "VALIDATION" });
    expect(avecSousCategorie.ok ? "" : avecSousCategorie.message).toContain(
      "Une ligne marquée virement ne porte pas de sous-catégorie.",
    );

    const memeCible = await enregistrerImport({
      accountId: visa,
      libelle: null,
      lignes: [
        ligneManuelle({ cle: "a", accountId: visa, virementAvec: cible, description: marqueur("IV4A") }),
        ligneManuelle({ cle: "b", accountId: visa, virementAvec: cible, description: marqueur("IV4B") }),
      ],
    });
    expect(memeCible).toMatchObject({ ok: false, code: "VALIDATION" });
    expect(memeCible.ok ? "" : memeCible.message).toContain("Deux lignes visent le même virement.");

    expect(await prisma.transaction.count({ where: { accountId: visa } })).toBe(0);
    expect(await prisma.importBatch.count({ where: { accountId: visa } })).toBe(0);
  });

  it("IV5 — cible introuvable : inexistante ou d'un autre propriétaire → CONFLICT, rien d'écrit", async () => {
    const { visa } = await creerCouple("IV5");
    const compteEtranger = await creerCompte("Etranger IV5", "CHEQUE", idUtilisateur2);
    const etrangere = await prisma.transaction.create({
      data: {
        ownerId: idUtilisateur2,
        accountId: compteEtranger,
        date: versDateUtc("2099-02-01"),
        description: `Etranger IV5 ${MARQUE}`,
        descriptionNormalisee: normaliserDescription(`Etranger IV5 ${MARQUE}`),
        montantCents: 1000,
        source: "MANUELLE",
        empreinte: `iv5-${MARQUE}`,
      },
      select: { id: true },
    });

    for (const cible of [CUID_INEXISTANT, etrangere.id]) {
      const resultat = await enregistrerImport({
        accountId: visa,
        libelle: null,
        lignes: [ligneManuelle({ cle: "a", accountId: visa, montant: "-10,00", virementAvec: cible, description: marqueur("IV5") })],
      });
      expect(resultat).toMatchObject({ ok: false, code: "CONFLICT" });
      expect(resultat.ok ? "" : resultat.message).toContain("Rien n'a été enregistré");
    }
    expect(await prisma.transaction.count({ where: { accountId: visa } })).toBe(0);
    expect(await prisma.importBatch.count({ where: { accountId: visa } })).toBe(0);
    expect(await prisma.transaction.findUniqueOrThrow({ where: { id: etrangere.id } })).toMatchObject({
      transferTransactionId: null,
    });
  });

  it("IV5 — une cible qui ne s'annule pas avec la ligne (montant, compte) : CONFLICT, rien d'écrit", async () => {
    const { visa } = await creerCouple("IV5b");
    const autreCompte = await creerCompte("Autre IV5b", "CHEQUE");
    const cible = await prisma.transaction.create({
      data: {
        ownerId,
        accountId: autreCompte,
        date: versDateUtc("2099-02-01"),
        description: `Cible IV5b ${MARQUE}`,
        descriptionNormalisee: normaliserDescription(`Cible IV5b ${MARQUE}`),
        montantCents: 999,
        source: "MANUELLE",
        empreinte: `iv5b-${MARQUE}`,
      },
      select: { id: true },
    });
    const resultat = await enregistrerImport({
      accountId: visa,
      libelle: null,
      lignes: [ligneManuelle({ cle: "a", accountId: visa, montant: "-10,00", virementAvec: cible.id, description: marqueur("IV5B") })],
    });
    expect(resultat).toMatchObject({ ok: false, code: "CONFLICT" });
    expect(resultat.ok ? "" : resultat.message).toMatch(/n'est plus possible/);
    expect(await prisma.transaction.count({ where: { accountId: visa } })).toBe(0);
  });
});

describe("rapprochement à l'import (docs/lot-m3.md §4.5)", () => {
  const M = randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();
  const motif = marqueur("RAPPR");
  const motifFin = marqueur("RAPPRFIN");
  const LIBELLE = `Rappr ${M}`;
  const MOIS_FR = [
    "janvier",
    "février",
    "mars",
    "avril",
    "mai",
    "juin",
    "juillet",
    "août",
    "septembre",
    "octobre",
    "novembre",
    "décembre",
  ] as const;
  const auj = dateCivileDansFuseau(new Date(), FUSEAU_APPLICATION);

  let compteId = "";
  let ruleId = "";
  let sousCategorieS = "";
  let sousCategorieS2 = "";
  let regleCategorisationId = "";
  const occurrenceIds = new Map<string, string>();
  const idsRegles: string[] = [];

  beforeAll(async () => {
    sousCategorieS = subcategoryId;
    sousCategorieS2 = (
      await prisma.subcategory.findFirstOrThrow({
        where: { category: { ownerId }, masquee: false, systeme: false, id: { not: sousCategorieS } },
        select: { id: true },
      })
    ).id;
    compteId = (
      await prisma.account.create({
        data: { ownerId, nom: LIBELLE, estBudgetaire: false, dateSoldeInitial: versDateUtc("2099-01-01") },
        select: { id: true },
      })
    ).id;
    espions.comptesProlonges.add(compteId);
    ruleId = (
      await prisma.recurringRule.create({
        data: {
          ownerId,
          accountId: compteId,
          libelle: LIBELLE,
          nature: "FIXE",
          montantCents: -101743,
          cadence: "MENSUEL",
          dateAncrage: versDateUtc("2099-01-12"),
          subcategoryId: sousCategorieS,
          motifRapprochement: normaliserDescription(motif),
          toleranceCents: 500,
          toleranceJours: 3,
          scoreConfiance: 0.9,
          actif: true,
        },
        select: { id: true },
      })
    ).id;
    idsRegles.push(ruleId);
    await prisma.expectedOccurrence.createMany({
      data: occurrencesAMaterialiser(
        { cadence: "MENSUEL", dateAncrage: "2099-01-12", dateFin: null, montantCents: -101743 },
        horizonOccurrences("2099-06-30"),
      ).map((o) => ({ ruleId, echeance: versDateUtc(o.echeance), montantCents: o.montantCents, etat: "PREVUE" as const })),
    });
    const occurrences = await prisma.expectedOccurrence.findMany({ where: { ruleId }, select: { id: true, echeance: true }, take: 100 });
    for (const o of occurrences) {
      occurrenceIds.set(o.echeance.toISOString().slice(0, 10), o.id);
    }
    regleCategorisationId = (
      await prisma.rule.create({
        data: {
          ownerId,
          libelle: `Rappr règle ${M}`,
          priorite: 50,
          conditions: { create: [{ champ: "DESCRIPTION", operateur: "CONTIENT", valeur: `${motif} REGLE` }] },
          actions: { create: [{ type: "CATEGORISER", subcategoryId: sousCategorieS2, ordre: 0 }] },
        },
        select: { id: true },
      })
    ).id;
  });

  afterAll(async () => {
    await prisma.recurringRule.deleteMany({ where: { accountId: compteId } });
    await prisma.transaction.deleteMany({ where: { accountId: compteId } });
    await prisma.importBatch.deleteMany({ where: { accountId: compteId } });
    await prisma.rule.deleteMany({ where: { id: regleCategorisationId } });
    await prisma.account.deleteMany({ where: { id: compteId } });
    espions.comptesProlonges.delete(compteId);
  });

  beforeEach(() => {
    vi.mocked(rechercherSuggestions).mockClear();
    vi.mocked(prolongerHorizonDuCompte).mockClear();
  });

  function occ(echeance: string): string {
    const id = occurrenceIds.get(echeance);
    if (id === undefined) {
      throw new Error(`occurrence absente : ${echeance}`);
    }
    return id;
  }

  function texte(echeance: string, description: string, montant: string): string {
    const [, mm, jj] = echeance.split("-");
    return `${String(Number(jj))} ${MOIS_FR[Number(mm) - 1] ?? ""} ${description} ${montant} $`;
  }

  async function analyser(...lignes: readonly string[]) {
    const analyse = await analyserReleveColle({
      accountId: compteId,
      annee: ANNEE_TEST,
      profilId: PROFIL_ID,
      texte: lignes.join("\n"),
    });
    if (!analyse.ok) {
      throw new Error(`l'analyse a échoué : ${analyse.message}`);
    }
    return analyse.data;
  }

  function ligneAvec(lignes: readonly LigneEnRevue[], date: string, description: string = motif): LigneEnRevue {
    const ligne = lignes.find((l) => l.date === date && l.description === description);
    if (ligne === undefined) {
      throw new Error(`ligne absente : ${date} ${description}`);
    }
    return ligne;
  }

  function envoi(ligne: LigneEnRevue): EntreeLigneImport {
    const entree = versLigneImport(depuisLigneEnRevue(ligne));
    if (entree === null) {
      throw new Error("ligne ignorée");
    }
    return entree;
  }

  async function enregistrer(lignes: EntreeLigneImport[]) {
    const resultat = await enregistrerImport({ accountId: compteId, libelle: null, lignes });
    if (resultat.ok) {
      idsImportBatchACreer.push(resultat.data.importBatchId);
    }
    return resultat;
  }

  async function occurrenceEnBase(echeance: string) {
    return prisma.expectedOccurrence.findUniqueOrThrow({ where: { id: occ(echeance) } });
  }

  async function transactionEnBase(date: string, description: string = motif) {
    return prisma.transaction.findFirstOrThrow({ where: { accountId: compteId, date: versDateUtc(date), description } });
  }

  async function nbTransactionsEtLots(): Promise<readonly [number, number]> {
    return [
      await prisma.transaction.count({ where: { accountId: compteId } }),
      await prisma.importBatch.count({ where: { accountId: compteId } }),
    ];
  }

  async function verifierInvariantsApres(transactionIds: readonly string[]) {
    await exigerInvariantsOccurrences(prisma, { type: "REGLES", ruleIds: idsRegles });
    await exigerInvariants(prisma, { type: "TRANSACTIONS", ids: transactionIds });
  }

  it("IR1 — une ligne conforme est rapprochée : liaison AUTO, catégorie de la récurrence, détection après import", async () => {
    const analyse = await analyser(texte("2099-01-12", motif, "1 017,43"));
    const ligne = ligneAvec(analyse.lignes, "2099-01-12");
    expect(ligne.montantCents).toBe(-101743);
    expect(ligne.candidatsOccurrence).toHaveLength(1);
    expect(ligne.occurrenceAvec).toBe(occ("2099-01-12"));
    expect(ligne.subcategoryId).toBe(sousCategorieS);
    expect(ligne.categorieHeritee).toBe(true);
    expect(analyse.occurrencesTronquees).toBe(false);

    const resultat = await enregistrer([envoi(ligne)]);
    expect(resultat.ok).toBe(true);
    if (!resultat.ok) return;
    expect(resultat.data.occurrencesLiees).toBe(1);

    const tx = await transactionEnBase("2099-01-12");
    const o = await occurrenceEnBase("2099-01-12");
    expect(o).toMatchObject({ transactionId: tx.id, liaison: "AUTO", etat: "REALISEE" });
    expect(o.lieeLe).not.toBeNull();
    expect(tx).toMatchObject({ subcategoryId: sousCategorieS, appliedRuleId: null });

    expect(vi.mocked(rechercherSuggestions)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(rechercherSuggestions)).toHaveBeenCalledWith(ownerId);
    expect(vi.mocked(prolongerHorizonDuCompte).mock.lastCall).toEqual([
      ownerId,
      compteId,
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    ]);
    await verifierInvariantsApres([tx.id]);
  });

  it("IR2 — un montant différent n'est pas pré-rempli : candidat à confirmer, ce qui cloche est dit ; sans choix, rien n'est lié", async () => {
    const analyse = await analyser(texte("2099-02-12", motif, "1 029,99"));
    const ligne = ligneAvec(analyse.lignes, "2099-02-12");
    expect(ligne.occurrenceAvec).toBeNull();
    expect(ligne.candidatsOccurrence[0]?.cloche).toEqual([
      `montant de ${formatMontant(102999)} au lieu de ${formatMontant(101743)} attendu`,
    ]);
    expect(ligne.subcategoryId).toBeNull();

    const resultat = await enregistrer([envoi(ligne)]);
    expect(resultat.ok).toBe(true);
    if (!resultat.ok) return;
    expect(resultat.data.occurrencesLiees).toBe(0);
    expect((await occurrenceEnBase("2099-02-12")).transactionId).toBeNull();
    await verifierInvariantsApres([(await transactionEnBase("2099-02-12")).id]);
  });

  it("IR3 — un choix manuel : liaison MANUELLE, état « montant différent », catégorie de la récurrence", async () => {
    const analyse = await analyser(texte("2099-03-14", motif, "1 029,99"));
    const ligne = ligneAvec(analyse.lignes, "2099-03-14");
    const editee = depuisLigneEnRevue(ligne);
    const entree = versLigneImport({ ...editee, ...choisirOccurrence(editee, occ("2099-03-12")) });
    expect(entree?.occurrenceAuto).toBe(false);
    expect(entree?.occurrenceAvec).toBe(occ("2099-03-12"));
    if (entree === null) return;

    const resultat = await enregistrer([entree]);
    expect(resultat.ok).toBe(true);
    const tx = await transactionEnBase("2099-03-14");
    expect(await occurrenceEnBase("2099-03-12")).toMatchObject({
      transactionId: tx.id,
      liaison: "MANUELLE",
      etat: "REALISEE_MONTANT_DIFFERENT",
    });
    expect(tx.subcategoryId).toBe(sousCategorieS);
    await verifierInvariantsApres([tx.id]);
  });

  it("IR4 — une ligne à plus de dix jours de toute échéance n'a aucun candidat", async () => {
    const analyse = await analyser(texte("2099-04-27", motif, "1 017,43"));
    expect(ligneAvec(analyse.lignes, "2099-04-27").candidatsOccurrence).toEqual([]);
  });

  it("IR5 — deux lignes sur la même échéance : VALIDATION, rien d'écrit", async () => {
    const analyse = await analyser(texte("2099-05-12", motif, "1 017,43"), texte("2099-05-13", motif, "1 017,43"));
    const l1 = ligneAvec(analyse.lignes, "2099-05-12");
    const l2 = ligneAvec(analyse.lignes, "2099-05-13");
    expect(l1.occurrenceAvec).toBe(occ("2099-05-12"));
    expect(l2.occurrenceAvec).toBe(occ("2099-05-12"));

    const avant = await nbTransactionsEtLots();
    const resultat = await enregistrerImport({ accountId: compteId, libelle: null, lignes: [envoi(l1), envoi(l2)] });
    expect(resultat).toMatchObject({ ok: false, code: "VALIDATION", message: "Deux lignes visent la même échéance." });
    expect(await nbTransactionsEtLots()).toEqual(avant);
    expect((await occurrenceEnBase("2099-05-12")).transactionId).toBeNull();
  });

  it("IR6 — l'échéance est liée ailleurs avant l'enregistrement : CONFLICT nommé, rien d'écrit, pas de détection", async () => {
    const analyse = await analyser(texte("2099-06-12", motif, "1 017,43"));
    const ligne = ligneAvec(analyse.lignes, "2099-06-12");
    expect(ligne.occurrenceAvec).toBe(occ("2099-06-12"));

    const description = `${motif} MANUEL`;
    const manuelle = await prisma.transaction.create({
      data: {
        ownerId,
        accountId: compteId,
        date: versDateUtc("2099-06-11"),
        description,
        descriptionNormalisee: normaliserDescription(description),
        montantCents: -101743,
        source: "MANUELLE",
        empreinte: `ir6-${M}`,
      },
      select: { id: true },
    });
    const liee = await lierOccurrence({ occurrenceId: occ("2099-06-12"), transactionId: manuelle.id });
    expect(liee.ok).toBe(true);

    const avant = await nbTransactionsEtLots();
    vi.mocked(rechercherSuggestions).mockClear();
    const resultat = await enregistrer([envoi(ligne)]);
    expect(resultat).toMatchObject({
      ok: false,
      code: "CONFLICT",
      message: `Rien n'a été enregistré : le paiement ${LIBELLE} du 12 juin vient d'être lié ailleurs.`,
    });
    expect(await nbTransactionsEtLots()).toEqual(avant);
    expect(
      await prisma.transaction.count({
        where: { empreinte: calculerEmpreinte(compteId, "2099-06-12", -101743, normaliserDescription(motif)) },
      }),
    ).toBe(0);
    expect(vi.mocked(rechercherSuggestions)).not.toHaveBeenCalled();
    expect((await occurrenceEnBase("2099-06-12")).transactionId).toBe(manuelle.id);
    await verifierInvariantsApres([manuelle.id]);
  });

  it("IR7 — une règle de catégorisation l'emporte sur la catégorie de la récurrence", async () => {
    const description = `${motif} REGLE`;
    const analyse = await analyser(texte("2099-07-12", description, "1 017,43"));
    const ligne = ligneAvec(analyse.lignes, "2099-07-12", description);
    expect(ligne.occurrenceAvec).toBe(occ("2099-07-12"));
    expect(ligne.subcategoryId).toBe(sousCategorieS2);
    expect(ligne.regleAppliqueeId).toBe(regleCategorisationId);
    expect(ligne.categorieHeritee).toBe(false);

    const resultat = await enregistrer([envoi(ligne)]);
    expect(resultat.ok).toBe(true);
    const tx = await transactionEnBase("2099-07-12", description);
    expect(tx).toMatchObject({ subcategoryId: sousCategorieS2, appliedRuleId: regleCategorisationId });
    expect(await occurrenceEnBase("2099-07-12")).toMatchObject({ transactionId: tx.id, liaison: "AUTO" });
    await verifierInvariantsApres([tx.id]);
  });

  it("IR8 — une ligne envoyée avec le compte Chèque vise une échéance d'un autre compte : CONFLICT, rien d'écrit", async () => {
    const description = `${motif} CHQ`;
    const analyse = await analyser(texte("2099-08-12", description, "1 017,43"));
    const ligne = ligneAvec(analyse.lignes, "2099-08-12", description);
    expect(ligne.occurrenceAvec).toBe(occ("2099-08-12"));

    const resultat = await enregistrer([{ ...envoi(ligne), accountId }]);
    expect(resultat).toMatchObject({
      ok: false,
      code: "CONFLICT",
      message: `Rien n'a été enregistré : l'échéance ${LIBELLE} du 12 août n'est pas du compte de la ligne du 2099-08-12.`,
    });
    expect(await prisma.transaction.count({ where: { description } })).toBe(0);
    expect((await occurrenceEnBase("2099-08-12")).transactionId).toBeNull();
  });

  it("IR9 — un drapeau « automatique » forgé sur une ligne qui n'est pas conforme : liaison MANUELLE, pas un refus", async () => {
    const analyse = await analyser(texte("2099-09-13", motif, "1 029,99"));
    const ligne = ligneAvec(analyse.lignes, "2099-09-13");
    expect(ligne.occurrenceAvec).toBeNull();

    const resultat = await enregistrer([{ ...envoi(ligne), occurrenceAvec: occ("2099-09-12"), occurrenceAuto: true }]);
    expect(resultat.ok).toBe(true);
    const tx = await transactionEnBase("2099-09-13");
    expect(await occurrenceEnBase("2099-09-12")).toMatchObject({
      transactionId: tx.id,
      liaison: "MANUELLE",
      etat: "REALISEE_MONTANT_DIFFERENT",
    });
    await verifierInvariantsApres([tx.id]);
  });

  it("IR10 — une échéance introuvable : CONFLICT nommé, rien d'écrit", async () => {
    const description = `${motif} FANTOME`;
    const avant = await nbTransactionsEtLots();
    const resultat = await enregistrer([
      ligneManuelle({
        cle: "fantome",
        accountId: compteId,
        date: "2099-12-12",
        description,
        montant: "-1017,43",
        occurrenceAvec: CUID_INEXISTANT,
      }),
    ]);
    expect(resultat).toMatchObject({
      ok: false,
      code: "CONFLICT",
      message: `Rien n'a été enregistré : l'échéance proposée pour la ligne du 2099-12-12 (${description}) n'existe plus.`,
    });
    expect(await nbTransactionsEtLots()).toEqual(avant);
  });

  it("IR11 — la date de la ligne change après l'analyse : l'échéance n'est plus candidate, CONFLICT, rien d'écrit", async () => {
    const analyse = await analyser(texte("2099-10-12", motif, "1 017,43"));
    const ligne = ligneAvec(analyse.lignes, "2099-10-12");
    expect(ligne.occurrenceAvec).toBe(occ("2099-10-12"));

    const avant = await nbTransactionsEtLots();
    const resultat = await enregistrer([{ ...envoi(ligne), date: "2099-10-30" }]);
    expect(resultat).toMatchObject({
      ok: false,
      code: "CONFLICT",
      message: `Rien n'a été enregistré : l'échéance ${LIBELLE} du 12 octobre ne correspond plus à la ligne du 2099-10-30.`,
    });
    expect(await nbTransactionsEtLots()).toEqual(avant);
    expect((await occurrenceEnBase("2099-10-12")).transactionId).toBeNull();
  });

  it("IR12 — le schéma refuse une mise à jour liée, et un drapeau automatique sans échéance", async () => {
    const miseAJour = await enregistrerImport({
      accountId: compteId,
      libelle: null,
      lignes: [
        ligneManuelle({
          cle: "maj",
          accountId: compteId,
          action: "METTRE_A_JOUR",
          transactionExistanteId: CUID_INEXISTANT,
          occurrenceAvec: CUID_INEXISTANT,
        }),
      ],
    });
    expect(miseAJour).toMatchObject({ ok: false, code: "VALIDATION", message: "Une mise à jour ne se lie pas à une échéance." });

    const automatique = await enregistrerImport({
      accountId: compteId,
      libelle: null,
      lignes: [ligneManuelle({ cle: "auto", accountId: compteId, occurrenceAvec: null, occurrenceAuto: true })],
    });
    expect(automatique).toMatchObject({
      ok: false,
      code: "VALIDATION",
      message: "Un rapprochement automatique vise une échéance.",
    });
  });

  it("IR13 — une détection ou une prolongation qui échoue après l'import se journalise, l'import reste enregistré", async () => {
    const espionErreur = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const analyse = await analyser(texte("2099-11-12", motif, "1 017,43"));
      const ligne = ligneAvec(analyse.lignes, "2099-11-12");
      expect(ligne.occurrenceAvec).toBe(occ("2099-11-12"));
      vi.mocked(rechercherSuggestions).mockRejectedValueOnce(new Error("détection en échec"));
      const resultat = await enregistrer([envoi(ligne)]);
      expect(resultat.ok).toBe(true);
      const tx = await transactionEnBase("2099-11-12");
      expect(await occurrenceEnBase("2099-11-12")).toMatchObject({ transactionId: tx.id });
      expect(espionErreur).toHaveBeenCalledWith("Détection des récurrences après import en échec", expect.any(Error));

      espionErreur.mockClear();
      const analyse2 = await analyser(texte("2099-04-12", motif, "1 017,43"));
      const ligne2 = ligneAvec(analyse2.lignes, "2099-04-12");
      expect(ligne2.occurrenceAvec).toBe(occ("2099-04-12"));
      vi.mocked(prolongerHorizonDuCompte).mockRejectedValueOnce(new Error("prolongation en échec"));
      const resultat2 = await enregistrer([envoi(ligne2)]);
      expect(resultat2.ok).toBe(true);
      const tx2 = await transactionEnBase("2099-04-12");
      expect(await occurrenceEnBase("2099-04-12")).toMatchObject({ transactionId: tx2.id });
      expect(espionErreur).toHaveBeenCalledWith("Prolongation des échéances après import en échec", expect.any(Error));
      await verifierInvariantsApres([tx.id, tx2.id]);
    } finally {
      espionErreur.mockRestore();
    }
  });

  it("IR14 — la fenêtre de candidats est la tolérance de la règle plus sept jours", async () => {
    const analyse = await analyser(texte("2099-12-22", motif, "1 017,43"), texte("2099-12-23", motif, "1 017,43"));
    const dixJours = ligneAvec(analyse.lignes, "2099-12-22");
    expect(dixJours.candidatsOccurrence.map((c) => c.occurrence.id)).toEqual([occ("2099-12-12")]);
    expect(dixJours.occurrenceAvec).toBeNull();
    expect(ligneAvec(analyse.lignes, "2099-12-23").candidatsOccurrence).toEqual([]);
  });

  it("IR15 — une série terminée ou inactive n'est ni candidate ni prolongée", async () => {
    const creerSerie = async (nom: string, surcharge: { readonly dateFin: Date | null; readonly actif: boolean }) => {
      const regle = await prisma.recurringRule.create({
        data: {
          ownerId,
          accountId: compteId,
          libelle: `${nom} ${M}`,
          nature: "FIXE",
          montantCents: -55555,
          cadence: "MENSUEL",
          dateAncrage: versDateUtc("2099-02-20"),
          subcategoryId: null,
          motifRapprochement: normaliserDescription(motifFin),
          toleranceCents: 500,
          toleranceJours: 3,
          scoreConfiance: 0.9,
          ...surcharge,
        },
        select: { id: true },
      });
      await prisma.expectedOccurrence.create({
        data: { ruleId: regle.id, echeance: versDateUtc("2099-02-20"), montantCents: -55555, etat: "PREVUE" },
      });
      return regle.id;
    };
    const terminee = await creerSerie("Terminée", { dateFin: versDateUtc("2099-12-31"), actif: true });
    const inactive = await creerSerie("Inactive", { dateFin: null, actif: false });

    const analyse = await analyser(texte("2099-02-20", motifFin, "555,55"));
    const ligne = ligneAvec(analyse.lignes, "2099-02-20", motifFin);
    expect(ligne.montantCents).toBe(-55555);
    expect(ligne.candidatsOccurrence).toEqual([]);
    expect(ligne.occurrenceAvec).toBeNull();
    expect(await prisma.expectedOccurrence.count({ where: { ruleId: terminee } })).toBe(1);
    expect(await prisma.expectedOccurrence.count({ where: { ruleId: inactive } })).toBe(1);
  });

  it("IR16 — la prolongation matérialise jusqu'à l'horizon, sans recréer ni dupliquer", async () => {
    const regle = await prisma.recurringRule.create({
      data: {
        ownerId,
        accountId: compteId,
        libelle: `Prolong ${M}`,
        nature: "FIXE",
        montantCents: -1000,
        cadence: "MENSUEL",
        dateAncrage: versDateUtc(auj),
        subcategoryId: null,
        motifRapprochement: normaliserDescription(`PROLONG ${M}`),
        toleranceCents: 500,
        toleranceJours: 3,
        scoreConfiance: 0.9,
        actif: true,
      },
      select: { id: true },
    });
    idsRegles.push(regle.id);
    await prisma.expectedOccurrence.create({ data: { ruleId: regle.id, echeance: versDateUtc(auj), montantCents: -1000 } });
    const attendues = occurrencesAMaterialiser(
      { cadence: "MENSUEL", dateAncrage: auj, dateFin: null, montantCents: -1000 },
      horizonOccurrences(auj),
    ).map((o) => o.echeance);
    const echeancesEnBase = async () =>
      (
        await prisma.expectedOccurrence.findMany({ where: { ruleId: regle.id }, orderBy: { echeance: "asc" }, select: { echeance: true }, take: 200 })
      ).map((o) => o.echeance.toISOString().slice(0, 10));

    await analyser(texte("2099-04-27", motif, "5,00"));
    expect(await echeancesEnBase()).toEqual(attendues);

    vi.mocked(prolongerHorizonDuCompte).mockClear();
    await analyser(texte("2099-04-27", motif, "5,00"));
    expect(await echeancesEnBase()).toEqual(attendues);
    expect(await vi.mocked(prolongerHorizonDuCompte).mock.results[0]?.value).toEqual({ echeancesCreees: 0 });
    await exigerInvariantsOccurrences(prisma, { type: "REGLES", ruleIds: [regle.id] }, { montantsAVenir: { aujourdhui: auj } });
  });

  it("IR16 bis — la prolongation part de la dernière échéance, jamais de l'ancrage : aucune échéance passée recréée", async () => {
    const ancrage = ajouterJours(auj, -120);
    const definition = { cadence: "MENSUEL" as const, dateAncrage: ancrage, dateFin: null, montantCents: -1000 };
    const passees = occurrencesAMaterialiser(definition, ajouterJours(auj, -1)).map((o) => o.echeance);
    const derniere = passees.at(-1);
    // Garde la prémisse : l'ancrage est assez loin pour que des échéances passées aient été retirées.
    expect(passees.length).toBeGreaterThan(1);
    if (derniere === undefined) throw new Error("aucune échéance antérieure à aujourd'hui");

    const regle = await prisma.recurringRule.create({
      data: {
        ownerId,
        accountId: compteId,
        libelle: `Prolong bis ${M}`,
        nature: "FIXE",
        montantCents: -1000,
        cadence: "MENSUEL",
        dateAncrage: versDateUtc(ancrage),
        subcategoryId: null,
        motifRapprochement: normaliserDescription(`PROLONG BIS ${M}`),
        toleranceCents: 500,
        toleranceJours: 3,
        scoreConfiance: 0.9,
        actif: true,
      },
      select: { id: true },
    });
    idsRegles.push(regle.id);
    try {
      await prisma.expectedOccurrence.create({ data: { ruleId: regle.id, echeance: versDateUtc(derniere), montantCents: -1000 } });
      const attendues = [
        derniere,
        ...occurrencesAPartirDe(definition, ajouterJours(derniere, 1), horizonOccurrences(auj)).map((o) => o.echeance),
      ];

      vi.mocked(prolongerHorizonDuCompte).mockClear();
      await analyser(texte("2099-04-27", motif, "5,00"));
      expect(vi.mocked(prolongerHorizonDuCompte)).toHaveBeenCalled();

      const enBase = (
        await prisma.expectedOccurrence.findMany({ where: { ruleId: regle.id }, orderBy: { echeance: "asc" }, select: { echeance: true }, take: 200 })
      ).map((o) => o.echeance.toISOString().slice(0, 10));
      expect(enBase).toEqual(attendues);
      expect(enBase.filter((e) => e < derniere)).toEqual([]);
      await exigerInvariantsOccurrences(prisma, { type: "REGLES", ruleIds: [regle.id] }, { montantsAVenir: { aujourdhui: auj } });
    } finally {
      await prisma.recurringRule.deleteMany({ where: { id: regle.id } });
    }
  });
});
