"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import type { ReactNode } from "react";
import { useForm } from "react-hook-form";
import { ChampCouleur } from "@/components/forms/ChampCouleur";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { LIBELLES_MODE_BUDGET, MODES_BUDGET } from "@/domain/referentiel";
import { schemaCategorie, type EntreeCategorie } from "./schema";

export interface FormulaireCategorieProps {
  readonly valeurInitiale?: EntreeCategorie;
  readonly enCours: boolean;
  readonly onSoumettre: (entree: EntreeCategorie) => void;
  readonly onAnnuler: () => void;
}

const VALEURS_PAR_DEFAUT: EntreeCategorie = {
  nom: "",
  couleur: null,
  icone: null,
  masquee: false,
  modeBudget: "PAR_SOUS_CATEGORIE",
};

export function FormulaireCategorie(props: FormulaireCategorieProps): ReactNode {
  const { valeurInitiale, enCours, onSoumettre, onAnnuler } = props;

  const form = useForm<EntreeCategorie>({
    resolver: zodResolver(schemaCategorie, undefined, { raw: true }),
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
          name="nom"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nom</FormLabel>
              <FormControl>
                <Input {...field} placeholder="Logement" disabled={enCours} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="couleur"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Couleur</FormLabel>
              <FormControl>
                <ChampCouleur value={field.value} onChange={field.onChange} onBlur={field.onBlur} disabled={enCours} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="icone"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Icône</FormLabel>
              <FormControl>
                <Input
                  value={field.value ?? ""}
                  onChange={(evenement) => { field.onChange(evenement.target.value === "" ? null : evenement.target.value); }}
                  onBlur={field.onBlur}
                  placeholder="car, home, utensils…"
                  disabled={enCours}
                />
              </FormControl>
              <FormDescription>Nom d&apos;icône lucide, affiché tel quel.</FormDescription>
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
          name="modeBudget"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Mode de budget</FormLabel>
              <Select value={field.value} onValueChange={field.onChange} disabled={enCours}>
                <FormControl>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {MODES_BUDGET.map((mode) => (
                    <SelectItem key={mode} value={mode}>
                      {LIBELLES_MODE_BUDGET[mode]}
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
