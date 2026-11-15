-- CreateEnum
CREATE TYPE "TypeCompte" AS ENUM ('CHEQUE', 'EPARGNE', 'CREDIT', 'MARGE', 'PRET', 'PLACEMENT', 'ACTIF', 'PASSIF', 'AUTRE');

-- CreateEnum
CREATE TYPE "RegimeFiscal" AS ENUM ('NON_ENREGISTRE', 'REER', 'CELI', 'CELIAPP', 'REEE', 'CRI', 'FERR');

-- CreateEnum
CREATE TYPE "ModeCorrespondance" AS ENUM ('CONTIENT', 'MOT_ENTIER', 'REGEX', 'EXACT');

-- CreateEnum
CREATE TYPE "SourceIngestion" AS ENUM ('COPIER_COLLER', 'FICHIER', 'AGREGATEUR', 'MANUELLE', 'AJUSTEMENT');

-- CreateEnum
CREATE TYPE "EtatTransaction" AS ENUM ('EN_ATTENTE', 'COMPTABILISEE');

-- CreateEnum
CREATE TYPE "EtatRapprochement" AS ENUM ('NON_RAPPROCHEE', 'RAPPROCHEE', 'RECONCILIEE');

-- CreateEnum
CREATE TYPE "NatureRecurrence" AS ENUM ('FIXE', 'VARIABLE');

-- CreateEnum
CREATE TYPE "EtatOccurrence" AS ENUM ('PREVUE', 'REALISEE', 'REALISEE_MONTANT_DIFFERENT', 'MANQUEE', 'IGNOREE');

-- CreateEnum
CREATE TYPE "TypeLiaison" AS ENUM ('AUTO', 'MANUELLE', 'RETROACTIVE');

-- CreateEnum
CREATE TYPE "Estimateur" AS ENUM ('MEDIANE_6', 'MOYENNE_3', 'MOYENNE_6', 'MOYENNE_TRONQUEE', 'MONTANT_FIXE', 'BUDGET');

-- CreateEnum
CREATE TYPE "SourceSolde" AS ENUM ('MANUEL', 'RELEVE', 'AGREGATEUR');

-- CreateEnum
CREATE TYPE "SensFlux" AS ENUM ('SORTANT', 'ENTRANT');

-- CreateEnum
CREATE TYPE "Arrondi" AS ENUM ('CENTS', 'DOLLARS');

-- CreateEnum
CREATE TYPE "EtatSuggestion" AS ENUM ('EN_ATTENTE', 'ACCEPTEE', 'REFUSEE');

-- CreateEnum
CREATE TYPE "Cadence" AS ENUM ('HEBDO', 'AUX_2_SEMAINES', 'AUX_4_SEMAINES', 'DEUX_FOIS_PAR_MOIS', 'MENSUEL', 'AUX_2_MOIS', 'AUX_3_MOIS', 'AUX_4_MOIS', 'SEMESTRIEL', 'ANNUEL', 'AUX_2_ANS', 'PONCTUEL');

-- CreateEnum
CREATE TYPE "ModeBudget" AS ENUM ('PAR_SOUS_CATEGORIE', 'PAR_CATEGORIE');

-- CreateEnum
CREATE TYPE "ModeReport" AS ENUM ('AUCUN', 'SIGNE', 'POSITIF_SEULEMENT');

-- CreateEnum
CREATE TYPE "ModeCible" AS ENUM ('RECOMPLETER', 'ACCUMULER');

-- CreateEnum
CREATE TYPE "ChampCondition" AS ENUM ('DESCRIPTION', 'DESCRIPTION_NORMALISEE', 'BENEFICIAIRE', 'MONTANT', 'COMPTE', 'SENS');

-- CreateEnum
CREATE TYPE "OperateurCondition" AS ENUM ('CONTIENT', 'EGALE', 'COMMENCE_PAR', 'REGEX', 'SUP', 'SUP_EGAL', 'INF', 'INF_EGAL', 'ENTRE', 'DANS');

-- CreateEnum
CREATE TYPE "TypeAction" AS ENUM ('RENOMMER_BENEFICIAIRE', 'CATEGORISER', 'ETIQUETER', 'NOTER', 'EXCLURE_BUDGET', 'EXCLURE_RAPPORTS', 'MARQUER_A_REVOIR', 'VENTILER');

-- CreateEnum
CREATE TYPE "TypeObjectif" AS ENUM ('EPARGNE', 'REMBOURSEMENT');

-- CreateEnum
CREATE TYPE "ModeAllocationObjectif" AS ENUM ('TOTAL', 'PARTIEL');

-- CreateEnum
CREATE TYPE "StrategieDette" AS ENUM ('AVALANCHE', 'BOULE_DE_NEIGE', 'PERSONNALISEE');

-- CreateEnum
CREATE TYPE "TypeSurcharge" AS ENUM ('REVENU', 'DEPENSE_RECURRENTE', 'EVENEMENT', 'TAUX_RENDEMENT', 'SOLDE_INITIAL', 'PAIEMENT_DETTE', 'CIBLE_ENVELOPPE');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "nom" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Preference" (
    "ownerId" TEXT NOT NULL,
    "arrondi" "Arrondi" NOT NULL DEFAULT 'CENTS',
    "locale" TEXT NOT NULL DEFAULT 'fr-CA',
    "theme" TEXT NOT NULL DEFAULT 'system',

    CONSTRAINT "Preference_pkey" PRIMARY KEY ("ownerId")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "type" "TypeCompte" NOT NULL DEFAULT 'CHEQUE',
    "institution" TEXT,
    "estBudgetaire" BOOLEAN NOT NULL DEFAULT true,
    "soldeInitialCents" INTEGER NOT NULL DEFAULT 0,
    "dateSoldeInitial" DATE NOT NULL,
    "seuilSecuriteCents" INTEGER,
    "inclureDansPrevision" BOOLEAN NOT NULL DEFAULT true,
    "inclureDansValeurNette" BOOLEAN NOT NULL DEFAULT true,
    "limiteCreditCents" INTEGER,
    "tauxAnnuel" DOUBLE PRECISION,
    "jourReleve" INTEGER,
    "jourEcheance" INTEGER,
    "perdDelaiDeGrace" BOOLEAN NOT NULL DEFAULT true,
    "regimeFiscal" "RegimeFiscal" NOT NULL DEFAULT 'NON_ENREGISTRE',
    "tauxRendementAnnuel" DOUBLE PRECISION,
    "compteLieId" TEXT,
    "archive" BOOLEAN NOT NULL DEFAULT false,
    "ordre" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoanTerm" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "moisEffectif" TEXT NOT NULL,
    "capitalInitialCents" INTEGER,
    "tauxAnnuel" DOUBLE PRECISION NOT NULL,
    "compositionParAn" INTEGER NOT NULL DEFAULT 2,
    "paiementsParAn" INTEGER NOT NULL DEFAULT 12,
    "paiementCents" INTEGER NOT NULL,
    "nbPaiements" INTEGER,
    "dateDebut" DATE,

    CONSTRAINT "LoanTerm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContributionEntry" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "anneeImputation" INTEGER NOT NULL,
    "montantCents" INTEGER NOT NULL,

    CONSTRAINT "ContributionEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContributionRoom" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "annee" INTEGER NOT NULL,
    "plafondCents" INTEGER NOT NULL,
    "reportCents" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ContributionRoom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetAllocation" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "classe" TEXT NOT NULL,
    "partMille" INTEGER NOT NULL,

    CONSTRAINT "AssetAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "ordre" INTEGER NOT NULL DEFAULT 0,
    "couleur" TEXT,
    "icone" TEXT,
    "masquee" BOOLEAN NOT NULL DEFAULT false,
    "modeBudget" "ModeBudget" NOT NULL DEFAULT 'PAR_SOUS_CATEGORIE',

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subcategory" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "ordre" INTEGER NOT NULL DEFAULT 0,
    "masquee" BOOLEAN NOT NULL DEFAULT false,
    "systeme" BOOLEAN NOT NULL DEFAULT false,
    "reportActif" BOOLEAN NOT NULL DEFAULT true,
    "reportMode" "ModeReport" NOT NULL DEFAULT 'SIGNE',

    CONSTRAINT "Subcategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payee" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "nomNormalise" TEXT NOT NULL,
    "categorieParDefautId" TEXT,
    "autoCategorisation" BOOLEAN NOT NULL DEFAULT true,
    "categorieVerrouillee" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Payee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tag" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "couleur" TEXT,
    "cibleMensuelleCents" INTEGER,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rule" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "libelle" TEXT NOT NULL,
    "priorite" INTEGER NOT NULL DEFAULT 0,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Rule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RuleCondition" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "champ" "ChampCondition" NOT NULL,
    "operateur" "OperateurCondition" NOT NULL,
    "valeur" TEXT NOT NULL,
    "valeurFin" TEXT,

    CONSTRAINT "RuleCondition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RuleAction" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "type" "TypeAction" NOT NULL,
    "subcategoryId" TEXT,
    "valeur" TEXT,
    "ordre" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "RuleAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportFilter" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "motif" TEXT NOT NULL,
    "mode" "ModeCorrespondance" NOT NULL DEFAULT 'EXACT',

    CONSTRAINT "ImportFilter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportBatch" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "source" "SourceIngestion" NOT NULL,
    "libelle" TEXT,
    "importeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "nbLignes" INTEGER NOT NULL,
    "couvreDu" DATE,
    "couvreAu" DATE,

    CONSTRAINT "ImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "description" TEXT NOT NULL,
    "descriptionNormalisee" TEXT NOT NULL,
    "details" TEXT,
    "montantCents" INTEGER NOT NULL,
    "payeeId" TEXT,
    "subcategoryId" TEXT,
    "parentId" TEXT,
    "estVentilee" BOOLEAN NOT NULL DEFAULT false,
    "transferAccountId" TEXT,
    "transferTransactionId" TEXT,
    "source" "SourceIngestion" NOT NULL,
    "etat" "EtatTransaction" NOT NULL DEFAULT 'COMPTABILISEE',
    "rapprochement" "EtatRapprochement" NOT NULL DEFAULT 'NON_RAPPROCHEE',
    "aRevoir" BOOLEAN NOT NULL DEFAULT false,
    "exclureDuBudget" BOOLEAN NOT NULL DEFAULT false,
    "exclureDesRapports" BOOLEAN NOT NULL DEFAULT false,
    "externalId" TEXT,
    "empreinte" TEXT NOT NULL,
    "importBatchId" TEXT,
    "appliedRuleId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransactionTag" (
    "transactionId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,

    CONSTRAINT "TransactionTag_pkey" PRIMARY KEY ("transactionId","tagId")
);

-- CreateTable
CREATE TABLE "BudgetAllocation" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "categoryId" TEXT,
    "subcategoryId" TEXT,
    "mois" TEXT NOT NULL,
    "montantAssigneCents" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "BudgetAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Target" (
    "subcategoryId" TEXT NOT NULL,
    "montantCents" INTEGER NOT NULL,
    "cadence" "Cadence" NOT NULL DEFAULT 'MENSUEL',
    "jourEcheance" INTEGER,
    "mode" "ModeCible" NOT NULL DEFAULT 'RECOMPLETER',
    "dateDebut" DATE NOT NULL,
    "dateCible" DATE,
    "enVeilleJusquau" TEXT,

    CONSTRAINT "Target_pkey" PRIMARY KEY ("subcategoryId")
);

-- CreateTable
CREATE TABLE "MoneyMovement" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "mois" TEXT NOT NULL,
    "deId" TEXT,
    "versId" TEXT,
    "montantCents" INTEGER NOT NULL,
    "note" TEXT,
    "groupeId" TEXT,
    "effectueLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "annuleLe" TIMESTAMP(3),

    CONSTRAINT "MoneyMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecurringRule" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "libelle" TEXT NOT NULL,
    "nature" "NatureRecurrence" NOT NULL,
    "montantCents" INTEGER,
    "cadence" "Cadence" NOT NULL,
    "dateAncrage" DATE NOT NULL,
    "dateFin" DATE,
    "accountId" TEXT NOT NULL,
    "subcategoryId" TEXT,
    "motifRapprochement" TEXT,
    "toleranceCents" INTEGER NOT NULL DEFAULT 500,
    "toleranceJours" INTEGER NOT NULL DEFAULT 4,
    "scoreConfiance" DOUBLE PRECISION,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecurringRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecurringSplit" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "subcategoryId" TEXT,
    "montantCents" INTEGER,
    "partMille" INTEGER,
    "libelle" TEXT,

    CONSTRAINT "RecurringSplit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpectedOccurrence" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "echeance" DATE NOT NULL,
    "montantCents" INTEGER NOT NULL,
    "etat" "EtatOccurrence" NOT NULL DEFAULT 'PREVUE',
    "liaison" "TypeLiaison",
    "lieeLe" TIMESTAMP(3),
    "transactionId" TEXT,

    CONSTRAINT "ExpectedOccurrence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecurrenceSuggestion" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "motif" TEXT NOT NULL,
    "cadence" "Cadence" NOT NULL,
    "montantMedianCents" INTEGER NOT NULL,
    "nbOccurrences" INTEGER NOT NULL,
    "regularite" DOUBLE PRECISION NOT NULL,
    "stabilite" DOUBLE PRECISION NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "transactionIds" TEXT[],
    "etat" "EtatSuggestion" NOT NULL DEFAULT 'EN_ATTENTE',
    "detecteeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecurrenceSuggestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlannedEvent" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "libelle" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "montantCents" INTEGER NOT NULL,
    "accountId" TEXT,
    "subcategoryId" TEXT,
    "feedId" TEXT,
    "externalUid" TEXT,
    "aCompleter" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "PlannedEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ForecastSettings" (
    "ownerId" TEXT NOT NULL,
    "horizonMois" INTEGER NOT NULL DEFAULT 12,
    "fenetreMois" INTEGER NOT NULL DEFAULT 6,
    "estimateurParDefaut" "Estimateur" NOT NULL DEFAULT 'MEDIANE_6',

    CONSTRAINT "ForecastSettings_pkey" PRIMARY KEY ("ownerId")
);

-- CreateTable
CREATE TABLE "SubcategoryForecast" (
    "subcategoryId" TEXT NOT NULL,
    "estimateur" "Estimateur" NOT NULL,
    "montantFixeCents" INTEGER,

    CONSTRAINT "SubcategoryForecast_pkey" PRIMARY KEY ("subcategoryId")
);

-- CreateTable
CREATE TABLE "CalendarFeed" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "libelle" TEXT NOT NULL,
    "sens" "SensFlux" NOT NULL,
    "url" TEXT,
    "jeton" TEXT,
    "derniereSync" TIMESTAMP(3),
    "actif" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "CalendarFeed_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Scenario" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Scenario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScenarioSurcharge" (
    "id" TEXT NOT NULL,
    "scenarioId" TEXT NOT NULL,
    "type" "TypeSurcharge" NOT NULL,
    "cibleId" TEXT,
    "payload" JSONB NOT NULL,
    "ordre" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ScenarioSurcharge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Goal" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "type" "TypeObjectif" NOT NULL,
    "montantCibleCents" INTEGER,
    "dateCible" DATE,
    "contributionMensuelleCents" INTEGER,
    "depenseReduitProgression" BOOLEAN NOT NULL DEFAULT true,
    "tauxCroissanceAnnuel" DOUBLE PRECISION,
    "acquisInitialCents" INTEGER NOT NULL DEFAULT 0,
    "dateDebut" DATE NOT NULL,
    "ordre" INTEGER NOT NULL DEFAULT 0,
    "archive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Goal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoalAccount" (
    "id" TEXT NOT NULL,
    "goalId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "mode" "ModeAllocationObjectif" NOT NULL DEFAULT 'TOTAL',
    "montantCents" INTEGER,

    CONSTRAINT "GoalAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoalTransaction" (
    "goalId" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,

    CONSTRAINT "GoalTransaction_pkey" PRIMARY KEY ("goalId","transactionId")
);

-- CreateTable
CREATE TABLE "DebtPlan" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "mensualiteTotaleCents" INTEGER NOT NULL,
    "strategie" "StrategieDette" NOT NULL DEFAULT 'AVALANCHE',
    "versementPonctuelCents" INTEGER,
    "versementPonctuelDate" DATE,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DebtPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DebtPlanItem" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "ordre" INTEGER NOT NULL DEFAULT 0,
    "inclus" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "DebtPlanItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BalanceStatement" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "soldeCents" INTEGER NOT NULL,
    "source" "SourceSolde" NOT NULL,
    "saisiLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BalanceStatement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reconciliation" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "statementId" TEXT NOT NULL,
    "ecartCents" INTEGER NOT NULL,
    "explication" TEXT,
    "ajustementTxId" TEXT,
    "regleeLe" TIMESTAMP(3),

    CONSTRAINT "Reconciliation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavedReport" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "groupement" TEXT NOT NULL,
    "periode" TEXT NOT NULL,
    "filtres" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavedReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Account_compteLieId_key" ON "Account"("compteLieId");

-- CreateIndex
CREATE INDEX "Account_ownerId_archive_idx" ON "Account"("ownerId", "archive");

-- CreateIndex
CREATE INDEX "Account_ownerId_type_idx" ON "Account"("ownerId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "Account_ownerId_nom_key" ON "Account"("ownerId", "nom");

-- CreateIndex
CREATE INDEX "LoanTerm_accountId_moisEffectif_idx" ON "LoanTerm"("accountId", "moisEffectif");

-- CreateIndex
CREATE UNIQUE INDEX "LoanTerm_accountId_moisEffectif_key" ON "LoanTerm"("accountId", "moisEffectif");

-- CreateIndex
CREATE UNIQUE INDEX "ContributionEntry_transactionId_key" ON "ContributionEntry"("transactionId");

-- CreateIndex
CREATE INDEX "ContributionEntry_accountId_anneeImputation_idx" ON "ContributionEntry"("accountId", "anneeImputation");

-- CreateIndex
CREATE UNIQUE INDEX "ContributionRoom_accountId_annee_key" ON "ContributionRoom"("accountId", "annee");

-- CreateIndex
CREATE UNIQUE INDEX "AssetAllocation_accountId_classe_key" ON "AssetAllocation"("accountId", "classe");

-- CreateIndex
CREATE INDEX "Category_ownerId_ordre_idx" ON "Category"("ownerId", "ordre");

-- CreateIndex
CREATE UNIQUE INDEX "Category_ownerId_nom_key" ON "Category"("ownerId", "nom");

-- CreateIndex
CREATE INDEX "Subcategory_categoryId_ordre_idx" ON "Subcategory"("categoryId", "ordre");

-- CreateIndex
CREATE UNIQUE INDEX "Subcategory_categoryId_nom_key" ON "Subcategory"("categoryId", "nom");

-- CreateIndex
CREATE INDEX "Payee_ownerId_nomNormalise_idx" ON "Payee"("ownerId", "nomNormalise");

-- CreateIndex
CREATE UNIQUE INDEX "Payee_ownerId_nom_key" ON "Payee"("ownerId", "nom");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_ownerId_nom_key" ON "Tag"("ownerId", "nom");

-- CreateIndex
CREATE INDEX "Rule_ownerId_actif_priorite_idx" ON "Rule"("ownerId", "actif", "priorite");

-- CreateIndex
CREATE INDEX "RuleCondition_ruleId_idx" ON "RuleCondition"("ruleId");

-- CreateIndex
CREATE INDEX "RuleAction_ruleId_ordre_idx" ON "RuleAction"("ruleId", "ordre");

-- CreateIndex
CREATE UNIQUE INDEX "ImportFilter_ownerId_motif_mode_key" ON "ImportFilter"("ownerId", "motif", "mode");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_transferTransactionId_key" ON "Transaction"("transferTransactionId");

-- CreateIndex
CREATE INDEX "Transaction_ownerId_date_idx" ON "Transaction"("ownerId", "date");

-- CreateIndex
CREATE INDEX "Transaction_accountId_date_idx" ON "Transaction"("accountId", "date");

-- CreateIndex
CREATE INDEX "Transaction_subcategoryId_date_idx" ON "Transaction"("subcategoryId", "date");

-- CreateIndex
CREATE INDEX "Transaction_accountId_descriptionNormalisee_idx" ON "Transaction"("accountId", "descriptionNormalisee");

-- CreateIndex
CREATE INDEX "Transaction_ownerId_aRevoir_idx" ON "Transaction"("ownerId", "aRevoir");

-- CreateIndex
CREATE INDEX "Transaction_parentId_idx" ON "Transaction"("parentId");

-- CreateIndex
CREATE INDEX "Transaction_payeeId_date_idx" ON "Transaction"("payeeId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_empreinte_key" ON "Transaction"("empreinte");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_accountId_externalId_key" ON "Transaction"("accountId", "externalId");

-- CreateIndex
CREATE INDEX "TransactionTag_tagId_idx" ON "TransactionTag"("tagId");

-- CreateIndex
CREATE INDEX "BudgetAllocation_ownerId_mois_idx" ON "BudgetAllocation"("ownerId", "mois");

-- CreateIndex
CREATE UNIQUE INDEX "BudgetAllocation_ownerId_categoryId_subcategoryId_mois_key" ON "BudgetAllocation"("ownerId", "categoryId", "subcategoryId", "mois");

-- CreateIndex
CREATE INDEX "MoneyMovement_ownerId_mois_idx" ON "MoneyMovement"("ownerId", "mois");

-- CreateIndex
CREATE INDEX "MoneyMovement_groupeId_idx" ON "MoneyMovement"("groupeId");

-- CreateIndex
CREATE INDEX "RecurringRule_ownerId_actif_idx" ON "RecurringRule"("ownerId", "actif");

-- CreateIndex
CREATE INDEX "RecurringSplit_ruleId_idx" ON "RecurringSplit"("ruleId");

-- CreateIndex
CREATE UNIQUE INDEX "ExpectedOccurrence_transactionId_key" ON "ExpectedOccurrence"("transactionId");

-- CreateIndex
CREATE INDEX "ExpectedOccurrence_etat_echeance_idx" ON "ExpectedOccurrence"("etat", "echeance");

-- CreateIndex
CREATE UNIQUE INDEX "ExpectedOccurrence_ruleId_echeance_key" ON "ExpectedOccurrence"("ruleId", "echeance");

-- CreateIndex
CREATE INDEX "RecurrenceSuggestion_ownerId_etat_score_idx" ON "RecurrenceSuggestion"("ownerId", "etat", "score");

-- CreateIndex
CREATE INDEX "PlannedEvent_ownerId_date_idx" ON "PlannedEvent"("ownerId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "PlannedEvent_feedId_externalUid_key" ON "PlannedEvent"("feedId", "externalUid");

-- CreateIndex
CREATE UNIQUE INDEX "Scenario_ownerId_nom_key" ON "Scenario"("ownerId", "nom");

-- CreateIndex
CREATE INDEX "ScenarioSurcharge_scenarioId_ordre_idx" ON "ScenarioSurcharge"("scenarioId", "ordre");

-- CreateIndex
CREATE INDEX "Goal_ownerId_ordre_idx" ON "Goal"("ownerId", "ordre");

-- CreateIndex
CREATE UNIQUE INDEX "Goal_ownerId_nom_key" ON "Goal"("ownerId", "nom");

-- CreateIndex
CREATE UNIQUE INDEX "GoalAccount_goalId_accountId_key" ON "GoalAccount"("goalId", "accountId");

-- CreateIndex
CREATE UNIQUE INDEX "DebtPlan_ownerId_nom_key" ON "DebtPlan"("ownerId", "nom");

-- CreateIndex
CREATE INDEX "DebtPlanItem_planId_ordre_idx" ON "DebtPlanItem"("planId", "ordre");

-- CreateIndex
CREATE UNIQUE INDEX "DebtPlanItem_planId_accountId_key" ON "DebtPlanItem"("planId", "accountId");

-- CreateIndex
CREATE INDEX "BalanceStatement_accountId_date_idx" ON "BalanceStatement"("accountId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "BalanceStatement_accountId_date_source_key" ON "BalanceStatement"("accountId", "date", "source");

-- CreateIndex
CREATE UNIQUE INDEX "Reconciliation_statementId_key" ON "Reconciliation"("statementId");

-- CreateIndex
CREATE UNIQUE INDEX "Reconciliation_ajustementTxId_key" ON "Reconciliation"("ajustementTxId");

-- CreateIndex
CREATE UNIQUE INDEX "SavedReport_ownerId_nom_key" ON "SavedReport"("ownerId", "nom");

-- AddForeignKey
ALTER TABLE "Preference" ADD CONSTRAINT "Preference_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_compteLieId_fkey" FOREIGN KEY ("compteLieId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoanTerm" ADD CONSTRAINT "LoanTerm_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContributionEntry" ADD CONSTRAINT "ContributionEntry_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContributionEntry" ADD CONSTRAINT "ContributionEntry_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContributionRoom" ADD CONSTRAINT "ContributionRoom_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetAllocation" ADD CONSTRAINT "AssetAllocation_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subcategory" ADD CONSTRAINT "Subcategory_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payee" ADD CONSTRAINT "Payee_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tag" ADD CONSTRAINT "Tag_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rule" ADD CONSTRAINT "Rule_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RuleCondition" ADD CONSTRAINT "RuleCondition_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "Rule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RuleAction" ADD CONSTRAINT "RuleAction_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "Rule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RuleAction" ADD CONSTRAINT "RuleAction_subcategoryId_fkey" FOREIGN KEY ("subcategoryId") REFERENCES "Subcategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportFilter" ADD CONSTRAINT "ImportFilter_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportBatch" ADD CONSTRAINT "ImportBatch_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportBatch" ADD CONSTRAINT "ImportBatch_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_transferAccountId_fkey" FOREIGN KEY ("transferAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_payeeId_fkey" FOREIGN KEY ("payeeId") REFERENCES "Payee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_subcategoryId_fkey" FOREIGN KEY ("subcategoryId") REFERENCES "Subcategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Transaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_transferTransactionId_fkey" FOREIGN KEY ("transferTransactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "ImportBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_appliedRuleId_fkey" FOREIGN KEY ("appliedRuleId") REFERENCES "Rule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionTag" ADD CONSTRAINT "TransactionTag_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionTag" ADD CONSTRAINT "TransactionTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetAllocation" ADD CONSTRAINT "BudgetAllocation_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetAllocation" ADD CONSTRAINT "BudgetAllocation_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetAllocation" ADD CONSTRAINT "BudgetAllocation_subcategoryId_fkey" FOREIGN KEY ("subcategoryId") REFERENCES "Subcategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Target" ADD CONSTRAINT "Target_subcategoryId_fkey" FOREIGN KEY ("subcategoryId") REFERENCES "Subcategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MoneyMovement" ADD CONSTRAINT "MoneyMovement_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MoneyMovement" ADD CONSTRAINT "MoneyMovement_deId_fkey" FOREIGN KEY ("deId") REFERENCES "Subcategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MoneyMovement" ADD CONSTRAINT "MoneyMovement_versId_fkey" FOREIGN KEY ("versId") REFERENCES "Subcategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringRule" ADD CONSTRAINT "RecurringRule_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringRule" ADD CONSTRAINT "RecurringRule_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringRule" ADD CONSTRAINT "RecurringRule_subcategoryId_fkey" FOREIGN KEY ("subcategoryId") REFERENCES "Subcategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringSplit" ADD CONSTRAINT "RecurringSplit_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "RecurringRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpectedOccurrence" ADD CONSTRAINT "ExpectedOccurrence_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "RecurringRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpectedOccurrence" ADD CONSTRAINT "ExpectedOccurrence_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurrenceSuggestion" ADD CONSTRAINT "RecurrenceSuggestion_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlannedEvent" ADD CONSTRAINT "PlannedEvent_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlannedEvent" ADD CONSTRAINT "PlannedEvent_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlannedEvent" ADD CONSTRAINT "PlannedEvent_subcategoryId_fkey" FOREIGN KEY ("subcategoryId") REFERENCES "Subcategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlannedEvent" ADD CONSTRAINT "PlannedEvent_feedId_fkey" FOREIGN KEY ("feedId") REFERENCES "CalendarFeed"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForecastSettings" ADD CONSTRAINT "ForecastSettings_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubcategoryForecast" ADD CONSTRAINT "SubcategoryForecast_subcategoryId_fkey" FOREIGN KEY ("subcategoryId") REFERENCES "Subcategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarFeed" ADD CONSTRAINT "CalendarFeed_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Scenario" ADD CONSTRAINT "Scenario_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScenarioSurcharge" ADD CONSTRAINT "ScenarioSurcharge_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "Scenario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoalAccount" ADD CONSTRAINT "GoalAccount_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoalAccount" ADD CONSTRAINT "GoalAccount_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoalTransaction" ADD CONSTRAINT "GoalTransaction_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoalTransaction" ADD CONSTRAINT "GoalTransaction_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DebtPlan" ADD CONSTRAINT "DebtPlan_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DebtPlanItem" ADD CONSTRAINT "DebtPlanItem_planId_fkey" FOREIGN KEY ("planId") REFERENCES "DebtPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DebtPlanItem" ADD CONSTRAINT "DebtPlanItem_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BalanceStatement" ADD CONSTRAINT "BalanceStatement_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reconciliation" ADD CONSTRAINT "Reconciliation_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reconciliation" ADD CONSTRAINT "Reconciliation_statementId_fkey" FOREIGN KEY ("statementId") REFERENCES "BalanceStatement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reconciliation" ADD CONSTRAINT "Reconciliation_ajustementTxId_fkey" FOREIGN KEY ("ajustementTxId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedReport" ADD CONSTRAINT "SavedReport_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
