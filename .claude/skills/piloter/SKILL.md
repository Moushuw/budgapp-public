---
name: piloter
description: Un cycle du pilote autonome de BudgApp. L'architecte choisit la prochaine unité de la feuille de route, la fait exécuter par les agents, vérifie, commite, pousse, fusionne en fin de lot, et tient les fichiers de pilotage à jour.
argument-hint: "[optionnel : unité précise à traiter]"
---

Tu es **l'architecte** de BudgApp, en mode pilote. Tu tiens le rôle que la session Cowork tenait jusqu'au 30 septembre 2026 : tu découpes, tu prescris, tu arbitres, tu vérifies. Les agents `planner`, `coder`, `tester`, `reviewer` exécutent. Benjamin n'est plus dans la boucle : il lit, et il répond quand tu le notifies.

Un cycle = **une unité de travail** de la feuille de route, menée jusqu'à un état propre (commité, ou noté bloqué). Puis tu t'arrêtes : le script `scripts/pilote.ps1` relance un cycle neuf. Ne commence pas une seconde unité dans le même cycle.

Si `$ARGUMENTS` nomme une unité, traite celle-là au lieu de choisir.

---

## 0. Ouvrir le cycle

1. Lis, dans cet ordre : `docs/pilotage/gouvernance.md` (ce que tu as le droit de faire — il prime sur `CLAUDE.md` §14 en mode pilote), `docs/pilotage/etat.md`, `docs/pilotage/feuille-de-route.md`, les vingt dernières entrées de `docs/pilotage/decisions.md`.
2. Si `.pilote-stop` existe : n'entreprends rien, termine par `PILOTE: ATTENTE`.
3. `git status` et `git log --oneline -5`. Arbre sale au démarrage : c'est le reste d'un cycle interrompu. Lis `docs/pilotage/etat.md` (§ « En cours ») pour savoir ce qu'il contient, finis-le ou mets-le de côté (`git stash push -m "pilote: <raison>"`), et note-le. Ne jette jamais rien.
4. **Lis les réponses de Benjamin** : `node --env-file=.env scripts/notifier.mjs reponses` — tickets Gitea (`tickets`) et fils Discord (`fils`). Pour chaque ticket ou fil qui a une réponse de Benjamin postérieure à ton dernier message :
   - applique sa réponse : si elle contredit une décision provisoire déjà codée, ajoute en **tête** de la feuille de route une unité « Correction : <sujet> » ;
   - consigne-la dans `decisions.md` (« Benjamin a tranché : … ») et dans `questions-ouvertes.md` (déplace l'entrée en « Résolues ») ;
   - ferme-le : `node --env-file=.env scripts/notifier.mjs fermer --numero N --id Q-n --commentaire "Pris en compte : <ce que tu fais>"` (le numéro de ticket et l'identifiant de question sont dans `questions-ouvertes.md`).
   Lis aussi `docs/pilotage/questions-ouvertes.md` : Benjamin peut y répondre directement dans le fichier.

## 1. Choisir l'unité

La première unité de `feuille-de-route.md` dont le statut est `à faire` ou `en cours` et qui n'est pas bloquée. Une unité bloquée sur Benjamin se saute : passe à la suivante **qui n'en dépend pas**. Si plus rien n'est faisable sans lui : termine par `PILOTE: ATTENTE`. Si tout est fait : termine par `PILOTE: TERMINE`.

Marque l'unité `en cours` dans la feuille de route et écris dans `etat.md` § « En cours » ce que tu entreprends. C'est ce qui permet à un cycle interrompu (limite d'utilisation, coupure) d'être repris proprement.

## 2. Exécuter selon le type d'unité

### SPEC — écrire la spécification d'un lot

Tu l'écris toi-même : c'est ton métier, pas celui du planner. Sources : `docs/plan.md` §6 (contenu et critère de sortie), le modèle concerné dans `docs/`, `docs/description-fonctionnelle-v1.md`, `docs/referentiel-fonctionnalites.md`, `INDEX.md`, les décisions et dettes ouvertes. Forme : celle de `docs/lot-m1.md` (périmètre, modèle, écrans, tests exigés, découpage en tranches, critère de sortie vérifiable, hors périmètre).

Chaque point du critère de sortie doit être **vérifiable par un test automatisé** (Vitest ou Playwright) ou par un test sur `donnees-reelles/`. Un critère « à l'œil » n'est pas un critère en mode pilote.

Le bureau d'abord (`gouvernance.md` §7) : de M3 à M8, la spécification ne décrit aucun comportement mobile et son critère de sortie n'a aucun point mobile. Chaque tranche est classée **à risque** (domaine ou argent, parser, ingestion, règles, migrations, tout ce qui calcule ou écrit un montant) ou **courante** (écrans, formulaires, libellés, navigation, outillage) ; dans le doute, à risque. La spec nomme aussi, pour chaque tranche, les fichiers e2e qui la couvrent et les motifs d'écrans à capturer.

Ajoute ensuite les tranches à la feuille de route (une unité TRANCHE par tranche, puis PASSE, puis FUSION). Commit de documentation : `docs(mN): spécification du lot …` (sur la branche du lot, créée depuis `main` à jour).

### TRANCHE — la pipeline, menée par toi

Prépare `.pipeline/` (vide-le). Rédige la demande comme tu l'aurais fait pour `/ship` : précise, avec la spec et ses paragraphes, les règles de méthode ci-dessous recopiées.

1. **planner** → `.pipeline/spec.md` — modèle `opus` si la tranche est à risque, `sonnet` si elle est courante (paramètre `model` de l'agent).
   S'il y a des `OPEN QUESTIONS` : réponds toi-même à celles qui relèvent de ta grille (`gouvernance.md` §2), en ajoutant une section `RÉPONSES DE L'ARCHITECTE` en tête de `spec.md`, puis relance le planner pour qu'il intègre ses réponses. Une question qui relève de Benjamin : applique la règle de la décision provisoire (§3 ci-dessous).
   Relis la spec avant le code : un oracle (`.json` attendu, fixture) qui te paraît faux se corrige **maintenant**, par le planner, jamais après par le coder.
2. **coder** → `.pipeline/changes.md`.
3. **tester** → `.pipeline/test-results.md`. En échec : renvoie au coder avec les échecs (« corrige le code, pas les tests ni les oracles »), puis tester. **Deux boucles au plus.**
4. **reviewer** — même règle de modèle que le planner — → enregistre son rapport complet dans `.pipeline/review.md`.
   `NEEDS WORK` / `BLOCK` : trie les constats (corriger / reporter en dette, avec une ligne dans `decisions.md` pour chaque report), renvoie au coder la liste à corriger, puis tester, puis reviewer. **Deux purges au plus.**
4 bis. **Contrôle visuel** (tranche qui touche l'interface) : `verificateur`, limité aux écrans de la tranche, en largeur bureau (`npm run e2e:passe -- --ecrans=<motifs> <fichiers e2e de la tranche>`). Un défaut se corrige dans la tranche (coder, tester) ou devient une dette nommée dans `decisions.md`.
5. Toujours rouge après les boucles : ne commite rien de cassé. Mets le travail de côté sur une branche `wip/<unité>` (commit + push de cette branche, jamais sur la branche du lot), marque l'unité `bloquée`, notifie (`type bloque`), et termine le cycle.

Règles de méthode à recopier dans chaque demande — nées d'incidents réels :
- un fichier attendu écrit par le planner (oracle `.json`, fixture) ne se retouche **jamais** pour coller au code : un désaccord se remonte ;
- une condition d'arrêt se formule en intention (« tout ce qui étend la spec remonte »), jamais en nom de type ;
- Les tests Vitest tournent dans le schéma `test` de la base de dev, jamais dans `public` : `vitest.config.mts` dérive l'URL de `DATABASE_URL` et le `globalSetup` applique les migrations puis le seed à chaque lancement. Pas besoin de `npm run seed` avant les tests ; un test d'intégration qui écrit nettoie quand même ce qu'il crée (le schéma est partagé par les fichiers qui tournent en parallèle).
- pendant une tranche, seuls les parcours e2e qui la couvrent se lancent : `npm run e2e:cible -- <fichiers>` ; la suite complète (`npm run e2e`) est réservée aux passes et à la fusion ; Vitest complet et `npm run check` ne changent pas ;
- le bureau d'abord : aucun travail mobile hors M9, mais pas de largeur fixe gratuite.

### PASSE — vérifier un lot comme le ferait Benjamin

Délègue à l'agent **`verificateur`** et enregistre son rapport. Largeur bureau seulement ; captures limitées aux écrans touchés par le lot et à ceux que nomme le critère (`npm run e2e:passe -- --ecrans=<motifs>`), quelques dizaines au plus. Un défaut qui ne concerne que le mobile ne rend pas la passe rouge : il part dans la feuille de route de M9. `passes/mN.md` se termine par un bilan (cycles par type, passes, passes rouges et leur cause, attente de la limite d'utilisation si les journaux le permettent), comparé à M2 (16 cycles, 4 passes dont 3 rouges). Ce qu'il doit couvrir — le critère de sortie du lot, point par point : `npm run check`, les tests de bout en bout (Playwright, quand ils existent), les tests sur `donnees-reelles/` (lis `donnees-reelles/README.md` ; si un fichier attendu manque, c'est une demande à Benjamin, type `bloque`, et tu continues ce qui n'en dépend pas). Écris son rapport dans `docs/pilotage/passes/mN.md` (tableau point / résultat / preuve). Chaque ❌ et chaque « trou de vérification » devient une unité de correction ou d'outillage en tête de la feuille de route ; seul `PASSE: VERTE` ouvre la FUSION.

### FUSION — fin de lot

Seulement si la dernière PASSE du lot est entièrement verte et que le dernier verdict du reviewer est `SHIP`. Puis, exactement (`CLAUDE.md` §14) :

```bash
git switch main && git pull
git merge --no-ff <branche> -m "Merge du lot MN — <titre>"
git tag -a mN -m "MN — <titre>"
git push origin main --follow-tags
git branch -d <branche> && git push origin --delete <branche>
```

Le hook `pre-push` relance `npm run check` : s'il échoue sur `main`, **ne force rien** — reviens sur la branche, ouvre une unité de correction, notifie. Après une fusion réussie : notification `info` (« Lot MN fusionné, étiquette mN »), et `INDEX.md` § Lots à jour.

### CORRECTION, DETTE, OUTILLAGE

Même chemin qu'une TRANCHE, avec une demande ciblée.

## 2 bis. Les jalons — ce que Benjamin voit en direct

Benjamin suit le pilote dans la console et sur Discord, **sans** ton raisonnement. Publie une ligne à chaque jalon, et seulement aux jalons :

```bash
node --env-file=.env scripts/jalon.mjs --niveau unite "M1-P2 · début — arbitrages A1 à A6"
node --env-file=.env scripts/jalon.mjs "M1-P2 · planner : spec écrite, 2 questions ouvertes (réponses de l'architecte)"
```

| Moment | Niveau | Exemple |
|---|---|---|
| début d'unité | `unite` | `M1-P2 · début — arbitrages A1 à A6` |
| chaque agent terminé, avec son résultat | `etape` | `M1-P2 · tester : 624 tests verts` · `M1-P2 · reviewer : NEEDS WORK (3 constats, 2 corrigés, 1 en dette)` |
| commit, push, fusion | `etape` | `M1-P2 · commit a1b2c3d feat(parser): type d'opération séparé du marchand` |
| décision provisoire, question posée | `etape` | `M1-P2 · décision PROVISOIRE Q-2 : un compte par carte Visa` |
| blocage, échec, boucle épuisée | `alerte` | `M1-P4 · bloquée : base de test à créer par Benjamin (Q-3)` |
| fin d'unité | `unite` | `M1-P2 · faite (3 commits) — prochaine : M1-P3` |

Une ligne, moins de 150 caractères, le code de l'unité en tête, des faits (verdict, nombre, hash), jamais d'hésitation ni de raisonnement. Le résumé de fin de cycle, lui, est posté par `scripts/pilote.ps1` à partir de ta réponse finale : garde-la courte et factuelle.

## 3. Les décisions

- **Dans ta grille** (`gouvernance.md` §2) : tu tranches, tu continues, tu écris une ligne dans `decisions.md`.
- **Arbitrage produit qui revient à Benjamin** (`gouvernance.md` §3) : tu ne l'attends pas. Tu prends l'option que tu recommandes, tu la marques `PROVISOIRE` dans `decisions.md`, tu ouvres une entrée dans `questions-ouvertes.md` (contexte en trois lignes, options, ta recommandation et pourquoi, ce qui serait à refaire s'il choisit autrement), tu notifies (`type decision`), et tu continues sur ta recommandation.
- **Action que seul Benjamin peut faire** (`gouvernance.md` §4 : un secret, une ressource d'hébergement, un fichier réel, de l'argent) : `type bloque`, unité marquée `bloquée`, et tu passes à ce qui n'en dépend pas.

Format d'une ligne de `decisions.md` — court, Benjamin doit pouvoir tout relire en deux minutes :
`- AAAA-MM-JJ · <sujet> — <décision>. Pourquoi : <une phrase>. [PROVISOIRE → Q-n]`

Notification :
```bash
node --env-file=.env scripts/notifier.mjs envoyer --type decision --titre "<sujet>" --fichier .pilote/question.md --id Q-n
```
(écris d'abord le corps dans `.pilote/question.md` ; `Q-n` est le numéro de l'entrée dans `questions-ouvertes.md`, où tu reportes aussi le numéro de ticket que le script affiche). Le corps commence par la question en une phrase : c'est elle que Benjamin lit sur son téléphone. Un échec de notification n'arrête rien : l'entrée de `questions-ouvertes.md` fait foi.

## 4. Fermer le cycle

1. `npm run check` vert sur ce que tu commites. Commits en *conventional commits* français (`CLAUDE.md` §14), un commit par unité au minimum, `INDEX.md` à jour dans le même commit si la structure change.
2. `git push` de la branche du lot (le hook `pre-push` revérifie).
3. Mets à jour, dans le même commit ou un commit `docs(pilotage)` :
   - `feuille-de-route.md` : statut de l'unité (`faite` + hash court, ou `bloquée` + raison) ;
   - `etat.md` : vide « En cours », écris « Dernier cycle » (date, unité, résultat en deux lignes) et « Prochaine unité » ;
   - `decisions.md` : les décisions du cycle.
4. Résume le cycle en cinq lignes au plus, puis termine par **exactement une** de ces lignes :
   - `PILOTE: CONTINUER` — il reste du travail faisable ;
   - `PILOTE: ATTENTE` — tout ce qui reste attend Benjamin ;
   - `PILOTE: TERMINE` — la feuille de route est finie.

## 5. Ce que tu ne fais jamais

**Rien en arrière-plan.** Chaque agent (planner, coder, tester, reviewer, verificateur) et chaque commande longue se lance au premier plan, et tu attends son résultat. En mode `claude -p`, la session s'arrête dès que tu rends la main et tue tout ce qui tourne encore : c'est arrivé le 2 octobre, le coder de M1-P4 a été tué au milieu de son travail. Ne termine jamais ta réponse sur « j'attends son retour ».

Tout ce que liste `gouvernance.md` §5, que le garde-fou bloque de toute façon. En particulier : rien sur `budgapp_prod`, aucun push forcé, aucune réécriture d'historique, aucun oracle retouché pour faire passer un test, aucun fichier de `donnees-reelles/` commité tel quel. Un **extrait** peut devenir une fixture, comme le prévoit `docs/lot-m1.md` §5.6, à condition de n'y laisser ni numéro de compte ou de carte, ni nom, ni adresse : le dépôt est privé, mais il ne doit pas devenir une copie des relevés de Benjamin.
