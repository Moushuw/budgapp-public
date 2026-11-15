"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import type { ReactNode } from "react";
import { useForm, useWatch } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
// Import direct, pas depuis le barillet @/domain/ingestion : ce composant
// est "use client", et le barillet réexporte aussi calculerEmpreinte
// (node:crypto, ./empreinte.ts) dans le même index.ts — même précédent que
// src/features/import/etat-revue.ts, corrigé à la relecture de la tranche 6
// point 8 (journal INDEX.md du 2026-09-20).
import { normaliserNom } from "@/domain/ingestion/normaliser";
import { useCategories } from "@/features/categories/use-categories";
import { schemaBeneficiaire, type EntreeBeneficiaire } from "./schema";

export interface FormulaireBeneficiaireProps {
  readonly valeurInitiale?: EntreeBeneficiaire;
  readonly enCours: boolean;
  readonly onSoumettre: (entree: EntreeBeneficiaire) => void;
  readonly onAnnuler: () => void;
}

const VALEURS_PAR_DEFAUT: EntreeBeneficiaire = {
  nom: "",
  sousCategorieParDefautId: null,
  autoCategorisation: true, // même défaut que Prisma
  categorieVerrouillee: false,
};

const AUCUNE_SOUS_CATEGORIE = "aucune";

export function FormulaireBeneficiaire(props: FormulaireBeneficiaireProps): ReactNode {
  const { valeurInitiale, enCours, onSoumettre, onAnnuler } = props;

  const form = useForm<EntreeBeneficiaire>({
    resolver: zodResolver(schemaBeneficiaire, undefined, { raw: true }),
    defaultValues: valeurInitiale ?? VALEURS_PAR_DEFAUT,
  });

  const { data: categories } = useCategories();

  const nom = useWatch({ control: form.control, name: "nom" });
  const sousCategorieParDefautId = useWatch({ control: form.control, name: "sousCategorieParDefautId" });
  const nomNormalise = normaliserNom(nom);

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
                <Input {...field} placeholder="Amazon" disabled={enCours} />
              </FormControl>
              {nomNormalise !== "" ? (
                <p className="text-muted-foreground text-xs">
                  Nom normalisé : {nomNormalise} — recalculé automatiquement, il sert au rapprochement à l&apos;import.
                </p>
              ) : (
                <p className="text-muted-foreground text-xs">
                  Nom normalisé : vide — ce bénéficiaire ne sera reconnu par aucune ligne de relevé.
                </p>
              )}
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="sousCategorieParDefautId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Sous-catégorie par défaut</FormLabel>
              <Select
                value={field.value ?? AUCUNE_SOUS_CATEGORIE}
                onValueChange={(valeur) => {
                  field.onChange(valeur === AUCUNE_SOUS_CATEGORIE ? null : valeur);
                  // Un champ dont la pertinence dépend d'un autre champ est remis à son
                  // état neutre quand le maître change (CLAUDE.md §9) : sans ça, revenir
                  // à « Aucune » laisse le verrou à `true` avec le switch désactivé, sans
                  // moyen de corriger l'erreur de validation qui en résulte.
                  if (valeur === AUCUNE_SOUS_CATEGORIE) {
                    form.setValue("categorieVerrouillee", false, { shouldValidate: true, shouldDirty: true });
                  }
                }}
                disabled={enCours}
              >
                <FormControl>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value={AUCUNE_SOUS_CATEGORIE}>Aucune</SelectItem>
                  {(categories ?? []).map((categorie) => (
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

        <FormField
          control={form.control}
          name="autoCategorisation"
          render={({ field }) => (
            <FormItem className="flex items-center justify-between gap-4">
              <div>
                <FormLabel>Auto-catégorisation</FormLabel>
                <p className="text-muted-foreground text-sm">
                  Désactivée, ce bénéficiaire n&apos;impose jamais de sous-catégorie.
                </p>
              </div>
              <FormControl>
                <Switch checked={field.value} onCheckedChange={field.onChange} disabled={enCours} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="categorieVerrouillee"
          render={({ field }) => (
            <FormItem className="flex items-center justify-between gap-4">
              <div>
                <FormLabel>Catégorie verrouillée</FormLabel>
                <p className="text-muted-foreground text-sm">
                  Verrouillée, aucune règle ne remplacera cette sous-catégorie.
                </p>
              </div>
              <FormControl>
                <Switch
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  disabled={enCours || sousCategorieParDefautId === null}
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
