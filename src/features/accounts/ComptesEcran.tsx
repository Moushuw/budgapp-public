"use client";

// Assemble le patron de référentiel sur les comptes — spec M1 tranche 2 §7.3.

import { Archive, ArchiveRestore, Scale } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DialogueFormulaire } from "@/components/referentiel/DialogueFormulaire";
import { DialogueSuppression } from "@/components/referentiel/DialogueSuppression";
import { EcranReferentiel, type ColonneReferentiel } from "@/components/referentiel/EcranReferentiel";
import type { DateCivile } from "@/domain/dates";
import { formatMontant } from "@/domain/money";
import { LIBELLES_TYPE_COMPTE } from "@/domain/referentiel";
import { libelleEnteteSolde } from "@/domain/solde";
import type { CompteListeAvecSolde as CompteListe } from "@/server/actions/accounts";
import { FormulaireCompte } from "./FormulaireCompte";
import { versEntreeCompte } from "./schema";
import { useCompteMutations } from "./use-compte-mutations";
import { useComptes } from "./use-comptes";

type DialogueEtat =
  | { mode: "ferme" }
  | { mode: "creation" }
  | { mode: "edition"; compte: CompteListe }
  | { mode: "suppression"; compte: CompteListe };

function colonnesComptes(soldeAu: DateCivile | null): readonly ColonneReferentiel<CompteListe>[] {
  return [
  {
    cle: "nom",
    entete: "Nom",
    principale: true,
    // Un nom long ne doit pas élargir le tableau au-delà de la page en bureau.
    retourLigne: true,
    rendu: (compte) => (
      <span className="flex items-center gap-2">
        {compte.nom}
        {compte.archive && <Badge variant="outline">Archivé</Badge>}
      </span>
    ),
  },
  {
    cle: "type",
    entete: "Type",
    rendu: (compte) => LIBELLES_TYPE_COMPTE[compte.type],
  },
  {
    cle: "institution",
    entete: "Institution",
    rendu: (compte) => compte.institution ?? "—",
  },
  {
    cle: "soldeInitialCents",
    entete: "Solde initial",
    alignement: "droite",
    rendu: (compte) => <span className="font-montant">{formatMontant(compte.soldeInitialCents, "CENTS")}</span>,
  },
  {
    cle: "soldeCalculeCents",
    entete: libelleEnteteSolde(soldeAu),
    alignement: "droite",
    // L'en-tête « Solde au 10 octobre 2026 » est long : il passe à la ligne, le montant jamais.
    retourLigne: true,
    rendu: (compte) => (
      <span className="font-montant whitespace-nowrap" data-solde-compte>
        {formatMontant(compte.soldeCalculeCents, "CENTS")}
      </span>
    ),
  },
  {
    cle: "estBudgetaire",
    entete: "Budgétaire",
    rendu: (compte) => (compte.estBudgetaire ? "Oui" : "Non"),
  },
  {
    cle: "nbTransactions",
    entete: "Transactions",
    alignement: "droite",
    rendu: (compte) => <span className="font-montant">{compte.nbTransactions}</span>,
  },
  ];
}

/**
 * Rien ne disparaît en silence (règle 6) : un compte sans transaction peut
 * quand même porter une récurrence, un ancrage de solde/réconciliation ou un
 * lot d'import, tous en cascade sur Account (prisma/schema.prisma).
 */
function consequenceSuppressionCompte(compte: CompteListe): ReactNode {
  return (
    <div className="flex flex-col gap-1">
      <p>
        Le compte « {compte.nom} » sera supprimé. Aucune transaction n&apos;y est rattachée.
      </p>
      {compte.nbRecurrences > 0 && (
        <p>{compte.nbRecurrences} récurrence(s) rattachée(s) seront supprimées.</p>
      )}
      {compte.nbReleves > 0 && <p>{compte.nbReleves} relevé(s) de solde seront supprimés.</p>}
      {compte.nbReconciliations > 0 && (
        <p>{compte.nbReconciliations} rapprochement(s) seront supprimés.</p>
      )}
      {compte.nbLotsImport > 0 && (
        <p>
          {compte.nbLotsImport} lot(s) d&apos;import seront supprimés ; les transactions déjà enregistrées, elles,
          restent.
        </p>
      )}
    </div>
  );
}

export function ComptesEcran(): ReactNode {
  const { data, isLoading, error } = useComptes();
  const { creer, modifier, archiver, supprimer } = useCompteMutations();
  const [dialogue, setDialogue] = useState<DialogueEtat>({ mode: "ferme" });

  const fermer = () => { setDialogue({ mode: "ferme" }); };

  return (
    <>
      <EcranReferentiel<CompteListe>
        titre="Comptes"
        description="Chèque, épargne, cartes de crédit, marges, prêts et placements — tous les comptes du budget et du suivi de la valeur nette."
        colonnes={colonnesComptes(data?.[0]?.soldeAu ?? null)}
        elements={data ?? []}
        cleDe={(compte) => compte.id}
        chargement={isLoading}
        erreur={error}
        libelleCreation="Nouveau compte"
        messageVide="Aucun compte pour l'instant."
        nomAccessible={(compte) => compte.nom}
        onCreer={() => { setDialogue({ mode: "creation" }); }}
        onModifier={(compte) => { setDialogue({ mode: "edition", compte }); }}
        onSupprimer={(compte) => { setDialogue({ mode: "suppression", compte }); }}
        suppressionInterdite={(compte) =>
          compte.nbTransactions > 0
            ? `${compte.nbTransactions} transaction(s) rattachée(s) : archive ce compte plutôt que de le supprimer.`
            : null
        }
        actionsSupplementaires={(compte) => (
          <>
            <Button asChild variant="ghost" size="icon-sm">
              <Link href={`/parametres/comptes/${compte.id}`} aria-label="Soldes et réconciliation">
                <Scale />
              </Link>
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={compte.archive ? "Restaurer" : "Archiver"}
              onClick={() => { archiver.mutate({ id: compte.id, archive: !compte.archive }); }}
            >
              {compte.archive ? <ArchiveRestore /> : <Archive />}
            </Button>
          </>
        )}
      />

      <DialogueFormulaire
        ouvert={dialogue.mode === "creation" || dialogue.mode === "edition"}
        onOuvertChange={(ouvert) => { if (!ouvert) fermer(); }}
        titre={dialogue.mode === "edition" ? "Modifier le compte" : "Nouveau compte"}
      >
        <FormulaireCompte
          key={dialogue.mode === "edition" ? dialogue.compte.id : "creation"}
          valeurInitiale={dialogue.mode === "edition" ? versEntreeCompte(dialogue.compte) : undefined}
          idCompteEnEdition={dialogue.mode === "edition" ? dialogue.compte.id : undefined}
          enCours={creer.isPending || modifier.isPending}
          onAnnuler={fermer}
          onSoumettre={(entree) => {
            if (dialogue.mode === "edition") {
              modifier.mutate({ ...entree, id: dialogue.compte.id }, { onSuccess: fermer });
              return;
            }
            creer.mutate(entree, { onSuccess: fermer });
          }}
        />
      </DialogueFormulaire>

      <DialogueSuppression
        ouvert={dialogue.mode === "suppression"}
        onOuvertChange={(ouvert) => { if (!ouvert) fermer(); }}
        titre="Supprimer le compte"
        enCours={supprimer.isPending}
        consequence={dialogue.mode === "suppression" ? consequenceSuppressionCompte(dialogue.compte) : null}
        onConfirmer={() => {
          if (dialogue.mode !== "suppression") {
            return;
          }
          supprimer.mutate({ id: dialogue.compte.id }, { onSuccess: fermer });
        }}
      />
    </>
  );
}
