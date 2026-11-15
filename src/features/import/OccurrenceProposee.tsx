"use client";

// L'échéance récurrente que l'analyse rapproche d'une ligne — docs/lot-m3.md §4.5. Rapprochée automatiquement : la
// phrase et « Défaire ». Sinon : les candidats avec ce qui cloche pour chacun, et « Ne pas lier ». Une liaison n'est
// écrite qu'à l'enregistrement ; rien ne s'impose avant.

import { Link2 } from "lucide-react";
import { useId, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { libelleCandidatAttendu, libellePaiementAttendu } from "@/domain/recurrence";
import { useCategories } from "@/features/categories/use-categories";
import {
  candidatOccurrenceChoisi,
  choisirOccurrence,
  messageCategorieRecurrence,
  occurrenceAutoConservee,
  type LigneRevueEditee,
} from "./etat-revue";
import { TexteAvecMontants } from "./TexteAvecMontants";

export interface OccurrenceProposeeProps {
  readonly ligne: LigneRevueEditee;
  readonly onChange: (cle: string, patch: Partial<LigneRevueEditee>) => void;
  readonly erreur: string | null;
}

export function OccurrenceProposee({ ligne, onChange, erreur }: OccurrenceProposeeProps): ReactNode {
  const { data: categories } = useCategories();
  const nom = useId();
  const nomsSousCategories = new Map(
    (categories ?? []).flatMap((categorie) => categorie.sousCategories.map((sc) => [sc.id, sc.nom] as const)),
  );
  const categorieRecurrence = messageCategorieRecurrence(ligne, nomsSousCategories);
  const cle = ligne.base.cle;
  const automatique = occurrenceAutoConservee(ligne);
  const choisie = candidatOccurrenceChoisi(ligne)?.occurrence;

  return (
    <div className="flex min-w-0 flex-col gap-1 md:col-span-full">
      {automatique && choisie !== undefined ? (
        <div data-rapprochement="auto" className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
          <Link2 className="text-muted-foreground size-4 shrink-0" aria-hidden="true" />
          <span data-paiement-attendu="" className="min-w-0 break-words">
            {libellePaiementAttendu(choisie.libelle, choisie.echeance)}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              onChange(cle, choisirOccurrence(ligne, null));
            }}
          >
            Défaire
          </Button>
        </div>
      ) : (
        <fieldset data-rapprochement="a-confirmer" className="flex min-w-0 flex-col gap-2">
          <legend className="text-sm font-medium">Rapprochement à confirmer</legend>
          {ligne.base.candidatsOccurrence.map(({ occurrence, cloche }) => (
            <div key={occurrence.id} data-candidat-occurrence={occurrence.id} className="flex min-w-0 flex-col gap-0.5">
              <label className="flex min-w-0 items-start gap-2 text-sm">
                <input
                  type="radio"
                  name={nom}
                  className="accent-primary mt-0.5 size-4 shrink-0 cursor-pointer"
                  checked={ligne.occurrenceAvec === occurrence.id}
                  onChange={() => {
                    onChange(cle, choisirOccurrence(ligne, occurrence.id));
                  }}
                />
                <span className="min-w-0 break-words">
                  <TexteAvecMontants
                    texte={libelleCandidatAttendu(occurrence.libelle, occurrence.echeance, occurrence.montantCents)}
                  />
                </span>
              </label>
              {cloche.length > 0 ? (
                <ul className="text-muted-foreground ml-6 min-w-0 list-disc text-xs break-words">
                  {cloche.map((raison) => (
                    <li key={raison} data-cloche="">
                      <TexteAvecMontants texte={raison} />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground ml-6 text-xs">Concorde sur la description, le montant et la date.</p>
              )}
            </div>
          ))}
          <label className="flex min-w-0 items-center gap-2 text-sm">
            <input
              type="radio"
              name={nom}
              className="accent-primary size-4 shrink-0 cursor-pointer"
              checked={ligne.occurrenceAvec === null}
              onChange={() => {
                onChange(cle, choisirOccurrence(ligne, null));
              }}
            />
            <span>Ne pas lier</span>
          </label>
        </fieldset>
      )}
      {categorieRecurrence !== null && (
        <p data-categorie-recurrence="" className="text-muted-foreground text-xs">
          {categorieRecurrence}
        </p>
      )}
      {erreur !== null && (
        <p data-erreur-rapprochement="" className="text-destructive text-sm">
          {erreur}
        </p>
      )}
    </div>
  );
}
