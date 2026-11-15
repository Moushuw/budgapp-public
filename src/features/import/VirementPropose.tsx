"use client";

// Le virement que l'analyse propose pour une ligne — docs/lot-m2.md §4.5. Un seul candidat : une case, cochée par
// défaut (la proposition se confirme ou se décoche, elle ne s'impose pas). Plusieurs : un choix explicite, jamais
// pré-rempli. Ce que le choix retire de la ligne et de l'autre côté se dit ici, avant l'enregistrement.

import type { ReactNode } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatMontant } from "@/domain/money";
import type { CandidatVirement } from "@/domain/virement";
import { useCategories } from "@/features/categories/use-categories";
import { choisirVirement, messageAutreCote, messageRetraitVirement, type LigneRevueEditee } from "./etat-revue";

export interface VirementProposeProps {
  readonly ligne: LigneRevueEditee;
  readonly onChange: (cle: string, patch: Partial<LigneRevueEditee>) => void;
  readonly erreur: string | null;
}

const AUCUN_VIREMENT = "__aucun__";

function resume(candidat: CandidatVirement): string {
  return `${candidat.compteNom} · ${candidat.date} · ${formatMontant(candidat.montantCents, "CENTS")}`;
}

export function VirementPropose({ ligne, onChange, erreur }: VirementProposeProps): ReactNode {
  const { data: categories } = useCategories();
  const candidats = ligne.base.candidatsVirement;
  const unique = candidats.length === 1 ? candidats[0] : undefined;
  const nomsSousCategories = new Map(
    (categories ?? []).flatMap((categorie) => categorie.sousCategories.map((sc) => [sc.id, sc.nom] as const)),
  );
  const retrait = messageRetraitVirement(ligne, nomsSousCategories);
  const autreCote = messageAutreCote(ligne);

  return (
    <div className="flex min-w-0 flex-col gap-1 md:col-span-full">
      {unique !== undefined ? (
        <div data-virement-propose="" className="flex flex-col gap-0.5">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="accent-primary size-4 cursor-pointer"
              checked={ligne.virementAvec === unique.id}
              onChange={(evenement) => {
                onChange(ligne.base.cle, choisirVirement(ligne, evenement.target.checked ? unique.id : null));
              }}
            />
            <span>{`Virement avec ${resume(unique)}`}</span>
          </label>
          <span className="text-muted-foreground text-xs">{unique.description}</span>
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          <span className="text-sm">{`${String(candidats.length)} virements possibles`}</span>
          <Select
            value={ligne.virementAvec ?? AUCUN_VIREMENT}
            onValueChange={(valeur) => {
              onChange(ligne.base.cle, choisirVirement(ligne, valeur === AUCUN_VIREMENT ? null : valeur));
            }}
          >
            <SelectTrigger className="w-full" aria-label="Virement">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={AUCUN_VIREMENT}>Aucun : pas un virement</SelectItem>
              {candidats.map((candidat) => (
                <SelectItem key={candidat.id} value={candidat.id}>
                  {`${resume(candidat)} · ${candidat.description}`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      {retrait !== null && (
        <p data-retrait-virement="" className="text-muted-foreground text-xs">
          {retrait}
        </p>
      )}
      {autreCote !== null && (
        <p data-autre-cote-virement="" className="text-muted-foreground text-xs">
          {autreCote}
        </p>
      )}
      {erreur !== null && (
        <p data-erreur-virement="" className="text-destructive text-sm">
          {erreur}
        </p>
      )}
    </div>
  );
}
