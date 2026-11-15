"use client";

// Le seul hook d'écriture de l'écran — CLAUDE.md §8 : une cellule de tableau
// n'importe jamais celui-ci, l'écran le crée une fois et passe des rappels.

import { useMutation, useQueryClient, type InfiniteData, type QueryClient, type UseMutationResult } from "@tanstack/react-query";
import { toast } from "sonner";
import type { CurseurTransactions } from "@/domain/consultation";
import type { ChoixSuppressionVirement, GesteMasse, SelectionTransactions } from "@/domain/edition";
import { deballer } from "@/lib/action-result";
import { queryKeys } from "@/lib/query-keys";
import {
  creerContrepartie,
  creerTransaction,
  delierVirement,
  deventilerTransaction,
  lierVirement,
  modifierTransaction,
  modifierTransactionsEnMasse,
  saisirVirement,
  supprimerTransaction,
  ventilerTransaction,
  type CompteRenduMasse,
  type PageListeTransactions,
} from "@/server/actions/transactions";
import { appliquerPatchLigne, type ContexteOptimiste, type PatchEnPlace } from "./optimiste";
import { libelleCompteRendu, libelleRetourSuppression } from "./presentation";
import type {
  EntreeCreationTransaction,
  EntreeModificationTransaction,
  EntreeSaisieVirement,
  EntreeVentilation,
} from "./schema";

export type { PatchEnPlace };

/** Les types du domaine (tableaux en lecture seule) : l'action valide l'entrée, `unknown` à sa frontière. */
export interface EntreeModificationMasse {
  readonly selection: SelectionTransactions;
  readonly geste: GesteMasse;
}

type DonneesListe = InfiniteData<PageListeTransactions, CurseurTransactions | null>;

/** Ces listes portent des compteurs de transactions (nbTransactions) que toute écriture peut changer. */
function invaliderApresEcriture(queryClient: QueryClient): Promise<unknown[]> {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.transactions.all }),
    queryClient.invalidateQueries({ queryKey: queryKeys.comptes.all }),
    queryClient.invalidateQueries({ queryKey: queryKeys.soldes.all }),
    queryClient.invalidateQueries({ queryKey: queryKeys.beneficiaires.all }),
    queryClient.invalidateQueries({ queryKey: queryKeys.etiquettes.all }),
    queryClient.invalidateQueries({ queryKey: queryKeys.regles.all }),
    queryClient.invalidateQueries({ queryKey: queryKeys.categories.all }),
  ]);
}

export function useTransactionMutations(): {
  readonly creer: UseMutationResult<{ id: string; beneficiaireCree: boolean }, Error, EntreeCreationTransaction>;
  readonly modifier: UseMutationResult<{ id: string; beneficiaireCree: boolean }, Error, EntreeModificationTransaction>;
  readonly modifierEnPlace: UseMutationResult<
    { id: string; beneficiaireCree: boolean },
    Error,
    { readonly id: string; readonly patch: PatchEnPlace },
    ContexteOptimiste
  >;
  readonly supprimer: UseMutationResult<
    { id: string; lignesVentilationSupprimees: number; contrepartie: "SUPPRIMEE" | "DELIEE" | null },
    Error,
    { readonly id: string; readonly virement: ChoixSuppressionVirement | null }
  >;
  readonly ventiler: UseMutationResult<{ id: string; lignes: number }, Error, EntreeVentilation>;
  readonly deventiler: UseMutationResult<{ id: string; lignesSupprimees: number }, Error, { readonly id: string }>;
  readonly modifierEnMasse: UseMutationResult<CompteRenduMasse, Error, EntreeModificationMasse>;
  readonly lier: UseMutationResult<
    { id: string; contrepartieId: string; sousCategoriesRetirees: number },
    Error,
    { readonly id: string; readonly contrepartieId: string }
  >;
  readonly delier: UseMutationResult<{ id: string; contrepartieId: string | null }, Error, { readonly id: string }>;
  readonly creerContrepartie: UseMutationResult<
    { id: string; contrepartieId: string; sousCategorieRetiree: boolean },
    Error,
    { readonly id: string; readonly accountId: string }
  >;
  readonly saisirVirement: UseMutationResult<
    { id: string; contrepartieId: string; beneficiaireCree: boolean },
    Error,
    EntreeSaisieVirement
  >;
} {
  const queryClient = useQueryClient();

  const creer = useMutation({
    mutationFn: async (entree: EntreeCreationTransaction) => deballer(await creerTransaction(entree)),
    onSuccess: () =>
      invaliderApresEcriture(queryClient).then(() => {
        toast.success("Transaction enregistrée.");
      }),
    onError: (erreur) => {
      toast.error(erreur.message);
    },
  });

  const modifier = useMutation({
    mutationFn: async (entree: EntreeModificationTransaction) => deballer(await modifierTransaction(entree)),
    onSuccess: () =>
      invaliderApresEcriture(queryClient).then(() => {
        toast.success("Transaction modifiée.");
      }),
    onError: (erreur) => {
      toast.error(erreur.message);
    },
  });

  const modifierEnPlace = useMutation({
    mutationFn: async ({ id, patch }: { readonly id: string; readonly patch: PatchEnPlace }) =>
      deballer(
        await modifierTransaction(
          patch.champ === "SOUS_CATEGORIE"
            ? { id, subcategoryId: patch.subcategoryId }
            : { id, payeeId: patch.payeeId, payeeNouveauNom: null },
        ),
      ),
    onMutate: async ({ id, patch }): Promise<ContexteOptimiste> => {
      await queryClient.cancelQueries({ queryKey: queryKeys.transactions.listes });
      const instantane = queryClient.getQueriesData<DonneesListe>({ queryKey: queryKeys.transactions.listes });
      queryClient.setQueriesData<DonneesListe>({ queryKey: queryKeys.transactions.listes }, (donnees) =>
        appliquerPatchLigne(donnees, id, patch),
      );
      return { instantane };
    },
    onSuccess: () => invaliderApresEcriture(queryClient),
    onError: (erreur, _variables, contexte) => {
      // La ligne revient à son état serveur : instantané remis, puis relecture.
      for (const [cle, donnees] of contexte?.instantane ?? []) {
        queryClient.setQueryData(cle, donnees);
      }
      void invaliderApresEcriture(queryClient);
      toast.error(erreur.message);
    },
  });

  const supprimer = useMutation({
    mutationFn: async (entree: { readonly id: string; readonly virement: ChoixSuppressionVirement | null }) =>
      deballer(await supprimerTransaction(entree)),
    onSuccess: (donnees) =>
      invaliderApresEcriture(queryClient).then(() => {
        toast.success(libelleRetourSuppression(donnees.contrepartie));
      }),
    onError: (erreur) => {
      toast.error(erreur.message);
    },
  });

  const lier = useMutation({
    mutationFn: async (entree: { readonly id: string; readonly contrepartieId: string }) =>
      deballer(await lierVirement(entree)),
    onSuccess: () =>
      invaliderApresEcriture(queryClient).then(() => {
        toast.success("Virement lié.");
      }),
    onError: (erreur) => {
      toast.error(erreur.message);
    },
  });

  const delier = useMutation({
    mutationFn: async ({ id }: { readonly id: string }) => deballer(await delierVirement({ id })),
    onSuccess: () =>
      invaliderApresEcriture(queryClient).then(() => {
        toast.success("Virement délié.");
      }),
    onError: (erreur) => {
      toast.error(erreur.message);
    },
  });

  const creerContrepartieMutation = useMutation({
    mutationFn: async (entree: { readonly id: string; readonly accountId: string }) =>
      deballer(await creerContrepartie(entree)),
    onSuccess: () =>
      invaliderApresEcriture(queryClient).then(() => {
        toast.success("Contrepartie créée et liée.");
      }),
    onError: (erreur) => {
      toast.error(erreur.message);
    },
  });

  const saisirVirementMutation = useMutation({
    mutationFn: async (entree: EntreeSaisieVirement) => deballer(await saisirVirement(entree)),
    onSuccess: () =>
      invaliderApresEcriture(queryClient).then(() => {
        toast.success("Virement enregistré : les deux côtés sont liés.");
      }),
    onError: (erreur) => {
      toast.error(erreur.message);
    },
  });

  const ventiler = useMutation({
    mutationFn: async (entree: EntreeVentilation) => deballer(await ventilerTransaction(entree)),
    onSuccess: () =>
      invaliderApresEcriture(queryClient).then(() => {
        toast.success("Ventilation enregistrée.");
      }),
    onError: (erreur) => {
      toast.error(erreur.message);
    },
  });

  const deventiler = useMutation({
    mutationFn: async ({ id }: { readonly id: string }) => deballer(await deventilerTransaction({ id })),
    onSuccess: () =>
      invaliderApresEcriture(queryClient).then(() => {
        toast.success("Ventilation retirée.");
      }),
    onError: (erreur) => {
      toast.error(erreur.message);
    },
  });

  const modifierEnMasse = useMutation({
    mutationFn: async (entree: EntreeModificationMasse) => deballer(await modifierTransactionsEnMasse(entree)),
    onSuccess: (donnees) =>
      invaliderApresEcriture(queryClient).then(() => {
        toast.success(libelleCompteRendu(donnees));
      }),
    onError: (erreur) => {
      toast.error(erreur.message);
    },
  });

  return {
    creer,
    modifier,
    modifierEnPlace,
    supprimer,
    ventiler,
    deventiler,
    modifierEnMasse,
    lier,
    delier,
    creerContrepartie: creerContrepartieMutation,
    saisirVirement: saisirVirementMutation,
  };
}
