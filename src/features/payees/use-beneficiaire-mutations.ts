"use client";

// Hook d'écriture, séparé du hook de lecture — CLAUDE.md §8 : un composant de
// cellule de tableau n'importe que useBeneficiaires, jamais celui-ci.

import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import { toast } from "sonner";
import { deballer } from "@/lib/action-result";
import { queryKeys } from "@/lib/query-keys";
import {
  creerBeneficiaire,
  fusionnerBeneficiaires,
  modifierBeneficiaire,
  supprimerBeneficiaire,
  type BeneficiaireListe,
} from "@/server/actions/payees";
import type { EntreeBeneficiaire, FusionBeneficiaires, ModificationBeneficiaire } from "./schema";

export function useBeneficiaireMutations(): {
  readonly creer: UseMutationResult<BeneficiaireListe, Error, EntreeBeneficiaire>;
  readonly modifier: UseMutationResult<{ id: string }, Error, ModificationBeneficiaire>;
  readonly supprimer: UseMutationResult<{ id: string; transactionsDetachees: number }, Error, { id: string }>;
  readonly fusionner: UseMutationResult<
    { sourceId: string; cibleId: string; nomSource: string; nomCible: string; transactionsTransferees: number },
    Error,
    FusionBeneficiaires
  >;
} {
  const queryClient = useQueryClient();

  const creer = useMutation({
    mutationFn: async (entree: EntreeBeneficiaire) => deballer(await creerBeneficiaire(entree)),
    onSuccess: () =>
      queryClient
        .invalidateQueries({ queryKey: queryKeys.beneficiaires.all })
        .then(() => {
          toast.success("Bénéficiaire créé.");
        }),
    onError: (erreur) => {
      toast.error(erreur.message);
    },
  });

  const modifier = useMutation({
    mutationFn: async (entree: ModificationBeneficiaire) => deballer(await modifierBeneficiaire(entree)),
    onSuccess: () =>
      queryClient
        .invalidateQueries({ queryKey: queryKeys.beneficiaires.all })
        .then(() => {
          toast.success("Bénéficiaire modifié.");
        }),
    onError: (erreur) => {
      toast.error(erreur.message);
    },
  });

  const supprimer = useMutation({
    mutationFn: async (entree: { id: string }) => deballer(await supprimerBeneficiaire(entree)),
    onSuccess: (donnees) =>
      queryClient
        .invalidateQueries({ queryKey: queryKeys.beneficiaires.all })
        .then(() => queryClient.invalidateQueries({ queryKey: queryKeys.transactions.all }))
        .then(() => {
          const message =
            donnees.transactionsDetachees > 0
              ? `Bénéficiaire supprimé, ${donnees.transactionsDetachees} transaction(s) détachée(s).`
              : "Bénéficiaire supprimé.";
          toast.success(message);
        }),
    onError: (erreur) => {
      toast.error(erreur.message);
    },
  });

  const fusionner = useMutation({
    mutationFn: async (entree: FusionBeneficiaires) => deballer(await fusionnerBeneficiaires(entree)),
    onSuccess: (donnees) =>
      queryClient
        .invalidateQueries({ queryKey: queryKeys.beneficiaires.all })
        .then(() => queryClient.invalidateQueries({ queryKey: queryKeys.transactions.all }))
        .then(() => {
          toast.success(
            `« ${donnees.nomSource} » fusionné dans « ${donnees.nomCible} » : ${donnees.transactionsTransferees} transaction(s) transférée(s).`,
          );
        }),
    onError: (erreur) => {
      toast.error(erreur.message);
    },
  });

  return { creer, modifier, supprimer, fusionner };
}
