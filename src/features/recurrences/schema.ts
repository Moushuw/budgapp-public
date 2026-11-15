// Les schémas partagés par les formulaires de récurrence et par leurs Server
// Actions — docs/lot-m3.md §4.6. Un seul exemplaire des règles et des messages
// (CLAUDE.md §9). Le montant et les tolérances voyagent en chaîne jusqu'à
// l'action, qui les convertit (CLAUDE.md §11).

import { z } from "zod";
import { ajouterMois, dateCivileDansFuseau, estDateCivile, FUSEAU_APPLICATION } from "@/domain/dates";
import { MONTANT_MAX_CENTS } from "@/domain/edition";
import { normaliserDescription } from "@/domain/ingestion/normaliser";
import {
  ANCIENNETE_ANCRAGE_MAX_ANS,
  CADENCES_RECURRENCE,
  PORTIONS_OCCURRENCES,
  TOLERANCE_JOURS_MAX,
  type ChampsRecurrence,
} from "@/domain/recurrence";
import { NATURES_RECURRENCE } from "@/domain/referentiel";
import { champEntierObligatoire, champMontantObligatoire } from "@/lib/champs-formulaire";

export const LIMITE_LIBELLE_RECURRENCE = 80;
export const LIMITE_MOTIF_RECURRENCE = 200;

const MESSAGE_ID = "Identifiant invalide.";
const MESSAGE_DATE = "Date invalide (AAAA-MM-JJ attendu).";

const identifiant = z.string().cuid(MESSAGE_ID);
const dateCivileChamp = z.string().refine(estDateCivile, MESSAGE_DATE);

const champMontantRecurrence = champMontantObligatoire({
  min: -MONTANT_MAX_CENTS,
  max: MONTANT_MAX_CENTS,
  messageIllisible: "Montant illisible. Exemple : -17,99",
  messageMin: "Montant trop grand.",
  messageMax: "Montant trop grand.",
});

const schemaChampsBase = z.object({
  libelle: z
    .string()
    .trim()
    .min(1, "Le libellé est obligatoire.")
    .max(LIMITE_LIBELLE_RECURRENCE, `${LIMITE_LIBELLE_RECURRENCE} caractères au maximum.`),
  nature: z.enum(NATURES_RECURRENCE, { message: "Choisis une nature." }),
  montant: champMontantRecurrence,
  cadence: z.enum(CADENCES_RECURRENCE, { message: "Choisis une cadence." }),
  dateAncrage: dateCivileChamp,
  subcategoryId: z.string().cuid("Sous-catégorie invalide.").nullable(),
  motifRapprochement: z
    .string()
    .max(LIMITE_MOTIF_RECURRENCE, `${LIMITE_MOTIF_RECURRENCE} caractères au maximum.`)
    .transform(normaliserDescription)
    .refine((motif) => motif !== "", "Le motif de rapprochement est obligatoire."),
  toleranceMontant: champMontantObligatoire({
    min: 0,
    max: MONTANT_MAX_CENTS,
    messageIllisible: "Montant illisible. Exemple : 5,00",
    messageMin: "La tolérance de montant ne peut pas être négative.",
    messageMax: "Montant trop grand.",
  }),
  toleranceJours: champEntierObligatoire({
    min: 0,
    max: TOLERANCE_JOURS_MAX,
    messageIllisible: "Nombre entier de jours attendu.",
    messageBorne: `La tolérance de jours va de 0 à ${TOLERANCE_JOURS_MAX}.`,
  }),
});

// La borne d'ancienneté ne vaut qu'à la création et à la confirmation : une
// modification ne matérialise que les échéances d'aujourd'hui ou après.
export const schemaChampsRecurrence = schemaChampsBase.extend({
  dateAncrage: dateCivileChamp.refine(
    (date) => date >= ajouterMois(dateCivileDansFuseau(new Date(), FUSEAU_APPLICATION), -12 * ANCIENNETE_ANCRAGE_MAX_ANS),
    `La date d'ancrage ne peut pas remonter à plus de ${ANCIENNETE_ANCRAGE_MAX_ANS} ans.`,
  ),
});
export const schemaChampsModificationRecurrence = schemaChampsBase;

const champCompte = z.string().min(1, "Choisis un compte.").cuid("Choisis un compte.");

export const schemaFormulaireRecurrence = schemaChampsRecurrence.extend({ accountId: champCompte });
export const schemaFormulaireModificationRecurrence = schemaChampsModificationRecurrence.extend({ accountId: champCompte });

export const schemaConfirmationSuggestion = z.object({ suggestionId: identifiant, champs: schemaChampsRecurrence });
export const schemaCreationRecurrence = z.object({
  accountId: champCompte,
  transactionId: identifiant.nullable(),
  champs: schemaChampsRecurrence,
});
export const schemaModificationRecurrence = z.object({ id: identifiant, champs: schemaChampsModificationRecurrence });
export const schemaTerminaisonRecurrence = z.object({ id: identifiant, dateFin: dateCivileChamp });
export const schemaFormulaireTerminaison = z.object({ dateFin: dateCivileChamp });
export const schemaIdentifiant = z.object({ id: identifiant });
export const schemaIdentifiantOccurrence = z.object({ occurrenceId: identifiant });
export const schemaIdentifiantTransactionRecurrence = z.object({ transactionId: identifiant });
export const schemaLiaisonOccurrence = z.object({ occurrenceId: identifiant, transactionId: identifiant });
export const schemaMontantOccurrence = z.object({ occurrenceId: identifiant, montant: champMontantRecurrence });
export const schemaFormulaireMontantOccurrence = z.object({ montant: champMontantRecurrence });
export const schemaPageOccurrences = z.object({
  ruleId: identifiant,
  curseur: z.object({ echeance: dateCivileChamp, id: identifiant }).nullable(),
  portion: z.enum(PORTIONS_OCCURRENCES),
});

export type ValeursFormulaireRecurrence = z.input<typeof schemaFormulaireRecurrence>;
export type EntreeChampsRecurrence = z.input<typeof schemaChampsRecurrence>;

/** Sortie du schéma → ChampsRecurrence du domaine (montant → montantCents, toleranceMontant → toleranceCents). */
export function versChampsRecurrence(sortie: z.output<typeof schemaChampsRecurrence>): ChampsRecurrence {
  return {
    libelle: sortie.libelle,
    nature: sortie.nature,
    montantCents: sortie.montant,
    cadence: sortie.cadence,
    dateAncrage: sortie.dateAncrage,
    subcategoryId: sortie.subcategoryId,
    motifRapprochement: sortie.motifRapprochement,
    toleranceCents: sortie.toleranceMontant,
    toleranceJours: sortie.toleranceJours,
  };
}
