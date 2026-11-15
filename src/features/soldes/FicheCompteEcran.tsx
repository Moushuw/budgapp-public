"use client";

// Orchestration de la fiche d'un compte — docs/lot-m3.md §5. Seul composant à appeler les hooks de lecture et
// d'écriture des soldes ; l'en-tête, le tableau, le panneau et les dialogues ne reçoivent que des données et
// des rappels (CLAUDE.md §8).

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { DialogueSuppression } from "@/components/referentiel/DialogueSuppression";
import { Skeleton } from "@/components/ui/skeleton";
import type { AncrageAffiche } from "@/domain/solde";
import { consequenceSuppressionAncrage } from "./libelles";
import { DialogueSaisirSolde } from "./DialogueSaisirSolde";
import { EnTeteSoldes } from "./EnTeteSoldes";
import { PanneauReconciliation } from "./PanneauReconciliation";
import type { ValeursFormulaireSolde } from "./schema";
import { TableauAncrages } from "./TableauAncrages";
import { useSoldeMutations } from "./use-solde-mutations";
import { useSoldes } from "./use-soldes";

export function FicheCompteEcran(props: { readonly accountId: string }): ReactNode {
  const { accountId } = props;
  const requete = useSoldes(accountId);
  const { saisir, expliquer, ajuster, supprimer } = useSoldeMutations();

  const [saisieOuverte, setSaisieOuverte] = useState(false);
  const [statementIdPanneau, setStatementIdPanneau] = useState<string | null>(null);
  const [aSupprimer, setASupprimer] = useState<AncrageAffiche | null>(null);

  const enCours = saisir.isPending || expliquer.isPending || ajuster.isPending || supprimer.isPending;
  const fiche = requete.data;

  function enregistrerSolde(valeurs: ValeursFormulaireSolde): void {
    saisir.mutate(
      { accountId, ...valeurs },
      {
        onSuccess: (donnees) => {
          setSaisieOuverte(false);
          if (donnees.ecartCents !== 0) {
            setStatementIdPanneau(donnees.statementId);
          }
        },
      },
    );
  }

  let corps: ReactNode;
  if (requete.isPending) {
    corps = (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  } else if (fiche === undefined) {
    corps = (
      <div className="border-destructive/40 bg-destructive/10 text-destructive flex flex-col items-start gap-2 rounded-lg border px-4 py-3 text-sm">
        <p>{requete.error.message}</p>
        <Link href="/parametres?onglet=comptes" className="underline underline-offset-4">
          Retour aux comptes
        </Link>
      </div>
    );
  } else {
    corps = (
      <>
        <EnTeteSoldes
          fiche={fiche}
          onSaisir={() => {
            setSaisieOuverte(true);
          }}
        />
        <TableauAncrages
          fiche={fiche}
          enCours={enCours}
          onReconciliation={(ancrage) => {
            setStatementIdPanneau(ancrage.id);
          }}
          onSupprimer={(ancrage) => {
            setASupprimer(ancrage);
          }}
        />
      </>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      {corps}

      <DialogueSaisirSolde
        ouvert={saisieOuverte}
        enCours={saisir.isPending}
        onEnregistrer={enregistrerSolde}
        onFermer={() => {
          setSaisieOuverte(false);
        }}
      />

      <PanneauReconciliation
        statementId={statementIdPanneau}
        actions={{
          onExpliquer: (statementId, explication) => {
            expliquer.mutate({ statementId, explication });
          },
          onAjuster: (statementId) => {
            ajuster.mutate({ statementId });
          },
          enCours,
        }}
        onFermer={() => {
          setStatementIdPanneau(null);
        }}
      />

      <DialogueSuppression
        ouvert={aSupprimer !== null}
        onOuvertChange={(ouvert) => {
          if (!ouvert) {
            setASupprimer(null);
          }
        }}
        titre="Supprimer le solde"
        consequence={aSupprimer === null ? null : consequenceSuppressionAncrage(aSupprimer)}
        enCours={supprimer.isPending}
        onConfirmer={() => {
          if (aSupprimer !== null) {
            supprimer.mutate(
              { statementId: aSupprimer.id },
              {
                onSuccess: () => {
                  setASupprimer(null);
                },
              },
            );
          }
        }}
      />
    </div>
  );
}
