"use client";

import { ArrowLeftRight, ChevronRight, Link, Pencil, Split, Trash2, Undo2, Unlink, Wand2 } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { DialogueSuppression } from "@/components/referentiel/DialogueSuppression";
import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import type { DetailTransaction } from "@/domain/consultation";
import { messageRefus, type ChoixSuppressionVirement } from "@/domain/edition";
import { cn } from "@/lib/utils";
import { DialogueCreerContrepartie } from "./DialogueCreerContrepartie";
import { DialogueLierEcheance } from "@/features/recurrences/DialogueLierEcheance";
import { DialogueLierVirement } from "./DialogueLierVirement";
import { DialogueSuppressionVirement } from "./DialogueSuppressionVirement";
import { EditeurVentilation } from "./EditeurVentilation";
import { FormulaireModificationTransaction } from "./FormulaireModificationTransaction";
import type { ReferentielEcriture } from "./FormulaireNouvelleTransaction";
import { MontantTransaction } from "./MontantTransaction";
import {
  LIBELLES_CHAMP_DETAIL,
  libelleDeliaison,
  libelleDeventilation,
  libelleSuppressionUnique,
  messageRefusSuppression,
  valeursDetail,
  type ChampDetail,
} from "./presentation";
import { MESSAGE_AUCUNE_MODIFICATION, type EntreeModificationTransaction, type EntreeVentilation } from "./schema";
import { useTransaction } from "./use-transaction";

export interface ActionsDetail {
  /** mutateAsync encapsulé : true si ok, false sinon (le toast vient du hook). */
  readonly modifier: (entree: EntreeModificationTransaction) => Promise<boolean>;
  /** `choix` : ce qu'il advient de l'autre côté d'un virement ; null pour une transaction ordinaire. */
  readonly supprimer: (id: string, choix: ChoixSuppressionVirement | null) => Promise<boolean>;
  readonly ventiler: (entree: EntreeVentilation) => Promise<boolean>;
  readonly deventiler: (id: string) => Promise<boolean>;
  readonly lier: (entree: { readonly id: string; readonly contrepartieId: string }) => Promise<boolean>;
  readonly delier: (id: string) => Promise<boolean>;
  readonly lierEcheance: (entree: { readonly occurrenceId: string; readonly transactionId: string }) => Promise<boolean>;
  readonly delierEcheance: (occurrenceId: string) => Promise<boolean>;
  /** Ferme le panneau puis ouvre « Créer une récurrence » pré-rempli par valeursDepuisTransaction. */
  readonly creerRecurrence: (detail: DetailTransaction) => void;
  readonly creerContrepartie: (entree: { readonly id: string; readonly accountId: string }) => Promise<boolean>;
  /** Ferme le panneau puis ouvre « Nouvelle règle ». */
  readonly creerRegle: (detail: DetailTransaction) => void;
  readonly enCours: boolean;
}

export interface PanneauDetailProps {
  /** null = fermé. « Ouvrir la contrepartie » remplace l'identifiant affiché. */
  readonly id: string | null;
  readonly onChangerId: (id: string | null) => void;
  readonly actions: ActionsDetail;
  /** Les listes du formulaire de modification, lues une fois par l'écran. */
  readonly referentiel: ReferentielEcriture;
}

function Champ(props: {
  readonly cle: ChampDetail;
  readonly valeurs: Record<ChampDetail, string>;
  readonly detail: DetailTransaction;
  readonly mono?: boolean;
  readonly extra?: ReactNode;
  /** La valeur seule : le titre de la section dit déjà de quoi il s'agit (pas de `dt`/`dd`). */
  readonly sansEtiquette?: boolean;
  /** Étiquette au-dessus de la valeur à toutes les largeurs : une phrase longue a besoin de toute la largeur. */
  readonly empile?: boolean;
}): ReactNode {
  const { cle, valeurs, detail, mono = false, extra, sansEtiquette = false, empile = false } = props;
  if (sansEtiquette) {
    return (
      <div data-champ={cle} className="min-w-0 py-1.5 text-sm break-words">
        <span data-valeur>{valeurs[cle]}</span>
        {extra}
      </div>
    );
  }
  return (
    <div
      data-champ={cle}
      className={cn("flex min-w-0 flex-col gap-0.5 py-1.5", !empile && "sm:flex-row sm:gap-4")}
    >
      <dt className="text-muted-foreground w-40 shrink-0 text-xs sm:text-sm">{LIBELLES_CHAMP_DETAIL[cle]}</dt>
      <dd className="min-w-0 flex-1 text-sm break-words">
        {cle === "montant" ? (
          <span data-valeur>
            <MontantTransaction cents={detail.montantCents} />
          </span>
        ) : (
          <span data-valeur className={cn(mono && "font-mono text-xs break-all")}>
            {valeurs[cle]}
          </span>
        )}
        {extra}
      </dd>
    </div>
  );
}

function Section(props: {
  readonly titre: string;
  readonly children: ReactNode;
  /** Rendu après la liste de définitions (un `details` n'a pas sa place dans un `dl`). */
  readonly apres?: ReactNode;
  /** Enfants dans un `div` plutôt qu'un `dl` (champs sans étiquette). */
  readonly sansListe?: boolean;
  /** Callback de ref de la `<section>`. */
  readonly refSection?: (noeud: HTMLElement | null) => void;
}): ReactNode {
  const { titre, children, apres, sansListe = false, refSection } = props;
  return (
    <section ref={refSection} className="flex flex-col gap-1">
      <h3 className="text-sm font-semibold">{titre}</h3>
      {sansListe ? <div className="divide-y">{children}</div> : <dl className="divide-y">{children}</dl>}
      {apres}
    </section>
  );
}

function CorpsDetail(props: {
  readonly detail: DetailTransaction;
  readonly actions: ActionsDetail;
  readonly onChangerId: (id: string | null) => void;
  readonly onLierEcheance: () => void;
  /** Callback de ref de la section Ventilation : ramène l'écran dessus au retour de l'éditeur. */
  readonly refSectionVentilation: (noeud: HTMLElement | null) => void;
}): ReactNode {
  const { detail, actions, onChangerId, onLierEcheance, refSectionVentilation } = props;
  const valeurs = valeursDetail(detail);
  const contrepartie = detail.contrepartie;
  const idContrepartieOuvrable = contrepartie !== null && contrepartie.date !== null ? contrepartie.transactionId : null;

  return (
    <div className="flex flex-col gap-4">
      <Section titre="Transaction">
        <Champ cle="compte" valeurs={valeurs} detail={detail} />
        <Champ cle="date" valeurs={valeurs} detail={detail} />
        <Champ cle="description" valeurs={valeurs} detail={detail} />
        <Champ cle="typeOperation" valeurs={valeurs} detail={detail} />
        <Champ cle="montant" valeurs={valeurs} detail={detail} />
      </Section>

      <Section titre="Classement">
        <Champ cle="beneficiaire" valeurs={valeurs} detail={detail} />
        <Champ cle="sousCategorie" valeurs={valeurs} detail={detail} />
        <Champ cle="note" valeurs={valeurs} detail={detail} />
        <Champ cle="etiquettes" valeurs={valeurs} detail={detail} />
      </Section>

      <Section titre="Drapeaux">
        <Champ cle="aRevoir" valeurs={valeurs} detail={detail} />
        <Champ cle="exclureDuBudget" valeurs={valeurs} detail={detail} />
        <Champ cle="exclureDesRapports" valeurs={valeurs} detail={detail} />
      </Section>

      <Section
        titre="Provenance"
        apres={
          <details key={detail.id} data-section="details-techniques" className="group min-w-0 py-1.5">
            <summary className="focus-visible:ring-ring/50 flex cursor-pointer items-center gap-1 rounded-sm text-sm outline-none focus-visible:ring-3">
              <ChevronRight className="size-4 transition-transform group-open:rotate-90" aria-hidden />
              Détails techniques
            </summary>
            <dl className="mt-1 min-w-0">
              <Champ cle="empreinte" valeurs={valeurs} detail={detail} mono />
            </dl>
          </details>
        }
      >
        <Champ cle="source" valeurs={valeurs} detail={detail} />
        <Champ cle="lotImport" valeurs={valeurs} detail={detail} />
        <Champ cle="regle" valeurs={valeurs} detail={detail} />
        <Champ cle="etat" valeurs={valeurs} detail={detail} />
        <Champ cle="externalId" valeurs={valeurs} detail={detail} />
      </Section>

      <Section titre="Récurrence">
        <Champ
          cle="recurrence"
          valeurs={valeurs}
          detail={detail}
          empile
          extra={
            detail.parentId === null ? (
              <div className="mt-1 flex flex-wrap gap-2">
                {detail.recurrence !== null ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    aria-label="Délier de l'échéance"
                    disabled={actions.enCours}
                    onClick={() => {
                      if (detail.recurrence !== null) {
                        void actions.delierEcheance(detail.recurrence.occurrenceId);
                      }
                    }}
                  >
                    Délier
                  </Button>
                ) : (
                  <>
                    <Button type="button" variant="outline" size="sm" disabled={actions.enCours} onClick={onLierEcheance}>
                      Lier à une échéance
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={actions.enCours}
                      onClick={() => {
                        actions.creerRecurrence(detail);
                      }}
                    >
                      Créer une récurrence
                    </Button>
                  </>
                )}
              </div>
            ) : null
          }
        />
      </Section>

      <Section titre="Virement" sansListe>
        <Champ
          cle="virement"
          valeurs={valeurs}
          detail={detail}
          sansEtiquette
          extra={
            idContrepartieOuvrable !== null ? (
              <div className="mt-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    onChangerId(idContrepartieOuvrable);
                  }}
                >
                  Ouvrir la contrepartie
                </Button>
              </div>
            ) : null
          }
        />
      </Section>

      <Section
        titre="Ventilation"
        sansListe
        refSection={refSectionVentilation}
        apres={
          detail.estVentilee ? (
            <ul className="flex flex-col gap-2 py-2">
              {detail.lignesVentilation.map((fille) => (
                <li
                  key={fille.id}
                  data-ligne-ventilation-id={fille.id}
                  className="flex min-w-0 items-start justify-between gap-2 text-sm"
                >
                  <span className="min-w-0 break-words">
                    {fille.sousCategorieNom === null
                      ? "Non catégorisée"
                      : fille.categorieNom === null
                        ? fille.sousCategorieNom
                        : `${fille.categorieNom} › ${fille.sousCategorieNom}`}
                    {fille.note !== null && <span className="text-muted-foreground block text-xs">{fille.note}</span>}
                    {fille.etiquettes.length > 0 && (
                      <span className="text-muted-foreground block text-xs">
                        {fille.etiquettes.map((etiquette) => etiquette.nom).join(", ")}
                      </span>
                    )}
                  </span>
                  <MontantTransaction cents={fille.montantCents} />
                </li>
              ))}
            </ul>
          ) : null
        }
      >
        <Champ cle="ventilation" valeurs={valeurs} detail={detail} sansEtiquette />
      </Section>
    </div>
  );
}

function ZoneActions(props: {
  readonly detail: DetailTransaction;
  readonly actions: ActionsDetail;
  readonly onModifier: () => void;
  readonly onVentiler: () => void;
  readonly onDeventiler: () => void;
  readonly onSupprimer: () => void;
  readonly onLier: () => void;
  readonly onCreerContrepartie: () => void;
  readonly onDelier: () => void;
}): ReactNode {
  const { detail, actions, onModifier, onVentiler, onDeventiler, onSupprimer, onLier, onCreerContrepartie, onDelier } = props;
  const { refus } = detail;
  const estCoteVirement = detail.contrepartie !== null;
  // Un côté de virement se supprime par l'une de ses deux options : refusé seulement si les deux le sont.
  const suppressionRefusee =
    refus.suppression ?? (estCoteVirement && refus.suppressionLesDeux !== null && refus.suppressionDelier !== null
      ? refus.suppressionLesDeux
      : null);

  if (refus.modification !== null) {
    return (
      <div data-section="actions" className="flex flex-col gap-2">
        <p data-raison="modification" className="text-muted-foreground text-sm">
          {messageRefus(refus.modification)}
        </p>
      </div>
    );
  }

  return (
    <div data-section="actions" className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onModifier}>
          <Pencil />
          Modifier
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            actions.creerRegle(detail);
          }}
        >
          <Wand2 />
          Créer une règle
        </Button>
        <Button type="button" variant="outline" size="sm" disabled={refus.ventilation !== null} onClick={onVentiler}>
          <Split />
          {detail.estVentilee ? "Modifier la ventilation" : "Ventiler"}
        </Button>
        {detail.estVentilee && (
          <Button type="button" variant="outline" size="sm" disabled={refus.deventilation !== null} onClick={onDeventiler}>
            <Undo2 />
            Déventiler
          </Button>
        )}
        {estCoteVirement ? (
          <Button type="button" variant="outline" size="sm" disabled={refus.delierVirement !== null} onClick={onDelier}>
            <Unlink />
            Délier
          </Button>
        ) : (
          <>
            <Button type="button" variant="outline" size="sm" disabled={refus.lierVirement !== null} onClick={onLier}>
              <Link />
              Lier en virement
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={refus.lierVirement !== null}
              onClick={onCreerContrepartie}
            >
              <ArrowLeftRight />
              Créer la contrepartie
            </Button>
          </>
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="text-destructive"
          disabled={suppressionRefusee !== null}
          onClick={onSupprimer}
        >
          <Trash2 />
          Supprimer
        </Button>
      </div>
      {!estCoteVirement && refus.lierVirement !== null && (
        <p data-raison="lier-virement" className="text-muted-foreground text-sm">
          {messageRefus(refus.lierVirement)}
        </p>
      )}
      {estCoteVirement && refus.delierVirement !== null && (
        <p data-raison="delier-virement" className="text-muted-foreground text-sm">
          {messageRefus(refus.delierVirement)}
        </p>
      )}
      {refus.ventilation !== null && (
        <p data-raison="ventilation" className="text-muted-foreground text-sm">
          {messageRefus(refus.ventilation)}
        </p>
      )}
      {detail.estVentilee && refus.deventilation !== null && (
        <p data-raison="deventilation" className="text-muted-foreground text-sm">
          {messageRefus(refus.deventilation)}
        </p>
      )}
      {suppressionRefusee !== null && (
        <p data-raison="suppression" className="text-muted-foreground text-sm">
          {messageRefusSuppression(detail, suppressionRefusee)}
        </p>
      )}
    </div>
  );
}

export function PanneauDetail(props: PanneauDetailProps): ReactNode {
  const { id, onChangerId, actions, referentiel } = props;
  const requete = useTransaction(id);
  const [mode, setMode] = useState<{ readonly id: string; readonly type: "MODIFICATION" | "VENTILATION" } | null>(null);
  const retourVentilation = useRef(false);
  const [confirmation, setConfirmation] = useState(false);
  const [confirmationDeventilation, setConfirmationDeventilation] = useState(false);
  // Les dialogues de virement ne valent que pour la transaction qui les a ouverts, comme `mode`.
  const [dialogueVirement, setDialogueVirement] = useState<{
    readonly id: string;
    readonly type: "LIER" | "CONTREPARTIE" | "DELIER" | "SUPPRESSION" | "LIER_ECHEANCE";
  } | null>(null);
  const typeDialogueVirement = id !== null && dialogueVirement?.id === id ? dialogueVirement.type : null;
  const detailCourant = requete.isSuccess ? requete.data : null;
  // Changer d'identifiant revient en lecture : le mode ne vaut que pour la transaction qui l'a ouvert.
  const modeActif = id !== null && mode?.id === id ? mode.type : null;
  const modeModification = modeActif === "MODIFICATION";
  const modeVentilation = modeActif === "VENTILATION";

  async function enregistrer(entree: EntreeModificationTransaction | null): Promise<void> {
    if (entree === null) {
      toast.info(MESSAGE_AUCUNE_MODIFICATION);
      setMode(null);
      return;
    }
    if (await actions.modifier(entree)) {
      setMode(null);
    }
  }

  async function enregistrerVentilation(entree: EntreeVentilation): Promise<void> {
    if (await actions.ventiler(entree)) {
      retourVentilation.current = true;
      setMode(null);
    }
  }

  // La zone défilante garde le défilement de l'éditeur : au retour en lecture, la section Ventilation se montre.
  function refSectionVentilation(noeud: HTMLElement | null): void {
    if (noeud !== null && retourVentilation.current) {
      retourVentilation.current = false;
      noeud.scrollIntoView({ block: "start" });
    }
  }

  async function confirmerSuppression(): Promise<void> {
    if (id !== null && (await actions.supprimer(id, null))) {
      setConfirmation(false);
      onChangerId(null);
    }
  }

  async function confirmerSuppressionVirement(choix: ChoixSuppressionVirement): Promise<void> {
    if (id !== null && (await actions.supprimer(id, choix))) {
      setDialogueVirement(null);
      onChangerId(null);
    }
  }

  async function confirmerDeliaison(): Promise<void> {
    if (id !== null && (await actions.delier(id))) {
      setDialogueVirement(null);
    }
  }

  function ouvrirDialogueVirement(type: "LIER" | "CONTREPARTIE" | "DELIER" | "SUPPRESSION" | "LIER_ECHEANCE"): void {
    if (id !== null) {
      setDialogueVirement({ id, type });
    }
  }

  function fermerDialogueVirement(): void {
    setDialogueVirement(null);
  }

  async function confirmerDeventilation(): Promise<void> {
    if (id !== null && (await actions.deventiler(id))) {
      setConfirmationDeventilation(false);
    }
  }

  return (
    <Sheet
      open={id !== null}
      onOpenChange={(valeur) => {
        if (!valeur) {
          setMode(null);
          onChangerId(null);
        }
      }}
    >
      <SheetContent side="right">
        <SheetHeader>
          <SheetTitle>Détail de la transaction</SheetTitle>
          <SheetDescription className="sr-only">Tous les champs enregistrés pour cette transaction.</SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-4 pb-4">
          {requete.isPending && (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          )}
          {requete.isError && (
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
          )}
          {requete.isSuccess && modeModification && (
            <FormulaireModificationTransaction
              key={requete.data.id}
              detail={requete.data}
              referentiel={referentiel}
              enCours={actions.enCours}
              onSoumettre={(entree) => {
                void enregistrer(entree);
              }}
              onAnnuler={() => {
                setMode(null);
              }}
            />
          )}
          {requete.isSuccess && modeVentilation && (
            <EditeurVentilation
              key={requete.data.id}
              detail={requete.data}
              referentiel={referentiel}
              enCours={actions.enCours}
              onSoumettre={(entree) => {
                void enregistrerVentilation(entree);
              }}
              onAnnuler={() => {
                setMode(null);
              }}
            />
          )}
          {requete.isSuccess && modeActif === null && (
            <div className="flex flex-col gap-4">
              <ZoneActions
                detail={requete.data}
                actions={actions}
                onModifier={() => {
                  if (id !== null) {
                    setMode({ id, type: "MODIFICATION" });
                  }
                }}
                onVentiler={() => {
                  if (id !== null) {
                    setMode({ id, type: "VENTILATION" });
                  }
                }}
                onDeventiler={() => {
                  setConfirmationDeventilation(true);
                }}
                onSupprimer={() => {
                  if (detailCourant?.contrepartie === null) {
                    setConfirmation(true);
                  } else {
                    ouvrirDialogueVirement("SUPPRESSION");
                  }
                }}
                onLier={() => {
                  ouvrirDialogueVirement("LIER");
                }}
                onCreerContrepartie={() => {
                  ouvrirDialogueVirement("CONTREPARTIE");
                }}
                onDelier={() => {
                  ouvrirDialogueVirement("DELIER");
                }}
              />
              <CorpsDetail
                detail={requete.data}
                actions={actions}
                onChangerId={onChangerId}
                onLierEcheance={() => {
                  ouvrirDialogueVirement("LIER_ECHEANCE");
                }}
                refSectionVentilation={refSectionVentilation}
              />
            </div>
          )}
        </div>

        {modeActif === null && (
          <div className="bg-popover sticky bottom-0 z-10 flex justify-end gap-2 border-t p-4">
            <SheetClose asChild>
              <Button type="button" variant="outline">
                Fermer
              </Button>
            </SheetClose>
          </div>
        )}
      </SheetContent>

      <DialogueSuppression
        ouvert={confirmation}
        onOuvertChange={setConfirmation}
        titre="Supprimer la transaction"
        consequence={requete.isSuccess ? libelleSuppressionUnique(requete.data) : null}
        enCours={actions.enCours}
        onConfirmer={() => {
          void confirmerSuppression();
        }}
      />

      <DialogueLierVirement
        ouvert={typeDialogueVirement === "LIER"}
        detail={detailCourant}
        enCours={actions.enCours}
        onLier={(contrepartieId) => (id === null ? Promise.resolve(false) : actions.lier({ id, contrepartieId }))}
        onFermer={fermerDialogueVirement}
      />

      <DialogueLierEcheance
        transactionId={typeDialogueVirement === "LIER_ECHEANCE" ? id : null}
        enCours={actions.enCours}
        onLier={(occurrenceId, transactionId) => actions.lierEcheance({ occurrenceId, transactionId })}
        onFermer={fermerDialogueVirement}
      />

      <DialogueCreerContrepartie
        ouvert={typeDialogueVirement === "CONTREPARTIE"}
        detail={detailCourant}
        comptes={referentiel.comptes}
        enCours={actions.enCours}
        onCreer={(accountId) => (id === null ? Promise.resolve(false) : actions.creerContrepartie({ id, accountId }))}
        onFermer={fermerDialogueVirement}
      />

      <DialogueSuppression
        ouvert={typeDialogueVirement === "DELIER"}
        onOuvertChange={(ouvert) => {
          if (!ouvert) {
            fermerDialogueVirement();
          }
        }}
        titre="Délier le virement"
        consequence={detailCourant === null ? null : libelleDeliaison(detailCourant)}
        libelleConfirmation="Délier"
        enCours={actions.enCours}
        onConfirmer={() => {
          void confirmerDeliaison();
        }}
      />

      <DialogueSuppressionVirement
        ouvert={typeDialogueVirement === "SUPPRESSION"}
        onOuvertChange={(ouvert) => {
          if (!ouvert) {
            fermerDialogueVirement();
          }
        }}
        detail={detailCourant}
        enCours={actions.enCours}
        onConfirmer={(choix) => {
          void confirmerSuppressionVirement(choix);
        }}
      />

      <DialogueSuppression
        ouvert={confirmationDeventilation}
        onOuvertChange={setConfirmationDeventilation}
        titre="Déventiler la transaction"
        consequence={requete.isSuccess ? libelleDeventilation(requete.data) : null}
        libelleConfirmation="Déventiler"
        enCours={actions.enCours}
        onConfirmer={() => {
          void confirmerDeventilation();
        }}
      />
    </Sheet>
  );
}
