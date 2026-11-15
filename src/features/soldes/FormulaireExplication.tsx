"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import type { ReactNode } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { schemaFormulaireExplication } from "./schema";

/** Remonté par `key={statementId}` : une autre ancre repart de ses propres valeurs et de zéro erreur. */
export function FormulaireExplication(props: {
  readonly valeurInitiale: string;
  readonly enCours: boolean;
  readonly onEnregistrer: (explication: string) => void;
}): ReactNode {
  const { valeurInitiale, enCours, onEnregistrer } = props;
  const form = useForm<z.input<typeof schemaFormulaireExplication>>({
    resolver: zodResolver(schemaFormulaireExplication, undefined, { raw: true }),
    defaultValues: { explication: valeurInitiale },
  });
  return (
    <Form {...form}>
      <form
        className="flex flex-col gap-3"
        onSubmit={(evenement) => {
          void form.handleSubmit((valeurs) => {
            onEnregistrer(valeurs.explication);
          })(evenement);
        }}
      >
        <FormField
          control={form.control}
          name="explication"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Explication</FormLabel>
              <FormControl>
                <Textarea {...field} disabled={enCours} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" variant="outline" className="self-start" disabled={enCours}>
          Enregistrer l&apos;explication
        </Button>
      </form>
    </Form>
  );
}
