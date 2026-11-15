// Test d'intégration des repositories de récurrences — docs/lot-m3.md §4, §6 et §8. Schéma `test`, marqueur unique,
// dates en 2099, comptes hors budget. Le premier `describe` travaille sur le seed (Netflix) ; le second enchaîne ses
// cas dans l'ordre écrit : chacun part de l'état laissé par les précédents.

import { randomUUID } from "node:crypto";
import { PrismaClient, type Prisma } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FILTRES_VIDES, resoudreCriteres, TRI_PAR_DEFAUT } from "@/domain/consultation";
import {
  dateCivileDansFuseau,
  depuisDateUtc,
  echeances,
  FUSEAU_APPLICATION,
  versDateUtc,
  type DateCivile,
} from "@/domain/dates";
import { normaliserDescription } from "@/domain/ingestion";
import { formatMontant } from "@/domain/money";
import {
  LIMITE_SUGGESTIONS,
  natureDepuisStabilite,
  type ChampsRecurrence,
  type CurseurOccurrences,
  type OccurrenceAffichee,
  type PageOccurrences,
  type SuggestionAffichee,
} from "@/domain/recurrence";
import { exigerInvariants } from "../../../prisma/test/invariants";
import { exigerInvariantsOccurrences } from "../../../prisma/test/invariants-occurrences";
import {
  confirmerSuggestion,
  creerRecurrence,
  delierOccurrence,
  ignorerOccurrence,
  lierOccurrence,
  modifierMontantOccurrence,
  modifierRecurrence,
  rechercherSuggestions,
  refuserSuggestion,
  retablirOccurrence,
  supprimerRecurrence,
  terminerRecurrence,
} from "./recurrences-ecriture";
import {
  lireCandidatsOccurrence,
  lireCandidatsTransaction,
  lireEcranRecurrences,
  lireOccurrenceLiee,
  lireOccurrences,
} from "./recurrences-lecture";
import { listerTransactions, lireTransaction } from "./transactions-lecture";

const prisma = new PrismaClient();

const M = "X" + randomUUID().replace(/-/g, "").slice(0, 9).toUpperCase();
const AUJ: DateCivile = "2099-06-30";
const CUID_INEXISTANT = "clx0000000000000000099999";
const SEED_DATE_REFERENCE: DateCivile = "2026-09-13";

let ownerId: string;
let utilisateur2Id: string;
let compteA: string;
let compteB: string;
let compteC: string;
let compteVisa: string;
let sousCatStreaming: string;
const comptesJetables: string[] = [];
const transactions = new Map<string, string>();
let compteur = 0;

const motif = (nom: string): string => normaliserDescription(`${nom} ${M}`);

function tx(cle: string): string {
  const id = transactions.get(cle);
  if (id === undefined) {
    throw new Error(`transaction de fixture absente : ${cle}`);
  }
  return id;
}

async function creerTx(
  cle: string,
  accountId: string,
  description: string,
  date: DateCivile,
  montantCents: number,
  extra: Partial<Prisma.TransactionUncheckedCreateInput> = {},
): Promise<void> {
  compteur += 1;
  const creee = await prisma.transaction.create({
    data: {
      ownerId,
      accountId,
      date: versDateUtc(date),
      description,
      descriptionNormalisee: normaliserDescription(description),
      montantCents,
      source: "COPIER_COLLER",
      empreinte: `rec-${String(compteur)}-${M}`,
      ...extra,
    },
    select: { id: true },
  });
  transactions.set(cle, creee.id);
}

async function serie(
  nom: string,
  accountId: string,
  jour: string,
  montants: readonly number[],
  mois: readonly string[] = ["01", "02", "03", "04", "05", "06"],
): Promise<void> {
  for (const [i, m] of mois.entries()) {
    await creerTx(`${nom}@2099-${m}-${jour}`, accountId, `${nom} ${M}`, `2099-${m}-${jour}`, montants[i] ?? -1);
  }
}

async function occurrenceDe(ruleId: string, echeance: DateCivile) {
  return prisma.expectedOccurrence.findUniqueOrThrow({
    where: { ruleId_echeance: { ruleId, echeance: versDateUtc(echeance) } },
  });
}

async function occurrencesDe(ruleId: string) {
  return prisma.expectedOccurrence.findMany({ where: { ruleId }, orderBy: { echeance: "asc" }, take: 500 });
}

async function invariantsRegles(...ruleIds: readonly string[]): Promise<void> {
  await exigerInvariantsOccurrences(prisma, { type: "REGLES", ruleIds });
}

async function invariantsTransactions(...ids: readonly string[]): Promise<void> {
  await exigerInvariants(prisma, { type: "TRANSACTIONS", ids });
}

function champsDe(proposition: NonNullable<SuggestionAffichee["proposition"]>): ChampsRecurrence {
  return {
    libelle: proposition.libelle,
    nature: proposition.nature,
    montantCents: proposition.montantCents,
    cadence: proposition.cadence,
    dateAncrage: proposition.dateAncrage,
    subcategoryId: proposition.subcategoryId,
    motifRapprochement: proposition.motifRapprochement,
    toleranceCents: proposition.toleranceCents,
    toleranceJours: proposition.toleranceJours,
  };
}

async function carte(motifRecherche: string, accountId: string, aujourdhui: DateCivile): Promise<SuggestionAffichee> {
  const ecran = await lireEcranRecurrences(ownerId, aujourdhui);
  const trouvee = ecran.suggestions.find((s) => s.motif === motifRecherche && s.accountId === accountId);
  if (trouvee === undefined) {
    throw new Error(`suggestion absente de l'écran : ${motifRecherche}`);
  }
  return trouvee;
}

async function propositionDe(motifRecherche: string, accountId: string): Promise<ChampsRecurrence> {
  const c = await carte(motifRecherche, accountId, AUJ);
  if (c.proposition === null) {
    throw new Error(`pas de proposition : ${motifRecherche}`);
  }
  return champsDe(c.proposition);
}

async function nettoyerNetflix(): Promise<void> {
  await prisma.recurringRule.deleteMany({ where: { ownerId, libelle: "Netflix.com" } });
}

beforeAll(async () => {
  const proprietaire = await prisma.user.findFirstOrThrow({ orderBy: { createdAt: "asc" } });
  ownerId = proprietaire.id;
  const creerCompte = async (nom: string): Promise<string> => {
    const id = (
      await prisma.account.create({
        data: { ownerId, nom, dateSoldeInitial: versDateUtc("2099-01-01"), estBudgetaire: false },
        select: { id: true },
      })
    ).id;
    comptesJetables.push(id);
    return id;
  };
  compteA = await creerCompte(`Réc A ${M}`);
  compteB = await creerCompte(`Réc B ${M}`);
  compteC = await creerCompte(`Réc C ${M}`);
  compteVisa = (await prisma.account.findFirstOrThrow({ where: { ownerId, nom: "Visa" }, select: { id: true } })).id;
  sousCatStreaming = (
    await prisma.subcategory.findFirstOrThrow({ where: { nom: "Streaming", category: { ownerId } }, select: { id: true } })
  ).id;
  utilisateur2Id = (await prisma.user.create({ data: { email: `rec-u2-${M}@example.test` }, select: { id: true } })).id;

  await serie("ABO", compteA, "15", [-2500, -2500, -2500, -2500, -2500, -2500]);
  await serie("SPORT", compteA, "10", [-4000, -4000, -4000, -4000, -4600], ["01", "02", "03", "05", "06"]);
  await creerTx("SPORT@2099-04-14", compteA, `SPORT ${M}`, "2099-04-14", -4000);
  await serie("GYM", compteB, "05", [-3000, -3000, -3000, -3000, -3000, -3000]);
  await serie("CLUB", compteB, "20", [-1500, -1500, -1500, -1500, -1500, -1500]);
  await creerTx("AUTRE", compteC, `AUTRE ${M}`, "2099-07-15", -2500);
  await creerTx("LIBRE", compteA, `LIBRE ${M}`, "2099-08-05", -2500);
  await creerTx("PARENT", compteA, `PARENT ${M}`, "2099-07-15", -2500, { estVentilee: true });
  await creerTx("FILLE", compteA, `FILLE ${M}`, "2099-07-15", -2500, { parentId: tx("PARENT") });
});

afterAll(async () => {
  await prisma.recurringRule.deleteMany({ where: { accountId: { in: comptesJetables } } });
  await nettoyerNetflix();
  await prisma.recurrenceSuggestion.deleteMany({
    where: { ownerId, accountId: { in: [...comptesJetables, compteVisa] } },
  });
  await prisma.transaction.deleteMany({ where: { accountId: { in: comptesJetables }, parentId: { not: null } } });
  await prisma.transaction.deleteMany({ where: { accountId: { in: comptesJetables } } });
  await prisma.account.deleteMany({ where: { id: { in: comptesJetables } } });
  await prisma.user.deleteMany({ where: { id: utilisateur2Id } });
  await prisma.$disconnect();
});

describe("sur le seed : Netflix", () => {
  let idSuggestionNetflix = "";
  let idsNetflix: string[] = [];

  it("R1 — détection : une suggestion Netflix, aucune pour les cinq règles du seed", async () => {
    await rechercherSuggestions(ownerId, { dateReference: SEED_DATE_REFERENCE });
    const suggestions = await prisma.recurrenceSuggestion.findMany({
      where: { ownerId, etat: "EN_ATTENTE" },
      take: 1000,
    });
    const netflix = suggestions.filter((s) => s.motif === "NETFLIX.COM" && s.accountId === compteVisa);
    expect(netflix).toHaveLength(1);
    const s = netflix[0];
    if (s === undefined) return;
    idSuggestionNetflix = s.id;
    expect(s.cadence).toBe("MENSUEL");
    expect(s.montantMedianCents).toBe(-1799);
    expect(s.nbOccurrences).toBe(19);
    expect(s.stabilite).toBe(0);
    expect(s.score).toBeCloseTo(0.95, 6);
    expect(s.regularite).toBeCloseTo(0.024637, 5);
    const seedTx = await prisma.transaction.findMany({
      where: {
        ownerId,
        accountId: compteVisa,
        descriptionNormalisee: "NETFLIX.COM",
        parentId: null,
        date: { lte: versDateUtc(SEED_DATE_REFERENCE) },
      },
      select: { id: true },
      take: 100,
    });
    idsNetflix = seedTx.map((t) => t.id);
    expect([...s.transactionIds].sort()).toEqual([...idsNetflix].sort());
    expect(idsNetflix).toHaveLength(19);

    const reglesSeed = await prisma.recurringRule.findMany({
      where: { ownerId, libelle: { in: ["Hydro-Québec", "Internet", "Assurance auto", "Dépôt paie", "Versement hypothécaire"] } },
      select: { accountId: true, motifRapprochement: true },
      take: 20,
    });
    expect(reglesSeed).toHaveLength(5);
    for (const regle of reglesSeed) {
      expect(
        suggestions.filter((x) => x.accountId === regle.accountId && x.motif === regle.motifRapprochement),
        String(regle.motifRapprochement),
      ).toEqual([]);
    }

    const carteNetflix = await carte("NETFLIX.COM", compteVisa, SEED_DATE_REFERENCE);
    expect(carteNetflix.phrase).toBe(
      `Netflix.com — ${formatMontant(1799, "CENTS")}, tous les mois vers le 12. 19 occurrences depuis mars 2025.`,
    );
    expect(carteNetflix.proposition).toEqual({
      libelle: "Netflix.com",
      accountId: compteVisa,
      nature: "FIXE",
      montantCents: -1799,
      cadence: "MENSUEL",
      dateAncrage: "2025-03-12",
      subcategoryId: sousCatStreaming,
      motifRapprochement: "NETFLIX.COM",
      toleranceCents: 500,
      toleranceJours: 3,
    });
  });

  it("R2 — confirmer Netflix : règle, 31 échéances, 19 liaisons rétroactives", async () => {
    const proposition = await carte("NETFLIX.COM", compteVisa, SEED_DATE_REFERENCE);
    expect(proposition.proposition).not.toBeNull();
    if (proposition.proposition === null) return;
    const resultat = await confirmerSuggestion(
      ownerId,
      idSuggestionNetflix,
      champsDe(proposition.proposition),
      SEED_DATE_REFERENCE,
    );
    expect(resultat.statut).toBe("CONFIRMEE");
    if (resultat.statut !== "CONFIRMEE") return;
    expect(resultat.compteRendu).toMatchObject({
      libelle: "Netflix.com",
      paiementsLies: 19,
      sansEcheance: [],
      indisponibles: 0,
      echeancesPasseesSansPaiement: 0,
    });
    const ruleId = resultat.compteRendu.ruleId;
    const regle = await prisma.recurringRule.findUniqueOrThrow({ where: { id: ruleId } });
    expect(regle.libelle).toBe("Netflix.com");
    expect(regle.scoreConfiance).toBeCloseTo(0.95, 6);
    expect(regle.dateFin).toBeNull();
    expect(regle.actif).toBe(true);

    const occurrences = await occurrencesDe(ruleId);
    expect(occurrences).toHaveLength(31);
    expect(occurrences.map((o) => o.echeance.toISOString().slice(0, 10))).toEqual(
      echeances("MENSUEL", "2025-03-12", "2027-09-13"),
    );
    const liees = occurrences.filter((o) => o.transactionId !== null);
    expect(liees).toHaveLength(19);
    for (const id of idsNetflix) {
      const occupees = await prisma.expectedOccurrence.findMany({ where: { transactionId: id }, take: 5 });
      expect(occupees).toHaveLength(1);
      const o = occupees[0];
      expect(o?.liaison).toBe("RETROACTIVE");
      expect(o?.etat).toBe("REALISEE");
      expect(o?.lieeLe).not.toBeNull();
      const t = await prisma.transaction.findUniqueOrThrow({ where: { id }, select: { date: true } });
      expect(o?.echeance.getTime()).toBe(t.date.getTime());
    }
    const ouvertes = occurrences.filter((o) => o.transactionId === null);
    expect(ouvertes).toHaveLength(12);
    expect(ouvertes.every((o) => o.etat === "PREVUE" && o.liaison === null)).toBe(true);
    expect(ouvertes[0]?.echeance.toISOString().slice(0, 10)).toBe("2026-10-12");
    expect(ouvertes[11]?.echeance.toISOString().slice(0, 10)).toBe("2027-09-12");
    const suggestion = await prisma.recurrenceSuggestion.findUniqueOrThrow({ where: { id: idSuggestionNetflix } });
    expect(suggestion.etat).toBe("ACCEPTEE");
    await invariantsRegles(ruleId);
    await invariantsTransactions(...idsNetflix);

    await rechercherSuggestions(ownerId, { dateReference: SEED_DATE_REFERENCE });
    const restantes = await prisma.recurrenceSuggestion.count({
      where: { ownerId, etat: "EN_ATTENTE", motif: "NETFLIX.COM", accountId: compteVisa },
    });
    expect(restantes).toBe(0);

    const suppression = await supprimerRecurrence(ownerId, ruleId);
    expect(suppression).toEqual({ statut: "SUPPRIMEE", liaisonsDefaites: 19 });
    const apres = await prisma.transaction.findMany({
      where: { id: { in: idsNetflix } },
      select: { subcategoryId: true },
      take: 100,
    });
    expect(apres).toHaveLength(19);
    expect(apres.every((t) => t.subcategoryId === sousCatStreaming)).toBe(true);
    await prisma.recurrenceSuggestion.deleteMany({ where: { ownerId, accountId: compteVisa } });
  });
});

describe("sur la fixture : enchaînement R3 à R16", () => {
  const motifAbo = motif("ABO");
  const motifGym = motif("GYM");
  const motifClub = motif("CLUB");
  const motifSport = motif("SPORT");
  let idsAvant: string[] = [];
  let ruleAbo = "";
  let ruleSport = "";
  let ruleGym = "";
  let ruleGymPonctuel = "";
  let champsAbo: ChampsRecurrence;

  const sansDoublonsEnAttente = (accountIds: readonly string[]) =>
    prisma.recurrenceSuggestion.findMany({
      where: { ownerId, etat: "EN_ATTENTE", accountId: { in: [...accountIds] } },
      orderBy: [{ motif: "asc" }],
      take: 100,
    });

  it("R3 — détection : quatre suggestions sur les comptes A et B, remplacées à chaque recherche", async () => {
    await rechercherSuggestions(ownerId, { dateReference: AUJ });
    const lues = await sansDoublonsEnAttente([compteA, compteB]);
    const attendu = [
      { motif: motifAbo, accountId: compteA, nature: "FIXE", montantMedianCents: -2500, score: 0.92 },
      { motif: motifGym, accountId: compteB, nature: "FIXE", montantMedianCents: -3000, score: 0.92 },
      { motif: motifClub, accountId: compteB, nature: "FIXE", montantMedianCents: -1500, score: 0.92 },
      { motif: motifSport, accountId: compteA, nature: "VARIABLE", montantMedianCents: -4000, score: 0.79 },
    ];
    expect(lues).toHaveLength(4);
    for (const a of attendu) {
      const s = lues.find((x) => x.motif === a.motif && x.accountId === a.accountId);
      expect(s, a.motif).toBeDefined();
      if (s === undefined) continue;
      expect(s.cadence).toBe("MENSUEL");
      expect(natureDepuisStabilite(s.stabilite)).toBe(a.nature);
      expect(s.montantMedianCents).toBe(a.montantMedianCents);
      expect(s.nbOccurrences).toBe(6);
      expect(s.score).toBeCloseTo(a.score, 6);
    }
    const interdites = new Set([tx("FILLE"), tx("AUTRE"), tx("LIBRE")]);
    expect(lues.flatMap((s) => s.transactionIds).some((id) => interdites.has(id))).toBe(false);

    idsAvant = lues.map((s) => s.id);
    await rechercherSuggestions(ownerId, { dateReference: AUJ });
    const relues = await sansDoublonsEnAttente([compteA, compteB]);
    expect(relues).toHaveLength(4);
    expect(relues.some((s) => idsAvant.includes(s.id))).toBe(false);
    expect(relues.map((s) => [s.motif, s.score]).sort()).toEqual(lues.map((s) => [s.motif, s.score]).sort());

    // Le total des suggestions en attente est lu sans borne, à côté des cartes affichées (au plus LIMITE_SUGGESTIONS).
    const ecran = await lireEcranRecurrences(ownerId, AUJ);
    expect(ecran.suggestions.length).toBeLessThanOrEqual(LIMITE_SUGGESTIONS);
    expect(ecran.nbSuggestions).toBeGreaterThanOrEqual(Math.max(4, ecran.suggestions.length));
  });

  it("R4 — confirmer SPORT : cinq liaisons, une transaction sans échéance, une échéance manquée", async () => {
    const c = await carte(motifSport, compteA, AUJ);
    expect(c.proposition).toMatchObject({
      dateAncrage: "2099-01-10",
      toleranceJours: 3,
      toleranceCents: 500,
      nature: "VARIABLE",
      montantCents: -4000,
    });
    const idSuggestion = c.id;
    const champs = await propositionDe(motifSport, compteA);
    const r = await confirmerSuggestion(ownerId, idSuggestion, champs, AUJ);
    expect(r.statut).toBe("CONFIRMEE");
    if (r.statut !== "CONFIRMEE") return;
    ruleSport = r.compteRendu.ruleId;
    expect(r.compteRendu).toEqual({
      ruleId: ruleSport,
      libelle: champs.libelle,
      paiementsLies: 5,
      sansEcheance: [{ id: tx("SPORT@2099-04-14"), date: "2099-04-14", montantCents: -4000 }],
      indisponibles: 0,
      echeancesPasseesSansPaiement: 1,
    });
    const occurrences = await occurrencesDe(ruleSport);
    expect(occurrences).toHaveLength(18);
    const parDate = (d: DateCivile) => occurrences.find((o) => o.echeance.getTime() === versDateUtc(d).getTime());
    for (const d of ["2099-01-10", "2099-02-10", "2099-03-10", "2099-05-10"] as const) {
      expect(parDate(d)?.etat, d).toBe("REALISEE");
      expect(parDate(d)?.liaison, d).toBe("RETROACTIVE");
    }
    expect(parDate("2099-06-10")?.etat).toBe("REALISEE_MONTANT_DIFFERENT");
    expect(parDate("2099-06-10")?.liaison).toBe("RETROACTIVE");
    expect(parDate("2099-04-10")?.etat).toBe("PREVUE");
    expect(parDate("2099-04-10")?.transactionId).toBeNull();
    expect(occurrences[0]?.echeance.toISOString().slice(0, 10)).toBe("2099-01-10");
    expect(occurrences[17]?.echeance.toISOString().slice(0, 10)).toBe("2100-06-10");
    const regle = await prisma.recurringRule.findUniqueOrThrow({ where: { id: ruleSport } });
    expect(regle.scoreConfiance).toBeCloseTo(0.79, 6);
    expect(regle.nature).toBe("VARIABLE");
    expect(regle.montantCents).toBe(-4000);

    const passees = await lireOccurrences(ownerId, ruleSport, AUJ, "PASSEES", null);
    expect(passees).not.toBeNull();
    expect(passees?.portion).toBe("PASSEES");
    expect(passees?.total).toBe(6);
    expect(passees?.curseurSuivant).toBeNull();
    expect(passees?.occurrences).toHaveLength(6);
    expect(passees?.occurrences[0]?.echeance).toBe("2099-06-10");
    const avril = passees?.occurrences.find((o) => o.echeance === "2099-04-10");
    expect(avril).toMatchObject({ etatStocke: "PREVUE", etatAffiche: "MANQUEE", ouverte: true });
    const aVenir = await lireOccurrences(ownerId, ruleSport, AUJ, "A_VENIR", null);
    expect(aVenir?.portion).toBe("A_VENIR");
    expect(aVenir?.total).toBe(12);
    expect(aVenir?.occurrences[0]?.echeance).toBe("2099-07-10");
    expect(aVenir?.occurrences).toHaveLength(3);
    expect(aVenir?.curseurSuivant).not.toBeNull();
    await invariantsRegles(ruleSport);
    await invariantsTransactions(...["01", "02", "03", "05", "06"].map((m) => tx(`SPORT@2099-${m}-10`)));
  });

  it("R5 — confirmer ABO, puis une seconde fois, puis un identifiant inexistant", async () => {
    const c = await carte(motifAbo, compteA, AUJ);
    const champs = await propositionDe(motifAbo, compteA);
    champsAbo = champs;
    const r = await confirmerSuggestion(ownerId, c.id, champs, AUJ);
    expect(r.statut).toBe("CONFIRMEE");
    if (r.statut !== "CONFIRMEE") return;
    ruleAbo = r.compteRendu.ruleId;
    expect(r.compteRendu).toMatchObject({
      paiementsLies: 6,
      sansEcheance: [],
      indisponibles: 0,
      echeancesPasseesSansPaiement: 0,
    });
    const occurrences = await occurrencesDe(ruleAbo);
    expect(occurrences).toHaveLength(18);
    expect(occurrences[0]?.echeance.toISOString().slice(0, 10)).toBe("2099-01-15");
    expect(occurrences[17]?.echeance.toISOString().slice(0, 10)).toBe("2100-06-15");

    expect(await confirmerSuggestion(ownerId, c.id, champs, AUJ)).toEqual({ statut: "DEJA_TRAITEE" });
    expect(await prisma.recurringRule.count({ where: { accountId: compteA, motifRapprochement: motifAbo } })).toBe(1);
    expect(await confirmerSuggestion(ownerId, CUID_INEXISTANT, champs, AUJ)).toEqual({ statut: "INTROUVABLE" });
    await invariantsRegles(ruleAbo);
  });

  it("R6 — une transaction du groupe liée entre-temps est comptée comme indisponible", async () => {
    const creation = await creerRecurrence(
      ownerId,
      {
        accountId: compteB,
        transactionId: tx("GYM@2099-03-05"),
        champs: {
          libelle: `Ponctuel ${M}`,
          nature: "FIXE",
          montantCents: -3000,
          cadence: "PONCTUEL",
          dateAncrage: "2099-03-05",
          subcategoryId: null,
          motifRapprochement: "PONCTUEL",
          toleranceCents: 500,
          toleranceJours: 3,
        },
      },
      AUJ,
    );
    expect(creation.statut).toBe("CREEE");
    if (creation.statut !== "CREEE") return;
    ruleGymPonctuel = creation.ruleId;
    expect(creation.transaction).toEqual({ date: "2099-03-05", echeance: "2099-03-05" });
    const uniques = await occurrencesDe(ruleGymPonctuel);
    expect(uniques).toHaveLength(1);
    expect(uniques[0]).toMatchObject({ liaison: "MANUELLE", etat: "REALISEE", transactionId: tx("GYM@2099-03-05") });

    const c = await carte(motifGym, compteB, AUJ);
    const champs = await propositionDe(motifGym, compteB);
    const r = await confirmerSuggestion(ownerId, c.id, champs, AUJ);
    expect(r.statut).toBe("CONFIRMEE");
    if (r.statut !== "CONFIRMEE") return;
    ruleGym = r.compteRendu.ruleId;
    expect(r.compteRendu).toMatchObject({
      paiementsLies: 5,
      indisponibles: 1,
      sansEcheance: [],
      echeancesPasseesSansPaiement: 1,
    });
    const occupees = await prisma.expectedOccurrence.findMany({ where: { transactionId: tx("GYM@2099-03-05") }, take: 5 });
    expect(occupees).toHaveLength(1);
    expect(occupees[0]?.ruleId).toBe(ruleGymPonctuel);
    await invariantsRegles(ruleGym, ruleGymPonctuel);
    await invariantsTransactions(tx("GYM@2099-03-05"));
  });

  it("R7 — refuser puis relancer la recherche", async () => {
    const c = await carte(motifClub, compteB, AUJ);
    expect(await refuserSuggestion(ownerId, c.id)).toBe("REFUSEE");
    expect(await refuserSuggestion(ownerId, c.id)).toBe("DEJA_TRAITEE");
    expect(await refuserSuggestion(ownerId, CUID_INEXISTANT)).toBe("INTROUVABLE");

    await rechercherSuggestions(ownerId, { dateReference: AUJ });
    const enAttente = await sansDoublonsEnAttente([compteA, compteB]);
    const motifs = enAttente.map((s) => s.motif);
    expect(motifs).not.toContain(motifClub);
    expect(motifs).not.toContain(motifAbo);
    expect(motifs).not.toContain(motifSport);
    expect(motifs).not.toContain(motifGym);
    const refusee = await prisma.recurrenceSuggestion.findUniqueOrThrow({ where: { id: c.id } });
    expect(refusee.etat).toBe("REFUSEE");
  });

  it("R8 — créer depuis une transaction : refus, puis transaction sans échéance voisine", async () => {
    const champs: ChampsRecurrence = {
      libelle: `Essai ${M}`,
      nature: "FIXE",
      montantCents: -2500,
      cadence: "MENSUEL",
      dateAncrage: "2099-07-15",
      subcategoryId: null,
      motifRapprochement: "ESSAI",
      toleranceCents: 500,
      toleranceJours: 3,
    };
    const nbRegles = () => prisma.recurringRule.count({ where: { accountId: { in: comptesJetables } } });
    const avant = await nbRegles();
    expect(await creerRecurrence(ownerId, { accountId: compteA, transactionId: tx("FILLE"), champs }, AUJ)).toEqual({
      statut: "TRANSACTION_INDISPONIBLE",
      motif: "LIGNE_FILLE",
    });
    expect(
      await creerRecurrence(ownerId, { accountId: compteA, transactionId: tx("ABO@2099-01-15"), champs }, AUJ),
    ).toEqual({ statut: "TRANSACTION_INDISPONIBLE", motif: "DEJA_LIEE" });
    expect(await creerRecurrence(ownerId, { accountId: compteA, transactionId: tx("AUTRE"), champs }, AUJ)).toEqual({
      statut: "TRANSACTION_INDISPONIBLE",
      motif: "AUTRE_COMPTE",
    });
    expect(await creerRecurrence(ownerId, { accountId: compteA, transactionId: CUID_INEXISTANT, champs }, AUJ)).toEqual({
      statut: "REFERENCE_INVALIDE",
      quoi: "TRANSACTION",
    });
    expect(
      await creerRecurrence(
        ownerId,
        { accountId: compteA, transactionId: null, champs: { ...champs, subcategoryId: CUID_INEXISTANT } },
        AUJ,
      ),
    ).toEqual({ statut: "REFERENCE_INVALIDE", quoi: "SOUS_CATEGORIE" });
    expect(await nbRegles()).toBe(avant);

    const creation = await creerRecurrence(
      ownerId,
      { accountId: compteA, transactionId: tx("LIBRE"), champs: { ...champs, dateAncrage: "2099-08-20" } },
      AUJ,
    );
    expect(creation).toMatchObject({ statut: "CREEE", transaction: { date: "2099-08-05", echeance: null } });
    if (creation.statut !== "CREEE") return;
    expect(await prisma.expectedOccurrence.count({ where: { transactionId: tx("LIBRE") } })).toBe(0);
    expect(await supprimerRecurrence(ownerId, creation.ruleId)).toEqual({ statut: "SUPPRIMEE", liaisonsDefaites: 0 });
  });

  it("R9 — délier, candidats, lier à la main, ordre des refus", async () => {
    const occ0315 = (await occurrenceDe(ruleAbo, "2099-03-15")).id;
    const occ0715 = (await occurrenceDe(ruleAbo, "2099-07-15")).id;
    const occ0815 = (await occurrenceDe(ruleAbo, "2099-08-15")).id;
    const abo0315 = tx("ABO@2099-03-15");
    const avant = await prisma.transaction.findUniqueOrThrow({
      where: { id: abo0315 },
      select: { subcategoryId: true, montantCents: true },
    });

    expect(await delierOccurrence(ownerId, occ0315)).toEqual({ statut: "DELIEE", transactionId: abo0315 });
    const deliee = await prisma.expectedOccurrence.findUniqueOrThrow({ where: { id: occ0315 } });
    expect(deliee).toMatchObject({ etat: "PREVUE", transactionId: null, liaison: null, lieeLe: null });
    expect(
      await prisma.transaction.findUniqueOrThrow({
        where: { id: abo0315 },
        select: { subcategoryId: true, montantCents: true },
      }),
    ).toEqual(avant);
    expect(await delierOccurrence(ownerId, occ0315)).toEqual({ statut: "NON_LIEE" });

    const candidatsTx = await lireCandidatsTransaction(ownerId, occ0315);
    expect(candidatsTx.statut).toBe("CANDIDATS");
    if (candidatsTx.statut === "CANDIDATS") {
      expect(candidatsTx.candidats[0]).toMatchObject({ id: abo0315, ecartJours: 0 });
      for (const c of candidatsTx.candidats) {
        expect(await prisma.expectedOccurrence.count({ where: { transactionId: c.id } })).toBe(0);
        expect(c.ecartJours).toBeLessThanOrEqual(15);
        const t = await prisma.transaction.findUniqueOrThrow({ where: { id: c.id }, select: { accountId: true } });
        expect(t.accountId).toBe(compteA);
      }
    }
    const candidatsOcc = await lireCandidatsOccurrence(ownerId, abo0315);
    expect(candidatsOcc.statut).toBe("CANDIDATS");
    if (candidatsOcc.statut === "CANDIDATS") {
      expect(candidatsOcc.candidats[0]).toMatchObject({ id: occ0315, ecartJours: 0 });
    }
    expect(await lireCandidatsOccurrence(ownerId, tx("FILLE"))).toEqual({ statut: "REFUS", motif: "LIGNE_FILLE" });
    expect(await lireCandidatsOccurrence(ownerId, tx("ABO@2099-01-15"))).toEqual({ statut: "REFUS", motif: "DEJA_LIEE" });

    expect(await lierOccurrence(ownerId, occ0315, abo0315)).toEqual({ statut: "LIEE", etat: "REALISEE" });
    const liee = await prisma.expectedOccurrence.findUniqueOrThrow({ where: { id: occ0315 } });
    expect(liee.liaison).toBe("MANUELLE");
    expect(liee.lieeLe).not.toBeNull();
    expect(await lierOccurrence(ownerId, occ0315, abo0315)).toEqual({ statut: "ECHEANCE_PRISE" });

    expect(await lierOccurrence(ownerId, occ0715, abo0315)).toEqual({ statut: "TRANSACTION_PRISE" });
    expect(await lierOccurrence(ownerId, occ0715, tx("FILLE"))).toEqual({ statut: "LIGNE_FILLE" });
    expect(await lierOccurrence(ownerId, occ0715, tx("AUTRE"))).toEqual({ statut: "AUTRE_COMPTE" });
    expect(await lierOccurrence(ownerId, occ0715, tx("LIBRE"))).toEqual({ statut: "HORS_FENETRE" });
    expect(await lierOccurrence(ownerId, occ0815, tx("LIBRE"))).toEqual({ statut: "LIEE", etat: "REALISEE" });
    expect(await lierOccurrence(ownerId, CUID_INEXISTANT, tx("LIBRE"))).toEqual({ statut: "ECHEANCE_INTROUVABLE" });
    expect(await lierOccurrence(ownerId, occ0715, CUID_INEXISTANT)).toEqual({ statut: "TRANSACTION_INTROUVABLE" });
    await invariantsRegles(ruleAbo);
    await invariantsTransactions(abo0315, tx("LIBRE"));
  });

  it("R10 — ignorer, rétablir, modifier le montant d'une échéance", async () => {
    const occ0915 = (await occurrenceDe(ruleAbo, "2099-09-15")).id;
    const occ1015 = (await occurrenceDe(ruleAbo, "2099-10-15")).id;
    const occ0115 = (await occurrenceDe(ruleAbo, "2099-01-15")).id;
    expect(await ignorerOccurrence(ownerId, occ0915)).toEqual({ statut: "FAIT" });
    expect((await prisma.expectedOccurrence.findUniqueOrThrow({ where: { id: occ0915 } })).etat).toBe("IGNOREE");
    expect(await ignorerOccurrence(ownerId, occ0915)).toEqual({ statut: "NON_APPLICABLE" });
    expect(await retablirOccurrence(ownerId, occ0915)).toEqual({ statut: "FAIT" });
    expect((await prisma.expectedOccurrence.findUniqueOrThrow({ where: { id: occ0915 } })).etat).toBe("PREVUE");
    expect(await retablirOccurrence(ownerId, occ0915)).toEqual({ statut: "NON_APPLICABLE" });
    expect(await ignorerOccurrence(ownerId, occ0115)).toEqual({ statut: "NON_APPLICABLE" });
    expect(await modifierMontantOccurrence(ownerId, occ1015, -2700)).toEqual({ statut: "FAIT" });
    expect((await prisma.expectedOccurrence.findUniqueOrThrow({ where: { id: occ1015 } })).montantCents).toBe(-2700);
    expect((await prisma.recurringRule.findUniqueOrThrow({ where: { id: ruleAbo } })).montantCents).toBe(-2500);
    expect(await modifierMontantOccurrence(ownerId, occ0115, -2700)).toEqual({ statut: "NON_APPLICABLE" });
    expect(await ignorerOccurrence(ownerId, occ0915)).toEqual({ statut: "FAIT" });
    await invariantsRegles(ruleAbo);
  });

  it("R11 — modifier une règle : seules les échéances ouvertes à venir sont recréées", async () => {
    const avant = await occurrencesDe(ruleAbo);
    const liees = avant.filter((o) => o.transactionId !== null);
    expect(liees).toHaveLength(7);

    const r1 = await modifierRecurrence(ownerId, ruleAbo, { ...champsAbo, montantCents: -2600 }, AUJ);
    expect(r1).toEqual({ statut: "MODIFIEE", echeancesSupprimees: 10, echeancesCreees: 10 });
    const apres1 = await occurrencesDe(ruleAbo);
    expect(apres1).toHaveLength(18);
    for (const l of liees) {
      const relue = apres1.find((o) => o.id === l.id);
      expect(relue).toMatchObject({ montantCents: l.montantCents, etat: l.etat, liaison: l.liaison, transactionId: l.transactionId });
    }
    const ignoree = apres1.find((o) => o.echeance.getTime() === versDateUtc("2099-09-15").getTime());
    expect(ignoree?.etat).toBe("IGNOREE");
    const aVenir = apres1.filter((o) => o.transactionId === null && o.etat === "PREVUE");
    expect(aVenir).toHaveLength(10);
    expect(aVenir.every((o) => o.montantCents === -2600)).toBe(true);

    const r2 = await modifierRecurrence(
      ownerId,
      ruleAbo,
      { ...champsAbo, montantCents: -2600, dateAncrage: "2099-07-20" },
      AUJ,
    );
    expect(r2).toEqual({ statut: "MODIFIEE", echeancesSupprimees: 10, echeancesCreees: 12 });
    const apres2 = await occurrencesDe(ruleAbo);
    expect(apres2).toHaveLength(20);
    expect(await prisma.expectedOccurrence.count({
      where: { ruleId: ruleAbo, transactionId: null, echeance: { lt: versDateUtc(AUJ) } },
    })).toBe(0);
    expect(await modifierRecurrence(ownerId, CUID_INEXISTANT, champsAbo, AUJ)).toEqual({ statut: "INTROUVABLE" });
    await invariantsRegles(ruleAbo);

    // Les ouvertes passées restent : l'échéance 2099-04-10 de SPORT n'est ni liée, ni à venir.
    const sportAvant = await occurrenceDe(ruleSport, "2099-04-10");
    expect(sportAvant).toMatchObject({ transactionId: null, montantCents: -4000 });
    const regleSport = await prisma.recurringRule.findUniqueOrThrow({ where: { id: ruleSport } });
    const rSport = await modifierRecurrence(
      ownerId,
      ruleSport,
      {
        libelle: regleSport.libelle,
        nature: regleSport.nature,
        montantCents: -4100,
        cadence: regleSport.cadence,
        dateAncrage: depuisDateUtc(regleSport.dateAncrage),
        subcategoryId: regleSport.subcategoryId,
        motifRapprochement: regleSport.motifRapprochement ?? "",
        toleranceCents: regleSport.toleranceCents,
        toleranceJours: regleSport.toleranceJours,
      },
      AUJ,
    );
    expect(rSport.statut).toBe("MODIFIEE");
    const sportApres = await occurrenceDe(ruleSport, "2099-04-10");
    expect(sportApres.id).toBe(sportAvant.id);
    expect(sportApres.montantCents).toBe(-4000);
    expect(sportApres.etat).toBe(sportAvant.etat);
    expect(await prisma.expectedOccurrence.count({ where: { ruleId: ruleSport } })).toBe(18);
    await invariantsRegles(ruleSport);
  });

  it("R12 — terminer : les échéances non liées après la date de fin partent, ignorées comprises", async () => {
    const occ1120 = (await occurrenceDe(ruleAbo, "2099-11-20")).id;
    expect(await ignorerOccurrence(ownerId, occ1120)).toEqual({ statut: "FAIT" });
    expect(await terminerRecurrence(ownerId, ruleAbo, "2099-09-30")).toEqual({
      statut: "TERMINEE",
      echeancesRetirees: 9,
      dontIgnorees: 1,
    });
    const restantes = await occurrencesDe(ruleAbo);
    expect(restantes).toHaveLength(11);
    expect(restantes.filter((o) => o.transactionId !== null)).toHaveLength(7);
    expect(restantes.filter((o) => o.transactionId === null && o.echeance > versDateUtc("2099-09-30"))).toHaveLength(0);
    const regle = await prisma.recurringRule.findUniqueOrThrow({ where: { id: ruleAbo } });
    expect(regle.dateFin?.toISOString().slice(0, 10)).toBe("2099-09-30");
    expect(await terminerRecurrence(ownerId, ruleAbo, "2099-09-30")).toEqual({ statut: "DEJA_TERMINEE" });
    expect(await terminerRecurrence(ownerId, ruleSport, "2098-12-31")).toEqual({ statut: "FIN_AVANT_ANCRAGE" });
    expect((await prisma.recurringRule.findUniqueOrThrow({ where: { id: ruleSport } })).dateFin).toBeNull();

    const ecran = await lireEcranRecurrences(ownerId, AUJ);
    // La série avait des échéances ouvertes entre AUJ et sa fin : terminée, elle n'annonce plus de prochaine échéance.
    expect(ecran.series.find((s) => s.id === ruleAbo)).toMatchObject({ terminee: true, prochaineEcheance: null });
    expect(ecran.series.find((s) => s.id === ruleSport)).toMatchObject({
      terminee: false,
      prochaineEcheance: "2099-07-10",
      nbLiees: 5,
    });
    await invariantsRegles(ruleAbo, ruleSport);
  });

  it("R13 — l'écran : paiements attendus non vus, détail d'une transaction liée", async () => {
    const ecran = await lireEcranRecurrences(ownerId, AUJ);
    const sport0410 = (await occurrenceDe(ruleSport, "2099-04-10")).id;
    const gym0305 = (await occurrenceDe(ruleGym, "2099-03-05")).id;
    const libelleSport = (await prisma.recurringRule.findUniqueOrThrow({ where: { id: ruleSport } })).libelle;
    expect(ecran.nonVus.find((n) => n.occurrenceId === sport0410)).toMatchObject({
      libelle: libelleSport,
      montantCents: -4000,
      echeance: "2099-04-10",
    });
    expect(ecran.nonVus.some((n) => n.occurrenceId === gym0305)).toBe(true);
    expect(ecran.nonVus.some((n) => n.ruleId === ruleAbo)).toBe(false);
    expect(ecran.nbNonVus).toBeGreaterThanOrEqual(ecran.nonVus.length);

    const detail = await lireTransaction(ownerId, tx("SPORT@2099-01-10"));
    expect(detail?.recurrence).toMatchObject({
      ruleId: ruleSport,
      libelle: libelleSport,
      echeance: "2099-01-10",
      liaison: "RETROACTIVE",
      lieeLe: dateCivileDansFuseau(new Date(), FUSEAU_APPLICATION),
    });
    expect(await lireOccurrenceLiee(ownerId, tx("SPORT@2099-01-10"))).toEqual({
      libelle: libelleSport,
      echeance: "2099-01-10",
    });
    expect(await lireOccurrenceLiee(ownerId, tx("SPORT@2099-04-14"))).toBeNull();
  });

  it("R14 — supprimer une série défait ses liaisons et garde les transactions", async () => {
    expect(await supprimerRecurrence(ownerId, ruleAbo)).toEqual({ statut: "SUPPRIMEE", liaisonsDefaites: 7 });
    expect(await prisma.expectedOccurrence.count({ where: { ruleId: ruleAbo } })).toBe(0);
    const ids = ["01", "02", "03", "04", "05", "06"].map((m) => tx(`ABO@2099-${m}-15`));
    expect(await prisma.transaction.count({ where: { id: { in: [...ids, tx("LIBRE")] } } })).toBe(7);
    expect((await lireTransaction(ownerId, tx("ABO@2099-01-15")))?.recurrence).toBeNull();
    expect((await lireTransaction(ownerId, tx("LIBRE")))?.recurrence).toBeNull();
    expect(await supprimerRecurrence(ownerId, CUID_INEXISTANT)).toEqual({ statut: "INTROUVABLE" });
    await invariantsTransactions(...ids, tx("LIBRE"));
  });

  it("R15 — le filtre « liées à une récurrence »", async () => {
    const periode = { type: "TOUT", mois: "2099-06" } as const;
    const ids = async (recurrences: "INCLURE" | "SEULEMENT" | "EXCLURE"): Promise<string[]> => {
      const page = await listerTransactions(
        ownerId,
        resoudreCriteres({ ...FILTRES_VIDES, toutesDates: true, comptes: [compteA], recurrences }, periode),
        TRI_PAR_DEFAUT,
        null,
      );
      return page.lignes.map((l) => l.id).sort();
    };
    const liees = ["01", "02", "03", "05", "06"].map((m) => tx(`SPORT@2099-${m}-10`)).sort();
    const autres = [
      ...["01", "02", "03", "04", "05", "06"].map((m) => tx(`ABO@2099-${m}-15`)),
      tx("SPORT@2099-04-14"),
      tx("LIBRE"),
      tx("PARENT"),
    ].sort();
    expect(await ids("SEULEMENT")).toEqual(liees);
    expect(await ids("EXCLURE")).toEqual(autres);
    expect(await ids("INCLURE")).toEqual([...liees, ...autres].sort());
  });

  async function toutesLesPages(
    ruleId: string,
    aujourdhui: DateCivile,
    portion: "A_VENIR" | "PASSEES",
    taille: number,
  ): Promise<OccurrenceAffichee[][]> {
    const pages: OccurrenceAffichee[][] = [];
    let curseur: CurseurOccurrences | null = null;
    for (let tours = 0; tours < 10; tours += 1) {
      const page: PageOccurrences | null = await lireOccurrences(ownerId, ruleId, aujourdhui, portion, curseur, taille);
      pages.push([...(page?.occurrences ?? [])]);
      curseur = page?.curseurSuivant ?? null;
      if (curseur === null) break;
    }
    return pages;
  }

  it("R16 — pagination des échéances d'une série, par portion", async () => {
    const aVenir = await toutesLesPages(ruleSport, AUJ, "A_VENIR", 5);
    expect(aVenir.map((p) => p.length)).toEqual([5, 5, 2]);
    const vuesAVenir = aVenir.flat();
    expect(vuesAVenir.every((o) => o.echeance >= AUJ)).toBe(true);
    const attenduAVenir = [...vuesAVenir].sort((a, b) =>
      a.echeance < b.echeance ? -1 : a.echeance > b.echeance ? 1 : a.id < b.id ? -1 : 1,
    );
    expect(vuesAVenir.map((o) => o.id)).toEqual(attenduAVenir.map((o) => o.id));

    const passees = await toutesLesPages(ruleSport, AUJ, "PASSEES", 4);
    expect(passees.map((p) => p.length)).toEqual([4, 2]);
    const vuesPassees = passees.flat();
    expect(vuesPassees.every((o) => o.echeance < AUJ)).toBe(true);
    const attenduPassees = [...vuesPassees].sort((a, b) =>
      a.echeance < b.echeance ? 1 : a.echeance > b.echeance ? -1 : b.id < a.id ? -1 : 1,
    );
    expect(vuesPassees.map((o) => o.id)).toEqual(attenduPassees.map((o) => o.id));

    const ids = [...vuesAVenir, ...vuesPassees].map((o) => o.id);
    expect(ids).toHaveLength(18);
    expect(new Set(ids).size).toBe(18);
  });

  it("R16b — la limite : une échéance du jour est à venir, pas passée ; une série sans passée rend une portion vide", async () => {
    const jour = "2099-04-10";
    const aVenir = await lireOccurrences(ownerId, ruleSport, jour, "A_VENIR", null);
    expect(aVenir?.occurrences[0]?.echeance).toBe("2099-04-10");
    expect(aVenir?.total).toBe(15);
    const passees = await lireOccurrences(ownerId, ruleSport, jour, "PASSEES", null);
    expect(passees?.occurrences[0]?.echeance).toBe("2099-03-10");
    expect(passees?.total).toBe(3);

    const vide = await lireOccurrences(ownerId, ruleSport, "2090-01-01", "PASSEES", null);
    expect(vide).toMatchObject({ total: 0, occurrences: [], curseurSuivant: null });
  });

  it("R18 — terminer avant une occurrence liée : refus, rien n'est retiré ; à la date de la liée, puis délier : invariant 4 tenu", async () => {
    const creation = await creerRecurrence(
      ownerId,
      {
        accountId: compteC,
        transactionId: tx("AUTRE"),
        champs: {
          libelle: `Série C ${M}`,
          nature: "FIXE",
          montantCents: -2500,
          cadence: "MENSUEL",
          dateAncrage: "2099-05-15",
          subcategoryId: null,
          motifRapprochement: motif("AUTRE"),
          toleranceCents: 500,
          toleranceJours: 3,
        },
      },
      AUJ,
    );
    expect(creation.statut).toBe("CREEE");
    if (creation.statut !== "CREEE") return;
    const ruleC = creation.ruleId;
    expect(creation.transaction).toEqual({ date: "2099-07-15", echeance: "2099-07-15" });
    const avant = await occurrencesDe(ruleC);

    expect(await terminerRecurrence(ownerId, ruleC, "2099-06-30")).toEqual({
      statut: "FIN_AVANT_LIEE",
      echeance: "2099-07-15",
    });
    expect(await occurrencesDe(ruleC)).toHaveLength(avant.length);
    expect((await prisma.recurringRule.findUniqueOrThrow({ where: { id: ruleC } })).dateFin).toBeNull();

    const terminee = await terminerRecurrence(ownerId, ruleC, "2099-07-15");
    expect(terminee.statut).toBe("TERMINEE");
    const liee = await occurrenceDe(ruleC, "2099-07-15");
    expect(await delierOccurrence(ownerId, liee.id)).toEqual({ statut: "DELIEE", transactionId: tx("AUTRE") });
    expect((await occurrenceDe(ruleC, "2099-07-15")).transactionId).toBeNull();
    await invariantsRegles(ruleC);
    await invariantsTransactions(tx("AUTRE"));
    await supprimerRecurrence(ownerId, ruleC);
  });
});

describe("concurrence : deux confirmations simultanées de la même suggestion", () => {
  it("une seule règle est créée, la seconde confirmation rend DEJA_TRAITEE (verrou FOR UPDATE de la suggestion)", async () => {
    const compteD = (
      await prisma.account.create({
        data: { ownerId, nom: `Réc D ${M}`, dateSoldeInitial: versDateUtc("2099-01-01"), estBudgetaire: false },
        select: { id: true },
      })
    ).id;
    comptesJetables.push(compteD);

    for (const tour of [1, 2, 3]) {
      const nom = `CONC${String(tour)}`;
      const cles: string[] = [];
      for (const mois of ["01", "02", "03", "04"]) {
        const cle = `${nom}@2099-${mois}-12`;
        await creerTx(cle, compteD, `${nom} ${M}`, `2099-${mois}-12`, -1000);
        cles.push(cle);
      }
      const ids = cles.map((c) => tx(c));
      const suggestion = await prisma.recurrenceSuggestion.create({
        data: {
          ownerId,
          accountId: compteD,
          motif: motif(nom),
          cadence: "MENSUEL",
          montantMedianCents: -1000,
          nbOccurrences: 4,
          regularite: 0,
          stabilite: 0,
          score: 0.9,
          transactionIds: ids,
        },
        select: { id: true },
      });
      const champs: ChampsRecurrence = {
        libelle: `Concurrente ${String(tour)} ${M}`,
        nature: "FIXE",
        montantCents: -1000,
        cadence: "MENSUEL",
        dateAncrage: "2099-01-12",
        subcategoryId: null,
        motifRapprochement: motif(nom),
        toleranceCents: 500,
        toleranceJours: 3,
      };

      const [a, b] = await Promise.all([
        confirmerSuggestion(ownerId, suggestion.id, champs, AUJ),
        confirmerSuggestion(ownerId, suggestion.id, champs, AUJ),
      ]);
      const statuts = [a.statut, b.statut].sort();
      expect(statuts, `tour ${String(tour)}`).toEqual(["CONFIRMEE", "DEJA_TRAITEE"]);

      const regles = await prisma.recurringRule.findMany({
        where: { accountId: compteD, motifRapprochement: motif(nom) },
        select: { id: true },
      });
      expect(regles).toHaveLength(1);
      const ruleId = regles[0]?.id ?? "";
      const occurrences = await occurrencesDe(ruleId);
      expect(occurrences.filter((o) => o.transactionId !== null)).toHaveLength(4);
      for (const id of ids) {
        expect(await prisma.expectedOccurrence.count({ where: { transactionId: id } })).toBe(1);
      }
      expect((await prisma.recurrenceSuggestion.findUniqueOrThrow({ where: { id: suggestion.id } })).etat).toBe("ACCEPTEE");
      await invariantsRegles(ruleId);
      await invariantsTransactions(...ids);
    }
  });
});

describe("appartenance : un autre propriétaire ne voit et ne modifie rien", () => {
  it("R17 — chaque fonction rend « introuvable » sur les objets du propriétaire", async () => {
    const regle = await prisma.recurringRule.findFirstOrThrow({
      where: { accountId: compteA, motifRapprochement: motif("SPORT") },
      select: { id: true },
    });
    const occurrence = await occurrenceDe(regle.id, "2099-04-10");
    const suggestion = await prisma.recurrenceSuggestion.create({
      data: {
        ownerId,
        accountId: compteA,
        motif: `R17 ${M}`,
        cadence: "MENSUEL",
        montantMedianCents: -100,
        nbOccurrences: 3,
        regularite: 0,
        stabilite: 0,
        score: 0.5,
        transactionIds: [],
      },
    });
    const champs: ChampsRecurrence = {
      libelle: `Intrus ${M}`,
      nature: "FIXE",
      montantCents: -100,
      cadence: "MENSUEL",
      dateAncrage: "2099-01-01",
      subcategoryId: null,
      motifRapprochement: "INTRUS",
      toleranceCents: 0,
      toleranceJours: 0,
    };
    const avant = await occurrencesDe(regle.id);

    expect(await lireOccurrences(utilisateur2Id, regle.id, AUJ, "A_VENIR", null)).toBeNull();
    expect(await lireOccurrences(utilisateur2Id, regle.id, AUJ, "PASSEES", null)).toBeNull();
    expect(await lireCandidatsTransaction(utilisateur2Id, occurrence.id)).toEqual({ statut: "INTROUVABLE" });
    expect(await lireCandidatsOccurrence(utilisateur2Id, tx("SPORT@2099-04-14"))).toEqual({ statut: "INTROUVABLE" });
    expect(await lireOccurrenceLiee(utilisateur2Id, tx("SPORT@2099-01-10"))).toBeNull();
    expect((await lireTransaction(utilisateur2Id, tx("SPORT@2099-01-10")))).toBeNull();
    const ecran = await lireEcranRecurrences(utilisateur2Id, AUJ);
    expect(ecran.series).toEqual([]);
    expect(ecran.suggestions).toEqual([]);
    expect(ecran.nonVus).toEqual([]);
    expect(await refuserSuggestion(utilisateur2Id, suggestion.id)).toBe("INTROUVABLE");
    expect(await confirmerSuggestion(utilisateur2Id, suggestion.id, champs, AUJ)).toEqual({ statut: "INTROUVABLE" });
    expect(await creerRecurrence(utilisateur2Id, { accountId: compteA, transactionId: null, champs }, AUJ)).toEqual({
      statut: "REFERENCE_INVALIDE",
      quoi: "COMPTE",
    });
    expect(await modifierRecurrence(utilisateur2Id, regle.id, champs, AUJ)).toEqual({ statut: "INTROUVABLE" });
    expect(await terminerRecurrence(utilisateur2Id, regle.id, "2099-12-31")).toEqual({ statut: "INTROUVABLE" });
    expect(await supprimerRecurrence(utilisateur2Id, regle.id)).toEqual({ statut: "INTROUVABLE" });
    expect(await lierOccurrence(utilisateur2Id, occurrence.id, tx("SPORT@2099-04-14"))).toEqual({
      statut: "ECHEANCE_INTROUVABLE",
    });
    expect(await delierOccurrence(utilisateur2Id, occurrence.id)).toEqual({ statut: "INTROUVABLE" });
    expect(await ignorerOccurrence(utilisateur2Id, occurrence.id)).toEqual({ statut: "INTROUVABLE" });
    expect(await retablirOccurrence(utilisateur2Id, occurrence.id)).toEqual({ statut: "INTROUVABLE" });
    expect(await modifierMontantOccurrence(utilisateur2Id, occurrence.id, -1)).toEqual({ statut: "INTROUVABLE" });
    expect(await rechercherSuggestions(utilisateur2Id)).toEqual({
      dateReference: null,
      nbSuggestions: 0,
      limiteAtteinte: false,
    });

    expect(await occurrencesDe(regle.id)).toEqual(avant);
    const relue = await prisma.recurrenceSuggestion.findUniqueOrThrow({ where: { id: suggestion.id } });
    expect(relue.etat).toBe("EN_ATTENTE");
    expect(await prisma.recurringRule.count({ where: { id: regle.id } })).toBe(1);
  });
});
