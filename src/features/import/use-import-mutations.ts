"use client";

// Trois mutations, jamais des queries : analyser/préparer une ligne portent
// un texte volumineux qu'on ne met pas en cache, et partent sur un clic —
// CLAUDE.md §8. Hook d'écriture, séparé de toute lecture
// (CLAUDE.md §8) ; c'est le seul fichier de src/features/import/ qui importe
// server/actions/import.

import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import { toast } from "sonner";
import { deballer } from "@/lib/action-result";
import { queryKeys } from "@/lib/query-keys";
import {
  analyserReleveColle,
  enregistrerImport,
  preparerLigneManuelle,
  type ResultatAnalyse,
} from "@/server/actions/import";
import type { LigneEnRevue } from "@/domain/ingestion";
import type { RecapImport } from "@/server/repositories/import-batches";
import type { EntreeAnalyse, EntreeEnregistrementImport, EntreeLigneManuelle } from "./schema";

export function useImportMutations(): {
  readonly analyser: UseMutationResult<ResultatAnalyse, Error, EntreeAnalyse>;
  readonly preparerLigne: UseMutationResult<LigneEnRevue, Error, EntreeLigneManuelle>;
  readonly enregistrer: UseMutationResult<RecapImport, Error, EntreeEnregistrementImport>;
} {
  const queryClient = useQueryClient();

  const analyser = useMutation({
    mutationFn: async (entree: EntreeAnalyse) => deballer(await analyserReleveColle(entree)),
    // L'analyse prolonge les échéances du compte (docs/lot-m3.md §4.4) : l'écran des récurrences les relit.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.recurrences.all }),
    onError: (erreur) => {
      toast.error(erreur.message);
    },
  });

  const preparerLigne = useMutation({
    mutationFn: async (entree: EntreeLigneManuelle) => deballer(await preparerLigneManuelle(entree)),
    onError: (erreur) => {
      toast.error(erreur.message);
    },
  });

  const enregistrer = useMutation({
    mutationFn: async (entree: EntreeEnregistrementImport) => deballer(await enregistrerImport(entree)),
    onSuccess: () =>
      queryClient
        .invalidateQueries({ queryKey: queryKeys.transactions.all })
        .then(() => queryClient.invalidateQueries({ queryKey: queryKeys.beneficiaires.all }))
        .then(() => queryClient.invalidateQueries({ queryKey: queryKeys.comptes.all }))
        .then(() => queryClient.invalidateQueries({ queryKey: queryKeys.soldes.all }))
        .then(() => queryClient.invalidateQueries({ queryKey: queryKeys.recurrences.all }))
        .then(() => {
          toast.success("Import enregistré.");
        }),
    onError: (erreur) => {
      toast.error(erreur.message);
    },
  });

  return { analyser, preparerLigne, enregistrer };
}
