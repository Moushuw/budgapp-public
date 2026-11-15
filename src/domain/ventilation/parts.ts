// La ventilation d'une règle VENTILER — docs/lot-m2.md §4.3. Parts en pour mille, entiers.

import { LIMITE_LIGNES_VENTILATION } from "./limites";

export interface PartVentilation {
  readonly subcategoryId: string;
  readonly partMille: number;
}

/** Lit RuleAction.valeur. null si illisible ou incohérente ; ne lève jamais. */
export function lirePartsVentilation(valeur: string | null): readonly PartVentilation[] | null {
  if (valeur === null) {
    return null;
  }
  let brut: unknown;
  try {
    brut = JSON.parse(valeur);
  } catch {
    return null;
  }
  if (!Array.isArray(brut) || brut.length < 2 || brut.length > LIMITE_LIGNES_VENTILATION) {
    return null;
  }
  const parts: PartVentilation[] = [];
  let somme = 0;
  for (const element of brut as unknown[]) {
    if (typeof element !== "object" || element === null || Array.isArray(element)) {
      return null;
    }
    const { subcategoryId, partMille } = element as Record<string, unknown>;
    if (typeof subcategoryId !== "string" || subcategoryId.trim() === "") {
      return null;
    }
    if (typeof partMille !== "number" || !Number.isInteger(partMille) || partMille < 1 || partMille > 999) {
      return null;
    }
    parts.push({ subcategoryId, partMille });
    somme += partMille;
  }
  return somme === 1000 ? parts : null;
}

export function serialiserPartsVentilation(parts: readonly PartVentilation[]): string {
  return JSON.stringify(parts.map((p) => ({ subcategoryId: p.subcategoryId, partMille: p.partMille })));
}

/** Clé d'égalité d'une ventilation dans un créneau. */
export function cleVentilation(parts: readonly PartVentilation[]): string {
  return `ventilation:${parts.map((p) => `${p.subcategoryId}=${p.partMille}`).join(";")}`;
}

/** 600 → "60", 125 → "12,5", 5 → "0,5", 1000 → "100". */
export function formatPartMille(partMille: number): string {
  const entier = Math.floor(partMille / 10);
  const decimale = partMille % 10;
  return decimale === 0 ? String(entier) : `${entier},${decimale}`;
}
