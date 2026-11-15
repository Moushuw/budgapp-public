# Lot M0 — socle

Spécification exécutable. Lire `CLAUDE.md` avant de commencer.

M0 ne produit **aucun écran fonctionnel**. Son but est qu'à la fin, tout soit en place pour que M1 ne fasse que de la fonctionnalité : base de données réelle, schéma complet, données de test, logique d'argent et de dates testée, contrat des Server Actions, et une application qui démarre.

---

## 0. Critère de sortie

- [ ] Le stack Docker `budgapp-db` tourne, avec les bases `budgapp_dev` et `budgapp_prod` et les extensions `pg_trgm` et `unaccent`.
- [ ] `npm run dev` démarre l'application, connectée à `budgapp_dev`.
- [ ] `npx prisma migrate dev` a créé la totalité du schéma du §2.3.
- [ ] `npm run seed` remplit la base avec 18 mois de données synthétiques déterministes.
- [ ] `npx vitest run` passe, avec au minimum les tests de `domain/money.ts` et `domain/dates.ts`.
- [ ] `npx tsc --noEmit` et `npx eslint .` ne signalent rien.
- [ ] `AGENTS.md` existe et pointe vers la doc Next embarquée.
- [ ] `INDEX.md` est à jour (carte du code, état des lots).

---

## 1. Environnement — PostgreSQL 17 en conteneur Docker

*Copie publique : les détails d'hébergement de l'instance privée (machine, réseau, outil de déploiement, sauvegardes) sont retirés. Pour un poste de développement, le `docker-compose.yml` à la racine du dépôt fournit l'équivalent.*

**Décision du 2026-09-13 : pas de machine dédiée.** La base tourne en conteneur sur un hôte Docker existant, déployée comme les autres services de l'infrastructure personnelle.

**M0 n'a besoin que de la base de données.** Le stack applicatif vient à la fin de M1, quand il y aura une image à déployer.

### 1.1 Ce qui est déjà écrit

Le stack `budgapp-db` est décrit dans un dépôt d'infrastructure séparé :

| Fichier | Rôle |
|---|---|
| `docker-compose.yml` | services `db` (`postgres:17-alpine`) et `backup` |
| `initdb/01-init.sh` | crée `budgapp_prod` et les extensions dans les deux bases, à la première initialisation du volume |
| `backup.sh` | `pg_dump` quotidien, compressé, avec rotation |

### 1.2 Ce qui reste à faire à la main

1. Créer le secret du mot de passe de la base dans l'outil de déploiement.
2. Déployer le stack `budgapp-db`.
3. Vérifier que les deux conteneurs sont `healthy`.

### 1.3 Paramètres de connexion

| | |
|---|---|
| Hôte | `<hôte de la base>` |
| Port | `5432` |
| Rôle | `budgapp` |
| Base de développement | `budgapp_dev` |
| Base de production | `budgapp_prod` |

```
DATABASE_URL="postgresql://budgapp:<mot de passe>@<hôte de la base>:5432/budgapp_dev?schema=public"
```

### 1.4 Vérification

Depuis le poste de travail :

```
psql "postgresql://budgapp@<hôte de la base>:5432/budgapp_dev" -c "select version();"
psql "postgresql://budgapp@<hôte de la base>:5432/budgapp_dev" -c "select extname from pg_extension;"
```

`pg_trgm` et `unaccent` doivent apparaître. Si la connexion échoue alors que le conteneur est sain, c'est le pare-feu entre le poste et l'hôte — pas la base.

---

## 2. Socle applicatif — dépôt `BudgApp`

### 2.1 Initialisation

```bash
npx create-next-app@latest . --typescript --tailwind --app --src-dir --eslint --use-npm --no-import-alias
npx @next/codemod@canary agents-md          # génère AGENTS.md vers la doc Next embarquée
npx shadcn@latest init
npm i @prisma/client @tanstack/react-query react-hook-form @hookform/resolvers zod \
      date-fns lucide-react sonner next-themes recharts class-variance-authority clsx tailwind-merge
npm i -D prisma vitest @vitest/coverage-v8 tsx @types/node
```

Composants shadcn à installer d'emblée (les seuls dont M1 aura besoin) :

```bash
npx shadcn@latest add button input textarea label select card table badge dialog alert-dialog \
    form popover calendar tabs separator skeleton switch tooltip dropdown-menu sonner
```

**Scripts `package.json`** :

```json
{
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "eslint .",
  "typecheck": "tsc --noEmit",
  "test": "vitest run",
  "test:watch": "vitest",
  "seed": "tsx prisma/seed.ts",
  "db:migrate": "prisma migrate dev",
  "db:studio": "prisma studio",
  "check": "npm run lint && npm run typecheck && npm run test"
}
```

Pas de `--turbopack` dans `dev` ni `build` : c'est le défaut en Next 16.

**`next.config.ts`** : activer `output: "standalone"` dès maintenant. La cible de déploiement est une image Docker ; sans ce réglage, l'image embarquerait tout `node_modules` au lieu du strict nécessaire. Le coût est d'une ligne aujourd'hui, d'une reprise de build plus tard.

**`tsconfig.json`** : `strict: true` **et** `noUncheckedIndexedAccess: true`. Alias `@/*` vers `./src/*`.

**ESLint** : flat config (`eslint.config.mjs`), `@next/eslint-plugin-next` + `typescript-eslint` en mode `strictTypeChecked`. Règles à activer explicitement : interdiction de `any`, des imports non utilisés, et de `console.log`.

**Hook `pre-push`** (pas de CI pour l'instant) : un fichier `.githooks/pre-push` qui lance `npm run check`, activé par `git config core.hooksPath .githooks`. Documenter la commande dans le README.

**`.gitignore`** : vérifier que `.env*`, `.next/`, `node_modules/`, `*.db`, `coverage/` y sont.

**`.env.example`** (commité) :

```
DATABASE_URL="postgresql://budgapp:CHANGEME@localhost:5432/budgapp_dev?schema=public"
```

Le vrai `.env` n'est jamais commité.

### 2.2 Arborescence

Créer les dossiers du §4 de `CLAUDE.md`, avec un `.gitkeep` dans ceux encore vides.

### 2.3 Schéma Prisma

Schéma complet dès M0, y compris les tables que M4 et M5 utiliseront. Raison : une migration de schéma sur une base déjà remplie coûte cher, et le seed doit pouvoir produire des récurrences et des budgets réalistes tout de suite.

**Décision d'identifiants** : `String @id @default(cuid())` **partout**, sans exception. Uniforme, pas d'identifiant séquentiel exposé, et ça évite les erreurs de conversion entre `Int` et `String` dans les formulaires.

**Les extensions ne sont pas déclarées dans le `datasource`** : elles sont créées par `initdb/01-init.sh` côté conteneur. Déclarer `extensions = [...]` dans Prisma exigerait le drapeau `previewFeatures = ["postgresqlExtensions"]`, une dépendance à une fonctionnalité en aperçu dont on n'a pas besoin.

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ───────────────────────── énumérations

enum TypeCompte        { CHEQUE EPARGNE CREDIT MARGE AUTRE }
enum ModeCorrespondance { CONTIENT MOT_ENTIER REGEX EXACT }
enum SourceIngestion   { COPIER_COLLER FICHIER AGREGATEUR MANUELLE AJUSTEMENT }
enum EtatTransaction   { EN_ATTENTE COMPTABILISEE }
enum NatureRecurrence  { FIXE VARIABLE }
enum Cadence           { HEBDO BIHEBDO MENSUEL BIMESTRIEL TRIMESTRIEL SEMESTRIEL ANNUEL }
enum EtatOccurrence    { PREVUE REALISEE MANQUEE IGNOREE }
enum TypeLiaison       { AUTO MANUELLE RETROACTIVE }
enum Estimateur        { MEDIANE_6 MOYENNE_3 MOYENNE_6 MOYENNE_TRONQUEE MONTANT_FIXE BUDGET }
enum SourceSolde       { MANUEL RELEVE AGREGATEUR }
enum SensFlux          { SORTANT ENTRANT }
enum Arrondi           { CENTS DOLLARS }
enum EtatSuggestion    { EN_ATTENTE ACCEPTEE REFUSEE }

// ───────────────────────── propriétaire (multi-utilisateur préparé)

model User {
  id        String   @id @default(cuid())
  email     String   @unique
  nom       String?
  createdAt DateTime @default(now())

  comptes       Account[]
  categories    Category[]
  regles        Rule[]
  filtres       ImportFilter[]
  transactions  Transaction[]
  lots          ImportBatch[]
  budgets       BudgetLine[]
  recurrences   RecurringRule[]
  evenements    PlannedEvent[]
  suggestions   RecurrenceSuggestion[]
  fluxAgenda    CalendarFeed[]
  preference    Preference?
  reglagesPrev  ForecastSettings?
}

model Preference {
  ownerId String  @id
  arrondi Arrondi @default(CENTS)
  locale  String  @default("fr-CA")
  theme   String  @default("system")
  owner   User    @relation(fields: [ownerId], references: [id], onDelete: Cascade)
}

// ───────────────────────── référentiel

model Account {
  id                   String      @id @default(cuid())
  ownerId              String
  nom                  String
  type                 TypeCompte  @default(CHEQUE)
  soldeInitialCents    Int         @default(0)
  dateSoldeInitial     DateTime    @db.Date
  seuilSecuriteCents   Int?
  inclureDansPrevision Boolean     @default(true)
  archive              Boolean     @default(false)
  ordre                Int         @default(0)
  createdAt            DateTime    @default(now())

  owner            User               @relation(fields: [ownerId], references: [id], onDelete: Cascade)
  transactions     Transaction[]
  recurrences      RecurringRule[]
  evenements       PlannedEvent[]
  releves          BalanceStatement[]
  reconciliations  Reconciliation[]
  lots             ImportBatch[]

  @@unique([ownerId, nom])
  @@index([ownerId, archive])
}

model Category {
  id      String @id @default(cuid())
  ownerId String
  nom     String
  ordre   Int    @default(0)
  couleur String?

  owner          User          @relation(fields: [ownerId], references: [id], onDelete: Cascade)
  sousCategories Subcategory[]
  budgets        BudgetLine[]

  @@unique([ownerId, nom])
}

model Subcategory {
  id         String @id @default(cuid())
  categoryId String
  nom        String
  ordre      Int    @default(0)
  systeme    Boolean @default(false)   // ex. « Ajustement de solde » : non supprimable

  category     Category             @relation(fields: [categoryId], references: [id], onDelete: Cascade)
  regles       Rule[]
  transactions Transaction[]
  recurrences  RecurringRule[]
  evenements   PlannedEvent[]
  budgets      BudgetLine[]
  prevision    SubcategoryForecast?

  @@unique([categoryId, nom])         // unicité PAR catégorie, pas globale
  @@index([categoryId, ordre])
}

model Rule {
  id            String             @id @default(cuid())
  ownerId       String
  motif         String
  mode          ModeCorrespondance @default(CONTIENT)
  priorite      Int                @default(0)
  actif         Boolean            @default(true)
  subcategoryId String

  owner       User        @relation(fields: [ownerId], references: [id], onDelete: Cascade)
  subcategory Subcategory @relation(fields: [subcategoryId], references: [id], onDelete: Cascade)

  @@unique([ownerId, motif, mode])
  @@index([ownerId, actif, priorite])
}

model ImportFilter {
  id      String             @id @default(cuid())
  ownerId String
  motif   String
  mode    ModeCorrespondance @default(EXACT)

  owner User @relation(fields: [ownerId], references: [id], onDelete: Cascade)

  @@unique([ownerId, motif, mode])
}

// ───────────────────────── transactions et ingestion

model ImportBatch {
  id          String          @id @default(cuid())
  ownerId     String
  accountId   String
  source      SourceIngestion
  libelle     String?
  importeLe   DateTime        @default(now())
  nbLignes    Int
  couvreDu    DateTime?       @db.Date
  couvreAu    DateTime?       @db.Date

  owner        User          @relation(fields: [ownerId], references: [id], onDelete: Cascade)
  account      Account       @relation(fields: [accountId], references: [id], onDelete: Cascade)
  transactions Transaction[]
}

model Transaction {
  id                    String          @id @default(cuid())
  ownerId               String
  accountId             String
  date                  DateTime        @db.Date
  description           String
  descriptionNormalisee String
  details               String?
  montantCents          Int                                    // signé : négatif = sortie
  subcategoryId         String?
  source                SourceIngestion
  etat                  EtatTransaction @default(COMPTABILISEE)
  externalId            String?
  empreinte             String
  importBatchId         String?
  createdAt             DateTime        @default(now())
  updatedAt             DateTime        @updatedAt

  owner       User               @relation(fields: [ownerId], references: [id], onDelete: Cascade)
  account     Account            @relation(fields: [accountId], references: [id], onDelete: Restrict)
  subcategory Subcategory?       @relation(fields: [subcategoryId], references: [id], onDelete: SetNull)
  importBatch ImportBatch?       @relation(fields: [importBatchId], references: [id], onDelete: SetNull)
  occurrence  ExpectedOccurrence?
  ajustement  Reconciliation?    @relation("ajustement")

  @@unique([empreinte])
  @@unique([accountId, externalId])
  @@index([ownerId, date])
  @@index([accountId, date])
  @@index([subcategoryId, date])
  @@index([accountId, descriptionNormalisee])
  @@index([ownerId, subcategoryId])
}

// ───────────────────────── budgets

model BudgetLine {
  id            String  @id @default(cuid())
  ownerId       String
  categoryId    String?
  subcategoryId String?
  mois          String?              // "2026-09" ; null = ligne par défaut, valable tous les mois
  montantCents  Int

  owner       User         @relation(fields: [ownerId], references: [id], onDelete: Cascade)
  category    Category?    @relation(fields: [categoryId], references: [id], onDelete: Cascade)
  subcategory Subcategory? @relation(fields: [subcategoryId], references: [id], onDelete: Cascade)

  @@unique([ownerId, categoryId, subcategoryId, mois])
  @@index([ownerId, mois])
}

// ───────────────────────── récurrences

model RecurringRule {
  id                 String           @id @default(cuid())
  ownerId            String
  libelle            String
  nature             NatureRecurrence
  montantCents       Int?                              // requis si FIXE
  cadence            Cadence
  dateAncrage        DateTime         @db.Date
  dateFin            DateTime?        @db.Date
  accountId          String
  subcategoryId      String?
  motifRapprochement String?
  toleranceCents     Int              @default(500)
  toleranceJours     Int              @default(4)
  scoreConfiance     Float?
  actif              Boolean          @default(true)
  createdAt          DateTime         @default(now())

  owner       User                 @relation(fields: [ownerId], references: [id], onDelete: Cascade)
  account     Account              @relation(fields: [accountId], references: [id], onDelete: Cascade)
  subcategory Subcategory?         @relation(fields: [subcategoryId], references: [id], onDelete: SetNull)
  occurrences ExpectedOccurrence[]

  @@index([ownerId, actif])
}

model ExpectedOccurrence {
  id            String         @id @default(cuid())
  ruleId        String
  echeance      DateTime       @db.Date
  montantCents  Int
  etat          EtatOccurrence @default(PREVUE)
  liaison       TypeLiaison?
  lieeLe        DateTime?
  transactionId String?        @unique

  rule        RecurringRule @relation(fields: [ruleId], references: [id], onDelete: Cascade)
  transaction Transaction?  @relation(fields: [transactionId], references: [id], onDelete: SetNull)

  @@unique([ruleId, echeance])
  @@index([etat, echeance])
}

model RecurrenceSuggestion {
  id                 String          @id @default(cuid())
  ownerId            String
  accountId          String
  motif              String
  cadence            Cadence
  montantMedianCents Int
  nbOccurrences      Int
  regularite         Float
  stabilite          Float
  score              Float
  transactionIds     String[]
  etat               EtatSuggestion  @default(EN_ATTENTE)
  detecteeLe         DateTime        @default(now())

  owner User @relation(fields: [ownerId], references: [id], onDelete: Cascade)

  @@index([ownerId, etat, score])
}

// ───────────────────────── prévision

model PlannedEvent {
  id            String   @id @default(cuid())
  ownerId       String
  libelle       String
  date          DateTime @db.Date
  montantCents  Int
  accountId     String?
  subcategoryId String?
  feedId        String?
  externalUid   String?
  aCompleter    Boolean  @default(false)

  owner       User          @relation(fields: [ownerId], references: [id], onDelete: Cascade)
  account     Account?      @relation(fields: [accountId], references: [id], onDelete: SetNull)
  subcategory Subcategory?  @relation(fields: [subcategoryId], references: [id], onDelete: SetNull)
  feed        CalendarFeed? @relation(fields: [feedId], references: [id], onDelete: SetNull)

  @@unique([feedId, externalUid])
  @@index([ownerId, date])
}

model ForecastSettings {
  ownerId             String     @id
  horizonMois         Int        @default(12)
  fenetreMois         Int        @default(6)
  estimateurParDefaut Estimateur @default(MEDIANE_6)
  owner               User       @relation(fields: [ownerId], references: [id], onDelete: Cascade)
}

model SubcategoryForecast {
  subcategoryId    String      @id
  estimateur       Estimateur
  montantFixeCents Int?
  subcategory      Subcategory @relation(fields: [subcategoryId], references: [id], onDelete: Cascade)
}

model CalendarFeed {
  id           String    @id @default(cuid())
  ownerId      String
  libelle      String
  sens         SensFlux
  url          String?               // ENTRANT : adresse ICS privée de l'agenda source
  jeton        String?               // SORTANT : secret de l'adresse publiée
  derniereSync DateTime?
  actif        Boolean   @default(true)

  owner      User           @relation(fields: [ownerId], references: [id], onDelete: Cascade)
  evenements PlannedEvent[]
}

// ───────────────────────── soldes et réconciliation

model BalanceStatement {
  id         String      @id @default(cuid())
  accountId  String
  date       DateTime    @db.Date
  soldeCents Int
  source     SourceSolde
  saisiLe    DateTime    @default(now())

  account        Account         @relation(fields: [accountId], references: [id], onDelete: Cascade)
  reconciliation Reconciliation?

  @@unique([accountId, date, source])
  @@index([accountId, date])
}

model Reconciliation {
  id             String    @id @default(cuid())
  accountId      String
  statementId    String    @unique
  ecartCents     Int
  explication    String?
  ajustementTxId String?   @unique
  regleeLe       DateTime?

  account    Account          @relation(fields: [accountId], references: [id], onDelete: Cascade)
  statement  BalanceStatement @relation(fields: [statementId], references: [id], onDelete: Cascade)
  ajustement Transaction?     @relation("ajustement", fields: [ajustementTxId], references: [id], onDelete: SetNull)
}
```

Après `prisma migrate dev`, **relire la migration générée** avant de la committer.

### 2.4 Seed synthétique — `prisma/seed.ts`

Objectif : une base de développement crédible, et un jeu de tests reproductible.

**Contraintes**

- **Déterministe** : générateur pseudo-aléatoire à graine fixe écrit à la main (un `mulberry32` de dix lignes suffit). Jamais `Math.random()`. Deux exécutions produisent exactement la même base.
- Idempotent : le script vide les tables métier avant de réécrire.
- Toutes les invariantes du schéma respectées, empreintes calculées comme en production (réutiliser `domain/ingestion/`, pas une copie).

**Ce qu'il produit**

| | |
|---|---|
| Utilisateur | un seul, `ownerId` réutilisé partout |
| Comptes | 4 — Chèque, Épargne, Visa (CREDIT), Marge — avec solde initial daté 18 mois en arrière |
| Catégories | 7 : Logement, Alimentation, Transport, Loisirs, Abonnements, Santé, Revenus |
| Sous-catégories | 20 à 24 réparties, dont « Ajustement de solde » marquée `systeme` |
| Règles | 15 à 20, dont **deux volontairement en conflit** sur le même motif et la même priorité |
| Filtres d'import | 4 |
| Transactions | 18 mois, environ 900 lignes |
| Budgets | une ligne par défaut pour chaque catégorie, plus deux surcharges mensuelles |
| Récurrences | 6 confirmées avec leurs occurrences liées (voir ci-dessous) |
| Relevés de solde | un par compte tous les deux mois, dont **un avec un écart volontaire** |
| Événements planifiés | 3 dans le futur, dont un `aCompleter` |

**Les récurrences à générer** — c'est le cœur de l'utilité du seed :

| Libellé | Nature | Cadence | Montant |
|---|---|---|---|
| Loyer | FIXE | MENSUEL le 1er | 1 240,00 $ |
| Dépôt paie | FIXE | BIHEBDO | 2 406,00 $ (entrée) |
| Hydro-Québec | FIXE | BIMESTRIEL | 92 à 118 $ selon la saison |
| Internet | FIXE | MENSUEL le 15 | 84,99 $ |
| Streaming | FIXE | MENSUEL le 12 | 17,99 $ |
| Assurance auto | FIXE | MENSUEL le 20 | 142,00 $ |

Chaque occurrence passée doit exister en `REALISEE`, liée à sa transaction avec `liaison = RETROACTIVE`. Les occurrences futures restent `PREVUE`. **Une occurrence passée est laissée délibérément en `MANQUEE`**, sans transaction, pour que l'écran des paiements attendus non vus ait un cas à afficher.

**Les dépenses variables** doivent avoir une dispersion réaliste par sous-catégorie, sinon la prévision n'a rien à estimer :

- Épicerie : environ 620 $/mois, écart-type ~90 $, **avec un mois à 1 180 $** (une réception) — c'est le cas qui prouve que la médiane bat la moyenne.
- Essence : environ 180 $/mois, faible dispersion.
- Restaurant : environ 210 $/mois, forte dispersion.
- Sorties : irrégulier, certains mois à zéro.
- Santé : deux ou trois occurrences sur 18 mois seulement — le cas « historique insuffisant ».
- Une sous-catégorie créée il y a **deux mois** seulement, pour le cas « estimation faible ».

**À vérifier après le seed** : pour chaque compte, `soldeInitialCents + somme des transactions` doit égaler le dernier relevé de solde, **sauf** celui où l'écart est volontaire. Écrire cette vérification comme un test.

### 2.5 `domain/money.ts`

```ts
export type Cents = number   // entier signé ; négatif = sortie d'argent

export function parseMontant(texte: string): Cents | null
export function formatMontant(c: Cents, arrondi?: Arrondi): string
export function additionner(...montants: Cents[]): Cents
export function mediane(valeurs: Cents[]): Cents
export function quantile(valeurs: Cents[], q: number): Cents
```

`parseMontant` doit avaler les formes réelles d'un relevé Desjardins : `1 240,00 $`, `−54,99`, `+2 406,00 $`, `12 $`, espaces insécables, virgule ou point décimal, signe moins typographique `−`. Elle retourne `null` sur une entrée illisible — **jamais `NaN`**, jamais `0` par défaut. C'est le bug exact de la v1.

Tests obligatoires : chacune des formes ci-dessus, l'arrondi à la demi-unité, les valeurs négatives, la chaîne vide, une chaîne sans chiffre, et un montant à trois décimales.

### 2.6 `domain/dates.ts`

```ts
export type DateCivile = string          // "AAAA-MM-JJ", jamais un objet Date

export function dateCivile(a: number, m: number, j: number): DateCivile
export function ajouterJours(d: DateCivile, n: number): DateCivile
export function moisDe(d: DateCivile): string           // "2026-09"
export function echeances(cadence: Cadence, ancrage: DateCivile, jusqua: DateCivile): DateCivile[]
export function ecartJours(a: DateCivile, b: DateCivile): number
```

Le type est une **chaîne**, pas un `Date`. C'est ce qui rend impossible le décalage d'un jour par conversion de fuseau. La conversion vers un `Date` n'a lieu qu'au moment de parler à Prisma, dans les repositories.

Tests obligatoires : `echeances` sur les sept cadences, un ancrage le 31 dans un mois de 30 jours, une année bissextile, et un passage d'année.

### 2.7 `server/actions/define-action.ts`

Le wrapper décrit au §6 de `CLAUDE.md`. Une action de démonstration (`ping`) et son test suffisent pour M0.

### 2.8 `lib/query-keys.ts`

La fabrique de clés, avec les entrées de M1 et M2 déjà prévues : `comptes`, `categories`, `regles`, `filtres`, `transactions` (avec ses filtres), `budgets`, `previsions`.

### 2.9 Fontes, tokens et coquille

- `next/font` pour **Instrument Sans** et **IBM Plex Mono**.
- Bloc `@theme` de Tailwind v4 avec la palette du §10 de `CLAUDE.md`, en clair et en sombre.
- Une classe utilitaire pour les montants : `font-variant-numeric: tabular-nums` sur Plex Mono.
- La coquille de navigation : barre du haut à six onglets et barre de période persistante, **statiques** pour l'instant. Les six routes existent et rendent leur nom. Pas de contenu.
- `RootProviders` : `QueryClientProvider` avec `staleTime: 5 * 60_000` et `refetchOnWindowFocus: false`, `ThemeProvider`, `Toaster`. Devtools par `next/dynamic`, hors production seulement.

### 2.10 `README.md`

Court : comment démarrer, où est la base, comment lancer le seed, comment lancer les vérifications, et un renvoi vers `INDEX.md`.

---

## 3. Ce que M0 ne fait pas

Aucun import, aucune Server Action métier, aucun CRUD, aucun écran fonctionnel, aucun graphique, aucun déploiement. Si tu te retrouves à écrire un formulaire de création de compte, tu es déjà dans M1.

Le `Dockerfile` et le stack applicatif `budgapp` ne font pas partie de M0 non plus : ils viennent à la fin de M1, quand il y a une application à empaqueter. Seul `output: "standalone"` est posé dès maintenant (§2.1).

---

## 4. Ordre d'exécution

1. Créer le secret du mot de passe et déployer le stack `budgapp-db` (§1.2), puis vérifier la connexion depuis le poste (§1.4). Tout le reste en dépend.
2. Initialisation du projet, configuration, arborescence (§2.1, §2.2).
3. `domain/money.ts` et `domain/dates.ts` **avec leurs tests** — avant le schéma, parce que le seed s'en servira.
4. Schéma Prisma et première migration (§2.3).
5. Seed synthétique (§2.4), puis le test de cohérence des soldes.
6. `define-action.ts`, `query-keys.ts`, providers, coquille de navigation (§2.7 à §2.9).
7. README, mise à jour d'`INDEX.md`, vérification de la liste du §0.
