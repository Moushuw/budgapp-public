# Gouvernance du mode pilote

*Mise en place le 1er octobre 2026, à la demande de Benjamin. En mode pilote, ce document prime sur `CLAUDE.md` §14 (« Ce que Claude Code fait, et ne fait pas ») ; tout le reste de `CLAUDE.md` s'applique sans changement.*

## 1. Qui fait quoi

| Rôle | Qui | Ce qu'il produit |
|---|---|---|
| **Architecte** | la session principale de Claude Code, qui exécute le skill `piloter` | les spécifications de lot, le découpage, les demandes aux agents, les arbitrages de sa grille, les commits, les push, les fusions, les fichiers de `docs/pilotage/` |
| Planner, Coder, Testeur, Relecteur | les agents de `.claude/agents/` | inchangés : `.pipeline/spec.md`, le code, les tests, le verdict |
| **Benjamin** | — | les arbitrages produit (à posteriori s'il le faut), les actions qu'aucun agent ne peut faire, la lecture de `decisions.md` |

La session Cowork (projet Claude « Budgapp ») reste disponible pour un regard extérieur : revue d'un lot, passe visuelle dans un vrai navigateur, rédaction d'un document de fond. Elle n'est plus dans la boucle.

## 2. Ce que l'architecte tranche seul

Il décide, consigne une ligne dans `decisions.md`, et continue :

- tout choix d'implémentation qui respecte l'intention de la spec et `CLAUDE.md` ;
- les réponses aux `OPEN QUESTIONS` du planner quand la réponse découle des documents de `docs/` ;
- le tri des constats du relecteur : corriger maintenant, ou reporter en dette nommée ;
- l'ordre des tranches, le découpage d'un lot, l'écriture de sa spécification à partir de `docs/plan.md` et des modèles ;
- l'outillage de développement : tests, Playwright, scripts, isolation de la base de test, agents ;
- les petites décisions d'interface qui ne changent pas ce que l'utilisateur peut faire (libellés, mise en page, messages) ;
- la fusion d'un lot dont le critère de sortie est vérifié (§6).

## 3. Ce qui revient à Benjamin — mais n'arrête pas le travail

Les **arbitrages produit** : ce que l'application fait pour l'utilisateur, quand les documents ne le disent pas ou se contredisent. Par exemple : un comportement métier non spécifié, un écart volontaire à la spec, une fonctionnalité ajoutée ou retirée, un compromis visible à l'usage.

L'architecte **n'attend pas** : il applique l'option qu'il recommande, la marque `PROVISOIRE` dans `decisions.md`, ouvre une entrée dans `questions-ouvertes.md`, notifie Benjamin, et continue. Si Benjamin tranche autrement, une unité de correction passe en tête de la feuille de route. Le coût d'un retour en arrière est le prix assumé de la continuité.

Une décision provisoire ne doit **jamais** être irréversible : pas de migration qui détruit une colonne, pas de donnée perdue. Si l'option recommandée l'est, l'architecte choisit l'option réversible, ou bloque l'unité (§4).

## 4. Ce qui bloque vraiment — et que seul Benjamin peut lever

- un secret, un jeton, un compte à créer (Gitea, ntfy, agrégateur bancaire…) ;
- une ressource d'hébergement hors du dépôt (base, déploiement, DNS) ;
- un fichier de `donnees-reelles/` qui manque ;
- tout ce qui coûte de l'argent ;
- tout ce qui touche la production (`budgapp_prod`, un déploiement) ;
- une décision provisoire qui serait irréversible (§3).

L'unité est marquée `bloquée`, Benjamin est notifié (`type bloque`), et l'architecte continue sur ce qui n'en dépend pas. Quand plus rien n'est faisable, le cycle se termine par `PILOTE: ATTENTE` et le script relit les réponses toutes les heures.

## 5. Interdits absolus

Bloqués par `.claude/hooks/garde-fou.mjs`, et de toute façon hors du mandat :

- `git push --force` sous toutes ses formes, `git reset --hard`, `git clean -f`, `git checkout -- .`, `git rebase`, toute réécriture d'historique, la suppression de `main` ou d'une étiquette ;
- `prisma migrate reset`, `prisma db push`, tout SQL destructeur (`DROP`, `TRUNCATE`), toute commande qui nomme `budgapp_prod` ;
- lire `.env` (les scripts le chargent eux-mêmes avec `node --env-file=.env`) ;
- envoyer des données vers l'extérieur autrement que par `scripts/notifier.mjs` ;
- retoucher un oracle (`.json` attendu, fixture) pour faire passer un test ;
- commiter un fichier de `donnees-reelles/` tel quel (un extrait sans numéro de compte, nom ni adresse peut devenir une fixture).

## 6. Git en mode pilote

Par dérogation à `CLAUDE.md` §14, l'architecte **commite, pousse et fusionne**, en respectant tout le reste du cycle de vie décrit là :

- une branche par lot, `main` toujours verte, le hook `pre-push` (`npm run check`) jamais contourné (`--no-verify` est interdit) ;
- un commit au moins par unité, en *conventional commits* français ;
- push de la branche du lot à la fin de chaque cycle ;
- **fusion** `--no-ff` + étiquette + push de `main` uniquement quand : la dernière passe du lot est verte sur chaque point du critère de sortie (`docs/pilotage/passes/mN.md`), le dernier verdict du relecteur est `SHIP`, et aucune décision `PROVISOIRE` du lot n'est contredite par une réponse de Benjamin non encore appliquée ;
- un travail resté rouge après les boucles de correction part sur une branche `wip/<unité>`, jamais sur la branche du lot.

Les demandes de fusion de la forge ne sont pas utilisées : la fusion locale décrite en `CLAUDE.md` §14 en est l'équivalent, et `git log --first-parent main` reste la liste des lots livrés.

## 7. Utilisation

Benjamin accepte d'utiliser toute l'enveloppe de chaque session. Le script s'arrête de lui-même à la limite et reprend quand elle se réinitialise. Une session neuve par unité garde chaque cycle court et lisible.

**Économiser l'enveloppe est un objectif**, à condition de ne rien retirer de ce qui vérifie l'exactitude des montants et des données (consignes de Benjamin du 8 octobre 2026, document non publié). La ressource rare est l'enveloppe, pas le temps de calcul. Concrètement :

- **Le bureau d'abord.** De M3 à M8, ni spécification ni critère de sortie ne décrit de comportement mobile ; passes, contrôles visuels et captures se font en largeur bureau ; `npm run e2e` ne lance que le projet `bureau` (le projet `mobile` est conservé pour M9 : `npm run e2e -- --project=mobile`). Un défaut qui ne concerne que le mobile ne bloque ni une passe ni une fusion : il part en M9. On ne casse pas le mobile exprès.
- **Captures.** Une passe capture les écrans touchés par le lot et ceux que nomme son critère de sortie (`npm run e2e:passe -- --ecrans=<motif>,<motif>`) : quelques dizaines de captures, pas des centaines. Le vérificateur ne lit que celles qui tranchent un point du critère.
- **Contrôle visuel en fin de tranche.** Une tranche qui touche l'interface se termine par un contrôle du vérificateur limité à ses écrans, en bureau. Un défaut trouvé là se corrige dans la tranche ou devient une dette nommée.
- **e2e ciblés.** Pendant une tranche ou une correction, seuls les parcours qui couvrent ce qu'elle touche se lancent (`npm run e2e:cible -- <fichiers>`). La suite complète reste obligatoire à chaque passe et avant toute fusion ; Vitest complet et `npm run check` ne changent pas.
- **Modèles des agents.** La spécification de lot classe chaque tranche **à risque** (domaine ou argent : budget, report, prévision, amortissement, intérêts, scénarios ; parser, ingestion, règles, migrations Prisma ; tout ce qui calcule ou écrit un montant) — planner et relecteur en Opus — ou **courante** (écrans, formulaires, libellés, navigation, outillage) — planner et relecteur en Sonnet. Dans le doute, à risque. Coder et testeur ne changent pas.
- **Où c'est écrit.** Ces règles priment sur le skill `piloter` et l'agent `verificateur` tant que le texte de `docs/pilotage/amendements-m3-o1.md` n'y est pas posé (Q-5) : l'architecte les recopie dans ses demandes.
- **Mesure.** Chaque `passes/mN.md` se termine par un bilan : cycles par type, passes, passes rouges et leur cause, attente de la limite d'utilisation si les journaux le permettent. M3 se compare à M2 (16 cycles, 4 passes dont 3 rouges).
