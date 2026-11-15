# Arbitrages de la passe manuelle M1 — 30 septembre 2026

Source : passe manuelle du critère de sortie (§11 de `docs/lot-m1.md`) faite le 30 septembre dans le navigateur, sur `m1-ingestion` à `d0484ec`, avec un vrai relevé Visa collé depuis AccèsD. Ce fichier est l'entrée du second `/ship` de la passe. Il fait autorité sur les points ci-dessous. Chaque point est à reporter dans `docs/lot-m1.md` et au journal d'`INDEX.md` avant le code.

## A1 — Type d'opération séparé du marchand (§5)

**Constat.** Sur le compte chèque, AccèsD écrit `Achat /CAFE DEPOT`, `Paie /ZORVANE`, etc. La résolution du bénéficiaire compare le début de la description, donc « CAFE DEPOT » n'est jamais reconnu. Les lignes Visa n'ont pas ce préfixe.

**Décision.** Le profil d'import décrit comment séparer le type d'opération du marchand. Le parser sort les deux. Ce n'est pas une liste fermée de préfixes : AccèsD suit la forme `Type /Marchand`. Le profil porte donc un **séparateur** (une donnée), et non une branche de code sur l'institution.

- `ProfilImport` gagne `operation?: { separateur: RegExp }`. Pour `DESJARDINS_ACCESD`, la valeur correspond à la **première** occurrence de ` /` (espace, barre oblique). Tout ce qui précède est `typeOperation`, tout ce qui suit est la description du marchand, débarrassée de ses espaces et d'une barre oblique finale (`Virement Interac à /Odile ferland  /` → `Odile ferland`).
- Une ligne sans séparateur (`Frais fixes d'utilisation`, toutes les lignes Visa, `Paiement.`) a `typeOperation: null` et garde sa description entière.
- La résolution du bénéficiaire, les conditions de règle et l'empreinte utilisent la description **sans** le type d'opération. Aucune vraie donnée n'est en base, donc aucune empreinte n'est à recalculer.
- Types observés sur de vrais relevés chèque de Benjamin, à couvrir en tests : `Achat`, `Paie`, `Paiement`, `Paiement facture - AccèsD Internet`, `Virement - AccèsD Internet`, `Virement Interac à`, `Virement-remboursement`, `Remboursement automatique`.
- Les fixtures `.json` dont la sortie change (au moins `cheque-desjardins.json`) sont réécrites **par le planner, dans la spec, avant le code**, et le diff m'est montré. Le coder n'y touche pas.
- La lecture bloc par bloc (§5.7) reste hors périmètre.

## A2 — Fragments sans date masqués, avec contrôle du total (§5.3, §8.2)

**Constat.** Sur le vrai relevé Visa ci-dessous : 9 transactions reconnues, toutes justes, et 42 « non reconnues ». Ces 42 lignes sont les fragments de blocs (en-têtes, `28 SEP28 Septembre`, catégorie Desjardins, `2 %`, montant seul). Les vrais rejets y sont noyés.

**Décision.**
- Les rejets `AUCUNE_DATE` ne s'affichent plus dans la revue. `MOIS_INCONNU`, `AUCUN_MONTANT` et `MONTANT_ILLISIBLE` restent affichés. Le parser continue de produire `AUCUNE_DATE` : le masquage se fait à l'affichage, et le contrat de `analyserReleve` ne change pas.
- **Garde-fou obligatoire.** Quand le texte collé contient une ligne `Total` avec un montant, la somme des lignes reconnues lui est comparée, avec la même `RegleSigne`. Un écart s'affiche en alerte en haut de la revue, avec les deux montants. Sans ligne `Total`, pas d'alerte et pas de blocage.
- Cas de test : le relevé ci-dessous, à poser en fixture `visa-desjardins-2026-09.txt`. Il est reproduit ici sous forme de chaîne JSON pour que les tabulations passent au caractère près. Le fichier s'écrit avec `JSON.parse` de cette chaîne, jamais par un copier-coller à la main.

```json
"Date\tDescription\tRemises\tMontant\tLien\n28 SEP28 Septembre\tPixelia I09310-5550173\t2 %\t16,50 $\t\n28 Septembre Pixelia I09310-5550173 16,50 $\n28 SEP28 Septembre\t\nLoisirs - Autre\nLibrairie Du Vieux Quai\n0,5 %\t42,80 $\t\n28 Septembre Librairie Du Vieux Quai 42,80 $\n28 SEP28 Septembre\tAppli Contes Audio\t0,5 %\t2,35 $\t\n28 Septembre Appli Contes Audio 2,35 $\n14 SEP14 Septembre\tAppli Series Courtes\t2 %\t14,99 $\t\n14 Septembre Appli Series Courtes 14,99 $\n14 SEP14 Septembre\tPaiement\t\t+8,75 $\t14 Septembre Paiement. +8,75 $\n13 SEP13 Septembre\t\nÉlectronique/Informatique\nNuage Photos Plus\n2 %\t8,75 $\t\n13 Septembre Nuage Photos Plus 8,75 $\n10 SEP10 Septembre\t\nÉlectronique/Informatique\nOutil Redaction Pro\n2 %\t31,20 $\t\n10 Septembre Outil Redaction Pro 31,20 $\n10 SEP10 Septembre\tPaiement\t\t+111,05 $\t10 Septembre Paiement. +111,05 $\n6 SEP6 Septembre\tStockage Nuage Mensuel\t2 %\t2,79 $\t\n6 Septembre Stockage Nuage Mensuel 2,79 $\nTotal\t\t+0,42 $\t\n"
```

Résultat constaté dans l'écran le 30 septembre, année 2026, compte Visa. Les montants sont en cents :

| Date | Description | montantCents |
|---|---|---|
| 2026-09-28 | Pixelia I09310-5550173 | -1650 |
| 2026-09-28 | Librairie Du Vieux Quai | -4280 |
| 2026-09-28 | Appli Contes Audio | -235 |
| 2026-09-14 | Appli Series Courtes | -1499 |
| 2026-09-14 | Paiement. | 875 |
| 2026-09-13 | Nuage Photos Plus | -875 |
| 2026-09-10 | Outil Redaction Pro | -3120 |
| 2026-09-10 | Paiement. | 11105 |
| 2026-09-06 | Stockage Nuage Mensuel | -279 |

Somme : +42 cents. Elle est égale à la ligne `Total +0,42 $`, donc pas d'alerte. Un second cas, avec une ligne reconnue retirée du texte, doit déclencher l'alerte.

## A3 — Opérateur `MOT_ENTIER` pour les conditions de règle (§4.6)

**Constat.** La règle du seed « Dépôt de paie » (`CONTIENT « PAIE »`) catégorise les paiements de carte (`Paiement.`) en « Paie ».

**Décision.** `OperateurCondition` gagne `MOT_ENTIER`, proposé pour les champs texte à côté de `CONTIENT`, qui garde son sens actuel : n'importe où dans le texte. La frontière de mot est la même que celle de `beneficiaire.ts` (`[\p{L}\p{N}&'’]`). Migration de l'enum. La règle du seed passe en `MOT_ENTIER` et ne capte plus `Paiement.`, ce qu'un test vérifie.

## A4 — `VENTILER` absent de l'éditeur (§4.6)

Écart accepté. L'éditeur ne propose pas `VENTILER` en M1, au lieu de le proposer puis de le refuser. Le §4.6 est amendé dans ce sens. Le garde-fou `actionsVentilationIgnorees` du §6.3 reste inchangé.

## A5 — Plusieurs passifs par actif

`Account.compteLieId` perd `@unique` (migration), de sorte qu'une maison peut porter une hypothèque et une marge. Le message du doublon de nom de compte ne mentionne plus le compte lié.

## A6 — Choisir une sous-catégorie tranche le conflit (§6.3)

Sur une ligne en conflit, choisir une sous-catégorie vaut arbitrage, et **c'est cette sous-catégorie qui est persistée**. Constaté à l'écran le 30 septembre : le conflit se lève. Ce qui est enregistré en base n'a pas été vérifié. Le comportement est à écrire au §6.3 et à couvrir par un test de persistance.
