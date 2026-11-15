# Référentiel fonctionnel — YNAB, Quicken, Monarch

*Établi le 13 septembre 2026, à partir de la documentation officielle des trois produits (support YNAB + spécification OpenAPI v1.86.0, help.quicken.com + help.simplifi.quicken.com, help.monarch.com).*

Document de référence pour le périmètre de BudgApp. Organisé **par domaine fonctionnel**, pas par produit : la question n'est pas « que fait YNAB », c'est « comment chacun résout ce problème, et lequel BudgApp reprend ».

**Colonne verdict** — ● à spécifier pour la v2 · ◐ prévu, mais après la v2 · ○ hors périmètre assumé

Le verdict de chaque ligne a été arrêté individuellement le 13 septembre, sur les 130 fonctionnalités.

---

## 1. Comptes et soldes

| Fonctionnalité | YNAB | Quicken | Monarch | BudgApp |
|---|---|---|---|---|
| Types de comptes | 13 types dont marge, hypothèque, prêt auto, prêt étudiant | chèque, épargne, carte, courtage, HSA, actif, passif, prêt | dépôt, carte, prêt, placement, immobilier, véhicule, crypto | ● chèque, épargne, carte, marge, prêt, placement, actif, passif |
| Distinction **budgétaire / suivi** | `on_budget` explicite : un compte de suivi porte un solde mais ses transactions ne sont pas catégorisées | implicite | implicite | ● **champ explicite.** C'est ce qui permet d'avoir REER et CELIAPP dans la valeur nette sans polluer le budget |
| Solde d'ouverture daté | oui | oui | oui | ● |
| Soldes séparés rapproché / non rapproché | invariant `solde = rapproché + non rapproché` | `uncleared / C / R` | `pending / posted` | ● indispensable au rapprochement |
| Limite de crédit et taux d'utilisation | non suivie | limite + alerte d'approche | limite + barre + pointage de crédit | ● limite et taux ; ○ pointage (pas d'équivalent canadien accessible) |
| Taux et mensualité **datés par mois** | dictionnaires `{mois → valeur}` | termes révisables | APR par compte | ● **série temporelle, pas un champ.** Un renouvellement hypothécaire ne doit pas réécrire le passé |
| Seuil de sécurité par compte | — | oui | — | ● déclenche l'alerte de liquidité |
| Fermeture sans perte d'historique | solde obligatoirement nul, reste aux rapports | idem | archivage | ● |
| Ordre et regroupement | — | oui | glisser-déposer | ● |
| Valorisation automatique d'un actif | — | Kelley Blue Book | Zillow, Vinaudit | ○ aucune couverture québécoise fiable — ancrage manuel daté |
| Multidevise | **non** | oui (Windows) | très limité | ○ hors v2, mais rien ne doit l'interdire |

**À retenir.** La distinction *compte budgétaire / compte de suivi* est le mécanisme qui permet d'avoir REER, CELI, CELIAPP et la maison dans la valeur nette sans qu'une cotisation apparaisse comme une dépense. C'est un booléen, et il règle tout le problème.

---

## 2. Ingestion des transactions

| Fonctionnalité | YNAB | Quicken | Monarch | BudgApp |
|---|---|---|---|---|
| Agrégateur bancaire | direct, couverture CA solide | Direct Connect, Express Web Connect, Web Connect | Plaid + MX + Mastercard Data Connect | ◐ cible finale, pas la v2 — mais le schéma la prévoit |
| Import fichier | CSV, OFX, QFX | QFX, OFX, QIF, CSV | CSV web seulement | ● CSV et OFX/QFX ; ● copier-coller conservé |
| Catégorie importable du fichier | **jamais** | oui | oui | ● oui, mais comme *proposition* soumise à la revue |
| **Déduplication** | `import_id` déterministe `YNAB:{milliunits}:{date}:{n}` | `FITID` de l'OFX | 4 stratégies au choix | ● **trois couches** : `externalId` > empreinte > quasi-doublon signalé |
| Import annulable | — | — | **non** (plainte connue) | ● la revue d'import *est* l'annulation : rien n'est écrit avant validation |
| Ligne non reconnue | — | — | colonnes inconnues ignorées en silence | ● **panneau dédié, saisissable à la main.** Aucun des trois ne le fait |
| Révision d'une transaction déjà importée | l'agrégateur corrige date ou montant | statut `Updated` | éditions préservées au passage en *posted* | ● prévu dès le schéma |
| Adoption d'identifiant externe | — | — | — | ● une ligne déjà collée adopte l'identifiant de l'agrégateur au lieu de créer un doublon |
| Export CSV | oui | PDF, CSV, tableur | CSV + PNG | ● avec respect des filtres |
| Reçus par courriel avec extraction | — | — | oui | ○ |

---

## 3. Catégorisation automatique

### 3.1 Les trois approches

**YNAB — mémoire par bénéficiaire, sans règles.** Pas de moteur de règles du tout. Depuis le 31 août 2026, la règle est « **2 sur 3** » : la catégorie par défaut d'un bénéficiaire ne change que si **deux des trois dernières catégorisations** s'accordent sur une nouvelle. Séparément, des règles de renommage normalisent le libellé brut ; trois champs sont conservés sur chaque transaction (brut, avant règles, final).

**Quicken Classic — chaîne à trois étages.** Pour le nom : règles de renommage → base de marchands Quicken → nom brut. Pour la catégorie : bénéficiaire mémorisé (recherche sur **12 mois**, reprend catégorie *et* ventilation) → code marchand MCC → moteur qui apprend des corrections. Les règles n'acceptent que deux conditions et **ne réécrivent jamais le passé**.

**Simplifi et Monarch — vrai moteur de règles.**

| | Simplifi | Monarch |
|---|---|---|
| Conditions | libellé brut ou normalisé, compte, montant (opérateur ou intervalle) | libellé brut, marchand, montant, catégories, comptes, membre |
| Combinaison | multiples depuis 2026 | **ET** entre toutes |
| Ordre | — | séquentiel, réordonnable |
| Actions | renommer, catégoriser, étiqueter, noter, exclure des rapports, exclure du plan, marquer revu | + masquer, lier à un objectif, **ventiler** |
| Rétroactif | oui, **avec aperçu de l'impact** | oui, case « appliquer aux N existantes » |
| Limite | une seule règle de catégorie par bénéficiaire | pas d'annulation |

### 3.2 Verdict

| Élément | Verdict |
|---|---|
| Description normalisée stockée à côté du brut | ● sert au dédoublonnage, aux règles **et** à la détection de récurrences |
| Mots-clés → sous-catégorie (l'existant du v1) | ● conservé, comme **cas particulier** d'un moteur de règles |
| Moteur de règles ordonné, conditions en ET | ● libellé, montant (opérateur + intervalle), compte, sens |
| Actions d'une règle | ● renommer, catégoriser, étiqueter, noter, exclure du budget, exclure des rapports, marquer à revoir |
| Ventilation automatique par règle | ● |
| Application rétroactive **avec aperçu** | ● l'aperçu est ce qui rend la fonction utilisable sans crainte |
| Trace de la règle appliquée | ● savoir *pourquoi* une transaction porte cette catégorie, et défaire |
| Conflit **non tranché**, signalé | ● aucun des trois ne le fait, et c'est plus honnête |
| Mémoire par bénéficiaire, règle « 2 sur 3 » | ● meilleure que « le dernier gagne », trois lignes de code |
| Créer une règle depuis une transaction | ● |
| Fusion et renommage global de bénéficiaires | ● |
| Liste « ne jamais renommer » | ● |
| Catégorisation par IA | ◐ |

---

## 4. La transaction

| Fonctionnalité | Le marché | BudgApp |
|---|---|---|
| **Écran des transactions enregistrées** | tous | ● le manque le plus important du v1 : aujourd'hui une transaction sauvegardée n'est plus consultable sans Prisma Studio |
| **Ventilation** | YNAB : sous-transactions · Monarch : chaque ligne devient une transaction | ● modèle Monarch — ligne fille = transaction avec un parent, invariant garanti en base |
| **Virement** | YNAB : paire symétrique liée par bénéficiaire système | ● **paire symétrique liée.** Chaque registre reste cohérent isolément. C'est ce qui règle le paiement de carte, la cotisation REER et le virement d'épargne d'un seul mécanisme |
| Trois états de rapprochement | YNAB et Quicken oui, Simplifi non (sa lacune la plus citée) | ● |
| File « à revoir » | YNAB, Monarch | ● ne bloque pas les soldes |
| Étiquettes multiples | Quicken, Monarch | ● transverses aux catégories |
| Note libre | tous | ● sur la transaction et chaque ligne de ventilation |
| Édition en masse | Quicken, Monarch (YNAB faible) | ● |
| Exclure du budget / des rapports | Quicken, Monarch | ● deux exclusions distinctes, jamais du solde |
| Drapeaux colorés nommés | YNAB | ◐ |
| Pièces jointes | tous | ◐ |
| Journal des modifications | Monarch | ◐ |

---

## 5. Rapprochement et réconciliation

**Quicken Classic est le seul des trois à le faire complètement**, et c'est le modèle à copier.

Chaque ligne entrante reçoit un statut — **nouvelle**, **appariée**, **correspondance approchante**, **mise à jour**, **annulée** — avec ses actions propres. YNAB fait la même chose en plus simple : compte + montant identique + date proche, les deux enregistrements fusionnent, `matched_transaction_id` pointe vers l'autre côté. Depuis août 2026, le paiement sortant du compte chèque et l'entrée vue sur la carte sont automatiquement fusionnés en un seul virement.

La réconciliation d'un relevé chez Quicken :
```
Solde rapproché = solde d'ouverture + Σ crédits cochés − Σ débits cochés
Écart           = solde du relevé − solde rapproché
```
Sortie : *Terminer plus tard* (conserve les coches) ou *Terminer* avec création d'une **transaction d'ajustement** datée et catégorisée. **Simplifi n'a rien de tout ça** — seulement une case « revu ».

| Élément | BudgApp |
|---|---|
| Statut de chaque ligne entrante | ● |
| Appariement, avec bouton pour défaire | ● |
| Appariement avec une **occurrence attendue** de récurrence | ● zéro doublon, catégorie héritée |
| Dire ce qui cloche quand l'appariement échoue | ● « montant de 24,99 $ au lieu de 17,99 $ attendu » plutôt qu'un refus muet |
| Écran de réconciliation avec compteur d'écart en direct | ● |
| Ancrage de solde comme **fait daté conservé** | ● meilleur que Quicken sur ce point |
| Liste ordonnée des causes probables d'un écart | ● personne ne le propose, et ça transforme un écart frustrant en diagnostic |
| Transaction d'ajustement plutôt que retouche du passé | ● |
| Fusion automatique d'un paiement de carte | ● |

---

## 6. Récurrences et échéances

**YNAB** — 13 fréquences, affichées en gris dans le registre avec solde projeté. **Une occurrence future n'a aucun effet sur le budget**, règle dure.
**Quicken** — rappels avec montant **fixe ou estimé**, ventilation, saisie automatique ou rappel avec jours d'avance. Statuts : à venir, bientôt dû, dû, payé, en retard. **Calendrier financier** jour par jour avec soldes réels au passé et projetés au futur.
**Simplifi et Monarch** — détection automatique, proposition à confirmer. Monarch code le statut en couleur, dont **jaune = payé à un montant différent**.

| Élément | Verdict |
|---|---|
| Une règle **ne crée pas de transactions**, elle crée des *occurrences attendues* | ● c'est ce qui évite le doublon avec le relevé |
| Détection automatique avec score de confiance, **proposition jamais création** | ● |
| Liaison = clé étrangère unique, datée, réversible, **avec sa provenance** | ● aucun des trois ne stocke *pourquoi* une liaison existe |
| Fréquences | ● les 12 de YNAB, dont **aux 2 semaines** (la paie), **2 fois par mois**, **aux 4 semaines**, **aux 4 mois** — qui manquaient |
| Montant **fixe ou estimé** | ● Hydro-Québec est récurrent mais variable |
| Statut à cinq états, dont **réalisée à un montant différent** | ● |
| Liste des paiements attendus non vus | ● |
| Modifier une occurrence sans toucher la série | ● |
| Terminer une série sans perdre l'historique | ● |
| Ventilation sur une règle récurrente | ● le paiement hypothécaire découpé capital / intérêts / assurance |
| Événement ponctuel planifié | ● |
| Calendrier des échéances jour par jour | ● |
| Suivi des remboursements attendus | ● |

---

## 7. Budgétisation — les quatre modèles

### 7.1 YNAB — enveloppes à base zéro stricte

```
disponible(c, m) = report(c, m) + assigné(c, m) + activité(c, m)
PAA(m) = PAA(m-1) + revenus(m) − Σ assigné(c, m) − dépassements comptant(m-1)
```

Report : positif → roule intégralement · négatif payé par débit → la catégorie est remise à zéro et le trou repris sur le *Prêt à assigner* · négatif payé par carte → le négatif reste et roule, parce que la dette a augmenté.

**Mécanique carte de crédit** — créer un compte de carte crée une catégorie « Paiement <carte> », et chaque dépense catégorisée y déplace automatiquement son montant. La catégorie contient alors exactement la part de la dette couverte par du vrai argent.

**Cibles** — 5 types, paramétrées de façon orthogonale : montant × cadence (15 valeurs) × jour × comportement de report. Ce dernier est la distinction capitale : « mettre de côté encore X » (épargne cumulative) contre « recompléter jusqu'à X » (dépense courante).

**Mouvements d'argent** (2026) — chaque déplacement entre enveloppes est une **entité persistante**, groupée par action, ce qui permet l'**annulation groupée**.

### 7.2 Quicken — budget classique avec report configurable

Pré-remplissage depuis l'historique. Budget par catégorie, sous-catégorie ou **groupe**, avec une ligne « tout le reste ». Grille annuelle de 12 mois éditable. **Report par catégorie, trois modes** : aucun · report de tous les soldes (positif et négatif) · report des positifs seulement. Cumul composé, montant reporté éditable à la main.

### 7.3 Simplifi — le plan de dépenses

Six blocs : Revenus · Factures (déduites dès le début du mois) · Dépenses planifiées (montant complet réservé, option « libérer les non dépensés ») · Autres dépenses · Objectifs · **Reste ce mois-ci** avec moyenne journalière. Ne raisonne que sur les transactions du mois, jamais sur les soldes. **Listes de surveillance** transverses sur catégorie, bénéficiaire ou étiquette.

### 7.4 Monarch — deux modes commutables

Par catégorie, ou **flexible** en trois seaux (Fixe / Non mensuel / Flexible) où le seau flexible a un seul montant global. « Reste à budgéter » affiché **sans aucune contrainte** — d'où le reproche de « visibilité passive ». Report par catégorie avec solde de départ et mois de début. Réallocation depuis une pastille de dépassement, **sans annulation** — plainte n°1.

### 7.5 Verdict

| Élément | Verdict |
|---|---|
| Report du disponible, trois modes par sous-catégorie | ● `SIGNE` par défaut |
| Trois colonnes alloué / dépensé / disponible | ● |
| Reste à assigner | ● affiché, **indicatif** |
| Mouvements entre enveloppes | ● |
| Historique des mouvements **avec annulation** | ● la plainte n°1 de Monarch vient de ne pas l'avoir fait |
| Cible paramétrable, montant × cadence × jour | ● |
| Deux modes de cible : recompléter / accumuler | ● |
| « Nécessaire ce mois-ci » calculé | ● |
| Remplissage automatique du mois | ● sans ça, garnir trente enveloppes est décourageant |
| Budget au niveau du groupe | ● |
| Mise en veille d'une cible pour un mois | ● |
| Grille annuelle 12 mois éditable | ● |
| Masquer une catégorie sans la supprimer | ● |
| Listes de surveillance transverses | ● sous forme d'étiquette avec cible mensuelle |
| **Enveloppe de paiement de carte** | ○ **écartée** — le virement suffit à éviter le double comptage. Voir `decision-modele-budget.md` §3 |
| Plusieurs budgets en parallèle | ○ |
| Budget flexible en trois seaux | ○ incompatible avec la rigueur par catégorie retenue |

---

## 8. Objectifs d'épargne

| Fonctionnalité | Le marché | BudgApp |
|---|---|---|
| Modèle | YNAB : une cible sur une catégorie · Quicken : **compte virtuel** · Monarch : entité dédiée | ● entité dédiée, allocation logique. Le compte virtuel de Quicken crée de faux virements dans l'historique |
| Paramètres | montant cible, date cible, contribution — Simplifi calcule le troisième | ● deux des trois suffisent |
| Statut en avance / dans les temps / à risque | Monarch | ● |
| Comptes rattachés, allocation **partielle ou totale** | Monarch | ● « mon CELIAPP *est* ma mise de fonds » |
| Retombée dans le budget | Monarch | ● |
| Bascule « la dépense réduit la progression » | Monarch | ● fonds d'urgence contre achat unique |
| Taux de croissance sur objectif adossé à un placement | Monarch | ● un CELIAPP à 4 % ne se projette pas comme un compte chèque |
| Lier une transaction à un objectif | Monarch | ● |
| Priorisation entre objectifs | aucun ne le fait vraiment | ● |

---

## 9. Dettes et remboursement

**Amortissement.** Quicken supporte les prêts à taux fixe, terme défini, mensualité régulière :
```
r = taux annuel / n           Paiement = P × r / (1 − (1 + r)^(−N))
intérêt_i = r × capital_restant_i     capital_i = paiement − intérêt_i
```
⚠️ **Spécificité canadienne** : une hypothèque canadienne est composée **semestriellement** alors que les paiements sont mensuels ou aux deux semaines. La convention américaine donne un résultat faux. Conversion : `taux_périodique = (1 + taux_annuel/2)^(2/n) − 1`.

**Le planificateur de remboursement (Quicken Windows)** — trois étapes : identifier les dettes, saisir taux et paiement minimum, puis **un montant mensuel total** (pas un montant par dette). Le plan répartit : minimum sur chaque dette, tout le surplus sur la prioritaire. Leviers : curseur de mensualité en direct, versement forfaitaire ponctuel. Sorties : date de libération, graphe comparatif minimums seuls contre plan accéléré, échéancier mois par mois, économie d'intérêts. Trois stratégies — avalanche (défaut), boule de neige, personnalisée — et **à chaque changement d'ordre, le différentiel de date et d'intérêts est affiché**.

**Monarch** fait l'équivalent en plus léger. **Simplifi n'a rien** — demande communautaire de longue date.

| Élément | Verdict |
|---|---|
| Compte de prêt avec échéancier | ● |
| **Convention canadienne de composition** | ● personne ne la gère |
| Paiement ventilé capital / intérêts / assurance | ● |
| Graphique de composition du prêt sur la fiche du compte | ● demandé explicitement : capital remboursé, intérêts payés, reste |
| Planificateur de remboursement | ● |
| Trois stratégies | ● |
| **Différentiel obligatoire à l'affichage** | ● c'est ce qui rend la fonction décisionnelle |
| Curseur de mensualité en direct | ● |
| Versement ponctuel simulé | ● |
| Traduire le plan en lignes de budget | ● |
| Échéancier mois par mois, dette par dette | ● |

---

## 10. Prévision et what-if

**Quicken — soldes projetés** : solde courant + transactions futures saisies + occurrences des rappels, cumulées par date. Point vert = positif, triangle jaune = passage sous zéro. Widget du creux de trésorerie. Le Mac ajoute un **tableau ligne par ligne** sous le graphe.

**Simplifi — trésorerie projetée** : liste fermée de ce qui entre (rappels de factures, d'abonnements, de revenus, transactions futures, remboursements attendus) et de ce qui est **explicitement exclu** (dépenses planifiées du plan, objectifs d'épargne).

> **La règle la plus importante de ce document** : Quicken et Simplifi **n'injectent jamais les enveloppes budgétaires dans la projection de trésorerie**. Ce sont deux horloges différentes. Les mélanger produit du double comptage.

**Le what-if de Quicken** superpose un scénario au plan de référence, avec **trois sorties obligatoires** : réinitialiser, enregistrer comme plan, fermer sans enregistrer. **Monarch** ajoute des scénarios multiples comparables côte à côte et des événements de vie sur une frise.

| Élément | Verdict |
|---|---|
| Projection comme **fonction pure** | ● |
| **Cloison étanche budget / prévision** | ● à écrire noir sur blanc — c'est le piège n°1 |
| Estimateur statistique configurable par poste | ● médiane 6 mois par défaut. Les trois se contentent d'une moyenne |
| Signaler une estimation faible | ● |
| Fourchette p25–p75 sur le total | ● les trois affichent un chiffre exact, ce qui est malhonnête |
| Deux résolutions, mensuelle et quotidienne | ● |
| Alerte de liquidité en phrase datée | ● mieux qu'un triangle jaune |
| Tableau ligne par ligne sous le graphe | ● ce qui rend le graphe actionnable |
| **Écart entre le budget et la prévision** | ● personne ne le fait, et c'est la meilleure idée du projet |
| Scénarios nommés et enregistrables | ● avec les trois sorties |
| Comparer deux scénarios | ● |
| Leviers d'un scénario | ● revenu, dépense récurrente, date, montant ponctuel, taux de rendement |
| Événements de vie sur une frise | ◐ |
| Saisonnalité dans l'estimation | ◐ demande 24 mois d'historique |
| Projection à 40 ans, fiscalité de retraite | ○ |
| Monte-Carlo | ○ |

---

## 11. Rapports

| Rapport | BudgApp |
|---|---|
| Dépenses par catégorie, avec bascule catégorie / sous-catégorie | ● |
| Tendance des dépenses | ● |
| Revenus contre dépenses, avec taux d'épargne | ● |
| Budget contre réel — **et contre la prévision** | ● |
| Descente catégorie → sous-catégorie → transactions | ● |
| Par bénéficiaire | ● YNAB ne l'a pas et s'en fait reprocher |
| Par étiquette | ● |
| Plages de dates dynamiques | ● |
| Rapports enregistrés | ● YNAB ne l'a pas |
| Comparaison entre deux périodes | ● |
| Export CSV et image | ● |
| Diagramme de Sankey | ◐ |
| Export PDF | ◐ |
| Âge de l'argent | ○ métrique critiquée comme instable, y compris chez YNAB |

---

## 12. Placements et valeur nette

Périmètre **léger** : allocation, régimes enregistrés, maison.

| Fonctionnalité | BudgApp |
|---|---|
| Compte de placement comme **compte de suivi** | ● |
| Solde mis à jour manuellement, **historisé et daté** | ● un ancrage suffit |
| Cotisation = **virement** compte budgétaire → compte de suivi | ● traitement correct d'une cotisation REER |
| **Régime fiscal du compte** | ● non enregistré, REER, CELI, CELIAPP, REEE, CRI, FERR |
| **Plafond de cotisation et droits restants** | ● **spécifique au Canada, et personne ne te le donnera.** Aucun des trois ne connaît le CELI |
| Allocation par classe d'actifs | ● saisie à la main, agrégée au portefeuille |
| Valeur nette dans le temps | ● |
| Maison comme actif, hypothèque comme passif, liés | ● |
| Rendement estimé par compte pour la projection | ● |
| Titres, quantités, prix de revient, rendement pondéré | ◐ |
| Cours en temps réel | ○ Monarch ne supporte même pas les titres canadiens |

---

## 13. Fiscalité

Quicken marque une catégorie comme *fiscale* et la mappe à un formulaire et un numéro de ligne. C'est ce seul champ qui alimente tous les rapports fiscaux.

**Hors périmètre, y compris le champ.** ○ sur les trois lignes — décision du 13 septembre. Le champ pourra être ajouté par migration si le besoin apparaît.

---

## 14. Plateforme, alertes, agenda

| Fonctionnalité | BudgApp |
|---|---|
| Tableau de bord d'accueil | ● aujourd'hui la page rend `<div>page</div>` |
| Utilisable au téléphone | ● application web adaptative |
| `ownerId` sur chaque entité racine | ● multi-utilisateur préparé, pas implémenté |
| Alertes | ● liquidité, dépassement, échéance manquée, limite de carte |
| **Flux iCalendar sortant** | ● RFC 5545 — Google, Outlook et Samsung s'y abonnent. Aucun des trois ne le propose |
| **Flux iCalendar entrant** | ● un agenda « Finances » dont chaque événement devient une dépense planifiée |
| Arrondi d'affichage au dollar | ● réglage dans les préférences ; le stockage reste en cents |
| Mode confidentialité | ◐ |
| API publique | ◐ |
| Assistant conversationnel | ◐ |

---

## 15. Ce qu'aucun des trois ne fait

La liste qui définit l'espace où BudgApp peut être meilleur, pas seulement équivalent.

1. **Relier un budget d'enveloppes et une projection statistique.** YNAB refuse par principe de budgéter un revenu futur. Quicken projette mais son budget n'a pas de rigueur. Personne ne dit : « tu as budgété 600 $ d'épicerie, la prévision dit 684 $ ».
2. **Afficher une prévision comme une fourchette.** Les trois affichent un chiffre unique.
3. **Choisir l'estimateur statistique par poste.** Les trois utilisent une moyenne simple. Un mois de Noël ne doit pas fausser durablement l'épicerie.
4. **Ne jamais rien jeter en silence.** Ligne non reconnue, quasi-doublon, écart de solde, événement d'agenda sans montant : chez les trois, ça disparaît.
5. **Stocker *pourquoi* une liaison existe.** Auto, manuelle ou rétroactive, datée, réversible.
6. **Le contexte canadien.** Composition semestrielle des hypothèques, CELI / CELIAPP / REER avec droits de cotisation, relevés Desjardins, format `fr-CA`.
7. **Un flux de calendrier.** Voir ses échéances financières dans l'agenda du téléphone, sans application.
8. **Le conflit de catégorisation non tranché.** Les trois choisissent au hasard ou par ancienneté.

---

## 16. Les neuf idées de conception à voler

1. **Entiers, jamais de flottant.** YNAB stocke en milliunits, Quicken en cents.
2. **Le mois est un agrégat de première classe**, pas un filtre calculé. Stocker `(catégorie, mois) → assigné` en dur, recalculer le reste.
3. **Un mouvement d'argent entre enveloppes est un événement persistant**, pas une mutation. Condition de l'annulation — Monarch ne l'a pas fait et c'est sa plainte n°1.
4. **Les transferts sont des paires symétriques liées**, jamais un champ unique.
5. **Les bénéficiaires de transfert sont des bénéficiaires système** — aucun cas particulier dans l'interface de saisie.
6. **Un identifiant d'import déterministe** déduplique sans état côté client.
7. **Suppression logique partout** + un compteur de version serveur : toute la synchronisation multi-appareil de YNAB en deux idées.
8. **Trois horloges, jamais mélangées** : le registre, les séries récurrentes, le budget. Simplifi exclut explicitement les dépenses planifiées et les objectifs de sa projection — c'est délibéré, pas un oubli.
9. **Le what-if est une surcouche temporaire** avec trois sorties obligatoires. Jamais une modification en place.

---

## Sources

**YNAB** — [spécification OpenAPI v1.86.0](https://github.com/ynab/ynab-sdk-python/blob/main/open_api_spec.yaml) · [cibles](https://support.ynab.com/en_us/how-to-use-targets-rk5kkI9ks) · [dépassement](https://support.ynab.com/en_us/overspending-in-ynab-a-guide-ryWoxEyi) · [dépassement sur carte](https://support.ynab.com/en_us/credit-card-overspending-an-overview-HkMGpSbJs) · [import fichier](https://support.ynab.com/en_us/file-based-import-a-guide-Bkj4Sszyo) · [appariement](https://support.ynab.com/en_us/approving-and-matching-transactions-a-guide-ByYNZaQ1i) · [catégorisation 2/3](https://www.ynab.com/whats-new/categorization-that-matches-your-habits) · [simulateur de prêt](https://www.ynab.com/blog/ynab-loan-planner)

**Quicken** — [soldes projetés](https://info.quicken.com/win/project-your-account-balances-personal) · [plan de réduction de dette](https://info.quicken.com/win/how-do-i-create-a-debt-reduction-plan) · [ordre de remboursement](https://info.quicken.com/win/how-do-i-change-the-debt-reduction-plan-payoff-ord) · [what-if de prêt](https://info.quicken.com/win/how-do-i-use-the-loan-what-if-tool) · [amortissement](https://info.quicken.com/win/what-if-i-need-to-know-how-amortization-is-calcula) · [rapprochement](https://info.quicken.com/win/how-do-i-reconcile-a-spending-account) · [règles de renommage](https://info.quicken.com/win/how-do-i-standardize-payee-names-with-renaming-rul) · [report de budget](https://info.quicken.com/win/what-is-a-budget-rollover) · [calendrier financier](https://info.quicken.com/win/how-do-i-work-with-the-financial-calendar)

**Monarch** — [budget](https://help.monarch.com/hc/en-us/articles/360048883631-Creating-Your-Budget-in-Monarch) · [report](https://help.monarch.com/hc/en-us/articles/4411119762196-Rollover-Budgets) · [règles](https://help.monarch.com/hc/en-us/articles/360048393372-Transaction-Rules) · [transferts et paiements de carte](https://help.monarch.com/hc/en-us/articles/360048393292-Transfers-and-Credit-Card-Payments) · [récurrences](https://help.monarch.com/hc/en-us/articles/4890751141908-Tracking-Recurring-Expenses-and-Bills) · [objectifs 3.0](https://help.monarch.com/hc/en-us/articles/44373110771860-Introducing-Goals-3-0) · [objectifs de remboursement](https://help.monarch.com/hc/en-us/articles/44373293932052-Using-Pay-Down-Goals) · [prévision](https://help.monarch.com/hc/en-us/articles/48344305092244-Forecasting-in-Monarch)
