// Schéma zod unique, partagé par le formulaire (zodResolver) et l'action —
// CLAUDE.md §9. zod v3 (^3.25.76) : z.ZodIssueCode.custom, superRefine,
// z.input / z.output. Suit la forme de src/features/import-filters/schema.ts
// (refus par superRefine avec le message du moteur de regex) et
// src/features/payees/schema.ts (cohérence inter-champs + versEntree…).

import { z } from "zod";
import {
  CHAMPS_CONDITION,
  OPERATEURS_CONDITION,
  SENS_CONDITION,
  SEPARATEUR_LISTE,
  TYPES_ACTION,
  TYPE_VALEUR_PAR_CHAMP,
  exigeValeurFin,
  operateurCompatible,
  type ChampCondition,
  type OperateurCondition,
  type TypeAction,
} from "@/domain/categorization";
import { estDateCivile } from "@/domain/dates";
import { parseMontant } from "@/domain/money";
import {
  formatPartMille,
  LIMITE_LIGNES_VENTILATION,
  lirePartsVentilation,
  serialiserPartsVentilation,
} from "@/domain/ventilation";
import { champEntierObligatoire, formatEntierChamp, formatMontantChamp } from "@/lib/champs-formulaire";
// Types-only : EntreeActionRepo et EntreeConditionRepo sont des types de
// frontière (aucune sémantique métier propre au domaine), pas encore
// re-exportés par server/actions/rules.ts — importés directement ici, sans
// coût d'exécution (un `import type` s'efface entièrement à la compilation,
// il ne fait courir aucun risque de tirer Prisma dans un bundle client).
import type { EntreeActionRepo, EntreeConditionRepo } from "@/server/repositories/rules";
import type { RegleListe } from "@/server/actions/rules";

// La forme de saisie n'est pas la forme stockée : un montant de condition se
// saisit en dollars et se stocke en cents.

export interface EntreeConditionFormulaire {
  champ: ChampCondition;
  operateur: OperateurCondition;
  valeur: string; // texte brut saisi — dollars pour MONTANT
  valeurFin: string; // "" quand l'opérateur n'est pas ENTRE
}

export interface LigneVentilationRegleFormulaire {
  subcategoryId: string | null;
  pourcentage: string; // saisie brute : "60", "12,5"
}

export interface EntreeActionFormulaire {
  type: TypeAction;
  subcategoryId: string | null;
  valeur: string; // "" quand le type n'en prend pas
  /** [] sauf pour VENTILER (docs/lot-m2.md §4.3). */
  ventilation: LigneVentilationRegleFormulaire[];
}

const MESSAGE_MONTANT_ILLISIBLE = "Montant illisible. Exemple : 250,00";
const FORME_POURCENTAGE = /^\d{1,3}(?:[.,]\d)?$/;

/** « 12,5 » → 125 ; null si la saisie n'a pas la forme d'un pourcentage à une décimale. */
export function partMilleDepuisPourcentage(saisie: string): number | null {
  const nettoye = saisie.trim();
  if (!FORME_POURCENTAGE.test(nettoye)) {
    return null;
  }
  const [entiere = "", decimale = "0"] = nettoye.replace(",", ".").split(".");
  return Number(entiere) * 10 + Number(decimale);
}

function estCuid(valeur: string): boolean {
  return z.string().cuid().safeParse(valeur).success;
}

// ── condition

const objetCondition = z.object({
  champ: z.enum(CHAMPS_CONDITION),
  operateur: z.enum(OPERATEURS_CONDITION),
  valeur: z.string(),
  valeurFin: z.string(),
});

function coherenceCondition(valeurs: z.output<typeof objetCondition>, ctx: z.RefinementCtx): void {
  const { champ, operateur, valeur, valeurFin } = valeurs;

  if (!operateurCompatible(champ, operateur)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["operateur"],
      message: `Cet opérateur ne s'applique pas à ce champ.`,
    });
    return;
  }

  if (valeur.trim() === "") {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["valeur"], message: "La valeur est obligatoire." });
    return;
  }

  const typeValeur = TYPE_VALEUR_PAR_CHAMP[champ];

  if (typeValeur === "TEXTE") {
    if (operateur === "REGEX") {
      try {
        new RegExp(valeur);
      } catch (erreur) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["valeur"],
          message: erreur instanceof Error ? erreur.message : "Expression régulière invalide.",
        });
      }
    }
    return;
  }

  if (typeValeur === "MONTANT") {
    const basse = parseMontant(valeur);
    if (basse === null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["valeur"], message: MESSAGE_MONTANT_ILLISIBLE });
    }
    if (exigeValeurFin(operateur)) {
      if (valeurFin.trim() === "") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["valeurFin"],
          message: "La borne haute est obligatoire.",
        });
      } else {
        const haute = parseMontant(valeurFin);
        if (haute === null) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["valeurFin"], message: MESSAGE_MONTANT_ILLISIBLE });
        } else if (basse !== null && haute < basse) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["valeurFin"],
            message: "La borne haute doit être supérieure ou égale à la borne basse.",
          });
        }
      }
    }
    return;
  }

  if (typeValeur === "COMPTE") {
    const ids = valeur
      .split(SEPARATEUR_LISTE)
      .map((id) => id.trim())
      .filter((id) => id !== "");
    if (ids.length === 0 || ids.some((id) => !estCuid(id))) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["valeur"], message: "Choisis un compte valide." });
    }
    return;
  }

  // SENS
  if (!(SENS_CONDITION as readonly string[]).includes(valeur)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["valeur"], message: "Choisis un sens valide." });
  }
}

function convertirCondition(valeurs: z.output<typeof objetCondition>): EntreeConditionRepo {
  if (valeurs.champ === "MONTANT") {
    // Le seul endroit du projet où des dollars deviennent les cents d'une
    // condition de règle (CLAUDE.md §11, exception de saisie).
    const enCents = parseMontant(valeurs.valeur);
    const finCents = exigeValeurFin(valeurs.operateur) ? parseMontant(valeurs.valeurFin) : null;
    return {
      champ: valeurs.champ,
      operateur: valeurs.operateur,
      valeur: String(enCents ?? 0),
      valeurFin: finCents === null ? null : String(finCents),
    };
  }

  return {
    champ: valeurs.champ,
    operateur: valeurs.operateur,
    valeur: valeurs.valeur.trim(),
    valeurFin: null,
  };
}

export const schemaCondition: z.ZodType<EntreeConditionRepo, z.ZodTypeDef, EntreeConditionFormulaire> = objetCondition
  .superRefine(coherenceCondition)
  .transform(convertirCondition);

// ── action

const objetAction = z.object({
  type: z.enum(TYPES_ACTION),
  subcategoryId: z.string().nullable(),
  valeur: z.string(),
  ventilation: z.array(z.object({ subcategoryId: z.string().nullable(), pourcentage: z.string() })),
});

function coherenceVentilation(
  ventilation: z.output<typeof objetAction>["ventilation"],
  ctx: z.RefinementCtx,
): void {
  if (ventilation.length < 2) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["ventilation"],
      message: "Une ventilation compte au moins deux lignes.",
    });
  } else if (ventilation.length > LIMITE_LIGNES_VENTILATION) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["ventilation"],
      message: `Une ventilation compte au plus ${LIMITE_LIGNES_VENTILATION} lignes.`,
    });
  }

  let toutesLisibles = true;
  let somme = 0;
  for (const [j, ligne] of ventilation.entries()) {
    if (ligne.subcategoryId === null || !estCuid(ligne.subcategoryId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["ventilation", j, "subcategoryId"],
        message: "Choisis une sous-catégorie.",
      });
    }
    const part = partMilleDepuisPourcentage(ligne.pourcentage);
    if (part === null) {
      toutesLisibles = false;
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["ventilation", j, "pourcentage"],
        message: "Pourcentage illisible. Exemple : 12,5",
      });
    } else if (part === 0) {
      toutesLisibles = false;
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["ventilation", j, "pourcentage"],
        message: "Une part doit être supérieure à 0 %.",
      });
    } else {
      somme += part;
    }
  }

  const nombreValide = ventilation.length >= 2 && ventilation.length <= LIMITE_LIGNES_VENTILATION;
  if (nombreValide && toutesLisibles && somme !== 1000) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["ventilation"],
      message: `Les parts totalisent ${formatPartMille(somme)} % : elles doivent faire 100 %.`,
    });
  }
}

function coherenceAction(valeurs: z.output<typeof objetAction>, ctx: z.RefinementCtx): void {
  const { type, subcategoryId, valeur } = valeurs;

  if (type === "VENTILER") {
    coherenceVentilation(valeurs.ventilation, ctx);
    return;
  }

  if (type === "CATEGORISER") {
    if (subcategoryId === null || !estCuid(subcategoryId)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["subcategoryId"], message: "Choisis une sous-catégorie." });
    }
    return;
  }

  if (type === "ETIQUETER") {
    if (!estCuid(valeur)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["valeur"], message: "Choisis une étiquette." });
    }
    return;
  }

  if (type === "RENOMMER_BENEFICIAIRE") {
    const nettoye = valeur.trim();
    if (nettoye === "" || nettoye.length > 60) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["valeur"],
        message: "Le nom du bénéficiaire est obligatoire.",
      });
    }
    return;
  }

  if (type === "NOTER") {
    const nettoye = valeur.trim();
    if (nettoye === "" || nettoye.length > 200) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["valeur"], message: "La note est obligatoire." });
    }
  }
  // EXCLURE_BUDGET, EXCLURE_RAPPORTS, MARQUER_A_REVOIR : aucune exigence.
}

function convertirAction(valeurs: z.output<typeof objetAction>): EntreeActionRepo {
  if (valeurs.type === "CATEGORISER") {
    return { type: valeurs.type, subcategoryId: valeurs.subcategoryId, valeur: null };
  }
  if (valeurs.type === "ETIQUETER") {
    return { type: valeurs.type, subcategoryId: null, valeur: valeurs.valeur };
  }
  if (valeurs.type === "RENOMMER_BENEFICIAIRE" || valeurs.type === "NOTER") {
    return { type: valeurs.type, subcategoryId: null, valeur: valeurs.valeur.trim() };
  }
  if (valeurs.type === "VENTILER") {
    // Lisible et complète : coherenceAction a déjà refusé le reste, et la conversion ne tourne pas sur un refus.
    const parts = valeurs.ventilation.flatMap((ligne) => {
      const partMille = partMilleDepuisPourcentage(ligne.pourcentage);
      return ligne.subcategoryId === null || partMille === null ? [] : [{ subcategoryId: ligne.subcategoryId, partMille }];
    });
    return { type: valeurs.type, subcategoryId: null, valeur: serialiserPartsVentilation(parts) };
  }
  // EXCLURE_BUDGET, EXCLURE_RAPPORTS, MARQUER_A_REVOIR.
  return { type: valeurs.type, subcategoryId: null, valeur: null };
}

export const schemaAction: z.ZodType<EntreeActionRepo, z.ZodTypeDef, EntreeActionFormulaire> = objetAction
  .superRefine(coherenceAction)
  .transform(convertirAction);

// ── règle

const TYPES_ACTION_UNIQUES: readonly TypeAction[] = [
  "CATEGORISER",
  "VENTILER",
  "NOTER",
  "RENOMMER_BENEFICIAIRE",
  "EXCLURE_BUDGET",
  "EXCLURE_RAPPORTS",
  "MARQUER_A_REVOIR",
];

const MESSAGES_TYPE_UNIQUE: Partial<Record<TypeAction, string>> = {
  CATEGORISER: "Une règle ne pose qu'une sous-catégorie.",
  VENTILER: "Une règle ne pose qu'une ventilation.",
  NOTER: "Une règle ne pose qu'une note.",
  RENOMMER_BENEFICIAIRE: "Une règle ne renomme le bénéficiaire qu'une fois.",
  EXCLURE_BUDGET: "Une règle ne pose qu'une fois l'exclusion du budget.",
  EXCLURE_RAPPORTS: "Une règle ne pose qu'une fois l'exclusion des rapports.",
  MARQUER_A_REVOIR: "Une règle ne pose qu'une fois le marquage à revoir.",
};

const objetRegle = z.object({
  libelle: z.string().trim().min(1, "Le libellé est obligatoire.").max(80, "80 caractères au maximum."),
  priorite: champEntierObligatoire({ min: 0, max: 999 }),
  actif: z.boolean(),
  conditions: z.array(schemaCondition).min(1, "Une règle sans condition ne s'applique à rien."),
  actions: z.array(schemaAction).min(1, "Une règle sans action ne fait rien."),
});

function coherenceRegle(valeurs: z.output<typeof objetRegle>, ctx: z.RefinementCtx): void {
  for (const type of TYPES_ACTION_UNIQUES) {
    const occurrences = valeurs.actions.filter((action) => action.type === type).length;
    if (occurrences > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["actions"],
        message: MESSAGES_TYPE_UNIQUE[type] ?? "Cette action ne se pose qu'une fois par règle.",
      });
    }
  }

  // Les deux occupent le même créneau SOUS_CATEGORIE (docs/lot-m2.md §4.3).
  if (
    valeurs.actions.some((action) => action.type === "VENTILER") &&
    valeurs.actions.some((action) => action.type === "CATEGORISER")
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["actions"],
      message: "Une règle ne porte pas à la fois une ventilation et une sous-catégorie.",
    });
  }

  const etiquettesVues = new Set<string>();
  for (const action of valeurs.actions) {
    if (action.type !== "ETIQUETER" || action.valeur === null) {
      continue;
    }
    if (etiquettesVues.has(action.valeur)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["actions"],
        message: "Cette étiquette est déjà posée par cette règle.",
      });
      break;
    }
    etiquettesVues.add(action.valeur);
  }
}

export const schemaRegle = objetRegle.superRefine(coherenceRegle);
export const schemaModificationRegle = objetRegle.extend({ id: z.string().cuid() }).superRefine(coherenceRegle);
export const schemaIdentifiantRegle = z.object({ id: z.string().cuid() });

// ── application rétroactive
//
// LIMITE_BALAYAGE est dupliquée ici (même valeur que
// src/server/repositories/transactions.ts) plutôt qu'importée : features/
// n'importe jamais server/repositories/ directement (CLAUDE.md §4), et ce
// fichier est chargé côté client par le formulaire — un import qui remonterait
// jusqu'à Prisma via ce repository romprait la frontière client/serveur.
const LIMITE_BALAYAGE_ENTREE = 5000;

const MESSAGE_DATE_INVALIDE = "Date invalide. Format attendu : AAAA-MM-JJ.";

export const schemaApercuApplication = z.object({
  ruleId: z.string().cuid(),
  du: z.string().refine(estDateCivile, MESSAGE_DATE_INVALIDE).nullable(),
  au: z.string().refine(estDateCivile, MESSAGE_DATE_INVALIDE).nullable(),
});

export const MESSAGE_IDS_EN_DOUBLE = "Une transaction ne peut pas être à la fois à écrire et à réévaluer.";
export const MESSAGE_TROP_DE_LIGNES = `Au plus ${LIMITE_BALAYAGE_ENTREE} transactions par application.`;
export const MESSAGE_ID_REPETE = "Une même transaction ne peut figurer qu'une fois dans la liste.";

export const schemaApplicationRetroactive = z
  .object({
    ruleId: z.string().cuid(),
    /** Lignes à écrire : `ApercuApplication.idsAEcrire`. */
    transactionIds: z.array(z.string().cuid()).min(1).max(LIMITE_BALAYAGE_ENTREE),
    /** Correspondances sans écriture à l'aperçu : réévaluées pour les compteurs, jamais écrites. */
    idsSansEcriture: z.array(z.string().cuid()).max(LIMITE_BALAYAGE_ENTREE),
  })
  .superRefine((valeurs, ctx) => {
    // Un identifiant répété ne s'écrit qu'une fois mais se compterait autant de
    // fois : un appel forgé gonflerait le bilan sans rien écrire.
    const aEcrire = new Set(valeurs.transactionIds);
    if (aEcrire.size !== valeurs.transactionIds.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["transactionIds"], message: MESSAGE_ID_REPETE });
    }
    if (new Set(valeurs.idsSansEcriture).size !== valeurs.idsSansEcriture.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["idsSansEcriture"], message: MESSAGE_ID_REPETE });
    }
    if (valeurs.idsSansEcriture.some((id) => aEcrire.has(id))) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["idsSansEcriture"], message: MESSAGE_IDS_EN_DOUBLE });
    }
    if (valeurs.transactionIds.length + valeurs.idsSansEcriture.length > LIMITE_BALAYAGE_ENTREE) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["idsSansEcriture"], message: MESSAGE_TROP_DE_LIGNES });
    }
  });

export type EntreeRegle = z.input<typeof schemaRegle>;
export type ModificationRegle = z.input<typeof schemaModificationRegle>;
export type EntreeApercuApplication = z.input<typeof schemaApercuApplication>;
export type EntreeApplicationRetroactive = z.input<typeof schemaApplicationRetroactive>;

export const MESSAGE_SOUS_CATEGORIE_DISPARUE = "Cette sous-catégorie n'existe plus : choisis-en une autre.";

/**
 * Les parts d'une action VENTILER dont la sous-catégorie ne figure pas parmi `idsConnus` (supprimée depuis
 * l'enregistrement de la règle, docs/lot-m2.md §4.3). Le serveur garde son propre contrôle de référence ; ceci
 * ne fait que dire sur la ligne ce que le refus global ne dirait pas. Une part sans sous-catégorie est
 * laissée au schéma, qui la signale déjà.
 */
export function partsSousCategorieDisparue(
  actions: readonly {
    readonly type: TypeAction;
    readonly ventilation: readonly Readonly<LigneVentilationRegleFormulaire>[];
  }[],
  idsConnus: ReadonlySet<string>,
): readonly { readonly action: number; readonly part: number }[] {
  return actions.flatMap((action, i) =>
    action.type !== "VENTILER"
      ? []
      : action.ventilation.flatMap((part, j) =>
          estSousCategorieDisparue(part.subcategoryId, idsConnus) ? [{ action: i, part: j }] : [],
        ),
  );
}

/** Une part dont la sous-catégorie n'est plus connue ; faux tant que les catégories ne sont pas chargées (null). */
export function estSousCategorieDisparue(subcategoryId: string | null, connues: ReadonlySet<string> | null): boolean {
  return connues !== null && subcategoryId !== null && !connues.has(subcategoryId);
}

/** docs/lot-m2.md §5.3 : condition DESCRIPTION CONTIENT la description, action CATEGORISER la sous-catégorie courante. */
export function entreeRegleDepuisTransaction(t: {
  readonly description: string;
  readonly subcategoryId: string | null;
}): EntreeRegle {
  return {
    libelle: t.description.trim().slice(0, 80),
    priorite: "0",
    actif: true,
    conditions: [{ champ: "DESCRIPTION", operateur: "CONTIENT", valeur: t.description, valeurFin: "" }],
    actions: [{ type: "CATEGORISER", subcategoryId: t.subcategoryId, valeur: "", ventilation: [] }],
  };
}

/** Remplit le formulaire depuis une règle stockée — aller-retour sans perte avec schemaRegle. */
export function versEntreeRegle(regle: RegleListe): EntreeRegle {
  return {
    libelle: regle.libelle,
    priorite: formatEntierChamp(regle.priorite),
    actif: regle.actif,
    conditions: regle.conditions.map(
      (condition): EntreeConditionFormulaire => ({
        champ: condition.champ,
        operateur: condition.operateur,
        valeur: condition.champ === "MONTANT" ? formatMontantChamp(Number(condition.valeur)) : condition.valeur,
        valeurFin:
          condition.valeurFin === null
            ? ""
            : condition.champ === "MONTANT"
              ? formatMontantChamp(Number(condition.valeurFin))
              : condition.valeurFin,
      }),
    ),
    actions: regle.actions.map(
      (action): EntreeActionFormulaire =>
        action.type === "VENTILER"
          ? {
              type: action.type,
              subcategoryId: null,
              valeur: "",
              ventilation: (lirePartsVentilation(action.valeur) ?? []).map((part) => ({
                subcategoryId: part.subcategoryId,
                pourcentage: formatPartMille(part.partMille),
              })),
            }
          : {
              type: action.type,
              subcategoryId: action.subcategoryId,
              valeur: action.valeur ?? "",
              ventilation: [],
            },
    ),
  };
}
