// Seed synthétique et déterministe — docs/lot-m0-revision.md §5.
// Aucune donnée réelle : montants, dates et libellés sont générés par un
// générateur pseudo-aléatoire à graine fixe (mulberry32), jamais Math.random().

import { PrismaClient } from "@prisma/client";
import { ajouterJours, dateCivile, ecartJours, echeances, moisDe, type DateCivile } from "../src/domain/dates";
import { calculerEmpreinte, normaliserDescription, normaliserNom } from "../src/domain/ingestion";
import { creerFabriqueIdentifiants, GRAINE_IDENTIFIANTS_SEED } from "./identifiant-seed";

const prisma = new PrismaClient();

const AUJOURDHUI: DateCivile = "2026-09-13";
const DEBUT_HISTORIQUE: DateCivile = "2025-03-01";
const FIN_OCCURRENCES: DateCivile = "2026-12-31"; // quelques échéances futures, pour la prévision (M5)

// ───────────────────────── générateur pseudo-aléatoire (mulberry32)

function mulberry32(graine: number) {
  let a = graine;
  return function alea(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const alea = mulberry32(20260913);
// Graine distincte de `alea` : tirer les identifiants dans `alea` décalerait
// toute la suite pseudo-aléatoire, donc tous les montants et dates du seed.
const nouvelIdentifiant = creerFabriqueIdentifiants(GRAINE_IDENTIFIANTS_SEED);

function entierAleatoire(min: number, max: number): number {
  return Math.floor(alea() * (max - min + 1)) + min;
}

function choix<T>(tableau: readonly T[]): T {
  const item = tableau[entierAleatoire(0, tableau.length - 1)];
  if (item === undefined) {
    throw new Error("choix : tableau vide");
  }
  return item;
}

function gaussienneCents(moyenneCents: number, ecartTypeCents: number): number {
  const u1 = Math.max(alea(), 1e-9);
  const u2 = alea();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return Math.max(0, Math.round(moyenneCents + z * ecartTypeCents));
}

function repartir(totalCents: number, n: number): number[] {
  const poids = Array.from({ length: n }, () => alea() + 0.2);
  const sommePoids = poids.reduce((s, p) => s + p, 0);
  const montants = poids.map((p) => Math.round((p / sommePoids) * totalCents));
  const sommeMontants = montants.reduce((s, m) => s + m, 0);
  const dernier = montants[n - 1];
  if (dernier === undefined) {
    throw new Error("repartir : n doit être >= 1");
  }
  montants[n - 1] = dernier + (totalCents - sommeMontants);
  return montants;
}

function dateAleatoireDans(debut: DateCivile, fin: DateCivile): DateCivile {
  const empan = ecartJours(debut, fin);
  return ajouterJours(debut, entierAleatoire(0, Math.max(0, empan)));
}

/** Conversion vers `Date` au moment de parler à Prisma — jamais avant. */
function versDateTime(d: DateCivile): Date {
  return new Date(`${d}T00:00:00.000Z`);
}

// ───────────────────────── calendrier : 18 mois pleins + le mois courant, partiel

interface MoisBucket {
  cle: string; // "AAAA-MM"
  debut: DateCivile;
  fin: DateCivile;
  partiel: boolean;
  nbJoursDuMois: number;
}

function premierJourMoisSuivant(debutDuMois: DateCivile): DateCivile {
  const [annee, mois] = debutDuMois.split("-").map(Number) as [number, number];
  return mois === 12 ? dateCivile(annee + 1, 1, 1) : dateCivile(annee, mois + 1, 1);
}

function genererMoisBuckets(): MoisBucket[] {
  const buckets: MoisBucket[] = [];
  let debut = DEBUT_HISTORIQUE;

  for (;;) {
    const debutMoisSuivant = premierJourMoisSuivant(debut);
    const dernierJourDuMoisCalendaire = ajouterJours(debutMoisSuivant, -1);
    const nbJoursDuMois = ecartJours(debut, dernierJourDuMoisCalendaire) + 1;
    const partiel = dernierJourDuMoisCalendaire > AUJOURDHUI;
    const fin = partiel ? AUJOURDHUI : dernierJourDuMoisCalendaire;

    buckets.push({ cle: moisDe(debut), debut, fin, partiel, nbJoursDuMois });

    if (partiel) {
      break;
    }
    debut = debutMoisSuivant;
  }

  return buckets;
}

const MOIS_BUCKETS = genererMoisBuckets();
const MOIS_HISTORIQUE = MOIS_BUCKETS.map((b) => b.cle); // 19 mois, du début à aujourd'hui
// Le budget n'a que 12 mois d'historique : on a commencé à s'en servir plus tard
// que le début de l'historique transactionnel.
const MOIS_BUDGET = MOIS_HISTORIQUE.slice(-12);

function bucketDuMois(mois: string): MoisBucket {
  const bucket = MOIS_BUCKETS.find((b) => b.cle === mois);
  if (!bucket) {
    throw new Error(`bucket introuvable pour ${mois}`);
  }
  return bucket;
}

// ───────────────────────── empreintes uniques

const empreintesVues = new Set<string>();

interface ParamsTransaction {
  ownerId: string;
  accountId: string;
  date: DateCivile;
  descriptionBrute: string;
  montantCents: number;
  payeeId?: string | null;
  subcategoryId?: string | null;
  source: "COPIER_COLLER" | "MANUELLE" | "AJUSTEMENT";
  transferAccountId?: string | null;
  transferTransactionId?: string | null;
  parentId?: string | null;
  estVentilee?: boolean;
  appliedRuleId?: string | null;
  aRevoir?: boolean;
}

function construireTransaction(params: ParamsTransaction) {
  const descriptionNormalisee = normaliserDescription(params.descriptionBrute);
  let montantCents = params.montantCents;
  let empreinte = calculerEmpreinte(params.accountId, params.date, montantCents, descriptionNormalisee);

  // Deux lignes générées aléatoirement peuvent coïncider exactement (compte,
  // date, montant, description) : on les distingue par un cent plutôt que de
  // violer l'unicité de l'empreinte.
  let tentatives = 0;
  while (empreintesVues.has(empreinte) && tentatives < 50) {
    montantCents += montantCents >= 0 ? 1 : -1;
    empreinte = calculerEmpreinte(params.accountId, params.date, montantCents, descriptionNormalisee);
    tentatives += 1;
  }
  empreintesVues.add(empreinte);

  return {
    id: nouvelIdentifiant(),
    ownerId: params.ownerId,
    accountId: params.accountId,
    date: params.date,
    description: params.descriptionBrute,
    descriptionNormalisee,
    montantCents,
    payeeId: params.payeeId ?? null,
    subcategoryId: params.subcategoryId ?? null,
    parentId: params.parentId ?? null,
    estVentilee: params.estVentilee ?? false,
    transferAccountId: params.transferAccountId ?? null,
    transferTransactionId: params.transferTransactionId ?? null,
    source: params.source,
    empreinte,
    appliedRuleId: params.appliedRuleId ?? null,
    aRevoir: params.aRevoir ?? false,
  };
}

type TransactionSeed = ReturnType<typeof construireTransaction>;

async function main() {
  console.warn("Seed — nettoyage des tables métier…");
  await viderLesTables();

  console.warn("Seed — utilisateur, préférences, réglages…");
  const owner = await prisma.user.create({
    data: { email: "demo@budgapp.example", nom: "Benjamin" },
  });
  const ownerId = owner.id;

  await prisma.preference.create({ data: { ownerId } });
  await prisma.forecastSettings.create({ data: { ownerId } });

  console.warn("Seed — comptes, termes de prêt, droits de cotisation…");
  const comptes = await creerComptes(ownerId);
  const termesPret = await creerTermesPret(comptes.hypotheque);
  await creerContributionRooms(comptes);

  console.warn("Seed — catégories, sous-catégories, cibles…");
  const { subcatId } = await creerCategories(ownerId);

  console.warn("Seed — bénéficiaires et étiquettes…");
  const payeeId = await creerPayees(ownerId, subcatId);
  const tagId = await creerTags(ownerId);

  console.warn("Seed — règles et filtres d'import…");
  const ruleId = await creerRegles(ownerId, subcatId);
  await creerFiltresImport(ownerId);

  console.warn("Seed — transactions (récurrences, virements, ventilations, dépenses variables)…");
  const transactions: TransactionSeed[] = [];
  const contributionEntries: { transactionId: string; accountId: string; anneeImputation: number; montantCents: number }[] = [];

  const recurrences = genererRecurrences(ownerId, comptes, subcatId, termesPret, transactions);
  genererVirements(ownerId, comptes, transactions, contributionEntries);
  genererDepensesVariables(ownerId, comptes, subcatId, payeeId, ruleId, transactions);
  genererMouvementsDivers(ownerId, comptes, subcatId, payeeId, transactions);
  genererAmazon(ownerId, comptes, payeeId, transactions);
  genererPaiementsVisa(ownerId, comptes, transactions);

  await prisma.transaction.createMany({
    data: transactions.map((t) => ({ ...t, date: versDateTime(t.date) })),
  });
  await enregistrerRecurrences(ownerId, recurrences);
  await enregistrerContributionEntries(contributionEntries);
  await etiqueterTransport(tagId.Auto, transactions);

  console.warn("Seed — allocations et cibles de report…");
  await creerBudgetAllocations(ownerId, subcatId);

  console.warn("Seed — mouvements entre enveloppes…");
  await creerMouvementsEnveloppes(ownerId, subcatId);

  console.warn("Seed — objectifs, plan de dette, scénario…");
  await creerObjectifs(ownerId, comptes);
  await creerPlanDette(ownerId, comptes);
  await creerScenario(ownerId, comptes, subcatId);

  console.warn("Seed — relevés de solde et réconciliation…");
  await creerRelevesSolde(comptes, transactions);

  console.warn("Seed — événements planifiés…");
  await creerEvenementsPlanifies(ownerId, comptes, subcatId);

  console.warn(`Seed — terminé : ${String(transactions.length)} transactions.`);
}

// ───────────────────────── nettoyage (ordre sûr pour les clés étrangères)

async function viderLesTables() {
  await prisma.savedReport.deleteMany();
  await prisma.reconciliation.deleteMany();
  await prisma.balanceStatement.deleteMany();
  await prisma.debtPlanItem.deleteMany();
  await prisma.debtPlan.deleteMany();
  await prisma.goalTransaction.deleteMany();
  await prisma.goalAccount.deleteMany();
  await prisma.goal.deleteMany();
  await prisma.scenarioSurcharge.deleteMany();
  await prisma.scenario.deleteMany();
  await prisma.moneyMovement.deleteMany();
  await prisma.target.deleteMany();
  await prisma.budgetAllocation.deleteMany();
  await prisma.expectedOccurrence.deleteMany();
  await prisma.recurrenceSuggestion.deleteMany();
  await prisma.recurringSplit.deleteMany();
  await prisma.recurringRule.deleteMany();
  await prisma.plannedEvent.deleteMany();
  await prisma.calendarFeed.deleteMany();
  await prisma.forecastSettings.deleteMany();
  await prisma.subcategoryForecast.deleteMany();
  await prisma.contributionEntry.deleteMany();
  await prisma.contributionRoom.deleteMany();
  await prisma.assetAllocation.deleteMany();
  await prisma.loanTerm.deleteMany();
  await prisma.transactionTag.deleteMany();
  await prisma.transaction.deleteMany();
  await prisma.importBatch.deleteMany();
  await prisma.importFilter.deleteMany();
  await prisma.ruleAction.deleteMany();
  await prisma.ruleCondition.deleteMany();
  await prisma.rule.deleteMany();
  await prisma.tag.deleteMany();
  await prisma.payee.deleteMany();
  await prisma.subcategory.deleteMany();
  await prisma.category.deleteMany();
  await prisma.account.deleteMany();
  await prisma.preference.deleteMany();
  await prisma.user.deleteMany();
}

// ───────────────────────── comptes

interface Comptes {
  cheque: string;
  epargne: string;
  visa: string;
  marge: string;
  celiapp: string;
  reer: string;
  maison: string;
  hypotheque: string;
}

const CAPITAL_INITIAL_HYPOTHEQUE = 34_000_000; // 340 000 $

async function creerComptes(ownerId: string): Promise<Comptes> {
  const cheque = await prisma.account.create({
    data: {
      ownerId,
      nom: "Chèque",
      type: "CHEQUE",
      institution: "Desjardins",
      soldeInitialCents: 250_000,
      dateSoldeInitial: versDateTime(DEBUT_HISTORIQUE),
      seuilSecuriteCents: 50_000,
      ordre: 0,
    },
  });
  const epargne = await prisma.account.create({
    data: {
      ownerId,
      nom: "Épargne",
      type: "EPARGNE",
      institution: "Desjardins",
      soldeInitialCents: 800_000,
      dateSoldeInitial: versDateTime(DEBUT_HISTORIQUE),
      ordre: 1,
    },
  });
  const visa = await prisma.account.create({
    data: {
      ownerId,
      nom: "Visa",
      type: "CREDIT",
      institution: "Desjardins",
      soldeInitialCents: 0,
      dateSoldeInitial: versDateTime(DEBUT_HISTORIQUE),
      limiteCreditCents: 500_000,
      tauxAnnuel: 0.1999,
      jourReleve: 3,
      jourEcheance: 21,
      ordre: 2,
    },
  });
  const marge = await prisma.account.create({
    data: {
      ownerId,
      nom: "Marge",
      type: "MARGE",
      institution: "Desjardins",
      soldeInitialCents: 0,
      dateSoldeInitial: versDateTime(DEBUT_HISTORIQUE),
      inclureDansPrevision: false,
      ordre: 3,
    },
  });
  const celiapp = await prisma.account.create({
    data: {
      ownerId,
      nom: "CELIAPP",
      type: "PLACEMENT",
      institution: "Desjardins",
      estBudgetaire: false,
      soldeInitialCents: 800_000,
      dateSoldeInitial: versDateTime(DEBUT_HISTORIQUE),
      regimeFiscal: "CELIAPP",
      tauxRendementAnnuel: 0.04,
      ordre: 4,
    },
  });
  const reer = await prisma.account.create({
    data: {
      ownerId,
      nom: "REER",
      type: "PLACEMENT",
      institution: "Desjardins",
      estBudgetaire: false,
      soldeInitialCents: 1_500_000,
      dateSoldeInitial: versDateTime(DEBUT_HISTORIQUE),
      regimeFiscal: "REER",
      tauxRendementAnnuel: 0.05,
      ordre: 5,
    },
  });
  const maison = await prisma.account.create({
    data: {
      ownerId,
      nom: "Maison",
      type: "ACTIF",
      estBudgetaire: false,
      soldeInitialCents: 45_000_000,
      dateSoldeInitial: versDateTime(DEBUT_HISTORIQUE),
      ordre: 6,
    },
  });
  const hypotheque = await prisma.account.create({
    data: {
      ownerId,
      nom: "Hypothèque",
      type: "PRET",
      institution: "Desjardins",
      estBudgetaire: false,
      soldeInitialCents: -CAPITAL_INITIAL_HYPOTHEQUE,
      dateSoldeInitial: versDateTime(DEBUT_HISTORIQUE),
      compteLieId: maison.id,
      ordre: 7,
    },
  });

  return {
    cheque: cheque.id,
    epargne: epargne.id,
    visa: visa.id,
    marge: marge.id,
    celiapp: celiapp.id,
    reer: reer.id,
    maison: maison.id,
    hypotheque: hypotheque.id,
  };
}

// ───────────────────────── amortissement hypothécaire (convention canadienne)

interface TermePret {
  moisEffectif: string;
  dateDebut: DateCivile;
  tauxAnnuel: number;
  paiementCents: number;
}

const TERMES_PRET: TermePret[] = [
  { moisEffectif: "2025-03", dateDebut: "2025-03-01", tauxAnnuel: 0.0489, paiementCents: 185_000 },
  { moisEffectif: "2026-01", dateDebut: "2026-01-01", tauxAnnuel: 0.0525, paiementCents: 192_000 },
];

const ASSURANCE_PRET_CENTS = 6_000; // 60 $/mois, flat

async function creerTermesPret(accountId: string): Promise<TermePret[]> {
  const [termeInitial, termeRenouvele] = TERMES_PRET;
  if (!termeInitial || !termeRenouvele) {
    throw new Error("TERMES_PRET doit contenir exactement deux termes");
  }

  await prisma.loanTerm.create({
    data: {
      accountId,
      moisEffectif: termeInitial.moisEffectif,
      capitalInitialCents: CAPITAL_INITIAL_HYPOTHEQUE,
      tauxAnnuel: termeInitial.tauxAnnuel,
      paiementCents: termeInitial.paiementCents,
      dateDebut: versDateTime(termeInitial.dateDebut),
    },
  });
  await prisma.loanTerm.create({
    data: {
      accountId,
      moisEffectif: termeRenouvele.moisEffectif,
      tauxAnnuel: termeRenouvele.tauxAnnuel,
      paiementCents: termeRenouvele.paiementCents,
      dateDebut: versDateTime(termeRenouvele.dateDebut),
    },
  });
  return TERMES_PRET;
}

/** Taux mensuel équivalent à un taux annuel composé semestriellement (convention canadienne). */
function tauxMensuel(tauxAnnuel: number): number {
  return Math.pow(1 + tauxAnnuel / 2, 1 / 6) - 1;
}

function termePour(mois: string): TermePret {
  const applicables = TERMES_PRET.filter((t) => t.moisEffectif <= mois);
  const dernier = applicables[applicables.length - 1] ?? TERMES_PRET[0];
  if (!dernier) {
    throw new Error("aucun terme de prêt défini");
  }
  return dernier;
}

interface EcheanceHypotheque {
  mois: string;
  capitalCents: number;
  interetsCents: number;
  assuranceCents: number;
  totalCents: number;
}

/** Échéancier réel, mois par mois, à solde décroissant — jamais réécrit rétroactivement par un renouvellement. */
function calculerEcheancierHypotheque(mois: string[]): EcheanceHypotheque[] {
  let soldeRestant = CAPITAL_INITIAL_HYPOTHEQUE;
  const echeancier: EcheanceHypotheque[] = [];

  for (const m of mois) {
    const terme = termePour(m);
    const interetsCents = Math.round(soldeRestant * tauxMensuel(terme.tauxAnnuel));
    const capitalCents = terme.paiementCents - interetsCents;
    soldeRestant -= capitalCents;

    echeancier.push({
      mois: m,
      capitalCents,
      interetsCents,
      assuranceCents: ASSURANCE_PRET_CENTS,
      totalCents: terme.paiementCents + ASSURANCE_PRET_CENTS,
    });
  }

  return echeancier;
}

async function creerContributionRooms(comptes: Comptes) {
  await prisma.contributionRoom.create({
    data: { accountId: comptes.celiapp, annee: 2025, plafondCents: 800_000, reportCents: 0 },
  });
  await prisma.contributionRoom.create({
    data: { accountId: comptes.celiapp, annee: 2026, plafondCents: 800_000, reportCents: 100_000 },
  });
  await prisma.contributionRoom.create({
    data: { accountId: comptes.reer, annee: 2025, plafondCents: 1_500_000, reportCents: 300_000 },
  });
  await prisma.contributionRoom.create({
    data: { accountId: comptes.reer, annee: 2026, plafondCents: 1_560_000, reportCents: 200_000 },
  });
}

// ───────────────────────── catégories, sous-catégories et cibles

interface DefinitionSousCategorie {
  nom: string;
  systeme?: boolean;
  reportMode?: "AUCUN" | "SIGNE" | "POSITIF_SEULEMENT";
  cible?: {
    montantCents: number;
    cadence: "MENSUEL" | "AUX_3_MOIS" | "ANNUEL";
    mode: "RECOMPLETER" | "ACCUMULER";
    jourEcheance?: number;
  };
}

const TAXONOMIE: Record<string, { couleur: string; sousCategories: DefinitionSousCategorie[] }> = {
  Logement: {
    couleur: "#f59e0b",
    sousCategories: [
      { nom: "Capital hypothécaire" },
      { nom: "Intérêts hypothécaires" },
      { nom: "Assurance hypothécaire" },
      { nom: "Électricité" },
      { nom: "Internet" },
      { nom: "Assurance habitation" },
      { nom: "Ajustement de solde", systeme: true },
    ],
  },
  Alimentation: {
    couleur: "#16a34a",
    sousCategories: [
      { nom: "Épicerie", reportMode: "AUCUN", cible: { montantCents: 60_000, cadence: "MENSUEL", mode: "RECOMPLETER" } },
      { nom: "Restaurant", reportMode: "SIGNE" },
      { nom: "Café" },
    ],
  },
  Transport: {
    couleur: "#0284c7",
    sousCategories: [
      { nom: "Essence", reportMode: "POSITIF_SEULEMENT" },
      { nom: "Assurance auto" },
      { nom: "Entretien", cible: { montantCents: 15_000, cadence: "AUX_3_MOIS", mode: "ACCUMULER" } },
      { nom: "Stationnement" },
      {
        nom: "Immatriculation",
        cible: { montantCents: 34_000, cadence: "ANNUEL", mode: "ACCUMULER", jourEcheance: 15 },
      },
    ],
  },
  Loisirs: {
    couleur: "#a855f7",
    sousCategories: [{ nom: "Sorties" }, { nom: "Cinéma" }, { nom: "Vacances" }, { nom: "Sport" }],
  },
  Abonnements: {
    couleur: "#ec4899",
    sousCategories: [{ nom: "Streaming" }, { nom: "Logiciels" }],
  },
  Santé: {
    couleur: "#dc2626",
    sousCategories: [{ nom: "Pharmacie" }, { nom: "Soins dentaires" }],
  },
  Revenus: {
    couleur: "#0d9488",
    sousCategories: [{ nom: "Paie" }, { nom: "Autres revenus" }],
  },
};

async function creerCategories(ownerId: string) {
  const subcatId: Record<string, string> = {};
  let ordreCategorie = 0;

  for (const [nomCategorie, { couleur, sousCategories }] of Object.entries(TAXONOMIE)) {
    const categorie = await prisma.category.create({
      data: { ownerId, nom: nomCategorie, couleur, ordre: ordreCategorie },
    });
    ordreCategorie += 1;

    let ordreSousCategorie = 0;
    for (const definition of sousCategories) {
      const sousCategorie = await prisma.subcategory.create({
        data: {
          categoryId: categorie.id,
          nom: definition.nom,
          ordre: ordreSousCategorie,
          systeme: definition.systeme ?? false,
          reportMode: definition.reportMode ?? "SIGNE",
        },
      });
      subcatId[definition.nom] = sousCategorie.id;
      ordreSousCategorie += 1;

      if (definition.cible) {
        await prisma.target.create({
          data: {
            subcategoryId: sousCategorie.id,
            montantCents: definition.cible.montantCents,
            cadence: definition.cible.cadence,
            mode: definition.cible.mode,
            jourEcheance: definition.cible.jourEcheance ?? null,
            dateDebut: versDateTime(DEBUT_HISTORIQUE),
          },
        });
      }
    }
  }

  return { subcatId };
}

// ───────────────────────── bénéficiaires et étiquettes

const PAYEES_BRUTS = [
  "IGA VALBRUME",
  "METRO LAC-BRUME",
  "SUPER C",
  "PROVIGO",
  "PETRO-CANADA",
  "ESSO",
  "CIRCLE K",
  "RESTAURANT LA BONNE TABLE",
  "RESTAURANT ST-HUBERT",
  "PIZZERIA NAPOLI",
  "CAFE DEPOT",
  "TIM HORTONS",
  "BILLETTERIE EVENKO",
  "BAR LE RENDEZ-VOUS",
  "CINEMA CINEPLEX",
  "ENERGIE CARDIO",
  "AIR CANADA VACANCES",
  "PHARMACIE JEAN COUTU",
  "CLINIQUE DENTAIRE LAC-BRUME",
  "GARAGE MARIO MECANIQUE",
  "BELAIR ASSURANCE",
  "INTACT ASSURANCE AUTO",
  "HYDRO-QUEBEC",
  "VIDEOTRON",
  "NETFLIX.COM",
  "MICROSOFT 365",
  "STATIONNEMENT INDIGO",
  // Trois graphies du même marchand — pour éprouver la fusion de bénéficiaires.
  "AMAZON.CA",
  "AMZN MKTP CA",
  "AMAZON.COM",
  "SOCIÉTÉ DE L'ASSURANCE AUTOMOBILE DU QUÉBEC",
] as const;

// Sert l'étape 4 de la catégorisation (docs/lot-m1.md §6.3) : la sous-catégorie
// par défaut du bénéficiaire, appliquée quand aucune règle n'a posé de catégorie.
const SOUS_CATEGORIE_PAR_DEFAUT: Record<string, string> = {
  "HYDRO-QUEBEC": "Électricité",
  VIDEOTRON: "Internet",
  "NETFLIX.COM": "Streaming",
  "MICROSOFT 365": "Logiciels",
  "STATIONNEMENT INDIGO": "Stationnement",
  "PHARMACIE JEAN COUTU": "Pharmacie",
};

async function creerPayees(ownerId: string, subcatId: Record<string, string>): Promise<Record<string, string>> {
  const payeeId: Record<string, string> = {};
  for (const nom of PAYEES_BRUTS) {
    const nomSousCategorie = SOUS_CATEGORIE_PAR_DEFAUT[nom];
    const sousCategorieParDefautId = (nomSousCategorie ? subcatId[nomSousCategorie] : undefined) ?? null;
    const payee = await prisma.payee.create({
      data: { ownerId, nom, nomNormalise: normaliserNom(nom), sousCategorieParDefautId },
    });
    payeeId[nom] = payee.id;
  }
  return payeeId;
}

async function creerTags(ownerId: string): Promise<{ Auto: string; ARembourser: string; Cadeaux: string; Recurrent: string }> {
  const auto = await prisma.tag.create({ data: { ownerId, nom: "Auto", couleur: "#0284c7", cibleMensuelleCents: 25_000 } });
  const aRembourser = await prisma.tag.create({ data: { ownerId, nom: "À rembourser", couleur: "#dc2626" } });
  const cadeaux = await prisma.tag.create({ data: { ownerId, nom: "Cadeaux", couleur: "#a855f7" } });
  const recurrent = await prisma.tag.create({ data: { ownerId, nom: "Récurrent", couleur: "#16a34a" } });
  return { Auto: auto.id, ARembourser: aRembourser.id, Cadeaux: cadeaux.id, Recurrent: recurrent.id };
}

// ───────────────────────── règles de catégorisation

interface DefinitionCondition {
  champ: "DESCRIPTION" | "DESCRIPTION_NORMALISEE" | "BENEFICIAIRE" | "MONTANT" | "COMPTE" | "SENS";
  operateur: "CONTIENT" | "MOT_ENTIER" | "EGALE" | "COMMENCE_PAR" | "REGEX" | "SUP" | "SUP_EGAL" | "INF" | "INF_EGAL" | "ENTRE" | "DANS";
  valeur: string;
}

interface DefinitionAction {
  type: "CATEGORISER" | "RENOMMER_BENEFICIAIRE" | "ETIQUETER" | "NOTER" | "EXCLURE_BUDGET" | "EXCLURE_RAPPORTS" | "MARQUER_A_REVOIR" | "VENTILER";
  subcategoryId?: string;
  valeur?: string;
}

interface DefinitionRegle {
  libelle: string;
  priorite: number;
  conditions: DefinitionCondition[];
  actions: DefinitionAction[];
}

async function creerRegles(ownerId: string, subcatId: Record<string, string>): Promise<Record<string, string>> {
  const visa = await prisma.account.findFirstOrThrow({ where: { ownerId, nom: "Visa" } });

  const regles: DefinitionRegle[] = [
    {
      libelle: "Épicerie IGA",
      priorite: 10,
      conditions: [{ champ: "DESCRIPTION_NORMALISEE", operateur: "CONTIENT", valeur: "IGA" }],
      actions: [{ type: "CATEGORISER", subcategoryId: subcatId.Épicerie }],
    },
    {
      libelle: "Essence Petro-Canada",
      priorite: 10,
      conditions: [{ champ: "DESCRIPTION_NORMALISEE", operateur: "CONTIENT", valeur: "PETRO-CANADA" }],
      actions: [{ type: "CATEGORISER", subcategoryId: subcatId.Essence }],
    },
    {
      libelle: "Gros restaurant sur Visa",
      priorite: 8,
      conditions: [
        { champ: "DESCRIPTION_NORMALISEE", operateur: "CONTIENT", valeur: "RESTAURANT" },
        { champ: "MONTANT", operateur: "INF", valeur: "-5000" },
        { champ: "COMPTE", operateur: "EGALE", valeur: visa.id },
      ],
      actions: [{ type: "CATEGORISER", subcategoryId: subcatId.Restaurant }],
    },
    // Conflit volontaire : mêmes conditions, même priorité, actions différentes.
    {
      libelle: "Restaurant (conflit A)",
      priorite: 5,
      conditions: [{ champ: "DESCRIPTION_NORMALISEE", operateur: "CONTIENT", valeur: "RESTAURANT" }],
      actions: [{ type: "CATEGORISER", subcategoryId: subcatId.Restaurant }],
    },
    {
      libelle: "Restaurant (conflit B)",
      priorite: 5,
      conditions: [{ champ: "DESCRIPTION_NORMALISEE", operateur: "CONTIENT", valeur: "RESTAURANT" }],
      actions: [{ type: "CATEGORISER", subcategoryId: subcatId.Sorties }],
    },
    {
      libelle: "Streaming Netflix",
      priorite: 10,
      conditions: [{ champ: "DESCRIPTION_NORMALISEE", operateur: "CONTIENT", valeur: "NETFLIX" }],
      actions: [{ type: "CATEGORISER", subcategoryId: subcatId.Streaming }],
    },
    {
      libelle: "Dépôt de paie",
      priorite: 10,
      conditions: [{ champ: "DESCRIPTION_NORMALISEE", operateur: "MOT_ENTIER", valeur: "PAIE" }],
      actions: [{ type: "CATEGORISER", subcategoryId: subcatId.Paie }],
    },
    {
      libelle: "Fusion Amazon",
      priorite: 3,
      conditions: [{ champ: "DESCRIPTION_NORMALISEE", operateur: "CONTIENT", valeur: "AMAZON" }],
      actions: [{ type: "RENOMMER_BENEFICIAIRE", valeur: "Amazon" }, { type: "MARQUER_A_REVOIR" }],
    },
  ];

  const ruleId: Record<string, string> = {};

  for (const regle of regles) {
    const rule = await prisma.rule.create({
      data: { ownerId, libelle: regle.libelle, priorite: regle.priorite },
    });
    ruleId[regle.libelle] = rule.id;

    for (const condition of regle.conditions) {
      await prisma.ruleCondition.create({
        data: { ruleId: rule.id, champ: condition.champ, operateur: condition.operateur, valeur: condition.valeur },
      });
    }

    let ordreAction = 0;
    for (const action of regle.actions) {
      await prisma.ruleAction.create({
        data: {
          ruleId: rule.id,
          type: action.type,
          subcategoryId: action.subcategoryId ?? null,
          valeur: action.valeur ?? null,
          ordre: ordreAction,
        },
      });
      ordreAction += 1;
    }
  }

  return ruleId;
}

async function creerFiltresImport(ownerId: string) {
  const filtres: { motif: string; mode: "CONTIENT" | "MOT_ENTIER" | "REGEX" | "EXACT" }[] = [
    { motif: "SOLDE PRECEDENT", mode: "EXACT" },
    { motif: "SOLDE DE CLOTURE", mode: "EXACT" },
    { motif: "TOTAL DES OPERATIONS", mode: "CONTIENT" },
    { motif: "RELEVE DE COMPTE", mode: "CONTIENT" },
  ];

  for (const filtre of filtres) {
    await prisma.importFilter.create({ data: { ownerId, motif: filtre.motif, mode: filtre.mode } });
  }
}

// ───────────────────────── récurrences confirmées (dont l'hypothèque, ventilée)

interface DefinitionRecurrenceSimple {
  libelle: string;
  descriptionBrute: string;
  cadenceReelle: "MENSUEL" | "AUX_2_SEMAINES";
  dateAncrage: DateCivile;
  montantReferenceCents: number; // signé comme les occurrences : négatif pour une sortie
  toleranceCents: number;
  accountId: string;
  subcategoryId: string;
  payeeId?: string;
  montantPour: (echeance: DateCivile) => number;
  echeancesManquees?: DateCivile[];
  regleConfirmee: boolean;
}

interface OccurrenceGeneree {
  echeance: DateCivile;
  montantCents: number;
  etat: "PREVUE" | "REALISEE" | "MANQUEE";
  transactionId: string | null;
}

interface RecurrenceGeneree {
  libelle: string;
  cadence: "MENSUEL" | "AUX_2_SEMAINES";
  dateAncrage: DateCivile;
  montantReferenceCents: number;
  toleranceCents: number;
  accountId: string;
  subcategoryId: string | null;
  motifRapprochement: string;
  occurrences: OccurrenceGeneree[];
  ventilationTemplate?: { libelle: string; subcategoryId: string; partMille: number }[];
}

function moisNumero(d: DateCivile): number {
  return Number(d.slice(5, 7));
}

function genererRecurrences(
  ownerId: string,
  comptes: Comptes,
  subcatId: Record<string, string>,
  _termesPret: TermePret[],
  transactions: TransactionSeed[],
): RecurrenceGeneree[] {
  const recurrences: RecurrenceGeneree[] = [];

  const definitions: DefinitionRecurrenceSimple[] = [
    {
      libelle: "Hydro-Québec",
      descriptionBrute: "HYDRO-QUEBEC",
      cadenceReelle: "MENSUEL",
      dateAncrage: "2025-03-05",
      montantReferenceCents: -10_500,
      toleranceCents: 2_000,
      accountId: comptes.cheque,
      subcategoryId: subcatId.Électricité ?? "",
      montantPour: (echeance) => {
        const mois = moisNumero(echeance);
        if (mois === 12 || mois <= 2) return -entierAleatoire(11_000, 11_800);
        if (mois >= 6 && mois <= 8) return -entierAleatoire(9_200, 9_800);
        return -entierAleatoire(9_800, 10_800);
      },
      regleConfirmee: true,
    },
    {
      libelle: "Internet",
      descriptionBrute: "VIDEOTRON INTERNET",
      cadenceReelle: "MENSUEL",
      dateAncrage: "2025-03-15",
      montantReferenceCents: -8_499,
      toleranceCents: 500,
      accountId: comptes.cheque,
      subcategoryId: subcatId.Internet ?? "",
      montantPour: () => -8_499,
      regleConfirmee: true,
    },
    {
      libelle: "Streaming",
      descriptionBrute: "NETFLIX.COM",
      cadenceReelle: "MENSUEL",
      dateAncrage: "2025-03-12",
      montantReferenceCents: -1_799,
      toleranceCents: 500,
      accountId: comptes.visa,
      subcategoryId: subcatId.Streaming ?? "",
      montantPour: () => -1_799,
      regleConfirmee: false,
    },
    {
      libelle: "Assurance auto",
      descriptionBrute: "INTACT ASSURANCE AUTO",
      cadenceReelle: "MENSUEL",
      dateAncrage: "2025-03-20",
      montantReferenceCents: -14_200,
      toleranceCents: 500,
      accountId: comptes.cheque,
      subcategoryId: subcatId["Assurance auto"] ?? "",
      montantPour: () => -14_200,
      echeancesManquees: ["2026-06-20"],
      regleConfirmee: true,
    },
    {
      libelle: "Dépôt paie",
      descriptionBrute: "DEPOT PAIE EMPLOYEUR ABC INC",
      cadenceReelle: "AUX_2_SEMAINES",
      dateAncrage: "2025-03-07",
      montantReferenceCents: 240_600,
      toleranceCents: 500,
      accountId: comptes.cheque,
      subcategoryId: subcatId.Paie ?? "",
      montantPour: () => 240_600,
      regleConfirmee: true,
    },
  ];

  for (const definition of definitions) {
    const echeancesRegle = echeances(definition.cadenceReelle, definition.dateAncrage, FIN_OCCURRENCES);
    const occurrences: OccurrenceGeneree[] = [];

    for (const echeance of echeancesRegle) {
      const manquee = definition.echeancesManquees?.includes(echeance) ?? false;

      if (manquee) {
        occurrences.push({ echeance, montantCents: definition.montantPour(echeance), etat: "MANQUEE", transactionId: null });
        continue;
      }
      if (echeance > AUJOURDHUI) {
        // Le tirage est conservé pour ne pas décaler le générateur ; l'échéance à venir est au montant de la règle (docs/lot-m3.md §4.4, §4.8).
        definition.montantPour(echeance);
        occurrences.push({ echeance, montantCents: definition.montantReferenceCents, etat: "PREVUE", transactionId: null });
        continue;
      }

      const montantCents = definition.montantPour(echeance);
      const transaction = construireTransaction({
        ownerId,
        accountId: definition.accountId,
        date: echeance,
        descriptionBrute: definition.descriptionBrute,
        montantCents,
        subcategoryId: definition.subcategoryId,
        source: "COPIER_COLLER",
      });
      transactions.push(transaction);
      occurrences.push({ echeance, montantCents, etat: "REALISEE", transactionId: transaction.id });
    }

    // docs/lot-m3.md §4.8 : Netflix reste à détecter ; ses transactions sont générées à l'identique.
    if (!definition.regleConfirmee) continue;

    recurrences.push({
      libelle: definition.libelle,
      cadence: definition.cadenceReelle,
      dateAncrage: definition.dateAncrage,
      montantReferenceCents: definition.montantReferenceCents,
      toleranceCents: definition.toleranceCents,
      accountId: definition.accountId,
      subcategoryId: definition.subcategoryId,
      motifRapprochement: normaliserDescription(definition.descriptionBrute),
      occurrences,
    });
  }

  // ── L'hypothèque : une récurrence FIXE mensuelle, ventilée capital / intérêts / assurance.
  const premierTerme = TERMES_PRET[0];
  if (!premierTerme) {
    throw new Error("TERMES_PRET doit contenir au moins un terme");
  }
  const echeancesHypotheque = echeances("MENSUEL", premierTerme.dateDebut, FIN_OCCURRENCES);
  const echeancierComplet = calculerEcheancierHypotheque(echeancesHypotheque.map(moisDe));
  const occurrencesHypotheque: OccurrenceGeneree[] = [];

  for (let i = 0; i < echeancesHypotheque.length; i++) {
    const echeance = echeancesHypotheque[i];
    const ligne = echeancierComplet[i];
    if (echeance === undefined || ligne === undefined) continue;

    if (echeance > AUJOURDHUI) {
      occurrencesHypotheque.push({ echeance, montantCents: -ligne.totalCents, etat: "PREVUE", transactionId: null });
      continue;
    }

    const parent = construireTransaction({
      ownerId,
      accountId: comptes.cheque,
      date: echeance,
      descriptionBrute: "VERSEMENT HYPOTHECAIRE",
      montantCents: -ligne.totalCents,
      subcategoryId: null, // un parent ventilé est exclu des agrégats de catégorie
      source: "COPIER_COLLER",
      estVentilee: true,
    });
    transactions.push(parent);

    const capitalId = subcatId["Capital hypothécaire"];
    const interetsId = subcatId["Intérêts hypothécaires"];
    const assuranceId = subcatId["Assurance hypothécaire"];
    if (capitalId === undefined || interetsId === undefined || assuranceId === undefined) {
      throw new Error("sous-catégories de l'hypothèque introuvables");
    }

    transactions.push(
      construireTransaction({
        ownerId,
        accountId: comptes.cheque,
        date: echeance,
        descriptionBrute: "VERSEMENT HYPOTHECAIRE — CAPITAL",
        montantCents: -ligne.capitalCents,
        subcategoryId: capitalId,
        source: "COPIER_COLLER",
        parentId: parent.id,
      }),
    );
    transactions.push(
      construireTransaction({
        ownerId,
        accountId: comptes.cheque,
        date: echeance,
        descriptionBrute: "VERSEMENT HYPOTHECAIRE — INTERETS",
        montantCents: -ligne.interetsCents,
        subcategoryId: interetsId,
        source: "COPIER_COLLER",
        parentId: parent.id,
      }),
    );
    transactions.push(
      construireTransaction({
        ownerId,
        accountId: comptes.cheque,
        date: echeance,
        descriptionBrute: "VERSEMENT HYPOTHECAIRE — ASSURANCE",
        montantCents: -ligne.assuranceCents,
        subcategoryId: assuranceId,
        source: "COPIER_COLLER",
        parentId: parent.id,
      }),
    );

    occurrencesHypotheque.push({ echeance, montantCents: -ligne.totalCents, etat: "REALISEE", transactionId: parent.id });
  }

  const premiereLigne = echeancierComplet[0];
  const partMilleCapital = premiereLigne ? Math.round((premiereLigne.capitalCents / premiereLigne.totalCents) * 1000) : 400;
  const partMilleInterets = premiereLigne ? Math.round((premiereLigne.interetsCents / premiereLigne.totalCents) * 1000) : 550;
  const partMilleAssurance = 1000 - partMilleCapital - partMilleInterets;

  recurrences.push({
    libelle: "Versement hypothécaire",
    cadence: "MENSUEL",
    dateAncrage: premierTerme.dateDebut,
    // le terme en cours au AUJOURDHUI du seed
    montantReferenceCents: -(termePour(moisDe(AUJOURDHUI)).paiementCents + ASSURANCE_PRET_CENTS),
    toleranceCents: 500,
    accountId: comptes.cheque,
    subcategoryId: null,
    motifRapprochement: "VERSEMENT HYPOTHECAIRE",
    occurrences: occurrencesHypotheque,
    ventilationTemplate: [
      { libelle: "Capital", subcategoryId: subcatId["Capital hypothécaire"] ?? "", partMille: partMilleCapital },
      { libelle: "Intérêts", subcategoryId: subcatId["Intérêts hypothécaires"] ?? "", partMille: partMilleInterets },
      { libelle: "Assurance", subcategoryId: subcatId["Assurance hypothécaire"] ?? "", partMille: partMilleAssurance },
    ],
  });

  return recurrences;
}

async function enregistrerRecurrences(ownerId: string, recurrences: RecurrenceGeneree[]) {
  for (const recurrence of recurrences) {
    const regle = await prisma.recurringRule.create({
      data: {
        ownerId,
        libelle: recurrence.libelle,
        nature: "FIXE",
        montantCents: recurrence.montantReferenceCents,
        cadence: recurrence.cadence,
        dateAncrage: versDateTime(recurrence.dateAncrage),
        accountId: recurrence.accountId,
        subcategoryId: recurrence.subcategoryId,
        motifRapprochement: recurrence.motifRapprochement,
        toleranceCents: recurrence.toleranceCents,
      },
    });

    if (recurrence.ventilationTemplate) {
      for (const ligne of recurrence.ventilationTemplate) {
        await prisma.recurringSplit.create({
          data: { ruleId: regle.id, subcategoryId: ligne.subcategoryId, partMille: ligne.partMille, libelle: ligne.libelle },
        });
      }
    }

    await prisma.expectedOccurrence.createMany({
      data: recurrence.occurrences.map((occurrence) => ({
        ruleId: regle.id,
        echeance: versDateTime(occurrence.echeance),
        montantCents: occurrence.montantCents,
        etat: occurrence.etat,
        liaison: occurrence.etat === "REALISEE" ? "RETROACTIVE" : null,
        lieeLe: occurrence.etat === "REALISEE" ? new Date() : null,
        transactionId: occurrence.transactionId,
      })),
    });
  }
}

// ───────────────────────── virements (paires symétriques liées)

/** Construit une paire de transactions symétriques liées, exclue du budget des deux côtés. */
function construireVirement(params: {
  ownerId: string;
  date: DateCivile;
  depuisCompteId: string;
  versCompteId: string;
  montantCents: number; // positif : montant transféré
  libelleDepuis: string;
  libelleVers: string;
  source: "COPIER_COLLER" | "MANUELLE";
}): [TransactionSeed, TransactionSeed] {
  const sortie = construireTransaction({
    ownerId: params.ownerId,
    accountId: params.depuisCompteId,
    date: params.date,
    descriptionBrute: params.libelleDepuis,
    montantCents: -params.montantCents,
    source: params.source,
    transferAccountId: params.versCompteId,
  });
  const entree = construireTransaction({
    ownerId: params.ownerId,
    accountId: params.versCompteId,
    date: params.date,
    descriptionBrute: params.libelleVers,
    montantCents: params.montantCents,
    source: params.source,
    transferAccountId: params.depuisCompteId,
  });
  sortie.transferTransactionId = entree.id;
  entree.transferTransactionId = sortie.id;
  return [sortie, entree];
}

function genererVirements(
  ownerId: string,
  comptes: Comptes,
  transactions: TransactionSeed[],
  contributionEntries: { transactionId: string; accountId: string; anneeImputation: number; montantCents: number }[],
) {
  // Cotisation CELIAPP mensuelle.
  for (const bucket of MOIS_BUCKETS) {
    const jourCotisation = 16;
    if (jourCotisation > bucket.nbJoursDuMois) continue;
    const date = dateCivile(Number(bucket.cle.slice(0, 4)), Number(bucket.cle.slice(5, 7)), jourCotisation);
    if (date > bucket.fin) continue;

    const [depuis, vers] = construireVirement({
      ownerId,
      date,
      depuisCompteId: comptes.cheque,
      versCompteId: comptes.celiapp,
      montantCents: 20_000,
      libelleDepuis: "VIREMENT CELIAPP",
      libelleVers: "COTISATION CELIAPP",
      source: "COPIER_COLLER",
    });
    transactions.push(depuis, vers);
    contributionEntries.push({
      transactionId: vers.id,
      accountId: comptes.celiapp,
      anneeImputation: Number(date.slice(0, 4)),
      montantCents: 20_000,
    });
  }

  // Cotisations REER occasionnelles, dont une en janvier imputée à l'année précédente.
  const cotisationsReer: { date: DateCivile; montantCents: number; anneeImputation: number }[] = [
    { date: "2025-04-10", montantCents: 200_000, anneeImputation: 2025 },
    { date: "2025-11-15", montantCents: 150_000, anneeImputation: 2025 },
    // Faite en janvier, dans les 60 premiers jours : imputée à l'année précédente.
    { date: "2026-01-20", montantCents: 180_000, anneeImputation: 2025 },
    { date: "2026-06-05", montantCents: 220_000, anneeImputation: 2026 },
  ];
  for (const cotisation of cotisationsReer) {
    if (cotisation.date > AUJOURDHUI) continue;
    const [depuis, vers] = construireVirement({
      ownerId,
      date: cotisation.date,
      depuisCompteId: comptes.cheque,
      versCompteId: comptes.reer,
      montantCents: cotisation.montantCents,
      libelleDepuis: "VIREMENT REER",
      libelleVers: "COTISATION REER",
      source: "MANUELLE",
    });
    transactions.push(depuis, vers);
    contributionEntries.push({
      transactionId: vers.id,
      accountId: comptes.reer,
      anneeImputation: cotisation.anneeImputation,
      montantCents: cotisation.montantCents,
    });
  }
}

async function enregistrerContributionEntries(
  entries: { transactionId: string; accountId: string; anneeImputation: number; montantCents: number }[],
) {
  for (const entry of entries) {
    await prisma.contributionEntry.create({ data: entry });
  }
}

/**
 * Le paiement de la Visa — un virement chaque mois, quelques jours après le
 * relevé (le 3), pour environ 90 % des achats du mois : une carte réaliste
 * porte un petit solde reporté, jamais tout à zéro pile.
 */
function genererPaiementsVisa(ownerId: string, comptes: Comptes, transactions: TransactionSeed[]) {
  for (const bucket of MOIS_BUCKETS) {
    const achatsDuMois = transactions
      .filter((t) => t.accountId === comptes.visa && t.date >= bucket.debut && t.date <= bucket.fin)
      .reduce((s, t) => s + t.montantCents, 0);
    if (achatsDuMois >= 0) continue;

    const jourPaiement = Math.min(8, bucket.nbJoursDuMois);
    const date = dateCivile(Number(bucket.cle.slice(0, 4)), Number(bucket.cle.slice(5, 7)), jourPaiement);
    if (date > bucket.fin) continue;

    const montant = Math.round(-achatsDuMois * 0.9);
    if (montant <= 0) continue;

    const [depuis, vers] = construireVirement({
      ownerId,
      date,
      depuisCompteId: comptes.cheque,
      versCompteId: comptes.visa,
      montantCents: montant,
      libelleDepuis: "PAIEMENT VISA DESJARDINS",
      libelleVers: "PAIEMENT RECU - MERCI",
      source: "COPIER_COLLER",
    });
    transactions.push(depuis, vers);
  }
}

// ───────────────────────── dépenses variables (mensuelles)

interface ConfigDepenseVariable {
  sousCategorie: string;
  accountId: (comptes: Comptes) => string;
  moyenneCents: number;
  ecartTypeCents: number;
  minTx: number;
  maxTx: number;
  probabiliteZero?: number;
  moisSeulement?: string[];
  moisException?: Record<string, number>;
  libelles: string[];
  ruleLibelle?: string; // pour appliedRuleId
}

function genererDepensesVariables(
  ownerId: string,
  comptes: Comptes,
  subcatId: Record<string, string>,
  payeeId: Record<string, string>,
  ruleId: Record<string, string>,
  transactions: TransactionSeed[],
) {
  const configs: ConfigDepenseVariable[] = [
    {
      sousCategorie: "Épicerie",
      accountId: (c) => c.visa,
      moyenneCents: 62_000,
      ecartTypeCents: 9_000,
      minTx: 6,
      maxTx: 10,
      moisException: { "2025-12": 118_000 }, // réception des fêtes — la médiane bat la moyenne
      libelles: ["IGA VALBRUME", "METRO LAC-BRUME", "SUPER C", "PROVIGO"],
      ruleLibelle: "Épicerie IGA",
    },
    {
      sousCategorie: "Essence",
      accountId: (c) => c.visa,
      moyenneCents: 18_000,
      ecartTypeCents: 2_000,
      minTx: 5,
      maxTx: 7,
      libelles: ["PETRO-CANADA", "ESSO", "CIRCLE K"],
      ruleLibelle: "Essence Petro-Canada",
    },
    {
      sousCategorie: "Restaurant",
      accountId: (c) => c.visa,
      moyenneCents: 21_000,
      ecartTypeCents: 7_000,
      minTx: 5,
      maxTx: 9,
      // Dépassement réel et volontaire en mars 2026 : le report SIGNE doit le
      // propager au disponible d'avril (docs/lot-m0-revision.md §5, tests de cohérence).
      moisException: { "2026-03": 40_000 },
      libelles: ["RESTAURANT LA BONNE TABLE", "RESTAURANT ST-HUBERT", "PIZZERIA NAPOLI"],
    },
    {
      sousCategorie: "Café",
      accountId: (c) => c.visa,
      moyenneCents: 4_000,
      ecartTypeCents: 1_500,
      minTx: 4,
      maxTx: 7,
      libelles: ["CAFE DEPOT", "TIM HORTONS"],
    },
    {
      sousCategorie: "Sorties",
      accountId: (c) => c.visa,
      moyenneCents: 10_000,
      ecartTypeCents: 6_000,
      minTx: 2,
      maxTx: 4,
      probabiliteZero: 0.15,
      libelles: ["BILLETTERIE EVENKO", "BAR LE RENDEZ-VOUS"],
    },
    {
      sousCategorie: "Cinéma",
      accountId: (c) => c.visa,
      moyenneCents: 2_500,
      ecartTypeCents: 800,
      minTx: 1,
      maxTx: 2,
      probabiliteZero: 0.35,
      libelles: ["CINEMA CINEPLEX"],
    },
    {
      sousCategorie: "Sport",
      accountId: (c) => c.visa,
      moyenneCents: 4_500,
      ecartTypeCents: 500,
      minTx: 1,
      maxTx: 1,
      moisSeulement: ["2026-08", "2026-09"], // sous-catégorie « née » il y a deux mois
      libelles: ["ENERGIE CARDIO"],
    },
    {
      sousCategorie: "Logiciels",
      accountId: (c) => c.visa,
      moyenneCents: 1_099,
      ecartTypeCents: 0,
      minTx: 1,
      maxTx: 1,
      libelles: ["MICROSOFT 365"],
    },
    {
      sousCategorie: "Stationnement",
      accountId: (c) => c.visa,
      moyenneCents: 1_500,
      ecartTypeCents: 500,
      minTx: 1,
      maxTx: 2,
      probabiliteZero: 0.4,
      libelles: ["STATIONNEMENT INDIGO"],
    },
  ];

  for (const bucket of MOIS_BUCKETS) {
    for (const config of configs) {
      if (config.moisSeulement && !config.moisSeulement.includes(bucket.cle)) {
        continue;
      }
      if (config.probabiliteZero !== undefined && alea() < config.probabiliteZero) {
        continue;
      }

      const totalMoisComplet = config.moisException?.[bucket.cle] ?? gaussienneCents(config.moyenneCents, config.ecartTypeCents);
      const proportion = bucket.partiel ? (ecartJours(bucket.debut, bucket.fin) + 1) / bucket.nbJoursDuMois : 1;
      const total = Math.round(totalMoisComplet * proportion);
      if (total <= 0) {
        continue;
      }

      const n = Math.max(1, Math.round(entierAleatoire(config.minTx, config.maxTx) * proportion));
      const montants = repartir(total, n);
      const subcategoryId = subcatId[config.sousCategorie];
      if (subcategoryId === undefined) {
        throw new Error(`dépense variable : sous-catégorie inconnue "${config.sousCategorie}"`);
      }
      const appliedRuleId = config.ruleLibelle ? (ruleId[config.ruleLibelle] ?? null) : null;

      for (const montant of montants) {
        const libelle = choix(config.libelles);
        transactions.push(
          construireTransaction({
            ownerId,
            accountId: config.accountId(comptes),
            date: dateAleatoireDans(bucket.debut, bucket.fin),
            descriptionBrute: libelle,
            montantCents: -montant,
            subcategoryId,
            payeeId: payeeId[libelle] ?? null,
            appliedRuleId,
            source: "COPIER_COLLER",
          }),
        );
      }
    }
  }
}

// ───────────────────────── mouvements divers (rares, ponctuels)

function genererMouvementsDivers(
  ownerId: string,
  comptes: Comptes,
  subcatId: Record<string, string>,
  payeeId: Record<string, string>,
  transactions: TransactionSeed[],
) {
  // Santé : historique volontairement insuffisant (2-3 occurrences en 18 mois).
  const evenementsSante: { mois: string; sousCategorie: string; libelle: string; montantCents: number }[] = [
    { mois: "2025-06", sousCategorie: "Pharmacie", libelle: "PHARMACIE JEAN COUTU", montantCents: 3_200 },
    { mois: "2025-11", sousCategorie: "Soins dentaires", libelle: "CLINIQUE DENTAIRE LAC-BRUME", montantCents: 18_500 },
    { mois: "2026-05", sousCategorie: "Pharmacie", libelle: "PHARMACIE JEAN COUTU", montantCents: 4_800 },
  ];
  for (const evenement of evenementsSante) {
    if (!MOIS_HISTORIQUE.includes(evenement.mois)) continue;
    const bucket = bucketDuMois(evenement.mois);
    const subcategoryId = subcatId[evenement.sousCategorie];
    if (subcategoryId === undefined) continue;
    transactions.push(
      construireTransaction({
        ownerId,
        accountId: comptes.cheque,
        date: dateAleatoireDans(bucket.debut, bucket.fin),
        descriptionBrute: evenement.libelle,
        montantCents: -evenement.montantCents,
        subcategoryId,
        payeeId: payeeId[evenement.libelle] ?? null,
        source: "COPIER_COLLER",
      }),
    );
  }

  // Assurance habitation : prime annuelle.
  for (const mois of ["2025-04", "2026-04"]) {
    if (!MOIS_HISTORIQUE.includes(mois)) continue;
    const bucket = bucketDuMois(mois);
    const subcategoryId = subcatId["Assurance habitation"];
    if (subcategoryId === undefined) continue;
    transactions.push(
      construireTransaction({
        ownerId,
        accountId: comptes.cheque,
        date: dateAleatoireDans(bucket.debut, bucket.fin),
        descriptionBrute: "BELAIR ASSURANCE",
        montantCents: -entierAleatoire(41_000, 46_000),
        subcategoryId,
        payeeId: payeeId["BELAIR ASSURANCE"] ?? null,
        source: "COPIER_COLLER",
      }),
    );
  }

  // Immatriculation : cible ACCUMULER annuelle, échéance mi-mars.
  if (MOIS_HISTORIQUE.includes("2026-03")) {
    const subcategoryId = subcatId.Immatriculation;
    if (subcategoryId !== undefined) {
      transactions.push(
        construireTransaction({
          ownerId,
          accountId: comptes.cheque,
          date: "2026-03-15",
          descriptionBrute: "SAAQ IMMATRICULATION",
          montantCents: -34_000,
          subcategoryId,
          payeeId: payeeId["SOCIÉTÉ DE L'ASSURANCE AUTOMOBILE DU QUÉBEC"] ?? null,
          source: "COPIER_COLLER",
        }),
      );
    }
  }

  // Entretien véhicule : quelques factures ponctuelles, avec l'étiquette « Auto ».
  for (const mois of ["2025-05", "2025-10", "2026-03", "2026-07"]) {
    if (!MOIS_HISTORIQUE.includes(mois)) continue;
    const bucket = bucketDuMois(mois);
    const subcategoryId = subcatId.Entretien;
    if (subcategoryId === undefined) continue;
    transactions.push(
      construireTransaction({
        ownerId,
        accountId: comptes.visa,
        date: dateAleatoireDans(bucket.debut, bucket.fin),
        descriptionBrute: "GARAGE MARIO MECANIQUE",
        montantCents: -entierAleatoire(8_000, 35_000),
        subcategoryId,
        payeeId: payeeId["GARAGE MARIO MECANIQUE"] ?? null,
        source: "COPIER_COLLER",
      }),
    );
  }

  // Vacances : occasionnel, gros montant.
  for (const mois of ["2025-07", "2026-07"]) {
    if (!MOIS_HISTORIQUE.includes(mois)) continue;
    const bucket = bucketDuMois(mois);
    const subcategoryId = subcatId.Vacances;
    if (subcategoryId === undefined) continue;
    transactions.push(
      construireTransaction({
        ownerId,
        accountId: comptes.visa,
        date: dateAleatoireDans(bucket.debut, bucket.fin),
        descriptionBrute: "AIR CANADA VACANCES",
        montantCents: -entierAleatoire(60_000, 150_000),
        subcategoryId,
        payeeId: payeeId["AIR CANADA VACANCES"] ?? null,
        source: "COPIER_COLLER",
      }),
    );
  }

  // Autres revenus : quelques entrées ponctuelles.
  const autresRevenus = [
    { mois: "2025-05", libelle: "REMBOURSEMENT ASSURANCE", montantCents: 8_500 },
    { mois: "2025-12", libelle: "CADEAU DE FIN D'ANNEE", montantCents: 15_000 },
    { mois: "2026-04", libelle: "REMBOURSEMENT IMPOT PROVINCIAL", montantCents: 34_000 },
  ];
  for (const revenu of autresRevenus) {
    if (!MOIS_HISTORIQUE.includes(revenu.mois)) continue;
    const bucket = bucketDuMois(revenu.mois);
    const subcategoryId = subcatId["Autres revenus"];
    if (subcategoryId === undefined) continue;
    transactions.push(
      construireTransaction({
        ownerId,
        accountId: comptes.cheque,
        date: dateAleatoireDans(bucket.debut, bucket.fin),
        descriptionBrute: revenu.libelle,
        montantCents: revenu.montantCents,
        subcategoryId,
        source: "MANUELLE",
      }),
    );
  }

  // Marge : quelques tirages, usage marginal, non catégorisés.
  for (const mois of ["2025-09", "2026-02"]) {
    if (!MOIS_HISTORIQUE.includes(mois)) continue;
    const bucket = bucketDuMois(mois);
    transactions.push(
      construireTransaction({
        ownerId,
        accountId: comptes.marge,
        date: dateAleatoireDans(bucket.debut, bucket.fin),
        descriptionBrute: "AVANCE MARGE DE CREDIT",
        montantCents: -entierAleatoire(20_000, 50_000),
        source: "MANUELLE",
      }),
    );
  }
}

/** Trois graphies du même marchand — éprouve la fusion de bénéficiaires. */
function genererAmazon(ownerId: string, comptes: Comptes, payeeId: Record<string, string>, transactions: TransactionSeed[]) {
  const graphies = ["AMAZON.CA", "AMZN MKTP CA", "AMAZON.COM"];
  const mois = ["2025-05", "2025-09", "2026-01", "2026-04", "2026-06", "2026-08"];

  for (let i = 0; i < mois.length; i++) {
    const cleMois = mois[i];
    if (cleMois === undefined || !MOIS_HISTORIQUE.includes(cleMois)) continue;
    const bucket = bucketDuMois(cleMois);
    const graphie = graphies[i % graphies.length];
    if (graphie === undefined) continue;

    transactions.push(
      construireTransaction({
        ownerId,
        accountId: comptes.visa,
        date: dateAleatoireDans(bucket.debut, bucket.fin),
        descriptionBrute: graphie,
        montantCents: -entierAleatoire(1_500, 9_000),
        subcategoryId: null, // en attente de catégorisation
        payeeId: payeeId[graphie] ?? null,
        source: "COPIER_COLLER",
        aRevoir: true,
      }),
    );
  }
}

/** Étiquette « Auto » (avec cible mensuelle) sur les dépenses liées au véhicule. */
async function etiqueterTransport(tagId: string, transactions: TransactionSeed[]) {
  const motsAuto = ["PETRO-CANADA", "ESSO", "CIRCLE K", "INTACT ASSURANCE AUTO", "GARAGE MARIO MECANIQUE", "STATIONNEMENT INDIGO"];
  const concernees = transactions.filter((t) => motsAuto.some((mot) => t.description.includes(mot)));

  for (const transaction of concernees) {
    await prisma.transactionTag.create({ data: { transactionId: transaction.id, tagId } });
  }
}

// ───────────────────────── allocations budgétaires (12 des 18 mois)

const ALLOCATION_PAR_DEFAUT: Record<string, number> = {
  Épicerie: 62_000,
  Essence: 18_000,
  Restaurant: 21_000,
  Café: 4_000,
  Sorties: 10_000,
  Cinéma: 2_500,
  Logiciels: 1_099,
  Stationnement: 1_500,
  Électricité: 10_500,
  Internet: 8_499,
  Streaming: 1_799,
  "Assurance auto": 14_200,
  Entretien: 5_000, // 15 000 $/trimestre ÷ 3
  Immatriculation: 2_834, // 34 000 $/an ÷ 12, arrondi au cent supérieur
};

async function creerBudgetAllocations(ownerId: string, subcatId: Record<string, string>) {
  const echeancierComplet = calculerEcheancierHypotheque(MOIS_HISTORIQUE);
  const echeancierParMois = new Map(echeancierComplet.map((ligne) => [ligne.mois, ligne]));

  for (const mois of MOIS_BUDGET) {
    for (const [nomSousCategorie, montantCents] of Object.entries(ALLOCATION_PAR_DEFAUT)) {
      const subcategoryId = subcatId[nomSousCategorie];
      if (subcategoryId === undefined) continue;
      await prisma.budgetAllocation.create({
        data: { ownerId, subcategoryId, mois, montantAssigneCents: montantCents },
      });
    }

    if (MOIS_BUCKETS.find((b) => b.cle === mois)?.cle === "2026-08" || mois === "2026-09") {
      const sportId = subcatId.Sport;
      if (sportId !== undefined) {
        await prisma.budgetAllocation.create({ data: { ownerId, subcategoryId: sportId, mois, montantAssigneCents: 4_500 } });
      }
    }

    const ligneHypotheque = echeancierParMois.get(mois);
    if (ligneHypotheque) {
      const capitalId = subcatId["Capital hypothécaire"];
      const interetsId = subcatId["Intérêts hypothécaires"];
      const assuranceId = subcatId["Assurance hypothécaire"];
      if (capitalId !== undefined) {
        await prisma.budgetAllocation.create({
          data: { ownerId, subcategoryId: capitalId, mois, montantAssigneCents: ligneHypotheque.capitalCents },
        });
      }
      if (interetsId !== undefined) {
        await prisma.budgetAllocation.create({
          data: { ownerId, subcategoryId: interetsId, mois, montantAssigneCents: ligneHypotheque.interetsCents },
        });
      }
      if (assuranceId !== undefined) {
        await prisma.budgetAllocation.create({
          data: { ownerId, subcategoryId: assuranceId, mois, montantAssigneCents: ligneHypotheque.assuranceCents },
        });
      }
    }
  }
}

// ───────────────────────── mouvements entre enveloppes

async function creerMouvementsEnveloppes(ownerId: string, subcatId: Record<string, string>) {
  const moisMouvement = MOIS_BUDGET[MOIS_BUDGET.length - 2] ?? MOIS_BUDGET[0];
  if (moisMouvement === undefined) return;

  const groupeRemplissage = nouvelIdentifiant();

  // Un remplissage automatique groupé : deux mouvements depuis le reste à
  // assigner (deId = null) vers deux enveloppes, dans la même action —
  // annulables ensemble grâce au groupeId partagé.
  const sportId = subcatId.Sport;
  const cinemaId = subcatId.Cinéma;
  if (sportId !== undefined) {
    await prisma.moneyMovement.create({
      data: { ownerId, mois: moisMouvement, deId: null, versId: sportId, montantCents: 2_000, note: "Remplissage automatique", groupeId: groupeRemplissage },
    });
  }
  if (cinemaId !== undefined) {
    await prisma.moneyMovement.create({
      data: { ownerId, mois: moisMouvement, deId: null, versId: cinemaId, montantCents: 1_000, note: "Remplissage automatique", groupeId: groupeRemplissage },
    });
  }

  // Correction volontaire d'un dépassement : « j'ai dépassé à l'épicerie, je
  // prends dans Sorties » — un vrai mouvement dans le budget, aucun compte ne bouge.
  const epicerieId = subcatId.Épicerie;
  const sortiesId = subcatId.Sorties;
  if (epicerieId !== undefined && sortiesId !== undefined) {
    await prisma.moneyMovement.create({
      data: { ownerId, mois: moisMouvement, deId: sortiesId, versId: epicerieId, montantCents: 5_000, note: "Correction d'un dépassement à l'épicerie" },
    });
  }

  // Un mouvement annulé, pour éprouver l'historique.
  const cafeId = subcatId.Café;
  if (cafeId !== undefined && sortiesId !== undefined) {
    await prisma.moneyMovement.create({
      data: {
        ownerId,
        mois: moisMouvement,
        deId: sortiesId,
        versId: cafeId,
        montantCents: 1_500,
        note: "Essai, annulé",
        annuleLe: new Date(),
      },
    });
  }
}

// ───────────────────────── objectifs

async function creerObjectifs(ownerId: string, comptes: Comptes) {
  const miseDeFonds = await prisma.goal.create({
    data: {
      ownerId,
      nom: "Mise de fonds",
      type: "EPARGNE",
      montantCibleCents: 5_000_000,
      dateCible: versDateTime("2028-06-01"),
      contributionMensuelleCents: 20_000,
      tauxCroissanceAnnuel: 0.04,
      acquisInitialCents: 800_000,
      dateDebut: versDateTime(DEBUT_HISTORIQUE),
      ordre: 0,
    },
  });
  await prisma.goalAccount.create({ data: { goalId: miseDeFonds.id, accountId: comptes.celiapp, mode: "TOTAL" } });

  const remboursementMarge = await prisma.goal.create({
    data: {
      ownerId,
      nom: "Remboursement de la marge",
      type: "REMBOURSEMENT",
      montantCibleCents: 50_000,
      contributionMensuelleCents: 10_000,
      depenseReduitProgression: true,
      acquisInitialCents: 0,
      dateDebut: versDateTime(DEBUT_HISTORIQUE),
      ordre: 1,
    },
  });
  await prisma.goalAccount.create({ data: { goalId: remboursementMarge.id, accountId: comptes.marge, mode: "TOTAL" } });
}

// ───────────────────────── plan de remboursement de dette

async function creerPlanDette(ownerId: string, comptes: Comptes) {
  const plan = await prisma.debtPlan.create({
    data: { ownerId, nom: "Éliminer les dettes à taux élevé", mensualiteTotaleCents: 60_000, strategie: "AVALANCHE" },
  });
  await prisma.debtPlanItem.create({ data: { planId: plan.id, accountId: comptes.visa, ordre: 0 } });
  await prisma.debtPlanItem.create({ data: { planId: plan.id, accountId: comptes.marge, ordre: 1 } });
}

// ───────────────────────── scénario « what if »

async function creerScenario(ownerId: string, comptes: Comptes, subcatId: Record<string, string>) {
  const scenario = await prisma.scenario.create({
    data: { ownerId, nom: "Et si je change d'emploi ?", note: "Revenu en hausse, nouvel abonnement gym" },
  });

  await prisma.scenarioSurcharge.create({
    data: {
      scenarioId: scenario.id,
      type: "REVENU",
      cibleId: comptes.cheque,
      payload: { montantCents: 36_000, dateDebut: "2026-10-01" },
      ordre: 0,
    },
  });

  const sportId = subcatId.Sport;
  await prisma.scenarioSurcharge.create({
    data: {
      scenarioId: scenario.id,
      type: "DEPENSE_RECURRENTE",
      cibleId: sportId ?? null,
      payload: { montantCents: -4_500, cadence: "MENSUEL", dateDebut: "2026-10-01" },
      ordre: 1,
    },
  });
}

// ───────────────────────── relevés de solde et réconciliation

function soldeCalcule(soldeInitialCents: number, transactions: TransactionSeed[], accountId: string, date: DateCivile): number {
  // lignes filles exclues : le parent porte le montant (docs/lot-m3.md §3.7)
  return (
    soldeInitialCents +
    transactions
      .filter((t) => t.accountId === accountId && t.parentId === null && t.date <= date)
      .reduce((s, t) => s + t.montantCents, 0)
  );
}

async function creerRelevesSolde(comptes: Comptes, transactions: TransactionSeed[]) {
  const comptesInfo = await prisma.account.findMany({ where: { id: { in: Object.values(comptes) } } });
  const ancragesJour: Record<string, number> = {
    [comptes.cheque]: 5,
    [comptes.epargne]: 9,
    [comptes.visa]: 13,
    [comptes.marge]: 17,
    [comptes.celiapp]: 21,
    [comptes.reer]: 24,
    [comptes.maison]: 27,
    [comptes.hypotheque]: 27,
  };

  for (const compte of comptesInfo) {
    const jourAncrage = ancragesJour[compte.id] ?? 5;
    const ancrage = dateCivile(2025, 3, jourAncrage);
    const dates = echeances("AUX_2_MOIS", ancrage, AUJOURDHUI);

    let dernierReleveId: string | null = null;
    let dernierEcartVoulu = 0;

    for (let i = 0; i < dates.length; i++) {
      const date = dates[i];
      if (date === undefined) continue;

      const calcule = soldeCalcule(compte.soldeInitialCents, transactions, compte.id, date);
      const estDernier = i === dates.length - 1;
      const ecartVoulu = estDernier && compte.nom === "Épargne" ? 5_000 : 0;

      const releve = await prisma.balanceStatement.create({
        data: {
          accountId: compte.id,
          date: versDateTime(date),
          soldeCents: calcule + ecartVoulu,
          source: "RELEVE",
        },
      });

      if (estDernier) {
        dernierReleveId = releve.id;
        dernierEcartVoulu = ecartVoulu;
      }
    }

    if (dernierReleveId && dernierEcartVoulu !== 0) {
      await prisma.reconciliation.create({
        data: { accountId: compte.id, statementId: dernierReleveId, ecartCents: dernierEcartVoulu },
      });
    }
  }
}

// ───────────────────────── événements planifiés

async function creerEvenementsPlanifies(ownerId: string, comptes: Comptes, subcatId: Record<string, string>) {
  await prisma.plannedEvent.create({
    data: {
      ownerId,
      libelle: "Renouvellement assurance habitation",
      date: versDateTime("2026-10-15"),
      montantCents: -44_000,
      accountId: comptes.cheque,
      subcategoryId: subcatId["Assurance habitation"] ?? null,
    },
  });
  await prisma.plannedEvent.create({
    data: {
      ownerId,
      libelle: "Acompte voyage",
      date: versDateTime("2026-11-01"),
      montantCents: -80_000,
      accountId: comptes.visa,
      subcategoryId: subcatId.Vacances ?? null,
    },
  });
  await prisma.plannedEvent.create({
    data: {
      ownerId,
      libelle: "Événement importé de l'agenda",
      date: versDateTime("2026-10-22"),
      montantCents: -5_000,
      aCompleter: true,
    },
  });
}

main()
  .catch((erreur: unknown) => {
    console.error(erreur);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
