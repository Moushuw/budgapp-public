# BudgApp — ingestion, récurrences et soldes

Conception du cœur technique : comment les transactions entrent, comment on évite les doublons, comment une transaction est **liée** à une récurrence, et comment le solde se réconcilie.

> Les extraits Prisma de ce document sont des **illustrations partielles**. Le schéma qui fait foi est celui de `docs/lot-m0.md` §2.3.

---

## 1. Un seul pipeline, trois portes d'entrée

Le copier-coller, l'import de fichier et l'agrégateur bancaire ne sont pas trois fonctionnalités : c'est **une** chaîne de traitement avec trois adaptateurs en entrée.

```
Source ──► RawEntry[] ──► Normalisation ──► Dédoublonnage ──► Rapprochement
                                                                  │
                                            Catégorisation ◄──────┘
                                                  │
                                            Revue humaine ──► Persistance
```

Chaque adaptateur produit le même objet :

```ts
type RawEntry = {
  date: string;            // AAAA-MM-JJ
  description: string;     // brute, telle que la source la donne
  amountCents: number;     // signé
  accountRef: string;
  externalId?: string;     // identifiant stable de la source, si elle en a un
  etat?: "EN_ATTENTE" | "COMPTABILISEE";
  brut: unknown;           // la ligne d'origine, conservée pour le débogage
};
```

Ce que chaque source fournit réellement — et c'est ce qui dicte le modèle :

| | Copier-coller | Fichier (CSV / OFX) | Agrégateur |
|---|---|---|---|
| Identifiant stable | non | parfois (`FITID` en OFX) | **oui** |
| État en attente / comptabilisée | non | rarement | **oui** |
| Révision après coup (date ou montant qui changent) | non | non | **oui** |
| Solde du compte | non | parfois | **oui** |
| Fenêtres qui se chevauchent | à la main | à la main | **systématique** |

**Conséquence à assumer dès maintenant** : même si seul le copier-coller existe au premier lot, le modèle doit porter `externalId`, `etat` et la révision d'une transaction existante dès le départ. Sinon le jour où l'agrégateur arrive, il faut une migration et une reprise d'historique.

---

## 2. Dédoublonnage en couches

Trois niveaux, du plus fort au plus faible :

**1. `externalId`** — quand la source en fournit un, il fait autorité. Une ligne déjà vue est mise à jour, pas recréée. C'est ce qui rend l'agrégateur idempotent alors qu'il renvoie sans cesse des fenêtres qui se chevauchent.

**2. Empreinte** — `hash(accountId, date, amountCents, descriptionNormalisee)`, unique en base. Bloque le ré-import du même relevé.

**3. Quasi-doublon** — même compte, même montant, ± 3 jours, même description normalisée. **Signalé, jamais rejeté** : deux cafés au même endroit dans la semaine, c'est légitime. La revue d'import l'affiche, tu tranches.

**La règle d'adoption**, qui compte pour la suite : si une ligne venue de l'agrégateur correspond par empreinte à une transaction déjà collée ou saisie à la main, on **adopte** son `externalId` sur la ligne existante au lieu d'en créer une seconde. C'est ce qui permettra de basculer sur l'agrégateur sans nettoyer l'historique à la main.

---

## 3. La description normalisée

Colonne `descriptionNormalisee`, calculée une fois à l'ingestion et stockée à côté de la description brute (qui n'est jamais modifiée) :

- majuscules, accents retirés
- numéros de succursale, de terminal, dates internes et montants retirés
- espaces multiples réduits

```
IGA VALBRUME #8412            →  IGA VALBRUME
PETRO-CANADA 07421 VALBRUME   →  PETRO-CANADA
AMZN Mktp CA*2K4LM9             →  AMZN MKTP CA
```

Elle sert à trois choses à la fois : le dédoublonnage, la catégorisation, et la détection des récurrences. Indexée.

---

## 4. Récurrences : détecter, proposer, lier

### 4.1 Le point qui compte : détection et liaison sont deux choses séparées

- **La détection est floue** : elle regarde l'historique, repère des motifs, et *propose*.
- **La liaison est explicite** : c'est une clé étrangère stockée, datée, réversible, avec sa provenance. Ce n'est **jamais** une ressemblance réévaluée à la lecture.

Autrement dit : rien ne « tombe dans » une récurrence parce que ça y ressemble. Une transaction est liée à une occurrence précise, ou elle ne l'est pas.

### 4.2 La détection — repérer une récurrence dans l'historique

Sur l'historique d'un compte :

1. grouper par (`accountId`, `descriptionNormalisee`), garder les groupes d'au moins **3** occurrences ;
2. calculer les intervalles entre dates consécutives, en prendre la médiane, la comparer aux cadences connues — 7, 14, 30/31, 61, 91, 182, 365 jours — avec une tolérance de ± 2 jours (hebdomadaire, bihebdomadaire), ± 3 jours (mensuel), ± 5 jours (trimestriel et au-delà) ;
3. **régularité** = écart-type des intervalles ÷ médiane. Sous 0,15, c'est régulier ;
4. **stabilité du montant** = écart-type ÷ médiane. Sous 0,05 la récurrence est **FIXE**, au-dessus elle est **VARIABLE** ;
5. **score de confiance** = fonction du nombre d'occurrences, de la régularité et de la stabilité.

Au-delà d'un seuil, l'application propose, en une phrase lisible :

> « Netflix — 17,99 $, tous les mois vers le 12. 7 occurrences depuis février. En faire une récurrence ? »

Jamais de création automatique. La proposition vit dans un onglet *Récurrences* de l'écran Transactions, avec les suggestions en attente.

*(Si les descriptions varient légèrement d'une fois à l'autre, PostgreSQL permet un regroupement par similarité avec `pg_trgm` plutôt qu'une égalité stricte — l'extension est créée par le conteneur, voir `docs/lot-m0.md` §1.)*

### 4.3 Ce que la confirmation crée

Confirmer une suggestion produit **deux** choses :

1. une `RecurringRule` avec sa **signature de rapprochement** — motif de description, montant attendu et sa tolérance, jour de cycle et sa fenêtre ;
2. la **liaison rétroactive** : chaque transaction du groupe reçoit son `ExpectedOccurrence`, en état RÉALISÉE, avec `liaison = RETROACTIVE`.

L'historique devient cohérent immédiatement, et la prévision peut s'appuyer dessus dès la confirmation.

### 4.4 La liaison à l'import — trois états, et un seul est automatique

Pour chaque ligne entrante, on cherche les occurrences en état PRÉVUE du même compte :

| État | Condition | Ce qui se passe |
|---|---|---|
| **Rapprochée automatiquement** | exactement **un** candidat, et les trois critères passent : montant dans la tolérance, date dans la fenêtre, description conforme à la signature | liaison créée avec `liaison = AUTO`, **affichée dans la revue avec un bouton pour la défaire** |
| **À confirmer** | plusieurs candidats, ou un candidat qui échoue sur un critère | l'application ne tranche pas : elle montre la ligne, l'occurrence pressentie, et **ce qui cloche** (« montant de 24,99 $ au lieu de 17,99 $ attendu ») |
| **Non rapprochée** | aucun candidat | transaction ordinaire |

Rien n'est écrit en base tant que la revue d'import n'est pas validée. Aucune ligne ne rejoint une récurrence sans être passée sous tes yeux.

### 4.5 Ce qu'est la liaison, concrètement

Une clé étrangère **unique** `ExpectedOccurrence.transactionId`, plus `liaison` (`AUTO` | `MANUELLE` | `RETROACTIVE`) et `lieeLe`. Une transaction par occurrence, une occurrence par transaction — la contrainte d'unicité l'impose en base, pas seulement dans le code.

Délier est un clic : l'occurrence repasse en PRÉVUE, la transaction redevient ordinaire. Aucun recalcul implicite ne peut créer, défaire ou refaire un lien : seul un geste explicite le fait.

### 4.6 Occurrence en retard

Une occurrence PRÉVUE dont l'échéance est dépassée au-delà de sa fenêtre passe en **MANQUÉE** et remonte dans une liste « paiements attendus non vus ». Trois issues : rapprocher à la main une transaction existante, ignorer cette occurrence-là, ou corriger la règle.

---

## 5. Soldes et réconciliation

### 5.1 Le relevé de solde est un point d'ancrage, pas un champ

`BalanceStatement { accountId, date, soldeCents, source }` où `source` vaut `MANUEL`, `RELEVE` ou `AGREGATEUR`. Tu en saisis un quand tu veux, depuis la fiche du compte.

Ce n'est pas un champ modifiable sur le compte : c'est un **fait daté, conservé**. Le solde à une date donnée se calcule comme :

```
solde(date) = dernier ancrage antérieur + Σ transactions entre l'ancrage et la date
```

### 5.2 Quand le solde déclaré ne colle pas au solde calculé

À la saisie d'un ancrage : `écart = soldeDéclaré − soldeCalculé`. Si l'écart n'est pas nul, on ouvre une **réconciliation** qui propose des explications, dans cet ordre de probabilité :

1. **Période non couverte** — le dernier import s'arrête au 5 et l'ancrage est daté du 20. L'écart est normal : il manque des transactions. C'est le cas le plus fréquent, et il se détecte tout seul en comparant la date de l'ancrage à la couverture du dernier import.
2. **Transactions en attente** — achats par carte autorisés mais non comptabilisés. Visible dès que l'agrégateur les fournit.
3. **Doublon** — une transaction comptée deux fois : on affiche les quasi-doublons de la période.
4. **Ligne jamais reconnue** — une ligne du relevé écartée par le parser, qui attend dans le panneau des non reconnues.
5. **Montant erroné** — saisie manuelle ou arrondi.

### 5.3 L'ajustement, plutôt que la retouche silencieuse

Si l'écart reste inexpliqué, **on ne modifie pas le passé**. On crée une transaction d'**ajustement**, datée, dans une sous-catégorie système « Ajustement de solde », du montant de l'écart. Le solde recolle et l'historique dit honnêtement qu'un ajustement a eu lieu.

Un ajustement fréquent ou important devient alors un symptôme visible — c'est le signe qu'une source de données est incomplète — au lieu d'une erreur qui se dissout dans les chiffres.

### 5.4 Avec l'agrégateur

L'agrégateur fournit le solde à chaque synchronisation : un ancrage `AGREGATEUR` automatique par jour. La réconciliation devient continue, et un écart se détecte en heures au lieu de plusieurs mois. Le mécanisme manuel reste : il sert avant l'agrégateur, et après lui pour les comptes qu'il ne couvre pas.

---

## 6. Ce que ça ajoute au schéma

Extrait illustratif — le schéma complet et à jour est dans `docs/lot-m0.md` §2.3.

```prisma
model Transaction {
  // … champs du modèle principal
  descriptionNormalisee String
  externalId            String?
  source                SourceIngestion
  etat                  EtatTransaction @default(COMPTABILISEE)
  empreinte             String

  @@unique([empreinte])
  @@unique([accountId, externalId])
  @@index([accountId, descriptionNormalisee])
  @@index([accountId, date])
}

model ExpectedOccurrence {
  // … champs du modèle de prévision
  liaison       TypeLiaison?
  lieeLe        DateTime?
  transactionId String?  @unique      // la liaison : explicite, unique, réversible
}

model RecurringRule {
  // … champs du modèle de prévision
  motifRapprochement String?          // signature apprise depuis les occurrences confirmées
  toleranceCents     Int @default(500)
  toleranceJours     Int @default(4)
  scoreConfiance     Float?           // renseigné quand la règle vient d'une détection
}

model RecurrenceSuggestion {
  motif              String   // descriptionNormalisee du groupe
  cadence            Cadence
  montantMedianCents Int
  nbOccurrences      Int
  regularite         Float
  stabilite          Float
  score              Float
  transactionIds     String[] // le groupe repéré
  etat               EtatSuggestion @default(EN_ATTENTE)
}

model BalanceStatement {
  accountId   String
  date        DateTime     @db.Date
  soldeCents  Int
  source      SourceSolde
  @@unique([accountId, date, source])
}

model Reconciliation {
  accountId      String
  statementId    String   @unique
  ecartCents     Int
  explication    String?
  ajustementTxId String?  @unique
  regleeLe       DateTime?
}
```

---

## 7. Les trois principes à ne pas perdre de vue

1. **Une source de données ne décide jamais à ta place.** Elle propose ; la revue tranche. Ça vaut pour la catégorisation, pour les doublons, et pour le rapprochement des récurrences.
2. **Un lien est un fait stocké, pas une ressemblance recalculée.** Si demain la règle change, les liaisons passées ne bougent pas.
3. **Rien ne disparaît en silence.** Ligne non reconnue, doublon écarté, écart de solde, événement d'agenda sans montant : tout atterrit dans une liste visible où quelque chose peut être fait.
