// Statistiques de la détection — docs/lot-m3.md §4.2. La médiane est exacte
// (non arrondie) : celle de money.ts arrondit à l'entier, ce qui est juste pour
// des cents et faux pour un ratio d'intervalles.

import { jourSemaine, type DateCivile } from "../dates";

function exigerNonVide(valeurs: readonly unknown[], nom: string): void {
  if (valeurs.length === 0) {
    throw new Error(`${nom} : tableau vide`);
  }
}

/** Médiane exacte, non arrondie : élément du milieu, ou moyenne des deux du milieu. Lève sur un tableau vide. */
export function medianeExacte(valeurs: readonly number[]): number {
  exigerNonVide(valeurs, "medianeExacte");
  const triees = [...valeurs].sort((a, b) => a - b);
  const milieu = Math.floor(triees.length / 2);
  const haut = triees[milieu] ?? 0;
  if (triees.length % 2 === 1) {
    return haut;
  }
  const bas = triees[milieu - 1] ?? 0;
  return (bas + haut) / 2;
}

/** Écart-type de population : sqrt(Σ(x − moyenne)² / n). Lève sur un tableau vide. */
export function ecartTypePopulation(valeurs: readonly number[]): number {
  exigerNonVide(valeurs, "ecartTypePopulation");
  const moyenne = valeurs.reduce((total, v) => total + v, 0) / valeurs.length;
  const variance = valeurs.reduce((total, v) => total + (v - moyenne) ** 2, 0) / valeurs.length;
  return Math.sqrt(variance);
}

function modeLePlusPetit(valeurs: readonly number[]): number {
  const effectifs = new Map<number, number>();
  for (const v of valeurs) {
    effectifs.set(v, (effectifs.get(v) ?? 0) + 1);
  }
  let meilleur = Number.NaN;
  let meilleurEffectif = 0;
  for (const [valeur, effectif] of effectifs) {
    if (effectif > meilleurEffectif || (effectif === meilleurEffectif && valeur < meilleur)) {
      meilleur = valeur;
      meilleurEffectif = effectif;
    }
  }
  return meilleur;
}

/** Jour du mois (1..31) le plus fréquent ; le plus petit à égalité. Lève sur un tableau vide. */
export function jourModal(dates: readonly DateCivile[]): number {
  exigerNonVide(dates, "jourModal");
  return modeLePlusPetit(dates.map((d) => Number(d.slice(8, 10))));
}

/** Jour ISO de la semaine (1..7) le plus fréquent ; le plus petit (lundi d'abord) à égalité. Lève sur un tableau vide. */
export function jourSemaineModal(dates: readonly DateCivile[]): number {
  exigerNonVide(dates, "jourSemaineModal");
  return modeLePlusPetit(dates.map((d) => jourSemaine(d)));
}
