"use client";

// Lier une échéance ouverte à une transaction existante — docs/lot-m3.md §4.6. Les candidats viennent du serveur
// (même compte, ni liées ni lignes de ventilation, à FENETRE_LIAISON_MANUELLE_JOURS près) ; le candidat unique est pré-coché.

import type { UseQueryResult } from "@tanstack/react-query";
import { useId, useState, type ReactNode } from "react";
import { DialogueFormulaire } from "@/components/referentiel/DialogueFormulaire";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatMontant } from "@/domain/money";
import type { CandidatTransactionLiaison } from "@/domain/recurrence";
import { accorder } from "@/features/import/libelles-revue";
import { cn } from "@/lib/utils";
import { useCandidatsTransaction } from "./use-candidats-liaison";

// Largeur des deux dialogues de liaison : à 384 px, la description n'aurait que des miettes.
export const LARGEUR_CHOIX_LIAISON = "sm:max-w-2xl";

// Radio, puis les quatre colonnes : la description prend le reste de la largeur.
const GRILLE_LIAISON = "grid-cols-[auto_auto_auto_1fr_auto]";

export interface ColonneChoixLiaison<T> {
  readonly cle: string;
  readonly entete: string;
  readonly rendu: (candidat: T) => string;
  /** true : cellule alignée à droite, police des montants (font-montant, chiffres tabulaires). */
  readonly montant?: boolean;
}

export interface CorpsChoixLiaisonProps<T extends { readonly id: string }> {
  readonly requete: UseQueryResult<readonly T[]>;
  readonly legende: string;
  readonly colonnes: readonly ColonneChoixLiaison<T>[];
  /** Phrase qui dit dans quel ordre les candidats sont rendus. */
  readonly ordreDit: string;
  readonly messageVide: string;
  readonly enCours: boolean;
  /** true si la liaison a réussi (le toast vient du hook). */
  readonly onLier: (id: string) => Promise<boolean>;
  readonly onFermer: () => void;
}

/** Radios des candidats, partagées par les deux sens de la liaison à la main. */
export function CorpsChoixLiaison<T extends { readonly id: string }>(props: CorpsChoixLiaisonProps<T>): ReactNode {
  const { requete, legende, colonnes, ordreDit, messageVide, enCours, onLier, onFermer } = props;
  const nomGroupe = useId();
  const [choisi, setChoisi] = useState<string | null>(null);

  const candidats = requete.data ?? [];
  const premier = candidats[0];
  // Le candidat unique est pré-coché ; un choix explicite l'emporte.
  const selectionne = choisi ?? (candidats.length === 1 && premier !== undefined ? premier.id : null);

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
    liste = <p className="text-muted-foreground text-sm">{messageVide}</p>;
  } else {
    liste = (
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">{legende}</legend>
        <p data-tri-liaison className="text-muted-foreground text-xs">
          {ordreDit}
        </p>
        <div className={cn("grid items-start gap-x-3 gap-y-2 text-sm", GRILLE_LIAISON)}>
          <div aria-hidden className="text-muted-foreground col-span-full grid grid-cols-subgrid gap-x-3 text-xs">
            <span />
            {colonnes.map((colonne) => (
              <span key={colonne.cle} className={cn(colonne.montant === true && "text-right")}>
                {colonne.entete}
              </span>
            ))}
          </div>
          {candidats.map((candidat) => (
            <label key={candidat.id} className="col-span-full grid grid-cols-subgrid items-start gap-x-3">
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
              {colonnes.map((colonne) => (
                <span
                  key={colonne.cle}
                  data-colonne={colonne.cle}
                  className={cn("min-w-0 break-words", colonne.montant === true && "font-montant text-right")}
                >
                  {colonne.rendu(candidat)}
                </span>
              ))}
            </label>
          ))}
        </div>
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
      <div data-barre-action className="bg-popover sticky -bottom-1 z-10 flex justify-end gap-2 pt-2 pb-1">
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

export interface DialogueLierTransactionProps {
  /** L'échéance à lier ; null : fermé. */
  readonly occurrenceId: string | null;
  readonly enCours: boolean;
  readonly onLier: (occurrenceId: string, transactionId: string) => Promise<boolean>;
  readonly onFermer: () => void;
}

const COLONNES_TRANSACTION: readonly ColonneChoixLiaison<CandidatTransactionLiaison>[] = [
  { cle: "date", entete: "Date", rendu: (c) => c.date },
  { cle: "montant", entete: "Montant", rendu: (c) => formatMontant(c.montantCents, "CENTS"), montant: true },
  { cle: "description", entete: "Description", rendu: (c) => c.description },
  { cle: "ecart", entete: "Écart", rendu: (c) => accorder(c.ecartJours, "jour", "jours") },
];

function CorpsLierTransaction(props: {
  readonly occurrenceId: string;
  readonly enCours: boolean;
  readonly onLier: (occurrenceId: string, transactionId: string) => Promise<boolean>;
  readonly onFermer: () => void;
}): ReactNode {
  const { occurrenceId, enCours, onLier, onFermer } = props;
  const requete = useCandidatsTransaction(occurrenceId);
  return (
    <CorpsChoixLiaison
      requete={requete}
      legende="Transaction à lier"
      colonnes={COLONNES_TRANSACTION}
      ordreDit="Triées par proximité de la date de l'échéance, les plus proches d'abord."
      messageVide="Aucune transaction libre de ce compte à 15 jours ou moins de l'échéance."
      enCours={enCours}
      onLier={(transactionId) => onLier(occurrenceId, transactionId)}
      onFermer={onFermer}
    />
  );
}

/** Le corps n'est monté qu'ouvert : à chaque ouverture, le choix repart de zéro et les candidats se relisent. */
export function DialogueLierTransaction(props: DialogueLierTransactionProps): ReactNode {
  const { occurrenceId, enCours, onLier, onFermer } = props;
  return (
    <DialogueFormulaire
      ouvert={occurrenceId !== null}
      onOuvertChange={(valeur) => {
        if (!valeur) {
          onFermer();
        }
      }}
      titre="Lier à une transaction"
      className={LARGEUR_CHOIX_LIAISON}
    >
      {occurrenceId !== null && (
        <CorpsLierTransaction occurrenceId={occurrenceId} enCours={enCours} onLier={onLier} onFermer={onFermer} />
      )}
    </DialogueFormulaire>
  );
}
