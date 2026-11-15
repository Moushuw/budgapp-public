"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import type { ReactNode } from "react";
import { useForm } from "react-hook-form";
import { ChampCouleur } from "@/components/forms/ChampCouleur";
import { ChampMontant } from "@/components/forms/ChampMontant";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { schemaEtiquette, type EntreeEtiquette } from "./schema";

export interface FormulaireEtiquetteProps {
  readonly valeurInitiale?: EntreeEtiquette;
  readonly enCours: boolean;
  readonly onSoumettre: (entree: EntreeEtiquette) => void;
  readonly onAnnuler: () => void;
}

const VALEURS_PAR_DEFAUT: EntreeEtiquette = { nom: "", couleur: null, cibleMensuelleCents: "" };

export function FormulaireEtiquette(props: FormulaireEtiquetteProps): ReactNode {
  const { valeurInitiale, enCours, onSoumettre, onAnnuler } = props;

  // `raw: true` : le résolveur valide via le schéma complet (transform inclus
  // — c'est de là que vient le message sur une cible illisible), mais rend au
  // formulaire les valeurs BRUTES, pas la sortie transformée. Sans ça, entrée
  // et sortie de schemaEtiquette divergent (texte → cents) et handleSubmit
  // recevrait des cents, que le même schéma refuserait côté serveur.
  const form = useForm<EntreeEtiquette>({
    resolver: zodResolver(schemaEtiquette, undefined, { raw: true }),
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
                <Input {...field} placeholder="Auto" disabled={enCours} />
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
                <ChampCouleur
                  value={field.value}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  disabled={enCours}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="cibleMensuelleCents"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Cible mensuelle</FormLabel>
              <FormControl>
                <ChampMontant
                  value={field.value}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  placeholder="Optionnelle"
                  disabled={enCours}
                />
              </FormControl>
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
