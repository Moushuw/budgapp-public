# BudgApp — dettes, amortissement et scénarios what-if

*Rapatrié du projet Claude « Budgapp » (`claude/modele-dettes-scenarios.md`, 13 septembre 2026) le 1er octobre 2026, sans modification de fond. Fait autorité pour M6.*

Conception du troisième pilier : calculer l'amortissement d'un prêt selon les conventions canadiennes, projeter les intérêts d'une carte de crédit, simuler un plan de remboursement, et faire tourner des scénarios what-if sans jamais toucher aux données réelles.

---

## 1. Le cadre qui ne bouge pas

Trois horloges, déjà posées ailleurs, et rien ici ne les mélange :

| Horloge | Contenu | Ce que ce document y ajoute |
|---|---|---|
| **Registre** | transactions réelles | la ventilation capital / intérêts / assurance d'un paiement d'hypothèque réellement passé |
| **Récurrences** | occurrences attendues, matérialisées à la volée | l'échéancier de prêt et l'intérêt de carte projeté, qui sont des occurrences attendues comme les autres |
| **Budget** | enveloppes mensuelles | le bouton « traduire en budget » du planificateur, qui écrit des `Target` — et rien d'autre |

La projection de trésorerie n'inclut **jamais** les enveloppes budgétaires. Un simulateur ne modifie **jamais** les données réelles : il produit un modèle résolu en mémoire, le projette, et l'oublie à la fermeture.

Conventions de calcul, sans exception : montants en **entiers de cents**, dates en `DateCivile` (`"AAAA-MM-JJ"`), aucun objet `Date` dans le domaine, conversion uniquement à la frontière Prisma. Tout ce qui suit vit dans `src/domain/`, sans import de Prisma, et se teste avec Vitest.

---

## 2. Amortissement d'un prêt

### 2.1 La formule générale

Un prêt à paiement constant se décrit par quatre grandeurs : le capital `P`, le taux périodique `i`, le nombre de paiements `N`, le paiement `A`.

```
A = P · i / (1 − (1 + i)^(−N))
```

et l'échéancier se déroule paiement par paiement :

```
intérêt_k   = round(solde_(k−1) · i)
capital_k   = A − intérêt_k
solde_k     = solde_(k−1) − capital_k
```

L'arrondi se fait **au cent, à chaque période, sur l'intérêt**, jamais à la fin. C'est ce que font les prêteurs, et c'est la seule façon d'obtenir un échéancier qui recolle au relevé au cent près. Le dernier paiement est un **résidu** : `A_N = solde_(N−1) + intérêt_N`, ce qui absorbe la dérive d'arrondi accumulée. Ne pas le faire produit un solde final de quelques dollars, positif ou négatif, qui n'existe pas dans la vraie vie.

### 2.2 Le point critique canadien : composition semestrielle

**C'est l'erreur la plus coûteuse du domaine.** La *Loi sur l'intérêt* fait que les prêts hypothécaires canadiens sont composés **semestriellement, non à l'avance**, alors que les paiements sont mensuels, aux deux semaines ou hebdomadaires. Aux États-Unis, la composition suit la fréquence de paiement. Une bibliothèque d'amortissement générique, un tutoriel trouvé en ligne ou une formule Excel `VPM(taux/12; …)` appliquent tous la convention américaine.

La conversion correcte, pour `n` paiements par année :

```
taux_périodique = (1 + taux_annuel / compositionParAn)^(compositionParAn / n) − 1
```

soit, pour une hypothèque canadienne (`compositionParAn = 2`) :

```
i = (1 + taux_annuel / 2)^(2 / n) − 1
```

L'écart, sur un cas réaliste — 320 000 $, 4,79 %, 25 ans, mensuel :

| Convention | Taux périodique | Paiement | Écart |
|---|---|---|---|
| Canadienne — `(1 + 0,0479/2)^(1/6) − 1` | 0,395236 % | **1 823,07 $** | — |
| Américaine — `0,0479 / 12` | 0,399167 % | 1 831,71 $ | +8,64 $/mois |

8,64 $ par mois sur 300 paiements, c'est **2 592 $** d'erreur sur l'amortissement, et un échéancier faux dès la première ligne — donc une fiche de compte fausse, une prévision fausse et un plan de remboursement faux.

**Pourquoi `compositionParAn` est un champ et pas une constante.** La composition semestrielle est une particularité **hypothécaire**. Un prêt auto, un prêt personnel, une marge de crédit sont presque toujours composés mensuellement, et une marge l'est parfois quotidiennement. Coder `2` en dur rend faux tout ce qui n'est pas une hypothèque. Le champ vit sur `LoanTerm`, avec les autres paramètres datés, parce qu'un refinancement peut changer la convention en même temps que le taux.

### 2.3 Les quatre cadences réelles au Québec

`paiementsParAn` prend l'une de ces valeurs, et le **paiement** n'est pas dérivé de la même façon selon le cas :

| Cadence | `paiementsParAn` | Paiement | Effet |
|---|---|---|---|
| Mensuel | 12 | `A` calculé sur 12 | référence |
| Aux deux semaines | 26 | `A × 12 / 26` | équivalent au mensuel ; 26 versements = 12 mensualités |
| **Accéléré aux deux semaines** | 26 | **`A / 2`** | 26 versements = **13 mensualités par an** |
| Hebdomadaire | 52 | `A × 12 / 52` (ou `A / 4` en accéléré) | idem, à la semaine |

L'accéléré n'est pas un raffinement cosmétique. Sur le même prêt de 320 000 $ à 4,79 % :

| | Paiement | Durée réelle |
|---|---|---|
| Mensuel | 1 823,07 $ | 25 ans |
| Aux deux semaines | 841,42 $ | 24 ans 11 mois |
| **Accéléré aux deux semaines** | **911,54 $** | **≈ 21 ans 7 mois** |

Trois ans et demi de moins pour 70 $ de plus aux deux semaines. C'est exactement le genre de chiffre qu'un simulateur doit pouvoir produire, et c'est le premier levier que le scénario what-if doit offrir sur une hypothèque.

Conséquence sur le calendrier : une cadence à 26 ou 52 paiements est ancrée sur une **date**, pas sur un jour du mois. Les échéances se déroulent par `dateDebut + k × 14 jours`, ce qui donne trois mois par année avec trois versements au lieu de deux. La projection quotidienne doit le voir ; un modèle qui divise l'année en douze ne le voit pas.

### 2.4 Terme et amortissement : pourquoi `LoanTerm` est une série datée

Au Canada, une hypothèque de 25 ans d'**amortissement** se contracte par **termes** de 3 ou 5 ans. À l'échéance du terme, le taux est renégocié et le paiement change, sur le solde restant. Un modèle à taux unique ne peut pas représenter ça.

D'où `LoanTerm[]`, ordonné par `moisEffectif` (`"2026-09"`), chaque entrée portant ses propres `tauxAnnuel`, `compositionParAn`, `paiementsParAn`, `paiementCents`, `nbPaiements`.

La règle de déroulement :

1. On part de `soldeDepart` à `dateDepart`.
2. On déroule avec le terme dont `moisEffectif` est le plus récent parmi ceux `≤` au mois de l'échéance courante.
3. Au premier paiement dont le mois atteint le `moisEffectif` du terme suivant, on **reprend le solde tel qu'il est à cet instant** et on l'utilise comme nouveau capital : nouveau taux périodique, nouveau paiement, nouveau `nbPaiements` = ce qui reste de l'amortissement.

Ce que ça garantit : **le passé n'est jamais réécrit.** Renouveler à 5,60 % en 2031 ne change pas une ligne des paiements de 2026 à 2031, ni les intérêts déjà payés, ni la ventilation des transactions réelles déjà rapprochées. Un renouvellement est un ajout de `LoanTerm`, pas une modification.

Le `paiementCents` est **stocké**, pas seulement calculé : le prêteur arrondit à sa façon, et c'est son chiffre qui apparaît au relevé. Quand il est absent, on le calcule avec la formule du §2.1 ; quand il est présent, il fait autorité et la formule ne sert qu'à valider (un écart de plus de quelques cents signale une saisie erronée et s'affiche).

### 2.5 La fonction pure

```ts
type DateCivile = string;            // "AAAA-MM-JJ"

type LigneEcheancier = {
  date: DateCivile;
  paiementCents: number;
  capitalCents: number;
  interetCents: number;
  soldeApresCents: number;
  termeId: string;                   // quel LoanTerm a produit la ligne
};

function echeancierPret(
  termes: LoanTerm[],                // triés par moisEffectif, au moins un
  soldeDepartCents: number,
  dateDepart: DateCivile,
  jusqua: DateCivile,
  versementsSupplementaires?: VersementSupplementaire[],
): LigneEcheancier[];

type VersementSupplementaire =
  | { genre: "PONCTUEL"; date: DateCivile; montantCents: number }
  | { genre: "RECURRENT"; montantCents: number; aPartirDe: DateCivile };
```

Propriétés que la signature impose et que les tests vérifient :

- **Pure et déterministe.** Mêmes entrées, même sortie, aucun accès à l'horloge système. `jusqua` est obligatoire : pas de boucle non bornée sur un prêt mal paramétré.
- **Terminaison.** La boucle s'arrête au premier `soldeApres ≤ 0` **ou** à `jusqua`, selon ce qui vient en premier. Un paiement inférieur à l'intérêt de la période fait diverger le solde : on le détecte avant de boucler et on lève une erreur typée (`PaiementInsuffisant`), on ne produit pas un échéancier infini.
- **Les versements supplémentaires s'appliquent au capital**, après le calcul de l'intérêt de la période, et ne modifient pas le paiement régulier — ils raccourcissent le terme.

### 2.6 Tests obligatoires

| Test | Ce qu'il protège |
|---|---|
| Prêt à taux fixe mensuel, composition semestrielle, vérifié contre une valeur connue (320 000 $ / 4,79 % / 25 ans → 1 823,07 $) | la conversion de taux, le cœur du module |
| Le même prêt en composition mensuelle → 1 831,71 $ | que `compositionParAn` est bien lu et non ignoré |
| Somme des `capitalCents` de l'échéancier complet = capital initial, au cent | l'arrondi par période et le résidu final |
| Dernier paiement : `soldeApres = 0` exactement | le traitement du résidu |
| Renouvellement de taux à mi-parcours (5 ans à 4,79 %, puis 5,60 %) | que le solde au renouvellement est repris et que le passé est intact |
| Deux `LoanTerm` dont le second a un `moisEffectif` antérieur à `dateDepart` | l'ordonnancement et la sélection du terme actif |
| Paiement accéléré aux deux semaines → durée ≈ 21 ans 7 mois, et 26 échéances par an calendaire | la cadence par dates et non par mois |
| Versement supplémentaire ponctuel de 10 000 $ | l'imputation au capital et le raccourcissement du terme |
| Versement supplémentaire récurrent de 200 $ | idem, cumulé |
| Année bissextile : échéancier aux deux semaines traversant le 29 février 2028 | l'arithmétique de dates civiles sans objet `Date` |
| Cadence mensuelle ancrée le 31 (31 janvier → 28 février → 31 mars) | la règle de fin de mois, la même que celle des récurrences |
| Paiement inférieur à l'intérêt périodique | l'erreur `PaiementInsuffisant`, pas une boucle infinie |

---

## 3. La fiche d'un compte de prêt

Demande explicite de Benjamin : *« dans le compte "prêt maison" par exemple, comme dans Quicken, je veux un graphique qui dit sur tel montant total de prêt, j'ai ça de remboursé en capital, ça de dépensé en intérêt et il reste ça »*.

### 3.1 Le graphique de composition

Une **barre empilée horizontale unique**, dont la longueur totale est le **coût total du prêt** = capital initial + intérêts sur toute la durée. Quatre segments, dans l'ordre :

```
│ capital remboursé │ intérêts payés │ capital restant │ intérêts à venir │
└───────────────────┴────────────────┴─────────────────┴──────────────────┘
        84 300 $          61 200 $         235 700 $         185 400 $
 ├────────── payé à ce jour ─────────┤├───────── reste à payer ──────────┤
```

Un repère vertical marque la position du jour. La règle de lecture est écrite sous la barre, en une phrase : « 145 500 $ versés, dont 61 200 $ d'intérêts. Il reste 421 100 $ à verser, dont 185 400 $ d'intérêts. »

Deux exigences de rendu : les deux segments de capital utilisent la même teinte à deux intensités, les deux segments d'intérêts une autre — pour que l'œil sépare *capital vs intérêts* avant de séparer *payé vs restant*. Et la barre est **toujours à l'échelle du coût total**, jamais normalisée à 100 % du capital : c'est précisément la part d'intérêts qui doit sauter aux yeux.

### 3.2 La courbe

Sous la barre, un graphique temporel de la date d'origine à la date de fin :

- **Aire du capital restant** — la courbe décroissante, convexe, qui montre pourquoi les premières années ne remboursent presque rien.
- **Courbe des intérêts cumulés** — croissante, sur le même axe de montants, qui croise la première au point où l'on a payé plus d'intérêts que remboursé de capital.
- Le **passé** est tracé en trait plein, le **futur** en trait pointillé, avec le repère du jour. C'est la seule distinction visuelle nécessaire, et elle est obligatoire : la partie gauche est un fait, la partie droite une projection.
- Les renouvellements de terme sont marqués par un trait vertical léger et une étiquette (« renouvellement — 5,60 % »).

### 3.3 Les chiffres qui accompagnent

| Indicateur | Source | Calcul |
|---|---|---|
| Capital remboursé à ce jour | registre si disponible, sinon échéancier | Σ `capitalCents` des `RecurringSplit` réellement rapprochés ; à défaut, Σ des lignes d'échéancier `≤` aujourd'hui |
| Intérêts payés à ce jour | idem | Σ `interetCents` |
| Capital restant | échéancier | `soldeApresCents` de la dernière ligne passée |
| Intérêts restants si rien ne change | échéancier | Σ `interetCents` des lignes futures |
| Date de fin | échéancier | date de la ligne où `soldeApres = 0` |
| **Ratio capital / intérêt du prochain paiement** | échéancier | la ligne suivante : « prochain paiement 1 823,07 $ — 558,31 $ de capital, 1 264,76 $ d'intérêts (69 % d'intérêts) » |
| Taux effectif annuel | terme actif | `(1 + i)^n − 1`, affiché à côté du taux nominal |

**La règle de préséance est importante** : quand des paiements réels existent et sont ventilés par `RecurringSplit`, ce sont eux qui donnent le capital remboursé et les intérêts payés, pas l'échéancier théorique. Un versement supplémentaire fait l'an dernier, une échéance sautée, un paiement décalé : la réalité l'emporte. L'échéancier ne sert alors qu'à projeter l'avenir, à partir du solde réel. Quand aucun paiement n'est ventilé, l'échéancier théorique remplit le passé, et la fiche l'indique (« estimation, aucun paiement ventilé »).

---

## 4. Cartes de crédit et intérêts

Benjamin rembourse ses cartes en entier. Ce module ne sert pas à gérer une dette permanente : il sert à répondre à « et si je ne pouvais pas, le mois prochain ? » — et à le chiffrer avant que ça arrive.

### 4.1 Pas d'enveloppe de paiement de carte

**Décision prise.** BudgApp ne crée pas d'enveloppe budgétaire de paiement par carte. Le paiement d'une carte est un **virement** : une paire symétrique de `Transaction` liées par `transferAccountId` / `transferTransactionId`, exclue du budget **des deux côtés**.

Ce qui suffit, parce que le double comptage vient d'ailleurs : la dépense d'épicerie payée à la Visa est déjà budgétée le jour de l'achat, dans l'enveloppe Épicerie. Rebudgéter le paiement du relevé compterait la même épicerie deux fois. Le virement, non catégorisé et exclu des deux côtés, est la formulation exacte du fait : de l'argent change de compte, aucune dépense n'a lieu.

Ce qu'on perd et qu'on assume : le signal « l'enveloppe de paiement Visa ne couvre pas le relevé ». Il est remplacé par l'indicateur de couverture du §4.6, qui répond à la même question depuis la prévision de trésorerie plutôt que depuis le budget — donc sans franchir la cloison entre les deux.

### 4.2 Le cycle

Deux dates, sur `Account` :

- `jourReleve` — fermeture du relevé. Les achats postérieurs basculent au cycle suivant.
- `jourEcheance` — date limite de paiement, typiquement 21 jours après.

```
 3 sept        21 sept                3 oct         21 oct
 │ relevé      │ échéance             │ relevé      │ échéance
 ├─ cycle d'octobre (achats) ─────────┤
 └─ délai de grâce sur le relevé de sept ─┘
```

Les jours 29, 30 et 31 suivent la même règle de fin de mois que les récurrences : `min(jour, dernier jour du mois)`.

### 4.3 Le délai de grâce, et sa perte

La règle canadienne, telle qu'elle doit être encodée :

1. Tant que le **solde du relevé est payé en entier** avant l'échéance, **aucun intérêt** sur les achats. C'est le délai de grâce, minimum 21 jours par règlement fédéral.
2. Dès qu'un solde est **reporté**, le délai de grâce est **perdu**. Les intérêts courent alors sur chaque achat **depuis sa date de transaction** — pas depuis la date du relevé, pas depuis l'échéance. C'est rétroactif sur le cycle qui vient de se terminer.
3. La perte **persiste** : les nouveaux achats du cycle en cours portent intérêt dès leur date, et ce jusqu'à ce qu'un relevé soit de nouveau payé en entier. Selon l'émetteur, il faut **un ou deux cycles consécutifs** payés en entier pour retrouver le délai de grâce.
4. Les **avances de fonds** et les chèques de commodité n'ont **jamais** de délai de grâce : intérêt dès le jour de l'avance, souvent à un taux supérieur.

C'est ce que `perdDelaiDeGrace` encode sur `Account` : un booléen d'**état courant**, mis à jour à chaque fermeture de relevé (payé en entier → faux ; solde reporté → vrai), et non un paramètre de configuration. Le nombre de cycles requis pour le retour au délai de grâce est un réglage du compte (1 ou 2, défaut 1).

### 4.4 La formule

Intérêt sur un cycle, par solde quotidien :

```
intérêt = Σ_jours (solde_du_jour × taux_annuel / 365)
```

365 jours, pas 360, pas 12 mois de 30 jours. Le `taux_annuel` est celui des achats ; un taux distinct s'applique aux avances de fonds, ce qui impose de suivre **deux soldes** quand une avance existe. Cas le plus fréquent — aucune avance —, un seul solde suffit, et c'est ce que le v2 implémente ; la structure de calcul accepte plusieurs strates de solde dès le départ pour ne pas avoir à être réécrite.

Exemple chiffré, carte à 19,99 % :

| Période | Jours | Solde portant intérêt | Intérêt |
|---|---|---|---|
| 3 → 21 sept — relevé impayé | 18 | 2 340 $ | 23,07 $ |
| 21 sept → 3 oct — solde reporté | 12 | 540 $ | 3,55 $ |
| Achats de septembre, depuis leur date | 14 j moyens | 1 900 $ | 14,57 $ |
| **Au relevé du 3 octobre** | | | **≈ 41 $** |

L'application affiche ce chiffre comme une **estimation**, parce que la convention exacte varie d'un émetteur à l'autre (solde quotidien moyen, solde ajusté, traitement des paiements dans le cycle). L'ordre de grandeur est juste, et c'est ce qui compte pour décider.

### 4.5 Ce que l'écran dit

Une phrase, pas un tableau :

> « Relevé de 2 340 $ fermé le 3, dû le 21. Payé 1 800 $ : 540 $ reportés, environ 41 $ d'intérêts au prochain relevé, et le délai de grâce est perdu sur les achats de septembre. »

Et la conséquence, qui est le vrai message : « pour retrouver le délai de grâce, payer 2 881 $ au complet d'ici le 21 octobre. »

**L'intérêt projeté entre dans la prévision comme une occurrence attendue ordinaire** : une `ExpectedOccurrence` datée du jour de relevé, sur le compte de carte, rattachée à une règle système « Intérêts — Visa ». Elle se rapproche de la ligne d'intérêt réelle à l'import, comme n'importe quelle autre occurrence, et devient donc vérifiable : un écart répété entre l'intérêt projeté et l'intérêt facturé signale un paramétrage faux. Aucune mécanique spéciale, aucune quatrième horloge.

### 4.6 L'indicateur de couverture

Sur la fiche de chaque carte, une ligne unique :

```
couverture = liquidités projetées à jourEcheance − solde du relevé
```

où les liquidités projetées sortent du moteur de prévision, comptes de type CHEQUE et EPARGNE marqués `inclureDansPrevision`, à la date d'échéance exacte. Trois états :

| État | Condition | Message |
|---|---|---|
| Couvert | `couverture ≥ 0` | « relevé de 2 340 $ dû le 21 — 3 180 $ projetés au compte Chèque ce jour-là » |
| Juste | `0 ≤ couverture < 15 %` du relevé | même phrase, avec la marge en évidence |
| **Découvert** | `couverture < 0` | « il manquera 410 $ le 21 octobre pour payer la Visa en entier » + le lien vers le simulateur |

C'est l'équivalent de l'alerte de liquidité du module de prévision, appliqué à une date qui compte. Il vit du côté de la prévision, pas du budget — la cloison tient.

---

## 5. Le planificateur de remboursement

### 5.1 La fonction

```ts
type Dette = {
  accountId: string;
  libelle: string;
  soldeCents: number;              // positif = montant dû
  tauxAnnuel: number;              // 0.1999
  compositionParAn: number;
  minimumCents: number;            // paiement minimum exigé
  minimumPourcent?: number;        // certains émetteurs : max(2 % du solde, 10 $)
  ordre?: number;                  // DebtPlanItem.ordre, si PERSONNALISEE
};

type LignePlan = {
  mois: string;                    // "2027-03"
  accountId: string;
  paiementCents: number;
  interetCents: number;
  capitalCents: number;
  soldeApresCents: number;
};

type ResultatPlan = {
  echeancier: LignePlan[];
  dateLiberation: DateCivile;
  interetsTotauxCents: number;
  comparaisonMinimums: {
    dateLiberation: DateCivile;
    interetsTotauxCents: number;
    moisEconomises: number;
    interetsEconomisesCents: number;
  };
};

function simulerPlanDette(
  dettes: Dette[],
  strategie: "AVALANCHE" | "BOULE_DE_NEIGE" | "PERSONNALISEE",
  mensualiteTotaleCents: number,
  versementPonctuel?: { dateISO: DateCivile; montantCents: number },
): ResultatPlan;
```

### 5.2 L'algorithme, pas à pas

Pour chaque mois, dans l'ordre :

1. **Intérêt.** Pour chaque dette active : `intérêt = round(solde × tauxPériodique)`, avec `tauxPériodique = (1 + taux/compositionParAn)^(compositionParAn/12) − 1` — la même conversion qu'au §2.2, pour la même raison.
2. **Minimums.** Verser le minimum sur chaque dette, plafonné au solde + intérêt du mois (on ne verse pas plus que ce qui est dû).
3. **Surplus.** `surplus = mensualiteTotale − Σ minimums versés`. Si le surplus est négatif, le plan est **infaisable** : on le dit tout de suite, avec le montant minimal viable, au lieu de produire un échéancier mensonger.
4. **Cible.** Verser tout le surplus sur la **dette prioritaire** selon la stratégie, plafonné à son solde résiduel.
5. **Débordement.** Si la dette prioritaire tombe à zéro et qu'il reste du surplus, il passe à la suivante — dans le même mois, en cascade, jusqu'à épuisement.
6. **Effet boule de neige.** Une dette soldée libère son minimum : au mois suivant, `Σ minimums` est plus petit, donc le surplus est plus grand. **La mensualité totale ne baisse jamais.** C'est le mécanisme entier ; il n'y a rien d'autre.
7. Le **versement ponctuel** s'applique au mois de sa date, après les minimums, en tête du surplus, sur la dette prioritaire.

Arrêt quand toutes les dettes sont à zéro (`dateLiberation` = date du dernier versement), ou au bout de 480 mois — auquel cas le plan est déclaré non convergent.

### 5.3 Les trois stratégies

| Stratégie | Tri de la dette prioritaire | Argument |
|---|---|---|
| **AVALANCHE** | `tauxAnnuel` décroissant | mathématiquement optimal : le moins d'intérêts, la libération la plus rapide |
| **BOULE_DE_NEIGE** | `soldeCents` croissant | psychologique : la première dette disparaît vite, l'élan tient |
| **PERSONNALISEE** | `DebtPlanItem.ordre` croissant | tout le reste : solder la carte du magasin par principe, garder le prêt étudiant pour le crédit d'impôt |

Départage en cas d'égalité : taux décroissant, puis solde croissant, puis `accountId` — pour que la fonction reste déterministe.

Seules les dettes dont `DebtPlanItem.inclus` est vrai entrent dans le plan. Les autres continuent leur vie dans la prévision de trésorerie avec leur paiement courant, mais ne reçoivent pas de surplus.

### 5.4 Le différentiel est obligatoire à l'affichage

**Un résultat absolu seul est interdit.** « Libre en janvier 2029 » ne dit rien : ni si c'est bien, ni ce que ça coûte, ni ce qu'une autre décision donnerait. L'écran affiche toujours trois colonnes :

|  | Minimums seuls | Boule de neige | **Avalanche** |
|---|---|---|---|
| Libération | juillet 2033 | 15 février 2029 | **18 janvier 2029** |
| Intérêts totaux | 14 900 $ | 4 190 $ | **3 850 $** |
| Écart vs stratégie courante | — | +28 jours, +340 $ | — |

*(chiffres d'illustration : 4 dettes, 29 950 $, mensualité 1 200 $)*

Et la phrase qui résume, sous le tableau : « L'avalanche te libère 28 jours plus tôt et te fait économiser 340 $ d'intérêts par rapport à la boule de neige — et 4 ans 5 mois et 11 050 $ par rapport aux minimums seuls. »

Les **deux** comparaisons sont requises : contre l'alternative (le choix de stratégie) et contre « minimums seuls » (le choix de faire un plan tout court). La seconde est presque toujours la plus spectaculaire, et c'est celle qui motive.

### 5.5 Le curseur de mensualité

Un curseur, de `Σ minimums` à un plafond raisonnable, avec l'effet recalculé **en direct** — la date de libération et les intérêts totaux bougent pendant qu'on glisse.

Ce que ça impose, et c'est une contrainte d'architecture, pas un détail d'interface :

- **Le calcul tourne côté client**, sur des données déjà chargées. Un aller-retour serveur par déplacement de curseur est exclu : latence, charge, et un curseur qui saccade.
- `simulerPlanDette` est donc dans `domain/`, importable **par le client comme par le serveur**. C'est déjà la règle (`domain/` ne dépend de rien) ; ici elle devient une exigence fonctionnelle.
- **Budget de calcul : moins de 16 ms** pour un cas réaliste (4 à 8 dettes, 60 à 120 mois). L'algorithme est en `O(mois × dettes)`, soit quelques milliers d'opérations entières — largement tenable. Ce qui le casserait : allouer un objet par ligne d'échéancier à chaque frappe. On réutilise des tableaux typés et on ne matérialise l'échéancier détaillé qu'au relâchement du curseur.
- Un `useDeferredValue` sur la valeur du curseur, pour que le rendu du graphique ne bloque pas le geste.

### 5.6 Le versement ponctuel

`DebtPlan.versementPonctuelCents` et `versementPonctuelDate` : un montant unique, à une date, imputé selon la stratégie.

Pour aider à décider du montant, le panneau affiche à côté du champ les **soldes d'épargne disponibles** — comptes de type EPARGNE, avec leur solde courant et, quand ils portent un objectif, ce qui est déjà affecté. On ne présume rien : c'est une information posée à côté du curseur, pas une suggestion de vider le compte d'urgence. Une note fixe accompagne le bloc : mettre l'épargne d'urgence sur une dette rend le remboursement plus rapide et la marge de manœuvre plus mince — le simulateur montre le premier, il ne mesure pas le second.

### 5.7 « Traduire en budget »

Un bouton, un effet clair : le plan devient des **cibles mensuelles** (`Target`) sur les enveloppes de remboursement, une par dette incluse, du montant que le plan verse ce mois-là.

Trois règles pour que ça reste honnête :

1. **La traduction est un geste explicite et unique.** Le plan ne pousse rien dans le budget tant qu'on ne clique pas. C'est la seule voie par laquelle un simulateur touche à des données persistées, et elle est bornée à l'écriture de `Target`.
2. **Aperçu avant écriture** : la liste des enveloppes touchées, la cible actuelle, la cible proposée, l'écart. Rien n'est écrasé en silence.
3. **Les cibles sont figées au moment de la traduction**, pas recalculées mensuellement. Le plan évolue (les paiements montent à mesure que les dettes tombent) ; le budget ne se réécrit pas tout seul. Un bandeau sur l'écran Budgets signale quand le plan a dérivé des cibles de plus d'un seuil, et propose de retraduire.

### 5.8 Les garde-fous

Trois avertissements, affichés en permanence dans le panneau, pas dans une fenêtre qu'on ferme une fois :

- **Le plan suppose qu'aucun nouvel achat n'est porté sur les dettes incluses.** Une carte incluse sur laquelle on continue de payer l'épicerie invalide l'échéancier. L'application le vérifie : s'il existe des transactions de dépense postérieures à la création du plan sur un compte inclus, elle le dit, avec le montant, et propose de recalculer sur le solde réel.
- **Les minimums sont supposés constants.** Un minimum à `max(2 % du solde, 10 $)` décroît avec le solde ; le modèle le recalcule quand `minimumPourcent` est renseigné, et le signale quand il ne l'est pas.
- **Les taux sont supposés constants.** Une marge à taux variable bouge avec le taux directeur. Le plan est une projection à taux figé, et l'écran le dit — c'est précisément ce que le scénario `TAUX_RENDEMENT` sert à interroger.

---

## 6. Les scénarios what-if

### 6.1 Le principe

Un scénario est une **surcouche temporaire**. Il ne modifie jamais une `Transaction`, une `RecurringRule`, un `Account`, un `BudgetLine`. Il porte une liste de `ScenarioSurcharge` ordonnées, qui sont appliquées à une copie en mémoire du modèle au moment de projeter.

Conséquence directe : on peut en ouvrir un, tout casser dedans, et fermer l'onglet sans rien avoir abîmé. C'est ce qui rend l'outil utilisable — un simulateur dont on n'est pas sûr qu'il soit sans effet ne sert à rien.

### 6.2 Les trois sorties, obligatoires

Tout écran de scénario porte exactement trois actions, toujours visibles, jamais dans un menu :

| Action | Effet |
|---|---|
| **Réinitialiser** | vide les surcharges, on revient au modèle réel ; le scénario existe toujours, vide |
| **Enregistrer comme plan** | persiste le `Scenario` et ses surcharges, réouvrable plus tard, comparable ; **ne touche toujours aucune donnée réelle** |
| **Fermer sans enregistrer** | jette tout ; confirmation seulement s'il y a des surcharges non enregistrées |

« Enregistrer comme plan » **n'applique rien**. Un plan enregistré reste une hypothèse. Le seul chemin de l'hypothèse vers le réel est explicite et nommé : « traduire en budget » (§5.7), ou la création manuelle des règles correspondantes.

### 6.3 Comment une surcharge s'applique

```ts
type ModeleReel = {
  comptes: Compte[];
  regles: RecurringRule[];
  occurrences: ExpectedOccurrence[];
  evenements: PlannedEvent[];
  series: Record<SubcategoryId, MontantCents[]>;   // T(s,m) sur la fenêtre
  termes: Record<AccountId, LoanTerm[]>;
  cibles: Target[];
};

type ModeleResolu = ModeleReel & { readonly scenarioId: string | null };

function resoudreModele(reel: ModeleReel, surcharges: ScenarioSurcharge[]): ModeleResolu;

function projeter(modele: ModeleResolu, options: OptionsProjection): Projection;
```

`resoudreModele` applique les surcharges **dans l'ordre de `ScenarioSurcharge.ordre`**, chacune produisant un nouveau modèle. L'ordre compte : « salaire +5 % » puis « salaire +200 $ » n'est pas « salaire +200 $ » puis « +5 % ». L'interface affiche les surcharges dans cet ordre, réordonnables.

Deux propriétés imposées :

- **`resoudreModele` est pure et ne mute pas `reel`.** Elle produit des structures nouvelles pour ce qu'elle modifie et partage le reste par référence. Un test vérifie que `reel` est inchangé après l'appel — c'est l'invariant qui garantit « aucune donnée réelle touchée » au niveau du code, pas seulement de l'intention.
- **Le modèle réel n'est chargé qu'une fois** et sert à toutes les résolutions : le scénario A, le scénario B et la ligne de référence partent du même objet. C'est ce qui rend la comparaison côte à côte instantanée et le curseur fluide.

`projeter` est la fonction de prévision déjà existante, inchangée : elle ne sait pas qu'un scénario existe. C'est voulu — un seul moteur de projection, donc aucune divergence possible entre ce que la prévision dit et ce que le simulateur dit.

### 6.4 Les leviers, par type de surcharge

Chaque `payload` est validé par un schéma Zod à la lecture, parce que c'est du `Json` en base et qu'une colonne Json non validée est une dette garantie.

**`REVENU`** — `cibleId` = `RecurringRule.id` d'un revenu, ou `null` pour un nouveau revenu.
```jsonc
{ "operation": "MULTIPLIER" | "AJOUTER" | "REMPLACER" | "SUPPRIMER",
  "valeurCents": 20000,          // AJOUTER / REMPLACER
  "facteur": 1.05,               // MULTIPLIER
  "aPartirDe": "2027-01-01",     // optionnel : la surcharge ne s'applique qu'après
  "jusqua": "2027-12-31",
  "nouvelle": { "libelle": "Contrat", "cadence": "MENSUEL", "amountCents": 90000,
                "accountId": "…", "dateAncrage": "2027-02-01" } }
```
Couvre : augmentation de salaire, perte d'emploi (`SUPPRIMER` à partir d'une date), revenu d'appoint, prime.

**`DEPENSE_RECURRENTE`** — même forme, `cibleId` = `RecurringRule.id` d'une dépense. Couvre : loyer qui monte, abonnement coupé, nouvelle dépense fixe (garderie, assurance).

**`EVENEMENT`** — `cibleId` = `PlannedEvent.id` ou `null`.
```jsonc
{ "operation": "AJOUTER" | "DEPLACER" | "SUPPRIMER",
  "libelle": "Toiture", "date": "2027-06-15", "amountCents": -1450000,
  "accountId": "…", "subcategoryId": 42 }
```
Couvre : gros achat, voyage, remboursement d'impôt, dépense imprévue.

**`TAUX_RENDEMENT`** — `cibleId` = `Account.id`.
```jsonc
{ "tauxAnnuel": 0.0685, "aPartirDe": "2027-09-01" }
```
Double usage selon le type de compte : rendement sur un PLACEMENT, **taux d'intérêt** sur un CREDIT, une MARGE ou un PRET. C'est le levier « et si ma marge passait à 8,5 % ? » et « et si je renouvelle à 5,60 % ? » — dans ce dernier cas, il équivaut à un `LoanTerm` hypothétique, sans écrire de `LoanTerm`.

**`SOLDE_INITIAL`** — `cibleId` = `Account.id`.
```jsonc
{ "soldeCents": 1500000, "date": "2026-10-01" }
```
Point de départ hypothétique : héritage, vente d'un actif, transfert entre comptes, « et si j'avais 15 000 $ dans le compte ».

**`PAIEMENT_DETTE`** — `cibleId` = `Account.id` d'une dette.
```jsonc
{ "paiementCents": 200000, "cadence": "BIHEBDO",
  "versementPonctuelCents": 1000000, "versementPonctuelDate": "2027-03-01",
  "aPartirDe": "2026-11-01" }
```
Couvre : passer au paiement accéléré aux deux semaines, augmenter la mensualité, appliquer un remboursement anticipé. C'est le levier qui alimente le §2.3 et le planificateur du §5.

**`CIBLE_ENVELOPPE`** — `cibleId` = `Target.id` ou `categoryId`.
```jsonc
{ "montantCents": 55000, "mois": "2027-01" }
```
**Cas particulier, à traiter comme tel** : c'est le seul type qui touche le budget. Il **n'entre pas** dans la projection de trésorerie — la cloison du §1 vaut aussi à l'intérieur d'un scénario. Il alimente uniquement la vue « écart budget ↔ prévision » : « si je ramène l'épicerie à 550 $, l'écart avec la prévision passe de 84 $ à 134 $ par mois ». Un scénario qui ne contient que des `CIBLE_ENVELOPPE` ne change pas d'un cent la courbe de trésorerie, et l'interface le dit plutôt que d'afficher deux courbes identiques.

### 6.5 Comparer deux scénarios

Deux scénarios sélectionnés, un seul écran :

- **Un graphe, deux séries** — la courbe de trésorerie de A et celle de B, plus la **ligne de référence** (le réel sans scénario) en gris pointillé. Trois lignes maximum : au-delà, ça ne se lit plus.
- **Un tableau d'écarts chiffrés aux échéances qui comptent**, pas à intervalle régulier. Les échéances qui comptent sont : le premier creux de chaque courbe, la fin de chaque année d'horizon, la date de libération de dette de chacune, et toute date où une courbe franchit un `seuilSecurite`.

| Échéance | Référence | A — accéléré | B — surplus sur la Visa | Écart A↔B |
|---|---|---|---|---|
| Creux de trésorerie | 340 $ (27 nov 2026) | 190 $ (27 nov) | 610 $ (27 nov) | −420 $ |
| 31 déc 2027 | 8 900 $ | 6 100 $ | 9 800 $ | −3 700 $ |
| Libération des cartes | août 2030 | août 2030 | **janv. 2029** | 19 mois |
| Fin de l'hypothèque | mai 2051 | **juil. 2047** | mai 2051 | 46 mois |

Et une phrase de synthèse, générée : « A rembourse la maison 3 ans 10 mois plus tôt ; B libère les cartes 19 mois plus tôt et garde 420 $ de plus au creux de novembre. »

### 6.6 Hors périmètre, et pourquoi

| Écarté | Raison |
|---|---|
| **Projection à 40 ans** | l'estimation des dépenses variables repose sur une fenêtre de 6 mois ; l'extrapoler à 40 ans produit un chiffre précis et faux. L'horizon reste 12 mois par défaut, et l'échéancier de prêt va jusqu'à la fin du prêt — parce que lui, il est déterministe. Ce n'est pas la même chose et il ne faut pas les confondre sur le même écran. |
| **Fiscalité de retraite** | REER, CELI, RRQ, PSV, fractionnement, récupération : c'est un domaine entier, avec des paramètres qui changent chaque année et des règles fédérales et provinciales distinctes. Une approximation ici serait dangereuse plutôt qu'utile. Le suivi des droits de cotisation, lui, est prévu — dans le document patrimoine, pas ici. |
| **Monte-Carlo** | simuler 10 000 trajectoires sur 6 points de données donne une fausse précision statistique. La fourchette p25 / médiane / p75 déjà en place dit la même chose honnêtement, et se comprend. |
| **Frise d'événements de vie** | un deuxième enfant, un déménagement, une retraite anticipée : chacun est une combinaison de surcharges, donc rien de nouveau dans le modèle — c'est de l'interface et des gabarits. Reporté après la v2, sans dette technique. |

---

## 7. Où ça vit dans le code

`domain/` ne dépend de rien : ni Prisma, ni Next, ni React, ni l'horloge système. Toute date entre en `DateCivile`, tout montant en cents entiers.

```
src/domain/
  dette/
    types.ts              Dette, LigneEcheancier, LignePlan, ResultatPlan,
                          ParametresTerme, ErreurPret (union typée)
    taux.ts               tauxPeriodique(tauxAnnuel, compositionParAn, paiementsParAn)
                          tauxEffectifAnnuel(i, n)
                          tauxQuotidien(tauxAnnuel)                    // /365
    amortissement.ts      echeancierPret(termes, solde, dateDepart, jusqua, extras?)
                          paiementRequis(capital, i, nbPaiements)
                          soldeApres(capital, i, A, k)                 // forme fermée
                          dureeRestante(solde, i, A)
    cadence.ts            echeancesCadence(dateDebut, paiementsParAn, jusqua) → DateCivile[]
                          paiementSelonCadence(mensualite, cadence, accelere)
    carte-credit.ts       bornesCycle(jourReleve, jourEcheance, mois)
                          interetCycle(soldesQuotidiens, tauxAnnuel)
                          evaluerDelaiGrace(releve, paiements, etatCourant) → { perdu, cyclesRestants }
                          couverturePaiement(soldeReleve, liquiditesProjetees)
    plan.ts               simulerPlanDette(dettes, strategie, mensualite, ponctuel?)
                          ordonnerDettes(dettes, strategie)
                          comparerStrategies(dettes, mensualite) → ComparaisonStrategies
                          planVersCibles(resultat, mois) → Target[]     // « traduire en budget »
    index.ts              surface publique ; seul point d'import depuis features/

  scenario/
    types.ts              ModeleReel, ModeleResolu, ScenarioResolu, OptionsProjection
    payloads.ts           un schéma Zod par TypeSurcharge + parserPayload(type, json)
                          → discriminated union ; aucun Json n'entre sans validation
    resolution.ts         resoudreModele(reel, surcharges)
                          appliquerSurcharge(modele, surcharge)          // pure, immuable
    comparaison.ts        comparerScenarios(a, b, reference) → Comparaison
                          echeancesRemarquables(projections) → DateCivile[]
                          synthese(comparaison) → string                 // la phrase du §6.5
    index.ts
```

Autour, sans logique métier :

- `server/repositories/loan.ts`, `debtPlan.ts`, `scenario.ts` — le seul endroit qui parle à Prisma, et le seul qui convertit `DateCivile` ↔ `Date`.
- `features/dettes/` — fiche de prêt, fiche de carte, planificateur ; importe `domain/dette` directement **côté client** (c'est ce qui rend le curseur du §5.5 possible).
- `features/scenarios/` — éditeur de surcharges, comparateur.

Aucun fichier de `domain/` n'importe quoi que ce soit de `server/`, `app/`, `features/` ou `@prisma/client`. Une règle ESLint `no-restricted-imports` sur `src/domain/**` le fait respecter, plutôt que la discipline.

---

## 8. Les invariants à tester

**Amortissement**
1. Σ `capitalCents` de l'échéancier complet = capital initial, au cent.
2. `soldeApres` de la dernière ligne = 0 exactement ; le dernier paiement est un résidu.
3. `paiementCents` calculé = valeur connue (320 000 $ / 4,79 % / semestriel / 25 ans → 1 823,07 $).
4. Changer `compositionParAn` change le paiement ; il n'est jamais ignoré.
5. Ajouter un `LoanTerm` postérieur ne modifie **aucune** ligne antérieure à son `moisEffectif`.
6. Accéléré aux deux semaines : 26 échéances par année calendaire, durée strictement inférieure au mensuel équivalent.
7. Un échéancier traversant le 29 février est correct ; une cadence ancrée le 31 tombe le dernier jour des mois courts.
8. Paiement < intérêt périodique → `PaiementInsuffisant`, jamais de boucle.
9. `jusqua` borne toujours la sortie, y compris sur un prêt qui ne s'amortit pas.

**Carte de crédit**
10. Relevé payé en entier avant l'échéance → intérêt = 0, `perdDelaiDeGrace` = faux.
11. Un cent de moins que le solde du relevé → `perdDelaiDeGrace` = vrai, et l'intérêt court depuis la date de transaction de chaque achat.
12. Le délai de grâce ne revient qu'après le nombre de cycles complets paramétré.
13. Une avance de fonds porte intérêt dès le jour 0, même si le relevé est payé en entier.
14. L'intérêt projeté d'un cycle est une `ExpectedOccurrence` unique, rapprochable, et jamais une `Transaction`.
15. `jourReleve = 31` tombe le 28 ou 29 février.

**Planificateur**
16. Σ des paiements d'un mois = `mensualiteTotaleCents` tant qu'au moins une dette reste, sauf au dernier mois.
17. La mensualité totale ne baisse jamais quand une dette est soldée ; le minimum libéré passe au surplus.
18. Une dette soldée ne reçoit plus rien et n'apparaît plus dans l'échéancier.
19. Aucun versement ne dépasse le solde + intérêt du mois.
20. AVALANCHE produit des `interetsTotauxCents` ≤ ceux de BOULE_DE_NEIGE, sur tout jeu de dettes.
21. Les deux stratégies donnent le même ordre quand taux et soldes sont co-monotones, et un ordre différent sinon.
22. `mensualiteTotaleCents < Σ minimums` → plan infaisable signalé, aucun échéancier produit.
23. Le tri est déterministe : deux dettes de même taux et même solde sortent toujours dans le même ordre.
24. `comparaisonMinimums` est toujours renseignée, et jamais meilleure que le plan.
25. `planVersCibles` n'écrit que des `Target` ; aucune autre entité n'est touchée.

**Scénarios**
26. `resoudreModele(reel, surcharges)` laisse `reel` structurellement inchangé (comparaison profonde avant/après).
27. `resoudreModele(reel, [])` produit une projection identique à celle du modèle réel, au cent.
28. Deux surcharges sur la même cible s'appliquent dans l'ordre de `ordre` ; inverser l'ordre change le résultat quand les opérations ne commutent pas.
29. Une surcharge `CIBLE_ENVELOPPE` seule ne modifie **aucun** point de la courbe de trésorerie.
30. Aucun chemin du module scénario n'écrit en base, sauf la persistance du `Scenario` lui-même et de ses `ScenarioSurcharge`.
31. Un `payload` malformé est rejeté à la lecture par son schéma Zod, avec le type de surcharge en cause, et n'atteint jamais le moteur.
32. Fermer un scénario sans enregistrer laisse la base identique, octet pour octet.

**Transverses**
33. Aucun montant non entier ne traverse le domaine ; aucun arrondi flottant n'est conservé entre deux périodes.
34. Aucun objet `Date` dans `src/domain/` — vérifié par une règle de lint, pas par relecture.
35. Un paiement de carte reste un virement : paire symétrique liée, exclue du budget des deux côtés, dans le réel comme dans le résolu.
