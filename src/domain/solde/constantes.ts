// Constantes des soldes et de la réconciliation — docs/lot-m3.md §3.4, §3.7, §3.8, §5.

import type { SourceSolde } from "../referentiel";

/** Les sources qu'un humain saisit ; AGREGATEUR viendra de l'agrégateur (hors v2). */
export const SOURCES_SOLDE_SAISISSABLES = ["MANUEL", "RELEVE"] as const satisfies readonly SourceSolde[];
export type SourceSoldeSaisissable = (typeof SOURCES_SOLDE_SAISISSABLES)[number];

export const LIMITE_ANCRAGES = 50;
export const LIMITE_DOUBLONS_DIAGNOSTIC = 20;
export const LIMITE_LIGNES_MONTANT_DIAGNOSTIC = 20;
export const LIMITE_EXPLICATION = 500;

export const DESCRIPTION_AJUSTEMENT = "Ajustement de solde";
export const NOM_SOUS_CATEGORIE_AJUSTEMENT = "Ajustement de solde";
export const NOM_CATEGORIE_AJUSTEMENTS = "Ajustements";
