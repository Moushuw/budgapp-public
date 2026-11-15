"use client";

// Dialogue de fusion — spec M1 tranche 3 §3.10. N'importe pas
// useBeneficiaireMutations : il reçoit un rappel, comme les formulaires.

import type { ReactNode } from "react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DialogueFormulaire } from "@/components/referentiel/DialogueFormulaire";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import type { BeneficiaireListe } from "@/server/actions/payees";
import { useCandidatsFusion } from "./use-candidats-fusion";

export interface DialogueFusionProps {
  readonly ouvert: boolean;
  readonly onOuvertChange: (ouvert: boolean) => void;
  /** Le bénéficiaire qui disparaîtra. */
  readonly source: BeneficiaireListe;
  /** La liste complète, non filtrée par la recherche de l'écran. */
  readonly tous: readonly BeneficiaireListe[];
  readonly enCours: boolean;
  readonly onFusionner: (cibleId: string) => void;
}

export function DialogueFusion(props: DialogueFusionProps): ReactNode {
  const { ouvert, onOuvertChange, source, tous, enCours, onFusionner } = props;

  const [cibleId, setCibleId] = useState<string | null>(null);

  const { data, isLoading, error } = useCandidatsFusion(ouvert ? source.id : null);

  const candidats = data?.candidats ?? [];
  const idsCandidats = new Set(candidats.map((candidat) => candidat.id));
  const autresBeneficiaires = tous
    .filter((beneficiaire) => beneficiaire.id !== source.id && !idsCandidats.has(beneficiaire.id))
    .sort((a, b) => a.nom.localeCompare(b.nom, "fr-CA"));

  // Résolu depuis les candidats fraîchement chargés autant que depuis la liste
  // en cache : un candidat proposé par similarité n'est pas forcément déjà
  // dans `tous` (staleTime de 5 minutes sur la liste), mais il l'est toujours
  // dans `candidats`, qui vient de la requête fraîche de ce dialogue.
  const cible =
    candidats.find((candidat) => candidat.id === cibleId) ??
    tous.find((beneficiaire) => beneficiaire.id === cibleId) ??
    null;
  const sourceIntrouvable = data?.source === null;
  // Suggestions en échec (extension pg_trgm absente, erreur réseau, …) : la
  // fusion reste possible dans la liste complète, mais on ne connaît pas le
  // nombre de transactions concernées — la spec §4.3 interdit de fusionner
  // sans ce chiffre, donc le bouton Fusionner reste désactivé tant que
  // `data.source` n'est pas connu.
  const recapDisponible = data?.source != null;

  return (
    <DialogueFormulaire
      ouvert={ouvert}
      onOuvertChange={onOuvertChange}
      titre={`Fusionner « ${source.nom} »`}
    >
      <div className="flex flex-col gap-4">
        {isLoading && (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        )}

        {sourceIntrouvable && <p className="text-muted-foreground text-sm">Ce bénéficiaire n&apos;existe plus.</p>}

        {/* Les suggestions par similarité sont un confort ; la fusion est la fonction.
            Un échec de useCandidatsFusion (extension pg_trgm absente, erreur réseau, …)
            ne doit donc pas faire disparaître le sélecteur de destination : on retombe
            sur la liste complète, avec un message qui dit que les suggestions manquent. */}
        {!isLoading && !sourceIntrouvable && (
          <div className="flex flex-col gap-2">
            <Select value={cibleId ?? undefined} onValueChange={setCibleId} disabled={enCours}>
              <SelectTrigger className="w-full" aria-label="Destination de la fusion">
                <SelectValue placeholder="Choisir une destination" />
              </SelectTrigger>
              <SelectContent>
                {error ? (
                  <p className="text-muted-foreground px-2 py-1.5 text-xs">
                    Les suggestions de fusion ne sont pas disponibles pour l&apos;instant. Choisis la destination
                    dans la liste complète ci-dessous.
                  </p>
                ) : candidats.length > 0 ? (
                  <SelectGroup>
                    <SelectLabel>Proposés par similarité</SelectLabel>
                    {candidats.map((candidat) => (
                      <SelectItem key={candidat.id} value={candidat.id}>
                        {candidat.nom} — proximité {Math.round(candidat.similarite * 100)} %
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ) : (
                  <p className="text-muted-foreground px-2 py-1.5 text-xs">
                    Aucun bénéficiaire proche (similarité ≥ {Math.round((data?.seuil ?? 0) * 100)} %). Choisis la
                    destination dans la liste complète.
                  </p>
                )}
                <SelectGroup>
                  <SelectLabel>Tous les bénéficiaires</SelectLabel>
                  {autresBeneficiaires.map((beneficiaire) => (
                    <SelectItem key={beneficiaire.id} value={beneficiaire.id}>
                      {beneficiaire.nom}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>

            {cibleId !== null &&
              cible &&
              (data?.source ? (
                <div className="bg-muted flex flex-col gap-1 rounded-lg p-3 text-sm">
                  <p>
                    {data.source.nbTransactions} transaction(s) de « {source.nom} » passeront à « {cible.nom} ».
                  </p>
                  <p>
                    « {source.nom} » sera supprimé, avec ses réglages (sous-catégorie par défaut,
                    auto-catégorisation, verrou). Ceux de « {cible.nom} » sont conservés.
                  </p>
                  <p>Cette action est irréversible.</p>
                </div>
              ) : (
                <p className="text-destructive text-sm">
                  Nombre de transactions concernées indisponible : la fusion reste bloquée tant que ce nombre
                  n&apos;est pas connu.
                </p>
              ))}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={() => { onOuvertChange(false); }} disabled={enCours}>
            Annuler
          </Button>
          <Button
            type="button"
            disabled={enCours || cibleId === null || sourceIntrouvable || !recapDisponible}
            onClick={() => {
              if (cibleId !== null) {
                onFusionner(cibleId);
              }
            }}
          >
            Fusionner
          </Button>
        </div>
      </div>
    </DialogueFormulaire>
  );
}
