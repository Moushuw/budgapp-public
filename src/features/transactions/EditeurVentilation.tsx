"use client";

// Ventiler une transaction, ou modifier sa ventilation, dans le panneau de détail — docs/lot-m2.md §4.2.
// Toutes les lignes sont remplacées d'un coup à l'enregistrement : l'éditeur n'écrit rien tant que la somme
// des lignes n'égale pas le montant de la transaction.

import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2 } from "lucide-react";
import { useMemo, useRef, type ReactNode } from "react";
import { useFieldArray, useForm, useWatch, type FieldErrors } from "react-hook-form";
import { ChampMontant } from "@/components/forms/ChampMontant";
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
import type { DetailTransaction } from "@/domain/consultation";
import { LIMITE_LIGNES_VENTILATION } from "@/domain/ventilation";
import type { ReferentielEcriture } from "./FormulaireNouvelleTransaction";
import { ListeFiltreMultiple } from "./ListeFiltreMultiple";
import { MontantTransaction } from "./MontantTransaction";
import { AUCUNE_SOUS_CATEGORIE, optionsSousCategories } from "./presentation";
import {
  LIMITE_NOTE_TRANSACTION,
  schemaFormulaireVentilation,
  type EntreeVentilation,
  type ValeursFormulaireVentilation,
} from "./schema";
import {
  LIGNE_VENTILATION_VIDE,
  messageResteARepartir,
  parentVentilationDepuisDetail,
  versValeursVentilation,
} from "./ventilation";

export interface EditeurVentilationProps {
  readonly detail: DetailTransaction;
  readonly referentiel: ReferentielEcriture;
  readonly enCours: boolean;
  readonly onSoumettre: (entree: EntreeVentilation) => void;
  readonly onAnnuler: () => void;
}

// Une erreur de niveau tableau est rangée sous `root` par le résolveur (@hookform/resolvers, toNestErrors).
function messageErreurTableau(erreurs: FieldErrors<ValeursFormulaireVentilation>): string | undefined {
  return erreurs.lignes?.root?.message ?? erreurs.lignes?.message;
}

export function EditeurVentilation(props: EditeurVentilationProps): ReactNode {
  const { detail, referentiel, enCours, onSoumettre, onAnnuler } = props;
  const { montantCents, estFille, estVirement } = parentVentilationDepuisDetail(detail);
  const schema = useMemo(
    () => schemaFormulaireVentilation({ montantCents, estFille, estVirement }),
    [montantCents, estFille, estVirement],
  );
  const form = useForm<ValeursFormulaireVentilation>({
    resolver: zodResolver(schema, undefined, { raw: true }),
    defaultValues: versValeursVentilation(detail),
  });
  const { fields, append, remove } = useFieldArray({ control: form.control, name: "lignes" });
  const lignes = useWatch({ control: form.control, name: "lignes" });

  const messageReste = messageResteARepartir(
    detail.montantCents,
    lignes.map((ligne) => ligne.montant),
  );
  const { isSubmitted } = form.formState;
  const zoneReste = useRef<HTMLParagraphElement>(null);
  const messageTableau = messageErreurTableau(form.formState.errors);
  const messageGlobal = messageReste ?? messageTableau;

  // L'erreur de niveau tableau décrit les lignes telles qu'elles étaient à la dernière soumission : dès qu'une
  // ligne change, ou qu'on en ajoute ou retire une, on la recalcule plutôt que de la laisser périmée à l'écran.
  function rafraichirErreursTableau(): void {
    if (isSubmitted) {
      void form.trigger("lignes");
    }
  }

  return (
    <Form {...form}>
      <form
        data-section="editeur-ventilation"
        className="flex flex-col gap-4"
        onSubmit={(evenement) => {
          void form.handleSubmit(
            (valeurs) => {
              onSoumettre({ id: detail.id, lignes: valeurs.lignes });
            },
            (erreurs) => {
              if (messageErreurTableau(erreurs) !== undefined) {
                zoneReste.current?.focus({ preventScroll: true });
              }
            },
          )(evenement);
        }}
      >
        <div className="flex flex-col gap-1">
          <h3 className="text-sm font-semibold">{detail.estVentilee ? "Modifier la ventilation" : "Ventiler la transaction"}</h3>
          <p className="text-muted-foreground text-sm">
            Montant à répartir : <MontantTransaction cents={detail.montantCents} />
          </p>
        </div>

        {fields.map((champ, index) => {
          const n = index + 1;
          return (
            <fieldset key={champ.id} className="flex min-w-0 flex-col gap-2 rounded-lg border p-3">
              <legend className="px-1 text-sm font-medium">{`Ligne ${String(n)}`}</legend>

              <div className="flex flex-col gap-2">
                <FormField
                  control={form.control}
                  name={`lignes.${index}.subcategoryId`}
                  render={({ field }) => (
                    <FormItem className="min-w-0">
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
                          {optionsSousCategories(referentiel.categories, field.value).map((groupe) => (
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

                <div className="flex items-start gap-2">
                  <FormField
                    control={form.control}
                    name={`lignes.${index}.montant`}
                    render={({ field }) => (
                      <FormItem className="min-w-0 flex-1">
                        <FormLabel>Montant</FormLabel>
                        <FormControl>
                          <ChampMontant
                            value={field.value}
                            onChange={(texte) => {
                              field.onChange(texte);
                              rafraichirErreursTableau();
                            }}
                            onBlur={field.onBlur}
                            disabled={enCours}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="mt-6 shrink-0"
                    aria-label={`Retirer la ligne ${String(n)}`}
                    disabled={enCours || fields.length <= 2}
                    onClick={() => {
                      remove(index);
                      rafraichirErreursTableau();
                    }}
                  >
                    <Trash2 />
                  </Button>
                </div>
              </div>

              <FormField
                control={form.control}
                name={`lignes.${index}.note`}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Note</FormLabel>
                    <FormControl>
                      <Input
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
                name={`lignes.${index}.tagIds`}
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
            </fieldset>
          );
        })}

        <div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={enCours || fields.length >= LIMITE_LIGNES_VENTILATION}
            onClick={() => {
              append({ ...LIGNE_VENTILATION_VIDE });
              rafraichirErreursTableau();
            }}
          >
            <Plus />
            Ajouter une ligne
          </Button>
        </div>

        {/* Compense le pb-4 du panneau de détail : sans cela le contenu défile visible sous la barre (docs/pilotage/passes/m2.md P1-e). */}
        <div data-barre-action className="bg-popover sticky -bottom-4 z-10 flex flex-col border-t pt-2 pb-4">
          {/* Dans la barre pour rester visible pendant toute la saisie (docs/pilotage/passes/m2.md P2-a). Région
              `status` (polie : le message change à chaque frappe) toujours rendue, car une région n'annonce que si elle
              existe avant son contenu ; focus au refus, car le texte « Il reste … » est déjà affiché et ne changerait pas. */}
          <p ref={zoneReste} data-zone-reste role="status" tabIndex={-1} className="text-destructive text-sm outline-none">
            {messageGlobal !== undefined && (
              <span data-reste-a-repartir className="block pb-2">
                {messageGlobal}
              </span>
            )}
          </p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onAnnuler} disabled={enCours}>
              Annuler
            </Button>
            <Button type="submit" disabled={enCours}>
              Enregistrer
            </Button>
          </div>
        </div>
      </form>
    </Form>
  );
}
