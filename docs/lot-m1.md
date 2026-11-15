# Lot M1 — référentiel et ingestion

*Spécification du 14 septembre 2026. Exécutable sans revenir au projet Claude.*

Documents à lire avant de coder : `CLAUDE.md` (conventions, non négociable) · `docs/modele-ingestion-recurrences.md` §1 à §3 (le pipeline, le dédoublonnage, la description normalisée) · `docs/description-fonctionnelle-v1.md` §5.2 et §5.5 (les règles exactes du parser et de la catégorisation, qui sont **portées**, pas réinventées) · `docs/plan.md` §4.1 (les corrections de règles v1 → v2).

---

## 1. Le lot en une phrase

**Un relevé Desjardins réel entre par un copier-coller et ressort en base, catégorisé, sans doublon, sans ligne perdue en silence** — et le référentiel qui rend ça possible (comptes, catégories, bénéficiaires, étiquettes, règles, filtres) se gère depuis l'interface.

C'est le premier lot où l'application fait quelque chose d'utile. C'est aussi le plus chargé : il se découpe en six tranches (§10).

## 2. Ce dont on hérite de M0

À ne pas réécrire.

| | |
|---|---|
| `src/domain/money.ts` | `Cents`, `parseAmount`, `formatAmount`, médiane et quantiles |
| `src/domain/dates.ts` | `DateCivile` (chaîne `AAAA-MM-JJ`), les 12 cadences, `echeances()`, utilitaires de mois |
| `src/domain/ingestion/normaliser.ts` | `normaliserDescription()` pour les **lignes de relevé** — majuscules, accents retirés, troncature au premier jeton numérique, suffixe après `*` coupé ; `normaliserNom()` pour les **noms de bénéficiaire** — majuscules, accents retirés, espaces réduits, rien d'autre (§4.3) |
| `src/domain/ingestion/empreinte.ts` | `calculerEmpreinte(accountId, date, montantCents, descriptionNormalisee)` |
| `src/domain/budget/` | `report`, `disponible`, `resteAAssigner`, `besoinDuMois` — non utilisés par M1, à ne pas toucher |
| `prisma/schema.prisma` | les 39 modèles, migrés |
| `prisma/seed.ts` | 18 mois de données déterministes, 8 comptes |
| `src/server/actions/define-action.ts` | `defineAction(schema, handler)` et `ActionResult` |
| `src/lib/query-keys.ts` | la fabrique de clés |

**`src/server/db.ts` n'existe pas encore.** Le singleton Prisma est le tout premier fichier de M1.

## 3. Les trois points que ce document tranche

Le plan laissait trois choses ambiguës. Elles sont décidées ici ; ne les rouvre pas sans le dire.

### 3.1 Le profil d'import n'est pas persisté en M1

`docs/plan.md` §4.2 liste un onglet « Profils d'import » dans les Paramètres, mais **le schéma ne porte aucun modèle `ImportProfile`** — et c'est volontaire. Tant qu'il n'existe qu'une seule source (le copier-coller Desjardins), un profil enregistré est une table vide de sens.

En M1, `ProfilImport` est un **objet du domaine**, pas une ligne en base. Le formulaire d'import en choisit un dans une liste codée en dur qui n'en contient qu'un : `desjardins-copier-coller`. Le modèle `ImportProfile` arrivera avec CSV et OFX, en M9, quand les profils se multiplieront et mériteront d'être nommés et conservés. **L'onglet « Profils d'import » n'est donc pas construit en M1.**

### 3.2 Une priorité départage ; à priorité égale, on ne tranche pas

La v1 appliquait « plusieurs mots-clés trouvés = on n'applique rien, on signale ». C'est une bonne règle et elle est conservée — mais le moteur de règles a maintenant un champ `priorite`, qui existe précisément pour que l'utilisateur puisse départager quand il le souhaite.

La règle exacte, pour deux règles qui posent la **même action sur le même champ avec des valeurs différentes** :

| Situation | Comportement |
|---|---|
| Priorités différentes | La plus haute gagne. Silencieusement : c'est un arbitrage que l'utilisateur a écrit lui-même. |
| Priorités **égales** | **Aucune des deux n'est appliquée.** La ligne est marquée `aRevoir`, et la revue d'import affiche les deux règles en concurrence avec ce que chacune aurait posé. |

Deux règles qui posent des actions **différentes** (l'une catégorise, l'autre étiquette) ne sont pas en conflit : elles s'appliquent toutes les deux.

> Le seed contient « deux règles volontairement en conflit » (`docs/lot-m0-revision.md` §5). **Vérifie qu'elles portent bien la même priorité** — sinon elles ne produisent pas de conflit et le cas n'est pas couvert. Si ce n'est pas le cas, corrige le seed dans la même tranche.

### 3.3 `Payee.categorieParDefautId` pointe vers une sous-catégorie

Le champ existe dans le schéma **sans relation Prisma**, et son nom dit « catégorie » alors que tout le reste du modèle catégorise au niveau de la sous-catégorie. C'est une scorie.

M1 le corrige par une migration : `categorieParDefautId` → **`sousCategorieParDefautId`**, avec la relation déclarée vers `Subcategory` et `onDelete: SetNull`. Mets à jour le seed dans le même commit.

C'est la seule modification de schéma autorisée dans M1. Toute autre envie de toucher au schéma est une question à poser, pas une décision à prendre.

> **Amendement du 1er octobre 2026.** Les arbitrages de la passe manuelle (`docs/arbitrages-passe-m1.md`) autorisent deux modifications de schéma de plus : la valeur `MOT_ENTIER` ajoutée à l'énumération `OperateurCondition` (A3, §4.6) et le retrait de `@unique` sur `Account.compteLieId` (A5, §4.1). L'une ajoute une valeur, l'autre relâche une contrainte : aucune donnée n'est transformée. Le type d'opération (§5.8) n'a **pas** de colonne. La règle ci-dessus reste : toute autre envie de toucher au schéma est une question.

---

## 4. Le référentiel

Six écrans de paramètres, tous bâtis sur le même patron : repository → action `defineAction` → hook de lecture + hook de mutations → composant. **Résiste à la tentation de copier-coller cinq fois le même CRUD** : c'est un des défauts corrigés de la v1 (`docs/audit-v1.md`). Un patron partagé, paramétré, vaut mieux.

### 4.1 Comptes

Tous les types de `TypeCompte` : `CHEQUE`, `EPARGNE`, `CREDIT`, `MARGE`, `PRET`, `PLACEMENT`, `ACTIF`, `PASSIF`, `AUTRE`.

Le formulaire est **conditionnel au type** — ne montre pas un taux d'intérêt sur un compte chèque :

| Champs | Toujours |
|---|---|
| `nom`, `type`, `institution`, `soldeInitialCents`, `dateSoldeInitial`, `estBudgetaire`, `inclureDansPrevision`, `inclureDansValeurNette`, `seuilSecuriteCents`, `ordre`, `archive` | oui |
| `limiteCreditCents`, `tauxAnnuel`, `jourReleve`, `jourEcheance`, `perdDelaiDeGrace` | `CREDIT`, `MARGE` |
| `regimeFiscal`, `tauxRendementAnnuel` | `PLACEMENT` |
| `compteLieId` | `PRET`, `PASSIF` (adosser l'hypothèque à la maison) et `ACTIF` |

Règles : `estBudgetaire` bascule à `false` par défaut pour `PLACEMENT`, `ACTIF` et `PASSIF` — un compte de suivi entre dans la valeur nette mais pas au budget. `@@unique([ownerId, nom])`. **On archive, on ne supprime pas** un compte qui porte des transactions : la suppression est refusée avec `CONFLICT` et un message qui dit combien de transactions bloquent.

`compteLieId` n'est **pas unique** (amendement du 1er octobre 2026, `docs/arbitrages-passe-m1.md` A5) : un actif peut porter plusieurs passifs — une maison, son hypothèque et sa marge hypothécaire. Le seul doublon refusé à la création d'un compte est donc celui du nom (`@@unique([ownerId, nom])`), et son message ne parle que du nom : « Un compte porte déjà ce nom. »

`LoanTerm` (les paramètres datés d'un prêt) est **hors M1** — c'est M6. On peut créer un compte `PRET` sans terme.

### 4.2 Catégories et sous-catégories

Renommage en place, création, suppression, réordonnancement par flèches monter / descendre (`ordre`). **Pas de glisser-déposer en M1** : ça ajoute une dépendance et le lot est déjà lourd ; c'est reporté en M9.

Sur la catégorie : `modeBudget` (`PAR_SOUS_CATEGORIE` par défaut, `PAR_CATEGORIE` pour budgéter en groupe), `couleur`, `icone`, `masquee`.
Sur la sous-catégorie : `reportActif`, `reportMode` (`AUCUN` / `SIGNE` / `POSITIF_SEULEMENT`), `masquee`, `systeme`.

Corrections de la v1 à respecter : le nom d'une sous-catégorie est unique **dans sa catégorie**, pas globalement (`@@unique([categoryId, nom])`). Une sous-catégorie marquée `systeme` (« Ajustement de solde », « Intérêts de carte ») se renomme mais **ne se supprime pas** — le bouton est absent, pas seulement désactivé. Supprimer une catégorie emporte ses sous-catégories en cascade : le dialogue de confirmation les **liste nommément**, il ne se contente pas d'avertir.

Les cibles (`Target`) ne sont pas de M1 : c'est M4.

### 4.3 Bénéficiaires

Liste avec recherche, création, renommage, suppression. `nomNormalise` est recalculé par `normaliserNom()` à chaque écriture — jamais saisi à la main. C'est une **clé d'identité douce** : casse, accents et espaces seulement. Elle ne retire pas les jetons numériques comme `normaliserDescription()` le fait pour un relevé : « Les 3 Brasseurs » et « Les 5 Saisons » sont deux bénéficiaires, pas un seul « LES ». `@@unique([ownerId, nomNormalise])` : deux noms qui ne diffèrent que par la casse, les accents ou les espaces désignent le même bénéficiaire, et le second est refusé en `DUPLICATE`.

Trois champs de comportement : `sousCategorieParDefautId` (§3.3), `autoCategorisation` (à `false`, ce bénéficiaire n'impose jamais de catégorie) et `categorieVerrouillee` (la catégorie a été fixée à la main et prime sur les règles — voir §6.3).

**La fusion est exigée.** Le seed contient trois graphies d'un même marchand exprès pour l'éprouver. Fusionner B dans A : toutes les transactions de B passent sur A, B est supprimé, et c'est une seule `prisma.$transaction`. L'écran propose les candidats par proximité de `nomNormalise` (`pg_trgm` est disponible — `similarity(a, b) > 0.4` est un bon point de départ) ; **il propose, il ne fusionne pas tout seul.**

### 4.4 Étiquettes

Nom, couleur, `cibleMensuelleCents` optionnelle. Une étiquette avec une cible est une liste de surveillance ; le suivi de cette cible s'affichera en M8, l'étiquette se gère dès M1.

Supprimer une étiquette détache ses transactions (cascade sur `TransactionTag`), sans les toucher. Le dialogue dit combien.

Le choix de la couleur doit offrir un sélecteur visuel (palette ou `<input type="color">`) **en plus** du champ de code hexadécimal : le champ de code seul n'est pas utilisable par quelqu'un qui ne connaît pas déjà la valeur qu'il cherche. À livrer en tranche 2.

### 4.5 Filtres d'import

`ImportFilter` : `motif` + `mode` (`CONTIENT`, `MOT_ENTIER`, `REGEX`, `EXACT`). La v1 n'avait que l'égalité stricte sur la description en minuscules et **aucun écran pour modifier ou supprimer** un filtre une fois créé. Les deux sont corrigés.

Un motif `REGEX` invalide est refusé à la saisie, avec le message d'erreur de la regex — pas un « motif invalide » générique.

### 4.6 Règles

L'écran le plus dense des Paramètres. Une règle : `libelle`, `priorite`, `actif`, N conditions, N actions.

**Conditions** — toutes combinées en ET. Champs : `DESCRIPTION`, `DESCRIPTION_NORMALISEE`, `BENEFICIAIRE`, `MONTANT`, `COMPTE`, `SENS`. Opérateurs : `CONTIENT`, `MOT_ENTIER`, `EGALE`, `COMMENCE_PAR`, `REGEX`, `SUP`, `SUP_EGAL`, `INF`, `INF_EGAL`, `ENTRE`, `DANS`. L'éditeur n'offre que les opérateurs qui ont un sens pour le champ choisi : pas de `SUP` sur une description, pas de `CONTIENT` sur un montant.

`CONTIENT` trouve la valeur n'importe où dans le texte, y compris au milieu d'un mot : « PAIE » est dans « PAIEMENT ». `MOT_ENTIER` (amendement du 1er octobre 2026, `docs/arbitrages-passe-m1.md` A3) exige en plus que la valeur trouvée ne soit ni précédée ni suivie d'un caractère de mot — la frontière de `src/domain/ingestion/beneficiaire.ts` (lettre, chiffre, `&`, apostrophe droite ou typographique), définie une seule fois dans `src/domain/ingestion/frontiere-mot.ts`. « PAIE » en `MOT_ENTIER` reconnaît « DEPOT PAIE EMPLOYEUR », pas « Paiement. ». Comme `CONTIENT`, la comparaison ignore la casse et les accents. Les deux sont proposés pour les trois champs texte ; `CONTIENT` reste l'opérateur par défaut. Ne pas confondre avec le mode `MOT_ENTIER` des filtres d'import (§4.5), qui découpe en jetons alphanumériques : les deux frontières diffèrent sur `&` et l'apostrophe, écart connu et non traité en M1.

`valeur` est une chaîne qui porte, selon le champ, du texte, un montant en cents, ou un identifiant de compte. `valeurFin` n'est renseigné que pour `ENTRE`.

**Actions** — ordonnées. `RENOMMER_BENEFICIAIRE`, `CATEGORISER`, `ETIQUETER`, `NOTER`, `EXCLURE_BUDGET`, `EXCLURE_RAPPORTS`, `MARQUER_A_REVOIR`, `VENTILER`. En M1 on implémente les sept premières. **`VENTILER` existe dans le schéma mais l'éditeur ne la propose pas** (amendement du 1er octobre 2026, `docs/arbitrages-passe-m1.md` A4 : plutôt que la proposer pour la refuser ensuite, elle est absente de la liste des types d'action). Une règle qui en porte déjà une — créée avant cette restriction, ou modifiée en base — l'affiche en lecture seule, avec un message qui renvoie à M2 et un bouton pour la retirer ; le schéma de l'action refuse d'enregistrer la règle tant qu'elle la porte. À l'import, le garde-fou `actionsVentilationIgnorees` de §6.3 est inchangé. *(Retiré en M2 : l'éditeur propose `VENTILER` et le garde-fou de §6.3 a disparu — `docs/lot-m2.md` §4.3.)*

**Application rétroactive** — un bouton « Appliquer aux transactions existantes » qui montre d'abord un **aperçu** : combien de transactions correspondent, lesquelles (les 50 premières), et ce qui changerait sur chacune. L'écriture ne part qu'après confirmation, en une transaction, et pose `appliedRuleId`. Une transaction dont la catégorie a été **corrigée à la main** n'est pas réécrite par une application rétroactive : c'est le sens de `categorieVerrouillee` côté bénéficiaire, et il faut le même respect ici — on ne défait pas le travail manuel de l'utilisateur.

---

## 5. Le parser de relevés — `src/domain/statement/`

*Section réécrite le 15 septembre 2026, après examen de relevés Desjardins réels. La version précédente décrivait un format que l'interface d'AccèsD ne produit plus. Ce qui suit fait autorité.*

### 5.0 Ce que le copier-coller d'AccèsD produit réellement

Le v1 supposait une transaction par ligne. **Ce n'est pas le cas.** Chaque transaction arrive sous forme de **bloc**, séparé par des tabulations et des sauts de ligne :

```
31 AOÛ31 Août	
Restaurants
Achat /CAFE LUCIOLE (VALBRUM

−7,85 $	426,85 $	
31 Août Achat /CAFE LUCIOLE (VALBRUM −7,85 $
```

Cinq à six lignes pour une seule transaction : la date en forme courte et longue accolées, la catégorie attribuée par Desjardins, le libellé, puis une ligne portant le montant **et le solde après opération**, et enfin une **ligne récapitulative**.

C'est cette dernière ligne qui est exploitable, et elle seule : `31 Août Achat /CAFE LUCIOLE (VALBRUM −7,85 $` a exactement la forme date + description + montant que la reconnaissance du v1 attend. Toutes les autres lignes du bloc sont écartées parce qu'elles ne portent pas de date en début de ligne — y compris la ligne de solde, ce qui évite qu'un solde soit pris pour un montant.

**Le parser ne cherche donc pas à comprendre la structure du bloc. Il retient les lignes qui portent à la fois une date et un montant, et ignore le reste.** La structure en blocs est une propriété de la source, pas du parser.

### 5.1 La conversion des tabulations n'est pas cosmétique

Le v1 convertissait les tabulations en sauts de ligne au nettoyage. Cette étape passait pour de la mise en forme ; elle est en réalité **la condition de fonctionnement du parser**.

Certaines lignes d'AccèsD condensent le bloc entier *et* son récapitulatif sur une seule ligne, séparés par des tabulations :

```
26 FÉV26 Février⇥Paiement⇥⇥+187,40 $⇥26 Février Paiement. +187,40 $
```

Cette ligne commence par `26 FÉV26 Février`, que le motif de date ne reconnaît pas — le jour n'est pas suivi d'un nom de mois complet. Sans conversion des tabulations, **la ligne est rejetée et la transaction perdue**. Sur le relevé de carte examiné, les deux lignes concernées sont les paiements du relevé : les plus gros montants, et des virements.

Après conversion, le récapitulatif redevient une ligne autonome et se reconnaît normalement.

**Cette étape a son propre test**, avec la ligne condensée ci-dessus comme cas. Ce n'est pas une option du profil : c'est un nettoyage sans lequel le reste ne tient pas.

### 5.2 Un seul profil couvre le compte et la carte

Le compte chèque marque toutes ses sorties d'un moins typographique (`−14,50 $`) et ses entrées d'un plus (`+38,60 $`). Le relevé de carte ne marque rien sur les achats (`41,25 $`) et met un plus sur les paiements et les remboursements de marchand (`+187,40 $`).

Dans les deux cas, la règle **« seul un `+` explicite désigne une entrée d'argent »** donne le bon signe, y compris sur un compte de crédit où un achat creuse la dette et où un paiement la réduit. Un seul profil Desjardins suffit donc pour les deux types de comptes.

La valeur `TOUT_SORTANT` évoquée dans la version précédente de cette section est supprimée : elle avait été imaginée sans relevé de carte sous les yeux, et ne correspond à rien.

### 5.3 Le contrat

```ts
// src/domain/statement/types.ts

export type RegleSigne =
  | "PLUS_EXPLICITE"   // seul un « + » marque une entrée ; tout le reste sort
  | "MOINS_EXPLICITE"  // seul un « − » marque une sortie ; tout le reste entre

export type ProfilImport = {
  readonly id: string
  readonly libelle: string
  readonly institution: string

  /** Appliqués au texte collé, dans cet ordre, avant toute reconnaissance. */
  readonly nettoyage: {
    /** Toujours vrai pour Desjardins — voir §5.1. */
    readonly tabulationsEnSautsDeLigne: boolean
    /** Tronque la ligne à partir de ce motif (ex. la colonne « Total »). */
    readonly tronquerApres?: RegExp
  }

  readonly date: {
    /** Doit capturer le jour en groupe 1 et le nom du mois en groupe 2. */
    readonly motif: RegExp
    /** Les douze noms de mois, dans l'ordre, tels qu'ils apparaissent. */
    readonly mois: readonly string[]
    /** Faux quand le relevé n'écrit que le jour et le mois (cas Desjardins). */
    readonly anneeDansLaLigne: boolean
  }

  readonly montant: {
    readonly motif: RegExp
    readonly separateurDecimal: "," | "."
  }

  readonly regleSigne: RegleSigne

  /** Sépare le type d'opération du marchand — §5.8. Absent : aucune séparation. */
  readonly operation?: {
    /** La première correspondance sépare. Jamais de drapeau g ni y. */
    readonly separateur: RegExp
  }

  /** Repère la ligne de total du texte collé — §5.9. Absent : aucun contrôle. */
  readonly controleTotal?: {
    /** Le montant est lu dans ce qui suit la correspondance. Jamais de drapeau g ni y. */
    readonly motif: RegExp
  }
}

export type LigneReconnue = {
  readonly numeroLigne: number
  readonly ligneBrute: string
  readonly date: DateCivile
  /** Type d'opération séparé par le profil (§5.8) ; null sans séparateur. */
  readonly typeOperation: string | null
  /** Description du marchand, sans le type d'opération (§5.8). */
  readonly description: string
  readonly montantCents: Cents
}

export type RaisonRejet =
  | "AUCUNE_DATE" | "AUCUN_MONTANT" | "MOIS_INCONNU" | "MONTANT_ILLISIBLE"

export type LigneRejetee = {
  readonly numeroLigne: number
  readonly ligneBrute: string
  readonly raison: RaisonRejet
}

export function analyserReleve(
  texte: string,
  profil: ProfilImport,
  annee: number,
): { reconnues: LigneReconnue[]; rejetees: LigneRejetee[] }

export type ControleTotal = {
  /** Ligne du texte collé qui porte le total. */
  readonly numeroLigne: number
  readonly totalReleveCents: Cents
  readonly sommeReconnuesCents: Cents
  /** sommeReconnuesCents − totalReleveCents ; 0 = le relevé concorde. */
  readonly ecartCents: Cents
}

export function controlerTotal(
  texte: string,
  profil: ProfilImport,
  reconnues: readonly LigneReconnue[],
): ControleTotal | null
```

`analyserReleve` ne lève jamais. Une ligne vide ou blanche n'est ni reconnue ni rejetée : elle disparaît au nettoyage, et c'est le seul cas où une ligne disparaît sans trace.

`controlerTotal` ne lève jamais non plus, et ne modifie pas ce que rend `analyserReleve` (§5.9).

**Le profil est une donnée, pas du code.** Ajouter une autre banque ou un autre émetteur de carte doit être une nouvelle entrée de configuration — jamais une branche `if (institution === …)` dans le parser. C'est la différence entre un parser paramétré et six parsers à maintenir. En M1, un seul profil existe : `desjardins-accesd`. Il n'est pas persisté en base (§3.1).

### 5.4 Le profil Desjardins

```ts
export const DESJARDINS_ACCESD: ProfilImport = {
  id: "desjardins-accesd",
  libelle: "Desjardins — copier-coller AccèsD",
  institution: "Desjardins",
  nettoyage: {
    tabulationsEnSautsDeLigne: true,
    tronquerApres: /\bTotal\b/,
  },
  date: {
    motif: /^(\d{1,2})\s+(janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)\b/i,
    mois: ["janvier", "février", "mars", "avril", "mai", "juin",
           "juillet", "août", "septembre", "octobre", "novembre", "décembre"],
    anneeDansLaLigne: false,
  },
  montant: {
    motif: /(?:^|[\s ])([+−-]?\d{1,3}(?:[\s ]\d{3})*|[+−-]?\d+)[,.](\d{2})\s*\$(?!\S)/,
    separateurDecimal: ",",
  },
  regleSigne: "PLUS_EXPLICITE",
  operation: { separateur: / \// },
  controleTotal: { motif: /^\s*Total\b/ },
}
```

Trois corrections par rapport au motif de montant du v1. Les séparateurs de milliers sont **répétables** — `\d*\s?\d+` ne gérait qu'un seul groupe et échouait au-delà de 999 999. Et l'espace insécable ` ` est reconnu explicitement : c'est ce que produit le copier-coller d'une page web, pas une espace ordinaire.

Enfin, le motif porte une **frontière gauche** — le préfixe non capturant `(?:^|[\s ])` — sans laquelle le groupe de milliers avale le chiffre final du texte qui précède. Amendement du 2026-09-18 : sur la ligne réelle `22 Février Boutique Web Ca Qz37*9kb2 164,90 $` de `visa-desjardins.txt`, le motif d'origine partait du `3` de `Qz37*9kb2`, lisait `2 164,90 $`, et produisait **2 164,90 $ au lieu de 164,90 $** avec une description tronquée — silencieusement, la ligne restant « reconnue ». La forme la plus banale d'un relevé de carte (une référence marchande finissant par un chiffre, suivie d'un montant à trois chiffres) suffit à la déclencher. Comparé sur les 106 fragments porteurs de montant des trois fixtures, le préfixe ne change **que** cette ligne. Pas de lookbehind : `"target": "ES2017"` le refuserait.

`operation` et `controleTotal` datent du 1er octobre 2026 (§5.8 et §5.9). Ce sont des données du profil, comme le reste : ni le séparateur ` /`, ni le mot `Total` n'apparaissent dans le code du parser.

### 5.5 Ce qui est porté du v1, et ce qui change

Porté tel quel : la sélection d'une ligne **seulement** si elle porte à la fois une date en début de ligne et un montant ; la description obtenue en retranchant la date et le montant de la ligne ; la troncature à « Total ».

| v1 | v2 |
|---|---|
| `Math.floor` / `Math.ceil` sur des dollars entiers — **les cents sont perdus** | cents conservés, via `parseMontant` de `domain/money.ts` |
| Ligne non retenue **jetée sans message** | remontée dans `rejetees` avec sa raison et son numéro de ligne |
| Mois non reconnu → retombe **silencieusement sur janvier** | `MOIS_INCONNU` — jamais de date inventée |
| Montant illisible → `NaN` qui se propage | `MONTANT_ILLISIBLE` |
| Le `+` codé en dur comme seul marqueur d'entrée | `profil.regleSigne` |
| Motif de montant à un seul séparateur de milliers, espace ordinaire | séparateurs répétables, espace insécable reconnu |
| Motif de montant **sans frontière gauche** — le chiffre final d'une référence marchande est avalé par le groupe de milliers (164,90 $ lu 2 164,90 $) | préfixe `(?:^|[\s ])` — le montant doit commencer en début de ligne ou après une espace |
| Conversion des tabulations traitée comme une mise en forme | **étape critique, testée pour elle-même** (§5.1) |

### 5.6 Les fixtures

`src/domain/statement/fixtures/`, en `.txt`, avec le résultat attendu en `.json` à côté.

| Fichier | Ce qu'il doit prouver |
|---|---|
| `cheque-desjardins.txt` | le format en blocs ; le moins typographique `−` ; les entrées marquées `+` (paie, dépôt) ; un montant à quatre chiffres avec séparateur de milliers ; la ligne de solde ignorée ; la ligne « Total » tronquée |
| `visa-desjardins.txt` | les achats **sans signe** traités comme des sorties ; les paiements et remboursements marqués `+` traités comme des entrées ; **les deux lignes condensées** que seule la conversion des tabulations sauve ; un libellé à suffixe de référence |
| `cas-limites.txt` | chaque `RaisonRejet` au moins une fois : un mois mal orthographié, un montant collé à un caractère non-espace, une ligne datée sans montant, une ligne avec montant sans date |
| `visa-desjardins-2026-09.txt` | le relevé Visa collé pendant la passe manuelle du 30 septembre 2026 (`docs/arbitrages-passe-m1.md` A2) : 9 transactions reconnues, 42 fragments `AUCUNE_DATE`, une ligne `Total +0,28 $` égale à la somme des reconnues (§5.9) |

Les deux premiers sont des extraits **réels**, copiés depuis AccèsD sans retouche de forme. **Les tabulations et les espaces insécables doivent être préservés au caractère près** : ce sont eux que le parser traite, et un fichier reformaté ne teste plus rien. Le troisième est construit à la main à partir de fragments des deux autres.

Le quatrième n'est pas copié à la main : il est écrit par `JSON.parse` de la chaîne JSON reproduite dans `docs/arbitrages-passe-m1.md`, pour que les tabulations passent au caractère près. Comme les deux premiers, il est déclaré `-text` dans `.gitattributes`.

Le `.json` attendu liste, pour chaque fixture, les `reconnues` avec leur date, leur `typeOperation` (§5.8), leur description et leur `montantCents`, les `rejetees` avec leur raison et, quand le relevé porte une ligne de total, le `controleTotal` attendu (§5.9). C'est ce fichier qui fait foi : le test compare la sortie d'`analyserReleve` à son contenu, sans tolérance.

### 5.7 Ce qu'on jette volontairement

Chaque bloc d'AccèsD contient la **catégorie attribuée par Desjardins** — `Restaurants`, `Épicerie`, `Salaire`, `Virements`, `Loisirs - Autre`. En ne retenant que la ligne récapitulative, le parser la perd.

C'est de l'information déjà classée, gratuite, qui pourrait alimenter la catégorisation avant même le moteur de règles. **Elle n'est pas exploitée en M1** : la récupérer suppose de lire le bloc plutôt que la ligne, donc de changer la forme du `RawEntry` et le pipeline entier, pour un gain qui appartient à la catégorisation et non à l'ingestion.

Le noter ici est délibéré : c'est la seule trace qu'on avait cette donnée sous la main et qu'on a choisi de ne pas la prendre. À rouvrir si la catégorisation automatique déçoit en usage réel.

### 5.8 Le type d'opération est séparé du marchand

*Ajouté le 1er octobre 2026 — `docs/arbitrages-passe-m1.md` A1.*

Sur le compte chèque, AccèsD écrit le libellé sous la forme `Type /Marchand` : `Achat /CAFE DEPOT`, `Paie /ZORVANE`, `Virement Interac à /Odile ferland  /`. Laissé tel quel, le type d'opération ouvre la description, et la résolution du bénéficiaire — qui compare le **début** de la description (§6.3) — ne reconnaît jamais « CAFE DEPOT ».

Le profil porte donc un **séparateur** (`operation.separateur`) : une donnée, pas une liste fermée de préfixes ni une branche sur l'institution. Pour `DESJARDINS_ACCESD`, c'est la **première** occurrence de ` /` (espace, barre oblique). Après le retrait de la date et du montant :

- ce qui précède le séparateur, espaces réduits et retirés aux bords, est `typeOperation` ;
- ce qui le suit est la description du marchand : espaces réduits et retirés aux bords, puis une barre oblique finale retirée, puis les bords à nouveau (`Virement Interac à /Odile ferland  /` → `Virement Interac à` et `Odile ferland`). Une barre oblique interne reste : `Paiement internet de /ZORVANE/juillet` → `ZORVANE/juillet` ;
- une ligne sans séparateur (`Frais fixes d'utilisation`, toutes les lignes Visa, `Paiement.`) a `typeOperation: null` et garde sa description entière. Une barre oblique sans espace devant (`Électronique/Informatique`) n'est pas un séparateur. Une ligne dont l'un des deux côtés serait vide après nettoyage (`Achat /`) n'est pas séparée non plus : elle garde `typeOperation: null` et sa description entière.

`LigneReconnue.description` est la description du marchand. C'est elle, et elle seule, qui sert ensuite à la résolution du bénéficiaire, aux conditions de règle (`DESCRIPTION` comme `DESCRIPTION_NORMALISEE`), à l'empreinte et aux filtres d'import, et qui est écrite en `Transaction.description`. `ligneBrute` garde la ligne entière.

Conséquence assumée : deux lignes du même compte, même date, même montant et même marchand, qui ne diffèrent que par le type d'opération, ont la même empreinte. La revue les montre toutes deux dans « À importer » ; l'enregistrement refuse alors le lot (`EMPREINTE_EN_DOUBLE`, « Rien n'a été enregistré ») en nommant les deux lignes, et l'utilisateur corrige la description de l'une d'elles. Rien n'est écrit à moitié ni perdu en silence.

Types observés sur de vrais relevés chèque, tous couverts par les tests : `Achat`, `Paie`, `Paiement`, `Paiement facture - AccèsD Internet`, `Virement - AccèsD Internet`, `Virement Interac à`, `Virement-remboursement`, `Remboursement automatique`.

**Le type d'opération n'est pas persisté en M1.** Il est transporté jusqu'à la revue (`LigneEnRevue.typeOperation`, §6.1), où il s'affiche sous la description, en lecture seule ; il n'est ni comparé, ni écrit en base. Le schéma n'a pas de colonne pour lui, §3.3 réserve toute modification de schéma à une décision, et aucune fonction de M1 ne s'en sert après la revue. Comme la catégorie Desjardins (§5.7), c'est une information qu'on a sous la main et qu'on choisit de ne pas garder. Une colonne nullable additive la rattraperait, mais seulement pour les imports postérieurs : `ligneBrute` n'étant pas stocké, le type des transactions importées avant serait perdu. À trancher au plus tard avec la spécification de M2 (consultation). *Tranché par `docs/lot-m2.md` §3.1 : persisté depuis M2 (`Transaction.typeOperation`).*

La lecture bloc par bloc (§5.7) reste hors périmètre.

### 5.9 Les fragments sans date et le contrôle du total

*Ajouté le 1er octobre 2026 — `docs/arbitrages-passe-m1.md` A2.*

Sur un vrai relevé Visa, le parser reconnaît 9 transactions, toutes justes, et rejette 42 fragments `AUCUNE_DATE` : en-têtes de colonnes, `28 SEP28 Septembre`, catégorie Desjardins, `2 %`, montant seul. Affichés, ils noient les vrais rejets.

**Le contrat d'`analyserReleve` ne change pas** : il continue de produire `AUCUNE_DATE`. Le masquage se fait **à l'affichage**, dans la revue (§8.2) : les rejets `AUCUNE_DATE` n'y apparaissent plus et ne sont plus comptés ; `MOIS_INCONNU`, `AUCUN_MONTANT` et `MONTANT_ILLISIBLE` restent affichés et comptés.

Masquer n'est acceptable qu'avec un **garde-fou**. Quand le texte collé contient une ligne de total qui porte un montant lisible (`controleTotal.motif` du profil ; `^\s*Total\b` pour `DESJARDINS_ACCESD`), `controlerTotal` lit ce montant avec le motif de montant du profil et **la même `RegleSigne`** que les transactions, et le compare à la somme des `montantCents` de **toutes** les lignes reconnues — y compris celles qu'un filtre ou le dédoublonnage écarteront ensuite. Un écart s'affiche en alerte en haut de la revue, avec les deux montants. Sans ligne de total lisible, pas de contrôle et pas d'alerte ; l'alerte elle-même ne bloque pas l'enregistrement. Si plusieurs lignes de total sont lisibles, la première compte.

La ligne de total est lue dans le texte collé, indépendamment de `nettoyage.tronquerApres`, qui continue de la retirer de l'analyse : elle n'est ni une transaction ni un rejet.

Sur le relevé Visa de la passe manuelle (`visa-desjardins-2026-09.txt`, §5.6), la somme vaut +28 cents, égale à `Total +0,28 $` : pas d'alerte. Retirer une ligne reconnue du texte fait apparaître l'alerte. Sur `visa-desjardins.txt`, l'anonymisation déjà connue produit un écart de 19,00 $ : l'alerte s'affiche, c'est voulu.

---

## 6. Le pipeline d'ingestion — `src/domain/ingestion/`

`docs/modele-ingestion-recurrences.md` §1 et §2 font autorité. Ce qui suit en précise l'exécution.

```
texte collé ──► analyserReleve ──► RawEntry[] ──► filtres ──► dédoublonnage ──► catégorisation ──► LigneEnRevue[]
                                                                                                        │
                                                                                  revue humaine ────────┘
                                                                                        │
                                                                                   persistance
```

**Rien n'est écrit en base avant la validation de la revue.** Tout ce qui précède est du calcul pur, dans `domain/`, hors Prisma — sauf la requête qui va chercher les transactions existantes pour comparer, qui est faite en amont par un repository et **passée en argument**.

### 6.1 Ce que la ligne en revue porte

```ts
export type StatutDoublon = "AUCUN" | "EMPREINTE_EXISTANTE" | "QUASI_DOUBLON"

export type LigneEnRevue = {
  readonly cle: string              // identifiant local, pas en base
  date: DateCivile
  readonly typeOperation: string | null  // §5.8 : affiché en lecture seule, jamais persisté en M1
  description: string               // du marchand, sans le type d'opération (§5.8) ; modifiable
  descriptionNormalisee: string     // recalculée à chaque modification de la description
  montantCents: Cents
  accountId: string
  payeeId: string | null
  subcategoryId: string | null
  tagIds: string[]
  note: string | null
  exclureDuBudget: boolean
  exclureDesRapports: boolean
  aRevoir: boolean
  readonly empreinte: string
  readonly statutDoublon: StatutDoublon
  readonly doublonDe: ReferenceTransaction | null
  readonly regleAppliqueeId: string | null
  readonly reglesEnConflit: string[]   // vide sauf conflit à priorité égale
  readonly filtreId: string | null     // non nul = écartée par un filtre
  action: "IMPORTER" | "IGNORER"
}
```

### 6.2 Dédoublonnage, les trois couches

**`externalId`** — aucune source n'en fournit en M1. Le chemin de code existe et est testé avec une entrée fabriquée : quand un `externalId` est présent et déjà connu, la transaction est **mise à jour**, pas recréée. Ne le retire pas sous prétexte qu'il ne sert pas encore ; c'est ce qui évitera une reprise d'historique le jour de l'agrégateur.

> Piège Postgres : `@@unique([accountId, externalId])` n'empêche pas plusieurs lignes à `externalId` nul — un index unique traite chaque `NULL` comme distinct. C'est ce qu'on veut, mais ne compte pas dessus pour garantir quoi que ce soit en M1.

**Empreinte** — `calculerEmpreinte(accountId, date, montantCents, descriptionNormalisee)`, déjà écrite. Une correspondance exacte marque `EMPREINTE_EXISTANTE` et met `action` à `IGNORER` **par défaut** — l'utilisateur peut forcer l'import, auquel cas la contrainte d'unicité en base refusera l'écriture et l'action doit retourner un `DUPLICATE` propre, pas une erreur Prisma brute.

**Quasi-doublon** — même compte, même `montantCents`, `descriptionNormalisee` identique, date à ± 3 jours. Marqué `QUASI_DOUBLON`, `action` reste à `IMPORTER` : deux cafés au même endroit dans la semaine, c'est légitime. La revue montre la transaction existante en regard pour que l'utilisateur tranche.

### 6.3 L'ordre de catégorisation

Pour chaque ligne, dans cet ordre exact :

1. **Filtres d'import** — si un `ImportFilter` correspond à la description de la ligne (celle du marchand, sans le type d'opération — §5.8), `filtreId` est renseigné et `action` passe à `IGNORER`. La ligne reste affichée dans la section « filtrées », réactivable d'un clic. La v1 la faisait disparaître.
2. **Bénéficiaire** — la description de la ligne — celle du marchand, sans le type d'opération (§5.8) — passe par `normaliserNom()`, **pas** par `descriptionNormalisee` : les deux côtés de la comparaison partagent la même clé. Recherche d'un `Payee` dont le `nomNormalise` égale cette clé, puis en est un préfixe ; le plus long préfixe gagne. Un préfixe n'est retenu que si le caractère suivant n'est pas un caractère de mot (lettre, chiffre, `&`, apostrophe) : `AMZN MKTP CA` reconnaît `AMZN MKTP CA*2K4LM9`, `A&W` ne se découpe jamais en `A`. Le préfixe exige en plus un nom d'au moins trois caractères de mot (les articles et abréviations d'une ou deux lettres ouvrent n'importe quelle description) ; l'égalité exacte n'a pas de minimum : « BP » reconnaît « BP », pas « BP GAS ». La règle complète est en tête de `src/domain/ingestion/beneficiaire.ts`. Trouvé, il est posé sur `payeeId`.
3. **Règles** — évaluées par `priorite` décroissante parmi les règles `actif`. Les actions s'appliquent dans leur ordre. Les conflits suivent §3.2.
4. **Catégorie par défaut du bénéficiaire** — seulement si aucune règle n'a posé de catégorie, et si `autoCategorisation` est vrai.

Exception qui traverse tout : si le bénéficiaire porte `categorieVerrouillee`, **sa sous-catégorie est posée à l'étape 2 et aucune règle ne la remplace**. C'est le sens du champ.

Une ligne qui ressort sans `subcategoryId` n'est pas une erreur. Elle reste non catégorisée, et l'utilisateur la traite dans la revue ou plus tard.

**Choisir une sous-catégorie tranche le conflit** (amendement du 1er octobre 2026, `docs/arbitrages-passe-m1.md` A6). Sur une ligne en conflit à priorité égale, le créneau `SOUS_CATEGORIE` reste vide (§3.2). Dans la revue, choisir une sous-catégorie **vaut arbitrage** de ce créneau : le conflit de la ligne se lève, et « Enregistrer » n'est plus bloqué par elle. **C'est cette sous-catégorie qui est persistée**, qu'elle soit l'une des candidates ou une autre. `appliedRuleId` reste vide : aucune règle n'a posé cette catégorie, l'utilisateur l'a choisie. Le drapeau « à revoir » posé par le conflit reste tel que l'utilisateur le laisse dans la revue. « J'ai tranché » reste l'autre façon d'arbitrer, sans choisir de valeur.

Une règle dont une action est `VENTILER` n'est pas appliquée en M1 : les ventilations arrivent avec M2 (§12), et l'éditeur de règles refuse déjà d'en créer. Le moteur la signale (`ACTION_NON_SUPPORTEE`) plutôt que de l'exécuter à moitié ou de l'avaler, et `preparerRevue` compte les règles concernées, une fois chacune, dans `actionsVentilationIgnorees` — un agrégat de `ResultatPreparation`, pas un champ de `LigneEnRevue` (§6.1). Le tri se fait sur le **type** `VENTILER`, pas sur le motif : `ACTION_NON_SUPPORTEE` couvre aussi les actions à valeur vide, qui ne sont pas des ventilations. La revue l'affiche comme un encart qui nomme chaque règle concernée. **C'est un garde-fou temporaire** : à retirer quand M2 implémente réellement la ventilation, pour que personne ne le prenne plus tard pour une fonctionnalité.

> **Retiré en M2** (`docs/lot-m2.md` §4.3) : le moteur applique `VENTILER` dans le créneau `SOUS_CATEGORIE`, `ACTION_NON_SUPPORTEE` ne la concerne plus, `actionsVentilationIgnorees` et son encart de revue ont disparu. Une ventilation illisible rend la règle inapplicable (`VENTILATION_ILLISIBLE`).

### 6.4 La persistance

Une seule Server Action, une seule `prisma.$transaction` :

1. création de l'`ImportBatch` (`source: COPIER_COLLER`, `nbLignes`, `couvreDu`, `couvreAu` calculés depuis les lignes retenues) ;
2. `createMany` des transactions dont `action === "IMPORTER"`, avec `importBatchId`, `empreinte`, `descriptionNormalisee`, `appliedRuleId`, `source` ;
3. les liens `TransactionTag` ;
4. création des `Payee` nouveaux si l'utilisateur en a saisi dans la revue.

Aucune table d'agrégat. La v1 en tenait deux à la main et ne les recalculait jamais ; elles ont disparu du schéma, ne les réinvente pas sous un autre nom.

Le retour est un récapitulatif : nombre importé, nombre ignoré comme doublon, nombre filtré, nombre laissé non reconnu.

---

## 7. La couche serveur

`src/server/db.ts` d'abord — singleton Prisma, `globalThis` pour survivre au rechargement à chaud du dev.

Repositories, un fichier par agrégat : `accounts`, `categories`, `payees`, `tags`, `rules`, `import-filters`, `transactions`, `import-batches`. **Seul endroit qui parle à Prisma.**

Rappels de `CLAUDE.md` §7 qui mordent particulièrement ici : `select` plutôt qu'include — la requête qui cherche les doublons ne ramène que `id`, `date`, `montantCents`, `description`, `empreinte`, et elle est **bornée à la fenêtre de dates du relevé ± 3 jours**, pas à tout le compte. Pas de boucle de requêtes : les bénéficiaires, les règles et les filtres se chargent en trois requêtes, une fois, avant la boucle sur les lignes.

Actions : toutes par `defineAction`, validation zod, `ActionResult` typé, filtrage systématique sur `ownerId`.

---

## 8. Les écrans

### 8.1 Paramètres

Onglets secondaires (`Tabs` shadcn, pas de barre latérale) : **Comptes · Catégories · Bénéficiaires · Étiquettes · Règles · Filtres**. Six onglets. Ni « Récurrences » (M3), ni « Profils d'import » (§3.1), ni « Agenda » (M5), ni « Préférences » (M9).

### 8.2 Transactions → Import

Deux temps, sur la même route.

**Le formulaire** — compte (select), année (5 dernières, défaut l'année courante), profil d'import (un seul choix pour l'instant, mais le select existe), textarea du relevé collé. Bouton « Analyser ». Les deux boutons annexes de la v1 (ajouter un filtre, ajouter un mot-clé) disparaissent : ça se gère dans les Paramètres, et depuis la revue.

**La revue** — quatre sections, chacune avec son compte affiché, repliables, dans cet ordre :

| Section | Contenu |
|---|---|
| **À importer** | le tableau d'édition. Colonnes : date, description (avec, dessous et en lecture seule, le type d'opération quand le relevé en porte un — §5.8), bénéficiaire, sous-catégorie, montant, étiquettes, compte, plus une colonne d'état (pastille de conflit de règles, marqueur « à revoir »). Toutes éditables en place. |
| **Doublons** | les `EMPREINTE_EXISTANTE` et `QUASI_DOUBLON`, avec la transaction existante en regard et une bascule importer / ignorer. |
| **Filtrées** | ce qu'un filtre a écarté, avec le motif responsable et un bouton pour réintégrer la ligne. |
| **Non reconnues** | les `LigneRejetee` **sauf `AUCUNE_DATE`** (§5.9), avec le texte brut, le numéro de ligne, la raison, et un formulaire de saisie manuelle pour récupérer la ligne. Le compte de la section et le récapitulatif ne comptent que les rejets affichés. |

**Contrôle du total.** Quand `controlerTotal` (§5.9) constate un écart, une alerte s'affiche en haut de la revue, avant toutes les sections : le total du relevé, la somme des lignes reconnues et l'écart. Elle ne bloque pas « Enregistrer ».

Le bouton « Enregistrer » affiche le récapitulatif de §6.4 avant d'écrire, et se désactive tant qu'une ligne porte un conflit non tranché.

Contraintes de `CLAUDE.md` à surveiller de près sur cet écran, parce que c'est exactement là que la v1 s'est plantée : `"use client"` sur les composants interactifs, **pas sur la page** ; une cellule de tableau importe le hook de lecture, **jamais** le hook de mutations ; les montants en `IBM Plex Mono` tabulaire ; une déclinaison mobile pensée, pas un défilement horizontal subi.

### 8.3 Ce que M1 ne construit pas

**Aucun écran ne montre les transactions déjà enregistrées.** C'est M2. En M1, on vérifie le résultat avec `npx prisma studio`. Ne construis pas l'écran de consultation par anticipation : il a ses propres exigences (pagination par curseur, réattribution en masse, ventilations, virements) et il n'entre pas dans ce lot.

---

## 9. Tests exigés

Vitest sur `domain/`, comme toujours. Le critère de sortie ne passe pas sans ceux-ci :

| Module | Cas |
|---|---|
| `statement/` | les quatre fixtures §5.6, comparées à leur `.json` attendu ; la séparation du type d'opération pour les huit types observés et pour les lignes sans séparateur (§5.8) ; le contrôle du total, concordant et en écart, sous les deux `RegleSigne` (§5.9) ; chaque `RaisonRejet` au moins une fois ; les cents préservés (« 1 234,56 $ » → `123456`) ; les deux `RegleSigne` ; la conversion des tabulations (§5.1) sur la ligne condensée ; un mois mal orthographié qui **ne produit pas** de date |
| `ingestion/` | empreinte identique → détecté ; ± 3 jours et même montant → quasi-doublon ; ± 4 jours → pas un quasi-doublon ; `externalId` connu → mise à jour et non création |
| `categorization/` | une condition simple ; deux conditions en ET ; conflit à priorité égale → rien appliqué, les deux règles remontées ; conflit à priorités différentes → la plus haute gagne ; `categorieVerrouillee` qui bat une règle ; actions multiples dans l'ordre ; `MOT_ENTIER` : « PAIE » reconnaît « DEPOT PAIE », pas « Paiement. » |
| ordre complet | une ligne qui traverse filtres → bénéficiaire → règles → défaut, dans le bon ordre |

Le seed sert de jeu de données : les règles en conflit, les trois graphies du même marchand et les 18 mois d'historique sont là pour ça.

Une Server Action n'a pas besoin d'un test unitaire si la logique qu'elle orchestre est testée dans `domain/`. Ce qui doit l'être : la persistance d'un lot d'import, testée contre `budgapp_dev`, avec vérification qu'un ré-import du même texte n'écrit rien, qu'une sous-catégorie choisie sur une ligne en conflit est celle qui est persistée (§6.3), et qu'un actif porte deux passifs (§4.1).

---

## 10. Découpage en tranches

M1 ne passe pas en un seul `/ship`. Six tranches, dans cet ordre — chacune laisse l'arbre vert et mérite son commit.

| # | Tranche | Contenu |
|---|---|---|
| 1 | **Socle serveur** | `src/server/db.ts`, le patron de repository, le patron d'écran de référentiel, la migration §3.3 |
| 2 | **Référentiel simple** | comptes, catégories, sous-catégories, étiquettes, filtres |
| 3 | **Bénéficiaires** | liste, champs de comportement, fusion avec proposition par similarité |
| 4 | **Parser** | `domain/statement/` complet, les fixtures, les tests |
| 5 | **Règles** | `domain/categorization/`, l'éditeur de règles, l'application rétroactive avec aperçu |
| 6 | **Import** | le pipeline, la revue à quatre sections, la persistance |

La tranche 4 a besoin des fixtures (§5.6) : si elles ne sont pas là, elle s'arrête. Les tranches 4 et 5 ne dépendent pas l'une de l'autre.

Exemple de demande bien formée, pour la tranche 4 :

```
/ship porte le parser de relevés dans src/domain/statement/ selon docs/lot-m1.md §5 :
analyserReleve avec les profils d'import, la reconnaissance portée du v1
(docs/description-fonctionnelle-v1.md §5.2), les cents préservés et les lignes
rejetées avec leur raison. Fixtures dans src/domain/statement/fixtures/.
```

---

## 11. Critère de sortie

- [ ] `npx tsc --noEmit`, `npm run lint` et `npx vitest run` passent.
- [ ] Le référentiel se gère **entièrement** depuis l'interface : créer, modifier, supprimer un compte de chaque type, une catégorie, une sous-catégorie, un bénéficiaire, une étiquette, un filtre, une règle.
- [ ] Deux bénéficiaires du seed portant le même marchand sous deux graphies se fusionnent, et les transactions suivent.
- [ ] Un **vrai** relevé Desjardins collé produit les bonnes transactions en base : dates justes, cents justes, sens juste, descriptions normalisées.
- [ ] Le **même** relevé recollé n'écrit rien et affiche N doublons.
- [ ] Une ligne non reconnue apparaît dans la revue et se saisit à la main.
- [ ] Une ligne écartée par un filtre apparaît comme filtrée et se réintègre d'un clic.
- [ ] Les deux règles en conflit du seed produisent une ligne `aRevoir` avec les deux règles nommées, et rien d'appliqué.
- [ ] Une règle appliquée rétroactivement montre son aperçu avant d'écrire et pose `appliedRuleId`.
- [ ] `INDEX.md` est à jour : carte du code, état des lots, journal des décisions.

## 12. Hors périmètre

Consultation des transactions enregistrées, recherche, pagination, réattribution en masse (M2). Ventilations et virements (M2) — l'action `VENTILER` reste absente de l'éditeur de règles (§4.6). Détection de récurrences, rapprochement, ancrages de solde et réconciliation (M3). Cibles d'enveloppe et tout l'écran Budgets (M4). Import CSV et OFX, et le modèle `ImportProfile` (M9). Glisser-déposer des sous-catégories (M9). `LoanTerm` (M6).
