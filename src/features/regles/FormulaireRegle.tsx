"use client";

// FormulaireRegle — docs/lot-m1.md §4.6. useFieldArray pour conditions et
// actions (premier usage du projet). Un seul onSubmit, branché sur
// form.handleSubmit ; aucun bouton hors du <form> qui le rappellerait en
// parallèle (CLAUDE.md §9).

import { zodResolver } from "@hookform/resolvers/zod";
import { Plus } from "lucide-react";
import type { ReactNode } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { operateurParDefaut } from "@/domain/categorization";
import { useComptes } from "@/features/accounts/use-comptes";
import { useCategories } from "@/features/categories/use-categories";
import { useEtiquettes } from "@/features/etiquettes/use-etiquettes";
import { LigneAction } from "./LigneAction";
import { LigneCondition } from "./LigneCondition";
import {
  MESSAGE_SOUS_CATEGORIE_DISPARUE,
  partsSousCategorieDisparue,
  schemaRegle,
  type EntreeActionFormulaire, type EntreeConditionFormulaire, type EntreeRegle } from "./schema";

export interface FormulaireRegleProps {
  readonly valeurInitiale?: EntreeRegle;
  readonly enCours: boolean;
  readonly onSoumettre: (entree: EntreeRegle) => void;
  readonly onAnnuler: () => void;
}

const CONDITION_PAR_DEFAUT: EntreeConditionFormulaire = {
  champ: "DESCRIPTION_NORMALISEE",
  operateur: operateurParDefaut("DESCRIPTION_NORMALISEE"),
  valeur: "",
  valeurFin: "",
};

const ACTION_PAR_DEFAUT: EntreeActionFormulaire = { type: "CATEGORISER", subcategoryId: null, valeur: "", ventilation: [] };

const VALEURS_PAR_DEFAUT: EntreeRegle = {
  libelle: "",
  priorite: "0",
  actif: true,
  conditions: [CONDITION_PAR_DEFAUT],
  actions: [ACTION_PAR_DEFAUT],
};

export function FormulaireRegle(props: FormulaireRegleProps): ReactNode {
  const { valeurInitiale, enCours, onSoumettre, onAnnuler } = props;

  const form = useForm<EntreeRegle>({
    resolver: zodResolver(schemaRegle, undefined, { raw: true }),
    defaultValues: valeurInitiale ?? VALEURS_PAR_DEFAUT,
  });

  const conditionsArray = useFieldArray({ control: form.control, name: "conditions" });
  const actionsArray = useFieldArray({ control: form.control, name: "actions" });

  const { data: comptesData } = useComptes();
  const { data: categoriesData } = useCategories();
  const { data: etiquettesData } = useEtiquettes();

  const comptes = comptesData ?? [];
  const categories = categoriesData ?? [];
  const etiquettes = etiquettesData ?? [];
  // null tant que les catégories ne sont pas chargées : on ne peut alors rien affirmer d'une part.
  const sousCategoriesConnues =
    categoriesData === undefined
      ? null
      : new Set(categoriesData.flatMap((categorie) => categorie.sousCategories.map((sc) => sc.id)));

  const erreurConditions = form.formState.errors.conditions;
  const messageErreurConditions =
    erreurConditions !== undefined && "message" in erreurConditions ? erreurConditions.message : undefined;

  const erreurActions = form.formState.errors.actions;
  const messageErreurActions =
    erreurActions !== undefined && "message" in erreurActions ? erreurActions.message : undefined;

  return (
    <Form {...form}>
      {/* overflow-x-hidden : la zone de clic agrandie du Switch (after:-inset-x-3) dépasse le bord droit
          et ferait apparaître une barre de défilement horizontale. */}
      <form
        className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto overflow-x-hidden pr-1"
        onSubmit={(evenement) => {
          void form.handleSubmit((entree) => {
            // Tant que les catégories ne sont pas chargées, on ne peut rien affirmer : le serveur contrôle de toute façon.
            if (sousCategoriesConnues !== null) {
              const disparues = partsSousCategorieDisparue(entree.actions, sousCategoriesConnues);
              for (const { action, part } of disparues) {
                form.setError(`actions.${action}.ventilation.${part}.subcategoryId`, {
                  type: "custom",
                  message: MESSAGE_SOUS_CATEGORIE_DISPARUE,
                });
              }
              if (disparues.length > 0) {
                return;
              }
            }
            onSoumettre(entree);
          })(evenement);
        }}
      >
        <FormField
          control={form.control}
          name="libelle"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Libellé</FormLabel>
              <FormControl>
                <Input {...field} placeholder="Épicerie IGA" disabled={enCours} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-4">
          <FormField
            control={form.control}
            name="priorite"
            render={({ field }) => (
              <FormItem className="min-w-0">
                <FormLabel>Priorité</FormLabel>
                <FormControl>
                  <Input {...field} inputMode="numeric" placeholder="0" disabled={enCours} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="actif"
            render={({ field }) => (
              <FormItem className="flex min-w-0 items-center justify-between gap-4">
                <FormLabel>Active</FormLabel>
                <FormControl>
                  <Switch
                    className="shrink-0"
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    disabled={enCours}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Conditions</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={enCours}
              onClick={() => {
                conditionsArray.append(CONDITION_PAR_DEFAUT);
              }}
            >
              <Plus />
              Ajouter une condition
            </Button>
          </div>

          {conditionsArray.fields.map((champ, index) => (
            <LigneCondition
              key={champ.id}
              form={form}
              index={index}
              comptes={comptes}
              onSupprimer={() => {
                conditionsArray.remove(index);
              }}
              suppressionDesactivee={enCours || conditionsArray.fields.length <= 1}
            />
          ))}

          {messageErreurConditions !== undefined && <p className="text-destructive text-sm">{messageErreurConditions}</p>}
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Actions</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={enCours}
              onClick={() => {
                actionsArray.append(ACTION_PAR_DEFAUT);
              }}
            >
              <Plus />
              Ajouter une action
            </Button>
          </div>

          {actionsArray.fields.map((champ, index) => (
            <LigneAction
              key={champ.id}
              form={form}
              index={index}
              categories={categories}
              sousCategoriesConnues={sousCategoriesConnues}
              etiquettes={etiquettes}
              onSupprimer={() => {
                actionsArray.remove(index);
              }}
              suppressionDesactivee={enCours || actionsArray.fields.length <= 1}
              enCours={enCours}
            />
          ))}

          {messageErreurActions !== undefined && <p className="text-destructive text-sm">{messageErreurActions}</p>}
        </div>

        <div className="sticky bottom-0 z-10 flex justify-end gap-2 bg-popover pt-2">
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
