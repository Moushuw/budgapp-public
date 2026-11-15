"use client";

// Une ligne de condition dans FormulaireRegle.tsx — docs/lot-m1.md §4.6.
// La remise à l'état neutre des champs dépendants est le point de vigilance
// numéro un (CLAUDE.md §9, journal INDEX.md §5 du 2026-09-14) : changer le
// champ remet opérateur/valeur/valeurFin à neutre, efface leurs erreurs, et
// dit ce qui a été effacé — copié de FormulaireCompte.tsx lignes 63-157.

import type { ReactNode } from "react";
import { useState } from "react";
import { Trash2 } from "lucide-react";
import type { UseFormReturn } from "react-hook-form";
import { useWatch } from "react-hook-form";
import { ChampMontant } from "@/components/forms/ChampMontant";
import { Button } from "@/components/ui/button";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  CHAMPS_CONDITION,
  LIBELLES_CHAMP_CONDITION,
  LIBELLES_OPERATEUR_CONDITION,
  LIBELLES_SENS_CONDITION,
  OPERATEURS_OFFERTS_PAR_CHAMP,
  SENS_CONDITION,
  SEPARATEUR_LISTE,
  TYPE_VALEUR_PAR_CHAMP,
  exigeValeurFin,
  operateurParDefaut,
  type ChampCondition,
  type OperateurCondition,
} from "@/domain/categorization";
import type { EntreeRegle } from "./schema";

export interface LigneConditionProps {
  readonly form: UseFormReturn<EntreeRegle>;
  readonly index: number;
  readonly comptes: readonly { readonly id: string; readonly nom: string }[];
  readonly onSupprimer: () => void;
  readonly suppressionDesactivee: boolean;
}

function cheminChamp<K extends "champ" | "operateur" | "valeur" | "valeurFin">(
  index: number,
  champ: K,
): `conditions.${number}.${K}` {
  return `conditions.${index}.${champ}`;
}

function messageAvertissement(libelles: string[]): string {
  const liste =
    libelles.length <= 1 ? (libelles[0] ?? "") : `${libelles.slice(0, -1).join(", ")} et ${libelles[libelles.length - 1]}`;
  const phrase = `${liste.charAt(0).toUpperCase()}${liste.slice(1)}`;
  const verbe = libelles.length > 1 ? "seront effacés" : "sera effacé";
  return `${phrase} ${verbe} à l'enregistrement.`;
}

function listeDepuisValeur(valeur: string): string[] {
  return valeur
    .split(SEPARATEUR_LISTE)
    .map((element) => element.trim())
    .filter((element) => element !== "");
}

export function LigneCondition(props: LigneConditionProps): ReactNode {
  const { form, index, comptes, onSupprimer, suppressionDesactivee } = props;
  const [avertissement, setAvertissement] = useState<string | null>(null);

  const champ = useWatch({ control: form.control, name: cheminChamp(index, "champ") });
  const operateur = useWatch({ control: form.control, name: cheminChamp(index, "operateur") });
  const valeur = useWatch({ control: form.control, name: cheminChamp(index, "valeur") });

  function changerChamp(nouveauChamp: ChampCondition): void {
    const valeursActuelles = form.getValues(`conditions.${index}`);
    const libelles: string[] = [];
    if (valeursActuelles.operateur !== operateurParDefaut(nouveauChamp)) {
      libelles.push("l'opérateur");
    }
    if (valeursActuelles.valeur.trim() !== "") {
      libelles.push("la valeur");
    }
    if (valeursActuelles.valeurFin.trim() !== "") {
      libelles.push("la borne haute");
    }
    setAvertissement(libelles.length > 0 ? messageAvertissement(libelles) : null);

    form.setValue(cheminChamp(index, "champ"), nouveauChamp);
    form.setValue(cheminChamp(index, "operateur"), operateurParDefaut(nouveauChamp));
    form.setValue(cheminChamp(index, "valeur"), "");
    form.setValue(cheminChamp(index, "valeurFin"), "");
    form.clearErrors([cheminChamp(index, "operateur"), cheminChamp(index, "valeur"), cheminChamp(index, "valeurFin")]);
  }

  function changerOperateur(nouvelOperateur: OperateurCondition): void {
    const valeurFinActuelle = form.getValues(cheminChamp(index, "valeurFin"));
    if (!exigeValeurFin(nouvelOperateur) && valeurFinActuelle.trim() !== "") {
      setAvertissement(messageAvertissement(["la borne haute"]));
      form.setValue(cheminChamp(index, "valeurFin"), "");
      form.clearErrors([cheminChamp(index, "valeurFin")]);
    } else {
      setAvertissement(null);
    }
    form.setValue(cheminChamp(index, "operateur"), nouvelOperateur);
  }

  const typeValeur = TYPE_VALEUR_PAR_CHAMP[champ];
  const comptesCoches = new Set(listeDepuisValeur(valeur));

  function basculerCompte(compteId: string, coche: boolean): void {
    const liste = listeDepuisValeur(valeur);
    const suivante = coche ? [...new Set([...liste, compteId])] : liste.filter((id) => id !== compteId);
    form.setValue(cheminChamp(index, "valeur"), suivante.join(SEPARATEUR_LISTE));
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3">
      <div className="flex items-start gap-2">
        <div className="grid min-w-0 flex-1 grid-cols-1 gap-2 sm:grid-cols-2">
        <FormField
          control={form.control}
          name={cheminChamp(index, "champ")}
          render={({ field }) => (
            <FormItem className="min-w-0">
              <FormLabel>Champ</FormLabel>
              <Select value={field.value} onValueChange={changerChamp}>
                <FormControl>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {CHAMPS_CONDITION.map((valeurChamp) => (
                    <SelectItem key={valeurChamp} value={valeurChamp}>
                      {LIBELLES_CHAMP_CONDITION[valeurChamp]}
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
          name={cheminChamp(index, "operateur")}
          render={({ field }) => (
            <FormItem className="min-w-0">
              <FormLabel>Opérateur</FormLabel>
              <Select value={field.value} onValueChange={changerOperateur}>
                <FormControl>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {OPERATEURS_OFFERTS_PAR_CHAMP[champ].map((valeurOperateur) => (
                    <SelectItem key={valeurOperateur} value={valeurOperateur}>
                      {LIBELLES_OPERATEUR_CONDITION[valeurOperateur]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        </div>

        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="mt-6 shrink-0"
          aria-label="Supprimer la condition"
          onClick={onSupprimer}
          disabled={suppressionDesactivee}
        >
          <Trash2 />
        </Button>
      </div>

      {avertissement !== null && <p className="text-muted-foreground text-sm">{avertissement}</p>}

      {typeValeur === "TEXTE" && (
        <FormField
          control={form.control}
          name={cheminChamp(index, "valeur")}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Valeur</FormLabel>
              <FormControl>
                <Input {...field} placeholder="Texte recherché" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      )}

      {typeValeur === "MONTANT" && (
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name={cheminChamp(index, "valeur")}
            render={({ field }) => (
              <FormItem>
                <FormLabel>{exigeValeurFin(operateur) ? "Borne basse" : "Montant"}</FormLabel>
                <FormControl>
                  <ChampMontant value={field.value} onChange={field.onChange} onBlur={field.onBlur} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          {exigeValeurFin(operateur) && (
            <FormField
              control={form.control}
              name={cheminChamp(index, "valeurFin")}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Borne haute</FormLabel>
                  <FormControl>
                    <ChampMontant value={field.value} onChange={field.onChange} onBlur={field.onBlur} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}
        </div>
      )}

      {typeValeur === "COMPTE" && operateur === "EGALE" && (
        <FormField
          control={form.control}
          name={cheminChamp(index, "valeur")}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Compte</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Choisir un compte" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {comptes.map((compte) => (
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

      {typeValeur === "COMPTE" && operateur === "DANS" && (
        <FormField
          control={form.control}
          name={cheminChamp(index, "valeur")}
          render={() => (
            <FormItem>
              <FormLabel>Comptes</FormLabel>
              <div className="flex flex-col gap-2 rounded-lg border p-2">
                {comptes.map((compte) => (
                  <div key={compte.id} className="flex items-center justify-between gap-4">
                    <span className="text-sm">{compte.nom}</span>
                    <Switch
                      checked={comptesCoches.has(compte.id)}
                      onCheckedChange={(coche) => {
                        basculerCompte(compte.id, coche);
                      }}
                    />
                  </div>
                ))}
              </div>
              <FormMessage />
            </FormItem>
          )}
        />
      )}

      {typeValeur === "SENS" && (
        <FormField
          control={form.control}
          name={cheminChamp(index, "valeur")}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Sens</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Choisir un sens" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {SENS_CONDITION.map((valeurSens) => (
                    <SelectItem key={valeurSens} value={valeurSens}>
                      {LIBELLES_SENS_CONDITION[valeurSens]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
      )}
    </div>
  );
}
