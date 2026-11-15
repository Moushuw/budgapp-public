// Schéma zod unique, partagé par le formulaire (zodResolver) et l'action —
// CLAUDE.md §9. zod v3 est installé (^3.25.76).

import { z } from "zod";
import { champMontantOptionnel } from "@/lib/champs-formulaire";

export const COULEUR_HEXADECIMALE = /^#[0-9a-fA-F]{6}$/;

// ChampMontant émet la chaîne saisie telle quelle (jamais un Cents | null) :
// c'est ici, pas dans le composant, qu'un champ vide et une saisie illisible
// cessent d'être indistinguables. safeParse échoue sur l'illisible avec un
// message que <FormMessage /> affiche ; une chaîne vide reste un choix valide
// (pas de cible).
const champCibleMensuelle = champMontantOptionnel({
  min: 0,
  messageMin: "La cible ne peut pas être négative.",
});

export const schemaEtiquette = z.object({
  nom: z
    .string()
    .trim()
    .min(1, "Le nom est obligatoire.")
    .max(60, "60 caractères au maximum."),
  couleur: z
    .string()
    .regex(COULEUR_HEXADECIMALE, "Couleur hexadécimale attendue, par exemple #f59e0b.")
    .nullable(),
  cibleMensuelleCents: champCibleMensuelle,
});

/** Ce que le formulaire détient et envoie sur le fil : cibleMensuelleCents est du texte, converti côté schéma. */
export type EntreeEtiquette = z.input<typeof schemaEtiquette>;

export const schemaModificationEtiquette = schemaEtiquette.extend({
  id: z.string().cuid(),
});

/** Ce qui part sur le fil pour une modification : mêmes champs texte qu'EntreeEtiquette, plus l'id. */
export type ModificationEtiquette = z.input<typeof schemaModificationEtiquette>;

export const schemaIdentifiantEtiquette = z.object({
  id: z.string().cuid(),
});
