"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import type { ReactNode } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { ChampMontant } from "@/components/forms/ChampMontant";
import { DialogueFormulaire } from "@/components/referentiel/DialogueFormulaire";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import type { DateCivile } from "@/domain/dates";
import { formatMontantChamp } from "@/lib/champs-formulaire";
import { schemaFormulaireMontantOccurrence } from "./schema";

export interface DialogueMontantEcheanceProps {
  /** L'échéance dont on change le montant ; null : fermé. */
  readonly echeance: { readonly occurrenceId: string; readonly echeance: DateCivile; readonly montantCents: number } | null;
  readonly enCours: boolean;
  /** Le montant saisi, en chaîne : l'action le convertit (CLAUDE.md §11). */
  readonly onEnregistrer: (occurrenceId: string, montant: string) => void;
  readonly onFermer: () => void;
}

function CorpsMontant(props: {
  readonly occurrenceId: string;
  readonly echeance: DateCivile;
  readonly montantCents: number;
  readonly enCours: boolean;
  readonly onEnregistrer: (occurrenceId: string, montant: string) => void;
  readonly onFermer: () => void;
}): ReactNode {
  const { occurrenceId, echeance, montantCents, enCours, onEnregistrer, onFermer } = props;
  const form = useForm<z.input<typeof schemaFormulaireMontantOccurrence>>({
    resolver: zodResolver(schemaFormulaireMontantOccurrence, undefined, { raw: true }),
    defaultValues: { montant: formatMontantChamp(montantCents) },
  });
  return (
    <Form {...form}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(evenement) => {
          void form.handleSubmit((valeurs) => {
            onEnregistrer(occurrenceId, valeurs.montant);
          })(evenement);
        }}
      >
        <FormField
          control={form.control}
          name="montant"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Montant</FormLabel>
              <FormControl>
                <ChampMontant value={field.value} onChange={field.onChange} onBlur={field.onBlur} disabled={enCours} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <p className="text-muted-foreground text-sm">Échéance du {echeance} ; la série ne change pas.</p>
        <div data-barre-action className="bg-popover sticky -bottom-1 z-10 flex justify-end gap-2 pt-2 pb-1">
          <Button type="button" variant="outline" onClick={onFermer} disabled={enCours}>
            Annuler
          </Button>
          <Button type="submit" disabled={enCours}>
            Enregistrer
          </Button>
        </div>
      </form>
    </Form>
  );
}

export function DialogueMontantEcheance(props: DialogueMontantEcheanceProps): ReactNode {
  const { echeance, enCours, onEnregistrer, onFermer } = props;
  return (
    <DialogueFormulaire
      ouvert={echeance !== null}
      onOuvertChange={(valeur) => {
        if (!valeur) {
          onFermer();
        }
      }}
      titre="Modifier le montant de l'échéance"
    >
      {echeance !== null && (
        <CorpsMontant
          occurrenceId={echeance.occurrenceId}
          echeance={echeance.echeance}
          montantCents={echeance.montantCents}
          enCours={enCours}
          onEnregistrer={onEnregistrer}
          onFermer={onFermer}
        />
      )}
    </DialogueFormulaire>
  );
}
