# Quel modèle de budget pour BudgApp ?

*Note de décision — 13 septembre 2026. Les cinq décisions du §3 sont celles qui gouvernent le schéma et `modele-budget-prevision.md`.*

---

## 1. Les trois questions qui se posaient

Le modèle d'avant — *montant mensuel fixe par catégorie, sans report* — a été renversé. Le choix se ramenait à trois questions indépendantes.

### Le disponible d'une catégorie se reporte-t-il au mois suivant ?

Sans report, une dépense annuelle n'a que deux mauvaises représentations : allouer 0 $ onze mois puis 340 $ en mars — et mars ressemble à une catastrophe alors que tout était prévu — ou allouer 29 $ par mois, ne rien dépenser, et se faire dire onze fois qu'on est sous budget. Avec report, l'enveloppe monte toute seule.

C'est la raison d'être des enveloppes, et c'était le manque le plus concret du modèle précédent.

### Doit-on assigner chaque dollar, obligatoirement ?

C'est la base zéro, et c'est une question **d'interface**, pas de modèle de données. YNAB la rend contraignante : tant que le compteur n'est pas à zéro, l'écran le dit. Monarch affiche le même chiffre sans aucune conséquence, ce qui lui vaut le reproche d'être de la « visibilité passive ».

Ça ne change pas une ligne du schéma : c'est un nombre calculé et un choix de mise en évidence.

### Peut-on budgéter un revenu qui n'est pas encore rentré ?

C'est ici que ça se joue. YNAB **interdit** d'allouer de l'argent qu'on n'a pas — c'est son principe fondateur. Or ce qui est demandé, c'est précisément de « visualiser comment le budget va augmenter ou diminuer selon les transactions prévues ».

Ce n'est pas une contradiction : c'est le signe qu'il faut **deux moteurs**. Et c'est ce que Quicken et Simplifi font délibérément — leur projection de trésorerie n'inclut jamais les enveloppes budgétaires. Simplifi publie la liste fermée de ce qui entre dans sa projection et en exclut explicitement ses enveloppes et ses objectifs.

| | **Le budget** | **La prévision** |
|---|---|---|
| Temps | le mois en cours, au présent | les 12 prochains mois |
| Alimenté par | ce que tu décides d'assigner | récurrences, transactions futures, estimation statistique |
| Répond à | « me reste-t-il de quoi sortir au restaurant ? » | « le compte chèque passe-t-il sous 200 $ avant la paie du 25 ? » |
| Unité | l'enveloppe | le solde de compte à une date |

Ce que BudgApp fait et qu'aucun des trois ne fait : **afficher l'écart entre les deux**. « Tu as budgété 600 $ d'épicerie ; la prévision dit 684 $. Il te manque 84 $ par mois. » Cette idée n'a de sens que si les deux objets restent séparés.

---

## 2. Deux malentendus levés au passage

**« Retirer cash l'argent des enveloppes »** — le mot *cash* dans la documentation de YNAB ne désigne pas de l'argent liquide : il désigne **la nature du compte qui a payé**, débit plutôt que crédit. Et ce n'est pas une action qu'on pose, c'est un traitement automatique au changement de mois quand une enveloppe finit en négatif. Personne ne retire rien.

**Le déplacement entre enveloppes**, lui, est un vrai geste volontaire : « j'ai dépassé de 84 $ à l'épicerie, je prends 84 $ dans Restaurants ». C'est un mouvement dans le budget, pas un mouvement d'argent — aucun compte ne bouge d'un cent.

---

## 3. Décisions prises — 13 septembre 2026

**1. Report activé par défaut.** Formulé ainsi : *« si c'est une question de mettre 10 $ par mois pour que l'argent du paiement annuel de 120 $ soit là, alors oui »*. C'est exactement le report, et c'est son usage principal. Désactivable par sous-catégorie pour les postes où un mois n'a pas à financer le suivant — épicerie, essence.

**2. Le dépassement se propage au disponible, pas aux rapports.** Formulation d'origine : *« au global je veux que ça pénalise les mois suivants, dans le sens que la prévision du budget doit être affectée, mais pour les rapports mensuels je veux pouvoir voir un mois propre. Pour le budget alloué à telle catégorie, si il a été dépassé le mois dernier, je veux voir le budget alloué normalement et le budget qu'il me reste car il a été mangé le mois dernier, pareil dans le sens inverse »*.

C'est la description exacte du modèle à trois colonnes, et il répond aux deux besoins sans compromis :

| Colonne | Contenu | Où elle sert |
|---|---|---|
| **Alloué** | le montant normal du mois, inchangé par le passé | l'écran Budgets, comme référence |
| **Dépensé** | l'activité du mois seul | les **rapports mensuels** — le mois propre |
| **Disponible** | report du mois précédent + alloué + dépensé | l'écran Budgets, comme solde réel de l'enveloppe |

Épicerie dépassée de 84 $ en août, budget de 600 $ : septembre affiche `Alloué 600 $ · Disponible 516 $`. Le rapport d'août porte le dépassement d'août ; celui de septembre reste propre. Et dans l'autre sens, 540 $ dépensés sur 600 $ donnent `Alloué 600 $ · Disponible 660 $`. Le report est donc **signé** — positif comme négatif —, ce qui correspond au mode « report de tous les soldes » de Quicken.

**3. Pas d'enveloppe de paiement de carte — le virement suffit.** La recommandation initiale (une enveloppe « Paiement Visa » alimentée automatiquement par chaque dépense sur la carte) est **écartée**. Formulation d'origine : *« je ne veux pas une enveloppe pour les paiements effectués par carte de crédit, il faut par contre que les paiements de ces cartes ne comptent pas comme des paiements EN PLUS des paiements faits par ces cartes, autant que l'arrivée d'argent sur cette carte ne doit pas compter comme un revenu — il faut que la transaction + / − paiement de carte s'annule »*.

C'est la définition du **virement** : une paire de transactions symétriques liées, exclue du budget des deux côtés. Et l'arithmétique tient sans l'enveloppe :

| Moment | Compte chèque | Visa | Total des enveloppes |
|---|---|---|---|
| 5 000 $ assignés | 5 000 $ | 0 $ | 5 000 $ |
| 2 340 $ dépensés sur la Visa, catégorisés | 5 000 $ | −2 340 $ | 2 660 $ |
| Paiement de la Visa (virement) | 2 660 $ | 0 $ | 2 660 $ |

Le total des enveloppes, 2 660 $, *est* la position réelle à tout moment — c'est le compte chèque qui ment, pas le budget. L'écran d'accueil doit donc présenter le total des enveloppes comme le chiffre de référence, pas le solde bancaire.

Ce qu'on perd : l'alerte « mes liquidités ne couvrent pas le relevé », qui était le seul apport propre de l'enveloppe de paiement. Elle est remplacée par un **indicateur de couverture** sur la fiche de la carte — solde du relevé contre liquidités projetées à la date d'échéance — qui répond à la même question avec un concept de moins.

**Corollaire, décidé dans la foulée** : le compte de carte porte `tauxAnnuel`, `jourReleve`, `jourEcheance` et `perdDelaiDeGrace`, pour que l'application sache dire ce que coûte un relevé payé en partie. Détail canadien à encoder : dès qu'un solde est reporté, le délai de grâce est perdu et les intérêts courent sur chaque achat depuis sa date de transaction. Voir `modele-dettes-scenarios.md` §4.

Les cartes se créent et se suppriment dans l'application, sans rien de codé en dur.

**4. Un seul budget familial.** Pas de cloison de confidentialité entre membres, pas de propriétaire par compte ni par transaction. Le champ `ownerId` reste au schéma pour préparer l'authentification, mais aucun écran ne l'expose en v2.

**5. Le reste à assigner est indicatif.** Affiché, il signale un négatif, il ne bloque rien. Le durcir plus tard ne demande aucun changement de schéma.

---

## 4. Ce qui en découle dans le schéma

| Élément | Modèle |
|---|---|
| Report activable par sous-catégorie, trois modes | `Subcategory.reportActif`, `Subcategory.reportMode` |
| L'alloué du mois, seule valeur stockée | `BudgetAllocation.montantAssigneCents` |
| Cible paramétrable | `Target` : montant × cadence × jour × mode |
| Mouvement conservé et annulable | `MoneyMovement` avec `groupeId` et `annuleLe` |
| Virement | `Transaction.transferAccountId` + `transferTransactionId` |
| Carte de crédit | `Account.tauxAnnuel`, `jourReleve`, `jourEcheance`, `perdDelaiDeGrace` |

Le disponible, le dépensé et le reste à assigner ne sont **jamais stockés** — ils se calculent. Les formules sont au §2 de `modele-budget-prevision.md`.
