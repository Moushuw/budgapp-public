# Audit technique — Budgapp

Analyse statique complète du code (hors `node_modules`, hors `components/ui` généré par shadcn).
Périmètre lu : `app/`, `hooks/`, `lib/`, `schema/`, `types/`, `config/`, `prisma/`.

Classement : 🔴 bloquant / bug réel · 🟠 modèle de données · 🟡 performance · 🟢 refactor & nettoyage.

---

## 🔴 Bloquants et bugs fonctionnels

### 1. Le build est cassé — `app/_Aretravailler/useTransactions.ts`
Ce fichier importe quatre choses qui n'existent pas dans le projet :

```ts
import { Transaction } from "@/types/transaction";        // n'existe pas
import { SimpleTransactionParser } from "@/lib/parser";   // c'est lib/transactionParser.ts
import { api } from "@/lib/api";                          // n'existe pas
import { useFilteredTransactions } from "@/hooks/useFilteredTransactionMutations"; // export inexistant
```

Il est dans `app/`, donc il est typé et compilé : `next build` échoue.
**Fix** : le sortir de `app/` (ex. `_archive/` à la racine, ajouté à `exclude` dans `tsconfig.json`) ou le supprimer — c'est l'ancêtre de `hooks/useTransactionTemp.ts`.

### 2. Impossible de sauvegarder si une seule ligne n'est pas catégorisée
`schema/transactionsTemp.ts` :

```ts
export const PreparedTransactionSchema = z.object({
  subcategory: z.string(),   // ← requis
  ...
});
```

alors que `NewPreparedTransaction` (types/index.ts) déclare `subcategory?: string`, et que `handleParse` crée les lignes **sans** ce champ. Résultat : `PreparedTransactionsSchema.parse()` lève, et l'utilisateur reçoit `"Format des transactions invalide"` — un message qui ne dit pas quelle ligne pose problème.
Même si le champ vaut `""`, le `subcategoryMap.get("")` renvoie `undefined` et l'action lève `Sous-catégorie "" non trouvée`.

**Fix** : décider la règle (soit refuser explicitement les non-catégorisées **côté client** avec surlignage des lignes fautives, soit autoriser `subcategoryId: null` puisque la colonne Prisma est déjà nullable) et aligner le schéma dessus.

### 3. `NumberEditor` produit `NaN`
```ts
const intValue = parseInt(e.target.value, 10);
onChange(intValue);   // NaN si le champ est vidé
```
Vider le champ montant met `amount: NaN`, ce que `z.number()` refuse — la sauvegarde devient impossible et l'erreur est illisible.
**Fix** : `const v = Number.parseInt(e.target.value, 10); onChange(Number.isNaN(v) ? 0 : v);`

### 4. `DeleteFilteredTransaction` échoue en silence
```ts
} catch (error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    throw new Error("...");
  }
  // ← rien : la fonction retourne undefined
}
```
Toute erreur non-Prisma est avalée, la mutation passe en `onSuccess` et le toast annonce « supprimée » alors que rien ne l'a été. À noter que la branche fait aussi l'inverse des autres actions : elle transforme un P2025 (« n'existe plus ») en « erreur inattendue ».

### 5. Le bouton « Sauvegarder » n'est jamais désactivé
`app/(dashboard)/transactions/page.tsx` :
```ts
setSaving(true);
saveTransactions.mutate();   // asynchrone
setSaving(false);            // s'exécute immédiatement
```
`saving` repasse à `false` dans le même tick : le bouton reste cliquable pendant l'enregistrement → double-clic = double insertion.
**Fix** : supprimer l'état `saving` et utiliser `saveTransactions.isPending`.

### 6. Aucune protection contre le double import
- `Transaction` n'a **aucune contrainte d'unicité** ni clé naturelle.
- `setPreparedTransactions([])` est commenté dans `onSuccess` de `saveTransactions`.

Réimporter le même relevé duplique toutes les transactions **et** double-compte `MonthHistory` / `YearHistory` (les `upsert` font `increment`), ce qui fausse durablement les rapports.
**Fix** : vider la liste après succès, et ajouter une clé de déduplication — p. ex. `@@unique([date, description, amount, accountId])`, ou un hash de ligne stocké en colonne.

### 7. Collisions d'identifiants temporaires
```ts
function generateTempId(): number {
  return Date.now() + Math.floor(Math.random() * 1000);
}
```
Le `.map()` s'exécute dans la même milliseconde, donc `Date.now()` est constant : il ne reste que 1000 valeurs possibles. Sur 200 lignes, la probabilité d'au moins une collision est d'environ 18 % (paradoxe des anniversaires). Conséquences : clés React dupliquées, et `updateTransaction` qui modifie deux lignes à la fois.
**Fix** : un compteur (`let seq = 0; () => ++seq`) ou `crypto.randomUUID()`.

### 8. Les transactions à filtrer ne peuvent pas matcher
`CreateFilteredTransactionSchema` plafonne la description à **20 caractères**, mais le filtre compare l'égalité stricte avec la description complète issue du relevé (souvent 30 à 60 caractères) :
```ts
filteredTx.description.toLowerCase() === transaction.description.toLowerCase()
```
Une description de plus de 20 caractères ne peut donc jamais être enregistrée comme filtre. Même problème de plafond arbitraire sur les noms de comptes, catégories et mots-clés (`max(20)`).
**Fix** : relever la limite (100–200) et/ou passer le filtre en « contient » plutôt qu'en égalité stricte.

### 9. Les messages d'erreur disparaissent en production
Toutes les Server Actions communiquent par `throw new Error("message en français")`. Next.js **masque** les messages d'erreur des Server Actions en production et renvoie un texte générique avec un digest. Tout le travail de messages soignés (`Le compte "X" existe déjà`, etc.) sera perdu dès le premier `next build`.

**Fix** : renvoyer un résultat typé au lieu de lever.
```ts
type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: "DUPLICATE" | "NOT_FOUND" | "VALIDATION" | "UNKNOWN"; message: string };
```
Le hook lève alors côté client à partir de `result.message`, et le comportement dev = prod.

---

## 🟠 Modèle de données (`prisma/schema.prisma`)

### 10. Les montants perdent les cents — le point le plus grave pour une app de budget
`amount Int` stocke des **dollars entiers**, et `convertirMontant` arrondit :
```ts
if (montantNettoye.startsWith("+")) return Math.floor(Math.abs(v));
else return -Math.ceil(Math.abs(v));
```
`12,47 $` devient `13 $`. En plus, l'arrondi est asymétrique (plancher pour les entrées, plafond pour les sorties), donc le biais est systématique et va toujours dans le même sens.
**Fix** : stocker en **cents** (`Math.round(v * 100)`), garder `Int`, formater à l'affichage avec `Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD" })`. Migration à écrire (`UPDATE Transaction SET amount = amount * 100`) avant que la base ne grossisse.

### 11. URL de base en dur
```prisma
datasource db {
  provider = "sqlite"
  url      = "file:./dev.db"
}
```
Un `.env` existe déjà et le README évoque un passage à PostgreSQL. Passer à `url = env("DATABASE_URL")` maintenant coûte deux minutes.

### 12. Aucun index
`Transaction` n'a d'index sur rien. Prisma/SQLite n'indexe pas automatiquement les clés étrangères. Dès quelques milliers de lignes, tout filtre par date ou par compte fait un scan complet.
```prisma
@@index([date])
@@index([accountId])
@@index([subcategoryId])
```

### 13. `MonthHistory` n'est pas un historique mensuel
Sa clé est `[day, month, year]` : c'est un historique **journalier**. `YearHistory` est le vrai historique mensuel. Les noms induiront en erreur dès l'écriture des rapports — renommer en `DayHistory` / `MonthHistory`.

### 14. Historiques dénormalisés jamais recalculables
Les tables d'agrégat ne sont alimentées que par l'import. Toute correction, suppression ou édition ultérieure d'une transaction les désynchronise définitivement, sans moyen de les reconstruire.
**Deux options** :
- **Simple et recommandé à ce stade** : supprimer les deux tables et calculer à la lecture avec `prisma.transaction.groupBy({ by: [...], _sum: { amount: true } })`. SQLite avale sans broncher des dizaines de milliers de lignes.
- Sinon : garder les tables mais ajouter une action `RecomputeHistory()` idempotente, appelée après toute mutation.

### 15. Fuseau horaire fragile
`handleParse` reconstruit une date **locale** à partir d'une date parsée en **UTC** :
```ts
const rawDate = new Date(transaction.date);            // "2026-09-06" → UTC minuit
const date = new Date(rawDate.getUTCFullYear(), rawDate.getUTCMonth(), rawDate.getUTCDate()); // minuit local
```
puis le serveur relit avec `getUTCDate()` / `getUTCMonth()`. Ça tombe juste à Montréal (UTC-4/-5) mais décale d'un jour dès un fuseau positif — et donc si tu déploies sur un serveur en UTC+ ou que tu voyages.
**Fix** : une seule convention. Le plus robuste pour un budget : stocker la date en `String` `"YYYY-MM-DD"`, ou en `DateTime` toujours construit à midi UTC.

### 16. `getUTCMonth()` stocké tel quel
`getUTCMonth()` renvoie 0–11 : janvier est stocké comme `0`. Ce n'est pas faux, mais ce n'est documenté nulle part et c'est une source de bug garantie au moment d'écrire l'écran Rapports. Stocker 1–12, ou nommer le champ explicitement.

---

## 🟡 Performance

### 17. `GetAccounts` charge toutes les transactions de tous les comptes
```ts
return await prisma.account.findMany({
  orderBy: { name: "asc" },
  include: { transactions: true },   // ← jamais utilisé nulle part
});
```
La query `["accounts"]` alimente `AccountCard`, `DataInputForm` et chaque `AccountEditor` — aucun ne lit `transactions`. C'est la correction avec le meilleur rapport effort/gain de tout ce document : **supprimer la ligne `include`**.

### 18. N+1 d'appels serveur à la catégorisation automatique
Dans `useTransactionTemp`, `autoCategorize.onSuccess` fait :
```ts
categorizedTransactions.forEach(({ tempId, subcategoryName }) => {
  updateTransaction(tempId, "subcategory", subcategoryName);   // → un GetCategoryBySubcategoryName chacun
});
```
et `updateTransaction` déclenche un aller-retour Server Action **par transaction**. 200 lignes catégorisées = 200 requêtes réseau séquentielles.
**Fix** : `AutoCategorizeTransactions` renvoie déjà `subcategoryId` et `subcategoryName` — qu'elle renvoie aussi `categoryName` (le `include: { subcategory: true }` suffit avec un `include: { category: true }` imbriqué). Ou, encore mieux, résoudre le parent côté client depuis le cache `["categories"]` déjà chargé : zéro requête.

### 19. `SaveTransactions` : ~2N+1 requêtes dans une transaction
```ts
await prisma.$transaction([
  prisma.transaction.createMany({ data: databaseTransactions }),
  ...databaseTransactions.map(t => prisma.monthHistory.upsert({...})),   // N
  ...databaseTransactions.map(t => prisma.yearHistory.upsert({...})),    // N
]);
```
Pour un relevé de 200 lignes : 401 requêtes. Or un relevé mensuel ne touche qu'une trentaine de jours distincts et un seul mois.
**Fix** : agréger d'abord en JS (`Map` par `jour|mois|année` et par `mois|année`), puis n'émettre qu'un `upsert` par clé distincte → ~31 requêtes au lieu de 400.

### 20. Chaque cellule du tableau instancie trois mutations
`AccountEditor`, `CategoryEditor` et `SubCategoryEditor` appellent `useAccountMutations()` / `useCategoryMutations()`. Ces hooks créent **un `useQuery` + trois `useMutation`** chacun. Pour 200 lignes × 3 colonnes → 600 instances de hooks et 1800 objets mutation, pour n'utiliser que la liste en lecture.
**Fix** : séparer lecture et écriture.
```ts
// hooks/queries/useAccounts.ts   → juste le useQuery
// hooks/useAccountMutations.ts   → juste les useMutation
```
Les éditeurs n'importent que `useAccounts()`.

### 21. Aucun `staleTime` configuré
```ts
const [queryClient] = React.useState(() => new QueryClient());
```
Avec le défaut (`staleTime: 0`), chaque montage de composant abonné déclenche un refetch. Comme des centaines de `Select` montent/démontent au fil du tableau, ça génère des rafales de Server Actions.
```ts
new QueryClient({
  defaultOptions: { queries: { staleTime: 5 * 60_000, refetchOnWindowFocus: false } },
});
```

### 22. Chaque frappe re-render le tableau entier
`TextEditor.onChange` → `onUpdate` → `setPreparedTransactions` → nouvelle référence du tableau → toutes les lignes se re-rendent. Sur 200 lignes la saisie devient pâteuse.
**Fix** : état local dans l'éditeur, commit sur `onBlur` (ou debounce), et `React.memo` sur les éditeurs.

### 23. `ReactQueryDevtools` dans le bundle de production
Importé statiquement dans `RootProviders` alors que c'est une `devDependency`. Charger via `next/dynamic` derrière `process.env.NODE_ENV !== "production"`.

### 24. Micro-optimisation de `AutoCategorizeTransactions`
`keyword.keyword.toLowerCase()` est recalculé pour chaque couple (transaction × mot-clé). Pré-calculer une fois après le `findMany`.

---

## 🟢 Refactor, cohérence et nettoyage

### 25. Deux règles de matching de mots-clés qui se contredisent
- Serveur (`AutoCategorizeTransactions`) : `description.includes(keyword)` → sous-chaîne, donc « rest » matche « forest ».
- Client (`findMatchingKeywords`) : regex à frontières de mots.

Deux comportements différents pour la même fonctionnalité. Une seule implémentation, dans `lib/`, importée des deux côtés.

### 26. Injection de regex dans `findMatchingKeywords`
```ts
const pattern = new RegExp(`(^|\\s)${keywordLower}($|\\s)`);
```
Un mot-clé contenant `(`, `[`, `+`, `*` fait planter la construction de la regex. Il faut échapper — ou supprimer la fonction, qui n'est appelée nulle part (voir §29).

### 27. `types/index.ts` duplique les types Prisma
`Category` et `Subcategory` sont réécrits à la main alors que Prisma les génère. Toute évolution du schéma créera une dérive silencieuse.
```ts
import type { Prisma } from "@prisma/client";
export type CategoryWithSubs = Prisma.CategoryGetPayload<{ include: { subcategories: true } }>;
```

### 28. `lib/utils.ts` mélange trois responsabilités
Un `import { CategorizationResult } from "@/types"` est posé **au milieu du fichier**, après `formatDate`. Et `CategorizationService` est une classe sans état avec une seule méthode : une fonction pure suffit.
**Fix** : `lib/utils.ts` garde `cn` ; `lib/format.ts` prend `formatDate` (en `"fr-CA"`, pas `"en-US"` dans une app francophone) ; `lib/categorization.ts` prend `processCategorization()`.

### 29. Code mort — environ un tiers du dépôt
| Chemin | Volume | État |
|---|---|---|
| `components/data-table/` + `lib/data-table.ts` + `config/data-table.ts` | ~1 900 lignes | jamais importé (template shadcn non utilisé) |
| `backup_parametres/` | 18 fichiers | copie obsolète de `parametres/` |
| `app/_Aretravailler/useTransactions.ts` | 175 lignes | casse le build (§1) |
| `PreparedTransaction` (types/index.ts) | — | jamais utilisé |
| `AutoCategorizationSchema`, `UpdateTransactionSchema`, `SaveTransactionSchema`, `SaveTransactionsSchema`, `MoveSubcategorySchema`, `GetCategoriesSchema` | — | jamais utilisés |
| `findMatchingKeywords` (useKeywordMutations) | — | jamais appelé |

Ironie de la liste : `MoveSubcategorySchema` existe, mais `MoveSubcategory` est **la seule Server Action sans validation Zod** — elle accepte un objet brut. Brancher le schéma existant.

### 30. Les cinq fichiers d'actions CRUD sont le même code copié cinq fois
`accounts.ts`, `categories.ts`, `subcategories.ts`, `keywords.ts`, `filteredTransactions.ts` répètent tous la même structure : `safeParse` → `try` → `catch` → cascade de `if (error.code === "P2002" | "P2003" | "P2025")`.

Deux helpers suppriment environ 60 % du volume :
```ts
// lib/actions.ts
export function prismaError(error: unknown, messages: Partial<Record<"P2002"|"P2003"|"P2025", string>>, fallback: string) { ... }
export function action<S extends z.ZodType, R>(schema: S, fn: (data: z.infer<S>) => Promise<R>) { ... }
```

### 31. Schémas `Get*Schema = z.object({})`
Quatre fichiers portent un schéma vide, un type dérivé, un paramètre optionnel et un `safeParse(form ?? {})` qui ne peut jamais échouer — une quinzaine de lignes de cérémonie pure. À supprimer.

### 32. Double endpoint pour `GetAccounts`
`parametres/_actions/accounts.ts` fait `export { GetAccounts }` depuis `_actions/accounts.ts`. Dans un fichier `"use server"`, un réexport crée un **second endpoint** pour la même fonction. Importer directement depuis la source. Idem pour `GetCategories`.

### 33. `console.log("useMutation")` × 6
Dont deux **côté serveur** dans `parametres/_actions/accounts.ts`. Restes de débogage.

### 34. Deux classes Tailwind invalides dans `Navbar`
```tsx
<nav className="container flex items-center justifiy-between px-8">   // typo → justify-between
<div className="flex h-[80px] min-h[60px] items-center gap-x-4">      // manque le tiret → min-h-[60px]
```
La première explique pourquoi le sélecteur de thème n'est pas poussé à droite.

### 35. `SkeletonWrapper` casse le HTML du tableau
Dans `TransactionTable`, il est placé **entre `<Table>` et `<TableBody>`** : quand `loading` est vrai, un `<div>` se retrouve enfant direct de `<table>`. HTML invalide → avertissements d'hydratation et rendu imprévisible.
**Fix** : envelopper le `<Table>` entier, ou rendre des `<TableRow>` squelettes.

### 36. Double état pour le textarea
`TransactionsPage` détient `rawData` (`useState`), le passe à `DataInputForm`, qui l'impose au champ react-hook-form :
```tsx
{...field}
value={rawData}
onChange={(e) => { field.onChange(e); onDataChange(e.target.value); }}
```
La même donnée est stockée deux fois, et la valeur du parent n'est **utilisée nulle part** (`handleParse` lit les valeurs du formulaire). Chaque frappe re-render toute la page.
**Fix** : supprimer `rawData` / `onDataChange`, react-hook-form suffit.

### 37. `DataInputForm` n'affiche aucune erreur de validation
Aucun `<FormMessage />` sur les trois champs. Si aucun compte n'est sélectionné, le clic sur « Importer » ne fait strictement rien, sans explication.

### 38. Les lignes non reconnues par le parser sont jetées en silence
`extractionTransactions` ne garde que les lignes qui matchent **à la fois** la date et le montant. Le reste disparaît sans avertissement. Et la regex de montant exige des décimales :
```ts
/([+−-]?\d*\s?\d+[,.]?\d+)\s*\$(?!\S)/
```
donc `12 $` est ignoré. Par ailleurs `MOIS_FRANCAIS` n'accepte que les mois accentués en toutes lettres — pas `janv.`, pas `decembre` sans accent.
**Fix** : compter les lignes rejetées et les remonter à l'utilisateur (« 43 lignes importées, 2 non reconnues »), avec la possibilité de les voir.

### 39. `any` non typés
5 occurrences sur le chemin `onUpdate` / `updateTransaction`. Une union discriminée sur `field` rendrait la signature sûre :
```ts
type FieldUpdate =
  | { field: "date"; value: Date }
  | { field: "amount"; value: number }
  | { field: "description" | "details" | "subcategory" | "category" | "account"; value: string };
```

### 40. Conventions et divers
- `page`, `layout`, `loading` en minuscules comme noms de composants → PascalCase.
- `app/(dashboard)/page.tsx` et `loading.tsx` renvoient encore `<div>page</div>` / `<div>loading</div>`.
- `invalidateQueries()` n'est pas retourné dans les `onSuccess` : la mutation se termine avant le refetch, l'UI clignote sur les vieilles données. `return queryClient.invalidateQueries(...)`.
- Clés de query en chaînes libres (`["accounts"]`, `["categories"]`…) : une petite fabrique `queryKeys.accounts.all` évite les fautes de frappe silencieuses.
- `app/layout.tsx` : `<head />` vide inutile, et pas de `next/font` (les polices se chargent en cascade).
- `next.config.ts` vide.
- Aucun test. `SimpleTransactionParser.parse` et `convertirMontant` sont les deux endroits où un bug coûte de l'argent et sont triviaux à tester — c'est là qu'il faut commencer.
- **Sécurité** : toutes les Server Actions sont des endpoints HTTP publics non authentifiés. Sans conséquence en local mono-utilisateur, à traiter avant toute exposition réseau (même sur le LAN).

---

## Plan d'action suggéré

**Étape 1 — débloquer (30 min)**
1. Sortir `app/_Aretravailler/` de `app/` → le build repasse (§1).
2. Supprimer `components/data-table/`, `lib/data-table.ts`, `config/data-table.ts`, `backup_parametres/` (§29).
3. Supprimer les six `console.log` (§33).
4. Corriger `justifiy-between` et `min-h[60px]` (§34).
5. Supprimer `include: { transactions: true }` de `GetAccounts` (§17).

**Étape 2 — bugs qui mordent (2–3 h)**
6. `NumberEditor` / `NaN` (§3), `DeleteFilteredTransaction` (§4), bouton Sauvegarder (§5), `generateTempId` (§7).
7. Vider `preparedTransactions` après succès + contrainte d'unicité (§6).
8. Aligner `PreparedTransactionSchema` sur la réalité des données (§2).
9. Relever les `max(20)` (§8).

**Étape 3 — modèle de données, tant que la base est petite (1/2 journée)**
10. Migrer `amount` en cents (§10).
11. `url = env("DATABASE_URL")` (§11), index sur `Transaction` (§12).
12. Trancher sur les tables d'historique : les supprimer au profit d'un `groupBy`, ou ajouter un recalcul (§14).
13. Fixer la convention de date (§15, §16).

**Étape 4 — architecture (1 journée)**
14. `ActionResult` typé au lieu de `throw` (§9) + helpers `action()` / `prismaError()` (§30).
15. Séparer hooks de lecture et hooks de mutation (§20), `staleTime` (§21).
16. Une seule implémentation du matching de mots-clés, dans `lib/` (§25, §26).
17. Supprimer le N+1 de la catégorisation (§18) et agréger les upserts (§19).
18. Types dérivés de Prisma (§27), nettoyage de `lib/utils.ts` (§28).

**Étape 5 — filet de sécurité**
19. Tests unitaires sur le parser et la conversion de montants (§40).
20. Remonter les lignes rejetées à l'import (§38).

---

## Note de vérification

`npx tsc --noEmit` a été lancé mais n'a pas pu aboutir : le projet est monté à travers le pont vers ta machine et le typecheck n'a pas terminé en plus de quinze minutes sur ce montage. Les constats ci-dessus viennent donc d'une lecture statique du code, avec vérification manuelle des points vérifiables (existence des fichiers importés, recherche des références pour le code mort). Lance `npx tsc --noEmit` et `npm run lint` en local pour la liste exhaustive des erreurs de type — le §1 en produira au minimum quatre.
