"use client";

// Saisie manuelle d'une transaction — docs/lot-m2.md §6.3. Le schéma est celui
// de l'action (schemaCreationTransaction) ; `raw: true` renvoie la chaîne
// saisie, que l'action convertit en cents (CLAUDE.md §11).

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
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { dateCivileDansFuseau, FUSEAU_APPLICATION } from "@/domain/dates";
import type { CategorieListe } from "@/server/actions/categories";
import { ListeFiltreMultiple, type OptionFiltre } from "./ListeFiltreMultiple";
import {
  AUCUN_BENEFICIAIRE,
  AUCUNE_SOUS_CATEGORIE,
  NOUVEAU_BENEFICIAIRE,
  optionsSousCategories,
} from "./presentation";
import {
  LIMITE_DESCRIPTION,
  LIMITE_NOM_BENEFICIAIRE_TRANSACTION,
  LIMITE_NOTE_TRANSACTION,
  schemaFormulaireNouvelleTransaction,
  versSaisieNouvelleTransaction,
  type SaisieNouvelleTransaction,
  type ValeursFormulaireNouvelleTransaction,
} from "./schema";

export interface ReferentielEcriture {
  readonly comptes: readonly OptionFiltre[];
  readonly categories: readonly CategorieListe[];
  readonly beneficiaires: readonly OptionFiltre[];
  readonly etiquettes: readonly OptionFiltre[];
}

export interface FormulaireNouvelleTransactionProps {
  readonly referentiel: ReferentielEcriture;
  readonly enCours: boolean;
  readonly onSoumettre: (saisie: SaisieNouvelleTransaction) => void;
  readonly onAnnuler: () => void;
}

function valeursParDefaut(): ValeursFormulaireNouvelleTransaction {
  return {
    accountId: "",
    date: dateCivileDansFuseau(new Date(), FUSEAU_APPLICATION),
    description: "",
    montant: "",
    payeeId: null,
    payeeNouveauNom: null,
    subcategoryId: null,
    note: "",
    tagIds: [],
    estVirement: false,
    accountIdDestination: null,
  };
}

export function FormulaireNouvelleTransaction(props: FormulaireNouvelleTransactionProps): ReactNode {
  const { referentiel, enCours, onSoumettre, onAnnuler } = props;
  const form = useForm<ValeursFormulaireNouvelleTransaction>({
    resolver: zodResolver(schemaFormulaireNouvelleTransaction, undefined, { raw: true }),
    defaultValues: valeursParDefaut(),
  });
  const payeeId = useWatch({ control: form.control, name: "payeeId" });
  const payeeNouveauNom = useWatch({ control: form.control, name: "payeeNouveauNom" });
  const estVirement = useWatch({ control: form.control, name: "estVirement" });
  const accountId = useWatch({ control: form.control, name: "accountId" });
  // Lu au rendu : formState est un proxy à abonnement, une propriété lue seulement dans un gestionnaire reste à false.
  const { isSubmitted } = form.formState;
  const [nomEfface, setNomEfface] = useState(false);
  // Ce que la bascule a effacé, et ce que le changement de compte a effacé : chacun se dit jusqu'au geste suivant
  // sur son maître (docs/lot-m2.md §6.3).
  const [sousCategorieEffacee, setSousCategorieEffacee] = useState(false);
  const [destinationEffaceeParBascule, setDestinationEffaceeParBascule] = useState(false);
  const [destinationEffaceeParCompte, setDestinationEffaceeParCompte] = useState(false);

  function changerVirement(vrai: boolean): void {
    if (vrai) {
      // Ce qui va être effacé se dit à l'utilisateur, et se calcule avant la remise à zéro.
      setSousCategorieEffacee(form.getValues("subcategoryId") !== null);
      setDestinationEffaceeParBascule(false);
      form.setValue("estVirement", true);
      form.setValue("subcategoryId", null);
      form.clearErrors("subcategoryId");
      return;
    }
    setDestinationEffaceeParBascule(form.getValues("accountIdDestination") !== null);
    setSousCategorieEffacee(false);
    form.setValue("estVirement", false);
    form.setValue("accountIdDestination", null);
    form.clearErrors("accountIdDestination");
    if (isSubmitted) {
      void form.trigger("montant");
    }
  }

  function changerCompte(valeur: string): void {
    form.setValue("accountId", valeur, { shouldDirty: true, shouldValidate: isSubmitted });
    const destinationEstCeCompte = form.getValues("estVirement") && form.getValues("accountIdDestination") === valeur;
    setDestinationEffaceeParCompte(destinationEstCeCompte);
    if (destinationEstCeCompte) {
      form.setValue("accountIdDestination", null, { shouldDirty: true });
      form.clearErrors("accountIdDestination");
    }
  }

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

  return (
    <Form {...form}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(evenement) => {
          void form.handleSubmit((valeurs) => {
            onSoumettre(versSaisieNouvelleTransaction(valeurs));
          })(evenement);
        }}
      >
        <FormField
          control={form.control}
          name="accountId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Compte</FormLabel>
              <Select value={field.value === "" ? undefined : field.value} onValueChange={changerCompte} disabled={enCours}>
                <FormControl>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Choisis un compte" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {referentiel.comptes.map((compte) => (
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
                <FormLabel>Montant</FormLabel>
                <FormControl>
                  <ChampMontant
                    value={field.value}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    placeholder="-25,00"
                    disabled={enCours}
                  />
                </FormControl>
                <FormDescription>Négatif pour une sortie, positif pour une entrée.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="estVirement"
          render={({ field }) => (
            <FormItem>
              <div className="flex items-center justify-between gap-4">
                <FormLabel>Virement vers un autre compte</FormLabel>
                <FormControl>
                  <Switch checked={field.value} onCheckedChange={changerVirement} disabled={enCours} />
                </FormControl>
              </div>
              <FormDescription>
                Le montant est celui du compte choisi ; le compte de destination reçoit le montant opposé.
              </FormDescription>
              {destinationEffaceeParBascule && (
                <p className="text-muted-foreground text-sm">Le compte de destination choisi a été effacé.</p>
              )}
              <FormMessage />
            </FormItem>
          )}
        />

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

        {estVirement ? (
          <FormField
            control={form.control}
            name="accountIdDestination"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Compte de destination</FormLabel>
                <Select value={field.value ?? undefined} onValueChange={field.onChange} disabled={enCours}>
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Choisis le compte de destination" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {referentiel.comptes
                      .filter((compte) => compte.id !== accountId)
                      .map((compte) => (
                        <SelectItem key={compte.id} value={compte.id}>
                          {compte.libelle}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                {destinationEffaceeParCompte && (
                  <p className="text-muted-foreground text-sm">
                    Le compte de destination a été effacé : c&apos;est le compte choisi.
                  </p>
                )}
                {sousCategorieEffacee && (
                  <p className="text-muted-foreground text-sm">
                    La sous-catégorie choisie a été retirée : un virement n&apos;en porte pas.
                  </p>
                )}
                <FormMessage />
              </FormItem>
            )}
          />
        ) : (
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
        )}

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

        {/* Compense le p-1 bas de DialogueFormulaire : sans cela le contenu défile visible sous la barre (docs/pilotage/passes/m2.md P1-e). */}
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
