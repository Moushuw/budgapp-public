"use client";

import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import { toast } from "sonner";
import { deballer } from "@/lib/action-result";
import { queryKeys } from "@/lib/query-keys";
import {
  archiverCompte,
  creerCompte,
  modifierCompte,
  supprimerCompte,
  type CompteListe,
} from "@/server/actions/accounts";
import type { EntreeCompte, ModificationCompte } from "./schema";

// Hook d'écriture, séparé du hook de lecture — CLAUDE.md §8.
export function useCompteMutations(): {
  readonly creer: UseMutationResult<CompteListe, Error, EntreeCompte>;
  readonly modifier: UseMutationResult<{ id: string }, Error, ModificationCompte>;
  readonly archiver: UseMutationResult<{ id: string; archive: boolean }, Error, { id: string; archive: boolean }>;
  readonly supprimer: UseMutationResult<{ id: string }, Error, { id: string }>;
} {
  const queryClient = useQueryClient();

  const creer = useMutation({
    mutationFn: async (entree: EntreeCompte) => deballer(await creerCompte(entree)),
    onSuccess: () =>
      queryClient
        .invalidateQueries({ queryKey: queryKeys.comptes.all })
        .then(() => {
          toast.success("Compte créé.");
        }),
    onError: (erreur) => {
      toast.error(erreur.message);
    },
  });

  const modifier = useMutation({
    mutationFn: async (entree: ModificationCompte) => deballer(await modifierCompte(entree)),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.comptes.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.soldes.all }),
      ]).then(() => {
        toast.success("Compte modifié.");
      }),
    onError: (erreur) => {
      toast.error(erreur.message);
    },
  });

  const archiver = useMutation({
    mutationFn: async (entree: { id: string; archive: boolean }) => deballer(await archiverCompte(entree)),
    onSuccess: (donnees) =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.comptes.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.soldes.all }),
      ]).then(() => {
        toast.success(donnees.archive ? "Compte archivé." : "Compte restauré.");
      }),
    onError: (erreur) => {
      toast.error(erreur.message);
    },
  });

  const supprimer = useMutation({
    mutationFn: async (entree: { id: string }) => deballer(await supprimerCompte(entree)),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.comptes.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.soldes.all }),
      ]).then(() => {
        toast.success("Compte supprimé.");
      }),
    onError: (erreur) => {
      toast.error(erreur.message);
    },
  });

  return { creer, modifier, archiver, supprimer };
}
