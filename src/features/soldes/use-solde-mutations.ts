"use client";

// Le seul hook d'écriture des soldes — CLAUDE.md §8 : seul l'écran de la fiche l'instancie et passe des
// rappels. Toute écriture invalide les soldes, les transactions (un ajustement en est une) et les comptes
// (la colonne Solde).

import { useMutation, useQueryClient, type QueryClient, type UseMutationResult } from "@tanstack/react-query";
import { toast } from "sonner";
import type { z } from "zod";
import { deballer } from "@/lib/action-result";
import { queryKeys } from "@/lib/query-keys";
import type { ActionResult } from "@/server/actions/define-action";
import { creerAjustement, expliquerEcart, saisirSolde, supprimerAncrage } from "@/server/actions/soldes";
import {
  detailAjustement,
  LIBELLE_EXPLICATION,
  libelleAjustement,
  libelleSaisie,
  libelleSuppressionAncrage,
} from "./libelles";
import type { schemaExplication, schemaSaisieSolde } from "./schema";

type Donnees<T extends (...args: never[]) => Promise<ActionResult<unknown>>> =
  Awaited<ReturnType<T>> extends ActionResult<infer D> ? D : never;

function invalider(queryClient: QueryClient): Promise<unknown[]> {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.soldes.all }),
    queryClient.invalidateQueries({ queryKey: queryKeys.transactions.all }),
    queryClient.invalidateQueries({ queryKey: queryKeys.comptes.all }),
  ]);
}

export function useSoldeMutations(): {
  readonly saisir: UseMutationResult<Donnees<typeof saisirSolde>, Error, z.input<typeof schemaSaisieSolde>>;
  readonly expliquer: UseMutationResult<Donnees<typeof expliquerEcart>, Error, z.input<typeof schemaExplication>>;
  readonly ajuster: UseMutationResult<Donnees<typeof creerAjustement>, Error, { readonly statementId: string }>;
  readonly supprimer: UseMutationResult<Donnees<typeof supprimerAncrage>, Error, { readonly statementId: string }>;
} {
  const queryClient = useQueryClient();
  const surErreur = (erreur: Error): void => {
    toast.error(erreur.message);
  };

  const saisir = useMutation({
    mutationFn: async (entree: z.input<typeof schemaSaisieSolde>) => deballer(await saisirSolde(entree)),
    onSuccess: (donnees) =>
      invalider(queryClient).then(() => {
        toast.success(libelleSaisie(donnees.ecartCents));
      }),
    onError: surErreur,
  });

  const expliquer = useMutation({
    mutationFn: async (entree: z.input<typeof schemaExplication>) => deballer(await expliquerEcart(entree)),
    onSuccess: () =>
      invalider(queryClient).then(() => {
        toast.success(LIBELLE_EXPLICATION);
      }),
    onError: surErreur,
  });

  const ajuster = useMutation({
    mutationFn: async (entree: { readonly statementId: string }) => deballer(await creerAjustement(entree)),
    onSuccess: (donnees) =>
      invalider(queryClient).then(() => {
        const detail = detailAjustement(donnees.sousCategorieCreee);
        if (detail === null) {
          toast.success(libelleAjustement(donnees.montantCents));
        } else {
          toast.success(libelleAjustement(donnees.montantCents), { description: detail });
        }
      }),
    onError: surErreur,
  });

  const supprimer = useMutation({
    mutationFn: async (entree: { readonly statementId: string }) => deballer(await supprimerAncrage(entree)),
    onSuccess: (donnees) =>
      invalider(queryClient).then(() => {
        toast.success(libelleSuppressionAncrage(donnees.ajustementSupprime));
      }),
    onError: surErreur,
  });

  return { saisir, expliquer, ajuster, supprimer };
}
