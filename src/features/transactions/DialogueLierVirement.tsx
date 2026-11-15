"use client";

// Lier une transaction existante à son autre côté — docs/lot-m2.md §4.4. Les candidats viennent du serveur (montant
// opposé exact, autre compte, ni liés ni ventilés, à 5 jours près) ; la conséquence, la sous-catégorie que la
// liaison retire, se dit avant de lier (CLAUDE.md §2, règle 6).

import { useId, useState, type ReactNode } from "react";
import { DialogueFormulaire } from "@/components/referentiel/DialogueFormulaire";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { DetailTransaction } from "@/domain/consultation";
import { formatMontant } from "@/domain/money";
import { FENETRE_VIREMENT_JOURS, type CandidatVirement } from "@/domain/virement";
import { libelleLiaison } from "./presentation";
import { useCandidatsVirement } from "./use-candidats-virement";

export interface DialogueLierVirementProps {
  readonly ouvert: boolean;
  readonly detail: DetailTransaction | null;
  readonly enCours: boolean;
  /** true si la liaison a réussi (le toast vient du hook). */
  readonly onLier: (contrepartieId: string) => Promise<boolean>;
  readonly onFermer: () => void;
}

function libelleCandidat(candidat: CandidatVirement): string {
  return `${candidat.compteNom} · ${candidat.date} · ${formatMontant(candidat.montantCents, "CENTS")} · ${candidat.description}`;
}

function CorpsLier(props: {
  readonly detail: DetailTransaction;
  readonly enCours: boolean;
  readonly onLier: (contrepartieId: string) => Promise<boolean>;
  readonly onFermer: () => void;
}): ReactNode {
  const { detail, enCours, onLier, onFermer } = props;
  const requete = useCandidatsVirement(detail.id);
  const nomGroupe = useId();
  const [choisi, setChoisi] = useState<string | null>(null);

  const candidats = requete.data ?? [];
  const premier = candidats[0];
  // Le candidat unique est pré-coché ; un choix explicite l'emporte.
  const selectionne = choisi ?? (candidats.length === 1 && premier !== undefined ? premier.id : null);
  const candidatChoisi = candidats.find((candidat) => candidat.id === selectionne);

  async function lier(): Promise<void> {
    if (selectionne !== null && (await onLier(selectionne))) {
      onFermer();
    }
  }

  let liste: ReactNode;
  if (requete.isPending) {
    liste = <Skeleton className="h-16 w-full" />;
  } else if (requete.isError) {
    liste = (
      <div className="border-destructive/40 bg-destructive/10 text-destructive flex flex-col items-start gap-2 rounded-lg border px-4 py-3 text-sm">
        <p>{requete.error.message}</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            void requete.refetch();
          }}
        >
          Réessayer
        </Button>
      </div>
    );
  } else if (candidats.length === 0) {
    liste = (
      <p className="text-muted-foreground text-sm">
        Aucune transaction d&apos;un autre compte ne correspond : montant opposé exact, à {String(FENETRE_VIREMENT_JOURS)} jours
        près, ni virement ni ventilée. Crée la contrepartie si l&apos;autre côté n&apos;existe pas encore.
      </p>
    );
  } else {
    liste = (
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">Autre côté du virement</legend>
        {candidats.map((candidat) => (
          <label key={candidat.id} className="flex items-start gap-2 text-sm">
            <input
              type="radio"
              name={nomGroupe}
              value={candidat.id}
              checked={selectionne === candidat.id}
              disabled={enCours}
              className="mt-1"
              onChange={() => {
                setChoisi(candidat.id);
              }}
            />
            <span className="min-w-0 break-words">{libelleCandidat(candidat)}</span>
          </label>
        ))}
      </fieldset>
    );
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(evenement) => {
        evenement.preventDefault();
        void lier();
      }}
    >
      {liste}
      {candidatChoisi !== undefined && (
        <div data-consequence-liaison className="flex flex-col gap-1 text-sm">
          {libelleLiaison(detail, candidatChoisi).map((phrase) => (
            <p key={phrase}>{phrase}</p>
          ))}
        </div>
      )}
      <div className="bg-popover sticky bottom-0 z-10 flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onFermer} disabled={enCours}>
          Annuler
        </Button>
        <Button type="submit" disabled={selectionne === null || enCours}>
          Lier
        </Button>
      </div>
    </form>
  );
}

/** Le corps n'est monté qu'ouvert : à chaque ouverture, le choix repart de zéro et les candidats se relisent. */
export function DialogueLierVirement(props: DialogueLierVirementProps): ReactNode {
  const { ouvert, detail, enCours, onLier, onFermer } = props;
  return (
    <DialogueFormulaire
      ouvert={ouvert && detail !== null}
      onOuvertChange={(valeur) => {
        if (!valeur) {
          onFermer();
        }
      }}
      titre="Lier en virement"
    >
      {detail !== null && <CorpsLier detail={detail} enCours={enCours} onLier={onLier} onFermer={onFermer} />}
    </DialogueFormulaire>
  );
}
