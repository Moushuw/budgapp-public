"use client";

import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import { toast } from "sonner";
import { deballer } from "@/lib/action-result";
import { queryKeys } from "@/lib/query-keys";
import { creerEtiquette, modifierEtiquette, supprimerEtiquette, type EtiquetteListe } from "@/server/actions/tags";
import type { EntreeEtiquette, ModificationEtiquette } from "./schema";

// Hook d'écriture, séparé du hook de lecture — CLAUDE.md §8 : un composant de
// cellule de tableau n'importe que useEtiquettes, jamais celui-ci.
export function useEtiquetteMutations(): {
  readonly creer: UseMutationResult<EtiquetteListe, Error, EntreeEtiquette>;
  readonly modifier: UseMutationResult<{ id: string }, Error, ModificationEtiquette>;
  readonly supprimer: UseMutationResult<{ id: string; transactionsDetachees: number }, Error, { id: string }>;
} {
  const queryClient = useQueryClient();

  const creer = useMutation({
    mutationFn: async (entree: EntreeEtiquette) => deballer(await creerEtiquette(entree)),
    onSuccess: () =>
      queryClient
        .invalidateQueries({ queryKey: queryKeys.etiquettes.all })
        .then(() => {
          toast.success("Étiquette créée.");
        }),
    onError: (erreur) => {
      toast.error(erreur.message);
    },
  });

  const modifier = useMutation({
    mutationFn: async (entree: ModificationEtiquette) => deballer(await modifierEtiquette(entree)),
    onSuccess: () =>
      queryClient
        .invalidateQueries({ queryKey: queryKeys.etiquettes.all })
        .then(() => {
          toast.success("Étiquette modifiée.");
        }),
    onError: (erreur) => {
      toast.error(erreur.message);
    },
  });

  const supprimer = useMutation({
    mutationFn: async (entree: { id: string }) => deballer(await supprimerEtiquette(entree)),
    onSuccess: (donnees) =>
      queryClient
        .invalidateQueries({ queryKey: queryKeys.etiquettes.all })
        .then(() => {
          const message =
            donnees.transactionsDetachees > 0
              ? `Étiquette supprimée, ${donnees.transactionsDetachees} transaction(s) détachée(s).`
              : "Étiquette supprimée.";
          toast.success(message);
        }),
    onError: (erreur) => {
      toast.error(erreur.message);
    },
  });

  return { creer, modifier, supprimer };
}
