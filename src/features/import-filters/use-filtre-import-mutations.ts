"use client";

import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import { toast } from "sonner";
import { deballer } from "@/lib/action-result";
import { queryKeys } from "@/lib/query-keys";
import {
  creerFiltreImport,
  modifierFiltreImport,
  supprimerFiltreImport,
  type FiltreImportListe,
} from "@/server/actions/import-filters";
import type { EntreeFiltreImport, ModificationFiltreImport } from "./schema";

// Hook d'écriture, séparé du hook de lecture — CLAUDE.md §8.
export function useFiltreImportMutations(): {
  readonly creer: UseMutationResult<FiltreImportListe, Error, EntreeFiltreImport>;
  readonly modifier: UseMutationResult<{ id: string }, Error, ModificationFiltreImport>;
  readonly supprimer: UseMutationResult<{ id: string }, Error, { id: string }>;
} {
  const queryClient = useQueryClient();

  const creer = useMutation({
    mutationFn: async (entree: EntreeFiltreImport) => deballer(await creerFiltreImport(entree)),
    onSuccess: () =>
      queryClient
        .invalidateQueries({ queryKey: queryKeys.filtres.all })
        .then(() => { toast.success("Filtre créé."); }),
    onError: (erreur) => { toast.error(erreur.message); },
  });

  const modifier = useMutation({
    mutationFn: async (entree: ModificationFiltreImport) => deballer(await modifierFiltreImport(entree)),
    onSuccess: () =>
      queryClient
        .invalidateQueries({ queryKey: queryKeys.filtres.all })
        .then(() => { toast.success("Filtre modifié."); }),
    onError: (erreur) => { toast.error(erreur.message); },
  });

  const supprimer = useMutation({
    mutationFn: async (entree: { id: string }) => deballer(await supprimerFiltreImport(entree)),
    onSuccess: () =>
      queryClient
        .invalidateQueries({ queryKey: queryKeys.filtres.all })
        .then(() => { toast.success("Filtre supprimé."); }),
    onError: (erreur) => { toast.error(erreur.message); },
  });

  return { creer, modifier, supprimer };
}
