"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import type { ReactNode } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LIBELLES_MODE_CORRESPONDANCE, MODES_CORRESPONDANCE } from "@/domain/referentiel";
import { schemaFiltreImport, type EntreeFiltreImport } from "./schema";

export interface FormulaireFiltreImportProps {
  readonly valeurInitiale?: EntreeFiltreImport;
  readonly enCours: boolean;
  readonly onSoumettre: (entree: EntreeFiltreImport) => void;
  readonly onAnnuler: () => void;
}

const VALEURS_PAR_DEFAUT: EntreeFiltreImport = { motif: "", mode: "EXACT" };

export function FormulaireFiltreImport(props: FormulaireFiltreImportProps): ReactNode {
  const { valeurInitiale, enCours, onSoumettre, onAnnuler } = props;

  const form = useForm<EntreeFiltreImport>({
    resolver: zodResolver(schemaFiltreImport, undefined, { raw: true }),
    defaultValues: valeurInitiale ?? VALEURS_PAR_DEFAUT,
  });

  return (
    <Form {...form}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(evenement) => {
          void form.handleSubmit(onSoumettre)(evenement);
        }}
      >
        <FormField
          control={form.control}
          name="motif"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Motif</FormLabel>
              <FormControl>
                <Input {...field} className="font-mono" placeholder="PAIEMENT INTERAC" disabled={enCours} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="mode"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Mode de correspondance</FormLabel>
              <Select value={field.value} onValueChange={field.onChange} disabled={enCours}>
                <FormControl>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {MODES_CORRESPONDANCE.map((mode) => (
                    <SelectItem key={mode} value={mode}>
                      {LIBELLES_MODE_CORRESPONDANCE[mode]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onAnnuler} disabled={enCours}>
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
