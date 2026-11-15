// Schéma zod unique, partagé par le formulaire (zodResolver) et l'action —
// CLAUDE.md §9.

import { z, type RefinementCtx } from "zod";
import { MODES_CORRESPONDANCE } from "@/domain/referentiel";

/**
 * En mode REGEX, tente de compiler le motif : l'utilisateur voit le message
 * exact du moteur d'expressions régulières, jamais un « motif invalide »
 * générique (spec M1 tranche 2 §4.5). Les trois autres modes ne compilent rien.
 */
function verifierMotifRegex(valeurs: { motif: string; mode: (typeof MODES_CORRESPONDANCE)[number] }, ctx: RefinementCtx): void {
  if (valeurs.mode !== "REGEX") {
    return;
  }
  try {
    new RegExp(valeurs.motif);
  } catch (erreur) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["motif"],
      message: erreur instanceof Error ? erreur.message : "Expression régulière invalide.",
    });
  }
}

const objetFiltreImport = z.object({
  motif: z.string().trim().min(1, "Le motif est obligatoire.").max(200, "200 caractères au maximum."),
  mode: z.enum(MODES_CORRESPONDANCE),
});

export const schemaFiltreImport = objetFiltreImport.superRefine(verifierMotifRegex);

export const schemaModificationFiltreImport = objetFiltreImport
  .extend({ id: z.string().cuid() })
  .superRefine(verifierMotifRegex);

export const schemaIdentifiantFiltreImport = z.object({ id: z.string().cuid() });

export type EntreeFiltreImport = z.input<typeof schemaFiltreImport>;
export type ModificationFiltreImport = z.input<typeof schemaModificationFiltreImport>;
