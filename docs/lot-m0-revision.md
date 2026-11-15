# Lot M0 — révision du 13 septembre 2026

Le périmètre fonctionnel a été arrêté après l'étude comparative de Quicken, YNAB et Monarch (`referentiel-fonctionnalites.md`) et la décision sur le modèle de budget (`decision-modele-budget.md`). Deux sections de `docs/lot-m0.md` sont caduques. Ce document dit lesquelles, pourquoi, et donne le schéma de remplacement.

**Ce n'est pas une reprise de M0.** Huit sections sur dix sont intactes. Et c'est le bon moment : la base de développement ne contient que du seed synthétique, donc `prisma migrate reset` efface tout sans coût. Si M1 avait commencé, il y aurait des écrans à reprendre en plus.

---

## 1. Ce qui change, section par section

| Section de `docs/lot-m0.md` | Sort |
|---|---|
| §1 — stack Docker `budgapp-db`, Postgres 17, déploiement, sauvegardes | **intact** |
| §2.1 — init Next, dépendances, scripts, ESLint, `tsconfig`, hook `pre-push`, `.env` | **intact** |
| §2.2 — arborescence | **intact**, plus cinq dossiers (§4 ci-dessous) |
| §2.3 — **schéma Prisma** | **remplacé** — voir §3 |
| §2.4 — **seed synthétique** | **remplacé** — voir §5 |
| §2.5 — `domain/money.ts` | intact |
| §2.6 — `domain/dates.ts` | **complété** : 12 cadences au lieu de 7 |
| §2.7 — `define-action.ts` | intact |
| §2.8 — `query-keys.ts` | complété |
| §2.9 — polices, tokens, coquille à six onglets | **intact** |
| §2.10 — README | à régénérer en fin de parcours |

## 2. Pourquoi le schéma ne tenait plus

Le schéma de `lot-m0.md` est cohérent avec le modèle de budget de l'époque : *montant mensuel fixe par catégorie, pas d'enveloppes avec report*. Cette décision est renversée. Sept manques bloquent des décisions désormais prises :

| Manque | Ce qu'il empêche |
|---|---|
| **Aucun virement** — pas de `transferAccountId`, pas de transaction miroir | Un paiement de carte compte comme une dépense **et** l'arrivée d'argent sur la carte comme un revenu. C'est exactement le double comptage à éliminer. Bloque aussi toute cotisation REER ou CELI |
| **Aucune ventilation** | Un paiement hypothécaire ne peut pas se découper en capital / intérêts / assurance |
| **`BudgetLine` est un montant plat** | Pas de report, pas de cible, pas de « disponible ». Il manque l'allocation mensuelle, le mode de report par sous-catégorie et la cible paramétrable |
| **Aucun mouvement entre enveloppes** | Pas de correction de dépassement, pas d'historique, pas d'annulation |
| **`Rule` ne porte qu'un motif et une sous-catégorie** | Ni condition de montant, ni condition de compte, ni action multiple, ni trace de la règle appliquée |
| **Ni bénéficiaire, ni étiquette** | Pas de mémoire par bénéficiaire, pas de rapport par marchand, pas de liste de surveillance |
| **`TypeCompte` s'arrête à AUTRE ; pas de `estBudgetaire`** | Ni prêt, ni placement, ni maison — donc ni valeur nette, ni CELIAPP, ni plan de dette |

Sans compter les objectifs, le plan de remboursement et les scénarios, absents en entier.

## 3. Le schéma de remplacement

**Il est déjà dans cette branche, à `prisma/schema.prisma`.** Trente-neuf modèles. Il remplace intégralement le bloc `prisma` du §2.3 de `docs/lot-m0.md` — ne pas fusionner les deux, ne rien renommer : les documents de conception y font référence nom par nom.

Les conventions de l'ancien schéma sont conservées : `String @id @default(cuid())` partout, extensions créées côté conteneur et non déclarées dans le `datasource`, montants en cents signés, dates en `@db.Date`.

### 3.1 Les quatre formules que le schéma encode

Rien de ce qui suit n'est stocké. Tout se calcule, ce qui évite le défaut du v1 — deux tables d'agrégat jamais recalculées.

```
disponible(s, m) = report(s, m) + assigné(s, m) + activité(s, m)

report(s, m) = 0                                si reportMode = AUCUN
             = disponible(s, m-1)               si reportMode = SIGNE
             = max(0, disponible(s, m-1))       si reportMode = POSITIF_SEULEMENT

resteAAssigner(m) = resteAAssigner(m-1)
                  + revenus(m)
                  − Σ assigné(s, m) pour toute enveloppe s

besoinDuMois(s, m) = max(0, cible.montant − assigné(s, m))       si mode = ACCUMULER
                   = max(0, cible.montant − disponible(s, m))    si mode = RECOMPLETER
                   ramené au prorata des mois restants dans la période de la cadence
```

`activité(s, m)` est la somme des transactions du mois affectées à `s`, en excluant les parents ventilés (leurs lignes filles portent les catégories), les virements, et tout ce qui porte `exclureDuBudget`.

**Le report est en cascade.** Modifier l'allocation de juin recalcule le disponible de juillet à décembre. L'API de `domain/budget/` travaille donc sur une plage de mois, jamais sur un mois isolé.

### 3.2 Les décisions de modélisation qui méritent une explication

**La ventilation est une auto-référence, pas une table séparée.** Une ligne fille est une `Transaction` avec un `parentId`. Le parent porte `estVentilee = true` et sort des agrégats de catégorie ; ses filles les portent. Le registre d'un compte affiche le parent. C'est le choix de Monarch plutôt que celui de YNAB, et il évite d'écrire une union dans chaque requête de rapport.

**Le virement est une paire symétrique liée.** `T1.transferTransactionId = T2.id` et réciproquement, avec `T2.montantCents = −T1.montantCents`. Chaque registre de compte reste cohérent isolément, et l'exclusion du budget se fait des deux côtés sans cas particulier. C'est ce qui règle le paiement de carte, la cotisation REER et le virement vers l'épargne d'un seul mécanisme.

**Les paramètres d'un prêt sont une série datée.** `LoanTerm` porte un `moisEffectif`. Un renouvellement hypothécaire à 3 ou 5 ans crée une nouvelle ligne ; l'échéancier passé n'est jamais réécrit. C'est indispensable au Canada, où le terme et l'amortissement sont deux choses différentes.

**Le mouvement entre enveloppes est un événement.** `MoneyMovement` conserve d'où, vers où, combien, quand, et son groupe — ce qui rend l'annulation groupée possible. L'absence d'annulation est la plainte numéro un des utilisateurs de Monarch ; elle vient d'avoir modélisé le mouvement comme une mutation plutôt que comme un fait.

**L'allocation est portée par la sous-catégorie, sauf si la catégorie budgète en groupe.** `Category.modeBudget` vaut `PAR_SOUS_CATEGORIE` par défaut ; à `PAR_CATEGORIE`, l'allocation se pose sur la catégorie et les sous-catégories cessent d'avoir leur propre ligne. `BudgetAllocation` porte donc `categoryId` **ou** `subcategoryId`, jamais les deux.

**Une liste de surveillance est une étiquette avec une cible.** `Tag.cibleMensuelleCents`. Ce n'est ni une sous-catégorie ni un troisième niveau de hiérarchie : une sous-catégorie est exclusive, alors que « tout ce qui touche à l'auto » traverse l'essence, l'assurance et l'entretien.

**Pas d'enveloppe de paiement de carte.** Le compte de carte porte `tauxAnnuel`, `jourReleve`, `jourEcheance` et `perdDelaiDeGrace`. Le paiement est un virement ; la couverture du relevé est un indicateur calculé, pas une enveloppe. Voir `decision-modele-budget.md` §3.

**Le scénario est une surcouche, jamais une écriture.** `ScenarioSurcharge.payload` est un `Json` délibérément : la forme varie par type de surcharge et sera validée par zod côté domaine, pas par le schéma. C'est le seul `Json` de la base, et il est justifié par le fait qu'un scénario ne se requête jamais — il se charge en entier et s'applique en mémoire.

### 3.3 Ce qui n'est volontairement pas dans le schéma

Pas de `ligneFiscale` sur la catégorie : la fiscalité est hors périmètre et la colonne a été écartée explicitement. Pas de table d'agrégat. Pas de champ de devise. Pas de titre ni de prix de revient côté placement — un solde daté et une allocation en pour mille suffisent au périmètre retenu. Pas de table d'utilisateurs multiples : `ownerId` est partout, l'authentification vient plus tard sans migration.

## 4. Arborescence — les ajouts

À créer en plus du §2.2 de `lot-m0.md`, avec un `.gitkeep` tant qu'ils sont vides :

```
src/domain/
  budget/          enveloppes, report, cibles, reste à assigner, mouvements
  dette/           amortissement, échéancier, plan de remboursement, intérêts de carte
  objectif/        progression, statut, valeur future
  patrimoine/      valeur nette, allocation, droits de cotisation
  scenario/        résolution d'une surcouche sur le modèle réel
```

`src/domain/` ne dépend de rien — ni de Prisma, ni de React, ni de Next. C'est la règle qui rend ces cinq modules testables sans base.

## 5. Seed synthétique — ce qu'il doit produire en plus

Le seed du §2.4 reste valable dans ses contraintes — déterministe par générateur à graine fixe écrit à la main, idempotent, empreintes calculées avec le vrai code d'ingestion — et dans ce qu'il produisait déjà. S'y ajoutent :

| | |
|---|---|
| Comptes | **8** au lieu de 4 : Chèque, Épargne, Visa (CREDIT, taux 19,99 %, relevé le 3, échéance le 21), Marge, CELIAPP (PLACEMENT, suivi, 4 %), REER (PLACEMENT, suivi), Maison (ACTIF), Hypothèque (PRET, liée à la Maison par `compteLieId`) |
| Bénéficiaires | 25 à 30, dont trois graphies d'un même marchand pour éprouver la fusion |
| Étiquettes | 4, dont une avec cible mensuelle |
| Virements | au moins un paiement de Visa par mois, plus une cotisation CELIAPP mensuelle — **paires symétriques liées**, exclues du budget des deux côtés |
| Ventilations | le paiement hypothécaire mensuel, découpé capital / intérêts / assurance, avec des montants qui suivent le vrai échéancier |
| Allocations | 12 mois d'allocations par enveloppe, cohérentes avec les dépenses |
| Cibles | au moins une par mode : une `RECOMPLETER` (épicerie, 600 $/mois), une `ACCUMULER` annuelle (immatriculation, 340 $ en mars), une trimestrielle |
| Report | au moins une enveloppe en `AUCUN`, une en `SIGNE` avec un **dépassement réel** qui se propage, une en `POSITIF_SEULEMENT` |
| Mouvements | 3 à 4 mouvements entre enveloppes, dont **deux partageant un `groupeId`** pour éprouver l'annulation groupée |
| Règles | 6 à 8, avec conditions composées (montant, compte), dont **deux volontairement en conflit** |
| Objectifs | 2 : « Mise de fonds » (EPARGNE, adossé au CELIAPP en mode TOTAL, avec taux de croissance) et le remboursement de la Marge |
| Plan de dette | 1, stratégie AVALANCHE, incluant Visa et Marge |
| Scénario | 1, avec deux surcharges, pour que l'écran ait un cas à afficher |
| Termes de prêt | 2 `LoanTerm` sur l'Hypothèque, avec un **renouvellement de taux** à mi-historique |
| Droits de cotisation | `ContributionRoom` pour CELIAPP et REER sur deux années |

**Les vérifications à écrire comme tests**, en plus de celle des soldes déjà prévue :

1. pour chaque virement, `T1.montantCents + T2.montantCents = 0` et les deux pointent l'un vers l'autre ;
2. pour chaque parent ventilé, la somme des lignes filles égale le parent ;
3. pour chaque enveloppe et chaque mois, `disponible = report + assigné + activité` ;
4. le total des allocations d'un mois ne dépasse jamais les revenus cumulés disponibles ;
5. aucun virement et aucun parent ventilé n'apparaît dans `activité(s, m)`.

## 6. Ordre d'exécution révisé

Le §4 de `lot-m0.md` tient, avec deux insertions :

1. Stack `budgapp-db` — déjà fait, rien à reprendre.
2. Init du projet, configuration, arborescence — déjà fait, plus les cinq dossiers du §4 ci-dessus.
3. `domain/money.ts` et `domain/dates.ts` avec leurs tests — **`dates.ts` est à compléter** : `echeances()` doit couvrir les 12 cadences, dont `AUX_2_SEMAINES` (la paie), `DEUX_FOIS_PAR_MOIS`, `AUX_4_SEMAINES` et `AUX_4_MOIS`.
4. **Nouveau — `domain/budget/`** : `report()`, `disponible()`, `resteAAssigner()`, `besoinDuMois()`, avec leurs tests. Avant le seed, parce que le seed s'en sert pour produire des allocations cohérentes.
5. Schéma Prisma (`prisma/schema.prisma`, déjà dans la branche), puis `prisma migrate reset` suivi d'une migration initiale propre — **une seule migration**, pas un empilement sur l'ancienne. Relire la migration générée avant de la committer, en vérifiant les trois auto-références : `Transaction.parentId`, `Transaction.transferTransactionId`, `Account.compteLieId`.
6. Seed synthétique du §5, puis les cinq tests de cohérence.
7. `define-action.ts`, `query-keys.ts`, providers, coquille de navigation — inchangés.
8. README, `INDEX.md`, liste de sortie.

## 7. Critère de sortie révisé

- [ ] `npx prisma migrate reset` puis `migrate dev` produisent **une seule migration** qui crée les 39 modèles.
- [ ] `npm run seed` remplit la base avec 18 mois de données déterministes incluant virements, ventilations, allocations, cibles, mouvements, objectifs, plan de dette et scénario.
- [ ] `npx vitest run` passe, avec au minimum les tests de `domain/money.ts`, `domain/dates.ts` (12 cadences) et `domain/budget/`.
- [ ] Les cinq vérifications de cohérence du §5 passent comme tests.
- [ ] `npx tsc --noEmit` et `npx eslint .` ne signalent rien.
- [ ] `npm run dev` démarre, les six onglets rendent leur nom.
- [ ] `INDEX.md` est à jour.

## 8. Documents de référence

Tous dans `docs/` de cette branche :

| Document | Ce qu'il porte |
|---|---|
| `decision-modele-budget.md` | pourquoi les enveloppes, et les cinq décisions du 13 septembre |
| `modele-budget-prevision.md` | report, cibles, reste à assigner, estimation, projection, cloison budget / prévision |
| `modele-ingestion-recurrences.md` | pipeline d'ingestion, dédoublonnage, détection de récurrences, soldes et réconciliation |
| `modele-dettes-scenarios.md` | amortissement canadien, intérêts de carte, plan de remboursement, what-if — utile à partir de M6 |
| `modele-objectifs-patrimoine.md` | objectifs, régimes enregistrés, droits de cotisation, valeur nette — utile à partir de M7 |
| `referentiel-fonctionnalites.md` | l'étude Quicken / YNAB / Monarch et le verdict de périmètre sur 130 fonctionnalités |
| `plan.md` | le plan de reconstruction, dix lots |
