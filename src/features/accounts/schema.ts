// Schéma zod unique, partagé par le formulaire (zodResolver) et l'action —
// CLAUDE.md §9. Suit la forme de src/features/etiquettes/schema.ts.

import { z } from "zod";
import { estDateCivile } from "@/domain/dates";
import { REGIMES_FISCAUX, TYPES_COMPTE, type TypeCompte } from "@/domain/referentiel";
import {
  champEntierObligatoire,
  champEntierOptionnel,
  champMontantObligatoire,
  champMontantOptionnel,
  champPourcentageOptionnel,
  champTexteOptionnel,
  formatEntierChamp,
  formatMontantChamp,
  formatPourcentageChamp,
} from "@/lib/champs-formulaire";
import type { CompteListe } from "@/server/actions/accounts";

/** Carte de crédit ou marge : les champs de crédit s'affichent. */
export function afficheChampsCredit(type: TypeCompte): boolean {
  return type === "CREDIT" || type === "MARGE";
}

/** Placement : régime fiscal et taux de rendement s'affichent. */
export function afficheChampsPlacement(type: TypeCompte): boolean {
  return type === "PLACEMENT";
}

/** Prêt, actif ou passif : le compte lié s'affiche. */
export function afficheCompteLie(type: TypeCompte): boolean {
  return type === "PRET" || type === "PASSIF" || type === "ACTIF";
}

/** Un compte de suivi (placement, actif, passif) n'entre pas au budget par défaut. */
export function estBudgetaireParDefaut(type: TypeCompte): boolean {
  return type !== "PLACEMENT" && type !== "ACTIF" && type !== "PASSIF";
}

const objetCompte = z.object({
  nom: z.string().trim().min(1, "Le nom est obligatoire.").max(60, "60 caractères au maximum."),
  type: z.enum(TYPES_COMPTE),
  institution: champTexteOptionnel(80),
  soldeInitialCents: champMontantObligatoire(),
  dateSoldeInitial: z.string().refine(estDateCivile, "Date invalide. Format attendu : AAAA-MM-JJ."),
  estBudgetaire: z.boolean(),
  inclureDansPrevision: z.boolean(),
  inclureDansValeurNette: z.boolean(),
  perdDelaiDeGrace: z.boolean(),
  archive: z.boolean(),
  seuilSecuriteCents: champMontantOptionnel(),
  ordre: champEntierObligatoire({ min: 0, max: 999 }),
  limiteCreditCents: champMontantOptionnel({
    min: 0,
    messageMin: "La limite de crédit ne peut pas être négative.",
  }),
  tauxAnnuel: champPourcentageOptionnel({ min: 0, max: 100 }),
  jourReleve: champEntierOptionnel({ min: 1, max: 31 }),
  jourEcheance: champEntierOptionnel({ min: 1, max: 31 }),
  regimeFiscal: z.enum(REGIMES_FISCAUX),
  tauxRendementAnnuel: champPourcentageOptionnel({ min: -100, max: 100 }),
  compteLieId: z.string().cuid().nullable(),
});

/**
 * La validation côté serveur fait autorité, pas l'affichage : un compte
 * chèque n'a pas de taux même si le formulaire en a laissé traîner un.
 */
function normaliserSelonType<T extends z.output<typeof objetCompte>>(valeurs: T): T {
  const credit = afficheChampsCredit(valeurs.type);
  const placement = afficheChampsPlacement(valeurs.type);
  const compteLie = afficheCompteLie(valeurs.type);

  return {
    ...valeurs,
    limiteCreditCents: credit ? valeurs.limiteCreditCents : null,
    tauxAnnuel: credit ? valeurs.tauxAnnuel : null,
    jourReleve: credit ? valeurs.jourReleve : null,
    jourEcheance: credit ? valeurs.jourEcheance : null,
    perdDelaiDeGrace: credit ? valeurs.perdDelaiDeGrace : true,
    regimeFiscal: placement ? valeurs.regimeFiscal : "NON_ENREGISTRE",
    tauxRendementAnnuel: placement ? valeurs.tauxRendementAnnuel : null,
    compteLieId: compteLie ? valeurs.compteLieId : null,
  };
}

function refusAutoLiaison(
  valeurs: z.output<typeof objetCompte> & { id: string },
  ctx: z.RefinementCtx,
): void {
  if (valeurs.compteLieId === valeurs.id) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["compteLieId"],
      message: "Un compte ne peut pas être lié à lui-même.",
    });
  }
}

export const schemaCompte = objetCompte.transform(normaliserSelonType);

export const schemaModificationCompte = objetCompte
  .extend({ id: z.string().cuid() })
  .transform(normaliserSelonType)
  .superRefine(refusAutoLiaison);

export const schemaIdentifiantCompte = z.object({ id: z.string().cuid() });
export const schemaArchivageCompte = z.object({ id: z.string().cuid(), archive: z.boolean() });

/** Ce que le formulaire détient et envoie sur le fil : les champs texte, pas leur conversion. */
export type EntreeCompte = z.input<typeof schemaCompte>;
export type ModificationCompte = z.input<typeof schemaModificationCompte>;

/** Remplit le formulaire depuis une valeur stockée — aller-retour sans perte avec schemaCompte. */
export function versEntreeCompte(compte: CompteListe): EntreeCompte {
  return {
    nom: compte.nom,
    type: compte.type,
    institution: compte.institution,
    soldeInitialCents: formatMontantChamp(compte.soldeInitialCents),
    dateSoldeInitial: compte.dateSoldeInitial,
    estBudgetaire: compte.estBudgetaire,
    inclureDansPrevision: compte.inclureDansPrevision,
    inclureDansValeurNette: compte.inclureDansValeurNette,
    perdDelaiDeGrace: compte.perdDelaiDeGrace,
    archive: compte.archive,
    seuilSecuriteCents: formatMontantChamp(compte.seuilSecuriteCents),
    ordre: formatEntierChamp(compte.ordre),
    limiteCreditCents: formatMontantChamp(compte.limiteCreditCents),
    tauxAnnuel: formatPourcentageChamp(compte.tauxAnnuel),
    jourReleve: formatEntierChamp(compte.jourReleve),
    jourEcheance: formatEntierChamp(compte.jourEcheance),
    regimeFiscal: compte.regimeFiscal,
    tauxRendementAnnuel: formatPourcentageChamp(compte.tauxRendementAnnuel),
    compteLieId: compte.compteLieId,
  };
}
