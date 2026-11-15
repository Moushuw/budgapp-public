# État du pilote

*Tenu par l'architecte à chaque cycle. C'est le point de reprise après une interruption.*

## En cours

Rien.

## Dernier cycle

2026-10-10 — M3-F faite : `m3-recurrences` fusionnée dans `main` (`--no-ff`, `3e54b29`), étiquette `m3`, branche supprimée.
`INDEX.md` (en-tête, § Lots) et fichiers de pilotage à jour sur `main`.

## Prochaine unité

M4-S — spécification du budget (`docs/lot-m4.md`), branche `m4-budget` à créer depuis `main` à jour.

## Contexte utile à la reprise

- Branche courante : `main` (M3 livré, étiquette `m3`) ; la branche `m4-budget` s'ouvre avec M4-S.
- Depuis la fermeture de Q-5, le skill `piloter` et l'agent `verificateur` portent les consignes du 8 octobre (bureau seul, captures filtrées) ; planner et relecteur lancés avec `model: opus` (tranche à risque) ou `sonnet` (courante).
- Le notifier répond `gitea: true, discord: true` au 2026-10-10 (aucun ticket ni fil en attente) ; `questions-ouvertes.md` fait foi. `scripts/jalon.mjs` écrit dans la console.
- Consignes de Benjamin du 8 octobre (document non publié) : décisions non provisoires, elles priment sur la feuille de route, le skill et les agents.
- Si une variable manque dans `.env`, c'est à Benjamin de la remettre (le pilote ne lit pas `.env`).
- Les tests Vitest tournent dans le schéma `test` de `budgapp_dev` (M1-P3), préparé à chaque lancement : base joignable requise, ~6 s. `npm run seed` ne sert plus qu'à remettre les données de dev en état. Un test d'intégration prend un compte du seed par son nom ; G4 ignore les e-mails `@example.test` / `@exemple.invalid`. Un id fixé dans un test d'intégration doit être un cuid valide (commence par `c`) : `prisma/seed.test.ts` lit toutes les transactions du schéma partagé. Années réservées : 2095 à `src/server/repositories/transactions.test.ts`, 2096 à `rules.test.ts`, 2097 à `transactions-masse-duree.test.ts`.
- Parcours e2e : `npm run e2e` (schéma `e2e`, serveur `next build` + `next start` dans `.next-e2e`, port 3100), projet `bureau` seul depuis M3-O1 ; `npm run e2e:cible -- <fichiers>` ~5 min pour neuf fichiers (build compris) ; mode passe `npm run e2e:passe -- --ecrans=<motifs> <fichiers>`. Une commande de plus de 600 000 ms passe en arrière-plan : l'attendre jusqu'à sa fin. Jamais `npx playwright test` directement.
- Le bac à sable refuse toute commande préfixée par une variable d'environnement (`VAR=1 cmd`, `env`, `export`), les accolades, `npx shadcn`, les heredocs suivis d'une autre commande, et la plupart des commandes composées (`;` avec `ls`, `tail`, redirections après `cd`) : une commande par appel, ou un outil d'édition. Message de commit long : l'écrire dans `.pilote/commit-msg.txt` puis `git commit -F`.
- L'outil MCP de la forge n'est pas autorisé dans les sessions du pilote.
- `prisma generate` a échoué en EPERM pendant M1-P2 (moteur tenu par un processus, sans doute le serveur de dev) ; les types étaient à jour. À relancer si un doute.
- Fichiers de `.pipeline/` archivés par unité dans `.pipeline/archive/` (non suivi).
- `npm run test:reel` sort en 0 depuis M1-C1 (un constat restant, connu). Outil sur relevés réels, absent de la copie publique.
- `.claude/settings.json` porte une modification non commitée de Benjamin (`Edit(.claude/agents/**)`) : la laisser telle quelle, ce n'est pas un reste de cycle.
- `tsc --noEmit` peut échouer sur `.next/dev/types/*.ts` tronqués (écriture concurrente de `next dev`) : `npx next typegen` est refusé ; retirer à la main les lignes parasites en fin de fichier.
- `git rm` et `git -C` sont refusés par les permissions du pilote ; une suppression se fait par `rm`, puis `git add <chemin>` l'indexe.
- Les agents se lancent au premier plan (`run_in_background: false`) ; une relance par `SendMessage` n'est pas utilisée, faute de garantie qu'elle reste au premier plan. Le relecteur est en lecture seule : l'architecte enregistre son rapport dans `.pipeline/review.md`.
- Historique de la session Cowork : `claude/passe-m1-2026-09-30.md` et `claude/etat-m1-passation.md` dans le projet Claude ; l'essentiel est repris dans `docs/arbitrages-passe-m1.md` et `INDEX.md`.
