---
name: ship
description: Lance la pipeline complète Planner → Codeur → Testeur → Relecteur sur une demande de feature BudgApp.
disable-model-invocation: true
argument-hint: [description précise de la feature]
---

Lance la pipeline complète pour cette demande : $ARGUMENTS

Exécute les étapes dans l'ordre. **Ne saute jamais une étape.** Après chaque étape, vérifie que le fichier de relais existe avant de lancer la suivante ; si un subagent s'arrête sans l'écrire, arrête la pipeline et montre-moi sa dernière réponse.

## 0. Vérifier l'état de départ

- `git status` : l'arbre doit être propre. S'il traîne des modifications non commitées, arrête-toi et montre-les-moi.
- La branche courante ne doit **pas** être `main` : la convention du projet est une branche par lot (`CLAUDE.md` §14). Si on est sur `main`, arrête-toi et demande-moi sur quelle branche travailler.
- Crée `.pipeline/` s'il n'existe pas, et supprime les fichiers d'un run précédent s'il y en a.

## 1. Planner

Délègue au subagent `planner` avec la demande ci-dessus. Attends `.pipeline/spec.md`.

## 2. Point de contrôle, puis Codeur

Si `.pipeline/spec.md` contient une section `OPEN QUESTIONS`, **arrête-toi** et montre-la-moi telle quelle. Sinon, délègue au subagent `coder`. Attends `.pipeline/changes.md`.

## 3. Testeur

Délègue au subagent `tester`. Attends `.pipeline/test-results.md`. Si des tests, le typecheck ou le lint échouent, arrête-toi et montre-moi les échecs — ne tente pas de corriger toi-même.

## 4. Relecteur

Délègue au subagent `reviewer`. Il est en lecture seule : **enregistre toi-même son rapport complet** dans `.pipeline/review.md`, puis montre-le-moi.

## 5. Fin

Annonce le verdict final. **Ne merge rien. Ne commite rien. Ne pousse rien.** Laisse la branche telle quelle pour ma relecture.
