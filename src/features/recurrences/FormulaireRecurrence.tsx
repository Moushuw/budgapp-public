"use client";

// Le formulaire unique des récurrences — docs/lot-m3.md §4.6. Quatre modes : confirmer une suggestion, créer, créer depuis
// une transaction, modifier. Le schéma est celui des actions ; `raw: true` rend la chaîne saisie (montant, tolérances), que
// l'action convertit (CLAUDE.md §11).

import { zodResolver } from "@hookform/resolvers/zod";
import type { ReactNode } from "react";
import { useForm } from "react-hook-form";
import { ChampMontant } from "@/components/forms/ChampMontant";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
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
import { CADENCES_RECURRENCE } from "@/domain/recurrence";
import { LIBELLES_NATURE_RECURRENCE, NATURES_RECURRENCE } from "@/domain/referentiel";
import { AUCUNE_SOUS_CATEGORIE, optionsSousCategories } from "@/features/transactions/presentation";
import type { CategorieListe } from "@/server/actions/categories";
import { AVERTISSEMENT_MODIFICATION, libelleOptionCadence } from "./libelles";
import {
  LIMITE_LIBELLE_RECURRENCE,
  LIMITE_MOTIF_RECURRENCE,
  schemaFormulaireModificationRecurrence,
  schemaFormulaireRecurrence,
  type ValeursFormulaireRecurrence,
} from "./schema";

export type ModeFormulaireRecurrence = "CONFIRMATION" | "CREATION" | "CREATION_DEPUIS_TRANSACTION" | "MODIFICATION";

export interface OptionCompte {
  readonly id: string;
  readonly libelle: string;
}

export interface FormulaireRecurrenceProps {
  readonly mode: ModeFormulaireRecurrence;
  readonly valeursInitiales: ValeursFormulaireRecurrence;
  /** Les comptes qu'on peut choisir (mode CREATION seulement). */
  readonly comptes: readonly OptionCompte[];
  /** Le nom du compte en lecture seule (tous les modes sauf CREATION). */
  readonly nomCompte: string | null;
  readonly categories: readonly CategorieListe[];
  readonly enCours: boolean;
  readonly onSoumettre: (valeurs: ValeursFormulaireRecurrence) => void;
  readonly onAnnuler: () => void;
}

export function FormulaireRecurrence(props: FormulaireRecurrenceProps): ReactNode {
  const { mode, valeursInitiales, comptes, nomCompte, categories, enCours, onSoumettre, onAnnuler } = props;
  const form = useForm<ValeursFormulaireRecurrence>({
    resolver: zodResolver(
      mode === "MODIFICATION" ? schemaFormulaireModificationRecurrence : schemaFormulaireRecurrence,
      undefined,
      { raw: true },
    ),
    defaultValues: valeursInitiales,
  });

  return (
    <Form {...form}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(evenement) => {
          void form.handleSubmit((valeurs) => {
            onSoumettre(valeurs);
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
                <Input {...field} maxLength={LIMITE_LIBELLE_RECURRENCE} disabled={enCours} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {mode === "CREATION" ? (
          <FormField
            control={form.control}
            name="accountId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Compte</FormLabel>
                <Select value={field.value === "" ? undefined : field.value} onValueChange={field.onChange} disabled={enCours}>
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Choisis un compte" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {comptes.map((compte) => (
                      <SelectItem key={compte.id} value={compte.id}>
                        {compte.libelle}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        ) : (
          <FormField
            control={form.control}
            name="accountId"
            render={() => (
              <FormItem>
                <FormLabel>Compte</FormLabel>
                <FormControl>
                  <Input value={nomCompte ?? ""} disabled readOnly />
                </FormControl>
                <FormDescription>Le compte d&apos;une récurrence ne change pas.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="nature"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nature</FormLabel>
                <Select value={field.value} onValueChange={field.onChange} disabled={enCours}>
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {NATURES_RECURRENCE.map((nature) => (
                      <SelectItem key={nature} value={nature}>
                        {LIBELLES_NATURE_RECURRENCE[nature]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="montant"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Montant</FormLabel>
                <FormControl>
                  <ChampMontant
                    value={field.value}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    placeholder="-17,99"
                    disabled={enCours}
                  />
                </FormControl>
                <FormDescription>Négatif pour une sortie, positif pour une entrée.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="cadence"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Cadence</FormLabel>
                <Select value={field.value} onValueChange={field.onChange} disabled={enCours}>
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {CADENCES_RECURRENCE.map((cadence) => (
                      <SelectItem key={cadence} value={cadence}>
                        {libelleOptionCadence(cadence)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="dateAncrage"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Date d&apos;ancrage</FormLabel>
                <FormControl>
                  <Input type="date" {...field} disabled={enCours} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="subcategoryId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Sous-catégorie</FormLabel>
              <Select
                value={field.value ?? AUCUNE_SOUS_CATEGORIE}
                onValueChange={(valeur) => {
                  field.onChange(valeur === AUCUNE_SOUS_CATEGORIE ? null : valeur);
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
                  {optionsSousCategories(categories, field.value).map((groupe) => (
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

        <FormField
          control={form.control}
          name="motifRapprochement"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Motif de rapprochement</FormLabel>
              <FormControl>
                <Input {...field} maxLength={LIMITE_MOTIF_RECURRENCE} disabled={enCours} />
              </FormControl>
              <FormDescription>Texte que la description normalisée doit contenir.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="toleranceMontant"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Tolérance de montant</FormLabel>
                <FormControl>
                  <ChampMontant
                    value={field.value}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    placeholder="5,00"
                    disabled={enCours}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="toleranceJours"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Tolérance de jours</FormLabel>
                <FormControl>
                  <Input {...field} inputMode="numeric" disabled={enCours} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {mode === "MODIFICATION" && (
          <p data-avertissement="modification" className="text-muted-foreground text-sm">
            {AVERTISSEMENT_MODIFICATION}
          </p>
        )}

        {/* Compense le p-1 bas de DialogueFormulaire : sans cela le contenu défile visible sous la barre. */}
        <div data-barre-action className="bg-popover sticky -bottom-1 z-10 flex justify-end gap-2 pt-2 pb-1">
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
