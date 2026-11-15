// Modèles de lecture de la consultation des transactions — docs/lot-m2.md §5.
// Partagés par le repository, les features et l'outillage e2e.

import type { DateCivile } from "../dates";
import type { RefusEcriture } from "../edition";
import type { Cents } from "../money";
import type { EtatRapprochement, EtatTransaction, SourceIngestion, TypeLiaison } from "../referentiel";

export interface EtiquetteResume {
  readonly id: string;
  readonly nom: string;
  readonly couleur: string | null;
}

export interface LigneVentilationLue {
  readonly id: string;
  readonly montantCents: Cents;
  readonly subcategoryId: string | null;
  readonly sousCategorieNom: string | null;
  readonly categorieNom: string | null;
  readonly note: string | null; // Transaction.details de la fille
  readonly etiquettes: readonly EtiquetteResume[];
}

export interface VirementResume {
  /** null si l'autre côté appartient à un autre propriétaire : même règle que ContrepartieLue.transactionId. */
  readonly transactionId: string | null;
  readonly compteId: string | null;
  readonly compteNom: string | null;
}

export interface LigneTransactionListe {
  readonly id: string;
  readonly date: DateCivile;
  readonly accountId: string;
  readonly compteNom: string;
  readonly description: string;
  readonly typeOperation: string | null;
  readonly montantCents: Cents;
  readonly payeeId: string | null;
  readonly beneficiaireNom: string | null;
  readonly subcategoryId: string | null;
  readonly sousCategorieNom: string | null;
  readonly categorieNom: string | null;
  readonly etiquettes: readonly EtiquetteResume[]; // triées par nom (localeCompare "fr-CA")
  readonly aRevoir: boolean;
  readonly exclureDuBudget: boolean;
  readonly exclureDesRapports: boolean;
  readonly estVentilee: boolean;
  readonly virement: VirementResume | null; // non null ⇔ transferTransactionId non null
  readonly lignesVentilation: readonly LigneVentilationLue[]; // au plus LIMITE_LIGNES_VENTILATION
  readonly nbLignesVentilation: number; // _count.lignes : rien n'est tronqué en silence
}

export type CurseurTransactions =
  | { readonly champ: "DATE"; readonly date: DateCivile; readonly id: string }
  | { readonly champ: "MONTANT"; readonly montantCents: Cents; readonly id: string };

export interface PageTransactions {
  readonly lignes: readonly LigneTransactionListe[];
  readonly curseurSuivant: CurseurTransactions | null;
}

export interface TotauxTransactions {
  readonly nombre: number;
  readonly sommeCents: Cents;
}

export interface TotauxPremierePage extends TotauxTransactions {
  /** Calculé seulement quand nombre === 0 ; sinon false. */
  readonly proprietaireSansTransaction: boolean;
}

export interface LotImportLu {
  readonly id: string;
  readonly importeLeDate: DateCivile; // dateCivileDansFuseau(importeLe, FUSEAU_APPLICATION)
  readonly libelle: string | null;
  readonly couvreDu: DateCivile | null;
  readonly couvreAu: DateCivile | null;
}

export interface ContrepartieLue {
  readonly transactionId: string | null; // null si la contrepartie appartient à un autre propriétaire
  readonly compteId: string | null;
  readonly compteNom: string | null;
  readonly date: DateCivile | null; // null si la contrepartie est introuvable (pointeur orphelin)
  readonly montantCents: Cents | null;
  readonly description: string | null;
}

export interface RecurrenceLiee {
  readonly occurrenceId: string;
  readonly ruleId: string;
  readonly libelle: string;
  readonly echeance: DateCivile;
  readonly liaison: TypeLiaison;
  readonly lieeLe: DateCivile | null;
}

export interface DetailTransaction {
  readonly id: string;
  readonly parentId: string | null;
  readonly accountId: string;
  readonly compteNom: string;
  readonly date: DateCivile;
  readonly description: string;
  readonly typeOperation: string | null;
  readonly montantCents: Cents;
  readonly payeeId: string | null;
  readonly beneficiaireNom: string | null;
  readonly subcategoryId: string | null;
  readonly sousCategorieNom: string | null;
  readonly categorieNom: string | null;
  readonly note: string | null;
  readonly etiquettes: readonly EtiquetteResume[];
  readonly aRevoir: boolean;
  readonly exclureDuBudget: boolean;
  readonly exclureDesRapports: boolean;
  readonly source: SourceIngestion;
  readonly etat: EtatTransaction;
  readonly rapprochement: EtatRapprochement;
  readonly externalId: string | null;
  readonly empreinte: string; // colonne obligatoire et @@unique (prisma/schema.prisma)
  readonly lotImport: LotImportLu | null;
  readonly regle: { readonly id: string; readonly libelle: string } | null;
  readonly estVentilee: boolean;
  readonly contrepartie: ContrepartieLue | null;
  readonly lignesVentilation: readonly LigneVentilationLue[];
  readonly nbLignesVentilation: number;
  readonly recurrence: RecurrenceLiee | null; // null : aucune occurrence, ou règle d'un autre propriétaire
  /** Ce que l'écran permet ou refuse, calculé par refusEcriture à la lecture. */
  readonly refus: RefusEcriture;
}
