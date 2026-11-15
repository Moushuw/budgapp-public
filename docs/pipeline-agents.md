# Pipeline d'agents — la commande `/ship`

Quatre agents spécialisés qui se passent le relais sans intervention : **Planner → Codeur → Testeur → Relecteur**. Une commande, une feature construite, testée et relue, laissée sur la branche pour validation humaine.

## Les fichiers

| Fichier | Rôle | Modèle |
|---|---|---|
| `.claude/agents/planner.md` | transforme une demande en `.pipeline/spec.md` | Opus |
| `.claude/agents/coder.md` | implémente la spec, écrit `.pipeline/changes.md` | Sonnet |
| `.claude/agents/tester.md` | écrit et lance les tests Vitest, écrit `.pipeline/test-results.md` | Sonnet |
| `.claude/agents/reviewer.md` | rend un verdict, en **lecture seule** | Opus |
| `.claude/skills/ship/SKILL.md` | la commande `/ship` qui enchaîne les quatre | — |
| `.claude/settings.json` | commandes pré-approuvées pour un run sans surveillance | — |

Un subagent ne voit pas la conversation : il démarre avec son propre prompt, la consigne de l'orchestrateur et `CLAUDE.md`. Les agents communiquent donc par le dossier `.pipeline/`, qui sert de boîte aux lettres. Il est ignoré par git.

## Utilisation

```
git switch -c m1-ingestion
/ship porte le parser de relevés Desjardins dans src/domain/statement/, avec les profils d'import et la détection des lignes non reconnues, selon docs/lot-m1.md §3
```

La pipeline s'arrête d'elle-même et te rend la main dans quatre cas : l'arbre n'est pas propre ou on est sur `main` ; la spec contient des `OPEN QUESTIONS` ; un test, le typecheck ou le lint échoue ; le Relecteur rend `NEEDS WORK` ou `BLOCK`.

**Elle ne commite jamais, ne merge jamais, ne pousse jamais.**

## Ce qui fait la solidité du montage

- **Celui qui produit n'est jamais celui qui juge.** Le Codeur n'écrit pas ses tests, le Testeur ne corrige pas le code, le Relecteur n'a ni `Write` ni `Edit` — un relecteur qui peut corriger corrige discrètement au lieu de signaler.
- **Un test rouge met la pipeline en pause**, il ne déclenche pas une rustine.
- **`docs/` fait autorité.** Le Planner lit la spec du lot avant de planifier ; une contradiction devient une question ouverte, pas une décision prise seule.

## Écrire une bonne demande

La qualité de la spec plafonne tout le reste. Nomme le fichier de spec concerné, le module visé et le comportement attendu.

Bon : `/ship ajoute la détection de doublons à l'import selon docs/modele-ingestion-recurrences.md §3, avec empreinte de ligne et panneau des lignes écartées`
Mauvais : `/ship améliore l'import`

## Run de nuit

1. `claude --worktree m1-ingestion` — copie isolée du projet, branche dédiée.
2. Un worktree est un checkout vierge : demande d'abord l'installation des dépendances, sinon le Testeur n'a rien pour lancer Vitest. Le `.env` se recopie automatiquement s'il est listé dans `.worktreeinclude` à la racine.
3. `/ship <demande>`.
4. Empêche la machine de se mettre en veille.

Le matin : `.pipeline/review.md` pour le verdict, puis `spec.md`, `changes.md` et `test-results.md` pour comprendre le raisonnement. Même sur un `SHIP`, relis le diff avant de commiter.

## Limites connues

- La pipeline ne sert à rien tant qu'il n'y a ni socle ni tests : elle s'applique **à partir de M1**, une fois M0 en place.
- Une pipeline multi-agents consomme plus qu'une session simple : chaque agent redécouvre le projet de son côté.
- Le Relecteur garde `Bash` pour `git diff` et pour relancer les tests. Une commande shell peut techniquement écrire un fichier : le verrou tient au prompt. Pour un verrou dur, un hook `PreToolUse` sur `Bash` peut bloquer toute commande qui écrit.
