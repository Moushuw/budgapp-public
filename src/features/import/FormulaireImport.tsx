"use client";

// Formulaire d'analyse — docs/lot-m1.md §8.2 : compte, année (5 dernières,
// défaut l'année courante), profil (une seule entrée), textarea du relevé.

import { zodResolver } from "@hookform/resolvers/zod";
import type { ReactNode } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { PROFILS_IMPORT } from "@/domain/statement";
import { useComptes } from "@/features/accounts/use-comptes";
import { schemaAnalyse, type EntreeAnalyse } from "./schema";

export interface FormulaireImportProps {
  readonly enCours: boolean;
  readonly onSoumettre: (entree: EntreeAnalyse) => void;
}

const ANNEE_COURANTE = new Date().getFullYear();
const CINQ_DERNIERES_ANNEES = Array.from({ length: 5 }, (_, index) => ANNEE_COURANTE - index);

export function FormulaireImport(props: FormulaireImportProps): ReactNode {
  const { enCours, onSoumettre } = props;
  const { data: comptes } = useComptes();

  const premierProfil = PROFILS_IMPORT[0];

  const form = useForm<EntreeAnalyse>({
    resolver: zodResolver(schemaAnalyse, undefined, { raw: true }),
    defaultValues: {
      accountId: "",
      annee: ANNEE_COURANTE,
      profilId: premierProfil?.id ?? "",
      texte: "",
    },
  });

  return (
    <Form {...form}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(evenement) => {
          void form.handleSubmit(onSoumettre)(evenement);
        }}
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <FormField
            control={form.control}
            name="accountId"
            render={({ field }) => (
              <FormItem className="min-w-0">
                <FormLabel>Compte</FormLabel>
                <Select value={field.value} onValueChange={field.onChange} disabled={enCours}>
                  <FormControl>
                    <SelectTrigger className="w-full min-w-0">
                      <SelectValue placeholder="Choisir un compte" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {(comptes ?? []).map((compte) => (
                      <SelectItem key={compte.id} value={compte.id}>
                        {compte.nom}
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
            name="annee"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Année</FormLabel>
                <Select
                  value={String(field.value)}
                  onValueChange={(valeur) => { field.onChange(Number(valeur)); }}
                  disabled={enCours}
                >
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {CINQ_DERNIERES_ANNEES.map((annee) => (
                      <SelectItem key={annee} value={String(annee)}>
                        {annee}
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
            name="profilId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Profil d&apos;import</FormLabel>
                <Select value={field.value} onValueChange={field.onChange} disabled={enCours}>
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {PROFILS_IMPORT.map((profil) => (
                      <SelectItem key={profil.id} value={profil.id}>
                        {profil.libelle}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="texte"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Relevé collé</FormLabel>
              <FormControl>
                <Textarea
                  {...field}
                  rows={12}
                  className="font-mono text-sm"
                  placeholder="Colle ici le texte copié depuis AccèsD…"
                  disabled={enCours}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex justify-end">
          <Button type="submit" disabled={enCours}>
            Analyser
          </Button>
        </div>
      </form>
    </Form>
  );
}
