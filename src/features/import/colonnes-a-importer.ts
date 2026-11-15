export type CleColonneAImporter =
  | "date"
  | "description"
  | "beneficiaire"
  | "sousCategorie"
  | "montant"
  | "compte"
  | "complements";

export interface ColonneAImporter {
  readonly cle: CleColonneAImporter;
  readonly libelle: string;
}

export const COLONNES_A_IMPORTER: readonly ColonneAImporter[] = [
  { cle: "date", libelle: "Date" },
  { cle: "description", libelle: "Description" },
  { cle: "beneficiaire", libelle: "Bénéficiaire" },
  { cle: "sousCategorie", libelle: "Sous-catégorie" },
  { cle: "montant", libelle: "Montant" },
  { cle: "compte", libelle: "Compte" },
  { cle: "complements", libelle: "Note, étiquettes, état" },
];

// Une seule définition pour l'en-tête et les lignes : des pistes indépendantes du contenu alignent des grilles distinctes (docs/pilotage/passes/m1.md, E2-b).
export const GRILLE_A_IMPORTER = "md:grid-cols-[repeat(6,minmax(0,1fr))_16rem] md:gap-2";

// Le retrait de CardContent (px-(--card-spacing) = --spacing(4)) : un en-tête posé au-dessus de lignes rendues dans des cartes
// s'aligne sur leur contenu (docs/lot-m2.md §10.2 point 5).
export const RETRAIT_EN_TETE_CARTES = "md:px-4";
