"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import type { ReactNode } from "react";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { ChampMontant } from "@/components/forms/ChampMontant";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  LIBELLES_REGIME_FISCAL,
  LIBELLES_TYPE_COMPTE,
  REGIMES_FISCAUX,
  TYPES_COMPTE,
  type TypeCompte,
} from "@/domain/referentiel";
import { useComptes } from "./use-comptes";
import {
  afficheChampsCredit,
  afficheChampsPlacement,
  afficheCompteLie,
  estBudgetaireParDefaut,
  schemaCompte,
  type EntreeCompte,
} from "./schema";

export interface FormulaireCompteProps {
  readonly valeurInitiale?: EntreeCompte;
  /** Exclu du sélecteur de compte lié : un compte ne peut pas être lié à lui-même. */
  readonly idCompteEnEdition?: string;
  readonly enCours: boolean;
  readonly onSoumettre: (entree: EntreeCompte) => void;
  readonly onAnnuler: () => void;
}

const VALEURS_PAR_DEFAUT: EntreeCompte = {
  nom: "",
  type: "CHEQUE",
  institution: null,
  soldeInitialCents: "",
  dateSoldeInitial: "",
  estBudgetaire: true,
  inclureDansPrevision: true,
  inclureDansValeurNette: true,
  perdDelaiDeGrace: true,
  archive: false,
  seuilSecuriteCents: "",
  ordre: "0",
  limiteCreditCents: "",
  tauxAnnuel: "",
  jourReleve: "",
  jourEcheance: "",
  regimeFiscal: "NON_ENREGISTRE",
  tauxRendementAnnuel: "",
  compteLieId: null,
};

const AUCUN_COMPTE_LIE = "aucun";

function champsQuiSerontEffaces(type: TypeCompte, valeurs: {
  limiteCreditCents: string;
  tauxAnnuel: string;
  jourReleve: string;
  jourEcheance: string;
  regimeFiscal: string;
  tauxRendementAnnuel: string;
  compteLieId: string | null;
}): string[] {
  const libelles: string[] = [];

  if (!afficheChampsCredit(type)) {
    if (valeurs.limiteCreditCents.trim() !== "") libelles.push("la limite de crédit");
    if (valeurs.tauxAnnuel.trim() !== "") libelles.push("le taux annuel");
    if (valeurs.jourReleve.trim() !== "") libelles.push("le jour de relevé");
    if (valeurs.jourEcheance.trim() !== "") libelles.push("le jour d'échéance");
  }
  if (!afficheChampsPlacement(type)) {
    if (valeurs.regimeFiscal !== "NON_ENREGISTRE") libelles.push("le régime fiscal");
    if (valeurs.tauxRendementAnnuel.trim() !== "") libelles.push("le taux de rendement annuel");
  }
  if (!afficheCompteLie(type)) {
    if (valeurs.compteLieId !== null) libelles.push("le compte lié");
  }

  return libelles;
}

function messageAvertissement(libelles: string[]): string {
  const liste =
    libelles.length <= 1
      ? (libelles[0] ?? "")
      : `${libelles.slice(0, -1).join(", ")} et ${libelles[libelles.length - 1]}`;
  const phrase = `${liste.charAt(0).toUpperCase()}${liste.slice(1)}`;
  const verbe = libelles.length > 1 ? "seront effacés" : "sera effacé";
  return `${phrase} ${verbe} à l'enregistrement.`;
}

export function FormulaireCompte(props: FormulaireCompteProps): ReactNode {
  const { valeurInitiale, idCompteEnEdition, enCours, onSoumettre, onAnnuler } = props;

  const form = useForm<EntreeCompte>({
    resolver: zodResolver(schemaCompte, undefined, { raw: true }),
    defaultValues: valeurInitiale ?? VALEURS_PAR_DEFAUT,
  });

  const { data: comptes } = useComptes();
  const comptesDisponibles = (comptes ?? []).filter((compte) => compte.id !== idCompteEnEdition);

  const type = useWatch({ control: form.control, name: "type" });
  // Calculé au changement de type, à partir des valeurs d'AVANT la remise à
  // zéro : c'est ce qui permet de conserver l'avertissement une fois les
  // champs masqués effacés (sinon plus rien ne le justifierait à l'écran).
  const [libellesEffaces, setLibellesEffaces] = useState<string[]>([]);

  function changerType(nouveauType: TypeCompte): void {
    const valeursActuelles = form.getValues();
    setLibellesEffaces(
      champsQuiSerontEffaces(nouveauType, {
        limiteCreditCents: valeursActuelles.limiteCreditCents,
        tauxAnnuel: valeursActuelles.tauxAnnuel,
        jourReleve: valeursActuelles.jourReleve,
        jourEcheance: valeursActuelles.jourEcheance,
        regimeFiscal: valeursActuelles.regimeFiscal,
        tauxRendementAnnuel: valeursActuelles.tauxRendementAnnuel,
        compteLieId: valeursActuelles.compteLieId,
      }),
    );

    form.setValue("type", nouveauType);
    form.setValue("estBudgetaire", estBudgetaireParDefaut(nouveauType));

    // La validation côté serveur normalise selon le type, mais seulement
    // APRÈS avoir validé chaque champ pris isolément (schema.ts). Un champ
    // masqué qui garde une valeur illisible bloquerait donc silencieusement
    // la soumission : on le remet à sa valeur neutre ici, à l'écran, dès que
    // son type ne l'affiche plus.
    if (!afficheChampsCredit(nouveauType)) {
      form.setValue("limiteCreditCents", "");
      form.setValue("tauxAnnuel", "");
      form.setValue("jourReleve", "");
      form.setValue("jourEcheance", "");
      form.setValue("perdDelaiDeGrace", true);
      form.clearErrors(["limiteCreditCents", "tauxAnnuel", "jourReleve", "jourEcheance"]);
    }
    if (!afficheChampsPlacement(nouveauType)) {
      form.setValue("regimeFiscal", "NON_ENREGISTRE");
      form.setValue("tauxRendementAnnuel", "");
      form.clearErrors(["regimeFiscal", "tauxRendementAnnuel"]);
    }
    if (!afficheCompteLie(nouveauType)) {
      form.setValue("compteLieId", null);
      form.clearErrors(["compteLieId"]);
    }
  }

  return (
    <Form {...form}>
      {/* overflow-x-hidden : le halo de clic du Switch (after:-inset-x-3) dépasse le bord droit, comme dans FormulaireRegle. */}
      <form
        className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto overflow-x-hidden pr-1"
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
                <Input {...field} placeholder="Compte chèque" disabled={enCours} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="type"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Type de compte</FormLabel>
              <Select value={field.value} onValueChange={changerType} disabled={enCours}>
                <FormControl>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {TYPES_COMPTE.map((valeurType) => (
                    <SelectItem key={valeurType} value={valeurType}>
                      {LIBELLES_TYPE_COMPTE[valeurType]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {libellesEffaces.length > 0 && (
                <p className="text-muted-foreground text-sm">{messageAvertissement(libellesEffaces)}</p>
              )}
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="institution"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Institution</FormLabel>
              <FormControl>
                <Input
                  value={field.value ?? ""}
                  onChange={(evenement) => { field.onChange(evenement.target.value === "" ? null : evenement.target.value); }}
                  onBlur={field.onBlur}
                  placeholder="Desjardins"
                  disabled={enCours}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="soldeInitialCents"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Solde initial</FormLabel>
                <FormControl>
                  <ChampMontant value={field.value} onChange={field.onChange} onBlur={field.onBlur} disabled={enCours} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="dateSoldeInitial"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Date du solde initial</FormLabel>
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
          name="seuilSecuriteCents"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Seuil de sécurité</FormLabel>
              <FormControl>
                <ChampMontant
                  value={field.value}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  placeholder="Optionnel"
                  disabled={enCours}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="ordre"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Ordre d&apos;affichage</FormLabel>
              <FormControl>
                <Input {...field} inputMode="numeric" disabled={enCours} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="estBudgetaire"
          render={({ field }) => (
            <FormItem className="flex items-center justify-between gap-4">
              <FormLabel>Compte budgétaire</FormLabel>
              <FormControl>
                <Switch checked={field.value} onCheckedChange={field.onChange} disabled={enCours} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="inclureDansPrevision"
          render={({ field }) => (
            <FormItem className="flex items-center justify-between gap-4">
              <FormLabel>Inclure dans la prévision</FormLabel>
              <FormControl>
                <Switch checked={field.value} onCheckedChange={field.onChange} disabled={enCours} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="inclureDansValeurNette"
          render={({ field }) => (
            <FormItem className="flex items-center justify-between gap-4">
              <FormLabel>Inclure dans la valeur nette</FormLabel>
              <FormControl>
                <Switch checked={field.value} onCheckedChange={field.onChange} disabled={enCours} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="archive"
          render={({ field }) => (
            <FormItem className="flex items-center justify-between gap-4">
              <FormLabel>Archivé</FormLabel>
              <FormControl>
                <Switch checked={field.value} onCheckedChange={field.onChange} disabled={enCours} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {afficheChampsCredit(type) && (
          <div className="flex flex-col gap-4 rounded-lg border p-3">
            <p className="text-sm font-medium">Carte de crédit ou marge</p>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="limiteCreditCents"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Limite de crédit</FormLabel>
                    <FormControl>
                      <ChampMontant value={field.value} onChange={field.onChange} onBlur={field.onBlur} disabled={enCours} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="tauxAnnuel"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Taux annuel (%)</FormLabel>
                    <FormControl>
                      <Input {...field} inputMode="decimal" placeholder="19,99" disabled={enCours} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="jourReleve"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Jour de relevé</FormLabel>
                    <FormControl>
                      <Input {...field} inputMode="numeric" placeholder="1–31" disabled={enCours} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="jourEcheance"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Jour d&apos;échéance</FormLabel>
                    <FormControl>
                      <Input {...field} inputMode="numeric" placeholder="1–31" disabled={enCours} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="perdDelaiDeGrace"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between gap-4">
                  <FormLabel>Perd le délai de grâce</FormLabel>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} disabled={enCours} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        )}

        {afficheChampsPlacement(type) && (
          <div className="flex flex-col gap-4 rounded-lg border p-3">
            <p className="text-sm font-medium">Placement</p>

            <FormField
              control={form.control}
              name="regimeFiscal"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Régime fiscal</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange} disabled={enCours}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {REGIMES_FISCAUX.map((regime) => (
                        <SelectItem key={regime} value={regime}>
                          {LIBELLES_REGIME_FISCAL[regime]}
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
              name="tauxRendementAnnuel"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Taux de rendement annuel (%)</FormLabel>
                  <FormControl>
                    <Input {...field} inputMode="decimal" placeholder="5,00" disabled={enCours} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        )}

        {afficheCompteLie(type) && (
          <FormField
            control={form.control}
            name="compteLieId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Compte lié</FormLabel>
                <Select
                  value={field.value ?? AUCUN_COMPTE_LIE}
                  onValueChange={(valeur) => { field.onChange(valeur === AUCUN_COMPTE_LIE ? null : valeur); }}
                  disabled={enCours}
                >
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value={AUCUN_COMPTE_LIE}>Aucun</SelectItem>
                    {comptesDisponibles.map((compte) => (
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
        )}

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
