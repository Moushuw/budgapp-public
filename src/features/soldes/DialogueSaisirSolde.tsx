"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import type { ReactNode } from "react";
import { useForm } from "react-hook-form";
import { ChampMontant } from "@/components/forms/ChampMontant";
import { DialogueFormulaire } from "@/components/referentiel/DialogueFormulaire";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { dateCivileDansFuseau, FUSEAU_APPLICATION } from "@/domain/dates";
import { LIBELLES_SOURCE_SOLDE } from "@/domain/referentiel";
import { SOURCES_SOLDE_SAISISSABLES } from "@/domain/solde";
import { schemaFormulaireSolde, type ValeursFormulaireSolde } from "./schema";

export interface DialogueSaisirSoldeProps {
  readonly ouvert: boolean;
  readonly enCours: boolean;
  /** Les valeurs saisies, le montant en chaîne : l'action le convertit (CLAUDE.md §11). */
  readonly onEnregistrer: (valeurs: ValeursFormulaireSolde) => void;
  readonly onFermer: () => void;
}

function CorpsSaisie(props: {
  readonly enCours: boolean;
  readonly onEnregistrer: (valeurs: ValeursFormulaireSolde) => void;
  readonly onFermer: () => void;
}): ReactNode {
  const { enCours, onEnregistrer, onFermer } = props;
  const form = useForm<ValeursFormulaireSolde>({
    resolver: zodResolver(schemaFormulaireSolde, undefined, { raw: true }),
    defaultValues: { date: dateCivileDansFuseau(new Date(), FUSEAU_APPLICATION), montant: "", source: "RELEVE" },
  });
  return (
    <Form {...form}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(evenement) => {
          void form.handleSubmit(onEnregistrer)(evenement);
        }}
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="date"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Date</FormLabel>
                <FormControl>
                  <Input type="date" {...field} disabled={enCours} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="montant"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Solde déclaré</FormLabel>
                <FormControl>
                  <ChampMontant value={field.value} onChange={field.onChange} onBlur={field.onBlur} disabled={enCours} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <p className="text-muted-foreground text-sm">
          Le solde affiché par la banque à cette date, opérations du jour comprises.
        </p>
        <FormField
          control={form.control}
          name="source"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Source</FormLabel>
              <Select value={field.value} onValueChange={field.onChange} disabled={enCours}>
                <FormControl>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {SOURCES_SOLDE_SAISISSABLES.map((source) => (
                    <SelectItem key={source} value={source}>
                      {LIBELLES_SOURCE_SOLDE[source]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <div data-barre-action className="bg-popover sticky -bottom-1 z-10 flex justify-end gap-2 pt-2 pb-1">
          <Button type="button" variant="outline" onClick={onFermer} disabled={enCours}>
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

export function DialogueSaisirSolde(props: DialogueSaisirSoldeProps): ReactNode {
  const { ouvert, enCours, onEnregistrer, onFermer } = props;
  // Le corps n'existe que dialogue ouvert : il est remonté à chaque ouverture, valeurs et erreurs repartent de zéro.
  return (
    <DialogueFormulaire
      ouvert={ouvert}
      onOuvertChange={(valeur) => {
        if (!valeur) {
          onFermer();
        }
      }}
      titre="Saisir un solde"
    >
      {ouvert && <CorpsSaisie enCours={enCours} onEnregistrer={onEnregistrer} onFermer={onFermer} />}
    </DialogueFormulaire>
  );
}
