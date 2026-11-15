// Le schéma unique des filtres de la consultation — docs/lot-m2.md §5.2. Il
// sert à la fois à la page (lecture de l'URL) et à l'action : un seul
// exemplaire des règles et des messages (CLAUDE.md §9).

import { z } from "zod";
import type { DetailTransaction, FiltresTransactions } from "@/domain/consultation";
import { estDateCivile } from "@/domain/dates";
import { CHOIX_SUPPRESSION_VIREMENT, LIMITE_BALAYAGE, MONTANT_MAX_CENTS } from "@/domain/edition";
import {
  champMontantObligatoire,
  champMontantOptionnel,
  champTexteOptionnel,
  formatMontantChamp,
} from "@/lib/champs-formulaire";
import { schemaPeriode } from "@/features/periode/schema";
import {
  LIMITE_LIGNES_VENTILATION,
  messageErreurVentilation,
  validerVentilation,
  type ParentVentilation,
} from "@/domain/ventilation";

export const LONGUEUR_MAX_RECHERCHE = 100;
export const LIMITE_VALEURS_FILTRE = 100;

const MESSAGE_DATE = "Date invalide (AAAA-MM-JJ attendu).";
const MESSAGE_ID = "Identifiant invalide.";
const MESSAGE_LIMITE = "Au plus 100 valeurs par filtre.";
const MESSAGE_MONTANT_ENTIER = "Montant en cents entier attendu.";
const MESSAGE_MONTANT_POSITIF = "Le montant doit être positif ou nul.";
const MESSAGE_MONTANT_TROP_GRAND = "Montant trop grand.";
const MESSAGE_FIN_AVANT_DEBUT = "La date de fin précède la date de début.";
const MESSAGE_MAX_SOUS_MIN = "Le montant maximum est inférieur au minimum.";

const dateCivileFiltre = z.string().refine(estDateCivile, MESSAGE_DATE);
const listeIds = z.array(z.string().cuid(MESSAGE_ID)).max(LIMITE_VALEURS_FILTRE, MESSAGE_LIMITE);
const montantCentsFiltre = z.number().int(MESSAGE_MONTANT_ENTIER).min(0, MESSAGE_MONTANT_POSITIF)
  .max(Number.MAX_SAFE_INTEGER, MESSAGE_MONTANT_TROP_GRAND)
  .nullable();

const objetFiltres = z.object({
  du: dateCivileFiltre.nullable(),
  au: dateCivileFiltre.nullable(),
  toutesDates: z.boolean(),
  texte: z
    .string()
    .trim()
    .min(1, "La recherche est vide.")
    .max(LONGUEUR_MAX_RECHERCHE, "La recherche dépasse 100 caractères.")
    .nullable(),
  comptes: listeIds,
  sousCategories: listeIds,
  nonCategorisee: z.boolean(),
  beneficiaires: listeIds,
  etiquettes: listeIds,
  montantMinCents: montantCentsFiltre,
  montantMaxCents: montantCentsFiltre,
  sens: z.enum(["TOUT", "ENTREES", "SORTIES"]),
  aRevoir: z.boolean(),
  virements: z.enum(["INCLURE", "SEULEMENT", "EXCLURE"]),
  recurrences: z.enum(["INCLURE", "SEULEMENT", "EXCLURE"]),
  ventileesSeulement: z.boolean(),
  exclueDuBudget: z.boolean(),
  exclueDesRapports: z.boolean(),
});

/** Une issue « croisée » met deux champs en contradiction : filtres-url.ts les remet tous à neutre. */
function ajouterIssue(ctx: z.RefinementCtx, chemin: string, message: string, croisee = false): void {
  ctx.addIssue({ code: z.ZodIssueCode.custom, path: [chemin], message, ...(croisee ? { params: { croisee: true } } : {}) });
}

export const schemaFiltresTransactions = objetFiltres.superRefine((filtres, ctx) => {
  if (filtres.du !== null && filtres.au !== null && filtres.du > filtres.au) {
    ajouterIssue(ctx, "au", MESSAGE_FIN_AVANT_DEBUT, true);
  }
  if (
    filtres.montantMinCents !== null &&
    filtres.montantMaxCents !== null &&
    filtres.montantMinCents > filtres.montantMaxCents
  ) {
    ajouterIssue(ctx, "montantMaxCents", MESSAGE_MAX_SOUS_MIN, true);
  }
  if (filtres.toutesDates && (filtres.du !== null || filtres.au !== null)) {
    ajouterIssue(ctx, "toutesDates", "« Toutes les dates » exclut une plage du / au.", true);
  }
});

// La sortie du schéma est ce que le domaine attend : lireEtatUrl (filtres-url.ts)
// la rend telle quelle en `FiltresTransactions`, ce que `tsc` vérifie.

export const schemaTriTransactions = z.object({
  champ: z.enum(["DATE", "MONTANT"]),
  ordre: z.enum(["ASC", "DESC"]),
});

export const schemaCurseurTransactions = z.discriminatedUnion("champ", [
  z.object({ champ: z.literal("DATE"), date: dateCivileFiltre, id: z.string().cuid(MESSAGE_ID) }),
  z.object({ champ: z.literal("MONTANT"), montantCents: z
      .number()
      .int(MESSAGE_MONTANT_ENTIER)
      .min(-Number.MAX_SAFE_INTEGER, MESSAGE_MONTANT_TROP_GRAND)
      .max(Number.MAX_SAFE_INTEGER, MESSAGE_MONTANT_TROP_GRAND),
    id: z.string().cuid(MESSAGE_ID) }),
]);

export const schemaRequetePageTransactions = z
  .object({
    filtres: schemaFiltresTransactions,
    periode: schemaPeriode,
    tri: schemaTriTransactions,
    curseur: schemaCurseurTransactions.nullable(),
  })
  .superRefine((requete, ctx) => {
    if (requete.curseur !== null && requete.curseur.champ !== requete.tri.champ) {
      ajouterIssue(ctx, "curseur", "Le curseur ne correspond pas au tri demandé.");
    }
  });

export const schemaIdentifiantTransaction = z.object({ id: z.string().cuid(MESSAGE_ID) });

// ── le formulaire du panneau Filtres : montants en chaîne (CLAUDE.md §11)

const dateFormulaire = z.string().transform((texte, ctx) => {
  const nettoye = texte.trim();
  if (nettoye === "") {
    return null;
  }
  if (!estDateCivile(nettoye)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: MESSAGE_DATE });
    return z.NEVER;
  }
  return nettoye;
});

const montantFormulaire = champMontantOptionnel({
  min: 0,
  messageIllisible: "Montant illisible. Exemple : 25,00",
  messageMin: MESSAGE_MONTANT_POSITIF,
  max: Number.MAX_SAFE_INTEGER,
  messageMax: MESSAGE_MONTANT_TROP_GRAND,
});

export const schemaFormulaireFiltres = z
  .object({
    du: dateFormulaire,
    au: dateFormulaire,
    comptes: listeIds,
    sousCategories: listeIds,
    nonCategorisee: z.boolean(),
    beneficiaires: listeIds,
    etiquettes: listeIds,
    montantMin: montantFormulaire,
    montantMax: montantFormulaire,
    sens: z.enum(["TOUT", "ENTREES", "SORTIES"]),
    aRevoir: z.boolean(),
    virements: z.enum(["INCLURE", "SEULEMENT", "EXCLURE"]),
    recurrences: z.enum(["INCLURE", "SEULEMENT", "EXCLURE"]),
    ventileesSeulement: z.boolean(),
    exclueDuBudget: z.boolean(),
    exclueDesRapports: z.boolean(),
  })
  .superRefine((valeurs, ctx) => {
    if (valeurs.du !== null && valeurs.au !== null && valeurs.du > valeurs.au) {
      ajouterIssue(ctx, "au", MESSAGE_FIN_AVANT_DEBUT);
    }
    if (valeurs.montantMin !== null && valeurs.montantMax !== null && valeurs.montantMin > valeurs.montantMax) {
      ajouterIssue(ctx, "montantMax", MESSAGE_MAX_SOUS_MIN);
    }
  });

export type ValeursFormulaireFiltres = z.input<typeof schemaFormulaireFiltres>;
export type SortieFormulaireFiltres = z.output<typeof schemaFormulaireFiltres>;

export function versValeursFormulaire(filtres: FiltresTransactions): ValeursFormulaireFiltres {
  return {
    du: filtres.du ?? "",
    au: filtres.au ?? "",
    comptes: [...filtres.comptes],
    sousCategories: [...filtres.sousCategories],
    nonCategorisee: filtres.nonCategorisee,
    beneficiaires: [...filtres.beneficiaires],
    etiquettes: [...filtres.etiquettes],
    montantMin: formatMontantChamp(filtres.montantMinCents),
    montantMax: formatMontantChamp(filtres.montantMaxCents),
    sens: filtres.sens,
    aRevoir: filtres.aRevoir,
    virements: filtres.virements,
    recurrences: filtres.recurrences,
    ventileesSeulement: filtres.ventileesSeulement,
    exclueDuBudget: filtres.exclueDuBudget,
    exclueDesRapports: filtres.exclueDesRapports,
  };
}

/** Applique la sortie du formulaire sur les filtres courants : texte conservé ; toutesDates remis à false si du ou au est posé. */
export function appliquerFormulaire(courants: FiltresTransactions, sortie: SortieFormulaireFiltres): FiltresTransactions {
  const plageSaisie = sortie.du !== null || sortie.au !== null;
  return {
    du: sortie.du,
    au: sortie.au,
    toutesDates: plageSaisie ? false : courants.toutesDates,
    texte: courants.texte,
    comptes: sortie.comptes,
    sousCategories: sortie.sousCategories,
    nonCategorisee: sortie.nonCategorisee,
    beneficiaires: sortie.beneficiaires,
    etiquettes: sortie.etiquettes,
    montantMinCents: sortie.montantMin,
    montantMaxCents: sortie.montantMax,
    sens: sortie.sens,
    aRevoir: sortie.aRevoir,
    virements: sortie.virements,
    recurrences: sortie.recurrences,
    ventileesSeulement: sortie.ventileesSeulement,
    exclueDuBudget: sortie.exclueDuBudget,
    exclueDesRapports: sortie.exclueDesRapports,
  };
}

// ── les écritures — docs/lot-m2.md §6. Un seul exemplaire des règles et des
// messages, partagé par la saisie, la modification, le formulaire et les actions.

export const LIMITE_DESCRIPTION = 200;
export const LIMITE_NOTE_TRANSACTION = 200;
export const LIMITE_NOM_BENEFICIAIRE_TRANSACTION = 60;
export const LIMITE_ETIQUETTES_TRANSACTION = 20;

export const MESSAGE_BENEFICIAIRE_NOUVEAU_VIDE = "Donne un nom au nouveau bénéficiaire, ou choisis « Aucun ».";
export const MESSAGE_EMPREINTE_EXISTANTE =
  "Une transaction identique existe déjà sur ce compte (même date, même montant, même description), ou y a existé avant d'être modifiée. Distingue la description pour enregistrer celle-ci.";
export const MESSAGE_SELECTION_TROP_GRANDE = `La sélection dépasse ${String(LIMITE_BALAYAGE)} transactions : resserre les filtres pour en viser au plus ${String(LIMITE_BALAYAGE)}. Rien n'a été modifié.`;
export const MESSAGE_AUCUNE_MODIFICATION = "Aucune modification à enregistrer.";
export const MESSAGE_ID_REPETE_SELECTION = "Une même transaction ne peut figurer qu'une fois dans la sélection.";

const MESSAGE_BENEFICIAIRE_DEUX = "Choisis un bénéficiaire existant ou saisis-en un nouveau, pas les deux.";
const MESSAGE_BENEFICIAIRE_ENTIER =
  "Le bénéficiaire se modifie en entier : choisis-en un existant, un nouveau, ou « Aucun ».";
const MESSAGE_ETIQUETTE_INVALIDE = "Étiquette invalide.";
const MESSAGE_ETIQUETTES_MAX = "Au plus 20 étiquettes.";

const champDescription = z
  .string()
  .trim()
  .min(1, "La description est obligatoire.")
  .max(LIMITE_DESCRIPTION, "200 caractères au maximum.");
const champDate = z.string().refine(estDateCivile, MESSAGE_DATE);
const champMontant = champMontantObligatoire({
  min: -MONTANT_MAX_CENTS,
  max: MONTANT_MAX_CENTS,
  messageIllisible: "Montant illisible. Exemple : -25,00",
  messageMin: "Montant trop grand.",
  messageMax: "Montant trop grand.",
});
const champPayeeId = z.string().cuid("Bénéficiaire invalide.").nullable();
const champPayeeNouveauNom = z
  .string()
  .trim()
  .min(1, MESSAGE_BENEFICIAIRE_NOUVEAU_VIDE)
  .max(LIMITE_NOM_BENEFICIAIRE_TRANSACTION, "60 caractères au maximum.")
  .nullable();
const champSousCategorie = z.string().cuid("Sous-catégorie invalide.").nullable();
const champNote = champTexteOptionnel(LIMITE_NOTE_TRANSACTION);
const champEtiquettes = z
  .array(z.string().cuid(MESSAGE_ETIQUETTE_INVALIDE))
  .max(LIMITE_ETIQUETTES_TRANSACTION, MESSAGE_ETIQUETTES_MAX)
  .refine((ids) => new Set(ids).size === ids.length, "Une étiquette ne peut figurer qu'une fois.");

function coherenceBeneficiaire(ctx: z.RefinementCtx, payeeId: string | null, payeeNouveauNom: string | null): void {
  if (payeeId !== null && payeeNouveauNom !== null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["payeeNouveauNom"], message: MESSAGE_BENEFICIAIRE_DEUX });
  }
}

export const schemaCreationTransaction = z
  .object({
    accountId: z.string().min(1, "Choisis un compte.").cuid("Choisis un compte."),
    date: champDate,
    description: champDescription,
    montant: champMontant,
    payeeId: champPayeeId,
    payeeNouveauNom: champPayeeNouveauNom,
    subcategoryId: champSousCategorie,
    note: champNote,
    tagIds: champEtiquettes,
  })
  .superRefine((valeurs, ctx) => {
    coherenceBeneficiaire(ctx, valeurs.payeeId, valeurs.payeeNouveauNom);
  });
export type EntreeCreationTransaction = z.input<typeof schemaCreationTransaction>;

// ── les virements — docs/lot-m2.md §4.4 et §6.3

const MESSAGE_DESTINATION_REQUISE = "Choisis le compte de destination.";
const MESSAGE_DESTINATION_IDENTIQUE = "Choisis un compte différent du compte de départ.";
const MESSAGE_VIREMENT_NUL = "Un virement de 0,00 $ ne se saisit pas.";
const MESSAGE_VIREMENT_SANS_SOUS_CATEGORIE = "Un virement ne porte pas de sous-catégorie.";

export const schemaLiaisonVirement = z
  .object({ id: z.string().cuid(MESSAGE_ID), contrepartieId: z.string().cuid(MESSAGE_ID) })
  .refine((v) => v.id !== v.contrepartieId, {
    path: ["contrepartieId"],
    message: "Une transaction ne se lie pas à elle-même.",
  });

export const schemaCreationContrepartie = z.object({
  id: z.string().cuid(MESSAGE_ID),
  accountId: z.string().min(1, "Choisis un compte.").cuid("Choisis un compte."),
});
export const schemaFormulaireContrepartie = schemaCreationContrepartie.pick({ accountId: true });
export type ValeursFormulaireContrepartie = z.input<typeof schemaFormulaireContrepartie>;

export const schemaSaisieVirement = z
  .object({
    accountId: z.string().min(1, "Choisis un compte.").cuid("Choisis un compte."),
    accountIdDestination: z.string().min(1, MESSAGE_DESTINATION_REQUISE).cuid(MESSAGE_DESTINATION_REQUISE),
    date: champDate,
    description: champDescription,
    montant: champMontant,
    payeeId: champPayeeId,
    payeeNouveauNom: champPayeeNouveauNom,
    note: champNote,
    tagIds: champEtiquettes,
  })
  .superRefine((valeurs, ctx) => {
    coherenceBeneficiaire(ctx, valeurs.payeeId, valeurs.payeeNouveauNom);
    if (valeurs.accountIdDestination === valeurs.accountId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["accountIdDestination"], message: MESSAGE_DESTINATION_IDENTIQUE });
    }
    if (valeurs.montant === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["montant"], message: MESSAGE_VIREMENT_NUL });
    }
  });
export type EntreeSaisieVirement = z.input<typeof schemaSaisieVirement>;

/** Le formulaire « Nouvelle transaction » : les champs de création, plus la bascule virement et le compte de destination. */
export const schemaFormulaireNouvelleTransaction = z
  .object({
    accountId: z.string().min(1, "Choisis un compte.").cuid("Choisis un compte."),
    date: champDate,
    description: champDescription,
    montant: champMontant,
    payeeId: champPayeeId,
    payeeNouveauNom: champPayeeNouveauNom,
    subcategoryId: champSousCategorie,
    note: champNote,
    tagIds: champEtiquettes,
    estVirement: z.boolean(),
    accountIdDestination: z.string().nullable(),
  })
  .superRefine((v, ctx) => {
    coherenceBeneficiaire(ctx, v.payeeId, v.payeeNouveauNom);
    if (!v.estVirement) {
      return;
    }
    if (v.accountIdDestination === null || !z.string().cuid().safeParse(v.accountIdDestination).success) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["accountIdDestination"], message: MESSAGE_DESTINATION_REQUISE });
    } else if (v.accountIdDestination === v.accountId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["accountIdDestination"], message: MESSAGE_DESTINATION_IDENTIQUE });
    }
    if (v.montant === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["montant"], message: MESSAGE_VIREMENT_NUL });
    }
    if (v.subcategoryId !== null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["subcategoryId"],
        message: MESSAGE_VIREMENT_SANS_SOUS_CATEGORIE,
      });
    }
  });
export type ValeursFormulaireNouvelleTransaction = z.input<typeof schemaFormulaireNouvelleTransaction>;

export type SaisieNouvelleTransaction =
  | { readonly type: "TRANSACTION"; readonly entree: EntreeCreationTransaction }
  | { readonly type: "VIREMENT"; readonly entree: EntreeSaisieVirement };

/** Pur. estVirement faux → TRANSACTION (sans estVirement ni accountIdDestination) ; vrai → VIREMENT (sans subcategoryId). */
export function versSaisieNouvelleTransaction(v: ValeursFormulaireNouvelleTransaction): SaisieNouvelleTransaction {
  if (v.estVirement) {
    return {
      type: "VIREMENT",
      entree: {
        accountId: v.accountId,
        accountIdDestination: v.accountIdDestination ?? "",
        date: v.date,
        description: v.description,
        montant: v.montant,
        payeeId: v.payeeId,
        payeeNouveauNom: v.payeeNouveauNom,
        note: v.note,
        tagIds: v.tagIds,
      },
    };
  }
  return {
    type: "TRANSACTION",
    entree: {
      accountId: v.accountId,
      date: v.date,
      description: v.description,
      montant: v.montant,
      payeeId: v.payeeId,
      payeeNouveauNom: v.payeeNouveauNom,
      subcategoryId: v.subcategoryId,
      note: v.note,
      tagIds: v.tagIds,
    },
  };
}

export const schemaSuppressionTransaction = z.object({
  id: z.string().cuid(MESSAGE_ID),
  virement: z.enum(CHOIX_SUPPRESSION_VIREMENT).nullable(),
});
export type EntreeSuppressionTransaction = z.input<typeof schemaSuppressionTransaction>;

/** Absent = non touché. Le bénéficiaire se modifie en entier : payeeId et payeeNouveauNom vont ensemble. */
export const schemaModificationTransaction = z
  .object({
    id: z.string().cuid(MESSAGE_ID),
    description: champDescription.optional(),
    date: champDate.optional(),
    montant: champMontant.optional(),
    payeeId: champPayeeId.optional(),
    payeeNouveauNom: champPayeeNouveauNom.optional(),
    subcategoryId: champSousCategorie.optional(),
    note: champNote.optional(),
    tagIds: champEtiquettes.optional(),
    aRevoir: z.boolean().optional(),
    exclureDuBudget: z.boolean().optional(),
    exclureDesRapports: z.boolean().optional(),
  })
  .superRefine((valeurs, ctx) => {
    const champs: readonly unknown[] = [
      valeurs.description,
      valeurs.date,
      valeurs.montant,
      valeurs.payeeId,
      valeurs.payeeNouveauNom,
      valeurs.subcategoryId,
      valeurs.note,
      valeurs.tagIds,
      valeurs.aRevoir,
      valeurs.exclureDuBudget,
      valeurs.exclureDesRapports,
    ];
    if (champs.every((valeur) => valeur === undefined)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: MESSAGE_AUCUNE_MODIFICATION });
    }
    if ((valeurs.payeeId === undefined) !== (valeurs.payeeNouveauNom === undefined)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["payeeNouveauNom"], message: MESSAGE_BENEFICIAIRE_ENTIER });
    } else if (valeurs.payeeId !== undefined && valeurs.payeeNouveauNom !== undefined) {
      coherenceBeneficiaire(ctx, valeurs.payeeId, valeurs.payeeNouveauNom);
    }
  });
export type EntreeModificationTransaction = z.input<typeof schemaModificationTransaction>;

/** Le formulaire du panneau : les mêmes champs, tous présents, sans id ni compte. */
export const schemaFormulaireModification = z
  .object({
    description: champDescription,
    date: champDate,
    montant: champMontant,
    payeeId: champPayeeId,
    payeeNouveauNom: champPayeeNouveauNom,
    subcategoryId: champSousCategorie,
    note: champNote,
    tagIds: champEtiquettes,
    aRevoir: z.boolean(),
    exclureDuBudget: z.boolean(),
    exclureDesRapports: z.boolean(),
  })
  .superRefine((valeurs, ctx) => {
    coherenceBeneficiaire(ctx, valeurs.payeeId, valeurs.payeeNouveauNom);
  });
export type ValeursFormulaireModification = z.input<typeof schemaFormulaireModification>;
export type SortieFormulaireModification = z.output<typeof schemaFormulaireModification>;

export function versValeursModification(detail: DetailTransaction): ValeursFormulaireModification {
  return {
    description: detail.description,
    date: detail.date,
    montant: formatMontantChamp(detail.montantCents),
    payeeId: detail.payeeId,
    payeeNouveauNom: null,
    subcategoryId: detail.subcategoryId,
    note: detail.note ?? "",
    tagIds: detail.etiquettes.map((etiquette) => etiquette.id),
    aRevoir: detail.aRevoir,
    exclureDuBudget: detail.exclureDuBudget,
    exclureDesRapports: detail.exclureDesRapports,
  };
}

function memesIds(a: readonly string[], b: readonly string[]): boolean {
  const ensemble = new Set(a);
  return ensemble.size === new Set(b).size && b.every((id) => ensemble.has(id));
}

/**
 * Les seuls champs dont la valeur convertie diffère du détail, au format
 * d'entrée de l'action : le montant part en chaîne (la valeur saisie), le
 * reste tel que l'action l'attend. null si rien ne change.
 */
export function changementsModification(
  detail: DetailTransaction,
  valeurs: ValeursFormulaireModification,
  sortie: SortieFormulaireModification,
): EntreeModificationTransaction | null {
  const beneficiaireInchange = sortie.payeeNouveauNom === null && sortie.payeeId === detail.payeeId;
  const changements: Omit<EntreeModificationTransaction, "id"> = {
    ...(sortie.description !== detail.description ? { description: sortie.description } : {}),
    ...(sortie.date !== detail.date ? { date: sortie.date } : {}),
    ...(sortie.montant !== detail.montantCents ? { montant: valeurs.montant } : {}),
    ...(beneficiaireInchange ? {} : { payeeId: sortie.payeeId, payeeNouveauNom: sortie.payeeNouveauNom }),
    ...(sortie.subcategoryId !== detail.subcategoryId ? { subcategoryId: sortie.subcategoryId } : {}),
    ...(sortie.note !== detail.note ? { note: sortie.note } : {}),
    ...(memesIds(
      sortie.tagIds,
      detail.etiquettes.map((etiquette) => etiquette.id),
    )
      ? {}
      : { tagIds: sortie.tagIds }),
    ...(sortie.aRevoir !== detail.aRevoir ? { aRevoir: sortie.aRevoir } : {}),
    ...(sortie.exclureDuBudget !== detail.exclureDuBudget ? { exclureDuBudget: sortie.exclureDuBudget } : {}),
    ...(sortie.exclureDesRapports !== detail.exclureDesRapports ? { exclureDesRapports: sortie.exclureDesRapports } : {}),
  };
  return Object.keys(changements).length === 0 ? null : { id: detail.id, ...changements };
}

// ── la ventilation — docs/lot-m2.md §4.2. L'action valide la forme (schemaVentilation) ; le repository applique
// validerVentilation contre le parent lu en base. Le formulaire, qui connaît le parent, l'applique tout de suite :
// un seul jeu de messages des deux côtés.

const objetLigneVentilation = z.object({
  subcategoryId: champSousCategorie,
  montant: champMontant,
  note: champNote,
  tagIds: champEtiquettes,
});

export const schemaLignesVentilation = z
  .array(objetLigneVentilation)
  .max(LIMITE_LIGNES_VENTILATION, `Une ventilation compte au plus ${LIMITE_LIGNES_VENTILATION} lignes.`);

export const schemaVentilation = z.object({ id: z.string().cuid(MESSAGE_ID), lignes: schemaLignesVentilation });
export type EntreeVentilation = z.input<typeof schemaVentilation>;

/** Le formulaire du panneau : les mêmes lignes, plus validerVentilation contre le parent connu du client. */
export function schemaFormulaireVentilation(parent: ParentVentilation) {
  return z.object({ lignes: schemaLignesVentilation }).superRefine((valeurs, ctx) => {
    // Une ligne dont le montant est illisible porte déjà son message : on ne calcule pas sur du vide.
    if (valeurs.lignes.some((ligne) => !Number.isInteger(ligne.montant))) {
      return;
    }
    for (const erreur of validerVentilation(
      parent,
      valeurs.lignes.map((ligne) => ({ montantCents: ligne.montant })),
    )) {
      const surLeMontant = erreur.motif === "LIGNE_A_ZERO" || erreur.motif === "SIGNE_OPPOSE";
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: surLeMontant ? ["lignes", erreur.rang, "montant"] : ["lignes"],
        message: messageErreurVentilation(erreur),
      });
    }
  });
}
export type ValeursFormulaireVentilation = z.input<ReturnType<typeof schemaFormulaireVentilation>>;

// ── sélection et gestes de masse

export const schemaSelectionTransactions = z
  .discriminatedUnion("type", [
    z.object({
      type: z.literal("IDS"),
      ids: z
        .array(z.string().cuid(MESSAGE_ID))
        .min(1, "Aucune transaction sélectionnée.")
        .max(LIMITE_BALAYAGE, MESSAGE_SELECTION_TROP_GRANDE),
    }),
    z.object({ type: z.literal("FILTRE"), filtres: schemaFiltresTransactions, periode: schemaPeriode }),
  ])
  .superRefine((selection, ctx) => {
    if (selection.type === "IDS" && new Set(selection.ids).size !== selection.ids.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["ids"], message: MESSAGE_ID_REPETE_SELECTION });
    }
  });

export const schemaGesteMasse = z
  .discriminatedUnion("type", [
    z.object({
      type: z.literal("SOUS_CATEGORIE"),
      subcategoryId: z.string({ invalid_type_error: "Choisis une sous-catégorie." }).cuid("Choisis une sous-catégorie."),
    }),
    z.object({
      type: z.literal("BENEFICIAIRE"),
      payeeId: z.string({ invalid_type_error: "Choisis un bénéficiaire." }).cuid("Choisis un bénéficiaire."),
    }),
    z.object({
      type: z.literal("ETIQUETTES"),
      ajouter: z.array(z.string().cuid(MESSAGE_ETIQUETTE_INVALIDE)).max(LIMITE_ETIQUETTES_TRANSACTION, MESSAGE_ETIQUETTES_MAX),
      retirer: z.array(z.string().cuid(MESSAGE_ETIQUETTE_INVALIDE)).max(LIMITE_ETIQUETTES_TRANSACTION, MESSAGE_ETIQUETTES_MAX),
    }),
    z.object({ type: z.literal("A_REVOIR"), valeur: z.boolean() }),
    z.object({ type: z.literal("EXCLURE_BUDGET"), valeur: z.boolean() }),
    z.object({ type: z.literal("EXCLURE_RAPPORTS"), valeur: z.boolean() }),
    z.object({ type: z.literal("SUPPRIMER"), virements: z.enum(CHOIX_SUPPRESSION_VIREMENT).nullable() }),
  ])
  .superRefine((geste, ctx) => {
    if (geste.type !== "ETIQUETTES") {
      return;
    }
    if (geste.ajouter.length === 0 && geste.retirer.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["ajouter"],
        message: "Choisis au moins une étiquette à ajouter ou à retirer.",
      });
    }
    if (geste.ajouter.some((id) => geste.retirer.includes(id))) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["retirer"],
        message: "Une étiquette ne peut pas être à la fois ajoutée et retirée.",
      });
    }
  });

export const schemaModificationMasse = z.object({ selection: schemaSelectionTransactions, geste: schemaGesteMasse });
export const schemaApercuSuppression = z.object({ selection: schemaSelectionTransactions });
export type EntreeModificationMasse = z.input<typeof schemaModificationMasse>;
