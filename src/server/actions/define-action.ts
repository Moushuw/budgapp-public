import { z } from "zod";

// Le contrat des Server Actions — CLAUDE.md §6. Une Server Action est un point
// d'entrée HTTP public : validation zod à l'entrée, ActionResult en sortie,
// jamais de throw métier.

export type ErrorCode = "VALIDATION" | "NOT_FOUND" | "DUPLICATE" | "CONFLICT" | "FORBIDDEN" | "UNKNOWN";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; code: ErrorCode; message: string; details?: unknown };

export const MESSAGE_VALIDATION_GENERIQUE = "Les données envoyées sont invalides.";

export interface DetailsValidation {
  /** Messages par chemin complet (« lignes.3.note »), dans l'ordre des issues zod. */
  readonly champs: Readonly<Record<string, readonly string[]>>;
  /** Messages d'issues sans chemin (refine sur l'objet racine, entrée qui n'est pas un objet). */
  readonly general: readonly string[];
}

/** Le texte du `message` d'un échec de validation dont la première issue porte le message générique. */
export function messageValidation(chemin: string | null): string {
  if (chemin === null || chemin === "") return MESSAGE_VALIDATION_GENERIQUE;
  return `Les données envoyées sont invalides (champ « ${chemin} »).`;
}

// Un message par défaut de zod est en anglais (« Invalid cuid ») : il est
// remplacé par le générique. Un message écrit par l'auteur du schéma passe tel
// quel (docs/lot-m2.md §10.1.1).
const carteContextuelle: z.ZodErrorMap = (issue, ctx) => {
  if (ctx.defaultError === z.defaultErrorMap(issue, ctx).message) {
    return { message: MESSAGE_VALIDATION_GENERIQUE };
  }
  return { message: ctx.defaultError };
};

function detailsValidation(issues: readonly z.ZodIssue[]): DetailsValidation {
  const champs: Record<string, string[]> = {};
  const general: string[] = [];
  for (const issue of issues) {
    const chemin = issue.path.map(String).join(".");
    if (chemin === "") {
      general.push(issue.message);
    } else {
      (champs[chemin] ??= []).push(issue.message);
    }
  }
  return { champs, general };
}

export function defineAction<TSchema extends z.ZodType, TResult>(
  schema: TSchema,
  handler: (input: z.infer<TSchema>) => Promise<ActionResult<TResult>>,
) {
  return async (input: unknown): Promise<ActionResult<TResult>> => {
    const analyse = schema.safeParse(input, { errorMap: carteContextuelle });
    if (!analyse.success) {
      const issues = analyse.error.issues;
      const premiere = issues[0];
      let message = MESSAGE_VALIDATION_GENERIQUE;
      if (premiere !== undefined) {
        message =
          premiere.message !== MESSAGE_VALIDATION_GENERIQUE
            ? premiere.message
            : messageValidation(premiere.path.map(String).join("."));
      }
      return { ok: false, code: "VALIDATION", message, details: detailsValidation(issues) };
    }

    try {
      return await handler(analyse.data as z.infer<TSchema>);
    } catch (erreur) {
      // Erreur vraiment inattendue : jamais un message métier ici, on logue
      // côté serveur et on renvoie un ActionResult générique — CLAUDE.md §6.2.
      console.error(erreur);
      return { ok: false, code: "UNKNOWN", message: "Une erreur inattendue est survenue." };
    }
  };
}
