"use client";

// Section 4 — docs/lot-m1.md §8.2 : texte brut, numéro de ligne, raison,
// et un bouton « Saisir à la main » qui ouvre un formulaire (date /
// description / montant) branché sur preparerLigneManuelle. La ligne
// récupérée rejoint la section 1 ; la ligne rejetée reste affichée, marquée
// « récupérée ».

import { zodResolver } from "@hookform/resolvers/zod";
import type { ReactNode } from "react";
import { useId, useState } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { ChampMontant } from "@/components/forms/ChampMontant";
import type { LigneEnRevue } from "@/domain/ingestion";
import type { RaisonRejet } from "@/domain/statement";
import type { LigneRejetee } from "@/domain/statement";
import { schemaLigneManuelle, type EntreeLigneManuelle } from "./schema";
import { useImportMutations } from "./use-import-mutations";

export interface SectionNonReconnuesProps {
  readonly rejetees: readonly LigneRejetee[];
  readonly recuperees: ReadonlySet<number>;
  readonly accountId: string;
  readonly onRecupere: (ligne: LigneEnRevue, numeroLigne: number) => void;
}

const LIBELLES_RAISON: Record<RaisonRejet, string> = {
  AUCUNE_DATE: "Aucune date reconnue",
  AUCUN_MONTANT: "Aucun montant reconnu",
  MOIS_INCONNU: "Nom de mois non reconnu",
  MONTANT_ILLISIBLE: "Montant illisible",
};

function FormulaireLigneManuelle({
  rejetee,
  accountId,
  onRecupere,
}: {
  readonly rejetee: LigneRejetee;
  readonly accountId: string;
  readonly onRecupere: (ligne: LigneEnRevue, numeroLigne: number) => void;
}): ReactNode {
  const { preparerLigne } = useImportMutations();
  const idFormulaire = useId();
  const form = useForm<EntreeLigneManuelle>({
    resolver: zodResolver(schemaLigneManuelle, undefined, { raw: true }),
    defaultValues: {
      cle: `manuelle-${idFormulaire}`,
      accountId,
      date: "",
      description: "",
      montant: "",
      numeroLigne: rejetee.numeroLigne,
      ligneBrute: rejetee.ligneBrute,
    },
  });

  return (
    <Form {...form}>
      <form
        className="flex flex-col gap-3 border-t pt-3"
        onSubmit={(evenement) => {
          void form.handleSubmit((entree) => {
            preparerLigne.mutate(entree, {
              onSuccess: (ligne) => { onRecupere(ligne, rejetee.numeroLigne); },
            });
          })(evenement);
        }}
      >
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <FormField
            control={form.control}
            name="date"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Date</FormLabel>
                <FormControl>
                  <Input type="date" data-champ-date="" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Description</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="montant"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Montant</FormLabel>
                <FormControl>
                  <ChampMontant value={field.value} onChange={field.onChange} onBlur={field.onBlur} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <div className="flex justify-end">
          <Button type="submit" size="sm" disabled={preparerLigne.isPending}>
            Valider
          </Button>
        </div>
      </form>
    </Form>
  );
}

function LigneNonReconnue({
  rejetee,
  recuperee,
  accountId,
  onRecupere,
}: {
  readonly rejetee: LigneRejetee;
  readonly recuperee: boolean;
  readonly accountId: string;
  readonly onRecupere: (ligne: LigneEnRevue, numeroLigne: number) => void;
}): ReactNode {
  const [ouvert, setOuvert] = useState(false);

  return (
    <Card role="group" aria-label={`Ligne ${String(rejetee.numeroLigne)} non reconnue`}>
      <CardContent className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-col">
            <span className="text-sm">
              Ligne {rejetee.numeroLigne} — {LIBELLES_RAISON[rejetee.raison]}
            </span>
            <span className="text-muted-foreground font-mono text-xs">{rejetee.ligneBrute}</span>
          </div>
          {recuperee ? (
            <span className="text-sm font-medium">Récupérée</span>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => { setOuvert((valeur) => !valeur); }}
            >
              Saisir à la main
            </Button>
          )}
        </div>
        {ouvert && !recuperee && (
          <FormulaireLigneManuelle rejetee={rejetee} accountId={accountId} onRecupere={onRecupere} />
        )}
      </CardContent>
    </Card>
  );
}

export function SectionNonReconnues(props: SectionNonReconnuesProps): ReactNode {
  const { rejetees, recuperees, accountId, onRecupere } = props;

  if (rejetees.length === 0) {
    return <p className="text-muted-foreground text-sm">Aucune ligne non reconnue.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {rejetees.map((rejetee) => (
        <LigneNonReconnue
          key={`${rejetee.numeroLigne}-${rejetee.ligneBrute}`}
          rejetee={rejetee}
          recuperee={recuperees.has(rejetee.numeroLigne)}
          accountId={accountId}
          onRecupere={onRecupere}
        />
      ))}
    </div>
  );
}
