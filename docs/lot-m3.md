# Lot M3 — récurrences et soldes

*Spécification du 8 octobre 2026, écrite par l'architecte du mode pilote (unité M3-S), révisée le même jour pour appliquer les consignes de Benjamin du 8 octobre (document non publié, repris dans `docs/pilotage/gouvernance.md` §7 : le bureau d'abord, §3.10). Exécutable sans revenir au projet Claude.*

Documents à lire avant de coder : `CLAUDE.md` (conventions, non négociable) · **`docs/modele-ingestion-recurrences.md` §4 et §5** (le modèle que ce lot construit — ce document le précise, il ne le remplace pas) · `docs/lot-m2.md` (ce dont on hérite : consultation, virements, revue d'import) · `docs/referentiel-fonctionnalites.md` §5 et §6 · `docs/modele-budget-prevision.md` §4 (ce que la prévision attendra des récurrences, M5).

---

## 1. Le lot en une phrase

**« Netflix, 17,99 $ le 12 de chaque mois » est détecté, confirmé, et chaque prélèvement est lié à son occurrence** (`docs/plan.md` §6).

Concrètement : l'application repère dans l'historique les séries qui reviennent et les **propose** ; une proposition confirmée devient une règle récurrente dont les échéances passées sont **liées** aux transactions qui les ont réalisées ; à chaque import, une ligne qui correspond exactement à une échéance attendue est rapprochée sous les yeux de l'utilisateur, qui peut la défaire ; une échéance dépassée sans paiement remonte dans une liste. Et chaque compte reçoit des **ancrages de solde** datés : quand le solde déclaré ne colle pas au solde calculé, l'écart se diagnostique, puis s'explique ou se solde par un **ajustement daté** — jamais par une retouche du passé.

Les deux principes du modèle ne se négocient pas (`docs/modele-ingestion-recurrences.md` §7) : **une source de données ne décide jamais** (rien ne se lie sans passer sous les yeux de l'utilisateur, sauf la liaison rétroactive qu'il demande en confirmant), et **un lien est un fait stocké** (`ExpectedOccurrence.transactionId`), jamais une ressemblance recalculée à la lecture.

M3 solde aussi les dettes cosmétiques des passes de sortie de M2 (§10), dans une tranche à part.

## 2. Ce dont on hérite

À ne pas réécrire.

| | |
|---|---|
| Schéma (M0) | `RecurringRule`, `RecurringSplit`, `ExpectedOccurrence` (`transactionId @unique`, `@@unique([ruleId, echeance])`), `RecurrenceSuggestion`, `BalanceStatement` (`@@unique([accountId, date, source])`), `Reconciliation`, énumérations `Cadence`, `NatureRecurrence`, `EtatOccurrence`, `TypeLiaison`, `EtatSuggestion`, `SourceSolde`, `SourceIngestion.AJUSTEMENT`, `Subcategory.systeme` |
| `src/domain/dates.ts` | `echeances(cadence, ancrage, jusqua)` (12 cadences, recalage sur le jour d'origine), `ecartJours`, `ajouterJours`, `ajouterMois`, `dateCivileDansFuseau` |
| `src/domain/money.ts` | `mediane`, `quantile`, `formatMontant`, `parseMontant` |
| `src/domain/ingestion/` | `normaliserDescription`, `calculerEmpreinte`, `preparerRevue` (et sa proposition de virement, `docs/lot-m2.md` §4.5 — le rapprochement d'occurrence suit **le même patron**) |
| `src/server/repositories/transactions-*.ts` | consultation, détail, écritures ; la suppression **refuse déjà** une transaction liée à une occurrence (`estLiee`) |
| `src/features/transactions/` | panneau de détail (qui affiche aujourd'hui `rapprochement` « lecture seule, M3 ») |
| `prisma/seed.ts` | cinq récurrences confirmées + l'hypothèque ventilée, occurrences jusqu'au 2026-12-31, une occurrence `MANQUEE` (Assurance auto, 2026-06-20), relevés de solde tous les deux mois, une réconciliation à écart de 50,00 $ sur Épargne |
| `e2e/` | parcours Playwright (projet `bureau` seul dans la suite courante depuis M3-O1, projet `mobile` conservé pour M9), `outils/debordement.ts`, contrôles de recouvrement et de barre d'action, mode passe filtrable (`npm run e2e:passe -- --ecrans=<motifs>`), parcours ciblés (`npm run e2e:cible -- <fichiers>`) |

## 3. Les points que ce document tranche

Ne les rouvre pas sans le dire.

### 3.1 Aucune migration attendue

Le schéma de M0 porte tout ce dont M3 a besoin. Toute envie de migration est une question remontée, pas une décision du planner.

### 3.2 « Aujourd'hui » est un argument

Aucune fonction du domaine n'appelle l'horloge. Le serveur calcule `aujourdhui = dateCivileDansFuseau(new Date(), FUSEAU_APPLICATION)` et le passe. La **détection**, elle, ne dépend même pas d'aujourd'hui : sa date de référence est la **date de la transaction la plus récente du propriétaire** (§4.2) — un historique qu'on n'a pas importé depuis trois mois ne rend pas toutes les séries « mortes », et les tests sur le seed ne vieillissent pas.

### 3.3 L'état « manquée » se dérive, les autres états se stockent

| État | Comment il naît |
|---|---|
| `PREVUE` | matérialisation (§4.4), ou retour après « délier » / « rétablir » |
| `REALISEE` · `REALISEE_MONTANT_DIFFERENT` | une liaison (rétroactive, à l'import, à la main) ; `REALISEE` si `|montant de la transaction − montant de l'occurrence| ≤ toleranceCents`, sinon `REALISEE_MONTANT_DIFFERENT` |
| `IGNOREE` | geste explicite « ignorer cette échéance » |
| `MANQUEE` | **dérivé à la lecture** : `etatAffiche(occurrence, toleranceJours, aujourdhui)` rend `MANQUEE` pour une occurrence `PREVUE` dont `echeance + toleranceJours < aujourdhui`. Une occurrence **stockée** `MANQUEE` (le seed en a une) se traite exactement comme une `PREVUE` en retard. |

Pourquoi : écrire `MANQUEE` demanderait une tâche planifiée ou une écriture pendant une lecture (un Server Component qui écrit). Ce n'est pas un lien, juste un constat de date : il se calcule.

Une occurrence **ouverte** est une occurrence `PREVUE` ou `MANQUEE` (stockée ou dérivée), sans `transactionId`. Seules les occurrences ouvertes se lient.

### 3.4 Où vivent les écrans

- **Récurrences** : `/transactions/recurrences`, un onglet secondaire de Transactions à côté de la consultation et de l'import (`docs/plan.md` §4.2, « Transactions — Récurrences »). L'onglet « Récurrences » des Paramètres (`docs/plan.md` §7.2) n'est **pas** créé en M3 : un seul écran, pas deux.
- **Soldes et réconciliation** : `/parametres/comptes/[id]`, la fiche du compte, ouverte depuis une action de ligne de Paramètres › Comptes (« Soldes et réconciliation »). La liste des comptes gagne une colonne **Solde** (solde calculé à aujourd'hui, §5.1), calculée par une seule requête groupée.

### 3.5 Une transaction liée à une occurrence ne se supprime toujours pas

Le refus de M2 reste ; son message nomme la récurrence et le geste : « Cette transaction est le paiement de Netflix du 12 août. Délie-la d'abord depuis son détail. » Délier est un clic (§4.6) ; une suppression qui délierait en silence ferait disparaître un fait.

### 3.6 La catégorie de la récurrence est héritée, en dernier recours

À l'import, une ligne rapprochée d'une occurrence (§4.5) qui n'a **aucune** sous-catégorie après les règles (pas de règle, pas de conflit, pas de ventilation, pas de virement) reçoit la `subcategoryId` de la règle récurrente, `appliedRuleId` restant `null` ; la revue l'affiche (« catégorie de la récurrence »). Une règle de catégorisation l'emporte toujours, et un conflit de règles reste un conflit. Pourquoi : `docs/referentiel-fonctionnalites.md` §5 (« zéro doublon, catégorie héritée ») sans donner à la récurrence un pouvoir que le moteur de règles n'a pas.

Une règle récurrente ventilée (`RecurringSplit`, l'hypothèque du seed) ne ventile rien à l'import en M3 : sa ventilation s'affiche en lecture seule sur la série, son application est M6.

### 3.7 Le solde calculé part du solde d'ouverture, pas du dernier ancrage

`docs/modele-ingestion-recurrences.md` §5.1 écrit `solde(date) = dernier ancrage antérieur + Σ transactions`. M3 calcule **`soldeCalcule(date) = soldeInitialCents + Σ montantCents des transactions du compte datées ≤ date`**, lignes filles exclues (le parent porte le montant), virements, ajustements et transactions `EN_ATTENTE` inclus. L'écart d'un ancrage est `soldeCents − soldeCalcule(date)`.

Pourquoi : repartir du dernier ancrage remettrait le compteur à zéro à chaque saisie, et un écart non réglé disparaîtrait de tous les ancrages suivants — exactement « un écart qui se dissout dans les chiffres » que le modèle veut éviter. Partir de l'ouverture garde chaque écart visible jusqu'à ce qu'il soit expliqué ou ajusté, et un ajustement daté corrige d'un coup tous les ancrages postérieurs. Le seed est cohérent avec ce choix (ses relevés sont calculés depuis le solde initial).

### 3.8 L'écart est recalculé, jamais lu dans une colonne

`Reconciliation.ecartCents` garde l'**écart constaté à la saisie** (un fait daté). L'écran affiche l'**écart courant**, recalculé à chaque lecture : une transaction importée après coup dans la période peut le réduire à zéro sans aucun geste. Le statut d'un ancrage se dérive :

| Statut | Condition |
|---|---|
| **Équilibré** | écart courant = 0 (avec ou sans ajustement) |
| **Expliqué** | écart courant ≠ 0 et `explication` renseignée (l'utilisateur accepte l'écart, ex. « transactions de septembre pas encore importées ») |
| **Écart ouvert** | sinon |

Aucune table d'agrégat, aucun statut stocké qui pourrait mentir (`CLAUDE.md` §7).

### 3.9 Le champ `Transaction.rapprochement` n'est pas touché

`EtatRapprochement` (`NON_RAPPROCHEE` / `RAPPROCHEE` / `RECONCILIEE`) décrit le pointage d'un relevé à la Quicken, case par case. M3 ne fait pas de pointage case par case (la réconciliation est par ancrage, §5) : le champ reste à sa valeur par défaut. Dans le panneau de détail, la ligne « État de rapprochement » est **remplacée** par la section « Récurrence » (§4.7). Le pointage est hors périmètre (§13).

### 3.10 Le bureau d'abord

Décision de Benjamin du 8 octobre 2026 (`docs/pilotage/gouvernance.md` §7) : M3 ne décrit **aucun comportement mobile** et son critère de sortie n'a **aucun point mobile**. Écrans, parcours e2e, contrôles visuels et captures se font en largeur bureau (projet Playwright `bureau`, 1280 px). On ne casse pas le mobile exprès — pas de largeur fixe gratuite, les nouveaux écrans gardent les classes réactives habituelles —, mais un défaut qui ne concerne que le mobile ne bloque ni une tranche, ni la passe, ni la fusion : il devient une dette de M9 (`docs/pilotage/feuille-de-route.md`, M9-S). Les dettes propres au mobile des passes de M2 y sont déjà (§10).

---

## 4. Récurrences

### 4.1 Le domaine — `src/domain/recurrence/`

Fonctions pures, testées, sans Prisma. Constantes nommées et exportées (les tests les citent, ne les recopient pas).

| Fonction | Rôle |
|---|---|
| `detecterRecurrences(groupes, reglesActives, refusees, dateReference)` | §4.2 — rend les suggestions |
| `phraseSuggestion(suggestion)` | la phrase lisible de §4.2 |
| `regleDepuisSuggestion(suggestion, groupe)` | les valeurs pré-remplies du dialogue de confirmation (§4.3) |
| `occurrencesAMaterialiser(regle, jusqua)` | §4.4 — les échéances à créer, bornées par `dateFin` |
| `apparierRetroactivement(echeances, transactions, toleranceJours)` | §4.3 — appariement un pour un, avec les transactions restées sans échéance |
| `evaluerRapprochement(ligne, candidats)` | §4.5 — `AUTO` / `A_CONFIRMER` / `AUCUN`, avec ce qui cloche |
| `etatAffiche(occurrence, toleranceJours, aujourdhui)` | §3.3 |
| `etatApresLiaison(montantTransaction, occurrence, toleranceCents)` | `REALISEE` ou `REALISEE_MONTANT_DIFFERENT` (§3.3) |
| `libelleCadence(cadence)` | « tous les mois », « toutes les deux semaines »… (les 12) |

### 4.2 La détection

**Entrée.** Le repository fournit des **groupes** déjà formés en SQL, sans rapatrier l'historique ligne à ligne : une requête `$queryRaw` balisée qui, sur les 24 derniers mois avant la date de référence, groupe les transactions du propriétaire par (`accountId`, `descriptionNormalisee`, signe du montant), garde les groupes d'au moins `MIN_OCCURRENCES = 3` lignes (`HAVING`), et rend pour chacun le tableau trié de (`id`, `date`, `montantCents`, `subcategoryId`, `payeeId`) par `array_agg` / `json_agg`, borné (`LIMIT` sur le nombre de groupes et de lignes par groupe — constantes nommées). Exclues de la requête : les lignes filles, les transactions déjà liées à une occurrence, les ajustements (`source = AJUSTEMENT`). Les virements **restent** : un virement mensuel vers l'épargne est une vraie récurrence pour la prévision.

**Calcul**, pour chaque groupe (`docs/modele-ingestion-recurrences.md` §4.2, rendu exact ici) :

1. intervalles entre dates consécutives (`ecartJours`), médiane `m` ;
2. **cadence** : la première de ce tableau dont la cible est à ± tolérance de `m`, sinon le groupe est écarté :

   | Cadence | Cible (jours) | Tolérance |
   |---|---|---|
   | `HEBDO` | 7 | ± 2 |
   | `AUX_2_SEMAINES` | 14 | ± 2 |
   | `MENSUEL` | 30,44 | ± 3 |
   | `AUX_2_MOIS` | 61 | ± 5 |
   | `AUX_3_MOIS` | 91 | ± 5 |
   | `SEMESTRIEL` | 182 | ± 5 |
   | `ANNUEL` | 365 | ± 5 |

   `AUX_4_SEMAINES` (28 j) et `DEUX_FOIS_PAR_MOIS` (~15 j) ne sont **pas détectés** : leurs cibles chevauchent `MENSUEL` et `AUX_2_SEMAINES` dans les tolérances. Elles restent choisissables dans le dialogue de confirmation et à la création manuelle.
3. **régularité** = écart-type (population) des intervalles ÷ `m` ; le groupe est écarté si elle est ≥ `SEUIL_REGULARITE = 0.15` ;
4. **stabilité** = écart-type des montants absolus ÷ médiane des montants absolus ; `< SEUIL_STABILITE = 0.05` → nature `FIXE`, sinon `VARIABLE` ;
5. **série vivante** : la dernière date du groupe est ≥ `dateReference − 2 × cible` ; sinon écarté (un abonnement résilié ne se propose pas) ;
6. **score** = `0.5 × min(1, (n − 1) / 5) + 0.3 × (1 − régularité / 0.15) + 0.2 × (stabilité < 0.05 ? 1 : max(0, 1 − stabilité))`, arrondi à deux décimales ; proposé si ≥ `SEUIL_SCORE = 0.5` ;
7. **déjà couvert** : écarté si une règle active du même compte a `motifRapprochement` égal au motif du groupe, ou si une suggestion `REFUSEE` porte le même (`accountId`, `motif`, `cadence`).

**Sortie** : `motif` = la description normalisée du groupe ; `montantMedianCents` = `mediane` des montants signés ; `cadence`, `regularite`, `stabilite`, `score`, `nbOccurrences`, `transactionIds`.

**Phrase** (`phraseSuggestion`) : « Netflix.com — 17,99 $, tous les mois vers le 12. 19 occurrences depuis mars 2025. » — libellé (§4.3), montant (« environ 105,00 $ » si `VARIABLE`), cadence en mots, « vers le N » (jour du mois le plus fréquent, le plus petit à égalité) pour les cadences en mois, « le lundi » (jour de la semaine le plus fréquent) pour les cadences en semaines, nombre d'occurrences et mois de la première. Montant en valeur absolue par `formatMontant` (une série d'entrées, comme la paie, dit « reçu » : « Dépôt paie — 2 406,00 $ reçu toutes les deux semaines… »), mois en `fr-CA`.

**Quand la détection tourne.** (a) À la demande, bouton « Rechercher des récurrences » de l'écran ; (b) après chaque import enregistré, **hors** de la `$transaction` du lot : un échec de détection ne fait pas échouer l'import, il se journalise côté serveur. Chaque passage remplace les suggestions `EN_ATTENTE` du propriétaire par les nouvelles (une `$transaction`) ; `ACCEPTEE` et `REFUSEE` restent (historique et filtre du point 7).

### 4.3 Confirmer, refuser

**Refuser** : la suggestion passe `REFUSEE` ; elle ne revient plus (§4.2 point 7).

**Confirmer** ouvre un dialogue pré-rempli par `regleDepuisSuggestion`, modifiable :

| Champ | Pré-remplissage |
|---|---|
| libellé | le nom du bénéficiaire si toutes les transactions du groupe ont le même, sinon le motif en casse de titre (« Netflix.com ») |
| compte | celui du groupe (lecture seule) |
| nature | `FIXE` / `VARIABLE` selon la stabilité |
| montant | `montantMedianCents` (chaîne saisie, schéma partagé — `CLAUDE.md` §11) |
| cadence | la cadence détectée (les 12 au choix) |
| date d'ancrage | pour une cadence en mois : la date du mois de la première occurrence au jour modal (borné à la fin du mois), si elle est à ± tolérance de la première transaction, sinon la date de la première transaction ; pour une cadence en semaines : la date de la première transaction |
| sous-catégorie | la plus fréquente du groupe (aucune si aucune) |
| motif de rapprochement | le motif (modifiable, non vide) |
| tolérance de montant | `FIXE` : 500 ¢ (défaut du schéma) ; `VARIABLE` : `max(500, arrondi(2 × écart-type des montants))` |
| tolérance de jours | celle de la cadence au tableau de §4.2 (2, 3 ou 5) ; 3 pour une cadence non détectée |

À l'enregistrement, **une** `$transaction` :

1. revérifie la suggestion (`EN_ATTENTE`, du propriétaire — sinon `CONFLICT`) et relit les transactions de `transactionIds` (du propriétaire, existantes, non liées ; celles qui ne le sont plus sont **comptées**, pas silencieuses) ;
2. crée la `RecurringRule` (`scoreConfiance` = score de la suggestion) ;
3. matérialise ses occurrences jusqu'à l'horizon (§4.4) ;
4. **liaison rétroactive** : `apparierRetroactivement` forme toutes les paires (transaction, échéance) à ± `toleranceJours` et les attribue **par distance croissante** — la transaction la plus proche d'une échéance l'emporte —, à égalité l'échéance la plus ancienne, puis la transaction la plus ancienne ; une transaction sans échéance libre dans la tolérance reste non liée (comptée) ; chaque paire devient `transactionId`, `liaison = RETROACTIVE`, `lieeLe = now()`, état par `etatApresLiaison` ;
5. passe la suggestion `ACCEPTEE`.

Le compte rendu (toast puis la série affichée) dit tout : « Récurrence Netflix créée : 19 paiements liés. » — et, s'il y a lieu, « 2 transactions sans échéance correspondante n'ont pas été liées » avec leur date et montant, et « 1 échéance passée sans paiement » (elle apparaît dans les paiements attendus non vus). Rien ne disparaît en silence.

### 4.4 La matérialisation des occurrences

Une règle ne crée jamais de transaction : elle crée des `ExpectedOccurrence` (`docs/referentiel-fonctionnalites.md` §6). `occurrencesAMaterialiser(regle, jusqua)` = `echeances(cadence, dateAncrage, min(jusqua, dateFin))`, montant = `montantCents` de la règle (sa médiane pour `VARIABLE`). L'écriture est **idempotente** : `createMany({ skipDuplicates: true })` sur `@@unique([ruleId, echeance])`.

Horizon : `aujourdhui + HORIZON_OCCURRENCES_MOIS` (12). La prolongation est appelée par les actions qui écrivent déjà : confirmation, création et modification d'une règle, préparation et enregistrement d'un import. Jamais par une lecture.

### 4.5 Le rapprochement à l'import

`docs/modele-ingestion-recurrences.md` §4.4, rendu exact. **Même patron que la proposition de virement** (`docs/lot-m2.md` §4.5).

**Entrée.** `preparerRevue` reçoit en plus les occurrences **ouvertes** des règles actives **du compte importé**, d'échéance comprise dans la fenêtre du relevé élargie de `toleranceJours + MARGE_CANDIDAT_JOURS` (7), avec leur règle (libellé, motif, tolérances, sous-catégorie) — une requête bornée faite en amont par le repository, après prolongation de l'horizon (§4.4).

**Candidats** d'une ligne : les occurrences dont l'échéance est à ± `toleranceJours + MARGE_CANDIDAT_JOURS` de sa date **et** qui passent au moins le critère de description ou celui de montant. Les trois critères :

| Critère | Passe si |
|---|---|
| description | `descriptionNormalisee` de la ligne contient le `motifRapprochement` (non vide) de la règle ; une règle sans motif ne le passe jamais |
| montant | `|montant − montant de l'occurrence| ≤ toleranceCents` |
| date | `|date − échéance| ≤ toleranceJours` |

**Évaluation** (`evaluerRapprochement`) :

| État | Condition | Dans la revue |
|---|---|---|
| **Rapprochée automatiquement** | exactement un candidat, et il passe les trois critères | `occurrenceAvec` pré-rempli ; la ligne affiche « Paiement de Netflix.com, échéance du 12 octobre » (même texte que le détail de la transaction) et un bouton **Défaire** |
| **À confirmer** | plusieurs candidats, ou un seul qui échoue sur un critère | rien n'est pré-rempli ; la ligne dit **ce qui cloche** pour chaque candidat (« montant de 24,99 $ au lieu de 17,99 $ attendu » ; « le 20 octobre, échéance attendue le 12 octobre à ± 3 jours » ; « description « NETFLIX INTL » sans « NETFLIX.COM » ») et offre un choix qui les liste tous, plus « Ne pas lier » |
| **Non rapprochée** | aucun candidat | rien |

La `LigneEnRevue` gagne `candidatsOccurrence` (lecture seule, avec ce qui cloche) et `occurrenceAvec: string | null` (modifiable). Deux lignes du lot qui visent la même occurrence : la seconde est bloquée avec un message, comme deux lignes sur le même candidat de virement. Une ligne en `IGNORER` (doublon, filtrée) n'est jamais rapprochée.

**Persistance**, dans la `$transaction` du lot : création de la transaction, puis pose de la liaison (`liaison = AUTO` si la valeur pré-remplie est restée telle quelle, `MANUELLE` si l'utilisateur l'a choisie), `lieeLe`, état par `etatApresLiaison`, catégorie héritée selon §3.6 — après revérification que l'occurrence est toujours ouverte (sinon `CONFLICT` pour tout le lot, « Rien n'a été enregistré : le paiement Netflix du 12 octobre vient d'être lié ailleurs. »).

### 4.6 Les gestes sur les séries et les occurrences

Toutes les actions par `defineAction`, `ownerId` partout (une règle appartient au propriétaire ; une occurrence, par sa règle), une `$transaction` dès que plus d'une ligne bouge.

| Geste | Effet |
|---|---|
| **Créer une récurrence** (bouton de l'écran, ou « Créer une récurrence » depuis le détail d'une transaction) | même formulaire que la confirmation (§4.3), motif obligatoire ; depuis une transaction, pré-rempli par elle (compte, montant, motif = sa description normalisée, ancrage = sa date, sous-catégorie) et **cette transaction-là** est liée (`MANUELLE`) à l'échéance de sa date — aucune autre liaison rétroactive |
| **Modifier une règle** | libellé, nature, montant, cadence, ancrage, sous-catégorie, motif, tolérances ; le compte ne change pas. Les occurrences **liées ou ignorées ne bougent pas** (`docs/modele-ingestion-recurrences.md` §7, principe 2) ; les occurrences ouvertes d'échéance ≥ aujourd'hui sont supprimées puis rematérialisées ; les ouvertes passées restent. Un nouveau montant de signe strictement contraire à celui d'une occurrence gardée (liée, ignorée, ouverte passée) est refusé en `VALIDATION`, sans rien écrire (M3-C1) |
| **Terminer une série** | `dateFin` posée ; les occurrences ouvertes d'échéance > `dateFin` sont supprimées ; l'historique lié reste ; la série passe dans « Séries terminées » |
| **Supprimer une règle** | confirmation qui dit ce qui part : « 19 liaisons seront défaites ; les transactions restent. » (cascade du schéma) |
| **Lier à la main** | depuis une occurrence ouverte : choisir parmi les transactions non liées du même compte à ± `FENETRE_LIAISON_MANUELLE_JOURS` (15) ; depuis le détail d'une transaction : choisir parmi les occurrences ouvertes du compte dans la même fenêtre. `liaison = MANUELLE`. Revérifie en base que les deux côtés sont libres (`CONFLICT` sinon) |
| **Délier** | depuis l'occurrence ou le détail de la transaction : l'occurrence repasse `PREVUE`, `transactionId`, `liaison`, `lieeLe` à `null`. La transaction ne change pas (sa sous-catégorie reste) |
| **Ignorer une échéance** | `IGNOREE` ; **Rétablir** la remet `PREVUE` |
| **Modifier le montant d'une échéance** | sur une occurrence ouverte seulement, sans toucher la série (`docs/referentiel-fonctionnalites.md` §6) ; un montant de signe strictement contraire à celui de la règle est refusé en `VALIDATION` (le zéro n'a pas de signe, M3-C1) |

### 4.7 L'écran `/transactions/recurrences`

Trois sections, dans cet ordre, plus « Rechercher des récurrences » et « Nouvelle récurrence » en en-tête.

1. **Suggestions** — une carte par suggestion `EN_ATTENTE`, triées par score décroissant : la phrase de §4.2, « Confirmer » (dialogue §4.3) et « Refuser ». État vide : « Aucune suggestion. La recherche tourne après chaque import. »
2. **Séries** — actives, puis « Séries terminées » repliées. Par série : libellé, compte, montant (« ≈ » pour `VARIABLE`), cadence en mots, prochaine échéance ouverte, nombre de paiements liés, sous-catégorie, ventilation en lecture seule si elle existe. Actions : voir les échéances, modifier, terminer, supprimer. **Voir les échéances** ouvre un panneau (`Sheet`) : les occurrences de la série en deux listes — « À venir » (les plus proches d'abord, 3 par page) puis « Passées » (les plus récentes d'abord, 25 par page), l'échéance du jour étant « À venir » —, chacune avec son échéance, son montant, son état affiché (§3.3) en libellé et en icône (pas seulement en couleur), la transaction liée (date, montant, provenance de la liaison : « automatique à l'import », « à la main », « à la confirmation ») et les gestes de §4.6.
3. **Paiements attendus non vus** — les occurrences `MANQUEE` (stockées ou dérivées) des séries actives, plus récentes d'abord, bornées : série, échéance, montant attendu, et les trois issues du modèle (§4.6) : **Lier à une transaction**, **Ignorer**, **Modifier la série**. État vide explicite.

Les séries s'affichent en tableau, sans défilement horizontal à 1280 px ; les contrôles de débordement, de recouvrement et de barre d'action de M2 s'appliquent à l'écran, au panneau et aux dialogues (§3.10 : pas de déclinaison mobile en M3).

**Panneau de détail d'une transaction** (consultation) : la ligne « État de rapprochement » devient une section **Récurrence** : « Paiement de Netflix, échéance du 12 août — lié automatiquement à l'import le 14 octobre » (ou « à la main », « à la confirmation ») avec **Délier** ; sans liaison : « Aucune récurrence » avec **Lier à une échéance** et **Créer une récurrence**. Un filtre de consultation **« liées à une récurrence »** (inclure / seulement / exclure) rejoint les filtres d'état de `docs/lot-m2.md` §5.2. Sous « Supprimer » désactivé, le panneau dit « Cette transaction est le paiement de Netflix du 12 août. Délie-la d'abord dans la section Récurrence ci-dessous. » ; le message de §3.5 reste celui de l'action.

### 4.8 Le seed

Le critère de sortie veut voir **détecter** Netflix : le seed ne doit donc plus le porter confirmé. Changement : la récurrence « Streaming » (Netflix, compte Visa) **n'est plus créée** ; ses transactions restent, identiques (mêmes dates, montants, sous-catégorie, identifiants). Les quatre autres récurrences simples et l'hypothèque ne changent pas. Le générateur pseudo-aléatoire ne doit pas être décalé (aucun tirage ajouté ni retiré) : seuls l'enregistrement de la règle et de ses occurrences disparaissent. Les tests qui comptent les règles ou les occurrences du seed sont mis à jour **par le planner, dans la spec** — c'est un changement voulu du jeu de données, pas un ajustement pour faire passer un test. `CLAUDE.md` §12 (« de vraies récurrences ») reste vrai. Les montants des règles du seed sont signés comme leurs occurrences (négatif pour une sortie) ; l'hypothèque est au montant du terme en cours ; les échéances à venir sont au montant de la règle (M3-C1).

---

## 5. Soldes et réconciliation

### 5.1 Le domaine — `src/domain/solde/`

| Fonction | Rôle |
|---|---|
| `soldeCalcule(soldeInitialCents, sommeTransactionsCents)` | §3.7 — la somme vient d'un agrégat SQL (`_sum` ou `$queryRaw`, `parentId IS NULL`, `date ≤ D`), jamais d'un balayage en mémoire |
| `ecart(soldeDeclareCents, soldeCalculeCents)` | déclaré − calculé |
| `statutAncrage(ecartCourant, explication)` | §3.8 |
| `explicationsProbables(contexte)` | §5.3 — la liste ordonnée, chaque entrée avec ses données ou « rien de ce côté » |
| `empreinteAjustement(statementId)` | empreinte dérivée hors relevé, préfixe `ajustement:` (même famille que `docs/lot-m2.md` §3.2) |

### 5.2 Les ancrages

Sur la fiche du compte (§3.4) :

- **en tête** : solde calculé à aujourd'hui, et le dernier ancrage avec son statut ;
- **Saisir un solde** : date (aujourd'hui par défaut, `domain/dates.ts`), montant (chaîne saisie, schéma partagé), source `MANUEL` ou `RELEVE`. Collision sur (`accountId`, `date`, `source`) → `DUPLICATE` avec un message qui le dit. À l'enregistrement, si l'écart n'est pas nul, une `Reconciliation` est créée dans la même `$transaction` (`ecartCents` = écart constaté) et l'écran l'ouvre ;
- **la liste des ancrages**, plus récents d'abord, bornée : date, source, solde déclaré, solde calculé, écart courant, statut (libellé et icône), et l'ajustement s'il existe (lien vers la transaction) ;
- **Supprimer un ancrage** : confirmation ; s'il porte un ajustement, la confirmation le dit et l'ajustement part avec lui dans la même `$transaction`.

### 5.3 Le diagnostic d'un écart

Le panneau de réconciliation d'un ancrage affiche l'écart courant en grand (IBM Plex Mono tabulaire), puis les explications **dans l'ordre** de `docs/modele-ingestion-recurrences.md` §5.2, chacune avec ce que les données en disent :

1. **Période non couverte** — la date de la transaction la plus récente du compte (et la fin de couverture `couvreAu` du dernier lot d'import) comparée à la date de l'ancrage : « Le dernier import s'arrête au 5 septembre ; l'ancrage est daté du 20. Il manque probablement des transactions. » ou « Couverture complète jusqu'à l'ancrage. »
2. **Transactions en attente** — nombre et somme des transactions `EN_ATTENTE` du compte datées ≤ l'ancrage (avec le copier-coller : « Aucune transaction en attente »).
3. **Doublon possible** — les paires de quasi-doublons (même compte, même montant, ± 3 jours, même description normalisée — la règle de `docs/modele-ingestion-recurrences.md` §2) entre l'ancrage précédent et celui-ci, bornées, avec un lien vers chaque transaction.
4. **Ligne jamais reconnue** — les lignes non reconnues ne sont pas stockées : l'explication reste un rappel (« Une ligne écartée à l'import a peut-être été oubliée : vérifie la section Non reconnues lors du prochain import »).
5. **Montant erroné** — les transactions `MANUELLE` du compte de la période, et toute transaction de la période dont le montant absolu égale l'écart absolu (« Une transaction de 50,00 $ le 3 septembre : comptée en trop ou manquante ? »).

Puis deux issues :

- **Expliquer** : un texte libre enregistré dans `explication`, `regleeLe` posé. Statut « Expliqué » tant que l'écart courant n'est pas nul.
- **Créer un ajustement** : une transaction `source: AJUSTEMENT`, datée de l'ancrage, du montant de l'écart courant, description « Ajustement de solde », dans la sous-catégorie système du propriétaire (`systeme = true`, nom « Ajustement de solde » ; si elle n'existe pas, elle est créée dans la même `$transaction` sous une catégorie « Ajustements » — le planner vérifie ce que le seed et le référentiel de M1 font déjà des sous-catégories système), empreinte par `empreinteAjustement` ; `Reconciliation.ajustementTxId` et `regleeLe` posés. Refusé (`CONFLICT`) si l'écart courant est déjà nul ou si l'ancrage a déjà un ajustement. L'écart courant tombe à zéro, et ceux des ancrages postérieurs bougent d'autant (§3.7).

Une transaction d'ajustement se lit dans la consultation comme les autres (source « Ajustement », date et montant en lecture seule, `docs/lot-m2.md` §3.3) ; sa suppression depuis la consultation est permise, et la réconciliation redevient « Écart ouvert » par le seul recalcul (§3.8) — sans rien à resynchroniser.

---

## 6. La couche serveur

Repositories : `recurrences.ts` (règles, occurrences, liaisons, détection SQL, suggestions) et `soldes.ts` (ancrages, réconciliations, ajustements, agrégats de solde). Si l'un dépasse la lisibilité, il se découpe en lecture / écriture, jamais par écran. `import-batches.ts` gagne la pose des liaisons dans la `$transaction` du lot. Les verrous de M2 (`verrous.ts`) s'appliquent aux liaisons : une occurrence et sa transaction se verrouillent dans un ordre stable avant d'être liées ou déliées.

Actions : `server/actions/recurrences.ts`, `server/actions/soldes.ts` ; schémas dans `features/recurrences/schema.ts` et `features/soldes/schema.ts` (`CLAUDE.md` §6 règle 6). Hooks séparés lecture / écriture (`useRecurrences`, `useOccurrences(ruleId)`, `useRecurrenceMutations` ; `useSoldes(accountId)`, `useSoldeMutations`), clés dans `lib/query-keys.ts`. Une liaison ou une déliaison invalide aussi les clés de la consultation des transactions (le détail affiche la récurrence).

Rappels qui mordent ici : jamais de `findMany` sans `take` (les occurrences d'une série sur 12 mois d'horizon et 24 mois d'historique dépassent vite 50) ; pas de N+1 (prochaine échéance et nombre de liés par série : une requête groupée) ; aucune colonne d'agrégat.

## 7. Invariants

Une vérification réutilisable `verifierInvariantsOccurrences` (dans `prisma/test/`, appelée après chaque écriture des tests d'intégration du lot, sur le modèle de celle des invariants 1, 2, 5 de M2) et un fichier `prisma/coherence-recurrences.test.ts` qui l'exécute sur le seed :

1. une occurrence `REALISEE` ou `REALISEE_MONTANT_DIFFERENT` a un `transactionId`, une `liaison` et un `lieeLe` ; une occurrence `PREVUE`, `MANQUEE` ou `IGNOREE` n'en a aucun ;
2. la transaction liée est du **même compte** que la règle, et du même propriétaire ;
3. la transaction liée n'est pas une ligne fille ;
4. aucune occurrence n'a d'échéance après la `dateFin` de sa règle, sauf si elle est liée ;
5. une `Reconciliation` a le même compte que son ancrage, et son ajustement éventuel est une transaction `AJUSTEMENT` de ce compte, datée de l'ancrage ;
6. une occurrence et sa règle n'ont jamais des montants de signes strictement contraires ;
7. une occurrence ouverte d'échéance ≥ aujourd'hui est au montant de sa règle, sauf montant fixé à la main — vérifié à la demande, les exceptions déclarées par l'appelant (le schéma ne trace pas un montant posé à la main).

`prisma/coherence.test.ts` (les cinq invariants du modèle d'enveloppes) ne change pas et doit rester vert : un ajustement n'est pas un virement, n'est pas ventilé, et entre dans l'activité de sa sous-catégorie système comme n'importe quelle transaction catégorisée.

## 8. Tests exigés

| Module | Cas |
|---|---|
| `domain/recurrence/` détection | série mensuelle fixe (Netflix synthétique, 19 occurrences) → `MENSUEL`, `FIXE`, score ≥ 0,9 ; mensuelle variable → `VARIABLE` ; aux deux semaines ; hebdomadaire ; annuelle ; deux occurrences seulement → rien ; intervalles irréguliers (régularité ≥ 0,15) → rien ; série morte (dernière date < référence − 2 × cible) → rien ; groupe déjà couvert par une règle active → rien ; suggestion refusée identique → rien ; mois de 28 à 31 jours qui restent `MENSUEL` ; frontière de chaque seuil (juste dessous, juste dessus) |
| `domain/recurrence/` phrase et pré-remplissage | phrase exacte pour fixe, variable, semaines ; jour modal (égalité → le plus petit) ; ancrage au jour modal borné à la fin du mois ; libellé par bénéficiaire commun ou motif en casse de titre ; tolérances par nature et cadence |
| `domain/recurrence/` appariement | une transaction par échéance ; deux transactions près de la même échéance → la plus proche gagne, l'autre prend la suivante ou reste sans échéance (comptée) ; échéance passée sans transaction ; égalité de distance → l'échéance la plus ancienne |
| `domain/recurrence/` rapprochement | AUTO (un candidat, trois critères) ; à confirmer : montant hors tolérance (message exact « montant de 24,99 $ au lieu de 17,99 $ attendu »), date hors fenêtre, description non conforme, deux candidats ; aucun candidat ; règle sans motif → jamais AUTO ; `etatApresLiaison` aux deux bords de la tolérance ; `etatAffiche` (la veille et le lendemain de `echeance + toleranceJours`, `MANQUEE` stockée) |
| `domain/recurrence/` matérialisation | bornée par `dateFin` ; idempotente par construction (mêmes échéances à chaque appel) ; `PONCTUEL` |
| `domain/ingestion/` | `preparerRevue` avec occurrences : AUTO pré-rempli, à confirmer sans pré-remplissage, deux lignes du lot sur la même occurrence, ligne `IGNORER` jamais rapprochée, catégorie héritée seulement sans sous-catégorie de règle ni conflit (§3.6) |
| `domain/solde/` | `soldeCalcule` ; statut aux trois cas ; `explicationsProbables` : chaque explication présente et absente, ordre constant ; empreinte d'ajustement stable et distincte de toute empreinte de ligne |
| intégration (schéma `test`) | détection SQL sur le seed : Netflix proposé, aucune des séries confirmées du seed reproposée ; confirmer → règle, occurrences jusqu'à l'horizon, 19 liaisons `RETROACTIVE`, suggestion `ACCEPTEE` ; confirmer deux fois → `CONFLICT` ; transaction du groupe liée entre-temps → sautée et comptée ; refuser puis relancer la détection → pas reproposée ; import AUTO puis `CONFLICT` quand l'occurrence a été liée entre-temps ; lier / délier à la main ; ignorer / rétablir ; modifier une règle (liées intactes, ouvertes futures rematérialisées) ; terminer ; supprimer ; suppression d'une transaction liée refusée avec le message de §3.5 ; saisir un ancrage (avec et sans écart), `DUPLICATE` ; ajustement (écart courant à 0, ancrages postérieurs décalés, second ajustement refusé) ; écart qui tombe à 0 après un import ; suppression d'un ancrage avec son ajustement ; **après chaque écriture, `verifierInvariantsOccurrences` et les invariants 1, 2, 5 tiennent** |
| e2e (Playwright, projet `bureau`, 1280 px) | les parcours du critère de sortie (§12), plus les contrôles de débordement, de recouvrement et de barre d'action de M2 sur chaque nouvel écran, panneau et dialogue ; les parcours qui changent l'état partagé du schéma `e2e` (confirmer Netflix) sont **sériels** dans un même fichier, dans l'ordre du critère. Fichiers et noms de contextes de capture : §11 (chaque point de capture nouveau a un contexte qui commence par le motif de sa tranche, pour que `--ecrans=` le retrouve) |

Le parcours e2e d'import s'appuie sur des extraits Visa **inventés** au format AccèsD (une ligne « NETFLIX.COM » à 17,99 $, une autre à 24,99 $), ajoutés aux fixtures par le planner, sans aucune donnée réelle, datés pour tomber sur des échéances que la règle confirmée a matérialisées quel que soit le jour du lancement (échéances ≥ l'ancrage et ≤ l'horizon ; le planner le justifie).

## 9. Ce que `test:reel` gagne

`npm run test:reel` passe aussi les transactions qu'il a préparées en mémoire, compte par compte, dans `detecterRecurrences` (groupes formés en mémoire à partir des lignes du script, pas de base) et rapporte, **en constat non bloquant** : le nombre de suggestions par compte, leur cadence et leur nature, montants et descriptions masqués comme le reste de la sortie. Avec peu de mois de relevés, aucune série n'atteint trois occurrences mensuelles : la sortie le dit (« aucune série éprouvée : N mois de relevés par compte ») pour qu'un 0 ne passe pas pour une preuve. Le code de sortie ne change pas de sens.

---

## 10. Les dettes reprises des passes de sortie M2

Chaque point vient de `docs/pilotage/passes/m2.md` ; la passe de sortie de M3 les vérifie comme le reste. Chacun a son contrôle automatique (e2e en projet `bureau`, ou Vitest). Les dettes propres au mobile (second libellé radio de la suppression en masse, popover de conflit au bord gauche, avis « sous-catégorie retirée » au passage en virement P2-f, double mention « Ventilée » de la carte P4-a, infobulle de conflit au toucher) sont parties en M9 (§3.10, M9-S de la feuille de route) : elles ne se traitent pas ici.

1. **Pluriels de l'aperçu rétroactif** (passe 1) : « transaction(s) », « catégorie(s) préservée(s) » deviennent des pluriels écrits (`accorder`, comme la revue d'import) ; plus aucun `(s)` dans `src/features/regles/`.
2. **Barre de période** (passe 1) : cohérente avec un filtre « Toutes les dates » venu de l'URL (le segment affiché dit la période réellement appliquée).
3. **Garde d'anonymisation des fixtures** (passe 1, P1-h) : un test qui échoue si un nom réel interdit réapparaît dans `src/domain/statement/fixtures/` ou `e2e/`, **sans recopier les noms réels dans le dépôt** : la liste d'interdits est stockée sous forme d'empreintes SHA-256 de formes normalisées (majuscules, sans accents), le test compare les empreintes des mots et paires de mots des fixtures. Les empreintes se calculent à partir des noms retirés par M1-C4 (`0c790fe`) et M2-T1 (`f3b5d9b`), lus dans l'historique Git (`git show <commit>^:<fichier>`), sans que ces noms soient écrits nulle part — ni dans un fichier, ni dans un commentaire, ni dans `.pipeline/`. Un test synthétique prouve qu'un nom dont l'empreinte est listée est attrapé.
4. **Toast sur un dialogue** (passes 2 et 3, P2-c) : en bureau, le toast centré ne couvre ni la croix ni le titre d'un dialogue ouvert — contrôle `elementFromPoint` sur la croix et le titre pendant qu'un toast est affiché.
5. **« Supprimer un côté de virement »** (P2-d) : chaque explication est rattachée à son bouton (dans la même option, ou décrite par `aria-describedby`).
6. **Saisie en bureau** (P2-e) : Date et Montant alignés malgré le texte d'aide (bords hauts des deux champs égaux à 1 px près).
7. **Après « Ventilation enregistrée. »** (P3-b) : le panneau de détail revient sur la section Ventilation (dans la fenêtre), au lieu de garder le défilement de l'éditeur.
8. **Panneau de détail** (P4-b) : les sections « Virement » et « Ventilation » ne répètent pas leur titre en étiquette.

**Décisions de la tranche M3-T5 (2026-10-10)**, qui précisent ou remplacent un texte ci-dessus ou ailleurs dans ce document :

- **Panneau des échéances** (§4.7 point 2) : « À venir » (3 par page, plus proches d'abord) puis « Passées » (25 par page, plus récentes d'abord). Pourquoi : un an d'échéances futures repoussait l'historique des paiements liés.
- **Libellé d'échéance** (§4.5) : « Paiement de Netflix.com, échéance du 12 octobre » partout, par une seule fonction. Pourquoi : la revue et le détail disent la même chose.
- **Bloc de rapprochement de la revue** : valeurs absolues, « attendu » non répété ; les signes ne se montrent que lorsqu'ils sont l'écart (ligne « ce qui cloche »). Les montants du bloc sont en police des montants.
- **Toasts** : en bas à gauche en bureau (≥ 768 px), en haut au centre en dessous ; remplace la décision du 2026-10-06 (M2-T7). Pourquoi : le haut-centre couvre le titre et la croix d'un dialogue haut et les onglets, le bas à droite couvre la barre « Fermer » des panneaux.
- **Barre de période** : l'URL « Toutes les dates » prime sur le cookie pour l'affichage, sur `/transactions` seulement ; choisir une période retire `toutesDates` de l'URL. Le cookie reste la source de la période (décision du 2026-10-04).
- **`FormItem`** (`components/ui/form.tsx`) : `content-start`. Pourquoi : cause unique des désalignements Date/Montant et Nature/Montant.
- **Écart nul** (§5) : le formulaire d'explication est caché dès que l'écart courant est nul ; l'explication déjà enregistrée reste affichée.
- **`balayerTransactions`** : `$transaction` en `RepeatableRead` ; `relationLoadStrategy` est indisponible sans `previewFeatures` en Prisma 6.19.
- **Phrase de liaison du détail** : étiquette au-dessus de la valeur, pleine largeur.
- **Garde d'anonymisation** : les empreintes viennent des lignes retirées par les deux commits nommés au point 3, moins les formes encore présentes dans le corpus ; aucun nom n'est écrit.
- **Séries terminées** : « Prochaine » vaut « — » ; la date de fin n'est pas affichée à sa place.

---

## 11. Découpage en tranches

Cinq tranches, dans cet ordre ; chacune laisse l'arbre vert et mérite son commit.

| # | Tranche | Contenu | Dépend de |
|---|---|---|---|
| 1 | **Domaine des récurrences et seed** | §3.2, §3.3, §4.1 à §4.5 côté domaine (détection, phrase, pré-remplissage, matérialisation, appariement, rapprochement, états), §4.8 (seed sans Netflix confirmé), §7 (vérification réutilisable et `coherence-recurrences.test.ts`) | — |
| 2 | **Récurrences : persistance et écran** | §4.2 (requête SQL, remplacement des suggestions), §4.3, §4.4, §4.6, §4.7 (écran, panneau des échéances, section Récurrence du détail, filtre de consultation), §3.5 | 1 |
| 3 | **Rapprochement à l'import** | §4.5, §3.6, détection après import (§4.2), §9 (`test:reel`) | 2 |
| 4 | **Soldes et réconciliation** | §3.4 (fiche du compte, colonne Solde), §3.7, §3.8, §5 en entier, invariant 5 de §7 | 1 |
| 5 | **Dettes de M2** | §10 | — |

La tranche 4 ne dépend pas des tranches 2 et 3 ; elle se fait **après** elles pour ne pas toucher en parallèle la consultation et le panneau de détail.

### 11.1 Classement, parcours ciblés et captures (`docs/pilotage/gouvernance.md` §7)

| # | Classement | Parcours e2e de la tranche (`npm run e2e:cible -- <fichiers>`) | Motifs de captures (`--ecrans=`) |
|---|---|---|---|
| 1 | **à risque** — détection, appariement, rapprochement, états d'occurrence, seed : tout ce qui décide qu'un montant est le paiement d'une échéance | aucun parcours nouveau ; `e2e/transactions.e2e.ts` seulement si le changement du seed touche ce que la consultation affiche | aucun (pas d'interface) |
| 2 | **à risque** — détection SQL, liaisons rétroactives écrites en base, montants des règles et des échéances | `e2e/recurrences.e2e.ts` (nouveau), `e2e/transactions.e2e.ts`, `e2e/transactions-ecriture.e2e.ts` | `recurrence` |
| 3 | **à risque** — ingestion : la `$transaction` du lot gagne une écriture, catégorie héritée | `e2e/recurrences.e2e.ts`, `e2e/import.e2e.ts` | `rapprochement` |
| 4 | **à risque** — soldes, écarts, ajustements : calcule et écrit des montants | `e2e/soldes.e2e.ts` (nouveau), `e2e/referentiel.e2e.ts` | `soldes`, `comptes` |
| 5 | **courante** — libellés, mise en page, une garde de test | `e2e/regles-retroactives.e2e.ts`, `e2e/transactions.e2e.ts`, `e2e/transactions-ecriture.e2e.ts`, `e2e/transactions-virement.e2e.ts`, `e2e/transactions-ventilation.e2e.ts`, `e2e/controles-synthetiques.e2e.ts` | `application-retroactive`, `barre-de-periode`, `suppression-d`, `nouvelle-transaction`, `ventilation`, `section-virement` |

Planner et relecteur en Opus pour une tranche à risque, en Sonnet pour une tranche courante ; coder et testeur inchangés.

**Noms des points de capture.** Les contextes nouveaux suivent la forme des existants (« Écran › précision ») et contiennent le motif de leur tranche une fois mis en slug : « Récurrences › suggestions », « Récurrences › confirmer Netflix », « Récurrences › échéances de la série », « Récurrences › paiements attendus non vus », « Transactions › détail (récurrence liée à la confirmation) » ; « Revue de l'import › rapprochement automatique », « Revue de l'import › rapprochement à confirmer », « Transactions › détail (rapprochement à l'import) » ; « Soldes › fiche du compte », « Soldes › diagnostic de l'écart », « Soldes › après ajustement », « Paramètres › Comptes › colonne Solde ». Le planner de chaque tranche peut affiner les précisions, pas retirer le motif.

**Contrôle visuel de fin de tranche** (tranches 2 à 5) : le `verificateur`, en largeur bureau, lance `npm run e2e:passe -- --ecrans=<motifs de la tranche> <fichiers de la tranche>` et ne lit que ces captures. Un défaut se corrige dans la tranche ou devient une dette nommée dans `decisions.md` ; un défaut propre au mobile est une dette M9.

---

## 12. Critère de sortie

Chaque point est vérifié par un test automatisé ; la passe de sortie (`verificateur`) les reprend un à un, en largeur bureau (§3.10). Elle lance la suite e2e complète (`npm run e2e`) et capture seulement les écrans du lot : `npm run e2e:passe -- --ecrans=recurrence,rapprochement,soldes,comptes,application-retroactive,barre-de-periode,suppression-d,nouvelle-transaction,ventilation,section-virement` (quelques dizaines de captures). Un défaut propre au mobile n'est pas un ❌ : c'est une dette M9.

1. `npm run check` passe (lint, `tsc --noEmit`, Vitest, dont les cinq invariants de `prisma/coherence.test.ts` et `prisma/coherence-recurrences.test.ts`).
2. **Netflix détecté et confirmé** — parcours e2e, sur le seed : « Rechercher des récurrences » ; la suggestion dit « Netflix… 17,99 $, tous les mois vers le 12 » ; la confirmer par le dialogue pré-rempli ; le compte rendu annonce les paiements liés ; la série apparaît avec ce nombre de paiements liés ; le détail d'un prélèvement Netflix dans la consultation montre « Paiement de … échéance du … — lié à la confirmation ». Test d'intégration : chaque transaction Netflix du seed a exactement une occurrence, `RETROACTIVE`, et aucune autre série confirmée du seed n'est reproposée.
3. **Rapprochement à l'import** — parcours e2e : coller un extrait Visa inventé avec un prélèvement Netflix conforme ; la revue l'affiche rapproché avec « Défaire » ; enregistrer ; le détail montre la liaison automatique. Second extrait à 24,99 $ : la revue dit « montant de 24,99 $ au lieu de 17,99 $ attendu » et ne lie rien sans choix. Tests d'intégration : les trois états, deux lignes sur la même occurrence, `CONFLICT` quand l'occurrence a été liée entre-temps.
4. **Gestes à la main** — parcours e2e : dans « Paiements attendus non vus », ignorer l'échéance manquée d'Assurance auto du seed, puis la rétablir ; délier un paiement depuis le détail d'une transaction et le relier depuis l'échéance ; la suppression d'une transaction liée est refusée avec le message de §3.5.
5. **Soldes** — parcours e2e : sur la fiche d'un compte, saisir un solde qui crée un écart ; le diagnostic affiche les explications dans l'ordre de §5.3 ; créer l'ajustement ; l'écart courant passe à zéro et l'ajustement se retrouve dans la consultation (source « Ajustement »). Tests d'intégration : §3.7 (ouverture + somme, filles exclues), §3.8 (écart recalculé après un import, statut dérivé), second ajustement refusé.
6. **Dettes de M2** — chaque point de §10 a son test ou son contrôle e2e, et il passe.
7. **Débordement** — les contrôles de débordement (`ELEMENT_ROGNE` compris), de recouvrement et de barre d'action passent sur chaque nouvel écran, panneau et dialogue de M3, en largeur bureau ; le mode passe filtré ci-dessus capture chacun en clair et en sombre, sous un nom de contexte qui contient le motif de sa tranche (§11.1).
8. `npm run test:reel` sort en 0 et sa sortie porte la section récurrences de §9.
9. `INDEX.md` est à jour : carte du code (`domain/recurrence/`, `domain/solde/`, nouveaux repositories, actions, écrans, tests), état du lot, journal des décisions de M3.

`docs/pilotage/passes/m3.md` se termine par le bilan de `docs/pilotage/gouvernance.md` §7 (cycles par type, passes, passes rouges et leur cause, attente de la limite d'utilisation si les journaux le permettent), comparé à M2 : 16 cycles, 4 passes dont 3 rouges.

## 13. Hors périmètre

Pointage case par case d'un relevé et champ `Transaction.rapprochement` (§3.9). Application d'une ventilation récurrente (`RecurringSplit`) à l'import, amortissement de l'hypothèque (M6). Prévision, calendrier financier, flux ICS, événements planifiés (M5). Écran Budgets et traitement budgétaire des ajustements (M4). Onglet « Récurrences » des Paramètres (§3.4). Regroupement par similarité `pg_trgm` des descriptions qui varient (la détection groupe sur l'égalité de la description normalisée ; `pg_trgm` reste une piste si le seed ou `test:reel` montrent des séries manquées pour cette raison). Ancrages `AGREGATEUR` automatiques (agrégateur hors v2). Tout comportement mobile et toute vérification en largeur mobile (M9, §3.10). Liaison rétroactive en masse à la création manuelle d'une récurrence (seule la transaction d'origine est liée, §4.6).
