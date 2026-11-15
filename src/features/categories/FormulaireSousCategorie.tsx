"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import type { ReactNode } from "react";
import { useForm, useWatch } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { LIBELLES_MODE_REPORT, MODES_REPORT } from "@/domain/referentiel";
import { schemaSousCategorie, type EntreeSousCategorie } from "./schema";

export interface FormulaireSousCategorieProps {
  readonly valeurInitiale?: EntreeSousCategorie;
  readonly enCours: boolean;
  readonly onSoumettre: (entree: EntreeSousCategorie) => void;
  readonly onAnnuler: () => void;
}

const VALEURS_PAR_DEFAUT: EntreeSousCategorie = {
  nom: "",
  masquee: false,
  reportActif: true,
  reportMode: "SIGNE",
};

export function FormulaireSousCategorie(props: FormulaireSousCategorieProps): ReactNode {
  const { valeurInitiale, enCours, onSoumettre, onAnnuler } = props;

  const form = useForm<EntreeSousCategorie>({
    resolver: zodResolver(schemaSousCategorie, undefined, { raw: true }),
    defaultValues: valeurInitiale ?? VALEURS_PAR_DEFAUT,
  });

  const reportActif = useWatch({ control: form.control, name: "reportActif" });

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
          name="nom"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nom</FormLabel>
              <FormControl>
                <Input {...field} placeholder="Épicerie" disabled={enCours} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="masquee"
          render={({ field }) => (
            <FormItem className="flex items-center justify-between gap-4">
              <FormLabel>Masquée</FormLabel>
              <FormControl>
                <Switch checked={field.value} onCheckedChange={field.onChange} disabled={enCours} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="reportActif"
          render={({ field }) => (
            <FormItem className="flex items-center justify-between gap-4">
              <FormLabel>Report actif</FormLabel>
              <FormControl>
                <Switch checked={field.value} onCheckedChange={field.onChange} disabled={enCours} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="reportMode"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Mode de report</FormLabel>
              <Select value={field.value} onValueChange={field.onChange} disabled={enCours || !reportActif}>
                <FormControl>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {MODES_REPORT.map((mode) => (
                    <SelectItem key={mode} value={mode}>
                      {LIBELLES_MODE_REPORT[mode]}
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
