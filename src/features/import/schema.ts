// Schéma zod partagé formulaire/action — docs/lot-m1.md §6.4 et §7. zod v3
// (^3.25.76) : superRefine, z.ZodIssueCode.custom, z.input / z.output. Suit
// la forme de src/features/regles/schema.ts.

import { z } from "zod";
import { estDateCivile } from "@/domain/dates";
import { occurrencesEnDouble } from "@/domain/recurrence";
import { LIMITE_LIGNES_VENTILATION, messageErreurVentilation, validerVentilation } from "@/domain/ventilation";
import { ciblesEnDouble } from "@/domain/virement";
import { champMontantObligatoire, champTexteOptionnel } from "@/lib/champs-formulaire";

export const LIMITE_LIGNES_IMPORT = 1000;
export const LIMITE_TEXTE_RELEVE = 500_000;

export const LIMITE_NOTE = 200;
export const LIMITE_NOM_BENEFICIAIRE = 60;
export const LIMITE_TYPE_OPERATION = 200;

const MESSAGE_DATE_INVALIDE = "Date invalide. Format attendu : AAAA-MM-JJ.";

// Partagés avec la revue (etat-revue.ts), qui les affiche sous le champ de la
// ligne fautive : le serveur rend le même message (defineAction et le filet
// d'import-batches.ts) mais ne sait pas dire quelle ligne est en cause.
export const MESSAGE_BENEFICIAIRE_NOUVEAU_VIDE = "Donne un nom au nouveau bénéficiaire, ou choisis « Aucun ».";

export const MESSAGE_COMPTE_REQUIS = "Choisis un compte.";
export const MESSAGE_COMPTE_INVALIDE = "Ce compte n'est pas valide. Choisis-en un dans la liste.";

export const schemaAnalyse = z.object({
  accountId: z.string().min(1, MESSAGE_COMPTE_REQUIS).cuid(MESSAGE_COMPTE_INVALIDE),
  annee: z.number().int().min(2000).max(2100),
  profilId: z.string().min(1).max(60),
  texte: z.string().min(1, "Colle un relevé avant d'analyser.").max(LIMITE_TEXTE_RELEVE),
});

export const schemaLigneManuelle = z.object({
  cle: z.string().min(1).max(60),
  accountId: z.string().cuid(),
  date: z.string().refine(estDateCivile, MESSAGE_DATE_INVALIDE),
  description: z.string().trim().min(1, "La description est obligatoire.").max(200),
  montant: champMontantObligatoire(), // chaîne → Cents, CLAUDE.md §11
  numeroLigne: z.number().int().min(1).nullable(),
  ligneBrute: z.string().max(500).nullable(),
});

const objetLigneVentilationImport = z.object({
  subcategoryId: z.string().cuid().nullable(),
  montant: champMontantObligatoire(), // chaîne → cents
});

const objetLigneImport = z.object({
  cle: z.string().min(1).max(60),
  action: z.enum(["IMPORTER", "METTRE_A_JOUR"]),
  transactionExistanteId: z.string().cuid().nullable(),
  accountId: z.string().cuid(),
  date: z.string().refine(estDateCivile, MESSAGE_DATE_INVALIDE),
  description: z.string().trim().min(1, "La description est obligatoire.").max(200),
  typeOperation: z.string().min(1).max(LIMITE_TYPE_OPERATION).nullable(),
  montant: champMontantObligatoire(),
  note: champTexteOptionnel(LIMITE_NOTE),
  payeeId: z.string().cuid().nullable(),
  payeeNouveauNom: z
    .string()
    .trim()
    .min(1, MESSAGE_BENEFICIAIRE_NOUVEAU_VIDE)
    .max(LIMITE_NOM_BENEFICIAIRE, `${LIMITE_NOM_BENEFICIAIRE} caractères au maximum.`)
    .nullable(),
  subcategoryId: z.string().cuid().nullable(),
  tagIds: z.array(z.string().cuid()).max(20),
  externalId: z.string().max(120).nullable(),
  appliedRuleId: z.string().cuid().nullable(),
  /** Posée par une règle VENTILER (docs/lot-m2.md §4.3) : les filles, en chaînes jusqu'à l'action. */
  ventilation: z.array(objetLigneVentilationImport).max(LIMITE_LIGNES_VENTILATION).nullable(),
  aRevoir: z.boolean(),
  exclureDuBudget: z.boolean(),
  exclureDesRapports: z.boolean(),
  /** docs/lot-m2.md §4.5 : la transaction d'un autre compte dont cette ligne est l'autre côté. */
  virementAvec: z.string().cuid().nullable(),
  /** docs/lot-m3.md §4.5 : l'occurrence ouverte que cette ligne réalise. */
  occurrenceAvec: z.string().cuid().nullable(),
  occurrenceAuto: z.boolean(),
});

function coherenceLigneImport(valeurs: z.output<typeof objetLigneImport>, ctx: z.RefinementCtx): void {
  if (valeurs.occurrenceAvec !== null && valeurs.action === "METTRE_A_JOUR") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["occurrenceAvec"],
      message: "Une mise à jour ne se lie pas à une échéance.",
    });
  }
  if (valeurs.occurrenceAuto && valeurs.occurrenceAvec === null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["occurrenceAuto"],
      message: "Un rapprochement automatique vise une échéance.",
    });
  }

  if (valeurs.virementAvec !== null) {
    if (valeurs.action === "METTRE_A_JOUR") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["virementAvec"],
        message: "Une mise à jour ne pose pas de virement.",
      });
    }
    if (valeurs.subcategoryId !== null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["subcategoryId"],
        message: "Une ligne marquée virement ne porte pas de sous-catégorie.",
      });
    }
    if (valeurs.ventilation !== null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["ventilation"],
        message: "Une ligne marquée virement ne se ventile pas.",
      });
    }
  }

  if (valeurs.payeeId !== null && valeurs.payeeNouveauNom !== null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["payeeNouveauNom"],
      message: "Choisis un bénéficiaire existant ou saisis-en un nouveau, pas les deux.",
    });
  }

  if (valeurs.action === "METTRE_A_JOUR" && valeurs.transactionExistanteId === null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["transactionExistanteId"],
      message: "Une mise à jour vise une transaction existante.",
    });
  }

  const ventilation = valeurs.ventilation;
  if (ventilation === null) {
    return;
  }
  if (valeurs.action === "METTRE_A_JOUR") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["ventilation"],
      message: "Une mise à jour ne pose pas de ventilation.",
    });
  }
  if (valeurs.subcategoryId !== null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["subcategoryId"],
      message: "Une ligne ventilée ne porte pas de sous-catégorie : ce sont ses lignes qui la portent.",
    });
  }
  // Un montant illisible porte déjà son message : on ne calcule pas sur du vide.
  if (!Number.isInteger(valeurs.montant) || ventilation.some((fille) => !Number.isInteger(fille.montant))) {
    return;
  }
  const [premiere] = validerVentilation(
    { montantCents: valeurs.montant, estFille: false, estVirement: false },
    ventilation.map((fille) => ({ montantCents: fille.montant })),
  );
  if (premiere !== undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["ventilation"],
      message: messageErreurVentilation(premiere),
    });
  }
}

export const schemaLigneImport = objetLigneImport.superRefine(coherenceLigneImport);

export const schemaEnregistrementImport = z
  .object({
    accountId: z.string().cuid(),
    libelle: z.string().trim().max(120).nullable(),
    lignes: z.array(schemaLigneImport).min(1, "Aucune ligne à enregistrer.").max(LIMITE_LIGNES_IMPORT),
  })
  .superRefine((valeurs, ctx) => {
    // Deux lignes ne se lient pas à la même transaction : la seconde est refusée (docs/lot-m2.md §4.5).
    const doublons = ciblesEnDouble(valeurs.lignes.map((ligne, i) => ({ cle: String(i), virementAvec: ligne.virementAvec })));
    for (const rang of doublons.keys()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["lignes", Number(rang), "virementAvec"],
        message: "Deux lignes visent le même virement.",
      });
    }
    const doublonsOccurrence = occurrencesEnDouble(
      valeurs.lignes.map((ligne, i) => ({ cle: String(i), occurrenceAvec: ligne.occurrenceAvec })),
    );
    for (const rang of doublonsOccurrence.keys()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["lignes", Number(rang), "occurrenceAvec"],
        message: "Deux lignes visent la même échéance.",
      });
    }
  });

export type EntreeAnalyse = z.input<typeof schemaAnalyse>;
export type EntreeLigneManuelle = z.input<typeof schemaLigneManuelle>;
export type EntreeLigneImport = z.input<typeof schemaLigneImport>;
export type EntreeEnregistrementImport = z.input<typeof schemaEnregistrementImport>;
