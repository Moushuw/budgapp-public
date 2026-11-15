// Barillet de domain/solde. `empreinte.ts` n'y figure pas : il importe node:crypto
// et ce barillet est importé côté client.

export { ecart, ecartRepresentable, refusAjustement, soldeCalcule, statutAncrage } from "./calcul";
export {
  DESCRIPTION_AJUSTEMENT,
  LIMITE_ANCRAGES,
  LIMITE_DOUBLONS_DIAGNOSTIC,
  LIMITE_EXPLICATION,
  LIMITE_LIGNES_MONTANT_DIAGNOSTIC,
  NOM_CATEGORIE_AJUSTEMENTS,
  NOM_SOUS_CATEGORIE_AJUSTEMENT,
  SOURCES_SOLDE_SAISISSABLES,
} from "./constantes";
export type { SourceSoldeSaisissable } from "./constantes";
export { explicationsProbables } from "./diagnostic";
export {
  dateLisible,
  dateLongue,
  libelleEnteteSolde,
  LIBELLES_CONSTAT,
  LIBELLES_NATURE_EXPLICATION,
  LIBELLES_STATUT_ANCRAGE,
  MESSAGES_REFUS_AJUSTEMENT,
  sousTitreCompte,
} from "./libelles";
export type {
  AjustementAffiche,
  AncrageAffiche,
  DiagnosticAncrage,
  FicheCompte,
  ReconciliationAffichee,
} from "./lecture";
export { ORDRE_EXPLICATIONS } from "./types";
export type {
  ConstatExplication,
  ContexteDiagnostic,
  Explication,
  LigneMontantErrone,
  MotifMontantErrone,
  MotifRefusAjustement,
  NatureExplication,
  PaireQuasiDoublon,
  StatutAncrage,
  TransactionDiagnostic,
} from "./types";
