"use client";

// Hook d'écriture, séparé du hook de lecture — CLAUDE.md §8 : un composant de
// cellule de tableau n'importe que useRegles, jamais celui-ci.

import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import { toast } from "sonner";
import { deballer } from "@/lib/action-result";
import { queryKeys } from "@/lib/query-keys";
import {
  appliquerRegleRetroactivement,
  creerRegle,
  modifierRegle,
  supprimerRegle,
  type RecapApplication,
  type RegleListe,
} from "@/server/actions/rules";
import { libelleBilanApplication, libelleRegleSupprimee } from "./libelles";
import type { EntreeApplicationRetroactive, EntreeRegle, ModificationRegle } from "./schema";

export function useRegleMutations(): {
  readonly creer: UseMutationResult<RegleListe, Error, EntreeRegle>;
  readonly modifier: UseMutationResult<{ id: string }, Error, ModificationRegle>;
  readonly supprimer: UseMutationResult<{ id: string; transactionsDetachees: number }, Error, { id: string }>;
  readonly appliquer: UseMutationResult<RecapApplication, Error, EntreeApplicationRetroactive>;
} {
  const queryClient = useQueryClient();

  const creer = useMutation({
    mutationFn: async (entree: EntreeRegle) => deballer(await creerRegle(entree)),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.regles.all }).then(() => {
        toast.success("Règle créée.");
      }),
    onError: (erreur) => {
      toast.error(erreur.message);
    },
  });

  const modifier = useMutation({
    mutationFn: async (entree: ModificationRegle) => deballer(await modifierRegle(entree)),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.regles.all }).then(() => {
        toast.success("Règle modifiée.");
      }),
    onError: (erreur) => {
      toast.error(erreur.message);
    },
  });

  const supprimer = useMutation({
    mutationFn: async (entree: { id: string }) => deballer(await supprimerRegle(entree)),
    onSuccess: (donnees) =>
      queryClient
        .invalidateQueries({ queryKey: queryKeys.regles.all })
        .then(() => queryClient.invalidateQueries({ queryKey: queryKeys.transactions.all }))
        .then(() => {
          toast.success(libelleRegleSupprimee(donnees.transactionsDetachees));
        }),
    onError: (erreur) => {
      toast.error(erreur.message);
    },
  });

  const appliquer = useMutation({
    mutationFn: async (entree: EntreeApplicationRetroactive) => deballer(await appliquerRegleRetroactivement(entree)),
    // queryKeys.regles.all est un préfixe de queryKeys.regles.apercu(...) :
    // l'invalider suffit à invalider aussi tous les aperçus en cache, sans
    // ajouter une deuxième entrée à lib/query-keys.ts.
    onSuccess: (donnees) =>
      queryClient
        .invalidateQueries({ queryKey: queryKeys.regles.all })
        .then(() => queryClient.invalidateQueries({ queryKey: queryKeys.transactions.all }))
        .then(() => {
          toast.success(libelleBilanApplication(donnees.modifiees, donnees.inchangees, donnees.ignorees));
        }),
    onError: (erreur) => {
      toast.error(erreur.message);
    },
  });

  return { creer, modifier, supprimer, appliquer };
}
