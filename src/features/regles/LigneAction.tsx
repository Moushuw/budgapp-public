"use client";

// Une ligne d'action dans FormulaireRegle.tsx — docs/lot-m1.md §4.6 ; l'action
// VENTILER y est éditable depuis M2 (docs/lot-m2.md §4.3).

import type { ReactNode } from "react";
import { useState } from "react";
import { Trash2 } from "lucide-react";
import type { UseFormReturn } from "react-hook-form";
import { useWatch } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LIBELLES_TYPE_ACTION, TYPES_ACTION, type TypeAction } from "@/domain/categorization";
import type { CategorieListe } from "@/server/actions/categories";
import type { EtiquetteListe } from "@/server/actions/tags";
import { LignesVentilationRegle } from "./LignesVentilationRegle";
import type { EntreeRegle } from "./schema";

export interface LigneActionProps {
  readonly form: UseFormReturn<EntreeRegle>;
  readonly index: number;
  readonly categories: readonly CategorieListe[];
  /** Les sous-catégories qui existent ; null tant que les catégories ne sont pas chargées. */
  readonly sousCategoriesConnues: ReadonlySet<string> | null;
  readonly etiquettes: readonly EtiquetteListe[];
  readonly onSupprimer: () => void;
  readonly suppressionDesactivee: boolean;
  /** Un envoi de formulaire en cours bloque les contrôles de la ligne. */
  readonly enCours: boolean;
}

function cheminChamp<K extends "type" | "subcategoryId" | "valeur">(
  index: number,
  champ: K,
): `actions.${number}.${K}` {
  return `actions.${index}.${champ}`;
}

function messageAvertissement(libelles: string[]): string {
  const liste =
    libelles.length <= 1 ? (libelles[0] ?? "") : `${libelles.slice(0, -1).join(", ")} et ${libelles[libelles.length - 1]}`;
  const phrase = `${liste.charAt(0).toUpperCase()}${liste.slice(1)}`;
  const verbe = libelles.length > 1 ? "seront effacés" : "sera effacé";
  return `${phrase} ${verbe} à l'enregistrement.`;
}

export function LigneAction(props: LigneActionProps): ReactNode {
  const { form, index, categories, sousCategoriesConnues, etiquettes, onSupprimer, suppressionDesactivee, enCours } = props;
  const [avertissement, setAvertissement] = useState<string | null>(null);

  const type = useWatch({ control: form.control, name: cheminChamp(index, "type") });

  function changerType(nouveauType: TypeAction): void {
    const valeursActuelles = form.getValues(`actions.${index}`);
    const libelles: string[] = [];
    if (valeursActuelles.subcategoryId !== null) {
      libelles.push("la sous-catégorie");
    }
    if (valeursActuelles.valeur.trim() !== "") {
      libelles.push("la valeur");
    }
    if (valeursActuelles.ventilation.some((ligne) => ligne.subcategoryId !== null || ligne.pourcentage.trim() !== "")) {
      libelles.push("la ventilation");
    }
    setAvertissement(libelles.length > 0 ? messageAvertissement(libelles) : null);

    form.setValue(cheminChamp(index, "type"), nouveauType);
    form.setValue(cheminChamp(index, "subcategoryId"), null);
    form.setValue(cheminChamp(index, "valeur"), "");
    form.setValue(
      `actions.${index}.ventilation`,
      nouveauType === "VENTILER"
        ? [
            { subcategoryId: null, pourcentage: "" },
            { subcategoryId: null, pourcentage: "" },
          ]
        : [],
    );
    form.clearErrors([
      cheminChamp(index, "subcategoryId"),
      cheminChamp(index, "valeur"),
      `actions.${index}.ventilation`,
    ]);
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3">
      <div className="flex items-start gap-2">
        <FormField
          control={form.control}
          name={cheminChamp(index, "type")}
          render={({ field }) => (
            <FormItem className="flex-1">
              <FormLabel>Action</FormLabel>
              <Select value={field.value} onValueChange={changerType}>
                <FormControl>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {TYPES_ACTION.map((valeurType) => (
                    <SelectItem key={valeurType} value={valeurType}>
                      {LIBELLES_TYPE_ACTION[valeurType]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Supprimer l'action"
          onClick={onSupprimer}
          disabled={suppressionDesactivee}
        >
          <Trash2 />
        </Button>
      </div>

      {avertissement !== null && <p className="text-muted-foreground text-sm">{avertissement}</p>}

      {type === "CATEGORISER" && (
        <FormField
          control={form.control}
          name={cheminChamp(index, "subcategoryId")}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Sous-catégorie</FormLabel>
              <Select value={field.value ?? undefined} onValueChange={field.onChange}>
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
              <FormMessage />
            </FormItem>
          )}
        />
      )}

      {type === "VENTILER" && (
        <LignesVentilationRegle
          form={form}
          index={index}
          categories={categories}
          sousCategoriesConnues={sousCategoriesConnues}
          enCours={enCours}
        />
      )}

      {type === "ETIQUETER" && (
        <FormField
          control={form.control}
          name={cheminChamp(index, "valeur")}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Étiquette</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Choisir une étiquette" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {etiquettes.map((etiquette) => (
                    <SelectItem key={etiquette.id} value={etiquette.id}>
                      {etiquette.nom}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
      )}

      {type === "RENOMMER_BENEFICIAIRE" && (
        <FormField
          control={form.control}
          name={cheminChamp(index, "valeur")}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nouveau nom du bénéficiaire</FormLabel>
              <FormControl>
                <Input {...field} placeholder="Amazon" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      )}

      {type === "NOTER" && (
        <FormField
          control={form.control}
          name={cheminChamp(index, "valeur")}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Note</FormLabel>
              <FormControl>
                <Input {...field} placeholder="Note ajoutée par la règle" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      )}
    </div>
  );
}
