# BudgApp — instructions de projet

Ce fichier est lu automatiquement à chaque session. Il fait autorité sur les conventions du projet.
Pour trouver le bon document, lis `INDEX.md`.

---

## 1. Le projet

BudgApp est une application web de budget personnel, en français (Québec), mono-utilisateur pour l'instant mais dont le schéma prépare le multi-utilisateur. Elle fait **quatre** choses :

1. **Suivre** — transformer un relevé bancaire en transactions catégorisées, puis les consulter et les corriger.
2. **Budgéter** — répartir l'argent en **enveloppes qui se reportent d'un mois sur l'autre**, avec trois colonnes (alloué, dépensé, disponible), des cibles paramétrables et un reste à assigner.
3. **Prévoir** — projeter la situation financière à douze mois à partir des récurrences et d'une estimation statistique des postes variables.
4. **Décider** — simuler : un remboursement de dette accéléré, un revenu qui change, une dépense qu'on ajoute.

Les deux derniers points ne sont pas des bonus : c'est ce qui distingue BudgApp d'un carnet de dépenses. Toute décision technique doit les préserver.

> Le modèle de budget a été **renversé le 13 septembre 2026** : le montant mensuel fixe par catégorie est remplacé par des enveloppes avec report. Si tu lis quelque part « montant fixe par catégorie », le document est périmé — voir `docs/decision-modele-budget.md`.

**Avant d'écrire du code sur un sujet donné, lis la spécification correspondante dans `docs/`.** Elles ne sont pas décoratives : elles contiennent les décisions déjà prises et les pièges déjà identifiés. Ne les redécouvre pas, ne les contredis pas sans le dire.

---

## 2. Les dix règles non négociables

1. **L'argent se stocke en cents, en entier signé.** Jamais de `float`, jamais de dollars. L'arrondi au dollar est un réglage d'affichage.
2. **Les dates de transaction sont des dates sans heure** (`@db.Date`). Aucune conversion de fuseau ne doit pouvoir décaler une transaction d'un jour.
3. **Une Server Action ne lève pas d'erreur métier** : elle retourne un `ActionResult` typé. Les messages levés sont masqués en production par Next.js.
4. **Prisma n'apparaît que dans `src/server/repositories/`.** Nulle part ailleurs.
5. **`src/domain/` ne dépend de rien** — ni Prisma, ni React, ni Next. C'est du TypeScript pur, testé.
6. **Rien ne disparaît en silence.** Ligne de relevé non reconnue, doublon écarté, écart de solde, événement sans montant : tout atterrit dans une liste visible où l'utilisateur peut agir.
7. **Une liaison est un fait stocké, pas une ressemblance recalculée.** Voir `docs/modele-ingestion-recurrences.md` §4.
8. **Aucun `any`.** `strict` et `noUncheckedIndexedAccess` sont activés et ne se désactivent pas.
9. **Toute entrée d'une Server Action est validée côté serveur avec zod.** Une Server Action est un point d'entrée HTTP public.
10. **Tu ne commits jamais de secret**, ni `.env`, ni base de données, ni dump.

---

## 3. Stack et versions

| | |
|---|---|
| Runtime | Node.js 22 LTS (minimum absolu 20.9) |
| Framework | Next.js 16.x, App Router, **Turbopack par défaut** |
| React | 19.2 |
| Langage | TypeScript 5.x, `strict` + `noUncheckedIndexedAccess` |
| Base | PostgreSQL 17 · Prisma 6.x |
| État client | TanStack Query v5 |
| Formulaires | react-hook-form + zod (`@hookform/resolvers`) |
| UI | Tailwind CSS v4 + shadcn/ui (CLI v2) · lucide-react · sonner |
| Graphiques | Recharts |
| Tests | Vitest (unitaires) · Playwright (parcours, `npm run e2e`) |
| Paquets | **npm** (pas pnpm, pas yarn) |

### Next.js 16 n'est pas le Next.js de tes données d'entraînement

Beaucoup de choses ont changé entre 15 et 16. **La documentation de la version installée est dans `node_modules/next/dist/docs/`** — lis-la avant d'écrire du code sur un sujet Next.js dont tu n'es pas certain, plutôt que de te fier à ta mémoire. Si `AGENTS.md` existe à la racine, il pointe déjà dessus.

Les changements qui mordent :

- **Les API de requête sont asynchrones, sans exception.** `cookies()`, `headers()`, `draftMode()`, et surtout `params` et `searchParams` dans les pages et layouts sont des `Promise`. La compatibilité synchrone de Next 15 est supprimée.
  ```tsx
  export default async function Page(props: PageProps<'/transactions/[id]'>) {
    const { id } = await props.params
    const query = await props.searchParams
  }
  ```
  Les types `PageProps`, `LayoutProps` et `RouteContext` sont générés par `npx next typegen` — utilise-les au lieu de typer les props à la main.
- **`middleware.ts` s'appelle `proxy.ts`**, et la fonction exportée s'appelle `proxy`. Runtime Node.js uniquement.
- **`next lint` n'existe plus.** On lance ESLint directement, en **flat config**. `next build` ne lint pas.
- **`revalidateTag` exige un second argument** (un profil `cacheLife`). Pour un rafraîchissement immédiat après une mutation, utilise `updateTag` (sémantique « lis ce que tu viens d'écrire »). `refresh()` rafraîchit le routeur client depuis une Server Action.
- **Turbopack est le défaut** en dev comme en build. Ne rajoute pas `--turbopack` dans les scripts. Pas de configuration webpack dans ce projet.
- **`serverRuntimeConfig` et `publicRuntimeConfig` sont supprimés.** Variables d'environnement uniquement ; `NEXT_PUBLIC_` pour ce qui doit atteindre le navigateur.
- **`next dev` écrit dans `.next/dev`** et peut tourner en même temps qu'un build.
- N'active **pas** `cacheComponents` (l'ancien PPR) sans une décision explicite : ce n'est pas un simple drapeau, ça change le modèle de cache de toute l'application.

---

## 4. Architecture

```
src/
  app/                      # routes App Router — volontairement minces
    (dashboard)/
      page.tsx              # accueil
      transactions/
      budgets/
      prevision/
      objectifs/            # M7
      patrimoine/           # M7
      rapports/
      parametres/
  domain/                   # logique pure : zéro import de framework, 100 % testée
    money.ts                # cents, arrondi d'affichage, formatage fr-CA, médiane et quantiles
    dates.ts                # dates civiles, 12 cadences, échéances
    statement/              # parser de relevés + profils d'import
    ingestion/              # normalisation, empreintes, dédoublonnage
    categorization/         # application des règles, résolution des conflits
    budget/                 # report, disponible, reste à assigner, besoin du mois
    recurrence/             # détection, signatures, rapprochement
    forecast/               # estimateurs, projection, alertes
    dette/                  # amortissement canadien, échéancier, plan de remboursement
    objectif/               # progression, statut, valeur future
    patrimoine/             # valeur nette, allocation, droits de cotisation
    scenario/               # résolution d'une surcouche what-if sur le modèle réel
  server/
    db.ts                   # client Prisma (singleton)
    repositories/           # SEUL endroit qui parle à Prisma
    actions/
      define-action.ts      # wrapper zod + ActionResult
      <domaine>.ts
  features/                 # par domaine métier : composants + hooks + schémas
    transactions/ budgets/ forecast/ categories/ accounts/ etiquettes/ payees/ regles/ import-filters/ import/ reports/
  components/
    ui/                     # shadcn — ne pas modifier depuis le code métier
  lib/
    query-keys.ts           # fabrique de clés TanStack Query
    utils.ts                # cn() et rien d'autre
prisma/
  schema.prisma             # 39 modèles
  seed.ts                   # jeu de données synthétique (voir §12)
  coherence.test.ts         # les cinq vérifications du modèle d'enveloppes
  test/                     # isolation de la base des tests (schéma test)
docs/                       # spécifications — lis-les avant de coder
```

### Les règles de couches

1. `domain/` n'importe **rien** du projet en dehors de `domain/`. Si une fonction du domaine a besoin de données, on les lui passe en argument.
2. `server/repositories/` est la seule frontière avec Prisma. Une action orchestre, elle ne requête pas.
3. `features/` importe `domain/` et les actions. Jamais `server/repositories/` directement.
4. `app/` compose des composants de `features/`. Une page contient de la mise en page, pas de la logique.
5. `components/ui/` appartient à shadcn. On le modifie pour ajuster le design system, jamais pour un besoin d'un écran particulier — dans ce cas on compose par-dessus.

---

## 5. Composants serveur et client

Le défaut est **Server Component**. `"use client"` se met le plus bas possible dans l'arbre, sur le composant qui a réellement besoin d'interactivité — pas en haut d'une page.

- Ne mets jamais `"use client"` sur un `layout.tsx` ou un `page.tsx` par confort.
- Un composant qui n'a ni état, ni effet, ni gestionnaire d'événement, ni hook n'a rien à faire côté client.
- Ne récupère jamais de données avec `useEffect`. Soit c'est un Server Component qui lit directement, soit c'est TanStack Query.
- Utilise `loading.tsx` et `<Suspense>` pour le streaming plutôt qu'un état `isLoading` global.
- `next/font` pour les polices, `next/image` pour les images. Jamais de `<link>` vers Google Fonts en dur.

### React 19.2

- `ref` est une prop normale : **pas de `forwardRef`** dans le code neuf. (Les composants shadcn existants peuvent encore en utiliser, c'est sans conséquence.)
- `useActionState` pour un formulaire branché sur une Server Action, `useOptimistic` pour une mise à jour optimiste.
- Pas de `React.FC`. On type les props directement.
- Jamais l'index comme `key` dans une liste qui peut être réordonnée, filtrée ou triée.
- `useEffectEvent` existe pour extraire la logique non réactive d'un effet — utile, mais un effet reste un dernier recours.

---

## 6. Server Actions — le contrat

Une Server Action est un **point d'entrée HTTP public**. Elle est appelable par n'importe qui, avec n'importe quoi.

```ts
// src/server/actions/define-action.ts
export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: ErrorCode; message: string; details?: unknown }

export type ErrorCode =
  | "VALIDATION" | "NOT_FOUND" | "DUPLICATE" | "CONFLICT" | "FORBIDDEN" | "UNKNOWN"
```

Règles :

1. Toute action passe par `defineAction(schema, handler)` : validation zod à l'entrée, `ActionResult` en sortie.
2. **Ne lève jamais une erreur métier.** Next.js remplace le message par un texte générique en production ; tu perdrais tous les messages soignés. Les seules exceptions sont les erreurs vraiment inattendues, qui remontent en `UNKNOWN` avec un log serveur.
3. Vérifie toujours l'appartenance : un identifiant venu du client ne prouve rien. Filtre systématiquement sur `ownerId`.
4. Une action fait une chose. Si elle doit écrire dans plusieurs tables pour rester cohérente, elle utilise `prisma.$transaction`.
5. Côté client, le hook lève à partir de `result.message` pour que TanStack Query passe en `onError`. Le comportement est alors identique en dev et en production.
6. **Un fichier `"use server"` n'exporte que des fonctions asynchrones** — les actions produites par `defineAction` et `defineActionProprietaire` en sont. Une constante, un objet ou un schéma zod exporté depuis un tel fichier fait échouer le build ou l'exécution (« Only async functions are allowed to be exported in a "use server" file »), et entraîne avec lui les autres exportations du module. Les schémas vont dans `features/<domaine>/schema.ts`, les constantes dans un module voisin sans directive (modèle : `src/server/actions/rules-constantes.ts`). Les exportations de **types** (`export type`, `export interface`, `export type { … } from`) sont tolérées : elles disparaissent à la compilation.

---

## 7. Prisma et PostgreSQL

- Client en singleton (`src/server/db.ts`) pour survivre au rechargement à chaud du dev.
- **`select` plutôt que `include`** par défaut. Ne ramène jamais une relation dont l'écran n'a pas besoin : c'est l'erreur qui a plombé la v1 (`GetAccounts` chargeait toutes les transactions de tous les comptes).
- Jamais de `findMany` sans borne sur une table qui grandit. Pagination par curseur au-delà de quelques centaines de lignes.
- Pas de N+1 : une requête qui joint, pas une boucle de requêtes.
- Les agrégats se calculent par `groupBy` ou par SQL brut. **Aucune table d'agrégat dénormalisée** — c'est un défaut corrigé de la v1, ne le réintroduis pas.
- Migrations : `prisma migrate dev` en développement, `prisma migrate deploy` en déploiement. Une migration se relit avant d'être appliquée.
- Utilise ce que PostgreSQL apporte quand c'est justifié : `percentile_cont` pour la médiane et les quartiles de la prévision, `generate_series` pour les grilles de mois sans trous, les fonctions de fenêtrage pour les intervalles entre occurrences, `pg_trgm` pour le regroupement par similarité, `ON CONFLICT` pour l'idempotence des imports. Ne rapatrie pas dix-huit mois d'historique en mémoire pour calculer une médiane.

---

## 8. TanStack Query

- Syntaxe objet uniquement (v5). Sur une mutation, l'état d'attente est `isPending`, pas `isLoading`.
- Toutes les clés viennent de `lib/query-keys.ts`. Jamais de tableau littéral écrit à la main dans un composant.
- **Sépare lecture et écriture** : `useAccounts()` (query) et `useAccountMutations()` (mutations) sont deux hooks distincts. Un composant de cellule de tableau n'importe que le premier — sinon on instancie des centaines de mutations inutiles, autre défaut corrigé de la v1.
- `staleTime` configuré sur le `QueryClient` (5 minutes par défaut) et `refetchOnWindowFocus: false`.
- Dans un `onSuccess`, **retourne** l'`invalidateQueries` pour que la mutation reste en attente jusqu'au rafraîchissement.
- Les `ReactQueryDevtools` sont chargés par `next/dynamic` et seulement hors production.

---

## 9. Formulaires

- react-hook-form + `zodResolver`, avec le **même schéma zod** que celui utilisé par la Server Action. Un seul schéma, dans `features/<domaine>/schema.ts` ou `domain/`.
- **Chaque champ a son `<FormMessage />`.** Un formulaire qui ne fait rien au clic sans expliquer pourquoi est un bug (encore un de la v1).
- Un seul `onSubmit`, branché sur `form.handleSubmit`. Pas de bouton hors du `<form>` qui rappelle `handleSubmit` en parallèle.
- Pas de double état : si react-hook-form détient la valeur, le parent ne la détient pas aussi.
- Vérifie la version de zod installée avant de copier un exemple : les API d'erreurs et de `coerce` diffèrent entre la v3 et la v4.
- Un champ dont la pertinence dépend d'un autre champ est remis à son état neutre quand le maître change — valeur ET erreurs de validation. Sinon une saisie invalide sur un champ devenu invisible ou désactivé bloque la soumission sans qu'aucun `<FormMessage />` ne soit visible. Ce qui devait être effacé se dit à l'utilisateur, et se calcule avant la remise à zéro.

---

## 10. UI, Tailwind et shadcn

- Tailwind v4 : la configuration est **dans le CSS** (`@theme`), pas dans un `tailwind.config.ts`. Les composants shadcn sont installés par la CLI v2.
- Les composants s'ajoutent avec `npx shadcn@latest add <composant>` — on ne les écrit pas à la main.
- Utilise `cn()` pour composer les classes.
- Tokens de couleur uniquement, jamais de couleur en dur dans un composant métier.

### Palette

| Rôle | Valeur |
|---|---|
| Identité, logo | dégradé ambre `#fbbf24` → `#f97316` |
| Accent, signaux de budget | ambre `#f59e0b` |
| Sorties d'argent, dépassements | rouge `#dc2626` |
| Entrées d'argent | vert `#16a34a` |
| Neutres | l'échelle zinc de shadcn (teinte 240) |
| Rayon | `--radius: 0.5rem` |

- Interface : **Instrument Sans**. Montants : **IBM Plex Mono** avec `font-variant-numeric: tabular-nums` — obligatoire partout où des chiffres s'alignent en colonne.
- Icônes : lucide-react uniquement. Jamais d'emoji dans l'interface.
- Navigation : **barre horizontale en haut** plus une barre secondaire de période persistante. **Pas de barre latérale**, y compris dans les Paramètres qui utilisent des onglets secondaires.
  À terme, huit onglets : Accueil · Transactions · Budgets · Prévision · Objectifs · Patrimoine · Rapports · Paramètres. La coquille de M0 en porte six ; Objectifs et Patrimoine s'ajoutent avec M6–M7 et peuvent partager un onglet au départ.
- Cible bureau **et** mobile. Les tableaux denses doivent avoir une déclinaison mobile pensée, pas un défilement horizontal subi.
- Thème clair et sombre, tous deux traités.

---

## 11. Argent, dates et locale

```ts
// domain/money.ts — le seul endroit où on manipule des montants
export type Cents = number            // entier signé : négatif = sortie

export function parseAmount(texte: string): Cents
export function formatAmount(c: Cents, arrondi: "CENTS" | "DOLLARS"): string
```

- Un montant qui traverse une frontière (base, action, JSON) est **toujours** en cents.
  - **Exception assumée, côté formulaire** : un champ de saisie de montant transmet la **chaîne** saisie jusqu'à la Server Action, qui la convertit par le `transform` du schéma zod partagé. C'est ce qui permet de distinguer un champ vide d'une saisie illisible, et de revalider côté serveur le texte exact que l'utilisateur a tapé plutôt qu'un nombre en lequel il faudrait avoir confiance. Dès la frontière serveur franchie, tout est en cents : repositories, domaine et base n'en voient jamais rien d'autre.
- Le formatage passe par `Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD" })`.
- Les dates s'affichent en `fr-CA`. Jamais `"en-US"`.
- Une date de transaction est une date civile : pas d'heure, pas de fuseau. Ne construis jamais une date de transaction avec `new Date()` sans passer par `domain/dates.ts`.
- Toute l'interface est en français, avec les conventions québécoises (espace avant le `$`, virgule décimale).

---

## 12. Tests

- **Vitest sur `domain/` dès la première ligne.** C'est là que les bugs coûtent de l'argent et c'est trivialement testable.
- Priorités, dans l'ordre : le parser de relevés (avec des extraits réels anonymisés en fixtures), la conversion des montants, la résolution des règles de catégorisation, **le report en cascade**, l'amortissement en convention canadienne, la détection de récurrences, les estimateurs et la projection de la prévision.
- Cas à couvrir pour la prévision : un poste stable, un poste avec une valeur aberrante, un poste né il y a deux mois, un compte qui passe sous le seuil.
- Le **seed synthétique** (`prisma/seed.ts`) produit dix-huit mois de données sur **huit comptes** (chèque, épargne, Visa, marge, CELIAPP, REER, maison, hypothèque), une vingtaine de sous-catégories et plusieurs centaines de transactions, avec de vraies récurrences, des virements, des ventilations, des allocations, des cibles, des mouvements entre enveloppes, des règles en conflit, des objectifs, un plan de dette et un scénario. Il est **déterministe** (générateur pseudo-aléatoire à graine fixe) pour servir aussi de jeu de tests reproductible.
- `prisma/coherence.test.ts` vérifie les cinq invariants du modèle d'enveloppes (symétrie des virements, somme des lignes filles, `disponible = report + assigné + activité`, allocations bornées par les revenus, exclusion des virements et parents ventilés de l'activité). **Ces tests ne se contournent pas** : s'ils cassent, c'est le modèle qui est en cause, pas eux.
- Les tests Vitest tournent dans le schéma `test` de la base de dev, jamais dans `public` : `vitest.config.mts` dérive l'URL de `DATABASE_URL` et le `globalSetup` applique les migrations puis le seed à chaque lancement. Pas besoin de `npm run seed` avant les tests ; un test d'intégration qui écrit nettoie quand même ce qu'il crée (le schéma est partagé par les fichiers qui tournent en parallèle).
- Tout lancement de Vitest, même limité à `src/domain`, prépare le schéma `test` : une base joignable est requise et la préparation prend environ 6 s.
- Tout futur projet Vitest (`test.projects`) doit porter `extends: true`, sinon `env`, `globalSetup` et `setupFiles` de `vitest.config.mts` ne s'y appliquent pas et les tests visent la base de dev.
- Les fichiers `prisma/test/environnement.mts` et `url-base-de-test.mts` ont l'extension `.mts` et s'importent avec leur extension (`allowImportingTsExtensions`) : le chargeur natif de la config Vite ne résout pas les imports sans extension.
- Parcours de bout en bout : `npm run e2e` (Playwright, Chromium, projet `bureau` 1280 px seulement depuis le 2026-10-08 ; le projet `mobile` 375 px est conservé pour M9 et ne se lance que nommé, `npm run e2e -- --project=mobile`) contre le schéma `e2e` de `budgapp_dev`, préparé (migrations + seed) à chaque lancement, sur un serveur `next build` + `next start` dans `.next-e2e`, port 3100 ; jamais par `npx playwright test` directement. Non inclus dans `npm run check` (durée mesurée : 202 à 217 s) : lancé à chaque PASSE. Mode passe : `npm run e2e:passe` (qui pose `BUDGAPP_E2E_CAPTURES=1` lui-même : les agents ne peuvent pas préfixer une commande par une variable) capture chaque point d'examen en clair et en sombre dans `captures-e2e/` (`-- --ecrans=import,transactions` limite les captures aux contextes dont le nom contient l'un des motifs) (non suivi, vidé à chaque lancement en mode passe, index `captures-e2e/index.md`) ; le contrôle de hauteur des dialogues, lui, tourne dans les deux modes.
- Tests sur données réelles : dans le dépôt privé, `npm run test:reel` passe chaque copier-coller AccèsD réel dans `analyserReleve` puis `preparerRevue`, en mémoire, sans base (rejets visibles, total, empreintes en double, recollage, chevauchement des mois), puis compare août 2026 aux relevés PDF du même compte. Il dépend de fichiers jamais commités : le script et ses dépendances sont absents de la copie publique, et les mentions de `test:reel` dans `docs/pilotage/` relèvent de l'historique.
- Avant de pousser : `npm run check` (`next typegen`, lint, `tsc --noEmit`, `vitest run`, `next build`), que le hook `pre-push` lance de toute façon. Le dépôt privé n'a pas de CI : c'est toi qui garantis que ça passe. La copie publique lance la même commande dans `.github/workflows/ci.yml`.

---

## 13. Nommage et style

- Composants et types en `PascalCase`, fonctions et variables en `camelCase`, fichiers de composants en `PascalCase.tsx`, autres fichiers en `kebab-case.ts`.
- Les composants de route (`page.tsx`, `layout.tsx`) exportent une fonction nommée en `PascalCase`, pas `function page()`.
- Le vocabulaire métier est **en français** dans le code : `montantCents`, `sousCategorie`, `echeance`, `rapprochement`. Les termes techniques restent en anglais. Ne mélange pas au sein d'un même concept.
- Commentaires : uniquement pour expliquer un *pourquoi* non évident. Pas de commentaire qui paraphrase le code.
- Un commentaire ne cite jamais `.pipeline/` : ces fichiers sont éphémères et non suivis. Il cite la section de `docs/` qui fait foi (`docs/lot-mN.md` §X, journal d'`INDEX.md` daté), ou rien. Garde-fou : `scripts/garde-renvois-pipeline.test.ts`.
- Pas de `console.log` dans le code livré.

---

## 14. Git — le cycle de vie

### Les branches

`main` est **toujours verte** : chaque commit qui s'y trouve compile, lint et passe les tests. On n'y travaille pas directement.

Une branche par lot, nommée d'après lui : `m1-ingestion`, `m2-consultation`, `m3-recurrences`. Une seule branche de lot vit à la fois — c'est un projet solo, il n'y a personne à attendre.

Un commit de **documentation seule** peut aller directement sur `main` : il ne peut rien casser, et le faire passer par une branche est une cérémonie sans bénéfice.

### Le cycle complet d'un lot

```bash
# 1. Partir d'une main à jour
git switch main
git pull

# 2. Ouvrir la branche du lot
git switch -c m1-ingestion

# 3. Travailler. Commiter petit et souvent (voir plus bas).
git add src/domain/statement
git commit -m "feat(parser): analyse des relevés Desjardins avec profils d'import"

# 4. Pousser tôt — le hook pre-push lance npm run check
git push -u origin m1-ingestion

# 5. Continuer. Un push après chaque tranche terminée.
git push
```

Puis, **quand le critère de sortie du lot est atteint** et seulement là :

```bash
# 6. Ouvrir la demande de fusion sur la forge, relire le diff complet, fusionner.
#    Équivalent en ligne de commande :
git switch main
git pull
git merge --no-ff m1-ingestion -m "Merge du lot M1 — référentiel et ingestion"
git tag -a m1 -m "M1 — référentiel et ingestion"
git push origin main --follow-tags

# 7. Nettoyer
git branch -d m1-ingestion
git push origin --delete m1-ingestion
```

### Ce que Claude Code fait, et ne fait pas

> **Mode pilote (depuis le 2026-10-01).** Quand Claude Code exécute le skill `piloter` (`scripts/pilote.ps1`), il **commite, pousse et fusionne** dans le cadre de `docs/pilotage/gouvernance.md`, qui prime alors sur la liste ci-dessous. Les interdits destructeurs (force, `reset --hard`, `clean`, réécriture d'historique, `--no-verify`) restent absolus dans tous les modes. Hors mode pilote, la liste ci-dessous s'applique telle quelle.


- **Ne commite que sur demande explicite.** Jamais de commit spontané à la fin d'une tâche.
- **Ne pousse jamais** sans qu'on le lui demande.
- **Ne fusionne jamais, ne rebase jamais, ne force jamais.** La fin d'un lot est une décision humaine, prise après relecture du diff.
- **Ne travaille jamais sur `main`** — sauf pour un commit de documentation seule.
- `git reset --hard`, `git checkout -- .`, `git clean -fd`, `git push --force` : **jamais**, sous aucun prétexte, sans une demande explicite qui nomme la commande. Ces quatre-là détruisent du travail sans filet.
- La pipeline `/ship` ne commite rien, ne pousse rien, ne fusionne rien — c'est écrit dans son skill et c'est délibéré. Après un `/ship` vert : relire le diff, **puis** demander le commit.

### Les commits

*Conventional commits*, en français, avec une portée.

```
feat(import): rapprochement des occurrences récurrentes
fix(parser): montant à quatre chiffres coupé au séparateur de milliers
refactor(repositories): patron commun aux CRUD de référentiel
test(regles): conflit à priorité égale
docs(m1): spécification du lot référentiel + ingestion
chore(deps): montée de Prisma en 6.2
```

Types : `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `perf`.
Portées du projet : `import`, `parser`, `regles`, `comptes`, `categories`, `beneficiaires`, `etiquettes`, `transactions`, `budget`, `prevision`, `dette`, `objectif`, `patrimoine`, `rapports`, `schema`, `domain`, `ui`, `m0` à `m9`.

Un commit fait **une** chose et laisse l'arbre dans un état qui compile. Le corps du message explique le *pourquoi* quand il n'est pas évident — le *quoi* est déjà dans le diff. Pas d'emoji.

Si un changement touche la structure du projet, `INDEX.md` est mis à jour **dans le même commit** (§16).

### Quand `main` a bougé sous la branche

Rare en solo, mais ça arrive si un correctif urgent est parti directement sur `main` :

```bash
git switch m1-ingestion
git merge main
```

**Pas de rebase.** L'historique reste honnête, et on évite de résoudre le même conflit à chaque commit rejoué.

### Pourquoi une demande de fusion, et pourquoi `--no-ff`

La demande de fusion sur la forge n'est pas une formalité d'équipe : c'est le seul moment où le lot entier s'affiche en un seul diff relisable. C'est là qu'on voit ce qu'on a réellement construit, par opposition à ce qu'on croit avoir construit.

`--no-ff` force un commit de fusion même quand un avancement direct serait possible. Sans lui, les commits du lot se fondent dans `main` et la notion de lot disparaît ; avec lui, `git log --first-parent main` donne la liste des lots livrés, et `git revert -m 1` peut annuler un lot entier d'un geste.

### Ce qui n'est jamais commité

`.env`, `*.db`, les dumps de base, `.next/`, `node_modules/`, `.pipeline/`. Vérifie `.gitignore` avant le premier commit d'un lot.

### En cas de pépin

| Situation | Geste |
|---|---|
| Commit sur la mauvaise branche, pas encore poussé | `git reset --soft HEAD~1`, changer de branche, recommiter |
| Dernier message de commit à corriger, pas encore poussé | `git commit --amend` |
| Annuler un commit déjà poussé | `git revert <sha>` — jamais `reset` sur ce qui est parti |
| Mettre le travail en cours de côté | `git stash push -m "au milieu de la revue d'import"` puis `git stash pop` |
| Voir ce qui va partir au push | `git log origin/m1-ingestion..HEAD --stat` |
| Retrouver un commit perdu après une fausse manœuvre | `git reflog` — presque tout est récupérable pendant 90 jours |

---

## 15. Ce qu'il ne faut jamais faire

- Stocker un montant en dollars ou en flottant.
- Écrire une table d'agrégat maintenue à la main.
- Rapprocher automatiquement une transaction d'une récurrence sans que l'utilisateur puisse le voir et le défaire.
- Faire disparaître une ligne de relevé sans le signaler.
- Modifier une transaction passée pour faire coller un solde — on crée un ajustement daté.
- Mettre `"use client"` en haut d'une page pour se simplifier la vie.
- Appeler Prisma depuis un composant ou une action sans passer par un repository.
- Désactiver une règle TypeScript ou ESLint pour faire passer un build.
- Committer un secret.

---

## 16. Entretien de la documentation

`INDEX.md` est la carte du projet. **Il doit rester à jour** : dès qu'un dossier apparaît, qu'un module change de rôle ou qu'une spécification est ajoutée, mets-le à jour dans le même commit. Un index périmé est pire qu'aucun index.

Son **journal des décisions** (§5) se nourrit en cours de route : chaque décision structurante prise pendant un lot y gagne une ligne, avec sa date et son pourquoi. C'est ce qui évite de reprendre trois fois le même débat — et c'est ce qui a permis de savoir pourquoi le schéma avait été restauré par SHA plutôt que réécrit.

Même règle pour ce fichier : si une convention change en cours de route, c'est ici qu'elle se corrige, pas seulement dans le code.
