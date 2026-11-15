// Fabriques de champs de formulaire — spec M1 tranche 2 §4.3. L'entrée de
// chaque fabrique est toujours `string` (ce que le formulaire détient), la
// sortie la valeur convertie : c'est l'exception assumée de CLAUDE.md §11 —
// la Server Action reçoit la chaîne exacte tapée par l'utilisateur et la
// convertit elle-même, plutôt que de faire confiance à un nombre déjà
// construit côté client.
//
// `features/etiquettes/schema.ts` se branche sur `champMontantOptionnel` : ne
// change jamais les messages par défaut sans relire son schema.test.ts, qui
// fait foi (spec §4.3).

import { z, type RefinementCtx } from "zod";
import { type Cents, formatMontant, parseMontant } from "@/domain/money";

const MESSAGE_MONTANT_ILLISIBLE_DEFAUT = "Montant illisible. Exemple : 250,00";
const MESSAGE_ENTIER_ILLISIBLE_DEFAUT = "Nombre entier attendu.";
const FORME_ENTIER = /^[+-]?\d+$/;

export interface OptionsMontant {
  readonly min?: Cents;
  readonly max?: Cents;
  readonly messageIllisible?: string;
  readonly messageMin?: string;
  readonly messageMax?: string;
}

/** Retourne false (et pose l'issue) si la valeur est hors bornes. */
function bornesMontantRespectees(valeur: Cents, options: OptionsMontant, ctx: RefinementCtx): boolean {
  const { min, max, messageMin, messageMax } = options;
  if (min !== undefined && valeur < min) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: messageMin ?? `Le montant doit être d'au moins ${formatMontant(min, "CENTS")}.`,
    });
    return false;
  }
  if (max !== undefined && valeur > max) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: messageMax ?? `Le montant doit être d'au plus ${formatMontant(max, "CENTS")}.`,
    });
    return false;
  }
  return true;
}

/** "" → erreur « obligatoire » ; sinon parseMontant, bornes vérifiées. Signe libre par défaut. */
export function champMontantObligatoire(options: OptionsMontant = {}) {
  return z.string().transform((texte, ctx) => {
    const nettoye = texte.trim();
    if (nettoye === "") {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Ce montant est obligatoire." });
      return z.NEVER;
    }

    const valeur = parseMontant(nettoye);
    if (valeur === null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: options.messageIllisible ?? MESSAGE_MONTANT_ILLISIBLE_DEFAUT });
      return z.NEVER;
    }

    if (!bornesMontantRespectees(valeur, options, ctx)) {
      return z.NEVER;
    }

    return valeur;
  });
}

/** "" → null ; sinon parseMontant, bornes vérifiées. */
export function champMontantOptionnel(options: OptionsMontant = {}) {
  return z.string().transform((texte, ctx) => {
    const nettoye = texte.trim();
    if (nettoye === "") {
      return null;
    }

    const valeur = parseMontant(nettoye);
    if (valeur === null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: options.messageIllisible ?? MESSAGE_MONTANT_ILLISIBLE_DEFAUT });
      return z.NEVER;
    }

    if (!bornesMontantRespectees(valeur, options, ctx)) {
      return z.NEVER;
    }

    return valeur;
  });
}

export interface OptionsEntier {
  readonly min?: number;
  readonly max?: number;
  readonly messageIllisible?: string;
  readonly messageBorne?: string;
}

function messageBorneEntierDefaut(options: OptionsEntier): string {
  const { min, max } = options;
  if (min !== undefined && max !== undefined) {
    return `Doit être compris entre ${min} et ${max}.`;
  }
  if (min !== undefined) {
    return `Doit être d'au moins ${min}.`;
  }
  if (max !== undefined) {
    return `Doit être d'au plus ${max}.`;
  }
  return "Nombre hors limites.";
}

function bornesEntierRespectees(valeur: number, options: OptionsEntier, ctx: RefinementCtx): boolean {
  const { min, max, messageBorne } = options;
  const horsBornes = (min !== undefined && valeur < min) || (max !== undefined && valeur > max);
  if (horsBornes) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: messageBorne ?? messageBorneEntierDefaut(options) });
    return false;
  }
  return true;
}

export function champEntierObligatoire(options: OptionsEntier = {}) {
  return z.string().transform((texte, ctx) => {
    const nettoye = texte.trim();
    if (nettoye === "" || !FORME_ENTIER.test(nettoye)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: options.messageIllisible ?? MESSAGE_ENTIER_ILLISIBLE_DEFAUT });
      return z.NEVER;
    }

    const valeur = Number(nettoye);
    if (!bornesEntierRespectees(valeur, options, ctx)) {
      return z.NEVER;
    }

    return valeur;
  });
}

export function champEntierOptionnel(options: OptionsEntier = {}) {
  return z.string().transform((texte, ctx) => {
    const nettoye = texte.trim();
    if (nettoye === "") {
      return null;
    }
    if (!FORME_ENTIER.test(nettoye)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: options.messageIllisible ?? MESSAGE_ENTIER_ILLISIBLE_DEFAUT });
      return z.NEVER;
    }

    const valeur = Number(nettoye);
    if (!bornesEntierRespectees(valeur, options, ctx)) {
      return z.NEVER;
    }

    return valeur;
  });
}

export interface OptionsPourcentage {
  readonly min?: number; // en pourcent, ex. 0
  readonly max?: number; // en pourcent, ex. 100
}

/**
 * "19,99" → 0.1999. Passe par parseMontant (cents de pourcent) puis divise
 * par 10 000 : aucun flottant intermédiaire, deux décimales de pourcent, ce
 * qui suffit à un taux.
 */
export function champPourcentageOptionnel(options: OptionsPourcentage = {}) {
  const { min, max } = options;
  return z.string().transform((texte, ctx) => {
    const nettoye = texte.trim();
    if (nettoye === "") {
      return null;
    }

    const centiemes = parseMontant(nettoye);
    if (centiemes === null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Pourcentage illisible. Exemple : 19,99" });
      return z.NEVER;
    }

    if (min !== undefined && centiemes < min * 100) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Le pourcentage doit être d'au moins ${min} %.` });
      return z.NEVER;
    }
    if (max !== undefined && centiemes > max * 100) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Le pourcentage doit être d'au plus ${max} %.` });
      return z.NEVER;
    }

    return centiemes / 10_000;
  });
}

/** Texte facultatif : null et "" sont équivalents et ressortent en null. */
export function champTexteOptionnel(max: number) {
  return z
    .string()
    .nullable()
    .transform((texte) => {
      const nettoye = texte?.trim() ?? "";
      return nettoye === "" ? null : nettoye;
    })
    .refine((texte) => texte === null || texte.length <= max, {
      message: `${max} caractères au maximum.`,
    });
}

// Formateurs inverses — remplissent un formulaire depuis une valeur stockée.

export function formatMontantChamp(cents: Cents | null): string {
  return cents === null ? "" : formatMontant(cents, "CENTS");
}

export function formatEntierChamp(valeur: number | null): string {
  return valeur === null ? "" : String(valeur);
}

export function formatPourcentageChamp(taux: number | null): string {
  if (taux === null) {
    return "";
  }
  const centiemes = Math.round(taux * 10_000);
  const pourcent = centiemes / 100;
  return new Intl.NumberFormat("fr-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(pourcent);
}
