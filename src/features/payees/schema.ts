// Schéma zod unique, partagé par le formulaire (zodResolver) et l'action —
// CLAUDE.md §9. Suit la forme de src/features/accounts/schema.ts. Aucun champ
// de montant ici, donc aucune fabrique de lib/champs-formulaire.ts.

import { z } from "zod";
import type { BeneficiaireListe } from "@/server/actions/payees";

const objetBeneficiaire = z.object({
  nom: z.string().trim().min(1, "Le nom est obligatoire.").max(60, "60 caractères au maximum."),
  sousCategorieParDefautId: z.string().cuid().nullable(),
  autoCategorisation: z.boolean(),
  categorieVerrouillee: z.boolean(),
});

/**
 * Deux refus, déduits de docs/lot-m1.md §4.3 et §6.3 : « la catégorie a été
 * fixée à la main et prime sur les règles » suppose qu'il y en ait une ;
 * « ce bénéficiaire n'impose jamais de catégorie » contredit « elle prime
 * sur les règles ».
 */
function coherenceComportement(
  valeurs: z.output<typeof objetBeneficiaire>,
  ctx: z.RefinementCtx,
): void {
  if (valeurs.categorieVerrouillee && valeurs.sousCategorieParDefautId === null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["categorieVerrouillee"],
      message: "Verrouiller la catégorie suppose une sous-catégorie par défaut.",
    });
  }
  if (valeurs.categorieVerrouillee && !valeurs.autoCategorisation) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["categorieVerrouillee"],
      message: "Une catégorie verrouillée et l'auto-catégorisation désactivée se contredisent.",
    });
  }
}

export const schemaBeneficiaire = objetBeneficiaire.superRefine(coherenceComportement);
export const schemaModificationBeneficiaire = objetBeneficiaire
  .extend({ id: z.string().cuid() })
  .superRefine(coherenceComportement);
export const schemaIdentifiantBeneficiaire = z.object({ id: z.string().cuid() });

export const schemaFusionBeneficiaires = z
  .object({ sourceId: z.string().cuid(), cibleId: z.string().cuid() })
  .superRefine((valeurs, ctx) => {
    if (valeurs.sourceId === valeurs.cibleId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["cibleId"],
        message: "Choisis un bénéficiaire différent de celui à fusionner.",
      });
    }
  });

/** Ce que le formulaire détient et envoie sur le fil. */
export type EntreeBeneficiaire = z.input<typeof schemaBeneficiaire>;
export type ModificationBeneficiaire = z.input<typeof schemaModificationBeneficiaire>;
export type FusionBeneficiaires = z.input<typeof schemaFusionBeneficiaires>;

/** Remplit le formulaire depuis une valeur stockée — aller-retour sans perte avec schemaBeneficiaire. */
export function versEntreeBeneficiaire(beneficiaire: BeneficiaireListe): EntreeBeneficiaire {
  return {
    nom: beneficiaire.nom,
    sousCategorieParDefautId: beneficiaire.sousCategorieParDefautId,
    autoCategorisation: beneficiaire.autoCategorisation,
    categorieVerrouillee: beneficiaire.categorieVerrouillee,
  };
}
