"use client";

// Les échéances d'une série : « À venir » (pages de TAILLE_PAGE_ECHEANCES_A_VENIR), puis « Passées » (pages de
// TAILLE_PAGE_OCCURRENCES) — docs/lot-m3.md §4.7. Le panneau ne tient aucune
// mutation : il reçoit des rappels de l'écran (CLAUDE.md §8).

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { formatMontant } from "@/domain/money";
import type { OccurrenceAffichee, PortionOccurrences } from "@/domain/recurrence";
import { LIBELLES_TYPE_LIAISON } from "@/domain/referentiel";
import { accorder } from "@/features/import/libelles-revue";
import { EtatOccurrence } from "./EtatOccurrence";
import { useOccurrences } from "./use-occurrences";

export interface ActionsEcheances {
  readonly onLier: (occurrenceId: string) => void;
  readonly onIgnorer: (occurrenceId: string) => void;
  readonly onRetablir: (occurrenceId: string) => void;
  readonly onDelier: (occurrenceId: string) => void;
  readonly onModifierMontant: (occurrence: OccurrenceAffichee) => void;
  readonly enCours: boolean;
}

export interface PanneauEcheancesProps {
  /** La série dont on voit les échéances ; null : fermé. */
  readonly serie: { readonly id: string; readonly libelle: string } | null;
  readonly actions: ActionsEcheances;
  readonly onFermer: () => void;
}

function BoutonsOccurrence(props: {
  readonly occurrence: OccurrenceAffichee;
  readonly actions: ActionsEcheances;
}): ReactNode {
  const { occurrence, actions } = props;
  const { enCours } = actions;
  if (occurrence.transaction !== null) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={enCours}
        onClick={() => {
          actions.onDelier(occurrence.id);
        }}
      >
        Délier
      </Button>
    );
  }
  if (occurrence.etatStocke === "IGNOREE") {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={enCours}
        onClick={() => {
          actions.onRetablir(occurrence.id);
        }}
      >
        Rétablir
      </Button>
    );
  }
  if (!occurrence.ouverte) {
    return null;
  }
  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={enCours}
        onClick={() => {
          actions.onLier(occurrence.id);
        }}
      >
        Lier à une transaction
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={enCours}
        onClick={() => {
          actions.onIgnorer(occurrence.id);
        }}
      >
        Ignorer
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={enCours}
        onClick={() => {
          actions.onModifierMontant(occurrence);
        }}
      >
        Modifier le montant
      </Button>
    </>
  );
}

const SECTIONS: Record<
  PortionOccurrences,
  {
    readonly cle: string;
    readonly titre: string;
    readonly vide: string;
    readonly afficherPlus: string;
  }
> = {
  A_VENIR: {
    cle: "a-venir",
    titre: "À venir",
    vide: "Aucune échéance à venir.",
    afficherPlus: "Afficher plus d'échéances à venir",
  },
  PASSEES: {
    cle: "passees",
    titre: "Passées",
    vide: "Aucune échéance passée.",
    afficherPlus: "Afficher plus d'échéances passées",
  },
};

function SectionEcheances(props: {
  readonly ruleId: string;
  readonly portion: PortionOccurrences;
  readonly actions: ActionsEcheances;
}): ReactNode {
  const { ruleId, portion, actions } = props;
  const requete = useOccurrences(ruleId, portion);
  const section = SECTIONS[portion];
  const occurrences = requete.data?.pages.flatMap((page) => page.occurrences) ?? [];
  const total = requete.data?.pages[0]?.total ?? occurrences.length;
  const titre = requete.data === undefined ? section.titre : `${section.titre} (${String(total)})`;

  return (
    <section data-section-echeances={section.cle} className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold">{titre}</h3>
      <CorpsSection requete={requete} occurrences={occurrences} total={total} section={section} actions={actions} />
    </section>
  );
}

function CorpsSection(props: {
  readonly requete: ReturnType<typeof useOccurrences>;
  readonly occurrences: readonly OccurrenceAffichee[];
  readonly total: number;
  readonly section: (typeof SECTIONS)[PortionOccurrences];
  readonly actions: ActionsEcheances;
}): ReactNode {
  const { requete, occurrences, total, section, actions } = props;

  if (requete.isPending) {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }
  if (requete.isError) {
    return (
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
  }
  if (occurrences.length === 0) {
    return (
      <p data-pied-echeances={section.cle} className="text-muted-foreground text-sm">
        {section.vide}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col divide-y">
        {occurrences.map((occurrence) => (
          <li
            key={occurrence.id}
            data-occurrence-id={occurrence.id}
            data-etat={occurrence.etatAffiche}
            className="flex flex-col gap-1 py-2"
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm font-medium">{occurrence.echeance}</span>
              <span className="font-montant text-sm">{formatMontant(occurrence.montantCents, "CENTS")}</span>
            </div>
            <EtatOccurrence etat={occurrence.etatAffiche} />
            {occurrence.transaction !== null && occurrence.liaison !== null && (
              <p data-provenance className="text-muted-foreground text-xs break-words">
                {occurrence.transaction.date} · {formatMontant(occurrence.transaction.montantCents, "CENTS")} ·{" "}
                {LIBELLES_TYPE_LIAISON[occurrence.liaison]}
              </p>
            )}
            <div className="flex flex-wrap gap-2 pt-1">
              <BoutonsOccurrence occurrence={occurrence} actions={actions} />
            </div>
          </li>
        ))}
      </ul>
      <p data-pied-echeances={section.cle} className="text-muted-foreground text-sm">
        {accorder(occurrences.length, "échéance affichée", "échéances affichées")} sur {total}
      </p>
      {requete.hasNextPage && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-start"
          disabled={requete.isFetchingNextPage}
          onClick={() => {
            void requete.fetchNextPage();
          }}
        >
          {section.afficherPlus}
        </Button>
      )}
    </div>
  );
}

export function PanneauEcheances(props: PanneauEcheancesProps): ReactNode {
  const { serie, actions, onFermer } = props;
  return (
    <Sheet
      open={serie !== null}
      onOpenChange={(valeur) => {
        if (!valeur) {
          onFermer();
        }
      }}
    >
      <SheetContent side="right">
        <SheetHeader className="pr-10">
          <SheetTitle>Échéances de {serie?.libelle ?? ""}</SheetTitle>
          <SheetDescription className="sr-only">
            Les prochaines échéances de la série, puis les échéances passées, de la plus récente à la plus ancienne.
          </SheetDescription>
        </SheetHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-x-hidden overflow-y-auto px-4 pb-4">
          {serie !== null && (
            <>
              <SectionEcheances ruleId={serie.id} portion="A_VENIR" actions={actions} />
              <SectionEcheances ruleId={serie.id} portion="PASSEES" actions={actions} />
            </>
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
