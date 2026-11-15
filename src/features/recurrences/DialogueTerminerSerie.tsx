"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import type { ReactNode } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { DialogueFormulaire } from "@/components/referentiel/DialogueFormulaire";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import type { DateCivile } from "@/domain/dates";
import { schemaFormulaireTerminaison } from "./schema";

export interface DialogueTerminerSerieProps {
  /** L'id et le libellé de la série à terminer ; null : fermé. */
  readonly serie: { readonly id: string; readonly libelle: string } | null;
  readonly aujourdhui: DateCivile;
  readonly enCours: boolean;
  /** Le refus du serveur qui tient à la date (date de fin avant un paiement lié, par exemple) ; null : aucun. */
  readonly erreurDate: string | null;
  /** Un échec sans rapport avec la date ; null : aucun. */
  readonly erreurGenerale: string | null;
  /** La date a changé : le refus précédent ne la concerne plus. */
  readonly onDateChange: () => void;
  readonly onTerminer: (dateFin: DateCivile) => void;
  readonly onFermer: () => void;
}

function CorpsTerminer(props: {
  readonly aujourdhui: DateCivile;
  readonly enCours: boolean;
  readonly erreurDate: string | null;
  readonly erreurGenerale: string | null;
  readonly onDateChange: () => void;
  readonly onTerminer: (dateFin: DateCivile) => void;
  readonly onFermer: () => void;
}): ReactNode {
  const { aujourdhui, enCours, erreurDate, erreurGenerale, onDateChange, onTerminer, onFermer } = props;
  const form = useForm<z.input<typeof schemaFormulaireTerminaison>>({
    resolver: zodResolver(schemaFormulaireTerminaison),
    defaultValues: { dateFin: aujourdhui },
  });
  return (
    <Form {...form}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(evenement) => {
          void form.handleSubmit((valeurs) => {
            onTerminer(valeurs.dateFin);
          })(evenement);
        }}
      >
        <FormField
          control={form.control}
          name="dateFin"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Date de fin</FormLabel>
              <FormControl>
                <Input
                  type="date"
                  {...field}
                  onChange={(evenement) => {
                    field.onChange(evenement);
                    onDateChange();
                  }}
                  disabled={enCours}
                />
              </FormControl>
              <FormMessage />
              {erreurDate !== null && (
                <p role="alert" className="text-destructive text-sm">
                  {erreurDate}
                </p>
              )}
            </FormItem>
          )}
        />
        <p className="text-muted-foreground text-sm">
          Les échéances non liées après cette date seront retirées ; l&apos;historique lié reste.
        </p>
        {erreurGenerale !== null && (
          <p role="alert" className="text-destructive text-sm">
            {erreurGenerale}
          </p>
        )}
        <div data-barre-action className="bg-popover sticky -bottom-1 z-10 flex justify-end gap-2 pt-2 pb-1">
          <Button type="button" variant="outline" onClick={onFermer} disabled={enCours}>
            Annuler
          </Button>
          <Button type="submit" disabled={enCours}>
            Terminer
          </Button>
        </div>
      </form>
    </Form>
  );
}

export function DialogueTerminerSerie(props: DialogueTerminerSerieProps): ReactNode {
  const { serie, aujourdhui, enCours, erreurDate, erreurGenerale, onDateChange, onTerminer, onFermer } = props;
  return (
    <DialogueFormulaire
      ouvert={serie !== null}
      onOuvertChange={(valeur) => {
        if (!valeur) {
          onFermer();
        }
      }}
      titre="Terminer la série"
    >
      {serie !== null && (
        <CorpsTerminer
          aujourdhui={aujourdhui}
          enCours={enCours}
          erreurDate={erreurDate}
          erreurGenerale={erreurGenerale}
          onDateChange={onDateChange}
          onTerminer={onTerminer}
          onFermer={onFermer}
        />
      )}
    </DialogueFormulaire>
  );
}
