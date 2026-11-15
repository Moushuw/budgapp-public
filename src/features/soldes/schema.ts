// Les schémas partagés par le formulaire de saisie de solde, le formulaire
// d'explication et leurs Server Actions — docs/lot-m3.md §5. Un seul exemplaire
// des règles et des messages (CLAUDE.md §9). Le montant voyage en chaîne jusqu'à
// l'action, qui le convertit (CLAUDE.md §11).

import { z } from "zod";
import { estDateCivile } from "@/domain/dates";
import { MONTANT_MAX_CENTS } from "@/domain/edition";
import { LIMITE_EXPLICATION, SOURCES_SOLDE_SAISISSABLES } from "@/domain/solde";
import { champMontantObligatoire } from "@/lib/champs-formulaire";

const identifiant = z.string().cuid("Identifiant invalide.");

export const schemaFormulaireSolde = z.object({
  date: z.string().refine(estDateCivile, "Date invalide (AAAA-MM-JJ attendu)."),
  montant: champMontantObligatoire({
    min: -MONTANT_MAX_CENTS,
    max: MONTANT_MAX_CENTS,
    messageIllisible: "Montant illisible. Exemple : 1 250,00",
    messageMin: "Montant trop grand.",
    messageMax: "Montant trop grand.",
  }),
  source: z.enum(SOURCES_SOLDE_SAISISSABLES, { message: "Choisis une source." }),
});
export const schemaSaisieSolde = schemaFormulaireSolde.extend({ accountId: identifiant });

export const schemaIdentifiantCompteSolde = z.object({ accountId: identifiant });
export const schemaIdentifiantAncrage = z.object({ statementId: identifiant });

export const schemaFormulaireExplication = z.object({
  explication: z
    .string()
    .trim()
    .min(1, "Écris l'explication.")
    .max(LIMITE_EXPLICATION, `${LIMITE_EXPLICATION} caractères au maximum.`),
});
export const schemaExplication = schemaFormulaireExplication.extend({ statementId: identifiant });

export type ValeursFormulaireSolde = z.input<typeof schemaFormulaireSolde>;
