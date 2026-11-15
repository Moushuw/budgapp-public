// Test d'intégration des actions de récurrence — docs/lot-m3.md §4.3 et §8. Schéma `test`, fixture jetable en 2099
// (compte hors budget, six prélèvements mensuels), nettoyée en afterAll.

import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { dateCivileDansFuseau, FUSEAU_APPLICATION, versDateUtc, type DateCivile } from "@/domain/dates";
import { normaliserDescription } from "@/domain/ingestion";
import { horizonOccurrences, messageSuppressionLiee, occurrencesAMaterialiser } from "@/domain/recurrence";
import { champsDepuisValeurs, valeursDepuisSerie } from "@/features/recurrences/valeurs-formulaire";
import { formatMontantChamp } from "@/lib/champs-formulaire";
import { exigerInvariantsOccurrences, verifierInvariantsOccurrences } from "../../../prisma/test/invariants-occurrences";
import {
  confirmerSuggestion,
  creerRecurrence,
  delierOccurrence,
  lierOccurrence,
  lireEcranRecurrences,
  modifierMontantOccurrence,
  modifierRecurrence,
  refuserSuggestion,
  terminerRecurrence,
} from "./recurrences";
import {
  MESSAGE_ECHEANCE_INTROUVABLE,
  MESSAGE_FIN_AVANT_ANCRAGE,
  MESSAGE_NON_LIEE,
  MESSAGE_SIGNE_ECHEANCE,
  MESSAGE_SIGNE_SERIE,
  MESSAGE_SUGGESTION_INTROUVABLE,
  messageFinAvantLiee,
} from "./recurrences-messages";
import { lireTransaction, supprimerTransaction } from "./transactions";

const prisma = new PrismaClient();

const M = "X" + randomUUID().replace(/-/g, "").slice(0, 9).toUpperCase();
const AUJ: DateCivile = "2099-06-30";
const auj = dateCivileDansFuseau(new Date(), FUSEAU_APPLICATION);
const CUID_INEXISTANT = "clx0000000000000000099999";
const MOIS = ["01", "02", "03", "04", "05", "06"] as const;

let ownerId = "";
let compteId = "";
let libelleRegle = "";
let ruleId = "";
const transactionIds = new Map<string, string>();
const occurrenceIds = new Map<string, string>();

function transaction(mois: string): string {
  const id = transactionIds.get(mois);
  if (id === undefined) {
    throw new Error(`transaction absente : ${mois}`);
  }
  return id;
}

const CHAMPS = {
  libelle: `Act ${M}`,
  nature: "FIXE",
  montant: "-10,00",
  cadence: "MENSUEL",
  dateAncrage: "2099-01-12",
  subcategoryId: null,
  motifRapprochement: `ACT ${M}`,
  toleranceMontant: "5,00",
  toleranceJours: "3",
} as const;

beforeAll(async () => {
  const proprietaire = await prisma.user.findFirstOrThrow({ orderBy: { createdAt: "asc" } });
  ownerId = proprietaire.id;
  compteId = (
    await prisma.account.create({
      data: { ownerId, nom: `Action Réc ${M}`, dateSoldeInitial: versDateUtc("2099-01-01"), estBudgetaire: false },
      select: { id: true },
    })
  ).id;
  for (const [i, m] of MOIS.entries()) {
    const description = `ACT ${M}`;
    const creee = await prisma.transaction.create({
      data: {
        ownerId,
        accountId: compteId,
        date: versDateUtc(`2099-${m}-12`),
        description,
        descriptionNormalisee: normaliserDescription(description),
        montantCents: -1000,
        source: "COPIER_COLLER",
        empreinte: `act-rec-${String(i)}-${M}`,
      },
      select: { id: true },
    });
    transactionIds.set(m, creee.id);
  }
  // La règle est posée directement, sans suggestion EN_ATTENTE : une recherche concurrente (autre fichier)
  // remplace les suggestions en attente du propriétaire. Les six paiements sont liés comme le fait une confirmation.
  libelleRegle = `Act ${M}`;
  ruleId = (
    await prisma.recurringRule.create({
      data: {
        ownerId,
        accountId: compteId,
        libelle: libelleRegle,
        nature: "FIXE",
        montantCents: -1000,
        cadence: "MENSUEL",
        dateAncrage: versDateUtc("2099-01-12"),
        subcategoryId: null,
        motifRapprochement: normaliserDescription(`ACT ${M}`),
        toleranceCents: 500,
        toleranceJours: 3,
        scoreConfiance: 0.92,
        actif: true,
      },
      select: { id: true },
    })
  ).id;
  const lieeLe = new Date();
  const aMaterialiser = occurrencesAMaterialiser(
    { cadence: "MENSUEL", dateAncrage: "2099-01-12", dateFin: null, montantCents: -1000 },
    horizonOccurrences(AUJ),
  );
  await prisma.expectedOccurrence.createMany({
    data: aMaterialiser.map((o) => {
      const mois = o.echeance.slice(5, 7);
      const paiement = o.echeance.startsWith("2099-") ? transactionIds.get(mois) : undefined;
      return paiement === undefined
        ? { ruleId, echeance: versDateUtc(o.echeance), montantCents: o.montantCents, etat: "PREVUE" as const }
        : {
            ruleId,
            echeance: versDateUtc(o.echeance),
            montantCents: o.montantCents,
            transactionId: paiement,
            liaison: "RETROACTIVE" as const,
            lieeLe,
            etat: "REALISEE" as const,
          };
    }),
  });
  const occurrences = await prisma.expectedOccurrence.findMany({ where: { ruleId }, select: { id: true, echeance: true }, take: 100 });
  for (const o of occurrences) {
    occurrenceIds.set(o.echeance.toISOString().slice(0, 10), o.id);
  }
});

afterAll(async () => {
  await prisma.recurringRule.deleteMany({ where: { accountId: compteId } });
  await prisma.recurrenceSuggestion.deleteMany({ where: { ownerId, accountId: compteId } });
  await prisma.transaction.deleteMany({ where: { accountId: compteId } });
  await prisma.account.deleteMany({ where: { id: compteId } });
  await prisma.$disconnect();
});

function occurrence(echeance: DateCivile): string {
  const id = occurrenceIds.get(echeance);
  if (id === undefined) {
    throw new Error(`occurrence absente : ${echeance}`);
  }
  return id;
}

describe("actions de récurrence", () => {
  it("A1 — confirmer avec un motif vide : VALIDATION, message du schéma", async () => {
    const resultat = await confirmerSuggestion({
      suggestionId: CUID_INEXISTANT,
      champs: { ...CHAMPS, motifRapprochement: "   " },
    });
    expect(resultat).toMatchObject({
      ok: false,
      code: "VALIDATION",
      message: "Le motif de rapprochement est obligatoire.",
    });
  });

  it("A2 — créer avec une tolérance de jours hors bornes : VALIDATION", async () => {
    const resultat = await creerRecurrence({
      accountId: compteId,
      transactionId: null,
      champs: { ...CHAMPS, toleranceJours: "40" },
    });
    expect(resultat).toMatchObject({
      ok: false,
      code: "VALIDATION",
      message: "La tolérance de jours va de 0 à 31.",
    });
  });

  it("A3 — supprimer une transaction liée : CONFLICT avec le message qui nomme la récurrence", async () => {
    const resultat = await supprimerTransaction({ id: transaction("03"), virement: null });
    expect(resultat).toMatchObject({
      ok: false,
      code: "CONFLICT",
      message: messageSuppressionLiee(libelleRegle, "2099-03-12"),
    });
    expect(await prisma.transaction.count({ where: { id: transaction("03") } })).toBe(1);
  });

  it("A8 — le détail d'une transaction liée porte sa récurrence", async () => {
    const resultat = await lireTransaction({ id: transaction("01") });
    expect(resultat.ok).toBe(true);
    if (resultat.ok) {
      expect(resultat.data.recurrence?.liaison).toBe("RETROACTIVE");
    }
  });

  it("A4 — délier : une fois, puis CONFLICT", async () => {
    const id = occurrence("2099-03-12");
    expect((await delierOccurrence({ occurrenceId: id })).ok).toBe(true);
    expect(await delierOccurrence({ occurrenceId: id })).toMatchObject({
      ok: false,
      code: "CONFLICT",
      message: MESSAGE_NON_LIEE,
    });
    await exigerInvariantsOccurrences(prisma, { type: "REGLES", ruleIds: [ruleId] });
  });

  it("A5 — lier une échéance inexistante : NOT_FOUND", async () => {
    expect(await lierOccurrence({ occurrenceId: CUID_INEXISTANT, transactionId: transaction("03") })).toMatchObject({
      ok: false,
      code: "NOT_FOUND",
      message: MESSAGE_ECHEANCE_INTROUVABLE,
    });
  });

  it("A6 — refuser une suggestion inexistante : NOT_FOUND", async () => {
    expect(await refuserSuggestion({ id: CUID_INEXISTANT })).toMatchObject({
      ok: false,
      code: "NOT_FOUND",
      message: MESSAGE_SUGGESTION_INTROUVABLE,
    });
  });

  it("A7 — terminer avant l'ancrage : VALIDATION", async () => {
    expect(await terminerRecurrence({ id: ruleId, dateFin: "2098-01-01" })).toMatchObject({
      ok: false,
      code: "VALIDATION",
      message: MESSAGE_FIN_AVANT_ANCRAGE,
    });
  });

  it("A9 — terminer avant la dernière échéance liée : VALIDATION, message qui nomme la date ; rien n'est retiré", async () => {
    const avant = await prisma.expectedOccurrence.count({ where: { ruleId } });
    expect(await terminerRecurrence({ id: ruleId, dateFin: "2099-02-01" })).toMatchObject({
      ok: false,
      code: "VALIDATION",
      message: messageFinAvantLiee("2099-06-12"),
    });
    expect(messageFinAvantLiee("2099-06-12")).toBe(
      "La série a un paiement lié le 12 juin 2099 : la date de fin ne peut pas le précéder.",
    );
    expect(await prisma.expectedOccurrence.count({ where: { ruleId } })).toBe(avant);
    expect((await prisma.recurringRule.findUniqueOrThrow({ where: { id: ruleId }, select: { dateFin: true } })).dateFin).toBeNull();
  });

  it("A10 — modifier une série dont l'ancrage remonte à plus de dix ans : ok, la borne ne vaut qu'à la création", async () => {
    const ancienne = await prisma.recurringRule.create({
      data: {
        ownerId,
        accountId: compteId,
        libelle: `Ancienne ${M}`,
        nature: "FIXE",
        montantCents: -1000,
        cadence: "MENSUEL",
        dateAncrage: versDateUtc("2000-01-12"),
        subcategoryId: null,
        motifRapprochement: normaliserDescription(`ANCIENNE ${M}`),
        toleranceCents: 500,
        toleranceJours: 3,
        scoreConfiance: 0.9,
        actif: true,
      },
      select: { id: true },
    });
    const resultat = await modifierRecurrence({
      id: ancienne.id,
      champs: { ...CHAMPS, libelle: `Ancienne ${M}`, motifRapprochement: `ANCIENNE ${M}`, dateAncrage: "2000-01-12" },
    });
    expect(resultat.ok).toBe(true);
    expect(await creerRecurrence({
      accountId: compteId,
      transactionId: null,
      champs: { ...CHAMPS, dateAncrage: "2000-01-12" },
    })).toMatchObject({ ok: false, code: "VALIDATION" });
  });

  async function serieDe(id: string) {
    const ecran = await lireEcranRecurrences({});
    expect(ecran.ok).toBe(true);
    if (!ecran.ok) throw new Error("écran des récurrences illisible");
    const serie = ecran.data.series.find((s) => s.id === id);
    if (serie === undefined) throw new Error(`série absente : ${id}`);
    return serie;
  }

  it("A11 — « Modifier » sans rien toucher garde le signe", async () => {
    // Une série dont l'ancrage est le jour réel : la fixture 2099 est hors de l'horizon de matérialisation du jour réel,
    // et une modification en retire les échéances ouvertes sans les recréer.
    const libelle = `Signe ${M}`;
    const regle = await prisma.recurringRule.create({
      data: {
        ownerId,
        accountId: compteId,
        libelle,
        nature: "FIXE",
        montantCents: -1000,
        cadence: "MENSUEL",
        dateAncrage: versDateUtc(auj),
        subcategoryId: null,
        motifRapprochement: normaliserDescription(`SIGNE ${M}`),
        toleranceCents: 500,
        toleranceJours: 3,
        scoreConfiance: 0.9,
        actif: true,
      },
      select: { id: true },
    });
    await prisma.expectedOccurrence.createMany({
      data: occurrencesAMaterialiser(
        { cadence: "MENSUEL", dateAncrage: auj, dateFin: null, montantCents: -1000 },
        horizonOccurrences(auj),
      ).map((o) => ({ ruleId: regle.id, echeance: versDateUtc(o.echeance), montantCents: o.montantCents })),
    });

    const serie = await serieDe(regle.id);
    expect(valeursDepuisSerie(serie).montant).toBe(formatMontantChamp(-1000));
    const resultat = await modifierRecurrence({ id: regle.id, champs: champsDepuisValeurs(valeursDepuisSerie(serie)) });
    expect(resultat.ok).toBe(true);

    expect((await prisma.recurringRule.findUniqueOrThrow({ where: { id: regle.id }, select: { montantCents: true } })).montantCents).toBe(-1000);
    const ouvertes = await prisma.expectedOccurrence.findMany({
      where: { ruleId: regle.id, transactionId: null, etat: { in: ["PREVUE", "MANQUEE"] }, echeance: { gte: versDateUtc(auj) } },
      select: { montantCents: true },
      take: 100,
    });
    expect(ouvertes.length).toBeGreaterThanOrEqual(1);
    expect(ouvertes.every((o) => o.montantCents === -1000)).toBe(true);
    await exigerInvariantsOccurrences(prisma, { type: "REGLES", ruleIds: [regle.id] }, { montantsAVenir: { aujourdhui: auj } });
  });

  it("A12 — changer de signe est refusé quand des occurrences gardées portent l'ancien", async () => {
    const serie = await serieDe(ruleId);
    const avant = await prisma.expectedOccurrence.count({ where: { ruleId } });
    expect(
      await modifierRecurrence({ id: ruleId, champs: { ...champsDepuisValeurs(valeursDepuisSerie(serie)), montant: "10,00" } }),
    ).toMatchObject({ ok: false, code: "VALIDATION", message: MESSAGE_SIGNE_SERIE });
    expect((await prisma.recurringRule.findUniqueOrThrow({ where: { id: ruleId }, select: { montantCents: true } })).montantCents).toBe(-1000);
    expect(await prisma.expectedOccurrence.count({ where: { ruleId } })).toBe(avant);
  });

  it("A13 — montant d'échéance de signe contraire refusé, montant fixé à la main toléré par l'invariant 7", async () => {
    const o = occurrence("2099-12-12");
    const montant = async () =>
      (await prisma.expectedOccurrence.findUniqueOrThrow({ where: { id: o }, select: { montantCents: true } })).montantCents;
    expect(await modifierMontantOccurrence({ occurrenceId: o, montant: "12,00" })).toMatchObject({
      ok: false,
      code: "VALIDATION",
      message: MESSAGE_SIGNE_ECHEANCE,
    });
    expect(await montant()).toBe(-1000);
    expect((await modifierMontantOccurrence({ occurrenceId: o, montant: "-12,00" })).ok).toBe(true);
    expect(await montant()).toBe(-1200);

    const portee = { type: "REGLES", ruleIds: [ruleId] } as const;
    const bilan = await verifierInvariantsOccurrences(prisma, portee, { montantsAVenir: { aujourdhui: auj } });
    expect(bilan.ecarts).toEqual([
      { invariant: 7, objetId: o, message: "échéance ouverte à venir 2099-12-12 à -1200, règle à -1000" },
    ]);
    const toleree = await verifierInvariantsOccurrences(prisma, portee, {
      montantsAVenir: { aujourdhui: auj, montantsFixesALaMain: [o] },
    });
    expect(toleree.ecarts).toEqual([]);
  });

  it("A14 — un montant d'échéance à zéro est accepté sur une échéance ouverte", async () => {
    const o = occurrence("2099-11-12");
    expect(await modifierMontantOccurrence({ occurrenceId: o, montant: "0,00" })).toMatchObject({ ok: true });
    expect((await prisma.expectedOccurrence.findUniqueOrThrow({ where: { id: o }, select: { montantCents: true } })).montantCents).toBe(0);
    await exigerInvariantsOccurrences(prisma, { type: "REGLES", ruleIds: [ruleId] });
  });

  it("A15 — changer le signe d'une série sans occurrence gardée est accepté, les échéances ouvertes suivent", async () => {
    const libelle = `Signe2 ${M}`;
    const regle = await prisma.recurringRule.create({
      data: {
        ownerId,
        accountId: compteId,
        libelle,
        nature: "FIXE",
        montantCents: -1000,
        cadence: "MENSUEL",
        dateAncrage: versDateUtc(auj),
        subcategoryId: null,
        motifRapprochement: normaliserDescription(`SIGNE2 ${M}`),
        toleranceCents: 500,
        toleranceJours: 3,
        scoreConfiance: 0.9,
        actif: true,
      },
      select: { id: true },
    });
    await prisma.expectedOccurrence.createMany({
      data: occurrencesAMaterialiser(
        { cadence: "MENSUEL", dateAncrage: auj, dateFin: null, montantCents: -1000 },
        horizonOccurrences(auj),
      ).map((o) => ({ ruleId: regle.id, echeance: versDateUtc(o.echeance), montantCents: o.montantCents })),
    });
    const ouvertesAVenir = () =>
      prisma.expectedOccurrence.findMany({
        where: { ruleId: regle.id, transactionId: null, etat: { in: ["PREVUE", "MANQUEE"] }, echeance: { gte: versDateUtc(auj) } },
        select: { montantCents: true },
        take: 100,
      });
    const avant = await ouvertesAVenir();
    expect(avant.length).toBeGreaterThanOrEqual(1);
    expect(avant.every((o) => o.montantCents === -1000)).toBe(true);

    const serie = await serieDe(regle.id);
    const resultat = await modifierRecurrence({
      id: regle.id,
      champs: { ...champsDepuisValeurs(valeursDepuisSerie(serie)), montant: "10,00" },
    });
    expect(resultat.ok).toBe(true);

    expect((await prisma.recurringRule.findUniqueOrThrow({ where: { id: regle.id }, select: { montantCents: true } })).montantCents).toBe(1000);
    const apres = await ouvertesAVenir();
    expect(apres.length).toBeGreaterThanOrEqual(1);
    expect(apres.every((o) => o.montantCents === 1000)).toBe(true);
    await exigerInvariantsOccurrences(prisma, { type: "REGLES", ruleIds: [regle.id] }, { montantsAVenir: { aujourdhui: auj } });
  });
});
