// Groupes de référence des tests du domaine des récurrences.
// Support de test : non exporté par index.ts.

import { echeances, type DateCivile } from "../dates";
import type { GroupeRecurrence, TransactionDeGroupe } from "./types";

export interface OptionsGroupe {
  readonly beneficiaire?: { readonly id: string; readonly nom: string } | null;
  readonly sousCategories?: readonly (string | null)[];
}

/** Les id valent « <préfixe>01 », « <préfixe>02 », … dans l'ordre des dates. */
export function groupe(
  prefixe: string,
  accountId: string,
  motif: string,
  dates: readonly DateCivile[],
  montants: readonly number[] | number,
  options: OptionsGroupe = {},
): GroupeRecurrence {
  const transactions: TransactionDeGroupe[] = dates.map((date, i) => ({
    id: `${prefixe}${String(i + 1).padStart(2, "0")}`,
    date,
    montantCents: typeof montants === "number" ? montants : (montants[i] ?? 0),
    subcategoryId: options.sousCategories?.[i] ?? null,
    beneficiaire: options.beneficiaire ?? null,
  }));
  return { accountId, descriptionNormalisee: motif, transactions };
}

export const G_NETFLIX = groupe("n", "visa", "NETFLIX.COM", echeances("MENSUEL", "2025-03-12", "2026-09-12"), -1799, {
  sousCategories: Array.from({ length: 19 }, () => "sc-streaming"),
});

export const G_HYDRO = groupe(
  "h",
  "cheque",
  "HYDRO-QUEBEC",
  ["2026-01-05", "2026-02-05", "2026-03-05", "2026-04-05", "2026-05-05", "2026-06-05"],
  [-10_000, -10_500, -11_000, -9_500, -10_000, -12_000],
  { sousCategories: ["sc-elec", "sc-elec", null, "sc-autre", "sc-elec", "sc-autre"] },
);

export const G_PAIE = groupe(
  "p",
  "cheque",
  "DEPOT PAIE EMPLOYEUR ABC INC",
  ["2026-01-02", "2026-01-16", "2026-01-30", "2026-02-13", "2026-02-27", "2026-03-13"],
  240_600,
  {
    beneficiaire: { id: "b-paie", nom: "Dépôt paie" },
    sousCategories: Array.from({ length: 6 }, () => "sc-paie"),
  },
);

export const G_CAFE = groupe(
  "c",
  "visa",
  "CAFE DEPOT",
  ["2026-03-02", "2026-03-09", "2026-03-16", "2026-03-23", "2026-03-30"],
  -2500,
);

export const G_BELAIR = groupe("b", "cheque", "BELAIR ASSURANCE", ["2024-04-15", "2025-04-15", "2026-04-15"], -43_000);
