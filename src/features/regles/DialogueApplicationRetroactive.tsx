"use client";

// Aperçu puis écriture, dans un même Dialog — docs/lot-m1.md §4.6, sur le
// modèle des deux temps de docs/lot-m1.md §8.2. Déclinaison mobile : pas de
// table, des blocs empilés qui conviennent aux deux formats (CLAUDE.md §10).

import { AlertTriangle } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DialogueFormulaire } from "@/components/referentiel/DialogueFormulaire";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { MotifRegleInapplicable } from "@/domain/categorization";
import { formatMontant } from "@/domain/money";
import type { ChangementApercu, EtatApercu, RecapApplication, RegleListe } from "@/server/actions/rules";
import {
  libelleApercuCorrespondances,
  libelleApercuPreservees,
  libelleApercuTronque,
  lignesRecapApplication,
} from "./libelles";
import { useApercuApplication } from "./use-apercu-application";
import { useRegleMutations } from "./use-regle-mutations";

export interface DialogueApplicationRetroactiveProps {
  readonly ouvert: boolean;
  readonly onOuvertChange: (ouvert: boolean) => void;
  readonly regle: RegleListe;
  readonly onTermine: () => void;
}

type Portee = "TOUTES" | "DEPUIS";

const LIBELLES_PRESERVATION: Record<string, string> = {
  CATEGORIE_MANUELLE: "catégorie conservée (saisie manuelle)",
  BENEFICIAIRE_VERROUILLE: "catégorie conservée (bénéficiaire verrouillé)",
  VENTILEE_OU_VIREMENT: "sous-catégorie non posée (ventilée, virement ou ligne de ventilation)",
};

function libelleMotifInapplicable(motif: MotifRegleInapplicable | undefined): string {
  if (motif === "REGEX_INVALIDE") {
    return "une condition porte une expression régulière invalide";
  }
  if (motif === "AUCUNE_CONDITION") {
    return "la règle ne porte aucune condition";
  }
  if (motif === "OPERATEUR_INCOMPATIBLE") {
    return "une condition porte un opérateur incompatible avec son champ";
  }
  if (motif === "VALEUR_ILLISIBLE") {
    return "une condition porte une valeur illisible";
  }
  if (motif === "VENTILATION_ILLISIBLE") {
    return "sa ventilation est illisible ou vise une sous-catégorie supprimée";
  }
  return "elle n'est pas correctement configurée";
}

function differencesCreneaux(avant: EtatApercu, apres: EtatApercu): string[] {
  const lignes: string[] = [];
  if (avant.subcategoryId !== apres.subcategoryId) {
    lignes.push(`Sous-catégorie : ${avant.sousCategorieNom ?? "—"} → ${apres.sousCategorieNom ?? "—"}`);
  }
  if (apres.ventilation !== null && avant.ventilation === null) {
    lignes.push(
      `Ventilation : ${apres.ventilation
        .map((ligne) => `${ligne.sousCategorieNom} ${formatMontant(ligne.montantCents, "CENTS")}`)
        .join(" · ")}`,
    );
  }
  if (avant.payeeNom !== apres.payeeNom) {
    lignes.push(`Bénéficiaire : ${avant.payeeNom ?? "—"} → ${apres.payeeNom ?? "—"}`);
  }
  if (avant.note !== apres.note) {
    lignes.push(`Note : ${avant.note ?? "—"} → ${apres.note ?? "—"}`);
  }
  if (avant.tagIds.length !== apres.tagIds.length) {
    lignes.push(`Étiquettes : ${avant.tagIds.length} → ${apres.tagIds.length}`);
  }
  if (avant.aRevoir !== apres.aRevoir) {
    lignes.push(`À revoir : ${avant.aRevoir ? "Oui" : "Non"} → ${apres.aRevoir ? "Oui" : "Non"}`);
  }
  if (avant.exclureDuBudget !== apres.exclureDuBudget) {
    lignes.push(
      `Exclu du budget : ${avant.exclureDuBudget ? "Oui" : "Non"} → ${apres.exclureDuBudget ? "Oui" : "Non"}`,
    );
  }
  if (avant.exclureDesRapports !== apres.exclureDesRapports) {
    lignes.push(
      `Exclu des rapports : ${avant.exclureDesRapports ? "Oui" : "Non"} → ${apres.exclureDesRapports ? "Oui" : "Non"}`,
    );
  }
  return lignes;
}

function LigneChangement({ changement }: { readonly changement: ChangementApercu }): ReactNode {
  return (
    <div className="flex flex-col gap-1 border-b py-2 last:border-b-0">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm">{changement.description}</span>
        <span className="font-montant text-sm">{formatMontant(changement.montantCents, "CENTS")}</span>
      </div>
      <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-xs">
        <span>{changement.date}</span>
        <span>{changement.compteNom}</span>
      </div>
      <ul className="flex flex-col gap-0.5 text-sm">
        {differencesCreneaux(changement.avant, changement.apres).map((ligne) => (
          <li key={ligne}>{ligne}</li>
        ))}
      </ul>
      {(changement.preservations.length > 0 || changement.beneficiaireIntrouvable !== null) && (
        <div className="flex flex-wrap gap-1">
          {changement.preservations.map((motif) => (
            <Badge key={motif} variant="secondary">
              {LIBELLES_PRESERVATION[motif] ?? motif}
            </Badge>
          ))}
          {changement.beneficiaireIntrouvable !== null && (
            <Badge variant="destructive">bénéficiaire « {changement.beneficiaireIntrouvable} » introuvable</Badge>
          )}
        </div>
      )}
      {changement.resultat !== "MODIFIEE" && (
        <p className="text-muted-foreground text-xs italic">
          {changement.resultat === "INCHANGEE" &&
          changement.preservations.length === 0 &&
          changement.beneficiaireIntrouvable === null
            ? "Aucun effet — déjà à jour. Rien ne sera écrit sur cette ligne."
            : "Rien ne sera écrit sur cette ligne."}
        </p>
      )}
    </div>
  );
}

function Recapitulatif({ recap }: { readonly recap: RecapApplication }): ReactNode {
  return (
    <div className="flex flex-col gap-1 rounded-lg border p-3 text-sm">
      {lignesRecapApplication(recap).map((phrase) => (
        <p key={phrase}>{phrase}</p>
      ))}
    </div>
  );
}

export function DialogueApplicationRetroactive(props: DialogueApplicationRetroactiveProps): ReactNode {
  const { ouvert, onOuvertChange, regle, onTermine } = props;

  const [portee, setPortee] = useState<Portee>("TOUTES");
  const [du, setDu] = useState("");
  const [recap, setRecap] = useState<RecapApplication | null>(null);

  const duEffectif = portee === "DEPUIS" && du !== "" ? du : null;

  const { data: apercu, isLoading, error } = useApercuApplication(regle.id, { du: duEffectif, au: null });
  const { appliquer } = useRegleMutations();

  const changements = apercu?.changements ?? 0;
  const reglesInapplicables = apercu?.reglesInapplicables ?? [];
  const confirmationDesactivee = changements === 0 || reglesInapplicables.length > 0 || appliquer.isPending;

  return (
    <DialogueFormulaire
      ouvert={ouvert}
      onOuvertChange={(valeur) => {
        if (!valeur) {
          setRecap(null);
        }
        onOuvertChange(valeur);
      }}
      titre={`Appliquer « ${regle.libelle} » aux transactions existantes`}
    >
      {/*
        Seule la liste de l'aperçu est élastique ; titre, portée, totaux,
        encarts et boutons sont shrink-0. La liste garde une base auto
        (flex-auto) : le dialogue n'a qu'un max-height, donc une base 0 la
        ramenait à son plancher quelle que soit la hauteur d'écran. Avec la
        base auto, la grille de DialogueFormulaire borne la rangée au
        max-height et la liste rétrécit jusqu'à min-h-16 — à 375 × 667 avec
        « tronqué » et « inapplicable » ensemble, il ne reste qu'environ 70 px.
        Le défilement de DialogueFormulaire ne reste qu'un repli pour une
        fenêtre plus basse que ce que l'en-tête occupe.
      */}
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        {recap === null && (
          <>
            <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-end">
              <div className="flex flex-1 flex-col gap-1.5">
                <Label>Portée</Label>
                <Select
                  value={portee}
                  onValueChange={(valeur) => {
                    setPortee(valeur === "DEPUIS" ? "DEPUIS" : "TOUTES");
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="TOUTES">Toutes les transactions</SelectItem>
                    <SelectItem value="DEPUIS">Depuis le…</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {portee === "DEPUIS" && (
                <div className="flex flex-1 flex-col gap-1.5">
                  <Label>Date de début</Label>
                  <Input
                    type="date"
                    value={du}
                    onChange={(evenement) => {
                      setDu(evenement.target.value);
                    }}
                  />
                </div>
              )}
            </div>

            <div className="flex shrink-0 flex-col gap-3">
              {error && <p className="text-destructive text-sm">{error.message}</p>}

              {isLoading && <p className="text-muted-foreground text-sm">Calcul de l&apos;aperçu…</p>}

              {apercu && (
                <>
                  <div className="flex flex-col gap-1">
                    <p className="text-sm">
                      {libelleApercuCorrespondances(apercu.correspondances, apercu.changements)}
                    </p>
                    <p className="text-sm">{libelleApercuPreservees(apercu.categoriesPreservees)}</p>
                  </div>

                  {apercu.tronque && (
                    <div className="rounded-lg border border-avertissement/40 bg-avertissement/10 px-3 py-2 text-sm">
                      Le balayage s&apos;est arrêté à {apercu.limiteBalayage} transactions. Restreins la période pour
                      couvrir le reste.
                    </div>
                  )}

                  {apercu.reglesInapplicables.length > 0 && (
                    <div className="border-destructive/40 bg-destructive/10 text-destructive flex items-start gap-2 rounded-lg border px-3 py-2 text-sm">
                      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                      <span>
                        Cette règle ne peut pas être évaluée pour l&apos;instant :{" "}
                        {libelleMotifInapplicable(apercu.reglesInapplicables[0]?.motif)}.
                      </span>
                    </div>
                  )}
                </>
              )}
            </div>

            {apercu && apercu.extrait.length > 0 && (
              <div className="flex min-h-16 flex-auto flex-col divide-y overflow-y-auto overscroll-contain">
                {apercu.extrait.map((changement) => (
                  <LigneChangement key={changement.transactionId} changement={changement} />
                ))}
              </div>
            )}

            {apercu && apercu.correspondances > apercu.extrait.length && (
              <p className="text-muted-foreground shrink-0 text-sm">
                {libelleApercuTronque(apercu.extrait.length, apercu.correspondances, apercu.changements)}
              </p>
            )}

            <div className="flex shrink-0 justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  onOuvertChange(false);
                }}
              >
                Annuler
              </Button>
              <Button
                type="button"
                disabled={confirmationDesactivee}
                onClick={() => {
                  if (apercu === undefined) {
                    return;
                  }
                  appliquer.mutate(
                    {
                      ruleId: regle.id,
                      transactionIds: [...apercu.idsAEcrire],
                      idsSansEcriture: [...apercu.idsSansEcriture],
                    },
                    { onSuccess: (donnees) => { setRecap(donnees); } },
                  );
                }}
              >
                Appliquer
              </Button>
            </div>
          </>
        )}

        {recap !== null && (
          <>
            <Recapitulatif recap={recap} />
            <div className="flex justify-end pt-2">
              <Button type="button" onClick={onTermine}>
                Fermer
              </Button>
            </div>
          </>
        )}
      </div>
    </DialogueFormulaire>
  );
}
