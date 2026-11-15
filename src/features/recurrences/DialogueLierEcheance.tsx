"use client";

// Lier une transaction à une échéance ouverte de son compte — docs/lot-m3.md §4.6, depuis le détail d'une transaction.

import type { ReactNode } from "react";
import { DialogueFormulaire } from "@/components/referentiel/DialogueFormulaire";
import { formatMontant } from "@/domain/money";
import type { CandidatOccurrenceLiaison } from "@/domain/recurrence";
import { accorder } from "@/features/import/libelles-revue";
import { CorpsChoixLiaison, LARGEUR_CHOIX_LIAISON, type ColonneChoixLiaison } from "./DialogueLierTransaction";
import { useCandidatsOccurrence } from "./use-candidats-liaison";

export interface DialogueLierEcheanceProps {
  /** La transaction à lier ; null : fermé. */
  readonly transactionId: string | null;
  readonly enCours: boolean;
  readonly onLier: (occurrenceId: string, transactionId: string) => Promise<boolean>;
  readonly onFermer: () => void;
}

const COLONNES_ECHEANCE: readonly ColonneChoixLiaison<CandidatOccurrenceLiaison>[] = [
  { cle: "echeance", entete: "Échéance", rendu: (c) => c.echeance },
  { cle: "montant", entete: "Montant", rendu: (c) => formatMontant(c.montantCents, "CENTS"), montant: true },
  { cle: "serie", entete: "Série", rendu: (c) => c.libelle },
  { cle: "ecart", entete: "Écart", rendu: (c) => accorder(c.ecartJours, "jour", "jours") },
];

function CorpsLierEcheance(props: {
  readonly transactionId: string;
  readonly enCours: boolean;
  readonly onLier: (occurrenceId: string, transactionId: string) => Promise<boolean>;
  readonly onFermer: () => void;
}): ReactNode {
  const { transactionId, enCours, onLier, onFermer } = props;
  const requete = useCandidatsOccurrence(transactionId);
  return (
    <CorpsChoixLiaison
      requete={requete}
      legende="Échéance à lier"
      colonnes={COLONNES_ECHEANCE}
      ordreDit="Triées par proximité de la date de la transaction, les plus proches d'abord."
      messageVide="Aucune échéance ouverte de ce compte à 15 jours ou moins de cette transaction."
      enCours={enCours}
      onLier={(occurrenceId) => onLier(occurrenceId, transactionId)}
      onFermer={onFermer}
    />
  );
}

/** Le corps n'est monté qu'ouvert : à chaque ouverture, le choix repart de zéro et les candidats se relisent. */
export function DialogueLierEcheance(props: DialogueLierEcheanceProps): ReactNode {
  const { transactionId, enCours, onLier, onFermer } = props;
  return (
    <DialogueFormulaire
      ouvert={transactionId !== null}
      onOuvertChange={(valeur) => {
        if (!valeur) {
          onFermer();
        }
      }}
      titre="Lier à une échéance"
      className={LARGEUR_CHOIX_LIAISON}
    >
      {transactionId !== null && (
        <CorpsLierEcheance transactionId={transactionId} enCours={enCours} onLier={onLier} onFermer={onFermer} />
      )}
    </DialogueFormulaire>
  );
}
