# Questions ouvertes pour Benjamin

Chaque entrée est aussi un ticket de la forge étiqueté `pilote` quand les notifications sont configurées. Réponds dans le ticket **ou** directement ici, sous l'entrée (« Réponse : … ») : le pilote lit les deux au début de chaque cycle.

Une question `decision` n'arrête rien : le pilote a appliqué sa recommandation, marquée `PROVISOIRE` dans `decisions.md`. Une question `bloque` arrête l'unité concernée jusqu'à ta réponse.

## Ouvertes

Aucune.

## Résolues

### Q-5 · `bloque` · Poser les amendements de M3-O1 dans le skill `piloter` et l'agent `verificateur` (2026-10-08)

Ticket : aucun — le notifier répond « Aucun canal configuré (GITEA_URL/GITEA_TOKEN, NTFY_URL, WEBHOOK_URL) » depuis une restauration de `.env` : **remets ces variables dans `.env`**, sans quoi tickets et fils ne sont ni envoyés ni lus (réponds ici en attendant). N'arrête aucune unité : `gouvernance.md` §7 prime en attendant, et l'architecte recopie les consignes dans ses demandes.

Tes consignes du 8 octobre demandent de modifier `.claude/skills/piloter/SKILL.md` et `.claude/agents/verificateur.md` ; l'écriture dans `.claude/` reste refusée au pilote en mode non interactif (comme pour Q-3). Texte exact : `docs/pilotage/amendements-m3-o1.md`.
Options : (a) le poser toi-même ; (b) le laisser dans `gouvernance.md` §7, qui suffit au pilote mais oblige à le recopier à chaque demande.
Recommandation : (a), pour que l'agent `verificateur` reste bureau seul même lancé hors du pilote.

Fermée le 2026-10-09 : option (a). Benjamin a fait poser le texte de `amendements-m3-o1.md` dans `.claude/skills/piloter/SKILL.md` et `.claude/agents/verificateur.md`, dans le commit qui ferme cette question. Le skill et l'agent portent désormais ces consignes : l'architecte n'a plus à les recopier. Reste à part : les variables de notification de `.env` (GITEA_URL/GITEA_TOKEN, NTFY_URL, WEBHOOK_URL).

### Q-4 · `decision` · Virement unique pré-coché à l'import ? (2026-10-04)

Ticket : #5 (forge privée). N'arrêtait rien : appliqué en `PROVISOIRE` dans `docs/lot-m2.md` §4.5.

À l'import, quand une ligne n'a qu'une contrepartie possible dans un autre compte (montant opposé exact, ± 5 jours), la revue propose de la lier en virement — le paiement de la Visa vu du chèque et de la carte.
Options : (a) pré-cocher quand il y a un seul candidat, rien à plusieurs ; (b) ne jamais pré-cocher.

Réponse de Benjamin (ticket, 2026-10-04) : lier automatiquement ; pouvoir voir tout ce qui est lié et lier à la main en plus — ou bien proposer en montrant tout ce qui pourrait correspondre, à confirmer.
Fermée le 2026-10-04 : option (a) confirmée. `docs/lot-m2.md` §4.5 précise que le candidat pré-coché s'affiche en clair (compte, date, montant) et que le choix à plusieurs les liste tous ; « voir tout ce qui est lié » = filtre « virements seulement » (§5.2), lier à la main = §4.4. Rien n'était encore codé (M2-T5).

### Q-3 · `bloque` · Poser quatre consignes dans `.claude/agents/` (2026-10-03)

Ticket : #4 (forge privée). N'arrête aucune unité : M1-P6 est faite sans ce point.

Les permissions refusent l'écriture dans `.claude/agents/` au pilote et à ses agents (comme pour `.claude/skills/` le 2026-10-01). Les quatre consignes de M1-P6, point 2 — un oracle ne se retouche jamais ; les garde-fous publiés par le planner se lancent avant de déclarer conforme — sont à ajouter à `coder.md` (§2 et §4) et `tester.md` (§2 et §3), texte exact dans le ticket.
Options : (a) les poser toi-même ; (b) autoriser `Edit(.claude/agents/**)` au pilote, qui les posera. En attendant, l'architecte les recopie dans chaque demande aux agents.

Réponse de Benjamin (ticket, 2026-10-04) : `Edit(.claude/agents/**)` ajouté à `.claude/settings.json`.
Suite (pilote, 2026-10-04) : l'écriture reste refusée (« permissions … not granted »), sans doute parce que Claude Code protège `.claude/` en mode non interactif quelle que soit la règle. Reste l'option (a) : poser toi-même les quatre consignes (texte dans le ticket). Ta modification de `settings.json` n'est pas commitée par le pilote.
Fermée le 2026-10-04 : Benjamin a posé les quatre consignes (`06a1545`, `1b95fd9`, poussés sur `m1-ingestion`), fusionnées par le pilote (`73d5dd0`).

### Q-2 · `bloque` · Chèque : copier-coller AccèsD et relevé PDF d'août = même compte ? (2026-10-03)

Ticket : #3 (forge privée). Bloquait M1-P7.

`npm run test:reel` comparait le copier-coller chèque d'août à un relevé PDF chèque d'un autre compte (0 transaction commune).

Réponse de Benjamin (ticket, 2026-10-04) : le copier-coller correspond à un autre relevé PDF, qu'il désigne par son nom de fichier.
Fermée le 2026-10-04 : unité M1-C1 (`a2a6a6e`) — `test:reel` vise ce relevé ; lecteur adapté à ses descriptions repliées ; contrôle croisé `[OK]`, 21 sur 21.

### Q-1 · `bloque` · Notifier : Gitea répond 404 (2026-10-01)

Ticket : aucun (l'envoi lui-même échoue sur Gitea, avant Discord). Aucune unité n'est bloquée : ce fichier fait foi.

`node --env-file=.env scripts/notifier.mjs reponses` échoue sur `GET /repos/<proprietaire>/<depot>/issues?…&labels=pilote → 404`, et `envoyer` sur `GET /repos/<proprietaire>/<depot>/labels → 404`. Le dépôt existe sous ce nom (c'est le `origin` SSH). Causes probables : `GITEA_URL` qui n'est pas la racine de l'instance (attendu `https://<instance>`, sans `/api`), jeton sans les portées `repository` et `issue` sur ce dépôt, ou tickets désactivés dans les réglages du dépôt. Le pilote ne lit pas `.env` : il ne peut pas vérifier.

À faire par Benjamin : vérifier ces trois points. Tant que c'est cassé, tes réponses par ticket et par fil Discord ne sont pas lues : réponds ici.

Réponse (session Cowork, 1er octobre au soir, pour Benjamin) : `GITEA_URL` contenait le chemin du dépôt (`…/<proprietaire>/<depot>`), d'où les 404. `scripts/notifier.mjs` ne garde plus que l'origine de l'URL, et chaque canal est maintenant indépendant (Gitea en panne n'empêche plus Discord). À vérifier au prochain cycle avec `reponses`, puis fermer Q-1.

Fermée le 2026-10-01 par le pilote : `notifier.mjs reponses` répond sans erreur (Gitea et Discord joignables, aucun ticket ni fil en attente).
