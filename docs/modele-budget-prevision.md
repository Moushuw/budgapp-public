# BudgApp — modèle de budget et de prévision

*Révision du 13 septembre 2026. Remplace intégralement la version du 6 septembre, dont la décision fondatrice — « montant mensuel fixe par catégorie, sans report d'un mois sur l'autre » — a été renversée. Voir `decision-modele-budget.md` pour le raisonnement.*

---

## 1. Deux moteurs, jamais mélangés

C'est la règle structurante du document, et la plus facile à enfreindre par accident.

| | **Le budget** | **La prévision** |
|---|---|---|
| Temps | le mois en cours, au présent | les 12 prochains mois |
| Nature | ce que tu **décides** | ce qui **va arriver** si rien ne change |
| Alimenté par | ton allocation, avec de l'argent réel | récurrences, transactions futures, estimation statistique |
| Unité | l'enveloppe | le solde d'un compte à une date |
| Répond à | « me reste-t-il de quoi sortir au restaurant ? » | « le compte chèque passe-t-il sous 200 $ avant la paie du 25 ? » |
| Écran | Budgets | Prévision |

**Les enveloppes n'entrent jamais dans la projection de trésorerie.** Quicken et Simplifi appliquent cette séparation délibérément — Simplifi publie même la liste fermée de ce qui entre dans sa projection et en exclut explicitement ses enveloppes et ses objectifs. Les mélanger produit du double comptage : l'argent budgété pour l'épicerie de novembre sortirait deux fois, une fois comme allocation et une fois comme dépense estimée.

Ce que BudgApp fait et qu'aucun des trois produits comparés ne fait : **afficher l'écart entre les deux**. « Tu as budgété 600 $ d'épicerie ; la prévision, sur tes six derniers mois, dit 684 $. Il te manque 84 $ par mois. » C'est le message de l'écran Budgets. Il n'a de sens que parce que les deux objets restent séparés.

---

## 2. Le modèle d'enveloppes

### 2.1 Les trois colonnes

Pour chaque couple (enveloppe, mois) :

| Colonne | Contenu | Où elle sert |
|---|---|---|
| **Alloué** | le montant assigné ce mois-ci, insensible au passé | écran Budgets, comme référence |
| **Dépensé** | l'activité du mois seul, négative pour une sortie | les **rapports** — le mois propre |
| **Disponible** | report + alloué + dépensé | écran Budgets, le vrai solde de l'enveloppe |

```
disponible(s, m) = report(s, m) + alloué(s, m) + activité(s, m)
```

Seul `alloué` est stocké (`BudgetAllocation.montantAssigneCents`). `activité` et `disponible` se calculent. Aucune table d'agrégat : c'était le défaut du v1, où deux tables d'historique n'étaient alimentées qu'à l'import et jamais recalculées.

`activité(s, m)` est la somme des transactions du mois affectées à `s`, **en excluant** les parents ventilés (leurs lignes filles portent les catégories), les virements, et tout ce qui porte `exclureDuBudget`.

### 2.2 Le report

C'est ce qui manquait le plus au modèle précédent. Trois modes, par sous-catégorie, `SIGNE` par défaut :

```
report(s, m) = 0                           si reportMode = AUCUN
             = disponible(s, m-1)          si reportMode = SIGNE
             = max(0, disponible(s, m-1))  si reportMode = POSITIF_SEULEMENT
```

**Pourquoi `SIGNE` par défaut.** L'immatriculation coûte 340 $ en mars. Sans report, il n'y a que deux mauvaises options : allouer 0 $ onze mois puis 340 $ en mars — et mars ressemble à une catastrophe alors que tout était prévu — ou allouer 29 $ par mois, ne rien dépenser, et se faire dire onze fois qu'on est sous budget. Avec report, l'enveloppe monte toute seule et contient 340 $ en mars.

Et le report signé propage le dépassement exactement comme demandé : épicerie allouée à 600 $, dépassée de 84 $ en août, septembre affiche `Alloué 600 $ · Disponible 516 $`. Dans l'autre sens, 540 $ dépensés donnent `Alloué 600 $ · Disponible 660 $`.

**`AUCUN` pour les postes où un mois n'a pas à financer le suivant** — une épicerie économe en août ne devrait peut-être pas autoriser un mois de restaurant en septembre. `POSITIF_SEULEMENT` pour les postes où un dépassement ponctuel ne doit pas pénaliser durablement.

**Le report est en cascade.** Modifier une allocation de juin recalcule le disponible de juillet à décembre. C'est une conséquence directe de la formule, et ça impose que le calcul se fasse sur une plage de mois, jamais mois par mois isolément.

### 2.3 Le reste à assigner

```
resteAAssigner(m) = resteAAssigner(m-1) + revenus(m) − Σ alloué(s, m)
```

Ce n'est pas un solde bancaire : c'est le reliquat non réparti. Il roule d'un mois à l'autre et il est global, pas par compte.

**Indicatif en v2, pas contraignant.** Il s'affiche en haut de l'écran Budgets, il signale un négatif, et il ne bloque rien. Le durcir plus tard — exiger qu'il tombe à zéro, façon YNAB — ne demande aucun changement de schéma : c'est un choix de mise en évidence.

**Note sur la différence avec YNAB.** YNAB n'autorise à allouer que de l'argent déjà présent sur les comptes. BudgApp ne reprend pas cette contrainte, parce qu'elle interdirait précisément ce qui est demandé : voir le budget évoluer selon les transactions prévues. Un revenu récurrent futur compte donc dans le reste à assigner des mois futurs. En contrepartie, l'écran doit distinguer visiblement l'argent **présent** de l'argent **attendu** — sinon on alloue de l'argent qui n'est jamais rentré, ce qui est exactement le piège que la règle de YNAB évite.

### 2.4 Les cibles

Une cible est paramétrée sur quatre axes indépendants, ce qui couvre des dizaines de cas d'usage avec quatre champs :

**montant × cadence × jour d'échéance × mode**

```
besoinDuMois(s, m) = max(0, cible.montant − alloué(s, m))       si mode = ACCUMULER
                   = max(0, cible.montant − disponible(s, m))   si mode = RECOMPLETER
```
ramené au prorata des mois restants dans la période de la cadence.

| Mode | Libellé à l'écran | Usage |
|---|---|---|
| `RECOMPLETER` | « Recompléter jusqu'à 600 $ » | dépense courante : on remplit le trou du mois. Épicerie, essence |
| `ACCUMULER` | « Mettre de côté encore 29 $ » | épargne cumulative : on ajoute, quoi qu'il y ait déjà. Immatriculation, assurances, cadeaux |

C'est la distinction la plus mal comprise du système de cibles de YNAB, et celle qu'il faut nommer clairement à l'écran plutôt que d'exposer un booléen.

« 340 $ par année, échéance le 15 mars » produit donc un besoin mensuel de 29 $, **calculé** et non saisi. Une cible hebdomadaire compte le nombre réel d'occurrences du jour choisi dans le mois — quatre ou cinq lundis — donc son besoin mensuel varie mécaniquement.

**Mise en veille** : `Target.enVeilleJusquau` porte un mois. L'enveloppe cesse d'être signalée sous-financée ce mois-là, et se réveille toute seule le 1er du mois suivant. La cible elle-même n'est ni modifiée ni supprimée.

### 2.5 Les mouvements entre enveloppes

Corriger un dépassement, c'est déplacer de l'argent : « j'ai dépassé de 84 $ à l'épicerie, je prends 84 $ dans Restaurants ». Mouvement dans le budget uniquement — aucun compte ne bouge.

**Un mouvement est un événement conservé, pas une mutation** de `montantAssigneCents`. `MoneyMovement` porte d'où, vers où, combien, quand, une note, et un `groupeId`. Les mouvements produits par une même action — un remplissage automatique sur douze enveloppes — partagent leur groupe, ce qui rend l'**annulation groupée** possible.

Ce n'est pas un raffinement. Monarch a modélisé le mouvement comme une mutation, et l'absence d'annulation est sa plainte numéro un après la synchronisation bancaire.

Conséquence sur le calcul : `alloué(s, m)` est la somme de l'allocation de base et des mouvements non annulés du mois. Les deux sources vivent dans deux tables et se somment à la lecture.

### 2.6 Le remplissage automatique

Garnir trente enveloppes à la main chaque mois est décourageant, et c'est la première raison d'abandon d'un budget. Cinq boutons, sur une sélection ou sur tout le mois :

| Bouton | Calcul |
|---|---|
| **Ce qui manque aux cibles** | `besoinDuMois(s, m)` pour chaque enveloppe qui a une cible |
| **Comme le mois dernier** | `alloué(s, m-1)` |
| **Dépensé le mois dernier** | `−activité(s, m-1)` |
| **Moyenne des 6 derniers mois** | moyenne de `−activité` sur la fenêtre |
| **Remettre le disponible à zéro** | ajuste `alloué` pour que `disponible(s, m) = 0` |

Chaque remplissage est un groupe de `MoneyMovement`, donc annulable d'un geste.

### 2.7 Les cartes de crédit

**Pas d'enveloppe de paiement** — décision du 13 septembre. Le paiement de carte est un **virement** : une paire de transactions symétriques liées, exclue du budget des deux côtés. C'est ce qui fait qu'un paiement de carte ne compte ni comme dépense ni comme revenu.

L'arithmétique tient sans enveloppe, parce que la dépense a déjà quitté son enveloppe au moment de l'achat :

| Moment | Chèque | Visa | Total des enveloppes |
|---|---|---|---|
| 5 000 $ alloués | 5 000 $ | 0 $ | 5 000 $ |
| 2 340 $ dépensés sur la Visa, catégorisés | 5 000 $ | −2 340 $ | 2 660 $ |
| Paiement de la Visa | 2 660 $ | 0 $ | 2 660 $ |

Le total des enveloppes, 2 660 $, *est* la position réelle à tout instant. **C'est le solde bancaire qui ment, pas le budget** — et l'écran d'accueil doit donc présenter le total des enveloppes comme chiffre de référence, avec le solde bancaire à côté, pas l'inverse.

Ce qu'on perd — l'alerte « mes liquidités ne couvrent pas le relevé » — revient sous forme d'un **indicateur de couverture** sur la fiche de la carte : solde du relevé contre liquidités projetées à la date d'échéance. Le traitement des intérêts quand le relevé n'est payé qu'en partie est dans `modele-dettes-scenarios.md` §4.

---

## 3. Le solde d'un compte

Toute prévision part d'un solde, et le v1 n'en connaissait aucun.

```
solde(compte, date) = dernier ancrage antérieur + Σ transactions entre l'ancrage et la date
```

Un ancrage (`BalanceStatement`) est un **fait daté conservé**, pas un champ qu'on écrase : tu saisis le solde lu sur un relevé, à sa date. L'écart entre le solde déclaré et le solde calculé ouvre une réconciliation — le mécanisme complet est dans `modele-ingestion-recurrences.md` §5.

---

## 4. Les trois natures de flux

La prévision repose sur une classification de chaque flux futur.

**1. Fixes déterministes** — loyer le 1er, paie aux deux semaines, Hydro-Québec aux deux mois, abonnements. Montant et échéance connus. Posés tels quels sur le calendrier futur. `RecurringRule` de nature `FIXE`.

**2. Récurrents variables** — épicerie, essence, restaurants, pharmacie. La dépense revient, le montant bouge. Estimation statistique (§5). `RecurringRule` de nature `VARIABLE`, ou simplement l'historique d'une sous-catégorie.

**3. Ponctuels planifiés** — un voyage en juin, un remboursement d'impôt en mai. Date et montant connus, non récurrents. `PlannedEvent`, saisis à la main ou venus d'un agenda.

Tout le reste est absorbé par l'estimation statistique de sa sous-catégorie. Rien n'est laissé hors du calcul.

---

## 5. Estimation des dépenses variables

Pour chaque sous-catégorie `s` et chaque mois passé `m`, on dispose du total mensuel `T(s, m)`. Sur une fenêtre glissante de `N` mois — 6 par défaut, mois courant exclu parce qu'incomplet :

**Estimateur par défaut : la médiane.**

Un mois d'épicerie doublé par une réception déplace fortement une moyenne sur six points, et la prévision devient durablement fausse. La médiane ignore l'accident. Les trois produits comparés se contentent tous d'une moyenne simple sur 6 ou 12 mois — c'est un des rares endroits où BudgApp fait mieux pour un coût nul.

Estimateurs configurables par sous-catégorie (`SubcategoryForecast.estimateur`) :

| Estimateur | Quand |
|---|---|
| Médiane 6 mois *(défaut)* | comportement stable avec accidents ponctuels |
| Moyenne 3 mois | poste en évolution récente — déménagement, nouveau véhicule |
| Moyenne 6 mois | poste très régulier, sans valeur aberrante |
| Moyenne tronquée | on retire le mois le plus bas et le plus haut, puis on moyenne |
| Montant fixé | « je sais que ce sera 400 $ » |
| Le budget | la cible de l'enveloppe fait office de prévision |

**Historique insuffisant** : moins de trois mois sur une sous-catégorie, elle est marquée « estimation faible » et l'interface le dit au lieu de faire semblant.

**Saisonnalité** : hors périmètre v2. Dès 24 mois d'historique on pourra pondérer par le même mois de l'année précédente. Contrainte à respecter dès maintenant : garder `T(s, m)` calculable par requête, et ne rien précalculer qui interdirait ce raffinement.

---

## 6. L'incertitude

Une prévision qui affiche un chiffre unique au cent près ment.

**Ce qu'il ne faut pas faire** : sommer les quartiles de chaque sous-catégorie. Ça suppose que tous les postes dérapent le même mois, et produit une fourchette absurdement large.

**Ce qu'on fait** : on calcule la distribution du **total mensuel des dépenses variables**

```
V(m) = Σ_s T(s, m)   sur les N mois de la fenêtre
```

et on en tire trois scénarios : **central** = médiane de `V`, **favorable** = p25, **défavorable** = p75. `percentile_cont` de PostgreSQL les calcule en base.

La ventilation par sous-catégorie sert à **expliquer** le scénario central ; la fourchette vient du total. Avec six points, les quartiles sont grossiers — on l'assume, et on l'affiche comme une bande, jamais comme un chiffre.

---

## 7. La projection

Horizon 12 mois par défaut, paramétrable.

```
solde(m) = solde(m-1)
         + Σ occurrences des règles FIXES tombant dans m
         + Σ événements planifiés dans m
         + estimation variable du mois        (central, p25 ou p75)
```

**Deux résolutions**, parce que ce sont deux questions différentes :

- **Mensuelle**, sur tout l'horizon — la courbe de tendance.
- **Quotidienne**, sur le mois en cours et les deux suivants — « est-ce qu'on passe sous zéro avant la paie du 25 ? ». Les flux fixes ont une date exacte ; le variable est réparti uniformément sur le mois. Approximation assumée, raffinable avec le profil de dépense par jour du mois réellement observé.

**Alerte de liquidité** : premier jour où le solde projeté d'un compte passe sous `seuilSecuriteCents`. Formulée en phrase — « au rythme actuel, le compte Chèque passe sous 200 $ le 27 novembre » — pas en voyant rouge. Quicken affiche un triangle jaune ; une phrase datée vaut mieux.

**Un tableau sous le graphe**, ligne par ligne : date, libellé, catégorie, montant, solde courant, compte. C'est ce qui rend la courbe actionnable au lieu de décorative — Quicken Mac le fait, Windows non, et la différence d'utilité est nette.

**La projection est un calcul pur.** `domain/forecast/`, sans Prisma : entrées = soldes, règles, occurrences, séries mensuelles ; sortie = une série de points. C'est le module le plus critique et le plus testable de l'application. Il se teste avec des séries synthétiques : un poste stable, un poste avec une valeur aberrante, un poste naissant, un compte qui passe sous zéro.

**Elle ne modifie jamais les données réelles.** Elle ne crée pas de transactions ; elle lit et projette.

---

## 8. L'écart budget / prévision

L'écran Budgets ne montre pas deux tableaux côte à côte. Il produit une phrase par enveloppe en écart significatif :

> Épicerie — tu as alloué 600 $. La prévision dit 684 $, sur tes six derniers mois. Il manque 84 $ par mois.

Trois règles pour que ce soit utile plutôt que bruyant : ne rien dire sous un seuil relatif (10 %) **et** absolu (20 $) ; ne rien dire quand l'estimation est marquée faible ; classer par montant d'écart décroissant et n'en montrer que les cinq premiers, le reste derrière un dépliant.

---

## 9. Décisions de conception à ne pas perdre

1. **Stockage en cents, toujours.** L'arrondi au dollar est un réglage d'affichage (`Preference.arrondi`), jamais une perte de donnée.
2. **Aucune table d'agrégat.** `T(s, m)`, `activité`, `disponible` se calculent par requête. Une table dénormalisée redevient fausse au premier ajustement de transaction.
3. **Le mois est une clé de première classe.** `(enveloppe, mois) → alloué` est stocké en dur ; le reste se déduit. C'est ce qui rend le budget consultable rétroactivement.
4. **Un mouvement d'argent est un événement, pas une mutation.** Condition de l'historique, de l'annulation et du multi-utilisateur plus tard.
5. **La prévision et le budget ne se touchent pas.** Un seul point de contact, en lecture : l'écart du §8.
6. **Le multi-utilisateur est préparé, pas implémenté.** `ownerId` partout dès le départ, un seul utilisateur en base.

---

## 10. Le calendrier financier

L'écran Prévision porte deux objets : la **courbe** et un **calendrier** des flux à venir, jour par jour — occurrences attendues, événements planifiés, et dépenses prévues venues d'un agenda externe.

### 10.1 Le flux iCalendar

`iCalendar` est la RFC 5545, le format universel des agendas : Google Agenda, Outlook et Samsung s'y abonnent tous. Rien à voir avec l'écosystème Apple.

**Sortant** — BudgApp publie un calendrier en lecture seule à une adresse secrète et non devinable. L'agenda du téléphone s'y abonne. Toutes les échéances — loyer, paies, assurances, acomptes de voyage — y apparaissent, sans rien installer. Aucun jeton à stocker, aucun consentement OAuth.

**Entrant** — un agenda « Finances » dédié dont BudgApp lit l'adresse ICS privée à sa propre fréquence. Chaque événement devient un `PlannedEvent`.

**L'API Google reste possible plus tard**, pour une synchronisation bidirectionnelle fine. Elle impose un parcours de consentement, le stockage chiffré de jetons et une vérification Google le jour où l'application devient publique. Pour un usage personnel, l'ICS gagne sur tous les tableaux.

**Une limite à connaître** : Google rafraîchit lentement les calendriers auxquels il est *abonné* — souvent plusieurs heures, parfois vingt-quatre. Sans conséquence pour des échéances connues des semaines à l'avance. Le sens entrant, lui, est piloté par BudgApp : aucune latence subie.

### 10.2 Le montant dans un événement

Un événement d'agenda n'a pas de champ montant. Convention, documentée dans l'écran de configuration :

- **dans le titre** : `Cadeau anniversaire -150` ou `Remboursement impôt +1200`
- **ou dans la description** : une ligne `montant: -150`, éventuellement `catégorie: Loisirs / Sorties`

Un événement dont le montant n'est pas lisible **n'est pas ignoré en silence** — même principe que les lignes de relevé non reconnues : il apparaît dans une liste « événements à compléter », où le montant se saisit en un clic.

`PlannedEvent.externalUid` rend la relecture idempotente : un événement modifié dans l'agenda met à jour le `PlannedEvent` existant au lieu d'en créer un second. Un événement supprimé disparaît de la prévision à la synchronisation suivante.

### 10.3 Ce que le calendrier change au calcul

Rien. Un événement d'agenda est un `PlannedEvent` comme un autre. Le calendrier n'est pas une source de vérité parallèle : c'est une **façon d'en saisir une**, depuis le téléphone plutôt que depuis l'application.
