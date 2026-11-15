# BudgApp v1 — description fonctionnelle

État du code du **v1** au 6 septembre 2026. Document descriptif : il décrit ce que l'ancienne application **faisait**, pas ce que la v2 doit faire.

> Pourquoi ce document survit à l'abandon du v1 : il contient les **règles exactes du parser de relevés** (§5.2) et de la catégorisation (§5.5), qui sont portées telles quelles dans la v2. C'est la référence à lire avant d'écrire `domain/statement/`.

---

## 1. En une phrase

Outil de budget personnel, mono-utilisateur, local, qui transforme un copier-coller de relevé bancaire francophone en transactions catégorisées et stockées, à partir d'un référentiel de comptes, catégories, sous-catégories et mots-clés que l'utilisateur maintient lui-même.

## 2. Stack et volumétrie

| | |
|---|---|
| Framework | Next.js 15.1.7, App Router, React 19, TypeScript `strict` |
| Base | Prisma 6 + SQLite (`prisma/dev.db`) |
| Couche API | Server Actions uniquement — aucun route handler, aucune API REST |
| État client | TanStack Query v5 |
| Formulaires | react-hook-form + zod (`@hookform/resolvers`) |
| UI | Tailwind 3 + shadcn/ui (48 composants), lucide-react, sonner (toasts) |
| Glisser-déposer | `@hello-pangea/dnd` |
| Code utile | ~2 900 lignes (hors `components/ui` généré et hors code mort) |
| Données en base | 4 comptes, 4 catégories, 7 sous-catégories, 12 mots-clés, 5 filtres, 26 transactions — c'est un jeu de test |

## 3. Modèle de données

Huit tables, aucune notion d'utilisateur.

**`Account`** — un compte bancaire ou une carte. `name` unique. Aucun solde, aucun type, aucune devise.

**`Category`** — catégorie de dépense. `name` unique. Supprimer une catégorie supprime en cascade ses sous-catégories.

**`Subcategory`** — rattachée à une catégorie. `name` unique **globalement** : deux catégories ne peuvent pas avoir une sous-catégorie du même nom. Pas de champ d'ordre.

**`Keyword`** — un mot-clé (unique) qui pointe vers **une** sous-catégorie. Suppression restreinte : on ne peut pas supprimer une sous-catégorie encore référencée par un mot-clé.

**`FilteredTransaction`** — une description à ignorer systématiquement à l'import. `description` unique.

**`Transaction`** — `date`, `description`, `details` (optionnel), `amount` (entier), plus deux clés étrangères **nullables** vers `Subcategory` et `Account`, toutes deux en `ON DELETE SET NULL`. Supprimer un compte ne supprime donc pas ses transactions : elles restent, orphelines.

**`MonthHistory`** — agrégat de clé `(day, month, year)` avec `income` et `expense`. Malgré son nom, c'est un historique **journalier**.

**`YearHistory`** — agrégat de clé `(month, year)` avec `income` et `expense`. C'est le vrai historique mensuel.

Les deux tables d'agrégat ne sont alimentées qu'au moment de l'import ; rien ne les recalcule.

## 4. Navigation

Quatre routes sous un layout commun (barre de navigation + bascule de thème clair / sombre / système) :

| Route | État |
|---|---|
| `/` Accueil | **coquille vide** — rend `<div>page</div>` |
| `/transactions` | l'écran réel, c'est là que tout se passe |
| `/rapports` | **coquille vide** — rend `<div>Rapports</div>` |
| `/parametres` | gestion du référentiel |

---

## 5. Écran Transactions — le cœur de l'application

Tout ce qui suit se passe **en mémoire** : rien n'est écrit en base avant le clic sur « Sauvegarder ».

### 5.1 Formulaire d'import

- **Année** : les 5 dernières années, par défaut l'année courante. Elle sert à compléter les dates du relevé, qui ne contiennent que le jour et le mois.
- **Compte** : liste des comptes en base. Il sera appliqué à toutes les lignes importées.
- **Données bancaires** : un textarea où l'on colle le relevé brut.
- Bouton **Importer**.
- Deux boutons annexes : **Ajouter une transaction à filtrer** et **Ajouter un mot-clé**.

### 5.2 Le parsing — règles exactes

`lib/transactionParser.ts`, classe `SimpleTransactionParser`.

**Nettoyage préalable du texte collé**

1. suppression de tout ce qui suit « Total » sur chaque ligne concernée
2. tabulations converties en sauts de ligne
3. lignes vides consécutives compressées

**Sélection des lignes** — une ligne n'est retenue que si elle contient **à la fois** :

- une date en début de ligne : `^(\d{1,2})\s+(janvier|février|mars|…|décembre)`, insensible à la casse ;
- un montant : `([+−-]?\d*\s?\d+[,.]?\d+)\s*\$` non suivi d'un caractère non-espace.

**Conversion**

- *Date* → `AAAA-MM-JJ`, l'année venant du formulaire. Un mois non reconnu retombe silencieusement sur `01`.
- *Montant* → espaces supprimés, virgule remplacée par un point, signe moins typographique `−` normalisé, `$` retiré. Puis :
  - le montant commence par `+` → **entrée d'argent**, valeur `Math.floor(|v|)`, positive ;
  - sinon → **sortie d'argent**, valeur `-Math.ceil(|v|)`, négative.
- *Description* → la ligne, moins la date, moins le montant.

Le signe `+` explicite est donc le **seul** marqueur d'une entrée d'argent. Et les cents sont perdus dès cette étape.

Toute ligne non retenue est écartée **sans aucun message**.

> **Ce que la v2 change** : les cents sont conservés (`domain/money.ts`), une ligne non reconnue atterrit dans un panneau visible, la règle du signe devient un paramètre du profil d'import, et un montant illisible retourne `null` au lieu de `NaN`. La reconnaissance des lignes, elle, est portée telle quelle.

### 5.3 Filtrage

Chaque ligne parsée dont la description en minuscules est **strictement égale** à une `FilteredTransaction` est écartée. Le toast final annonce « N transactions importées et M filtrées ». Si tout est filtré, le message devient « Toutes les transactions ont été filtrées ».

### 5.4 Tableau d'édition

Sept colonnes, toutes éditables directement dans la cellule. Chaque en-tête ouvre un menu de tri (croissant / décroissant / réinitialiser).

| Colonne | Éditeur | Particularité |
|---|---|---|
| **Date** | popover calendrier (locale française) | affichage `jj/MM/aaaa` |
| **Description** | champ texte requis | **pastille rouge** en haut à droite quand la catégorisation automatique a trouvé plusieurs mots-clés concurrents — elle affiche leur nombre |
| **Détails** | champ texte libre | optionnel, jamais rempli automatiquement |
| **Montant** | champ nombre, suffixe `$` | entier |
| **Sous-catégorie** | select | la liste est restreinte aux sous-catégories de la catégorie de la ligne si elle est définie, sinon toutes ; choisir une sous-catégorie **remplit automatiquement la catégorie parente** |
| **Catégorie** | select | toutes les catégories |
| **Compte** | select | pré-rempli avec le compte du formulaire d'import |

### 5.5 Catégorisation automatique — bouton « Catégoriser »

Côté serveur, `AutoCategorizeTransactions` charge tous les mots-clés avec leur sous-catégorie, puis pour chaque ligne préparée retient les mots-clés dont le texte est **contenu** dans la description (recherche de sous-chaîne, insensible à la casse — « rest » matche donc « forest »).

Côté client, le résultat est trié en trois cas :

| Nombre de mots-clés trouvés | Comportement |
|---|---|
| exactement 1 | la sous-catégorie est appliquée, et la catégorie parente est résolue par un appel serveur |
| 2 ou plus | **rien n'est appliqué** — le nombre s'affiche en pastille rouge sur la description, l'arbitrage est laissé à l'utilisateur |
| 0 | la ligne reste non catégorisée |

Toast final : « N transactions catégorisées automatiquement ».

> **Ce que la v2 garde** : la règle des trois cas, y compris « conflit = on ne tranche pas, on signale ». **Ce qu'elle change** : le mode de correspondance devient explicite (contient / mot entier / regex), une priorité départage quand on le veut, et la catégorie parente est résolue côté client au lieu d'un appel serveur par ligne.

### 5.6 Sauvegarde — bouton « Sauvegarder »

`SaveTransactions`, en une transaction Prisma :

1. validation zod de toutes les lignes ;
2. résolution des **noms** de compte et de sous-catégorie en identifiants, via deux `findMany` et deux `Map` ;
3. `createMany` de toutes les transactions ;
4. un `upsert` par transaction dans `MonthHistory` (clé jour + mois + année, en `increment`) ;
5. un `upsert` par transaction dans `YearHistory` (clé mois + année, en `increment`).

`income` reçoit le montant s'il est positif, `expense` s'il est négatif — `expense` est donc stocké en **valeur négative**.

La liste affichée n'est pas vidée après succès.

### 5.7 Dialogues annexes

- **Ajouter une transaction à filtrer** — une description à ignorer désormais à l'import.
- **Ajouter un mot-clé** — un mot-clé et la sous-catégorie cible, choisie dans une liste groupée par catégorie.

---

## 6. Écran Paramètres

### Comptes

Grille de cartes. Création par dialogue, renommage en place (icône crayon → champ inline avec validation / annulation), suppression avec confirmation. Chaque carte affiche « Solde ou autre à venir... » — placeholder assumé.

### Catégories

Grille de cartes. Chaque carte porte : le nom, le compteur de sous-catégories, le renommage en place, la suppression (avec avertissement explicite que les sous-catégories liées partiront aussi), la liste des sous-catégories et un bouton d'ajout inline. Chaque sous-catégorie a son propre renommage en place et sa suppression.

### Glisser-déposer

Une sous-catégorie se déplace d'une carte catégorie vers une autre. Un déplacement à l'intérieur de la même catégorie ne fait rien : il n'existe aucune notion d'ordre.

---

## 7. Règles métier implicites

Celles qui ne sont écrites nulle part mais que le code impose :

- Un montant est toujours un **entier de dollars**. Les cents n'existent pas dans le système.
- Une entrée d'argent est identifiée **uniquement** par un `+` explicite dans le relevé.
- Un nom de sous-catégorie est unique dans toute la base, pas seulement au sein de sa catégorie.
- Un mot-clé ne pointe que vers une sous-catégorie, et le même mot-clé ne peut pas être défini deux fois.
- Un conflit de mots-clés n'est **jamais** tranché automatiquement.
- Supprimer un compte ou une sous-catégorie laisse les transactions en place, avec une référence nulle.
- Il n'existe ni utilisateur, ni devise, ni budget prévisionnel, ni solde, ni récurrence, ni virement entre comptes.

La v2 corrige les six premières et ajoute ce que la septième listait comme absent — voir `docs/plan.md` §4.1.

---

## 8. Ce qui manquait

- **Accueil** et **Rapports** sont des coquilles vides — alors que les deux tables d'agrégat n'existent que pour les alimenter.
- **Aucun écran ne montre les transactions déjà enregistrées.** Le tableau de `/transactions` n'affiche que le lot en cours d'import. Une fois sauvegardée, une transaction n'est plus consultable ni modifiable depuis l'application : il faut passer par `npx prisma studio`. C'est le manque fonctionnel le plus important.
- **Aucune gestion des mots-clés et des filtres existants.** On peut seulement en créer. Les actions serveur `UpdateKeyword`, `DeleteKeyword`, `UpdateFilteredTransaction`, `DeleteFilteredTransaction` et leurs mutations React Query existent, mais aucune interface ne les appelle.
- Pas de solde de compte, pas de budget cible, pas d'export, pas d'import de fichier (CSV / OFX) — uniquement le copier-coller.

---

## 9. Le flux complet, de bout en bout

```
Paramètres : créer comptes, catégories, sous-catégories
     ↓
Transactions : créer les mots-clés et les descriptions à filtrer
     ↓
Coller le relevé + choisir année et compte  →  Importer
     ↓
Parsing (date + montant + description)  →  lignes non reconnues jetées en silence
     ↓
Filtrage par description exacte
     ↓
Tableau éditable en mémoire
     ↓
« Catégoriser »  →  1 mot-clé = appliqué · plusieurs = pastille rouge · aucun = vide
     ↓
Corrections manuelles ligne par ligne
     ↓
« Sauvegarder »  →  Transaction + MonthHistory + YearHistory
     ↓
(fin du parcours — plus rien ne relit ces données aujourd'hui)
```
