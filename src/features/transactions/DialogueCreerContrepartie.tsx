"use client";

// Créer l'autre côté d'un virement — docs/lot-m2.md §4.4. Le schéma du formulaire est celui de l'action
// (schemaCreationContrepartie, champ accountId) ; la conséquence se dit avant de créer.

import { zodResolver } from "@hookform/resolvers/zod";
import { useWatch, useForm } from "react-hook-form";
import type { ReactNode } from "react";
import { DialogueFormulaire } from "@/components/referentiel/DialogueFormulaire";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { DetailTransaction } from "@/domain/consultation";
import type { OptionFiltre } from "./ListeFiltreMultiple";
import { libelleContrepartie } from "./presentation";
import { schemaFormulaireContrepartie, type ValeursFormulaireContrepartie } from "./schema";

export interface DialogueCreerContrepartieProps {
  readonly ouvert: boolean;
  readonly detail: DetailTransaction | null;
  /** Les comptes non archivés ; celui de la transaction est retiré ici. */
  readonly comptes: readonly OptionFiltre[];
  readonly enCours: boolean;
  /** true si la création a réussi (le toast vient du hook). */
  readonly onCreer: (accountId: string) => Promise<boolean>;
  readonly onFermer: () => void;
}

function FormulaireContrepartie(props: {
  readonly detail: DetailTransaction;
  readonly comptes: readonly OptionFiltre[];
  readonly enCours: boolean;
  readonly onCreer: (accountId: string) => Promise<boolean>;
  readonly onFermer: () => void;
}): ReactNode {
  const { detail, comptes, enCours, onCreer, onFermer } = props;
  const form = useForm<ValeursFormulaireContrepartie>({
    resolver: zodResolver(schemaFormulaireContrepartie),
    defaultValues: { accountId: "" },
  });
  const accountId = useWatch({ control: form.control, name: "accountId" });
  const compteChoisi = comptes.find((compte) => compte.id === accountId);

  return (
    <Form {...form}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(evenement) => {
          void form.handleSubmit(async (valeurs) => {
            if (await onCreer(valeurs.accountId)) {
              onFermer();
            }
          })(evenement);
        }}
      >
        <FormField
          control={form.control}
          name="accountId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Compte de la contrepartie</FormLabel>
              <Select value={field.value === "" ? undefined : field.value} onValueChange={field.onChange} disabled={enCours}>
                <FormControl>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Choisis un compte" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {comptes
                    .filter((compte) => compte.id !== detail.accountId)
                    .map((compte) => (
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

        {compteChoisi !== undefined && (
          <p data-consequence-contrepartie className="text-sm">
            {libelleContrepartie(detail, compteChoisi.libelle, detail.compteNom)}
          </p>
        )}

        <div className="bg-popover sticky bottom-0 z-10 flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onFermer} disabled={enCours}>
            Annuler
          </Button>
          <Button type="submit" disabled={enCours}>
            Créer et lier
          </Button>
        </div>
      </form>
    </Form>
  );
}

/** Le formulaire n'est monté qu'ouvert : à chaque ouverture, le compte choisi et les erreurs repartent de zéro. */
export function DialogueCreerContrepartie(props: DialogueCreerContrepartieProps): ReactNode {
  const { ouvert, detail, comptes, enCours, onCreer, onFermer } = props;
  return (
    <DialogueFormulaire
      ouvert={ouvert && detail !== null}
      onOuvertChange={(valeur) => {
        if (!valeur) {
          onFermer();
        }
      }}
      titre="Créer la contrepartie"
    >
      {detail !== null && (
        <FormulaireContrepartie detail={detail} comptes={comptes} enCours={enCours} onCreer={onCreer} onFermer={onFermer} />
      )}
    </DialogueFormulaire>
  );
}
