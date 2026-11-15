# BudgApp v2 — plan de reconstruction

*Révision du 13 septembre 2026. Intègre le périmètre arrêté après l'étude de Quicken, YNAB et Monarch, et le renversement de la décision sur le modèle de budget.*

Documents liés : `referentiel-fonctionnalites.md` (ce que fait le marché, et ce qu'on en retient) · `decision-modele-budget.md` (pourquoi les enveloppes) · `modele-budget-prevision.md` (budget, report, cibles, projection) · `modele-ingestion-recurrences.md` (ingestion, doublons, récurrences, soldes) · `modele-dettes-scenarios.md` (amortissement, remboursement, what-if) · `modele-objectifs-patrimoine.md` (objectifs, régimes enregistrés, valeur nette) · `lot-m0-revision.md` (ce qui change dans le socle) · `description-fonctionnelle-v1.md` · `audit-v1.md`.

---

## 1. Ce qu'est BudgApp, en une phrase

Une application de budget personnel qui fait **quatre** choses :

1. **Suivre** — transformer un relevé bancaire en transactions catégorisées, puis les consulter et les corriger.
2. **Budgéter** — répartir l'argent en enveloppes qui se reportent d'un mois à l'autre, et voir ce qu'il reste.
3. **Prévoir** — projeter la situation à 12 mois depuis les récurrences et une estimation statistique des postes variables.
4. **Décider** — simuler : un remboursement de dette accéléré, un revenu qui change, une dépense qu'on ajoute.

Le v1 ne fait que le début du premier point.

## 2. Décisions produit actées

| Sujet | Décision |
|---|---|
| Modèle de budget | **enveloppes avec report**, trois colonnes alloué / dépensé / disponible. Report `SIGNE` par défaut, configurable par sous-catégorie (aucun / signé / positifs seulement) |
| Cibles | **paramétrables** : montant × cadence × jour × mode (recompléter / accumuler). Le montant mensuel fixe devient le cas le plus simple |
| Reste à assigner | affiché, **indicatif** en v2. Durcissable plus tard sans changement de schéma |
| Mouvements entre enveloppes | **événements conservés**, groupés, annulables |
| Cartes de crédit | **pas d'enveloppe de paiement**. Le paiement est un virement ; la couverture du relevé est un indicateur calculé. Taux, jour de relevé, jour d'échéance et règle de délai de grâce portés par le compte |
| Budget ↔ prévision | **cloison étanche.** Un seul point de contact, en lecture : l'écart affiché sur l'écran Budgets |
| Portée | mono-utilisateur local, **un seul budget familial**, sans cloison entre membres. `ownerId` partout dès le schéma |
| Entrée des données | copier-coller Desjardins conservé ; **plus** CSV, OFX/QFX, saisie manuelle. Agrégateur bancaire : cible, pas v2 — mais le schéma le prévoit déjà |
| Montants | **cents**, toujours. L'arrondi au dollar est un réglage d'affichage |
| Cible | bureau **et** mobile, application web adaptative |
| Navigation | barre horizontale, huit onglets, plus une barre de période persistante |
| Placements | **légers** : solde daté, régime fiscal, allocation par classe, droits de cotisation, valeur nette. Pas de titres, pas de cours |
| Fiscalité | **hors périmètre**, y compris le champ de ligne fiscale |

## 3. Ce qu'on emporte du v1

Le parser `SimpleTransactionParser` avec ses regex — c'est l'actif principal et il fonctionne. La logique de catégorisation par mots-clés, **y compris la règle « conflit = on ne tranche pas, on signale »**, qu'aucun des trois produits comparés n'applique. Le parcours d'import en trois temps : coller → corriger dans un tableau en mémoire → sauvegarder. Le modèle conceptuel comptes / catégories / sous-catégories / mots-clés / filtres. La stack Next.js + Prisma + TanStack Query + shadcn. Le logo et les tokens.

Ce qu'on laisse : le schéma en dollars entiers, les tables d'agrégat jamais recalculées, la couche d'actions qui `throw` des messages effacés en production, les cinq fichiers CRUD copiés-collés, les hooks instanciés dans chaque cellule du tableau, et le code mort.

---

## 4. Périmètre de la v2

### 4.1 Corrections de règles par rapport au v1

| Sujet | v1 | v2 |
|---|---|---|
| Montants | entier de dollars, `floor`/`ceil` | **entier de cents**, signé ; arrondi = affichage |
| Date | `DateTime` reconstruit en local puis relu en UTC | `DateCivile` — une **chaîne** `AAAA-MM-JJ` dans le domaine, `@db.Date` en base |
| Sens du montant | le `+` du relevé est le seul marqueur | règle par défaut d'un **profil d'import** explicite |
| Unicité sous-catégorie | globale à toute la base | **par catégorie** |
| Ordre | aucun | `ordre` sur catégories et sous-catégories |
| Ré-import | duplique tout en silence | **déduplication en trois couches**, doublons signalés |
| Lignes non reconnues | jetées en silence | panneau dédié, saisissables à la main |
| Erreurs serveur | `throw` masqué en production | résultat typé `{ ok, code, message }` |
| Historiques | deux tables dénormalisées jamais recalculées | supprimées, tout se calcule par requête |
| Solde de compte | inexistant | ancrage daté conservé + somme des transactions |
| Virements | inexistants | **paire symétrique liée**, exclue du budget des deux côtés |
| Ventilations | inexistantes | ligne fille = transaction avec un parent |
| Catégorisation | mot-clé → sous-catégorie | **moteur de règles** ordonné, conditions en ET, actions multiples, rétroactif avec aperçu, trace de la règle appliquée |

### 4.2 Écrans à construire

| Écran | Contenu |
|---|---|
| **Accueil** | **total des enveloppes en chiffre de référence**, cartes de solde par compte à côté, grille des catégories du mois avec barre réel vs disponible, dernières transactions, alertes |
| **Transactions — Import** | profil d'import, aperçu, lignes non reconnues, doublons, rapprochement avec les occurrences attendues, tableau d'édition, catégorisation |
| **Transactions — Enregistrées** | recherche, filtres, tri, édition et suppression en place, pagination, réattribution en masse, ventilation, étiquetage |
| **Transactions — Récurrences** | suggestions détectées en attente, séries confirmées, paiements attendus non vus |
| **Budgets** | les trois colonnes par enveloppe, reste à assigner, cibles, remplissage automatique, mouvements entre enveloppes avec annulation, **écart avec la prévision** |
| **Prévision** | courbe de solde projeté à 12 mois avec bande p25–p75, tableau ligne par ligne, alerte de liquidité, calendrier financier, scénarios what-if |
| **Objectifs** | objectifs d'épargne et de remboursement, progression, statut, plan de dette avec ses trois stratégies et son différentiel |
| **Patrimoine** | valeur nette dans le temps, comptes de suivi, allocation d'actifs, droits de cotisation |
| **Rapports** | drill-down catégorie → sous-catégorie → transactions, par bénéficiaire, par étiquette, plages dynamiques, rapports enregistrés, export |
| **Paramètres** | comptes, catégories, règles, filtres, bénéficiaires, étiquettes, récurrences, profils d'import, flux d'agenda, préférences |

### 4.3 Hors périmètre v2

Agrégateur bancaire (cible, pas v2). Authentification et multi-utilisateur réel. Multi-devises. Saisonnalité dans l'estimation. Fiscalité. Titres et cours de placement. Reçus par courriel. Catégorisation par IA. Projection à 40 ans, Monte-Carlo, événements de vie. Sankey, export PDF, drapeaux, pièces jointes, journal des modifications, mode confidentialité, API publique — tous reportés après la v2, pas écartés.

---

## 5. Architecture

```
src/
  app/                      # routes App Router, minces
  domain/                   # logique pure, zéro framework, 100 % testable
    money.ts                # cents, arrondi d'affichage, formatage fr-CA
    dates.ts                # DateCivile, 12 cadences, échéances
    statement/              # parser + profils d'import
    categorization/         # règles, conditions, actions, résolution des conflits
    budget/                 # report, disponible, reste à assigner, besoin du mois
    forecast/               # estimation, projection, alertes
    dette/                  # amortissement, échéancier, plan de remboursement, intérêts
    objectif/               # progression, statut, valeur future
    patrimoine/             # valeur nette, allocation, droits de cotisation
    scenario/               # résolution d'une surcouche sur le modèle réel
  server/
    db.ts
    repositories/           # seul endroit qui parle à Prisma
    actions/define-action.ts
  features/                 # transactions, budgets, forecast, objectifs, patrimoine, …
  components/ui/            # shadcn
  lib/
```

Règles structurantes : `domain/` ne dépend de rien ; Prisma n'apparaît que dans `server/repositories/` ; toute action passe par `defineAction(schema, handler)` et retourne un `ActionResult` typé ; lecture et écriture sont deux hooks distincts ; `staleTime` configuré et fabrique de clés typée ; aucun `any`, `noUncheckedIndexedAccess` activé.

**Tests** — Vitest sur `domain/` dès le premier jour. En priorité : le parser (fixtures de vrais relevés anonymisés), la conversion des montants, les 12 cadences, la résolution des règles, **le report en cascade**, l'amortissement en convention canadienne, et **la prévision** (séries synthétiques : un poste stable, un poste avec une valeur aberrante, un poste naissant, un compte qui passe sous zéro).

---

## 6. Ordre des lots

L'Accueil descend en fin de parcours : c'est une composition de tout le reste.

| Lot | Contenu | Critère de sortie |
|---|---|---|
| **M0 — socle** | base Postgres en conteneur, squelette Next, **schéma Prisma complet (39 modèles)**, `domain/money`, `domain/dates`, `domain/budget`, seed synthétique, tests | voir `lot-m0-revision.md` §7 |
| **M1 — référentiel + ingestion** | comptes (tous les types), catégories, bénéficiaires, étiquettes, moteur de règles, filtres ; pipeline d'ingestion générique avec l'adaptateur copier-coller, parser porté, dédoublonnage en couches, lignes non reconnues, revue d'import, catégorisation | un relevé réel entre et ressort correctement en base |
| **M2 — consultation** | recherche, filtres, tri, édition et suppression en place, pagination, réattribution en masse, **ventilations et virements** | l'application est utilisable sans Prisma Studio ; un paiement de carte ne compte pas deux fois |
| **M3 — récurrences et soldes** | détection, confirmation, liaison rétroactive, rapprochement à l'import ; ancrages de solde et réconciliation | « Netflix, 17,99 $ le 12 de chaque mois » est détecté, confirmé, et chaque prélèvement est lié à son occurrence |
| **M4 — budget** | les trois colonnes, report en cascade, cibles, reste à assigner, remplissage automatique, mouvements avec annulation groupée | un dépassement d'août réduit le disponible de septembre sans salir le rapport de septembre |
| **M5 — prévision** | estimation, projection 12 mois avec fourchette, tableau détaillé, alerte de liquidité, calendrier financier, flux ICS entrant et sortant, **écart budget / prévision** | « dans 6 mois on sera à tel solde, et le compte Chèque passe sous le seuil le 27 novembre » |
| **M6 — dettes et scénarios** | comptes de prêt, amortissement canadien, fiche de prêt avec son graphique, intérêts de carte, plan de remboursement à trois stratégies avec différentiel, scénarios what-if | « en mettant 200 $ de plus par mois, je suis libre 14 mois plus tôt et j'économise 2 180 $ » |
| **M7 — objectifs et patrimoine** | objectifs d'épargne, allocation de comptes, statut ; valeur nette, régimes enregistrés, droits de cotisation, allocation d'actifs | « ma mise de fonds est à 62 %, dans les temps pour juin 2028 » |
| **M8 — rapports** | drill-down, par bénéficiaire, par étiquette, plages dynamiques, rapports enregistrés, comparaison de périodes, export | on répond à « où est passé l'argent en août » |
| **M9 — accueil et finitions** | tableau de bord, import CSV et OFX, export, mobile, préférence d'arrondi | v2 en service |

**Le seed synthétique** (M0) remplit une base vide avec dix-huit mois de données réalistes — huit comptes, une vingtaine de sous-catégories, plusieurs centaines de transactions, avec de vraies récurrences, des virements, des ventilations et des allocations dedans. Ce n'est pas un pis-aller : sans lui, impossible de développer la détection de récurrences, les rapports, le budget ou la prévision, qui ont tous besoin de six à vingt-quatre mois d'historique. Il sert aussi de jeu de tests reproductible. Le détail est dans `lot-m0-revision.md` §5.

## 7. Design

### 7.1 Direction retenue

Coquille : **barre horizontale du haut** (logo + onglets) **plus une barre secondaire de période persistante** — segmenté Mois / Année / Personnalisé, flèches ‹ Septembre 2026 ›, indicateur « N transactions à revoir », bouton « Importer un relevé » à droite.

**Huit onglets** : Accueil · Transactions · Budgets · Prévision · Objectifs · Patrimoine · Rapports · Paramètres. Objectifs et Patrimoine peuvent partager un onglet au départ et se séparer quand M7 les remplit.

Accueil : le **total des enveloppes** occupe la place forte, parce que c'est le chiffre vrai — le solde bancaire, lui, est gonflé du montant des cartes non encore payées. Les cartes de solde par compte viennent à côté, pas au-dessus. Puis la grille des catégories du mois avec barre de progression réel vs disponible, cliquable pour descendre dans les sous-catégories. Puis les dernières transactions.

### 7.2 Décisions de design

**Palette hybride, provisoire.** On garde l'identité ambre — logo cochon, dégradé `#fbbf24 → #f97316`, ambre `#f59e0b` pour les signaux de budget — avec rouge `#dc2626` pour les sorties et les dépassements, vert `#16a34a` pour les entrées. **IBM Plex Mono à chiffres tabulaires pour tous les montants** ; Instrument Sans porte l'interface. La direction artistique définitive est repoussée.

**Paramètres en onglets secondaires** (Comptes / Catégories / Règles / Filtres / Bénéficiaires / Étiquettes / Récurrences / Profils d'import / Agenda / Préférences). Plus de barre latérale.

### 7.3 Ce que le modèle demande à l'interface

Une projection se lit comme une **fourchette**, jamais comme un chiffre exact : courbe centrale plus bande p25–p75. Une sous-catégorie estimée sur moins de trois mois d'historique est affichée comme telle. L'alerte de liquidité se formule en phrase datée, pas en voyant rouge.

Sur l'écran Budgets, les trois colonnes doivent être lisibles **simultanément** : l'alloué est la référence, le disponible est le solde réel, et l'écart entre les deux raconte ce qui s'est passé le mois dernier. Un dépassement se corrige en place, par un mouvement depuis une autre enveloppe, avec une annulation d'un geste.

Un simulateur — dette ou scénario — offre **trois sorties obligatoires** : réinitialiser, enregistrer comme plan, fermer sans enregistrer. Jamais une modification en place.

---

## 8. Environnement

**Base de données** — stack Docker `budgapp-db` sur un hôte Docker existant de l'infrastructure personnelle, déployé comme les autres services. Postgres 17, bases `budgapp_dev` et `budgapp_prod`, extensions `pg_trgm` et `unaccent`, `pg_dump` quotidien vers un stockage réseau. *(Copie publique : détails d'hébergement retirés ; le `docker-compose.yml` à la racine fournit une base locale équivalente.)*

**Dépôt** — `BudgApp`, sur une forge privée, avec `CLAUDE.md` à la racine et une spécification par lot dans `docs/`.

**Exposition** — derrière un proxy inverse, quand il y aura une application à déployer (fin de M1).

**Boucle de développement** — développement local sur le PC, contre la base `budgapp_dev` du serveur. Le serveur héberge la forge, Postgres et la cible de déploiement, pas l'éditeur.

### 8.1 Pourquoi PostgreSQL

Les fonctions qu'on va réellement écrire, pas des arguments généraux : `percentile_cont` pour la médiane et les quartiles du modèle de prévision, calculés en base au lieu de ramener l'historique en mémoire · `generate_series` pour les grilles de mois sans trous, dans un rapport comme dans une courbe de valeur nette · les fonctions de fenêtrage (`lag`, moyennes glissantes) pour les intervalles entre occurrences dans la détection de récurrences · `pg_trgm` pour le regroupement par similarité quand un libellé varie · `ON CONFLICT` pour l'idempotence des synchronisations sur `externalId` · types `date` natifs, énumérations, index d'expression et index partiels.

Le coût, honnêtement : un service de plus à faire tourner et à sauvegarder. Comme le stack Docker est déjà en place, c'est un coût déjà engagé.

### 8.2 CI

Pas de runner d'intégration continue pour l'instant. Un hook Git `pre-push` qui lance `npm run check` (lint, `tsc --noEmit`, `vitest run`) suffit sur un projet solo. Un runner quand il y aura des tests qui valent la peine d'être protégés.

---

## 9. Méthode de travail

La planification et la conception se font dans le projet Claude « Budgapp ». **L'écriture du code et les commits se font dans Claude Code**, à partir de ces documents, par la pipeline de quatre agents (planner → coder → tester → reviewer) enchaînés par `/ship`.

- `CLAUDE.md` à la racine porte les conventions appliquées à chaque session.
- `docs/` reçoit **une spécification par lot**, assez précise pour être exécutée sans revenir au projet Claude.
- Le lot M0 se fait à la main ; la pipeline s'applique à partir de M1.

## 10. État des décisions

**Décidé** — PostgreSQL · enveloppes avec report signé par défaut · cibles paramétrables · pas d'enveloppe de paiement de carte · un seul budget familial · cloison budget / prévision · placements légers · fiscalité hors périmètre · `npm` · seed synthétique dès M0 · Accueil en dernier · pas de CI pour commencer · périmètre complet arrêté ligne par ligne (130 fonctionnalités).

**Reste à faire** — appliquer `lot-m0-revision.md` sur la branche `m0`, fusionner dans `main`, puis attaquer M1.
