# Amendements du skill `piloter` et de l'agent `verificateur` — M3-O1

*Écrits par le pilote le 2026-10-08 pour appliquer les consignes de Benjamin du 8 octobre (document non publié). Le pilote ne peut pas écrire dans `.claude/` en mode non interactif (Q-3, Q-5) : ce texte est à poser par Benjamin. En attendant, `gouvernance.md` §7 prime sur le skill et sur l'agent, et l'architecte recopie ces consignes dans ses demandes.*

## 1. `.claude/skills/piloter/SKILL.md`

### §2, SPEC — après « Chaque point du critère de sortie doit être vérifiable… »

> Le bureau d'abord (`gouvernance.md` §7) : de M3 à M8, la spécification ne décrit aucun comportement mobile et son critère de sortie n'a aucun point mobile. Chaque tranche est classée **à risque** (domaine ou argent, parser, ingestion, règles, migrations, tout ce qui calcule ou écrit un montant) ou **courante** (écrans, formulaires, libellés, navigation, outillage) ; dans le doute, à risque. La spec nomme aussi, pour chaque tranche, les fichiers e2e qui la couvrent et les motifs d'écrans à capturer.

### §2, TRANCHE — remplacer les points 1 et 4 et ajouter un point 4 bis

> 1. **planner** → `.pipeline/spec.md` — modèle `opus` si la tranche est à risque, `sonnet` si elle est courante (paramètre `model` de l'agent).
>
> 4. **reviewer** — même règle de modèle que le planner — → enregistre son rapport complet dans `.pipeline/review.md`. (suite inchangée)
>
> 4 bis. **Contrôle visuel** (tranche qui touche l'interface) : `verificateur`, limité aux écrans de la tranche, en largeur bureau (`npm run e2e:passe -- --ecrans=<motifs> <fichiers e2e de la tranche>`). Un défaut se corrige dans la tranche (coder, tester) ou devient une dette nommée dans `decisions.md`.

Et dans les règles de méthode à recopier :

> - pendant une tranche, seuls les parcours e2e qui la couvrent se lancent : `npm run e2e:cible -- <fichiers>` ; la suite complète (`npm run e2e`) est réservée aux passes et à la fusion ; Vitest complet et `npm run check` ne changent pas ;
> - le bureau d'abord : aucun travail mobile hors M9, mais pas de largeur fixe gratuite.

### §2, PASSE — remplacer la première phrase

> Délègue à l'agent **`verificateur`** et enregistre son rapport. Largeur bureau seulement ; captures limitées aux écrans touchés par le lot et à ceux que nomme le critère (`npm run e2e:passe -- --ecrans=<motifs>`), quelques dizaines au plus. Un défaut qui ne concerne que le mobile ne rend pas la passe rouge : il part dans la feuille de route de M9. `passes/mN.md` se termine par un bilan (cycles par type, passes, passes rouges et leur cause, attente de la limite d'utilisation si les journaux le permettent), comparé à M2 (16 cycles, 4 passes dont 3 rouges).

## 2. `.claude/agents/verificateur.md`

### `description`

> Vérifie un lot de BudgApp comme le ferait Benjamin devant l'écran — parcours de bout en bout, captures en largeur bureau, vrais relevés — et rend un verdict point par point sur le critère de sortie. Utilisé par l'architecte pour les unités PASSE et pour le contrôle visuel de fin de tranche.

### §2, deuxième puce — remplacer

> - `npm run e2e` : parcours Playwright, **en largeur bureau seulement** (le projet `mobile` est réservé à M9). Puis `npm run e2e:passe -- --ecrans=<motifs>` avec les motifs que te donne l'architecte. Lis `captures-e2e/index.md`, puis **seulement les captures qui tranchent un point du critère** : un test vert dont la capture montre un écran cassé est un échec. Cherche en particulier : débordement horizontal, bouton hors écran, dialogue plus haut que la fenêtre, texte tronqué, libellé technique brut (`DESCRIPTION_NORMALISEE`, un cuid, un montant en cents) affiché à l'utilisateur, message d'erreur en anglais.
> - Contrôle de fin de tranche : ne lance que ce que l'architecte nomme (`npm run e2e:passe -- --ecrans=<motifs> <fichiers>`), pas `npm run check` ni `test:reel` sauf demande ; rends la même forme de tableau, une ligne par écran examiné.

### §3 — ajouter avant le verdict

> Un défaut qui ne concerne que le mobile n'est pas un ❌ : classe-le « dette M9 ».
