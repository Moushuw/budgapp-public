# Historique du dépôt privé

Le développement de BudgApp a lieu depuis septembre 2026 sur un dépôt privé. Cette copie publique repart d'un historique neuf ; voici, à titre de trace, les messages de commit de la branche `main` du dépôt privé, lot par lot, dans l'ordre. Les hash sont omis : ils ne désignent rien ici.

Nettoyage appliqué : noms d'hôtes, outil de déploiement et chemins d'infrastructure retirés de sept messages ; les messages vides (`-`) sont conservés tels quels. Les commits « Déploiement » de la fin portent sur le dossier `deploy/`, absent de cette copie.

## M0 — socle (étiquette `m0`)

48 commits.

- 2026-09-06 · docs: ajoute INDEX.md, carte du projet et journal des décisions
- 2026-09-06 · docs: ajoute CLAUDE.md, conventions du projet et bonnes pratiques Next.js 16
- 2026-09-06 · docs: spécification du lot M0 (socle)
- 2026-09-06 · docs: référence la spécification du lot M0 dans l'index
- 2026-09-13 · docs(m0): l'environnement passe en Docker, plus de machine dédiée
- 2026-09-13 · docs(index): hébergement Docker, décisions du 2026-09-13
- 2026-09-13 · docs: importe le plan de reconstruction, environnement mis à jour pour Docker
- 2026-09-13 · docs: importe le modèle d'ingestion, récurrences et soldes
- 2026-09-13 · docs: importe le modèle de budget et de prévision
- 2026-09-13 · docs: importe la description fonctionnelle du v1 (règles exactes du parser)
- 2026-09-13 · Ajouter le fichier Audit.md pour documenter les pratiques d'audit et de sécurité du projet.
- 2026-09-13 · Merge branch 'main' (forge privée)
- 2026-09-13 · Actualiser docs/audit-v1.md
- 2026-09-13 · chore(agents): ajoute l'agent planner de la pipeline /ship
- 2026-09-13 · chore(agents): ajoute l'agent coder de la pipeline /ship
- 2026-09-13 · chore(agents): ajoute l'agent tester de la pipeline /ship
- 2026-09-13 · chore(agents): ajoute l'agent reviewer de la pipeline /ship
- 2026-09-13 · chore(agents): ajoute la commande /ship qui orchestre la pipeline
- 2026-09-13 · chore: ajoute le .gitignore (secrets, artefacts Next, relais de la pipeline)
- 2026-09-13 · chore(agents): pré-approuve les commandes dont la pipeline a besoin
- 2026-09-13 · docs: mode d'emploi de la pipeline d'agents /ship
- 2026-09-13 · `-` (message vide)
- 2026-09-13 · Merge remote-tracking branch 'origin/main' into m0-socle
- 2026-09-13 · feat(socle): scaffold Next.js 16, shadcn/ui et arborescence cible
- 2026-09-13 · feat(domain): money.ts et dates.ts, testés
- 2026-09-13 · feat(db): schéma Prisma complet et première migration
- 2026-09-13 · feat(domain): normalisation et empreinte d'ingestion
- 2026-09-13 · feat(seed): jeu de données synthétique déterministe sur 18 mois
- 2026-09-13 · feat(socle): contrat d'action, providers, coquille de navigation
- 2026-09-13 · docs: README et INDEX.md à jour après l'exécution du lot M0
- 2026-09-13 · `-` (message vide)
- 2026-09-13 · test d'encodage — à supprimer
- 2026-09-13 · docs: révision M0 — modèle d'enveloppes, schéma à 39 modèles
- 2026-09-13 · schema: modèle d'enveloppes, virements, ventilations, dettes, objectifs, patrimoine (39 modèles)
- 2026-09-13 · docs: modèle de budget réécrit — enveloppes, report, cibles, cloison avec la prévision
- 2026-09-13 · docs: décisions du 13 septembre sur le modèle de budget
- 2026-09-13 · chore: retrait du fichier de test d'encodage
- 2026-09-13 · docs: plan réécrit — périmètre arrêté, dix lots
- 2026-09-13 · Merge remote-tracking branch 'origin/m0' into m0-socle
- 2026-09-14 · M0 — socle applicatif et documents de conception révisés
- 2026-09-14 · db: retrait de la migration initiale — générée depuis l'ancien schéma, à régénérer
- 2026-09-14 · docs: référentiel Quicken / YNAB / Monarch et verdict de périmètre sur 130 fonctionnalités
- 2026-09-13 · fix: restaure le schéma et la révision M0 dans leur version autoritaire
- 2026-09-13 · feat(domain): 12 cadences dans dates.ts, domain/budget/ (enveloppes)
- 2026-09-13 · fix(db): syntaxe des énumérations Prisma, migration initiale à 39 modèles
- 2026-09-13 · feat(seed): réécriture pour le modèle d'enveloppes (docs/lot-m0-revision.md §5)
- 2026-09-13 · docs: INDEX.md à jour après la révision M0 (modèle d'enveloppes)
- 2026-09-14 · Merge du lot M0 — socle révisé (#2)

## M1 — référentiel et ingestion (étiquette `m1`)

55 commits.

- 2026-09-14 · docs(m1): spécification du lot Référentiel + ingestion
- 2026-09-14 · docs: cycle de vie git complet et mise à jour post-renversement du modèle
- 2026-09-14 · docs(index): M0 fusionné dans main, M1 spécifié
- 2026-09-13 · feat(m1): socle serveur et patron de référentiel (tranche 1)
- 2026-09-13 · chore: retire .env du suivi (CLAUDE.md §2, règle 10)
- 2026-09-14 · fix(etiquettes): corrige les défauts bloquants de la relecture M1 tranche 1
- 2026-09-14 · feat(m1): comptes, categories, sous-categories et filtres (tranche 2)
- 2026-09-14 · fix(payees): corrige les 4 blocages de la relecture M1 tranche 3
- 2026-09-14 · fix(outillage): exclure .claude des globs de lint, tsc et vitest
- 2026-09-18 · feat(parser): parser de relevés Desjardins AccèsD (M1 tranche 4)
- 2026-09-19 · feat(regles): moteur de règles de catégorisation, éditeur, application rétroactive (M1 tranche 5)
- 2026-09-19 · perf(schema): coherence.test.ts robuste par conception, pas par plafond
- 2026-09-19 · fix(regles): purge des points 7-9 de la relecture tranche 5
- 2026-09-19 · fix(outillage): répare next build et l'ajoute à npm run check
- 2026-09-20 · fix(ingestion): n'importe plus de valeur du barillet domain/ingestion depuis du code client
- 2026-09-20 · feat(import): pipeline d'ingestion et écran d'import (M1 tranche 6)
- 2026-09-29 · fix(import): purge de la relecture ciblée des correctifs de la tranche 6
- 2026-09-29 · fix(beneficiaires): clé d'identité douce, séparée de la normalisation des relevés
- 2026-09-29 · fix(beneficiaires): le minimum de trois caractères ne vaut que pour le préfixe
- 2026-09-30 · `-` (message vide)
- 2026-10-01 · fix(regles): purge de la relecture de la passe manuelle M1
- 2026-10-01 · chore(pilotage): mode pilote autonome
- 2026-10-01 · chore(pilotage): suivi en direct et notifier corrigé
- 2026-10-01 · feat(import): arbitrages A1 à A6 de la passe manuelle M1
- 2026-10-01 · docs(pilotage): M1-P2 faite, décisions et dettes du cycle
- 2026-10-01 · test(m1): tests d'intégration isolés dans le schéma test
- 2026-10-01 · docs(pilotage): M1-P3 faite, décisions et dettes du cycle
- 2026-10-02 · test(m1): parcours de bout en bout Playwright contre le schéma e2e
- 2026-10-02 · chore(pilotage): agents au premier plan et limite d'utilisation fiable
- 2026-10-02 · docs(pilotage): M1-P4 faite, décisions et dettes du cycle
- 2026-10-03 · test(m1): tests sur données réelles (npm run test:reel)
- 2026-10-03 · docs(pilotage): M1-P5 faite, Q-2 sur le compte chèque, M1-P7 bloquée
- 2026-10-03 · fix(m1): petites dettes avant la fusion du lot
- 2026-10-03 · docs(pilotage): M1-P6 faite, Q-3 sur les consignes des agents
- 2026-10-04 · chore(agents): coder — oracle intouchable, garde-fous de la spec lancés (Q-3)
- 2026-10-04 · chore(agents): tester — oracle intouchable, garde-fous de la spec lancés (Q-3)
- 2026-10-04 · fix(m1): contrôle croisé chèque d'août sur le relevé du bon compte
- 2026-10-04 · docs(pilotage): M1-C1 faite, Q-2 résolue, M1-P7 débloquée
- 2026-10-04 · Merge remote-tracking branch 'origin/m1-ingestion' into m1-ingestion
- 2026-10-04 · docs(pilotage): Q-3 fermée, consignes des agents posées par Benjamin
- 2026-10-04 · docs(pilotage): passe de sortie M1 rouge, corrections C1 et C2 planifiées
- 2026-10-04 · docs(m1): INDEX.md à jour pour la passe de sortie
- 2026-10-04 · docs(pilotage): M1-C2 faite, dette des renvois à .pipeline/ dans M2-S
- 2026-10-04 · feat(m1): mode passe des parcours e2e et contrôle des dialogues
- 2026-10-04 · docs(pilotage): M1-O1 faite, consignes de la seconde passe M1
- 2026-10-04 · docs(pilotage): seconde passe de sortie M1 rouge, corrections C3 et C4 planifiées
- 2026-10-04 · fix(import): date entière en mobile et en-têtes alignés dans la revue
- 2026-10-04 · docs(pilotage): M1-C3 faite, mineurs du relecteur dans M2-S
- 2026-10-04 · test(parser): noms de personne inventés dans la fixture chèque
- 2026-10-04 · docs(pilotage): M1-C4 faite, données indirectes des fixtures dans M2-S
- 2026-10-04 · docs(pilotage): troisième passe de sortie M1 rouge, correction C5 planifiée
- 2026-10-04 · fix(import): en-têtes de section de la revue contenus dans la carte en mobile
- 2026-10-04 · docs(pilotage): M1-C5 faite, mineurs du relecteur dans M2-S
- 2026-10-04 · docs(pilotage): quatrième passe de sortie M1 verte, fusion ouverte
- 2026-10-04 · Merge du lot M1 — référentiel et ingestion

## M2 — consultation, ventilations, virements (étiquette `m2`)

30 commits.

- 2026-10-04 · docs(pilotage): M1-P8 faite, lot M1 fusionné dans main (étiquette m1)
- 2026-10-04 · docs(m2): spécification du lot M2 — consultation, ventilations, virements
- 2026-10-04 · docs(pilotage): M2-S faite, prochaine unité M2-T1
- 2026-10-04 · feat(m2): socle de M2 — messages zod, appliedRuleId contrôlé, type d'opération persisté
- 2026-10-04 · docs(pilotage): M2-T1 faite, prochaine unité M2-T2
- 2026-10-04 · feat(transactions): lecture de /transactions — curseur, filtres dans l'URL, détail, barre de période
- 2026-10-04 · docs(pilotage): M2-T2 faite, Q-4 tranchée par Benjamin, prochaine unité M2-T3
- 2026-10-05 · feat(transactions): écriture dans /transactions — édition, suppression, saisie manuelle, masse
- 2026-10-05 · docs(pilotage): M2-T3 faite, dettes du relecteur en M2-T4 et M2-T5, prochaine unité M2-T4
- 2026-10-05 · feat(transactions): ventilations — domaine, détail, règles VENTILER, import et rétroaction
- 2026-10-05 · docs(pilotage): M2-T4 faite, dettes du relecteur en M2-T6 et M2-T7, prochaine unité M2-T5
- 2026-10-06 · feat(transactions): virements — lier, délier, contrepartie, saisie, suppression, proposition à l'import
- 2026-10-06 · docs(pilotage): M2-T5 faite, dettes du relecteur en M2-T6, prochaine unité M2-T6
- 2026-10-06 · feat(import): revue d'import — conflit au toucher, étiquettes mobiles, pluriels écrits, en-têtes de Doublons et Filtrées
- 2026-10-06 · docs(pilotage): M2-T6 faite, dettes du relecteur en M2-T7, prochaine unité M2-T7
- 2026-10-06 · docs(pilotage): décisions du cycle M2-T6
- 2026-10-06 · feat(transactions): mobile et Paramètres, verrous ordonnés des virements, messages de course précis
- 2026-10-06 · docs(pilotage): M2-T7 faite, prochaine unité M2-P1
- 2026-10-06 · docs(pilotage): passe M2 n° 1 rouge, corrections en M2-C1, prochaine unité M2-C1
- 2026-10-06 · fix(m2): corrections de la passe de sortie M2 n° 1
- 2026-10-06 · docs(pilotage): M2-C1 faite, prochaine unité M2-P2
- 2026-10-06 · docs(pilotage): passe M2 n° 2 rouge (P2-a), correction en M2-C2, prochaine unité M2-C2
- 2026-10-08 · fix(m2): reste à répartir visible dans l'éditeur de ventilation
- 2026-10-08 · docs(pilotage): M2-C2 faite, prochaine unité M2-P3
- 2026-10-08 · docs(pilotage): passe M2 n° 3 rouge (P3-a), correction en M2-C3, prochaine unité M2-C3
- 2026-10-08 · docs(m2): index à jour après la passe M2 n° 3
- 2026-10-08 · docs(pilotage): M2-C3 faite, prochaine unité M2-P4
- 2026-10-08 · docs(pilotage): passe M2 n° 4 verte, prochaine unité M2-F
- 2026-10-08 · docs(pilotage): M2-F en cours, fusion du lot M2
- 2026-10-08 · Merge du lot M2 — consultation

## M3 — récurrences et soldes (étiquette `m3`)

29 commits.

- 2026-10-08 · docs(pilotage): M2-F faite, lot M2 fusionné dans main (étiquette m2)
- 2026-10-08 · docs(pilotage): consignes de Benjamin du 8 octobre — bureau d'abord, mobile en M9, optimisation de l'enveloppe
- 2026-10-08 · docs(pilotage): M3-O1 avant M3-S — application des consignes du 8 octobre
- 2026-10-08 · docs(m3): spécification du lot récurrences et soldes
- 2026-10-08 · chore(pilotage): le bureau d'abord, le mobile en M9 — consignes du 8 octobre (M3-O1)
- 2026-10-08 · docs(pilotage): M3-O1 faite (0bfe186)
- 2026-10-08 · Merge de main dans m3-recurrences — spec M3 révisée pour le bureau d'abord
- 2026-10-08 · docs(pilotage): M3-S faite (a598c4e), prochaine unité M3-T1
- 2026-10-09 · feat(domain): domaine des récurrences, seed sans Netflix confirmé (M3-T1)
- 2026-10-09 · docs(pilotage): M3-T1 faite (2f66713), prochaine unité M3-T2
- 2026-10-09 · feat(transactions): récurrences — persistance, écran et section du détail (M3-T2)
- 2026-10-09 · docs(pilotage): M3-T2 faite (2e00370), correction M3-C1 du seed en tête
- 2026-10-09 · fix(transactions): montants des règles du seed signés, invariants de montant des échéances (M3-C1)
- 2026-10-09 · docs(pilotage): M3-C1 faite (92f857a), prochaine unité M3-T3
- 2026-10-09 · docs(pilotage): amendements M3-O1 posés dans le skill piloter et l'agent verificateur, Q-5 fermée
- 2026-10-09 · feat(import): rapprochement des échéances récurrentes à l'import (M3-T3)
- 2026-10-09 · docs(pilotage): M3-T3 faite (85c11c7), prochaine unité M3-T4
- 2026-10-10 · feat(comptes): soldes saisis et réconciliation des écarts (M3-T4)
- 2026-10-10 · docs(pilotage): M3-T4 faite (47a4403), M3-O2 ouverte, prochaine unité M3-O2
- 2026-10-10 · test(regles): dates de rules.test.ts isolées en 2096 contre une course du balayage (M3-O2)
- 2026-10-10 · docs(pilotage): M3-O2 faite (d6b0d05), dette balayerTransactions sur M3-T5, prochaine unité M3-T5
- 2026-10-10 · fix(m3): dettes des passes M2 et des contrôles visuels M3 (M3-T5)
- 2026-10-10 · docs(pilotage): M3-T5 faite (b200c8e), prochaine unité M3-P1
- 2026-10-10 · docs(pilotage): passe de sortie M3 n° 1 rouge (M3-P1), M3-C2 et M3-P2 ouvertes
- 2026-10-10 · fix(m3): correction de la passe M3 n° 1 (M3-C2)
- 2026-10-10 · docs(pilotage): M3-C2 faite (f9c6da3), prochaine unité M3-P2
- 2026-10-10 · docs(pilotage): passe de sortie M3 n° 2 verte (M3-P2), prochaine unité M3-F
- 2026-10-10 · docs(pilotage): M3-F en cours
- 2026-10-10 · Merge du lot M3 — récurrences et soldes

## Après M3, sur `main`

12 commits.

- 2026-10-10 · docs(pilotage): M3-F faite (3e54b29), étiquette m3, prochaine unité M4-S
- 2026-10-24 · Déploiement : rapatrie le stack budgapp-db (compose) depuis le dépôt d'infrastructure
- 2026-10-24 · Déploiement : rapatrie le script de sauvegarde quotidienne de budgapp-db
- 2026-10-24 · Déploiement : rapatrie le script d'initialisation de budgapp-db
- 2026-10-24 · Déploiement : déclaration du stack budgapp-db pour l'outil de déploiement
- 2026-10-24 · Déploiement : README du dossier deploy (base, sauvegarde, réinitialisation)
- 2026-10-24 · README : la base et son déploiement sont décrits dans deploy/, plus dans le dépôt d'infrastructure
- 2026-11-06 · Actualiser le script de sauvegarde de la base
- 2026-11-06 · Actualiser le script de sauvegarde de la base
- 2026-11-06 · Déploiement : mot de passe de la base en secret compose (fichier)
- 2026-11-06 · Merge pull request 'Déploiement : mot de passe de la base lu dans un fichier (secret compose)' (#7) from claude/secrets-fichiers into main
- 2026-11-06 · Actualiser le script de sauvegarde de la base
