// Schéma zod unique, partagé par le formulaire (zodResolver) et l'action —
// CLAUDE.md §9. Suit la forme de src/features/etiquettes/schema.ts.

import { z } from "zod";
import { MODES_BUDGET, MODES_REPORT } from "@/domain/referentiel";
import { champTexteOptionnel } from "@/lib/champs-formulaire";
// Réutilisée depuis etiquettes/schema : ne pas la redéclarer (spec M1 tranche 2 §7.4).
import { COULEUR_HEXADECIMALE } from "@/features/etiquettes/schema";

export const schemaCategorie = z.object({
  nom: z.string().trim().min(1, "Le nom est obligatoire.").max(60, "60 caractères au maximum."),
  couleur: z
    .string()
    .regex(COULEUR_HEXADECIMALE, "Couleur hexadécimale attendue, par exemple #f59e0b.")
    .nullable(),
  icone: champTexteOptionnel(40),
  masquee: z.boolean(),
  modeBudget: z.enum(MODES_BUDGET),
});
export const schemaModificationCategorie = schemaCategorie.extend({ id: z.string().cuid() });
export const schemaIdentifiantCategorie = z.object({ id: z.string().cuid() });

export const schemaSousCategorie = z.object({
  nom: z.string().trim().min(1, "Le nom est obligatoire.").max(60, "60 caractères au maximum."),
  masquee: z.boolean(),
  reportActif: z.boolean(),
  reportMode: z.enum(MODES_REPORT),
});
export const schemaCreationSousCategorie = schemaSousCategorie.extend({ categoryId: z.string().cuid() });
export const schemaModificationSousCategorie = schemaSousCategorie.extend({ id: z.string().cuid() });
export const schemaIdentifiantSousCategorie = z.object({ id: z.string().cuid() });
export const schemaDeplacement = z.object({ id: z.string().cuid(), direction: z.enum(["MONTER", "DESCENDRE"]) });

export type EntreeCategorie = z.input<typeof schemaCategorie>;
export type ModificationCategorie = z.input<typeof schemaModificationCategorie>;
export type EntreeSousCategorie = z.input<typeof schemaSousCategorie>;
export type CreationSousCategorie = z.input<typeof schemaCreationSousCategorie>;
export type ModificationSousCategorie = z.input<typeof schemaModificationSousCategorie>;
export type Deplacement = z.input<typeof schemaDeplacement>;
