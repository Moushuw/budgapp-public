"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import type { ReactNode } from "react";
import { useForm } from "react-hook-form";
import { ChampMontant } from "@/components/forms/ChampMontant";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import type { FiltresTransactions } from "@/domain/consultation";
import { ListeFiltreMultiple, type GroupeOptionsFiltre, type OptionFiltre } from "./ListeFiltreMultiple";
import {
  appliquerFormulaire,
  schemaFormulaireFiltres,
  versValeursFormulaire,
  type ValeursFormulaireFiltres,
} from "./schema";

export interface ReferentielFiltres {
  readonly comptes: readonly OptionFiltre[];
  readonly sousCategories: readonly GroupeOptionsFiltre[];
  readonly beneficiaires: readonly OptionFiltre[];
  readonly etiquettes: readonly OptionFiltre[];
}

export interface PanneauFiltresProps {
  readonly ouvert: boolean;
  readonly filtres: FiltresTransactions;
  readonly referentiel: ReferentielFiltres;
  readonly onFermer: () => void;
  readonly onAppliquer: (filtres: FiltresTransactions) => void;
}

interface FormulaireFiltresProps {
  readonly filtres: FiltresTransactions;
  readonly referentiel: ReferentielFiltres;
  readonly onFermer: () => void;
  readonly onAppliquer: (filtres: FiltresTransactions) => void;
}

function FormulaireFiltres(props: FormulaireFiltresProps): ReactNode {
  const { filtres, referentiel, onFermer, onAppliquer } = props;

  // `raw: true` (patron de FormulaireCompte) : le formulaire détient les
  // chaînes saisies ; la conversion en cents est refaite ici, sur des valeurs
  // que le résolveur vient de valider.
  const form = useForm<ValeursFormulaireFiltres>({
    resolver: zodResolver(schemaFormulaireFiltres, undefined, { raw: true }),
    defaultValues: versValeursFormulaire(filtres),
  });

  function soumettre(valeurs: ValeursFormulaireFiltres): void {
    onAppliquer(appliquerFormulaire(filtres, schemaFormulaireFiltres.parse(valeurs)));
  }

  return (
    <Form {...form}>
      <form
        className="flex min-h-0 flex-1 flex-col"
        onSubmit={(evenement) => {
          void form.handleSubmit(soumettre)(evenement);
        }}
      >
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-x-hidden overflow-y-auto px-4 pb-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="du"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Du</FormLabel>
                  <FormControl>
                    <Input type="date" data-champ-date {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="au"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Au</FormLabel>
                  <FormControl>
                    <Input type="date" data-champ-date {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="comptes"
            render={({ field }) => (
              <FormItem>
                <ListeFiltreMultiple
                  legende="Comptes"
                  groupes={[{ titre: null, options: referentiel.comptes }]}
                  valeurs={field.value}
                  onChange={field.onChange}
                  messageVide="Aucun compte."
                />
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="sousCategories"
            render={({ field }) => (
              <FormItem>
                <ListeFiltreMultiple
                  legende="Sous-catégories"
                  groupes={referentiel.sousCategories}
                  valeurs={field.value}
                  onChange={field.onChange}
                  messageVide="Aucune sous-catégorie."
                />
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="nonCategorisee"
            render={({ field }) => (
              <FormItem className="flex items-center justify-between gap-4">
                <FormLabel>Non catégorisée</FormLabel>
                <FormControl>
                  <Switch checked={field.value} onCheckedChange={field.onChange} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="beneficiaires"
            render={({ field }) => (
              <FormItem>
                <ListeFiltreMultiple
                  legende="Bénéficiaires"
                  groupes={[{ titre: null, options: referentiel.beneficiaires }]}
                  valeurs={field.value}
                  onChange={field.onChange}
                  messageVide="Aucun bénéficiaire."
                />
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="etiquettes"
            render={({ field }) => (
              <FormItem>
                <ListeFiltreMultiple
                  legende="Étiquettes"
                  groupes={[{ titre: null, options: referentiel.etiquettes }]}
                  valeurs={field.value}
                  onChange={field.onChange}
                  messageVide="Aucune étiquette."
                />
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="montantMin"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Montant minimum</FormLabel>
                  <FormControl>
                    <ChampMontant value={field.value} onChange={field.onChange} onBlur={field.onBlur} placeholder="0,00" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="montantMax"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Montant maximum</FormLabel>
                  <FormControl>
                    <ChampMontant value={field.value} onChange={field.onChange} onBlur={field.onBlur} placeholder="0,00" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="sens"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Sens</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="TOUT">Tout</SelectItem>
                    <SelectItem value="ENTREES">Entrées</SelectItem>
                    <SelectItem value="SORTIES">Sorties</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="aRevoir"
            render={({ field }) => (
              <FormItem className="flex items-center justify-between gap-4">
                <FormLabel>À revoir</FormLabel>
                <FormControl>
                  <Switch checked={field.value} onCheckedChange={field.onChange} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="virements"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Virements</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="INCLURE">Inclure</SelectItem>
                    <SelectItem value="SEULEMENT">Seulement</SelectItem>
                    <SelectItem value="EXCLURE">Exclure</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="recurrences"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Liées à une récurrence</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="INCLURE">Inclure</SelectItem>
                    <SelectItem value="SEULEMENT">Seulement</SelectItem>
                    <SelectItem value="EXCLURE">Exclure</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="ventileesSeulement"
            render={({ field }) => (
              <FormItem className="flex items-center justify-between gap-4">
                <FormLabel>Ventilées seulement</FormLabel>
                <FormControl>
                  <Switch checked={field.value} onCheckedChange={field.onChange} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="exclueDuBudget"
            render={({ field }) => (
              <FormItem className="flex items-center justify-between gap-4">
                <FormLabel>Exclues du budget</FormLabel>
                <FormControl>
                  <Switch checked={field.value} onCheckedChange={field.onChange} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="exclueDesRapports"
            render={({ field }) => (
              <FormItem className="flex items-center justify-between gap-4">
                <FormLabel>Exclues des rapports</FormLabel>
                <FormControl>
                  <Switch checked={field.value} onCheckedChange={field.onChange} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="bg-popover sticky bottom-0 z-10 flex justify-end gap-2 border-t p-4">
          <Button type="button" variant="outline" onClick={onFermer}>
            Annuler
          </Button>
          <Button type="submit">Appliquer</Button>
        </div>
      </form>
    </Form>
  );
}

export function PanneauFiltres(props: PanneauFiltresProps): ReactNode {
  const { ouvert, filtres, referentiel, onFermer, onAppliquer } = props;
  return (
    <Sheet
      open={ouvert}
      onOpenChange={(valeur) => {
        if (!valeur) {
          onFermer();
        }
      }}
    >
      <SheetContent side="right">
        <SheetHeader>
          <SheetTitle>Filtres</SheetTitle>
          <SheetDescription className="sr-only">Filtrer la liste des transactions.</SheetDescription>
        </SheetHeader>
        <FormulaireFiltres filtres={filtres} referentiel={referentiel} onFermer={onFermer} onAppliquer={onAppliquer} />
      </SheetContent>
    </Sheet>
  );
}
