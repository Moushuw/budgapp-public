"use client";

// Réattribution en masse avec un champ à saisir — docs/lot-m2.md §6.4. Le
// formulaire valide par le MÊME schéma que l'action (schemaGesteMasse) : le
// résolveur y passe le geste construit, une seule règle, un seul message.

import { useForm, type FieldErrors, type Resolver } from "react-hook-form";
import type { ReactNode } from "react";
import { DialogueFormulaire } from "@/components/referentiel/DialogueFormulaire";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { GesteMasse } from "@/domain/edition";
import type { CategorieListe } from "@/server/actions/categories";
import type { GesteAvecDialogue } from "./BarreSelection";
import { ListeFiltreMultiple, type OptionFiltre } from "./ListeFiltreMultiple";
import { optionsSousCategories } from "./presentation";
import { schemaGesteMasse } from "./schema";

export type TypeGesteDialogue = GesteAvecDialogue;

interface ValeursMasse {
  subcategoryId: string | null;
  payeeId: string | null;
  ajouter: string[];
  retirer: string[];
}

const VALEURS_VIDES: ValeursMasse = { subcategoryId: null, payeeId: null, ajouter: [], retirer: [] };

function gesteBrut(type: TypeGesteDialogue, valeurs: ValeursMasse): unknown {
  switch (type) {
    case "SOUS_CATEGORIE":
      return { type, subcategoryId: valeurs.subcategoryId };
    case "BENEFICIAIRE":
      return { type, payeeId: valeurs.payeeId };
    case "ETIQUETTES":
      return { type, ajouter: valeurs.ajouter, retirer: valeurs.retirer };
  }
}

function resolveurPour(type: TypeGesteDialogue): Resolver<ValeursMasse> {
  return (valeurs) => {
    const analyse = schemaGesteMasse.safeParse(gesteBrut(type, valeurs));
    if (analyse.success) {
      return { values: valeurs, errors: {} };
    }
    const errors: FieldErrors<ValeursMasse> = {};
    for (const issue of analyse.error.issues) {
      const champ = issue.path[0];
      if (champ === "subcategoryId" || champ === "payeeId" || champ === "ajouter" || champ === "retirer") {
        errors[champ] ??= { type: "validation", message: issue.message };
      }
    }
    return { values: {}, errors };
  };
}

const TITRES: Record<TypeGesteDialogue, string> = {
  SOUS_CATEGORIE: "Poser une sous-catégorie",
  BENEFICIAIRE: "Poser un bénéficiaire",
  ETIQUETTES: "Ajouter ou retirer des étiquettes",
};

export interface DialogueMasseProps {
  /** null = fermé. */
  readonly geste: TypeGesteDialogue | null;
  readonly descriptionSelection: string;
  readonly categories: readonly CategorieListe[];
  readonly beneficiaires: readonly OptionFiltre[];
  readonly etiquettes: readonly OptionFiltre[];
  readonly enCours: boolean;
  readonly onAppliquer: (geste: GesteMasse) => void;
  readonly onFermer: () => void;
}

interface FormulaireMasseProps extends Omit<DialogueMasseProps, "geste" | "descriptionSelection"> {
  readonly type: TypeGesteDialogue;
}

function FormulaireMasse(props: FormulaireMasseProps): ReactNode {
  const { type, categories, beneficiaires, etiquettes, enCours, onAppliquer, onFermer } = props;
  const form = useForm<ValeursMasse>({ resolver: resolveurPour(type), defaultValues: VALEURS_VIDES });

  function soumettre(valeurs: ValeursMasse): void {
    const analyse = schemaGesteMasse.safeParse(gesteBrut(type, valeurs));
    if (analyse.success) {
      onAppliquer(analyse.data);
    }
  }

  return (
    <Form {...form}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(evenement) => {
          void form.handleSubmit(soumettre)(evenement);
        }}
      >
        {type === "SOUS_CATEGORIE" && (
          <FormField
            control={form.control}
            name="subcategoryId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Sous-catégorie</FormLabel>
                <Select value={field.value ?? undefined} onValueChange={field.onChange} disabled={enCours}>
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Choisis une sous-catégorie" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {optionsSousCategories(categories, null).map((groupe) => (
                      <SelectGroup key={groupe.titre}>
                        <SelectLabel>{groupe.titre}</SelectLabel>
                        {groupe.options.map((option) => (
                          <SelectItem key={option.id} value={option.id}>
                            {option.libelle}
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

        {type === "BENEFICIAIRE" && (
          <FormField
            control={form.control}
            name="payeeId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Bénéficiaire</FormLabel>
                <Select value={field.value ?? undefined} onValueChange={field.onChange} disabled={enCours}>
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Choisis un bénéficiaire" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {beneficiaires.map((beneficiaire) => (
                      <SelectItem key={beneficiaire.id} value={beneficiaire.id}>
                        {beneficiaire.libelle}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        {type === "ETIQUETTES" && (
          <>
            <FormField
              control={form.control}
              name="ajouter"
              render={({ field }) => (
                <FormItem>
                  <ListeFiltreMultiple
                    legende="Ajouter"
                    groupes={[{ titre: null, options: etiquettes }]}
                    valeurs={field.value}
                    onChange={(valeurs) => {
                      field.onChange([...valeurs]);
                    }}
                    messageVide="Aucune étiquette."
                  />
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="retirer"
              render={({ field }) => (
                <FormItem>
                  <ListeFiltreMultiple
                    legende="Retirer"
                    groupes={[{ titre: null, options: etiquettes }]}
                    valeurs={field.value}
                    onChange={(valeurs) => {
                      field.onChange([...valeurs]);
                    }}
                    messageVide="Aucune étiquette."
                  />
                  <FormMessage />
                </FormItem>
              )}
            />
          </>
        )}

        <div className="bg-popover sticky bottom-0 z-10 flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onFermer} disabled={enCours}>
            Annuler
          </Button>
          <Button type="submit" disabled={enCours}>
            Appliquer
          </Button>
        </div>
      </form>
    </Form>
  );
}

export function DialogueMasse(props: DialogueMasseProps): ReactNode {
  const { geste, descriptionSelection, onFermer, ...reste } = props;
  return (
    <DialogueFormulaire
      ouvert={geste !== null}
      onOuvertChange={(ouvert) => {
        if (!ouvert) {
          onFermer();
        }
      }}
      titre={geste === null ? "" : TITRES[geste]}
      description={descriptionSelection}
    >
      {geste !== null && <FormulaireMasse key={geste} type={geste} onFermer={onFermer} {...reste} />}
    </DialogueFormulaire>
  );
}
