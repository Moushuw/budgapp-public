"use client";

// Le diagnostic d'un écart et ses issues — docs/lot-m3.md §5. Le panneau lit lui-même son diagnostic et ne tient
// aucune mutation : il reçoit des rappels de l'écran (CLAUDE.md §8).

import Link from "next/link";
import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { formatMontant } from "@/domain/money";
import { LIBELLES_SOURCE_SOLDE } from "@/domain/referentiel";
import { dateLongue, MESSAGES_REFUS_AJUSTEMENT, type AncrageAffiche } from "@/domain/solde";
import { ExplicationsEcart } from "./ExplicationsEcart";
import { FormulaireExplication } from "./FormulaireExplication";
import { libelleBoutonAjustement } from "./libelles";
import { hrefTransactionsDuJour } from "./liens";
import { StatutAncrage } from "./StatutAncrage";
import { useDiagnosticSolde } from "./use-diagnostic-solde";

export interface ActionsReconciliation {
  readonly onExpliquer: (statementId: string, explication: string) => void;
  readonly onAjuster: (statementId: string) => void;
  readonly enCours: boolean;
}

export interface PanneauReconciliationProps {
  /** L'ancrage dont on voit le diagnostic ; null : fermé. */
  readonly statementId: string | null;
  readonly actions: ActionsReconciliation;
  readonly onFermer: () => void;
}

function fmt(c: number): string {
  return formatMontant(c, "CENTS");
}

function ResumeAncrage(props: { readonly ancrage: AncrageAffiche }): ReactNode {
  const { ancrage } = props;
  const reconciliation = ancrage.reconciliation;
  return (
    <div className="flex flex-col gap-2">
      <p className="text-muted-foreground text-sm">Écart courant</p>
      <div className="flex flex-wrap items-center gap-3">
        <p data-ecart-courant className="font-montant text-3xl tabular-nums">
          {fmt(ancrage.ecartCourantCents)}
        </p>
        <StatutAncrage statut={ancrage.statut} />
      </div>
      {reconciliation !== null && (
        <div className="flex flex-col gap-1 text-sm">
          <p>Écart constaté à la saisie : {fmt(reconciliation.ecartConstateCents)}</p>
          {reconciliation.explication !== null && reconciliation.explication.trim() !== "" && (
            <p className="break-words">Explication : « {reconciliation.explication} »</p>
          )}
          {reconciliation.ajustement !== null && (
            <p>
              <Link
                href={hrefTransactionsDuJour(ancrage.accountId, reconciliation.ajustement.date)}
                className="font-montant underline-offset-4 hover:underline"
              >
                {`Ajustement de ${fmt(reconciliation.ajustement.montantCents)}`}
              </Link>
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// La zone défilante garde le défilement du bouton cliqué alors que le contenu se raccourcit (docs/lot-m3.md §5.3) :
// on la ramène sur le haut quand la donnée affichée change. null : rien à lire encore.
function useRemonterEnHaut(zone: RefObject<HTMLElement | null>, signature: string | null): void {
  useEffect(() => {
    if (signature !== null) {
      zone.current?.scrollTo({ top: 0, behavior: "instant" });
    }
  }, [zone, signature]);
}

function CorpsReconciliation(props: {
  readonly statementId: string;
  readonly actions: ActionsReconciliation;
  readonly zoneDefilante: RefObject<HTMLDivElement | null>;
}): ReactNode {
  const { statementId, actions, zoneDefilante } = props;
  const requete = useDiagnosticSolde(statementId);
  const ancrageLu = requete.data?.ancrage;
  useRemonterEnHaut(
    zoneDefilante,
    ancrageLu === undefined ? null : `${statementId}|${String(ancrageLu.ecartCourantCents)}|${ancrageLu.statut}`,
  );

  if (requete.isPending) {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }
  if (requete.isError) {
    return (
      <div className="border-destructive/40 bg-destructive/10 text-destructive flex flex-col items-start gap-2 rounded-lg border px-4 py-3 text-sm">
        <p>{requete.error.message}</p>
      </div>
    );
  }

  const { ancrage, explications } = requete.data;
  const refus = ancrage.refusAjustement;
  // Un écart nul n'a rien à expliquer ; l'explication déjà enregistrée reste affichée dans le résumé.
  const explicable = ancrage.ecartCourantCents !== 0;
  return (
    <div className="flex flex-col gap-6">
      <ResumeAncrage ancrage={ancrage} />
      <ExplicationsEcart explications={explications} accountId={ancrage.accountId} />
      <section aria-labelledby="titre-issues" className="flex flex-col gap-4">
        <h3 id="titre-issues" className="text-base font-semibold">
          Que faire de cet écart ?
        </h3>
        {explicable && (
          <FormulaireExplication
            key={statementId}
            valeurInitiale={ancrage.reconciliation?.explication ?? ""}
            enCours={actions.enCours}
            onEnregistrer={(explication) => {
              actions.onExpliquer(statementId, explication);
            }}
          />
        )}
        <div className="flex flex-col gap-1">
          <Button
            type="button"
            className="self-start"
            disabled={refus !== null || actions.enCours}
            aria-describedby={refus === null ? undefined : "refus-ajustement"}
            onClick={() => {
              actions.onAjuster(statementId);
            }}
          >
            {libelleBoutonAjustement(ancrage.ecartCourantCents, refus !== null)}
          </Button>
          {refus !== null && (
            <p id="refus-ajustement" className="text-muted-foreground text-sm">
              {MESSAGES_REFUS_AJUSTEMENT[refus]}
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

function TitrePanneau(props: { readonly statementId: string | null }): ReactNode {
  const requete = useDiagnosticSolde(props.statementId);
  if (requete.data === undefined) {
    return (
      <SheetHeader className="pr-10">
        <SheetTitle>Réconciliation du solde</SheetTitle>
        <SheetDescription className="sr-only">Le diagnostic de l&apos;écart de ce solde.</SheetDescription>
      </SheetHeader>
    );
  }
  const { ancrage } = requete.data;
  return (
    <SheetHeader className="pr-10">
      <SheetTitle>Réconciliation du solde du {dateLongue(ancrage.date)}</SheetTitle>
      <SheetDescription>
        {LIBELLES_SOURCE_SOLDE[ancrage.source]} · solde déclaré {fmt(ancrage.soldeDeclareCents)} · solde calculé{" "}
        {fmt(ancrage.soldeCalculeCents)}
      </SheetDescription>
    </SheetHeader>
  );
}

export function PanneauReconciliation(props: PanneauReconciliationProps): ReactNode {
  const { statementId, actions, onFermer } = props;
  const zoneDefilante = useRef<HTMLDivElement>(null);
  return (
    <Sheet
      open={statementId !== null}
      onOpenChange={(valeur) => {
        if (!valeur) {
          onFermer();
        }
      }}
    >
      <SheetContent side="right">
        <TitrePanneau statementId={statementId} />
        <div ref={zoneDefilante} className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-4 pb-4">
          {statementId !== null && (
            <CorpsReconciliation statementId={statementId} actions={actions} zoneDefilante={zoneDefilante} />
          )}
        </div>
        <div className="bg-popover sticky bottom-0 z-10 flex justify-end gap-2 border-t p-4">
          <SheetClose asChild>
            <Button type="button" variant="outline">
              Fermer
            </Button>
          </SheetClose>
        </div>
      </SheetContent>
    </Sheet>
  );
}
