"use client";

import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import { toast } from "sonner";
import { deballer } from "@/lib/action-result";
import { queryKeys } from "@/lib/query-keys";
import {
  creerCategorie,
  creerSousCategorie,
  deplacerCategorie,
  deplacerSousCategorie,
  modifierCategorie,
  modifierSousCategorie,
  supprimerCategorie,
  supprimerSousCategorie,
  type CategorieListe,
  type SousCategorieListe,
} from "@/server/actions/categories";
import type {
  CreationSousCategorie,
  Deplacement,
  EntreeCategorie,
  ModificationCategorie,
  ModificationSousCategorie,
} from "./schema";

// Hook d'écriture, séparé du hook de lecture — CLAUDE.md §8.
export function useCategorieMutations(): {
  readonly creer: UseMutationResult<CategorieListe, Error, EntreeCategorie>;
  readonly modifier: UseMutationResult<{ id: string }, Error, ModificationCategorie>;
  readonly supprimer: UseMutationResult<{ id: string }, Error, { id: string }>;
  readonly deplacer: UseMutationResult<{ id: string; deplacee: boolean }, Error, Deplacement>;
  readonly creerSousCategorie: UseMutationResult<SousCategorieListe, Error, CreationSousCategorie>;
  readonly modifierSousCategorie: UseMutationResult<{ id: string }, Error, ModificationSousCategorie>;
  readonly supprimerSousCategorie: UseMutationResult<{ id: string }, Error, { id: string }>;
  readonly deplacerSousCategorie: UseMutationResult<{ id: string; deplacee: boolean }, Error, Deplacement>;
} {
  const queryClient = useQueryClient();
  const invalider = () => queryClient.invalidateQueries({ queryKey: queryKeys.categories.all });

  const creer = useMutation({
    mutationFn: async (entree: EntreeCategorie) => deballer(await creerCategorie(entree)),
    onSuccess: () => invalider().then(() => { toast.success("Catégorie créée."); }),
    onError: (erreur) => { toast.error(erreur.message); },
  });

  const modifier = useMutation({
    mutationFn: async (entree: ModificationCategorie) => deballer(await modifierCategorie(entree)),
    onSuccess: () => invalider().then(() => { toast.success("Catégorie modifiée."); }),
    onError: (erreur) => { toast.error(erreur.message); },
  });

  const supprimer = useMutation({
    mutationFn: async (entree: { id: string }) => deballer(await supprimerCategorie(entree)),
    onSuccess: () => invalider().then(() => { toast.success("Catégorie supprimée."); }),
    onError: (erreur) => { toast.error(erreur.message); },
  });

  const deplacer = useMutation({
    mutationFn: async (entree: Deplacement) => deballer(await deplacerCategorie(entree)),
    onSuccess: (donnees) =>
      invalider().then(() => {
        if (donnees.deplacee) {
          toast.success("Catégorie déplacée.");
        }
      }),
    onError: (erreur) => { toast.error(erreur.message); },
  });

  const creerSousCategorieMutation = useMutation({
    mutationFn: async (entree: CreationSousCategorie) => deballer(await creerSousCategorie(entree)),
    onSuccess: () => invalider().then(() => { toast.success("Sous-catégorie créée."); }),
    onError: (erreur) => { toast.error(erreur.message); },
  });

  const modifierSousCategorieMutation = useMutation({
    mutationFn: async (entree: ModificationSousCategorie) => deballer(await modifierSousCategorie(entree)),
    onSuccess: () => invalider().then(() => { toast.success("Sous-catégorie modifiée."); }),
    onError: (erreur) => { toast.error(erreur.message); },
  });

  const supprimerSousCategorieMutation = useMutation({
    mutationFn: async (entree: { id: string }) => deballer(await supprimerSousCategorie(entree)),
    onSuccess: () => invalider().then(() => { toast.success("Sous-catégorie supprimée."); }),
    onError: (erreur) => { toast.error(erreur.message); },
  });

  const deplacerSousCategorieMutation = useMutation({
    mutationFn: async (entree: Deplacement) => deballer(await deplacerSousCategorie(entree)),
    onSuccess: (donnees) =>
      invalider().then(() => {
        if (donnees.deplacee) {
          toast.success("Sous-catégorie déplacée.");
        }
      }),
    onError: (erreur) => { toast.error(erreur.message); },
  });

  return {
    creer,
    modifier,
    supprimer,
    deplacer,
    creerSousCategorie: creerSousCategorieMutation,
    modifierSousCategorie: modifierSousCategorieMutation,
    supprimerSousCategorie: supprimerSousCategorieMutation,
    deplacerSousCategorie: deplacerSousCategorieMutation,
  };
}
