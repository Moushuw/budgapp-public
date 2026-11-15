"use client";

// Le seul hook d'écriture des récurrences — CLAUDE.md §8 : une ligne de tableau ou une carte
// n'importe jamais celui-ci, l'écran le crée une fois et passe des rappels. Toute écriture
// invalide les récurrences ET les transactions : une liaison change le détail et le filtre.

import { useMutation, useQueryClient, type QueryClient, type UseMutationResult } from "@tanstack/react-query";
import { toast } from "sonner";
import type { z } from "zod";
import { deballer, deballerAvecCode } from "@/lib/action-result";
import { queryKeys } from "@/lib/query-keys";
import {
  confirmerSuggestion,
  creerRecurrence,
  delierOccurrence,
  ignorerOccurrence,
  lierOccurrence,
  modifierMontantOccurrence,
  modifierRecurrence,
  rechercherRecurrences,
  refuserSuggestion,
  retablirOccurrence,
  supprimerRecurrence,
  terminerRecurrence,
  type CompteRenduLiaisonRetroactive,
  type ResultatRecherche,
} from "@/server/actions/recurrences";
import type { ActionResult } from "@/server/actions/define-action";
import {
  libelleCreation,
  libelleModification,
  libelleRecherche,
  libelleSuppressionSerie,
  libelleTerminaison,
  lignesCompteRenduConfirmation,
} from "./libelles";
import type {
  schemaConfirmationSuggestion,
  schemaCreationRecurrence,
  schemaModificationRecurrence,
  schemaMontantOccurrence,
  schemaTerminaisonRecurrence,
} from "./schema";

type Donnees<T extends (...args: never[]) => Promise<ActionResult<unknown>>> =
  Awaited<ReturnType<T>> extends ActionResult<infer D> ? D : never;

function invalider(queryClient: QueryClient): Promise<unknown[]> {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.recurrences.all }),
    queryClient.invalidateQueries({ queryKey: queryKeys.transactions.all }),
  ]);
}

function annoncer(titre: string, details: readonly string[]): void {
  if (details.length > 0) {
    toast.success(titre, { description: details.join(" ") });
  } else {
    toast.success(titre);
  }
}

export function useRecurrenceMutations(): {
  readonly rechercher: UseMutationResult<ResultatRecherche, Error, void>;
  readonly refuser: UseMutationResult<{ id: string }, Error, { readonly id: string }>;
  readonly confirmer: UseMutationResult<
    CompteRenduLiaisonRetroactive,
    Error,
    z.input<typeof schemaConfirmationSuggestion>
  >;
  readonly creer: UseMutationResult<Donnees<typeof creerRecurrence>, Error, z.input<typeof schemaCreationRecurrence>>;
  readonly modifier: UseMutationResult<
    Donnees<typeof modifierRecurrence>,
    Error,
    z.input<typeof schemaModificationRecurrence>
  >;
  readonly terminer: UseMutationResult<
    Donnees<typeof terminerRecurrence>,
    Error,
    z.input<typeof schemaTerminaisonRecurrence>
  >;
  readonly supprimer: UseMutationResult<Donnees<typeof supprimerRecurrence>, Error, { readonly id: string }>;
  readonly lier: UseMutationResult<
    Donnees<typeof lierOccurrence>,
    Error,
    { readonly occurrenceId: string; readonly transactionId: string }
  >;
  readonly delier: UseMutationResult<Donnees<typeof delierOccurrence>, Error, { readonly occurrenceId: string }>;
  readonly ignorer: UseMutationResult<Donnees<typeof ignorerOccurrence>, Error, { readonly occurrenceId: string }>;
  readonly retablir: UseMutationResult<Donnees<typeof retablirOccurrence>, Error, { readonly occurrenceId: string }>;
  readonly modifierMontant: UseMutationResult<
    Donnees<typeof modifierMontantOccurrence>,
    Error,
    z.input<typeof schemaMontantOccurrence>
  >;
} {
  const queryClient = useQueryClient();
  const surErreur = (erreur: Error): void => {
    toast.error(erreur.message);
  };

  const rechercher = useMutation({
    mutationFn: async () => deballer(await rechercherRecurrences({})),
    onSuccess: (donnees) =>
      invalider(queryClient).then(() => {
        toast.success(libelleRecherche(donnees));
      }),
    onError: surErreur,
  });

  const refuser = useMutation({
    mutationFn: async (entree: { readonly id: string }) => deballer(await refuserSuggestion(entree)),
    onSuccess: () =>
      invalider(queryClient).then(() => {
        toast.success("Suggestion refusée : elle ne sera plus proposée.");
      }),
    onError: surErreur,
  });

  const confirmer = useMutation({
    mutationFn: async (entree: z.input<typeof schemaConfirmationSuggestion>) =>
      deballer(await confirmerSuggestion(entree)),
    onSuccess: (donnees) =>
      invalider(queryClient).then(() => {
        const { titre, details } = lignesCompteRenduConfirmation(donnees);
        annoncer(titre, details);
      }),
    onError: surErreur,
  });

  const creer = useMutation({
    mutationFn: async (entree: z.input<typeof schemaCreationRecurrence>) => deballer(await creerRecurrence(entree)),
    onSuccess: (donnees, entree) =>
      invalider(queryClient).then(() => {
        // La tolérance saisie est une chaîne ; l'action l'a déjà validée, elle est lisible.
        const { titre, details } = libelleCreation({
          libelle: donnees.libelle,
          toleranceJours: Number(entree.champs.toleranceJours),
          transaction: donnees.transaction,
        });
        annoncer(titre, details);
      }),
    onError: surErreur,
  });

  const modifier = useMutation({
    mutationFn: async (entree: z.input<typeof schemaModificationRecurrence>) =>
      deballer(await modifierRecurrence(entree)),
    onSuccess: (donnees) =>
      invalider(queryClient).then(() => {
        toast.success(libelleModification(donnees.echeancesCreees));
      }),
    onError: surErreur,
  });

  const terminer = useMutation({
    // Pas de toast d'erreur : le dialogue reste ouvert et affiche le refus, avec son code.
    mutationFn: async (entree: z.input<typeof schemaTerminaisonRecurrence>) =>
      deballerAvecCode(await terminerRecurrence(entree)),
    onSuccess: (donnees) =>
      invalider(queryClient).then(() => {
        toast.success(libelleTerminaison(donnees.echeancesRetirees, donnees.dontIgnorees));
      }),
  });

  const supprimer = useMutation({
    mutationFn: async (entree: { readonly id: string }) => deballer(await supprimerRecurrence(entree)),
    onSuccess: (donnees) =>
      invalider(queryClient).then(() => {
        toast.success(libelleSuppressionSerie(donnees.liaisonsDefaites));
      }),
    onError: surErreur,
  });

  const lier = useMutation({
    mutationFn: async (entree: { readonly occurrenceId: string; readonly transactionId: string }) =>
      deballer(await lierOccurrence(entree)),
    onSuccess: () =>
      invalider(queryClient).then(() => {
        toast.success("Paiement lié à son échéance.");
      }),
    onError: surErreur,
  });

  const delier = useMutation({
    mutationFn: async (entree: { readonly occurrenceId: string }) => deballer(await delierOccurrence(entree)),
    onSuccess: () =>
      invalider(queryClient).then(() => {
        toast.success("Paiement délié de son échéance.");
      }),
    onError: surErreur,
  });

  const ignorer = useMutation({
    mutationFn: async (entree: { readonly occurrenceId: string }) => deballer(await ignorerOccurrence(entree)),
    onSuccess: () =>
      invalider(queryClient).then(() => {
        toast.success("Échéance ignorée.");
      }),
    onError: surErreur,
  });

  const retablir = useMutation({
    mutationFn: async (entree: { readonly occurrenceId: string }) => deballer(await retablirOccurrence(entree)),
    onSuccess: () =>
      invalider(queryClient).then(() => {
        toast.success("Échéance rétablie.");
      }),
    onError: surErreur,
  });

  const modifierMontant = useMutation({
    mutationFn: async (entree: z.input<typeof schemaMontantOccurrence>) =>
      deballer(await modifierMontantOccurrence(entree)),
    onSuccess: () =>
      invalider(queryClient).then(() => {
        toast.success("Montant de l'échéance modifié.");
      }),
    onError: surErreur,
  });

  return { rechercher, refuser, confirmer, creer, modifier, terminer, supprimer, lier, delier, ignorer, retablir, modifierMontant };
}
