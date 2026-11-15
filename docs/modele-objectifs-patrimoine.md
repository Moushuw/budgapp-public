# BudgApp — objectifs d'épargne, placements et valeur nette

*Rapatrié du projet Claude « Budgapp » (`claude/modele-objectifs-patrimoine.md`, 13 septembre 2026) le 1er octobre 2026, sans modification de fond. Fait autorité pour M7.*

Conception du troisième pilier : rattacher de l'argent réel à des intentions datées (objectifs), suivre ce qui dort dans les comptes non budgétaires (placements, régimes enregistrés, maison, dettes), et en tirer une valeur nette lisible dans le temps.

---

## 1. Le périmètre, tout de suite

Ce document couvre les objectifs d'épargne et de remboursement, les comptes de placement et les régimes enregistrés (REER, CELI, CELIAPP), le suivi des droits de cotisation, l'allocation d'actifs par classe, et la valeur nette avec sa projection.

Ce qu'il ne couvre pas, volontairement : **aucune gestion de portefeuille titre par titre**. Pas de positions, pas de cours en temps réel, pas de prix de revient moyen, pas de gain latent par titre, pas de rendement pondéré dans le temps ni pondéré en dollars. Ces fonctions demandent une source de données de marché, une gestion de fractionnements et de distributions, et une fiscalité de disposition — pour un usage qui, ici, se résume à savoir combien il y a et comment c'est réparti. Le courtier fait déjà ce travail et le fait mieux. BudgApp consomme le résultat : un solde daté et une répartition en pourcentage.

---

## 2. Objectifs d'épargne

### 2.1 Un objectif est une entité, pas un compte

Deux modèles existent dans les produits comparés.

**Le compte virtuel (Quicken).** L'objectif est matérialisé par un pseudo-compte, et « mettre de l'argent de côté » crée un virement du compte chèque vers ce pseudo-compte. C'est écarté ici, pour une raison simple : **ça pollue l'historique avec des mouvements qui n'ont jamais eu lieu**. L'argent n'a pas bougé de la banque. Chaque « affectation » fabrique une paire de transactions fictives qui se retrouve dans le registre, dans les rapports, dans le rapprochement de solde, et qui entre en collision avec l'import du relevé — exactement le piège du doublon déjà décrit dans `modele-ingestion-recurrences.md`. Et le jour où on veut savoir ce qu'il y a *vraiment* dans le compte épargne, il faut mentalement défaire tous ces faux virements.

**L'objectif comme entité (retenu).** `Goal` est un objet autonome : un montant cible, une date cible, une contribution mensuelle. Il ne détient pas d'argent. Il **désigne** de l'argent qui existe déjà ailleurs, par `GoalAccount`, et il peut en plus revendiquer des transactions précises par `GoalTransaction`. Aucune écriture n'est créée, aucun solde n'est modifié, rien n'entre dans le registre. Supprimer un objectif ne détruit aucune donnée financière.

Corollaire assumé : **la somme des objectifs peut dépasser l'argent disponible**, et deux objectifs peuvent pointer le même compte. Ce n'est pas une incohérence, c'est un signal — et c'est ce que `Goal.ordre` sert à arbitrer (§2.9).

### 2.2 Trois paramètres, deux suffisent

| Paramètre | Champ | Rôle |
|---|---|---|
| Montant cible | `montantCibleCents` | *C* |
| Date cible | `dateCible` | fixe *n*, le nombre de mois restants |
| Contribution mensuelle | `contributionMensuelleCents` | *m* |

L'utilisateur en saisit **deux**, l'application déduit le troisième et l'affiche comme valeur calculée, modifiable — la saisie manuelle écrase la déduction et la fige. Avec *S₀* le montant déjà acquis (§2.4) et un taux mensuel *i* (§2.5, *i* = 0 pour un compte non rémunéré) :

```
n  = nombre de mois entiers entre le mois courant et le mois de dateCible (inclus)

(1) Contribution requise, cible et date connues
    i = 0 :  m = ⌈ (C − S₀) / n ⌉
    i > 0 :  m = ⌈ (C − S₀·(1+i)ⁿ) · i / ((1+i)ⁿ − 1) ⌉

(2) Date atteignable, cible et contribution connues
    i = 0 :  n = ⌈ (C − S₀) / m ⌉
    i > 0 :  n = ⌈ ln( (C + m/i) / (S₀ + m/i) ) / ln(1+i) ⌉
    dateCible = dernier jour du n-ième mois à partir du mois courant

(3) Cible atteignable, date et contribution connues
    C = VF(n)     (formule du §2.5)
```

Toujours arrondi **au cent supérieur** sur *m* et **au mois supérieur** sur *n* : un arrondi vers le bas produit un objectif qui rate sa cible de quelques cents, ce qui est absurde à afficher.

Cas dégénérés à traiter explicitement, jamais par une division silencieuse : *n* ≤ 0 (date cible passée), *m* ≤ 0 avec *S₀* < *C* (objectif inatteignable), *C* ≤ *S₀* (objectif déjà atteint à la création).

### 2.3 L'allocation de comptes : TOTAL ou PARTIEL

`GoalAccount.mode` :

| Mode | Sens | `montantCents` |
|---|---|---|
| `TOTAL` | tout le solde du compte, et toute son activité future, servent cet objectif | ignoré |
| `PARTIEL` | un montant fixe du compte est réputé affecté à cet objectif | le montant affecté |

Le cas d'usage qui justifie `TOTAL` : **« mon CELIAPP *est* ma mise de fonds »**. Le compte n'existe que pour ça. On ne veut pas ressaisir un montant chaque mois, ni maintenir une correspondance à la main : le solde du compte *est* la progression, cotisations et rendement compris, sans aucun geste. Un ancrage de solde saisi au relevé fait avancer l'objectif tout seul.

`PARTIEL` sert le cas inverse : un compte épargne unique qui contient à la fois le fonds d'urgence et les vacances. On y affecte 5 000 $ au fonds d'urgence, 1 200 $ aux vacances, et le reste n'est revendiqué par personne. Le montant est un **fait saisi**, pas une part calculée : il ne se réévalue pas quand le solde bouge.

Contrôle utile à afficher, jamais bloquant : pour un compte donné, `Σ montantCents des allocations PARTIEL + (solde si une allocation TOTAL existe)` comparé au solde réel. Un dépassement veut dire qu'on a promis deux fois le même argent.

### 2.4 Progression

```
acquis(objectif) = Σ  solde(compte, aujourd'hui)          pour les GoalAccount en mode TOTAL
                 + Σ  montantCents                         pour les GoalAccount en mode PARTIEL
                 + Σ  amountCents des GoalTransaction      dont la transaction n'est PAS
                                                           sur un compte déjà alloué en TOTAL

progression = acquis / montantCibleCents        borné à [0, 1] pour l'affichage
```

L'exclusion de la troisième ligne est le point à ne pas rater : sans elle, une transaction liée à un objectif **et** située sur un compte alloué en TOTAL serait comptée deux fois — une fois dans le solde, une fois dans le lien explicite.

Pour un objectif de type `REMBOURSEMENT`, le compte alloué porte un solde négatif. La progression se lit à l'envers :

```
acquis = |solde initial de la dette au moment de la création de l'objectif| − |solde courant|
```

### 2.5 Projection avec rendement

Un objectif adossé à un CELIAPP placé à 4 % ne se projette pas comme un compte chèque : sur cinq ans, l'écart se compte en milliers de dollars et fausse complètement la contribution requise. `Goal.tauxCroissanceAnnuel` porte ce taux ; s'il est nul, on retombe sur l'arithmétique simple. À défaut de saisie sur l'objectif, on peut proposer par défaut le `tauxRendementAnnuel` du compte alloué en TOTAL, mais la valeur reste celle de l'objectif — c'est un paramètre de planification, pas une propriété du compte.

**Taux mensuel équivalent** — capitalisation annuelle convertie, jamais `r/12` :

```
i = (1 + r)^(1/12) − 1
```

**Valeur future avec contributions de fin de mois** (annuité ordinaire ; la contribution du mois courant n'est pas encore versée) :

```
        i > 0 :  VF(n) = S₀·(1+i)ⁿ + m · ((1+i)ⁿ − 1) / i
        i = 0 :  VF(n) = S₀ + m·n
```

Si les contributions tombent en début de mois (prélèvement le 1er), multiplier le terme d'annuité par `(1+i)`. Le choix est un réglage de l'objectif, pas une hypothèse cachée : il change la contribution requise de quelques dollars et il faut pouvoir l'expliquer.

Le calcul se fait **en cents, en nombres flottants intermédiaires, avec un seul arrondi final**. Arrondir à chaque mois accumule une dérive visible sur un horizon de dix ans.

### 2.6 Statut : en avance, dans les temps, à risque

Le statut n'est calculé **que si les trois paramètres sont connus** — cible, date, contribution. Avec deux paramètres sur trois il n'existe pas de trajectoire de référence, et l'application affiche `INDETERMINE` plutôt qu'un voyant inventé.

La référence est la trajectoire **telle qu'elle était prévue au départ**, pas une droite recalculée depuis aujourd'hui — sinon un objectif en retard se remet magiquement à l'heure à chaque ouverture de l'écran. On conserve donc l'ancrage de départ : `acquisInitialCents` et `dateDebut`, figés à la création de l'objectif.

```
p       = nombre de mois écoulés depuis dateDebut
attendu = VF(p)  calculé à partir de acquisInitialCents et de la contribution planifiée
ecart   = acquis − attendu
tol     = max( contributionMensuelleCents , 2 % × montantCibleCents )

ecart >  +tol                    → EN_AVANCE
|ecart| ≤ tol                    → DANS_LES_TEMPS
ecart <  −tol                    → A_RISQUE
acquis ≥ montantCibleCents       → ATTEINT      (prioritaire sur tout le reste)
aujourd'hui > dateCible          → ECHU         si non atteint
```

La tolérance double est nécessaire : un seul mois de contribution manqué ne doit pas basculer un objectif en rouge, et sur un gros objectif à petite contribution le plancher de 2 % évite qu'un écart insignifiant en proportion déclenche une alerte.

Quand le statut est `A_RISQUE`, l'écran n'affiche pas seulement la couleur : il affiche **la correction**, en réappliquant la formule (1) sur les mois restants. « Il manque 42 $ par mois pour tenir le 1er juin 2028 » est actionnable ; un point rouge ne l'est pas.

### 2.7 La bascule `depenseReduitProgression`

Elle décide de ce que fait un **retrait** sur les comptes alloués.

| Valeur | Progression calculée sur | Comportement à la dépense | Objectif typique |
|---|---|---|---|
| `true` | le **solde net** du compte | un retrait fait reculer la progression ; un objectif `ATTEINT` peut redevenir `A_RISQUE` | fonds d'urgence, coussin de trésorerie, provision d'entretien |
| `false` | le **cumul des entrées** depuis `dateDebut` | un retrait n'a aucun effet sur la progression ; l'objectif reste atteint | voyage, achat unique, mise de fonds |

La différence est de nature, pas de réglage. Un fonds d'urgence est une **quantité à maintenir** : le vider pour réparer la fournaise, c'est le défaire, et l'application doit le dire et rouvrir l'objectif avec une nouvelle date implicite. Un voyage est un **achat à financer** : payer le voyage, c'est réussir l'objectif, et voir la barre retomber à zéro au moment exact du succès serait absurde.

Avec `false`, la progression s'écrit donc :

```
acquis = Σ amountCents > 0 des transactions des comptes alloués depuis dateDebut
       + Σ GoalTransaction
```

et l'objectif passe à `ATTEINT` définitivement — on le clôture ou on l'archive, on ne le recalcule plus.

### 2.8 Retombée dans le budget

Un objectif ne budgète pas tout seul, et il n'a pas de ligne de budget à lui. Il **propose** : à l'ouverture d'un mois, chaque objectif actif suggère sa `contributionMensuelleCents` comme `BudgetAllocation` sur la sous-catégorie qui lui est rattachée (« Cotisation CELIAPP », « Fonds d'urgence »). Trois propriétés :

1. **La suggestion est pré-remplie, pas imposée.** On l'accepte, on la réduit, on la saute pour ce mois-ci. Le mois qui suit repart de la contribution planifiée, pas du montant réduit.
2. **L'allocation du mois fait foi pour le budget.** L'objectif n'est jamais une source de vérité budgétaire parallèle ; c'est `BudgetAllocation` qui compte, comme pour n'importe quelle enveloppe.
3. **Le lien avec `Target` est une correspondance, pas une duplication.** Un objectif dont la sous-catégorie porte déjà une cible en mode `ACCUMULER` avec `dateCible` décrit la même intention côté enveloppe. L'interface doit signaler le doublon au lieu de laisser les deux mécanismes s'additionner en silence.

Écart utile à afficher sur l'écran Objectifs : `contribution planifiée` contre `montantAssigneCents` réellement alloué ce mois-ci, et le cumul des mois sautés depuis le début — c'est la traduction budgétaire du statut `A_RISQUE`.

### 2.9 `GoalTransaction` : l'affectation exceptionnelle

Le cas réel : un remboursement d'impôt de 1 800 $, une prime, la vente d'un meuble. L'argent tombe dans le compte chèque et on décide qu'il va à la mise de fonds, sans le virer nulle part et sans attendre la contribution du mois.

`GoalTransaction` est ce lien : explicite, stocké, réversible, du même genre que la liaison transaction ↔ occurrence du modèle d'ingestion. Rien n'est jamais rattaché à un objectif par ressemblance ou par catégorie ; c'est un geste. Une transaction peut servir plusieurs objectifs seulement si le modèle porte un montant par lien — sinon, un lien par transaction, et on scinde la transaction si besoin.

### 2.10 `Goal.ordre` : la priorisation

Ce que ça fait, concrètement :

- **Ordonne l'affichage** de la liste des objectifs.
- **Ordonne le pré-remplissage** des allocations du mois : les contributions sont proposées dans l'ordre tant que le « reste à assigner » le permet ; l'objectif qui ne rentre plus est proposé à 0 $, marqué « non financé ce mois-ci », et non silencieusement omis.
- **Désigne le bénéficiaire d'un surplus** : quand un montant excédentaire est disponible, c'est l'objectif de plus petit `ordre` non encore atteint qui est proposé en premier.

Ce que ça **ne fait pas** :

- Ça ne déplace jamais d'argent, ni entre comptes, ni entre enveloppes.
- Ça ne reprend rien à un objectif déjà financé, ni ce mois-ci, ni rétroactivement.
- Ça ne modifie aucune allocation déjà validée par l'utilisateur.
- Ça n'entre pas dans le calcul de progression ni de statut : deux objectifs concurrents sur le même argent restent tous deux comptabilisés, et c'est le contrôle du §2.3 qui le signale.

Autrement dit : `ordre` pilote une **suggestion**, jamais une écriture.

---

## 3. Comptes de placement et régimes enregistrés

### 3.1 Pourquoi un placement est un compte de suivi

Un compte REER, CELI, CELIAPP ou un compte de courtage porte `estBudgetaire = false`. Conséquences, toutes voulues :

| | Compte budgétaire | Compte de suivi |
|---|---|---|
| Transactions catégorisées | oui | non |
| Entre dans le budget du mois | oui | **non** |
| Entre dans les rapports de dépenses | oui | non |
| Entre dans la valeur nette | oui, si `inclureDansValeurNette` | oui, si `inclureDansValeurNette` |
| Entre dans la prévision de trésorerie | oui, si `inclureDansPrevision` | non |
| Alimente les objectifs | oui | oui |

C'est ce qui règle le problème de fond : **une cotisation REER de 500 $ n'est pas une dépense de 500 $.** Sans cette distinction, le mois où on cotise au REER ressemble à un mois catastrophique, et le rapport annuel affiche une « dépense » de plusieurs milliers de dollars en face d'un actif qui a grossi d'autant. La même logique s'applique à la maison (`ACTIF`), à l'hypothèque (`PRET`) et au solde d'un prêt auto.

### 3.2 Une cotisation est un virement, pas un achat

Modèle : `Transaction` avec `transferAccountId` / `transferTransactionId`, soit une **paire symétrique liée** — sortie de 500 $ du compte chèque, entrée de 500 $ dans le REER, les deux lignes se pointant mutuellement.

Le traitement dépend de la nature de l'autre extrémité, et c'est la règle à écrire noir sur blanc :

| Cas | Côté A | Côté B | Traitement budgétaire |
|---|---|---|---|
| Virement entre deux comptes **budgétaires** (chèque → épargne, chèque → paiement Visa) | budgétaire | budgétaire | **exclu du budget des deux côtés** — l'argent reste dans le périmètre, aucune enveloppe n'est touchée |
| Virement d'un compte **budgétaire** vers un compte **de suivi** (chèque → REER, chèque → CELIAPP, chèque → capital d'hypothèque) | budgétaire | suivi | **la sortie est catégorisée** dans une sous-catégorie d'épargne et consomme une enveloppe ; l'entrée côté suivi n'est pas catégorisée |
| Achat ordinaire | budgétaire | — | catégorisé, dépense de consommation |

La deuxième ligne est le point technique important. L'argent **quitte réellement le périmètre budgétaire** : si on l'excluait du budget comme un virement ordinaire, 500 $ disparaîtraient du compte chèque sans qu'aucune enveloppe ne s'en aperçoive, et le budget mentirait de 500 $ ce mois-là. Il faut donc que la sortie soit assignable à une enveloppe — c'est aussi ce qui rend l'effort d'épargne **visible** dans le budget, au même titre que le loyer.

Et la différence avec un achat se joue dans les **rapports**, pas dans le budget : les sous-catégories d'épargne portent un indicateur qui les range dans un groupe « Épargne et placements », exclu du total des dépenses de consommation. La lecture devient : *« 4 200 $ sortis ce mois-ci, dont 500 $ d'épargne »*, et non *« 4 200 $ dépensés »*. Le test à retenir : une cotisation est **neutre pour la valeur nette** (l'argent change de poche), un achat la **réduit**.

Un retrait suit le chemin inverse : entrée sur le compte budgétaire, sortie du compte de suivi. Le côté budgétaire est catégorisé dans un revenu de type « Retrait de placement », lui aussi rangé hors des revenus d'emploi dans les rapports — sinon un retrait de CELI gonfle le revenu du mois et fausse tous les ratios.

### 3.3 Mettre le solde à jour : l'ancrage, pas le champ

Un compte de placement n'a pas de flux quotidien exploitable. Sa valeur bouge sans transaction. Le mécanisme est celui déjà retenu pour tous les comptes :

```
solde(compte, date) = dernier BalanceStatement antérieur ou égal à date
                    + Σ amountCents des transactions du compte, strictement après cet ancrage
                      et jusqu'à date
```

À la réception du relevé trimestriel, on saisit un `BalanceStatement { date, soldeCents, source: MANUEL }`. **On n'écrase rien** : l'ancrage précédent est conservé, et c'est précisément cette conservation qui rend la série historique et le calcul de rendement possibles.

### 3.4 Le gain de rendement n'est pas une transaction

Entre deux ancrages *A* et *B*, l'écart qui n'est pas expliqué par les mouvements est la croissance du placement :

```
gain(A, B) = solde(B) − solde(A) − Σ virements entrants entre A et B
                                 + Σ retraits entre A et B        (retraits comptés positifs)

rendement de période = gain(A, B) / (solde(A) + pondération des flux de la période)
```

Règles d'affichage, qui sont des règles de conception :

- Le gain **n'est jamais matérialisé par une transaction**. Aucune écriture n'est créée pour le faire coller. Créer une ligne « Rendement +312 $ » sur un compte de suivi, ce serait inventer un flux qui n'existe pas et rouvrir la porte au double comptage à la prochaine mise à jour d'ancrage.
- Le gain **n'est jamais un revenu**. Il n'entre ni dans le budget, ni dans le total des revenus, ni dans la prévision de trésorerie — il n'y a pas d'argent dépensable là-dedans. Il est présenté dans sa propre ligne, « Croissance du placement », sur la fiche du compte et dans la variation de valeur nette.
- Il n'est **pas annualisé par défaut** : un gain sur 84 jours reste un gain sur 84 jours. Une extrapolation annuelle à partir d'un trimestre est une fabrication.
- Un gain négatif s'affiche comme tel, sans euphémisme et sans lissage.

### 3.5 `tauxRendementAnnuel` : à quoi il sert, et à quoi il ne sert pas

**Il sert** à deux choses, et seulement à celles-là : la projection de valeur nette (§6.4) et la projection d'objectif quand l'objectif ne porte pas son propre taux (§2.5). C'est une **hypothèse de planification**, saisie à la main, du genre « mon portefeuille équilibré, disons 5 % ».

**Il ne sert pas** à inventer des transactions. L'application ne crédite jamais un compte du douzième de son taux à la fin du mois. La raison est la même que ci-dessus : le jour où l'ancrage réel arrive, ces écritures fabriquées seraient fausses, et il faudrait soit les effacer — donc réécrire le passé —, soit les réconcilier par un ajustement, pour une information qu'on possédait déjà.

**L'ancrage bat toujours la projection.** Une projection part du dernier ancrage connu et de rien d'autre. Le passé est fait de faits saisis ; le futur est un calcul jetable, recalculé à chaque affichage, jamais persisté.

---

## 4. Droits de cotisation — la fonction que personne d'autre n'offre

### 4.1 Pourquoi ça vaut la peine

Aucun des trois produits du référentiel ne connaît le CELI, le CELIAPP ni le REER. Quicken, YNAB et Monarch sont conçus pour un marché américain : ils gèrent des 401(k) et des IRA, ou rien du tout. Un utilisateur québécois qui veut savoir combien il peut encore cotiser à son CELI ouvre Mon dossier de l'ARC, ou tient un chiffrier.

C'est donc un des rares endroits où BudgApp peut être **strictement meilleur que le marché**, et le coût est dérisoire : une table (`ContributionRoom`), une soustraction, une alerte. Aucune donnée externe, aucun service tiers, aucune maintenance fiscale — à la condition posée au §4.3.

### 4.2 Le calcul

```
cotisations(compte, année) = Σ amountCents des virements ENTRANTS du compte
                             dont la date tombe dans l'année civile

droits_restants(compte, année) = plafondCents(année) + reportCents(année) − cotisations(compte, année)
```

`plafondCents` est le plafond de l'année, `reportCents` les droits inutilisés reportés des années antérieures — **les deux saisis par l'utilisateur**, depuis son avis de cotisation.

### 4.3 BudgApp ne calcule pas les droits, il les suit

C'est la décision structurante de cette section, et elle doit être répétée dans l'interface. Calculer des droits de cotisation exigerait de connaître le revenu gagné, le facteur d'équivalence d'un régime de retraite, l'historique complet des cotisations et retraits depuis l'ouverture des comptes, et les règles de l'année en cours. Ce serait faux la première fois qu'une règle change, et faux en silence.

L'application fait donc **une soustraction et une alerte**. L'utilisateur saisit le plafond et le report tels qu'ils apparaissent sur son avis de cotisation ; BudgApp additionne les virements entrants de l'année et affiche ce qui reste. C'est exactement l'opération que personne n'a envie de refaire à la main à chaque cotisation, et c'est celle qui a de la valeur.

### 4.4 Nuances par régime

Description des mécanismes, sans prétention à l'exhaustivité fiscale. **Les règles et les montants changent d'une année à l'autre ; l'avis de cotisation de l'ARC fait foi, et c'est auprès de l'ARC qu'il faut valider.**

**CELI.** Le piège classique est le retrait. Un retrait effectué cette année ne redonne pas de droits cette année : il s'ajoute aux droits de **l'année civile suivante**. Recotiser en décembre ce qu'on a retiré en mars, c'est une surcotisation, pénalisée mensuellement sur l'excédent. BudgApp doit donc :

- compter **les virements entrants de l'année** au numérateur, jamais le solde ni le net des mouvements ;
- afficher séparément « retraits de l'année, réutilisables à partir du 1er janvier prochain », avec la date à laquelle ces droits reviennent ;
- proposer, à la bascule d'année, `reportCents(a+1) = droits_restants(a) + Σ retraits de l'année a` — **en proposition à valider**, pas en calcul automatique.

**REER.** Les droits d'une année sont générés par le revenu gagné de l'**année précédente** (un pourcentage de ce revenu, plafonné par un maximum annuel indexé, réduit le cas échéant par le facteur d'équivalence d'un régime d'employeur). Deux particularités à porter dans le modèle :

- **Les 60 premiers jours.** Une cotisation versée dans les premiers jours de l'année peut être déduite de l'année d'imposition précédente. Une cotisation du REER porte donc une **année d'imputation** qui n'est pas toujours l'année civile de sa date. Sans ce champ, le compteur est faux tous les mois de janvier et février. La proposition par défaut peut suivre la date, le choix reste à l'utilisateur.
- **Une marge de tolérance** existe avant que la pénalité s'applique sur l'excédent. L'alerte doit donc distinguer « dépassement des droits » de « dépassement au-delà de la marge » — sinon elle crie pour un excédent toléré.

**CELIAPP.** Trois plafonds superposés : un **plafond annuel**, un **report limité** d'une année inutilisée seulement (on ne peut pas accumuler indéfiniment comme au CELI), et un **plafond à vie** qui borne le tout. S'ajoute une **durée de vie maximale du compte**, comptée à partir de son ouverture et bornée par l'âge, après quoi le compte doit être fermé ou transféré. Le modèle doit donc porter, sur le compte, la date d'ouverture et le cumul à vie, et l'application affiche le compte à rebours en années plutôt que de laisser l'échéance arriver par surprise.

**REEE, CRI, FERR.** Hors périmètre du suivi de droits pour l'instant. Le `regimeFiscal` existe pour les classer et les afficher correctement dans la valeur nette ; le compteur de droits n'est activé que sur CELI, REER et CELIAPP.

### 4.5 Ce que l'application affiche

- **Par compte et par année** : plafond, report, cotisé à ce jour, **droits restants**, sous forme de barre.
- **Une alerte avant la faute**, pas après : toute cotisation **prévue** — contribution mensuelle d'objectif, occurrence attendue d'une récurrence, événement planifié — est additionnée aux cotisations déjà faites et comparée aux droits. Le message est explicite : *« vos cotisations CELIAPP prévues d'ici décembre dépasseraient vos droits de 1 200 $ — la contribution de novembre est de trop »*.
- **Le rappel des retraits CELI** de l'année, avec la date de retour des droits.
- **Le compte à rebours CELIAPP** : plafond à vie restant, et années restantes avant l'échéance du compte.

### 4.6 L'avertissement obligatoire

Une mention permanente sur l'écran des droits de cotisation, pas enfouie dans une aide :

> Ce suivi est **indicatif**. Il repose sur les plafonds que vous avez saisis et sur les virements enregistrés dans BudgApp. Il ne tient pas compte de vos autres institutions ni de votre facteur d'équivalence. **Votre avis de cotisation de l'ARC fait foi** — vérifiez-y vos droits avant toute cotisation importante.

---

## 5. Allocation d'actifs

### 5.1 Saisie manuelle, en pour mille

`AssetAllocation { accountId, classe, partMille }`. `classe` est un **texte libre** — « Actions », « Obligations », « Liquidités », « Immobilier », « Alternatifs » —, avec une liste de suggestions, sans énumération figée : imposer un vocabulaire à un seul utilisateur ne sert à rien, et une énumération oblige à migrer le schéma pour ajouter une classe.

Le pour mille (600 = 60,0 %) évite le flottant, au même titre que les cents. La précision d'un dixième de point est largement au-delà de ce que la source — le relevé du courtier — fournit.

**Contrainte, validée à l'écriture et testée** :

```
Σ partMille des lignes d'un compte = 1000     exactement
```

Aucune tolérance, aucune normalisation silencieuse à la lecture. L'interface aide : elle affiche le reste à répartir, et le bouton « compléter » verse l'écart dans la dernière ligne saisie. Un compte sans aucune ligne d'allocation est valide — il est simplement « non ventilé ».

### 5.2 Agrégation au portefeuille

Pondération par le solde de chaque compte :

```
                     Σ_c  solde(c) × partMille(c, k)
part_portefeuille(k) = ───────────────────────────────
                              Σ_c  solde(c)
```

où *c* parcourt les comptes retenus et *k* une classe d'actifs. Points à respecter :

- Les comptes retenus sont ceux de type `PLACEMENT` (et `EPARGNE` si l'utilisateur le demande) avec `inclureDansValeurNette`, et **un solde strictement positif**. Un solde nul ou négatif n'a pas de répartition sensée.
- Un compte sans ligne d'allocation n'est **pas exclu** : il est versé en entier dans une classe `Non ventilé`. L'exclure ferait mentir les pourcentages sur un total amputé — le portefeuille afficherait « 70 % actions » alors qu'un tiers de l'argent n'est nulle part.
- Le résultat est recalculé à la lecture, jamais stocké. Il dépend des soldes, qui bougent à chaque ancrage.

### 5.3 Ce qu'on affiche

- **L'allocation courante** par classe : pourcentage et montant, sur le portefeuille consolidé et par compte.
- **L'écart à la cible**, si l'utilisateur a défini une allocation cible de portefeuille (une table de `(classe, partMille)` avec la même contrainte de somme à 1000) :

```
ecart(k)   = part_courante(k) − part_cible(k)
montant(k) = ecart(k) / 1000 × Σ_c solde(c)
```

Présenté en clair : *« Actions : 68 % contre 60 % visés, soit 9 400 $ de trop »*. C'est une information, pas une instruction.

### 5.4 Ce qui est écarté

| Écarté | Pourquoi |
|---|---|
| Ventilation par secteur ou par région | demande la composition détaillée de chaque fonds, donc une source de données de marché — exactement ce que le périmètre exclut |
| Analyse de fonds (frais de gestion, chevauchement, style) | même dépendance, et c'est le métier du courtier |
| Rééquilibrage automatique ou ordres suggérés | BudgApp ne passe pas d'ordres et ne donne pas de conseil de placement ; afficher l'écart suffit |
| Historique de l'allocation dans le temps | la valeur ajoutée est faible ; l'allocation courante et la valeur nette historique couvrent le besoin |
| Rendement pondéré dans le temps ou en dollars | demande la série complète des flux valorisés ; le gain entre deux ancrages (§3.4) répond à la question réellement posée |

---

## 6. Valeur nette

### 6.1 Définition

```
valeur_nette(d) = Σ solde(c, d)  pour les comptes d'actif  avec inclureDansValeurNette
                − Σ |solde(c, d)| pour les comptes de passif avec inclureDansValeurNette
```

**Convention de signe, à tenir partout** : les soldes sont stockés signés, et un compte de passif (`CREDIT`, `MARGE`, `PRET`, `PASSIF`) porte un solde **négatif**. La formule se réduit alors à une somme simple, `valeur_nette(d) = Σ solde(c, d)`, et la séparation actif / passif n'est plus qu'un regroupement d'affichage. C'est la seule convention qui survit à une marge de crédit qui repasse en positif ou à un compte chèque à découvert.

`inclureDansValeurNette` sert aux cas où un compte fausserait le portrait : un compte suivi pour quelqu'un d'autre, un compte fermé qu'on garde pour l'historique.

### 6.2 La série mensuelle, sans trou

Le piège : construire la série à partir des ancrages ou des transactions produit une série **à trous** — les mois sans mouvement et sans relevé disparaissent, et le graphique relie deux points en sautant trois mois. Le calendrier doit venir du calendrier, pas des données. D'où `generate_series` en `CROSS JOIN` :

```sql
WITH bornes AS (
  SELECT (generate_series(date_trunc('month', $1::date),
                          date_trunc('month', $2::date),
                          interval '1 month')
          + interval '1 month - 1 day')::date AS fin_mois
),
ancrage AS (
  SELECT b.fin_mois,
         a.id                                               AS compte_id,
         a."type"                                           AS compte_type,
         COALESCE(anc.date,         a."dateSoldeInitial")   AS depuis,
         COALESCE(anc."soldeCents", a."soldeInitialCents")  AS base_cents
  FROM bornes b
  CROSS JOIN "Account" a
  LEFT JOIN LATERAL (
    SELECT s.date, s."soldeCents"
    FROM "BalanceStatement" s
    WHERE s."accountId" = a.id
      AND s.date <= b.fin_mois
    ORDER BY s.date DESC, s."saisiLe" DESC
    LIMIT 1
  ) anc ON TRUE
  WHERE a."inclureDansValeurNette"
),
soldes AS (
  SELECT k.fin_mois,
         k.compte_id,
         k.compte_type,
         k.base_cents + COALESCE((
           SELECT SUM(t."amountCents")
           FROM "Transaction" t
           WHERE t."accountId" = k.compte_id
             AND t.date >  k.depuis
             AND t.date <= k.fin_mois
         ), 0) AS solde_cents
  FROM ancrage k
)
SELECT fin_mois,
       SUM(solde_cents) FILTER (
         WHERE compte_type NOT IN ('CREDIT','MARGE','PRET','PASSIF')) AS actifs_cents,
       SUM(solde_cents) FILTER (
         WHERE compte_type     IN ('CREDIT','MARGE','PRET','PASSIF')) AS passifs_cents,
       SUM(solde_cents)                                               AS valeur_nette_cents
FROM soldes
GROUP BY fin_mois
ORDER BY fin_mois;
```

Trois détails qui comptent : le `CROSS JOIN` garantit une ligne par (mois × compte) même sans aucune donnée ; le `LATERAL` prend le **dernier ancrage antérieur**, pas l'ancrage du mois ; le tri de départage sur `saisiLe` rend le résultat déterministe quand deux ancrages partagent la même date. Les montants sortent en cents, `bigint` à la somme.

### 6.3 La maison et l'hypothèque

La maison est un compte de type `ACTIF`, non budgétaire, avec un ancrage de valeur. L'hypothèque est un compte de type `PRET`, non budgétaire, au solde négatif, dont les paiements réduisent le capital. Les deux entrent dans la valeur nette, et **la valeur nette immobilière se lit alors d'un coup d'œil** : `valeur de la maison − solde de l'hypothèque`.

Pour que ce couple s'affiche ensemble plutôt que dispersé dans deux sections, un seul ajout au modèle `Account` :

```prisma
model Account {
  // … champs existants
  compteLieId String?          // l'actif que ce passif finance, ou l'inverse
  compteLie   Account?  @relation("Financement", fields: [compteLieId], references: [id])
  lies        Account[] @relation("Financement")
}
```

Un lien facultatif, symétrique à l'affichage, sans effet sur aucun calcul : la valeur nette reste la somme des comptes inclus, le lien ne fait que regrouper la présentation et permettre la ligne « Valeur nette immobilière ». Le même mécanisme sert au véhicule et à son prêt auto.

Le paiement d'hypothèque est un virement du compte chèque vers le compte de suivi, donc catégorisé du côté budgétaire (§3.2). La portion d'intérêt, elle, est une vraie dépense : soit on la saisit comme une transaction distincte sur le compte budgétaire (catégorie « Intérêts hypothécaires »), soit on scinde le paiement en deux lignes — capital vers le prêt, intérêts en dépense. La deuxième solution est la juste : sans elle, rembourser du capital et payer des intérêts se ressemblent, alors que l'un est neutre pour la valeur nette et l'autre la réduit.

### 6.4 Projection de valeur nette

Mois par mois, pour chaque compte inclus, à partir du **dernier solde connu** :

```
i_c = (1 + tauxRendementAnnuel_c)^(1/12) − 1

Placement / épargne :
  solde_c(m) = solde_c(m−1) × (1 + i_c) + cotisations planifiées(m) − retraits planifiés(m)

Prêt à taux fixe :
  solde_c(m) = solde_c(m−1) × (1 + i_c) + paiement(m)        (paiement > 0, solde négatif)

Actif non rémunéré (maison, véhicule) :
  solde_c(m) = solde_c(m−1) × (1 + i_c)                      i_c = 0 par défaut

valeur_nette(m) = Σ solde_c(m)
```

Les cotisations planifiées viennent des mêmes sources que l'alerte du §4.5 : contributions mensuelles d'objectifs, occurrences attendues des règles récurrentes, événements planifiés. Aucune source nouvelle, aucune saisie en double.

**Particularité québécoise à ne pas rater sur l'hypothèque** : un prêt hypothécaire canadien à taux fixe est composé **semestriellement**, pas mensuellement. Le taux mensuel équivalent est donc

```
i_mensuel = (1 + r/2)^(2/12) − 1        et non  r/12
```

L'écart est petit sur un mois et parfaitement visible sur vingt-cinq ans. Un prêt personnel ou une marge, eux, se composent généralement mensuellement : le mode de composition est un champ du compte de prêt, pas une constante du code.

**L'interface doit dire ce que c'est.** C'est une **projection déterministe** : un seul scénario, des taux constants, aucune volatilité, aucune correction de marché, aucune inflation. Elle répond à « si tout se passe comme prévu, où en serons-nous », et à rien d'autre. Pas de courbe unique qui aurait l'air d'une prédiction : une ligne, la mention explicite des hypothèses (taux par compte, cotisations retenues), et la possibilité de faire varier le taux global pour voir la sensibilité. Aucune simulation de Monte-Carlo, aucun intervalle de confiance — un intervalle de confiance sur une hypothèse saisie à la main n'aurait aucun sens.

### 6.5 Ce qui est écarté

La **valorisation automatique** d'une maison ou d'un véhicule. Zillow, Redfin ou Kelley Blue Book n'ont aucune couverture fiable du marché québécois : pas d'accès aux données de Centris, pas d'évaluation municipale, pas de modèle calibré sur le Grand Montréal. Une valeur fausse actualisée chaque mois est pire qu'une valeur juste actualisée une fois par année, parce qu'elle fabrique des variations de valeur nette qui n'existent pas.

À la place : un **ancrage manuel daté**, comme pour tout le reste. L'utilisateur saisit sa valeur — évaluation municipale, estimation de courtier, comparable de son quartier — quand il le décide. L'interface affiche depuis quand l'ancrage n'a pas bougé (*« valeur saisie il y a 14 mois »*) et propose un rappel annuel. C'est honnête, c'est gratuit, et la valeur nette porte alors des chiffres dont on connaît la provenance.

---

## 7. Où ça vit dans le code

`src/domain/` ne dépend de rien : pas de Prisma, pas de Next, pas d'accès réseau, pas d'horloge implicite — la date du jour est **toujours un paramètre**, sinon les tests deviennent dépendants du calendrier. Entrées et sorties sont des structures simples, les montants des entiers de cents, les dates des `DateCivile` (`AAAA-MM-JJ`).

```
src/domain/objectif/
  types.ts          Objectif, AllocationCompte, ParametresObjectif, StatutObjectif,
                    EntreeProgression — les types de l'îlot
  deduction.ts      deduireContribution, deduireDateCible, deduireMontantCible
                    + validerParametres (cas dégénérés du §2.2)
  valeurFuture.ts   tauxMensuelEquivalent, valeurFuture, nbMoisPourAtteindre
  progression.ts    calculerAcquis, calculerProgression — gère TOTAL / PARTIEL,
                    GoalTransaction, la déduplication et depenseReduitProgression
  statut.ts         evaluerStatut, correctionRequise
  priorisation.ts   repartirDisponible — suggestion d'allocations selon Goal.ordre
  index.ts          la surface publique

src/domain/patrimoine/
  types.ts          Ancrage, SoldeDate, LigneAllocation, PointValeurNette, HypothesesProjection
  solde.ts          soldeADate, serieSoldes — ancrage + transactions postérieures
  rendement.ts      gainEntreAncrages, rendementPeriode
  droits.ts         cotisationsAnnee, droitsRestants, alerteDepassement,
                    reportProposeCeli, anneeImputationReer
  allocation.ts     validerAllocationCompte (somme = 1000), agregerPortefeuille,
                    ecartCible
  valeurNette.ts    valeurNetteADate, consoliderSerie (regroupement actif / passif)
  projection.ts     tauxMensuelPret, amortir, projeterValeurNette
  index.ts
```

Le SQL du §6.2 et toutes les requêtes Prisma vivent dans la couche serveur (`src/server/patrimoine/`), qui charge les données brutes et les passe au domaine. La série mensuelle a deux implémentations équivalentes — la requête SQL pour la performance sur l'historique complet, `serieSoldes` du domaine pour la projection et les tests —, et un test croisé vérifie qu'elles produisent le même résultat sur un jeu de données de référence. Aucune valeur calculée n'est persistée : ni progression, ni statut, ni valeur nette, ni allocation consolidée. Tout se recalcule.

---

## 8. Les invariants à tester

**Objectifs**

1. Les trois formules de déduction sont réciproques : déduire *m* de (*C*, *n*), puis *n* de (*C*, *m*), redonne *n*, à un mois près dû à l'arrondi supérieur.
2. `valeurFuture` avec *i* = 0 égale `S₀ + m·n` exactement.
3. `tauxMensuelEquivalent(r)` composé 12 fois redonne `1 + r` à la précision flottante — et n'égale jamais `r/12`.
4. Une transaction liée par `GoalTransaction` sur un compte alloué en `TOTAL` n'est comptée qu'une fois.
5. Le statut est `INDETERMINE` dès qu'un des trois paramètres manque, quelle que soit la progression.
6. Le statut de référence ne dépend pas de la date d'évaluation : évaluer deux fois le même objectif au même jour donne le même résultat, et un objectif en retard ne se « recale » pas tout seul au fil du temps.
7. `depenseReduitProgression = false` : un retrait sur un compte alloué ne fait pas reculer la progression. `= true` : il la fait reculer, et un objectif `ATTEINT` peut redevenir `A_RISQUE`.
8. `Goal.ordre` ne modifie aucune `BudgetAllocation` existante ni aucun `acquis` — seulement l'ordre et le contenu des suggestions.
9. Objectif de type `REMBOURSEMENT` : la progression croît quand la dette décroît.

**Placements et virements**

10. Une paire de virement est toujours symétrique : `t.transferTransactionId → u` et `u.transferTransactionId → t`, montants opposés, et supprimer un côté supprime ou délie l'autre.
11. Virement entre deux comptes budgétaires : contribution nulle au budget du mois, des deux côtés.
12. Virement d'un compte budgétaire vers un compte de suivi : la sortie consomme une enveloppe, l'entrée n'est pas catégorisée, et la **valeur nette est inchangée** à la date du virement.
13. Un achat de même montant réduit la valeur nette ; une cotisation ne la réduit pas.
14. `gain(A, B)` est nul quand aucun mouvement n'a lieu et que les deux ancrages sont égaux ; il ne crée jamais de transaction, et aucun montant de rendement n'apparaît dans les totaux de revenus ni dans la prévision de trésorerie.
15. `solde(compte, date)` est invariant à l'ajout d'un ancrage **postérieur** à `date`.

**Droits de cotisation**

16. `droits_restants` ne compte que les virements **entrants** de l'année civile visée, jamais le net des mouvements ni le solde.
17. Un retrait CELI de l'année *a* n'augmente pas les droits de *a* ; le report proposé pour *a+1* les inclut.
18. Une cotisation REER datée dans les 60 premiers jours et imputée à l'année précédente est comptée dans *a−1*, pas dans *a*.
19. L'alerte de dépassement se déclenche sur `cotisé + planifié > plafond + report`, et pas seulement sur le cotisé.
20. Le compteur de droits est inactif pour `regimeFiscal` autre que CELI, REER et CELIAPP.

**Allocation et valeur nette**

21. `Σ partMille` d'un compte vaut 1000, refusé sinon ; aucune normalisation implicite à la lecture.
22. L'agrégation d'un portefeuille à un seul compte redonne l'allocation de ce compte.
23. Un compte sans allocation apparaît en `Non ventilé` et les parts agrégées somment toujours à 1000.
24. La série mensuelle contient **exactement** un point par mois de l'intervalle demandé, y compris les mois sans transaction ni ancrage.
25. `valeur_nette` à une date égale la somme des soldes des comptes inclus à cette date, et exclut les comptes `inclureDansValeurNette = false`.
26. La projection repart toujours du dernier ancrage connu, ne persiste rien, et n'écrit aucune transaction.
27. L'amortissement d'un prêt hypothécaire utilise la composition semestrielle ; le capital restant à l'échéance du terme est nul à un cent près.
28. Tous les calculs sont en entiers de cents à la sortie, avec un arrondi unique en fin de chaîne.
