# Lot M2 — consultation

*Spécification du 4 octobre 2026, écrite par l'architecte du mode pilote (unité M2-S). Exécutable sans revenir au projet Claude.*

Documents à lire avant de coder : `CLAUDE.md` (conventions, non négociable) · `docs/lot-m1.md` (ce dont on hérite, en particulier §5.8, §6 et §8.2) · `docs/lot-m0-revision.md` §3 et §5 (ventilation, virement, les cinq invariants) · `docs/modele-objectifs-patrimoine.md` §3.2 (virements) · `docs/modele-budget-prevision.md` §2.1 (ce que l'activité d'une enveloppe exclut) · `docs/referentiel-fonctionnalites.md` §4 (la transaction).

---

## 1. Le lot en une phrase

**L'application est utilisable sans Prisma Studio, et un paiement de carte ne compte pas deux fois** (`docs/plan.md` §6).

Concrètement : chaque transaction enregistrée se retrouve, se lit, se corrige, se supprime, se ventile et se lie en virement depuis l'interface ; on en saisit une à la main ; on en réattribue cent d'un geste. Et quand le relevé du compte chèque et celui de la Visa portent les deux côtés du même paiement, ils deviennent **un virement** — une paire symétrique liée, hors budget des deux côtés — au lieu d'une dépense et d'un revenu.

M2 solde aussi les dettes que M1 lui a laissées (§10). Elles sont nombreuses, souvent petites, et réparties dans des tranches à part pour ne pas noyer la consultation.

## 2. Ce dont on hérite de M1

À ne pas réécrire.

| | |
|---|---|
| `src/domain/ingestion/` | `preparerRevue`, dédoublonnage en trois couches, résolution du bénéficiaire, `calculerEmpreinte` |
| `src/domain/categorization/` | moteur de règles, conflits à priorité égale, `ACTION_NON_SUPPORTEE` pour `VENTILER` |
| `src/server/repositories/transactions.ts` | balayage borné (`LIMITE_BALAYAGE`), `appliquerModifications`, lectures pour le dédoublonnage — « M2 l'étendra » |
| `src/server/repositories/import-batches.ts` | la persistance d'un lot d'import, en une `$transaction` |
| `src/features/import/` | la revue à quatre sections, `etat-revue.ts`, `versLigneImport` |
| `src/components/referentiel/` | patron d'écran de référentiel, `DialogueFormulaire`, `ChampCouleur` |
| `e2e/` | parcours Playwright (`mobile` 375 px, `bureau` 1280 px), `outils/debordement.ts` (dont `ELEMENT_ROGNE`), `outils/revue-import.ts`, mode passe et captures |
| `prisma/coherence.test.ts` | les cinq invariants — **ne se contournent pas** |

## 3. Les points que ce document tranche

Ne les rouvre pas sans le dire.

### 3.1 Le type d'opération est persisté

`docs/lot-m1.md` §5.8 laissait la question à M2. **Réponse : oui.** Une migration additive ajoute `Transaction.typeOperation String?` ; l'import l'écrit à partir de `LigneEnRevue.typeOperation` ; la consultation l'affiche sous la description, en lecture seule, et la recherche texte le couvre (§5.2). Les transactions importées avant M2 gardent `null` — `ligneBrute` n'étant pas stocké, rien ne permet de le reconstituer, et c'est accepté.

Il n'entre ni dans l'empreinte, ni dans les conditions de règle, ni dans le dédoublonnage : ces contrats ne changent pas.

### 3.2 L'empreinte ne se recalcule jamais

L'empreinte identifie la **ligne source**, pas l'état courant de la transaction. Modifier la description, la date ou le montant d'une transaction ne la change pas : un recollage du même relevé continue de reconnaître la ligne comme `EMPREINTE_EXISTANTE`. Deux cas fabriquent une empreinte hors relevé :

| Cas | Empreinte |
|---|---|
| saisie manuelle (§6.3) | `calculerEmpreinte(accountId, date, montantCents, descriptionNormalisee)`, comme une ligne importée ; une collision retourne `DUPLICATE` avec un message qui invite à distinguer la description |
| ligne fille de ventilation, contrepartie créée d'un virement | une empreinte **dérivée**, de forme `calculerEmpreinte` appliquée à une chaîne qui ne peut pas sortir d'un relevé (préfixe `ventilation:` + empreinte du parent + rang, ou `virement:` + id de l'autre côté) ; une fonction du domaine, testée, unique par construction |

### 3.3 Date et montant d'une transaction importée sont en lecture seule

Ils viennent de la banque. Les modifier serait « modifier une transaction passée pour faire coller un solde » (`CLAUDE.md` §15) : l'ajustement daté arrive avec M3. Seules les transactions `source: MANUELLE` ont une date et un montant modifiables. Tout le reste (description, bénéficiaire, sous-catégorie, note, étiquettes, à revoir, exclusions) se modifie quelle que soit la source.

### 3.4 Un virement n'est jamais catégorisé en M2

L'invariant 5 de `prisma/coherence.test.ts` dit qu'une transaction catégorisée n'est jamais un côté de virement. `docs/modele-objectifs-patrimoine.md` §3.2 veut au contraire que la sortie d'un compte budgétaire vers un compte de suivi (cotisation REER, CELIAPP) soit catégorisée dans une enveloppe d'épargne. Les deux documents se contredisent ; **M2 ne tranche pas cette contradiction** : elle appartient à M7, qui spécifiera les comptes de suivi, et c'est la spec de M7 qui proposera d'amender l'invariant.

En M2, donc : lier deux transactions en virement **retire la sous-catégorie des deux côtés** (et `appliedRuleId`), le dialogue le dit avant d'écrire (« La sous-catégorie Épicerie de la ligne du 3 août sera retirée »), et aucune action ne peut poser une sous-catégorie sur un côté de virement (`CONFLICT`, message explicite). Délier ne restaure pas l'ancienne sous-catégorie : la ligne redevient ordinaire, non catégorisée.

### 3.5 Supprimer un côté de virement

`docs/modele-objectifs-patrimoine.md` §8, invariant 10 : « supprimer un côté supprime ou délie l'autre ». Le schéma porte `onDelete: SetNull` sur `contrepartie`, ce qui laisserait l'autre côté avec un `transferAccountId` orphelin. La suppression passe donc toujours par une action qui demande : **supprimer les deux** ou **supprimer celle-ci et délier l'autre** (l'autre perd `transferAccountId` et `transferTransactionId`), en une `$transaction`. Pas de migration.

`Transaction.compteContrepartie` en `SetNull` (journal d'`INDEX.md`, 2026-09-14, « à trancher en M2 ») reste tel quel : un compte qui porte des transactions ne se supprime pas (`docs/lot-m1.md` §4.1), et la contrepartie d'un virement est une transaction de ce compte. Le cas ne peut pas se produire.

### 3.6 La ventilation à un seul niveau

Une ligne fille ne se ventile pas. Un parent ventilé n'est pas un côté de virement, et un côté de virement ne se ventile pas (`CONFLICT`). Ces trois refus sont des règles du domaine, testées.

---

## 4. Le modèle

### 4.1 Ce qui change dans le schéma

Une seule migration, additive : `Transaction.typeOperation String?` (§3.1). Toute autre envie de toucher au schéma est une question, pas une décision.

### 4.2 Ventilation — `src/domain/ventilation/`

Une ligne fille est une `Transaction` avec `parentId` ; le parent porte `estVentilee = true` et `subcategoryId = null` ; la somme des filles égale le parent (invariant 2). Ce que le domaine fournit, en fonctions pures :

- `validerVentilation(parent, lignes)` → liste d'erreurs nommées : moins de deux lignes, une ligne à zéro, une ligne de signe opposé au parent, somme ≠ parent (l'écart est dans le message : « Il reste 12,40 $ à répartir »), parent qui est un virement ou une ligne fille ;
- `repartirParPourMille(montantCents, parts)` → montants des lignes, la dernière absorbant l'arrondi pour que la somme soit exacte (même convention que `RecurringSplit.partMille`) ;
- `empreinteLigneFille(empreinteParent, rang)` (§3.2).

Chaque ligne fille porte : `subcategoryId` (nullable), `montantCents`, `details` (note), ses étiquettes. Elle hérite du parent : `ownerId`, `accountId`, `date`, `description`, `descriptionNormalisee`, `typeOperation`, `payeeId`, `source`.

Ventiler, modifier une ventilation, déventiler : chaque fois **une** `$transaction` qui remplace l'ensemble des filles. Déventiler supprime les filles et remet `estVentilee` à `false`, sans sous-catégorie.

### 4.3 L'action de règle `VENTILER`

M2 l'implémente et **retire le garde-fou temporaire** `actionsVentilationIgnorees` (`docs/lot-m1.md` §6.3) : code, encart de la revue, tests qui le visaient, mention dans `lot-m1.md` marquée « retiré en M2 ».

- `RuleAction.valeur` porte un JSON validé par zod : `[{ subcategoryId, partMille }]`, au moins deux lignes, parts entières positives qui somment à 1000. L'éditeur de règles propose `VENTILER` avec un éditeur de lignes (sous-catégorie + pourcentage à une décimale) et refuse une somme ≠ 100 %.
- **`VENTILER` occupe le créneau `SOUS_CATEGORIE`.** Il entre en conflit avec `CATEGORISER` et avec un autre `VENTILER` selon §3.2 de M1 : priorités différentes, la plus haute gagne ; égales, rien d'appliqué, ligne `aRevoir`. Une même règle ne porte pas `VENTILER` et `CATEGORISER` (refus du schéma de la règle).
- `categorieVerrouillee` du bénéficiaire bat `VENTILER` comme elle bat `CATEGORISER`.
- À l'import, une ligne ventilée par règle s'affiche dans la revue avec ses lignes filles (montants calculés par `repartirParPourMille`), modifiables ; elle est persistée en parent + filles dans la même `$transaction` que le lot. Choisir une sous-catégorie sur cette ligne dans la revue annule la ventilation (même logique que A6 : le geste vaut arbitrage).
- L'application rétroactive applique `VENTILER` aux transactions qui ne sont ni ventilées, ni filles, ni côtés de virement, ni d'une catégorie corrigée à la main ; l'aperçu montre la ventilation qui serait posée.

### 4.4 Virement — `src/domain/virement/`

Un virement est une paire : `T1.transferTransactionId = T2.id` et réciproquement, `T1.transferAccountId = T2.accountId` et réciproquement, `T1.montantCents + T2.montantCents = 0`, deux comptes différents (invariant 1). Fonctions pures :

- `candidatsVirement(transaction, autres)` → les transactions d'un **autre** compte du même propriétaire, de montant **opposé exact**, à **± 5 jours** (constante nommée `FENETRE_VIREMENT_JOURS`), qui ne sont ni un côté de virement, ni ventilées, ni filles ; triées par écart de date puis par id ;
- `peutLier(a, b)` → les mêmes conditions, avec un motif de refus nommé pour chaque cas ;
- `empreinteContrepartie(idAutreCote)` (§3.2).

Quatre gestes, quatre actions, chacune en une `$transaction` qui revérifie `peutLier` en base (une autre fenêtre a pu lier entre-temps : `CONFLICT`) :

| Geste | Effet |
|---|---|
| **Lier** deux transactions existantes | pose les deux pointeurs ; retire sous-catégorie et `appliedRuleId` des deux côtés (§3.4) |
| **Créer la contrepartie** d'une transaction existante vers un compte choisi | crée l'autre côté (`source: MANUELLE`, même date, montant opposé, description « Virement depuis <compte> » / « Virement vers <compte> »), puis lie |
| **Saisir un virement** (§6.3) | crée les deux côtés et les lie |
| **Délier** | retire les deux pointeurs ; les deux lignes redeviennent ordinaires, non catégorisées |

La suppression suit §3.5.

### 4.5 Le virement à l'import

C'est ce qui règle « un paiement de carte ne compte pas deux fois ».

**Proposition.** `preparerRevue` reçoit en plus les transactions des **autres** comptes du propriétaire dans la fenêtre du relevé ± `FENETRE_VIREMENT_JOURS` (une requête bornée, faite en amont par le repository, passée en argument — comme pour le dédoublonnage). Pour chaque ligne à importer, `candidatsVirement` donne ses candidats. La `LigneEnRevue` gagne `candidatsVirement` (lecture seule) et `virementAvec: string | null` (modifiable). Quand il y a **exactement un** candidat, `virementAvec` est pré-rempli (Benjamin, Q-4, 2026-10-04) et la ligne montre ce candidat en clair — compte, date, montant — pour qu'il se confirme ou se décoche d'un coup d'œil ; à plusieurs, rien n'est pré-rempli et la ligne affiche « N virements possibles » avec un choix qui les liste tous. Après l'import, tout ce qui est lié se retrouve par le filtre « virements seulement » de la consultation (§5.2) et se lie ou se délie à la main (§4.4). Une ligne marquée virement n'a ni sous-catégorie ni ventilation : la revue les vide en le disant, et les règles `CATEGORISER` / `VENTILER` ne s'y appliquent pas (les autres actions, si). Deux lignes du même lot ne se proposent jamais l'une à l'autre (même compte). Deux lignes du lot qui visent le même candidat : la seconde est bloquée avec un message, comme un conflit.

**Persistance.** Dans la `$transaction` du lot : création de la ligne, puis pose des deux pointeurs, retrait de la sous-catégorie de l'autre côté, après revérification que l'autre côté n'est toujours lié à rien (sinon `CONFLICT` pour tout le lot, « Rien n'a été enregistré »).

**Côté déjà enregistré.** Une contrepartie créée à la main (§4.4) puis le relevé du compte qui la porte : la ligne du relevé a une autre description, donc une autre empreinte, et serait importée une seconde fois. Le dédoublonnage gagne donc un statut **`VIREMENT_EXISTANT`** : même compte, même `montantCents`, date à ± 3 jours, et la transaction existante est un côté de virement. `action` passe à `IGNORER` par défaut, la ligne va dans la section **Doublons** avec le virement existant en regard (« Déjà enregistré comme virement depuis Chèque, le 3 août »), réactivable comme un doublon d'empreinte.

---

## 5. La consultation — `/transactions`

### 5.1 La lecture paginée

Repository : `listerTransactions(ownerId, filtres, tri, curseur)` — **pagination par curseur** (clé `(cléDeTri, id)`, jamais `skip`), pages de 50, `select` minimal, une requête pour la page, une pour le compte et la somme filtrés (`count` + `_sum`). Les lignes filles ne sont jamais des lignes de la liste : le parent est listé, ses filles viennent avec lui (un `select` imbriqué borné, pas de N+1). Côté client : `useInfiniteQuery`, bouton « Charger plus » (pas de défilement infini automatique : il casse le pied de page et l'accessibilité clavier), clés de `lib/query-keys.ts`.

### 5.2 Filtres et tri

Tous les filtres vivent **dans l'URL** (`searchParams`) : un lien filtré se partage, le retour arrière fonctionne, la page reste un Server Component qui passe les filtres initiaux. Un schéma zod unique (`features/transactions/schema.ts`) les valide côté page et côté action.

| Filtre | Détail |
|---|---|
| période | celle de la barre de période (§5.5) ; ou « du / au » explicites |
| texte | sur la description, le type d'opération, le nom du bénéficiaire et la note ; **insensible à la casse et aux accents** (« cafe » trouve « Café » — `unaccent` est installé, `$queryRaw` balisé si Prisma ne suffit pas) |
| comptes | plusieurs |
| sous-catégorie | plusieurs, plus « Non catégorisée » ; un parent ventilé correspond si l'une de ses filles correspond |
| bénéficiaire, étiquette | plusieurs |
| montant | min / max, sur la valeur absolue ; sens : entrées / sorties / tout |
| état | à revoir · virements (inclure / seulement / exclure) · ventilées seulement · exclues du budget · exclues des rapports |

Tri : date (défaut, décroissante) ou montant, croissant ou décroissant ; à clé égale, par `id`. Les filtres actifs s'affichent en pastilles retirables, plus « Tout effacer ».

### 5.3 L'écran

**En-tête** : nombre de transactions et somme filtrées (« 214 transactions · −3 482,17 $ »), bouton « Nouvelle transaction », bouton « Filtres ».

**Bureau (≥ `md`)** — un tableau : case de sélection, date, compte, description (type d'opération dessous, en petit), bénéficiaire, sous-catégorie, étiquettes, montant (IBM Plex Mono tabulaire, rouge / vert), une colonne d'état (icônes à libellé accessible : à revoir, virement → nom de l'autre compte, ventilée, exclue). Bénéficiaire et sous-catégorie se modifient **en place** par un sélecteur dans la cellule ; le reste par le panneau de détail. Un parent ventilé se déplie sur ses lignes filles.

**Mobile (< `md`)** — une liste de cartes : date et montant en tête, description, bénéficiaire et sous-catégorie, pastilles d'état ; toucher la carte ouvre le panneau de détail. La sélection multiple s'active par un bouton « Sélectionner », qui fait apparaître les cases. Aucun défilement horizontal.

Une cellule n'importe **que** le hook de lecture ; les mutations sont instanciées une fois, au niveau de l'écran, et passées en rappel (`CLAUDE.md` §8 — défaut corrigé de la v1).

**Panneau de détail** (`Sheet`, plein écran en mobile) — tous les champs que l'import écrit, lisibles : compte, date, description, type d'opération, montant, bénéficiaire, sous-catégorie, note, étiquettes, à revoir, exclure du budget, exclure des rapports, source, lot d'import (date), règle appliquée (son libellé), état de rapprochement (lecture seule, M3), contrepartie d'un virement (lien vers elle), lignes de ventilation. C'est le critère « utilisable sans Prisma Studio » : **aucun champ que M1 écrit n'est invisible**. Actions : modifier, supprimer, ventiler / modifier la ventilation / déventiler, lier en virement / créer la contrepartie / délier, créer une règle depuis cette transaction (ouvre « Nouvelle règle » pré-remplie : condition `DESCRIPTION` `CONTIENT` la description, action `CATEGORISER` la sous-catégorie courante).

### 5.4 États vides et erreurs

Aucune transaction : un message et le lien vers l'import. Aucun résultat pour les filtres : un message et « Tout effacer ». Une action en échec : un toast avec le `message` de l'`ActionResult`, et la ligne revient à son état serveur.

### 5.5 La barre de période devient vivante

`src/components/navigation/period-bar.tsx` est statique depuis M0. En M2 : segmenté **Mois / Année / Tout**, flèches ‹ › (mois ou année précédents et suivants), indicateur « N à revoir » qui mène à `/transactions` filtré sur `aRevoir`, bouton « Importer un relevé » à droite (`docs/plan.md` §7.1). La période choisie survit à la navigation entre onglets (paramètre d'URL propagé ou cookie, au choix du planner, justifié). En mobile, la barre tient en 375 px sans débordement : l'indicateur et le bouton se réduisent à leur icône avec libellé accessible.

---

## 6. Les écritures

### 6.1 Édition

Une action `modifierTransaction` : champs partiels, validés par zod, appartenance vérifiée. Règles :

- changer la sous-catégorie à la main met `appliedRuleId` à `null` (règle 7, même décision que M1-P6) ;
- date et montant refusés hors `source: MANUELLE` (§3.3) ; sur un côté de virement manuel, le montant se modifie des deux côtés en même temps, ou pas du tout ;
- sous-catégorie refusée sur un parent ventilé et sur un côté de virement (`CONFLICT`, message qui dit pourquoi et quoi faire) ;
- la description modifiée recalcule `descriptionNormalisee`, pas l'empreinte (§3.2).

### 6.2 Suppression

Une transaction, ou une sélection. Confirmation qui dit ce qui part : « 3 transactions, dont 1 ventilée (ses 3 lignes partent avec elle) et 1 côté de virement ». Un côté de virement pose la question de §3.5 ; dans une suppression en masse, le choix s'applique à tous les virements de la sélection.

### 6.3 Saisie manuelle

« Nouvelle transaction » : compte, date (aujourd'hui par défaut, via `domain/dates.ts`), description, montant (chaîne saisie, convertie par le schéma partagé — `CLAUDE.md` §11), bénéficiaire (existant ou nouveau), sous-catégorie, note, étiquettes. Une bascule **« Virement vers un autre compte »** remplace la sous-catégorie par le compte de destination et crée les deux côtés (§4.4). `source: MANUELLE`, empreinte calculée (§3.2). Le formulaire remet à neutre ce qui dépend de la bascule, valeur et erreurs (`CLAUDE.md` §9).

### 6.4 Réattribution en masse

Sur une sélection (cases, ou « tout sélectionner » qui couvre **tout le résultat filtré**, pas seulement la page chargée — l'écran dit combien) : poser une sous-catégorie, poser un bénéficiaire, ajouter ou retirer des étiquettes, marquer / démarquer à revoir, exclure / réintégrer au budget ou aux rapports, supprimer. Une seule action, une seule `$transaction` (le délai de `TIMEOUT_TRANSACTION_MS` s'applique), sélection bornée à `LIMITE_BALAYAGE`. Les lignes qui ne peuvent pas recevoir la modification (sous-catégorie sur un virement ou un parent ventilé) sont **sautées et comptées** : « 47 modifiées, 3 ignorées : virements ou ventilées ». Rien n'est ignoré en silence.

---

## 7. La couche serveur

Repositories : `transactions.ts` grandit (lecture paginée, détail, écriture, suppression, ventilation, virement) ; s'il dépasse la lisibilité, il se découpe en `transactions-lecture.ts` / `transactions-ecriture.ts`, jamais en un fichier par écran. Actions : `server/actions/transactions.ts`, toutes par `defineAction` (ou `defineActionProprietaire`), `ActionResult` typé, `ownerId` partout, `updateTag`/invalidation adaptée après mutation.

Hooks : `useTransactions(filtres)` (lecture, infinie), `useTransaction(id)` (détail), `useTransactionMutations()` (écritures) — trois hooks, lecture et écriture séparées.

Rappels qui mordent ici : jamais de `findMany` sans `take` ; aucun agrégat dénormalisé (le compte et la somme filtrés sont une requête, pas une colonne) ; pas de N+1 sur les filles ou les étiquettes.

---

## 8. Tests exigés

| Module | Cas |
|---|---|
| `domain/ventilation/` | `validerVentilation` : chaque motif de refus ; `repartirParPourMille` : somme exacte sur des montants qui ne se divisent pas (`−10001` en 333/333/334), signe conservé ; empreinte dérivée stable et distincte de toute empreinte de ligne |
| `domain/virement/` | `candidatsVirement` : montant opposé exact, ± 5 jours inclus, 6 jours exclu, même compte exclu, déjà lié exclu, ventilée ou fille exclue, ordre par écart de date ; `peutLier` : chaque motif |
| `domain/ingestion/` | proposition de virement à l'import (zéro, un — pré-rempli —, deux candidats) ; deux lignes du lot sur le même candidat ; `VIREMENT_EXISTANT` (± 3 jours, autre description, `IGNORER` par défaut) ; ligne marquée virement : ni sous-catégorie ni ventilation ; ventilation par règle appliquée à une ligne |
| `domain/categorization/` | `VENTILER` : appliquée seule ; en conflit à priorité égale avec `CATEGORISER` → rien d'appliqué ; priorité plus haute gagne ; battue par `categorieVerrouillee` ; JSON invalide refusé |
| intégration (schéma `test`) | lecture paginée : deux pages sans trou ni doublon à dates égales, chaque tri ; filtres texte sans accents, sous-catégorie qui trouve un parent par sa fille ; édition (règle 7 sur `appliedRuleId`, refus de §3.3 et §6.1) ; suppression d'un côté de virement, les deux options ; ventiler / modifier / déventiler ; lier / délier / créer la contrepartie, avec `CONFLICT` quand l'autre côté a été lié entre-temps ; réattribution en masse avec lignes sautées comptées ; import d'un lot qui crée un virement ; contrôle serveur `appliedRuleId` / `subcategoryId` (§10.1) ; **après chacune de ces écritures, les invariants 1, 2 et 5 tiennent** (vérification réutilisable, pas recopiée) |
| `actions/define-action` | un message zod d'un champ remonte jusqu'à l'`ActionResult` (§10.1) |
| e2e (Playwright, 375 et 1280 px) | les parcours du critère de sortie (§12), plus le contrôle de débordement sur chaque nouvel écran et dialogue |

Le parcours e2e du paiement de carte s'appuie sur deux extraits **inventés** au format AccèsD (un chèque qui porte « Paiement facture - AccèsD Internet /VISA DESJARDINS », une Visa qui porte « Paiement. » du même montant), ajoutés aux fixtures par le planner, sans aucune donnée réelle.

## 9. Ce que `test:reel` gagne

`npm run test:reel` rapporte, pour chaque paire de mois chèque / Visa présente dans `donnees-reelles/accesd/`, les propositions de virement qu'aurait faites la revue (nombre, montants masqués comme le reste de la sortie). C'est un **constat non bloquant** : le vrai paiement de la Visa peut partir d'un compte dont on n'a pas le relevé. La sortie dit « aucune paire éprouvée » quand c'est le cas, pour qu'un 0 ne passe pas pour une preuve.

---

## 10. Les dettes reprises de M1

Chaque point vient de `docs/pilotage/feuille-de-route.md` (unité M2-S) ou du journal d'`INDEX.md` ; la passe de sortie de M2 les vérifie comme le reste.

### 10.1 Socle (tranche 1)

1. **`defineAction` écrase les messages zod** (journal d'`INDEX.md`, 2026-09-29) : sur un échec de validation, `message` devient le premier message zod lisible (champ nommé quand il y en a un), `details` garde les erreurs par champ ; le hook client les fait remonter. Les filets serveur qui doublaient le client pour contourner ce défaut restent, mais leurs messages deviennent ceux du schéma partagé.
2. **Contrôle serveur de `appliedRuleId`** à l'enregistrement d'un import : la règle nommée doit poser exactement la `subcategoryId` reçue (ou la ventilation reçue), sinon `appliedRuleId` est enregistré `null` — pas un refus du lot.
3. **`typeOperation` persisté** (§3.1), migration et écriture à l'import.
4. **Renvois à `.pipeline/`** : les ~70 commentaires de `src/` et `e2e/` qui citent `.pipeline/spec.md` ou `changes.md` (fichiers éphémères, non suivis) sont remplacés par la section de `docs/lot-mN.md` qui fait foi, ou supprimés ; règle ajoutée à `CLAUDE.md` §13 : « un commentaire ne cite jamais `.pipeline/` ». Garde-fou : un test (ou une règle de lint) qui échoue si `src/` ou `e2e/` contient `.pipeline/`.
5. **Anonymisation des fixtures** : employeurs réels des lignes « Paie » de la fixture chèque (deux noms d'employeur, repris dans `operation.test.ts`, `analyser.test.ts`, `cas-limites.txt`, `docs/lot-m1.md`) et références de facture d'abonnement (`I0…-…`) des fixtures Visa, remplacés par des noms et références inventés. Les montants et soldes ne bougent pas. Les `.json` attendus et la garde de `fixtures.test.ts` sont réécrits **par le planner, dans la spec**, au titre de l'anonymisation — pas pour faire passer un test.

### 10.2 Revue d'import (tranche 6)

1. Tooltip de conflit lisible au toucher (journal d'`INDEX.md`, 2026-09-29) : le détail du conflit s'ouvre par un geste tactile (popover ou panneau), pas seulement au survol.
2. Étiquettes visibles des sélecteurs bénéficiaire et sous-catégorie dans les cartes de revue en mobile.
3. Nom de compte long dans le sélecteur de la revue : tronqué avec le nom complet accessible, sans élargir la carte.
4. Libellé « Importe sans sous-catégorie » (à reformuler en français correct : « Sera importée sans sous-catégorie »).
5. En-têtes de colonnes des sections Doublons et Filtrées en bureau, sur le modèle de « À importer » (une seule définition de colonnes, M1-C3).
6. Récapitulatif cohérent après une réintégration : la section ne peut plus dire « 1 ligne(s) à importer » et « Aucune ligne à importer. » en même temps ; pluriels écrits, pas `(s)`.
7. Survol de l'en-tête de `SectionRepliable` : marge intérieure, la bande de survol ne colle plus au texte.
8. Champ date de `SectionNonReconnues.tsx` contrôlé en e2e comme celui de la revue (`scrollWidth ≤ clientWidth`).
9. `e2e/outils/revue-import.ts` (`mesurerChampsDateDansLaPage`) : plafond `MAX` vérifié à chaque ajout, écart explicite si `parentElement` est nul.
10. `e2e/outils/debordement.ts` : l'exclusion « parent déjà signalé » couvre toute la descendance (l'élément écarté entre dans `signales`) ; la limite documente l'ancêtre rognant qui n'est pas le bloc conteneur ; un **test synthétique** prouve qu'`ELEMENT_ROGNE` attrape un en-tête rogné.
11. Parcours e2e : un extrait Visa collé sur un compte Carte de crédit, enregistré, puis **vérifié dans l'écran de consultation** (achats en sortie, paiement en entrée) — dette C3 de la passe M1.
12. Parcours e2e : une ligne `aRevoir` arbitrée dans la revue, enregistrée, puis vérifiée dans l'écran de consultation (sous-catégorie choisie, `appliedRuleId` vide dans le détail, drapeau tel que laissé) — dette C4 de la passe M1.

### 10.3 Mobile et Paramètres (tranche 7)

1. En mobile, un toast ne recouvre jamais une barre d'action de dialogue (« Appliquer » de l'aperçu rétroactif caché ~4 s) : position ou décalage des toasts quand un dialogue est ouvert, avec un contrôle e2e (`elementFromPoint` au centre du bouton d'action, pendant qu'un toast est affiché).
2. Barre principale et onglets des Paramètres atteignables en mobile, onglet actif visible (défilement vers l'onglet actif ou menu), avec un parcours qui navigue **par l'interface** vers chaque onglet.
3. Règles : double colonne « Actions » du tableau ; sélecteur « Opérateur » et interrupteur « Active » rognés dans « Nouvelle règle » en mobile.
4. Projet Playwright `mobile` avec `hasTouch: true` ; les parcours existants passent (tap là où un clic supposait une souris).

---

## 11. Découpage en tranches

Sept tranches, dans cet ordre ; chacune laisse l'arbre vert et mérite son commit.

| # | Tranche | Contenu | Dépend de |
|---|---|---|---|
| 1 | **Socle et dettes** | §10.1 en entier ; la vérification réutilisable des invariants 1, 2, 5 (§8) | — |
| 2 | **Lecture** | §5 : repository paginé, filtres, tri, écran bureau et mobile, panneau de détail en lecture, barre de période vivante, états vides | 1 |
| 3 | **Écriture** | §6 : édition en place et dans le détail, suppression (un côté de virement y est refusé avec un message, en attendant le choix de §3.5 posé en tranche 5), saisie manuelle sans virement, réattribution en masse, « créer une règle depuis » | 2 |
| 4 | **Ventilations** | §4.2, §4.3 : domaine, écran de ventilation, `VENTILER` dans les règles, l'import et la rétroaction, retrait du garde-fou | 3 |
| 5 | **Virements** | §3.5, §4.4, §4.5, §9 : domaine, lier / délier / créer la contrepartie / saisir, suppression d'un côté, proposition à l'import, `VIREMENT_EXISTANT`, `test:reel` | 3 |
| 6 | **Revue d'import** | §10.2 | 2 (parcours 11 et 12) |
| 7 | **Mobile et Paramètres** | §10.3 | — |

Les tranches 4 et 5 ne dépendent pas l'une de l'autre, mais toutes deux modifient `preparerRevue` et la revue : les faire **dans l'ordre**, pas en parallèle.

---

## 12. Critère de sortie

Chaque point est vérifié par un test automatisé ; la passe de sortie (`verificateur`) les reprend un à un.

1. `npm run check` passe (lint, `tsc --noEmit`, Vitest, dont les cinq invariants de `prisma/coherence.test.ts`).
2. **Sans Prisma Studio** — parcours e2e, aux deux largeurs : retrouver une transaction du seed par une recherche sans accents, la filtrer par compte et sous-catégorie, trier par montant, charger une deuxième page sans doublon ; ouvrir son détail et y lire chaque champ de §5.3 ; modifier bénéficiaire et sous-catégorie en place ; saisir une transaction manuelle puis la supprimer.
3. **Réattribution en masse** — parcours e2e : sélectionner tout le résultat d'un filtre (plus d'une page), poser une sous-catégorie, lire le compte rendu « N modifiées, M ignorées » ; les lignes ignorées sont les virements et ventilées de la sélection.
4. **Ventilation** — parcours e2e : ventiler une transaction en trois lignes, être empêché d'enregistrer tant que la somme ne tombe pas juste (message « Il reste … à répartir »), enregistrer, la déplier dans la liste, la déventiler. Test d'intégration : une règle `VENTILER` appliquée à l'import produit un parent et des filles qui somment exactement.
5. **Un paiement de carte ne compte pas deux fois** — parcours e2e sur les deux extraits inventés (§8) : importer le chèque, puis la Visa ; la revue de la Visa propose le virement vers la ligne du chèque ; après enregistrement, le détail montre la paire liée, aucune des deux lignes n'a de sous-catégorie. Test d'intégration : après l'import, aucun des deux côtés n'entre dans l'activité d'une enveloppe (prédicat d'exclusion du domaine) et les invariants 1 et 5 tiennent. Test d'intégration : une contrepartie créée à la main fait passer la ligne du relevé en `VIREMENT_EXISTANT`.
6. **Virements à la main** — parcours e2e : lier deux transactions existantes, délier, saisir un virement, supprimer un côté avec chacune des deux options.
7. **Dettes de M1** — chaque point de §10 a son test ou son contrôle e2e, et il passe ; aucun fichier de `src/` ou `e2e/` ne cite `.pipeline/`.
8. **Débordement** — le contrôle `debordement.ts` (avec `ELEMENT_ROGNE`) passe sur chaque nouvel écran et dialogue de M2, aux deux largeurs ; le mode passe (`npm run e2e:passe`) capture chacun en clair et en sombre.
9. `npm run test:reel` sort en 0 et sa sortie porte la section virements de §9.
10. `INDEX.md` est à jour : carte du code, état du lot, journal des décisions de M2.

## 13. Hors périmètre

Récurrences, rapprochement d'occurrences, ancrages de solde, réconciliation, ajustements datés (M3). Catégorisation d'un virement vers un compte de suivi et amendement de l'invariant 5 (M7, §3.4). Cibles et écran Budgets (M4) — M2 fournit seulement le prédicat d'exclusion de l'activité. Rapports, export (M8). Import CSV et OFX, glisser-déposer, préférence d'arrondi (M9). Lecture du bloc AccèsD et catégorie Desjardins (`docs/lot-m1.md` §5.7). Journal des modifications, pièces jointes, drapeaux (après la v2).
