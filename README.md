# BudgApp

> **In English.** BudgApp is a personal budgeting web app for Québec (French UI, fr-CA), built with Next.js 16, React 19, TypeScript, Prisma and PostgreSQL. It turns statements from any bank into categorised transactions (pasted text today; file import, bank aggregation through Plaid and scanned receipts are next), then budgets them with rollover envelopes; forecasting and what-if simulation come later. Lots M0 to M3 are merged; the budget lot (M4) is next. It is not in production. The repository is also a record of how it is built: one written spec per lot in `docs/`, a four-agent Claude Code pipeline in which the agent that produces is never the one that judges, and a dated decision log. This public copy uses anonymised data and a fresh Git history.

Développée par Benjamin, avec une chaîne d'agents Claude Code (voir [Comment je travaille](#comment-je-travaille)). Le dépôt d'origine est privé ; celui-ci en est une copie publique.

## Ce qu'est BudgApp

Une application web de budget personnel, en français (Québec), mono-utilisateur pour l'instant, avec un schéma qui prépare le multi-utilisateur. Elle vise quatre choses (`CLAUDE.md` §1) :

1. **Suivre** : transformer les relevés de n'importe quelle banque en transactions catégorisées, puis les consulter et les corriger. Chaque banque est décrite par un profil d'import, qui est une donnée et non une branche de code ; le premier profil est le relevé collé depuis AccèsD (Desjardins).
2. **Budgéter** : des enveloppes qui se reportent d'un mois sur l'autre, avec alloué, dépensé, disponible et un reste à assigner.
3. **Prévoir** : projeter la situation à douze mois à partir des récurrences.
4. **Décider** : simuler un remboursement accéléré, un revenu qui change, une dépense ajoutée.

### État réel

| Lot | Contenu | État |
|---|---|---|
| M0 | socle : Next.js, schéma Prisma (39 modèles), domaine de l'argent et des dates, seed synthétique | fusionné |
| M1 | référentiel (comptes, catégories, bénéficiaires, étiquettes), moteur de règles, import de relevés collés, dédoublonnage, revue d'import | fusionné |
| M2 | consultation des transactions : recherche, filtres, pagination par curseur, édition, ventilations, virements | fusionné |
| M3 | récurrences (détection, confirmation, rapprochement à l'import), soldes et réconciliation | fusionné |
| M4 | budget par enveloppes | à venir (`docs/lot-m4.md` pas encore écrit) |
| M5 à M9 | prévision, dettes et scénarios, objectifs et patrimoine, rapports, accueil et import de fichiers | prévus (`docs/plan.md`) |

L'application n'est pas en production. Les points 3 et 4 ci-dessus ne sont pas encore construits : leurs modèles sont écrits (`docs/modele-budget-prevision.md`, `docs/modele-dettes-scenarios.md`, `docs/modele-objectifs-patrimoine.md`), le code viendra avec M5 à M7.

### En réflexion

Deux chantiers ne sont pas encore découpés en lots :

- **Agrégation bancaire avec Plaid** : récupérer transactions et soldes directement auprès de plusieurs institutions canadiennes, Plaid devenant la source de vérité. Le collage et l'import de fichiers (CSV et autres formats, avec détection de ce qui a déjà été importé) restent disponibles à côté. Un compte d'essai Plaid est ouvert.
- **Tickets de caisse scannés** : un scanner de documents et une reconnaissance de texte faite en local, sans service payant. Un ticket se lie à une dépense existante ou en crée une, une dépense ajoutée plus tard peut s'y rattacher, et il se ventile par catégorie selon ses articles. Les mêmes tickets doivent aussi alimenter une future application d'inventaire et de recettes, sans être scannés deux fois.

## Stack

Next.js 16 (App Router, Turbopack) · React 19.2 · TypeScript 5 en `strict` avec `noUncheckedIndexedAccess` · Prisma 6 · PostgreSQL 17 (`pg_trgm`, `unaccent`) · TanStack Query 5 · react-hook-form et zod · Tailwind CSS 4 et shadcn/ui · Vitest · Playwright.

Quelques règles qui structurent le code (`CLAUDE.md` §2 et §4) : l'argent est un entier signé en cents, jamais un flottant ; une date de transaction est une date civile sans heure ; `src/domain/` est du TypeScript pur, sans dépendance au framework ; Prisma n'apparaît que dans `src/server/repositories/` ; une Server Action valide son entrée avec zod et retourne un résultat typé au lieu de lever une erreur métier.

## Comment je travaille

- **Une spécification par lot**, écrite avant le code, dans `docs/` : `lot-m0.md` à `lot-m3.md`, avec un critère de sortie vérifiable par des tests. Les modèles de fond (`modele-*.md`) et la décision de passer aux enveloppes (`decision-modele-budget.md`) les précèdent.
- **Une chaîne de quatre agents Claude Code**, décrite dans `docs/pipeline-agents.md` et définie dans `.claude/agents/` : planner → codeur → testeur → relecteur, lancée par la commande `/ship` (`.claude/skills/ship/`). Le principe : **celui qui produit n'est jamais celui qui juge**. Le codeur n'écrit pas ses tests, le testeur ne corrige pas le code, le relecteur n'a ni `Write` ni `Edit`.
- **Un mode pilote** (`docs/pilotage/`, `.claude/skills/piloter/`) où une session de Claude Code tient le rôle d'architecte : elle découpe le lot, délègue aux agents, fait vérifier chaque lot par un agent `verificateur` qui lit des captures d'écran, et ne fusionne qu'après une passe de sortie verte. Son cadre est écrit (`docs/pilotage/gouvernance.md`), et un hook bloque les commandes destructrices (`.claude/hooks/garde-fou.mjs`).
- **Un journal des décisions** : une ligne datée par décision structurante, avec son pourquoi, au §5 d'`INDEX.md` ; la version courte du pilote est dans `docs/pilotage/decisions.md`. Les passes de sortie, rouges comprises, sont dans `docs/pilotage/passes/`.

`INDEX.md` est la carte du dépôt ; `CLAUDE.md` en fixe les conventions.

## Étude de cas : la passe manuelle de M1

[`docs/arbitrages-passe-m1.md`](docs/arbitrages-passe-m1.md) consigne ce qu'a donné le premier essai de l'import sur un vrai relevé Visa collé dans le navigateur, alors que les tests étaient verts. Neuf transactions étaient justes, mais noyées sous 42 lignes « non reconnues », et la règle du seed « contient PAIE » rangeait les paiements de carte (`Paiement.`) dans la catégorie « Paie ». Le document tranche six points (A1 à A6), dont un contrôle de la somme contre la ligne « Total » du relevé et un opérateur `MOT_ENTIER`, puis l'unité M1-P2 du pilote les a reportés dans la spec et le code, avec leurs tests.

## Démarrer en local

Prérequis : Node.js 22, Docker.

```bash
docker compose up -d       # PostgreSQL 17 sur localhost:5432 (docker-compose.yml)
cp .env.example .env       # DATABASE_URL cohérent avec docker-compose.yml
npm install
npx prisma migrate dev     # applique les migrations et génère le client Prisma
npm run seed               # jeu de données synthétique, déterministe, sur 18 mois
npm run check              # next typegen, lint, tsc --noEmit, Vitest, next build
npm run dev                # http://localhost:3000
```

Les tests Vitest tournent dans un schéma `test` de la même base, préparé (migrations et seed) à chaque lancement : ils ne touchent pas aux données de `public`. Les parcours Playwright se lancent à part, avec `npm run e2e` (schéma `e2e`, serveur de production local sur le port 3100). Le hook `pre-push` (`git config core.hooksPath .githooks`) lance `npm run check`, et la même commande tourne dans `.github/workflows/ci.yml`.

## À propos de cette copie

- **Données anonymisées.** Les extraits de relevés de `src/domain/statement/fixtures/` gardent le format exact d'AccèsD (tabulations, fins de ligne CRLF, lignes récapitulatives) ; marchands, noms, numéros de référence et montants sont fictifs, et les résultats attendus ont été réécrits en conséquence. Le seed est synthétique.
- **Historique repris à zéro.** Le développement a lieu depuis septembre 2026 sur un dépôt privé, où chaque lot fusionné porte une étiquette (`m0` à `m3`). Ce dépôt part d'un seul commit ; les messages de commit d'origine sont listés, sans hash, dans [`docs/historique.md`](docs/historique.md).
- **Retiré de cette copie** : la configuration de déploiement et les sauvegardes, les vrais relevés et l'outil qui les compare aux relevés PDF (`npm run test:reel`), ainsi qu'une note de consignes personnelle. Les documents de pilotage les mentionnent encore là où ils retracent l'historique.
