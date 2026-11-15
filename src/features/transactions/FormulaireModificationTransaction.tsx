"use client";

// Modification d'une transaction dans le panneau de détail — docs/lot-m2.md
// §6.1. Un champ verrouillé garde la valeur du détail et dit pourquoi : il ne
// part donc jamais dans les changements (changementsModification).

import { zodResolver } from "@hookform/resolvers/zod";
import { useState, type ReactNode } from "react";
import { useForm, useWatch } from "react-hook-form";
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { DetailTransaction } from "@/domain/consultation";
import { messageRefus } from "@/domain/edition";
import type { ReferentielEcriture } from "./FormulaireNouvelleTransaction";
import { ListeFiltreMultiple } from "./ListeFiltreMultiple";
import {
  AUCUN_BENEFICIAIRE,
  AUCUNE_SOUS_CATEGORIE,
  NOUVEAU_BENEFICIAIRE,
  optionsSousCategories,
} from "./presentation";
import {
  changementsModification,
  LIMITE_DESCRIPTION,
  LIMITE_NOM_BENEFICIAIRE_TRANSACTION,
  LIMITE_NOTE_TRANSACTION,
  schemaFormulaireModification,
  versValeursModification,
  type EntreeModificationTransaction,
  type ValeursFormulaireModification,
} from "./schema";

export interface FormulaireModificationTransactionProps {
  readonly detail: DetailTransaction;
  readonly referentiel: ReferentielEcriture;
  readonly enCours: boolean;
  /** null : rien n'a changé, aucun appel ne doit partir. */
  readonly onSoumettre: (entree: EntreeModificationTransaction | null) => void;
  readonly onAnnuler: () => void;
}

export function FormulaireModificationTransaction(props: FormulaireModificationTransactionProps): ReactNode {
  const { detail, referentiel, enCours, onSoumettre, onAnnuler } = props;
  const form = useForm<ValeursFormulaireModification>({
    resolver: zodResolver(schemaFormulaireModification, undefined, { raw: true }),
    defaultValues: versValeursModification(detail),
  });
  const payeeId = useWatch({ control: form.control, name: "payeeId" });
  const payeeNouveauNom = useWatch({ control: form.control, name: "payeeNouveauNom" });
  const [nomEfface, setNomEfface] = useState(false);

  const valeurBeneficiaire =
    payeeNouveauNom !== null ? NOUVEAU_BENEFICIAIRE : (payeeId ?? AUCUN_BENEFICIAIRE);

  function changerBeneficiaire(valeur: string): void {
    if (valeur === NOUVEAU_BENEFICIAIRE) {
      form.setValue("payeeId", null);
      form.setValue("payeeNouveauNom", "");
      setNomEfface(false);
      return;
    }
    // Ce qui va être effacé se dit à l'utilisateur, et se calcule avant la remise à zéro.
    setNomEfface((form.getValues("payeeNouveauNom") ?? "").trim() !== "");
    form.setValue("payeeId", valeur === AUCUN_BENEFICIAIRE ? null : valeur);
    form.setValue("payeeNouveauNom", null);
    form.clearErrors("payeeNouveauNom");
  }

  function soumettre(valeurs: ValeursFormulaireModification): void {
    const sortie = schemaFormulaireModification.parse(valeurs);
    onSoumettre(changementsModification(detail, valeurs, sortie));
  }

  const { refus } = detail;

  return (
    <Form {...form}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(evenement) => {
          void form.handleSubmit(soumettre)(evenement);
        }}
      >
        <p className="text-muted-foreground text-sm">Compte : {detail.compteNom}</p>

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description</FormLabel>
              <FormControl>
                <Input {...field} maxLength={LIMITE_DESCRIPTION} disabled={enCours} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="date"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Date</FormLabel>
              <FormControl>
                <Input type="date" {...field} disabled={enCours || refus.date !== null} />
              </FormControl>
              {refus.date !== null && (
                <FormDescription data-raison="date">{messageRefus(refus.date)}</FormDescription>
              )}
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
                  disabled={enCours || refus.montant !== null}
                />
              </FormControl>
              {refus.montant !== null ? (
                <FormDescription data-raison="montant">{messageRefus(refus.montant)}</FormDescription>
              ) : (
                <FormDescription>Négatif pour une sortie, positif pour une entrée.</FormDescription>
              )}
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="payeeId"
          render={() => (
            <FormItem>
              <FormLabel>Bénéficiaire</FormLabel>
              <Select value={valeurBeneficiaire} onValueChange={changerBeneficiaire} disabled={enCours}>
                <FormControl>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value={AUCUN_BENEFICIAIRE}>Aucun</SelectItem>
                  {referentiel.beneficiaires.map((beneficiaire) => (
                    <SelectItem key={beneficiaire.id} value={beneficiaire.id}>
                      {beneficiaire.libelle}
                    </SelectItem>
                  ))}
                  <SelectItem value={NOUVEAU_BENEFICIAIRE}>Nouveau bénéficiaire…</SelectItem>
                </SelectContent>
              </Select>
              {nomEfface && (
                <p className="text-muted-foreground text-sm">Le nom saisi pour le nouveau bénéficiaire a été effacé.</p>
              )}
              <FormMessage />
            </FormItem>
          )}
        />

        {payeeNouveauNom !== null && (
          <FormField
            control={form.control}
            name="payeeNouveauNom"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nom du nouveau bénéficiaire</FormLabel>
                <FormControl>
                  <Input
                    value={field.value ?? ""}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    maxLength={LIMITE_NOM_BENEFICIAIRE_TRANSACTION}
                    disabled={enCours}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

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
                disabled={enCours || refus.sousCategorie !== null}
              >
                <FormControl>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value={AUCUNE_SOUS_CATEGORIE}>Aucune</SelectItem>
                  {optionsSousCategories(referentiel.categories, detail.subcategoryId).map((groupe) => (
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
              {refus.sousCategorie !== null && (
                <FormDescription data-raison="sous-categorie">{messageRefus(refus.sousCategorie)}</FormDescription>
              )}
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="note"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Note</FormLabel>
              <FormControl>
                <Textarea
                  value={field.value ?? ""}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  maxLength={LIMITE_NOTE_TRANSACTION}
                  disabled={enCours}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="tagIds"
          render={({ field }) => (
            <FormItem>
              <ListeFiltreMultiple
                legende="Étiquettes"
                groupes={[{ titre: null, options: referentiel.etiquettes }]}
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
          name="aRevoir"
          render={({ field }) => (
            <FormItem className="flex items-center justify-between gap-4">
              <FormLabel>À revoir</FormLabel>
              <FormControl>
                <Switch checked={field.value} onCheckedChange={field.onChange} disabled={enCours} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="exclureDuBudget"
          render={({ field }) => (
            <FormItem className="flex items-center justify-between gap-4">
              <FormLabel>Exclue du budget</FormLabel>
              <FormControl>
                <Switch checked={field.value} onCheckedChange={field.onChange} disabled={enCours} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="exclureDesRapports"
          render={({ field }) => (
            <FormItem className="flex items-center justify-between gap-4">
              <FormLabel>Exclue des rapports</FormLabel>
              <FormControl>
                <Switch checked={field.value} onCheckedChange={field.onChange} disabled={enCours} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Compense le px-4 pb-4 du panneau de détail : sans cela le contenu défile visible sous la barre (docs/pilotage/passes/m2.md P1-e). */}
        <div data-barre-action className="bg-popover sticky -bottom-4 z-10 flex justify-end gap-2 border-t pt-2 pb-4">
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
