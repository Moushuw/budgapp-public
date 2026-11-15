"use client";

// Les parts d'une règle VENTILER dans FormulaireRegle.tsx — docs/lot-m2.md §4.3. Un pourcentage par sous-catégorie,
// le total en direct ; le serveur ne retient que des parts en pour mille dont la somme fait 100 %.

import { Plus, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import { useFieldArray, useWatch, type UseFormReturn } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatPartMille, LIMITE_LIGNES_VENTILATION } from "@/domain/ventilation";
import type { CategorieListe } from "@/server/actions/categories";
import {
  estSousCategorieDisparue,
  MESSAGE_SOUS_CATEGORIE_DISPARUE,
  partMilleDepuisPourcentage,
  type EntreeRegle,
} from "./schema";

export interface LignesVentilationRegleProps {
  readonly form: UseFormReturn<EntreeRegle>;
  /** Index de l'action. */
  readonly index: number;
  readonly categories: readonly CategorieListe[];
  /** Les sous-catégories qui existent ; null tant que les catégories ne sont pas chargées. */
  readonly sousCategoriesConnues: ReadonlySet<string> | null;
  readonly enCours: boolean;
}

const LIGNE_VIDE = { subcategoryId: null, pourcentage: "" } as const;

/** Somme des parts lisibles, en pour mille. Une saisie illisible ne compte pas. */
function sommePartsLisibles(pourcentages: readonly string[]): number {
  return pourcentages.reduce((somme, saisie) => somme + (partMilleDepuisPourcentage(saisie) ?? 0), 0);
}

export function LignesVentilationRegle(props: LignesVentilationRegleProps): ReactNode {
  const { form, index, categories, sousCategoriesConnues, enCours } = props;
  const { fields, append, remove } = useFieldArray({ control: form.control, name: `actions.${index}.ventilation` });
  const parts = useWatch({ control: form.control, name: `actions.${index}.ventilation` });

  const { isSubmitted } = form.formState;
  const erreurActions = form.formState.errors.actions?.[index]?.ventilation;
  // Une erreur de niveau tableau est rangée sous `root` par le résolveur (@hookform/resolvers, toNestErrors).
  const messageTableau = erreurActions?.root?.message ?? erreurActions?.message;

  // L'erreur de niveau tableau décrit les parts telles qu'elles étaient à la dernière soumission : dès qu'une
  // part change, ou qu'on en ajoute ou retire une, on la recalcule plutôt que de la laisser périmée à l'écran.
  function rafraichirErreursTableau(): void {
    if (isSubmitted) {
      void form.trigger(`actions.${index}.ventilation`);
    }
  }

  return (
    <div className="flex min-w-0 flex-col gap-2">
      {fields.map((champ, j) => {
        const n = j + 1;
        const disparue = estSousCategorieDisparue(parts[j]?.subcategoryId ?? null, sousCategoriesConnues);
        return (
          <fieldset
            key={champ.id}
            data-part-disparue={disparue ? "" : undefined}
            className="flex min-w-0 flex-col gap-2 rounded-lg border p-3"
          >
            <legend className="px-1 text-sm font-medium">{`Part ${String(n)}`}</legend>
            <div className="flex items-start gap-2">
              <FormField
                control={form.control}
                name={`actions.${index}.ventilation.${j}.subcategoryId`}
                render={({ field }) => (
                  <FormItem className="min-w-0 flex-1">
                    <FormLabel>Sous-catégorie</FormLabel>
                    <Select value={field.value ?? undefined} onValueChange={field.onChange} disabled={enCours}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Choisir une sous-catégorie" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {categories.map((categorie) => (
                          <SelectGroup key={categorie.id}>
                            <SelectLabel>{categorie.nom}</SelectLabel>
                            {categorie.sousCategories.map((sousCategorie) => (
                              <SelectItem key={sousCategorie.id} value={sousCategorie.id}>
                                {sousCategorie.nom}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage>{disparue ? MESSAGE_SOUS_CATEGORIE_DISPARUE : null}</FormMessage>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name={`actions.${index}.ventilation.${j}.pourcentage`}
                render={({ field }) => (
                  <FormItem className="w-24 shrink-0">
                    <FormLabel>Part (%)</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        onChange={(evenement) => {
                          field.onChange(evenement);
                          rafraichirErreursTableau();
                        }}
                        inputMode="decimal"
                        placeholder="50"
                        disabled={enCours}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="mt-6 shrink-0"
                aria-label={`Retirer la part ${String(n)}`}
                disabled={enCours || fields.length <= 2}
                onClick={() => {
                  remove(j);
                  rafraichirErreursTableau();
                }}
              >
                <Trash2 />
              </Button>
            </div>
          </fieldset>
        );
      })}

      <div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={enCours || fields.length >= LIMITE_LIGNES_VENTILATION}
          onClick={() => {
            append({ ...LIGNE_VIDE });
            rafraichirErreursTableau();
          }}
        >
          <Plus />
          Ajouter une part
        </Button>
      </div>

      <p data-total-ventilation className="text-muted-foreground text-sm">
        {`Total : ${formatPartMille(sommePartsLisibles(parts.map((part) => part.pourcentage)))} %`}
      </p>

      {messageTableau !== undefined && <p className="text-destructive text-sm">{messageTableau}</p>}
    </div>
  );
}
