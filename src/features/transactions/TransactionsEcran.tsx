"use client";

// Orchestration de la consultation et des écritures — docs/lot-m2.md §5 et §6.
// Seul composant à appeler les hooks de lecture de la liste et du référentiel,
// et les hooks d'écriture (avec PanneauDetail pour le détail). Il ne détient
// aucune copie des filtres : l'URL fait foi, chaque changement est un
// `router.push`. Les cellules, les cartes et les lignes ne reçoivent que des
// données et des rappels (CLAUDE.md §8).

import { useRouter } from "next/navigation";
import { useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import {
  FILTRES_VIDES,
  pastillesActives,
  retirerPastille,
  type DetailTransaction,
  type FiltresTransactions,
  type Pastille,
  type TriTransactions,
  type LigneTransactionListe,
} from "@/domain/consultation";
import type { GesteMasse } from "@/domain/edition";
import type { Periode } from "@/domain/periode";
import type { RequeteTransactions } from "@/lib/query-keys";
import { useBeneficiaires } from "@/features/payees/use-beneficiaires";
import { useCategories } from "@/features/categories/use-categories";
import { useComptes } from "@/features/accounts/use-comptes";
import { useEtiquettes } from "@/features/etiquettes/use-etiquettes";
import { DialogueRecurrence } from "@/features/recurrences/DialogueRecurrence";
import { useRecurrenceMutations } from "@/features/recurrences/use-recurrence-mutations";
import { champsDepuisValeurs, valeursDepuisTransaction } from "@/features/recurrences/valeurs-formulaire";
import { useRegleMutations } from "@/features/regles/use-regle-mutations";
import { entreeRegleDepuisTransaction, type EntreeRegle } from "@/features/regles/schema";
import { AvisParametresIgnores } from "./AvisParametresIgnores";
import { BarreSelection, type GesteAvecDialogue } from "./BarreSelection";
import { CartesTransactions } from "./CartesTransactions";
import { DialogueMasse } from "./DialogueMasse";
import { DialogueNouvelleTransaction } from "./DialogueNouvelleTransaction";
import { DialogueRegleDepuisTransaction } from "./DialogueRegleDepuisTransaction";
import { DialogueSuppressionMasse } from "./DialogueSuppressionMasse";
import { EnTeteTransactions } from "./EnTeteTransactions";
import { EtatVideTransactions } from "./EtatVideTransactions";
import { hrefTransactions, type EtatUrlTransactions } from "./filtres-url";
import type { ReferentielEcriture } from "./FormulaireNouvelleTransaction";
import type { ChangementEnPlace, PatchEnPlace } from "./optimiste";
import { PanneauDetail, type ActionsDetail } from "./PanneauDetail";
import { PanneauFiltres, type ReferentielFiltres } from "./PanneauFiltres";
import { PastillesFiltres } from "./PastillesFiltres";
import { PiedListe } from "./PiedListe";
import { etatListe, libelleSelection, libellePortee, type NomsReferentiel } from "./presentation";
import {
  basculerAffichees,
  basculerLigne,
  SELECTION_VIDE,
  versSelectionTransactions,
  type EtatSelection,
} from "./selection";
import { TableauTransactions } from "./TableauTransactions";
import { useTransactionMutations } from "./use-transaction-mutations";
import { useTransactions } from "./use-transactions";

export interface TransactionsEcranProps {
  readonly etatUrl: EtatUrlTransactions;
  readonly periode: Periode;
}

type DialogueEcran =
  | { readonly type: "AUCUN" }
  | { readonly type: "NOUVELLE" }
  | { readonly type: "REGLE"; readonly entree: EntreeRegle }
  | { readonly type: "RECURRENCE"; readonly detail: DetailTransaction }
  | { readonly type: "MASSE"; readonly geste: GesteAvecDialogue }
  | { readonly type: "SUPPRESSION_MASSE" };

const AUCUN_DIALOGUE: DialogueEcran = { type: "AUCUN" };

export function TransactionsEcran(props: TransactionsEcranProps): ReactNode {
  const { etatUrl, periode } = props;
  const { filtres, tri, ignores } = etatUrl;
  const router = useRouter();

  const [idDetail, setIdDetail] = useState<string | null>(null);
  const [filtresOuverts, setFiltresOuverts] = useState(false);
  const [depliees, setDepliees] = useState<ReadonlySet<string>>(new Set());
  const [modeSelectionMobile, setModeSelectionMobile] = useState(false);
  const [etatSelection, setEtatSelection] = useState<{ readonly cle: string; readonly selection: EtatSelection }>({
    cle: "",
    selection: SELECTION_VIDE,
  });
  const [dialogue, setDialogue] = useState<DialogueEcran>(AUCUN_DIALOGUE);

  const requete: RequeteTransactions = { filtres, periode, tri };
  const liste = useTransactions(requete);
  const { data: comptes } = useComptes();
  const { data: categories } = useCategories();
  const { data: beneficiaires } = useBeneficiaires();
  const { data: etiquettes } = useEtiquettes();
  const {
    creer,
    modifier,
    modifierEnPlace,
    supprimer,
    ventiler,
    deventiler,
    modifierEnMasse,
    lier,
    delier,
    creerContrepartie,
    saisirVirement,
  } = useTransactionMutations();
  const { creer: creerRegle } = useRegleMutations();
  const { creer: creerRecurrence, lier: lierEcheance, delier: delierEcheance } = useRecurrenceMutations();

  // Un changement de filtres, de tri ou de période vide la sélection, sans effet.
  const cleSelection = JSON.stringify(requete);
  const selection = etatSelection.cle === cleSelection ? etatSelection.selection : SELECTION_VIDE;

  function changerSelection(suivante: EtatSelection): void {
    setEtatSelection({ cle: cleSelection, selection: suivante });
  }

  const referentiel = useMemo((): ReferentielFiltres & { noms: NomsReferentiel } => {
    const sousCategories = (categories ?? []).map((categorie) => ({
      titre: categorie.nom,
      options: categorie.sousCategories.map((sousCategorie) => ({ id: sousCategorie.id, libelle: sousCategorie.nom })),
    }));
    return {
      comptes: (comptes ?? []).map((compte) => ({ id: compte.id, libelle: compte.nom })),
      sousCategories,
      beneficiaires: (beneficiaires ?? []).map((beneficiaire) => ({ id: beneficiaire.id, libelle: beneficiaire.nom })),
      etiquettes: (etiquettes ?? []).map((etiquette) => ({ id: etiquette.id, libelle: etiquette.nom })),
      noms: {
        comptes: new Map((comptes ?? []).map((compte) => [compte.id, compte.nom])),
        sousCategories: new Map(
          (categories ?? []).flatMap((categorie) =>
            categorie.sousCategories.map((sousCategorie) => [sousCategorie.id, sousCategorie.nom] as const),
          ),
        ),
        beneficiaires: new Map((beneficiaires ?? []).map((beneficiaire) => [beneficiaire.id, beneficiaire.nom])),
        etiquettes: new Map((etiquettes ?? []).map((etiquette) => [etiquette.id, etiquette.nom])),
      },
    };
  }, [comptes, categories, beneficiaires, etiquettes]);

  const referentielEcriture = useMemo(
    (): ReferentielEcriture => ({
      comptes: (comptes ?? []).filter((compte) => !compte.archive).map((compte) => ({ id: compte.id, libelle: compte.nom })),
      categories: categories ?? [],
      beneficiaires: (beneficiaires ?? []).map((beneficiaire) => ({ id: beneficiaire.id, libelle: beneficiaire.nom })),
      etiquettes: (etiquettes ?? []).map((etiquette) => ({ id: etiquette.id, libelle: etiquette.nom })),
    }),
    [comptes, categories, beneficiaires, etiquettes],
  );

  function naviguer(suivants: FiltresTransactions, triSuivant: TriTransactions = tri): void {
    router.push(hrefTransactions(suivants, triSuivant));
  }

  function basculer(id: string): void {
    setDepliees((courantes) => {
      const suivantes = new Set(courantes);
      if (!suivantes.delete(id)) {
        suivantes.add(id);
      }
      return suivantes;
    });
  }

  async function chargerPlus(): Promise<void> {
    const resultat = await liste.fetchNextPage();
    if (resultat.isError) {
      toast.error(resultat.error.message);
    }
  }

  function modifierEnPlaceLigne(ligne: LigneTransactionListe, changement: ChangementEnPlace): void {
    let patch: PatchEnPlace;
    if (changement.champ === "SOUS_CATEGORIE") {
      const categorie = (categories ?? []).find((c) =>
        c.sousCategories.some((sousCategorie) => sousCategorie.id === changement.subcategoryId),
      );
      const sousCategorie = categorie?.sousCategories.find((s) => s.id === changement.subcategoryId);
      patch = {
        champ: "SOUS_CATEGORIE",
        subcategoryId: changement.subcategoryId,
        sousCategorieNom: sousCategorie?.nom ?? null,
        categorieNom: categorie?.nom ?? null,
      };
    } else {
      patch = {
        champ: "BENEFICIAIRE",
        payeeId: changement.payeeId,
        beneficiaireNom: referentiel.noms.beneficiaires.get(changement.payeeId ?? "") ?? null,
      };
    }
    modifierEnPlace.mutate({ id: ligne.id, patch });
  }

  const lignes = liste.data?.pages.flatMap((page) => page.lignes) ?? [];
  const totaux = liste.data?.pages[0]?.totaux ?? null;
  const total = totaux?.nombre ?? null;
  const filtresActifs = pastillesActives(filtres).length > 0;
  const portee = libellePortee(filtres, periode);
  const etat = etatListe({
    chargement: liste.isPending,
    erreur: liste.isError && liste.data === undefined,
    totaux,
    filtresActifs,
  });

  function fermerDialogue(): void {
    setDialogue(AUCUN_DIALOGUE);
  }

  function appliquerGeste(geste: GesteMasse): void {
    const selectionTransactions = versSelectionTransactions(selection, requete);
    if (selectionTransactions === null) {
      return;
    }
    modifierEnMasse.mutate(
      { selection: selectionTransactions, geste },
      {
        onSuccess: () => {
          changerSelection(SELECTION_VIDE);
          fermerDialogue();
        },
      },
    );
  }

  const actionsDetail: ActionsDetail = {
    modifier: async (entree) => {
      try {
        await modifier.mutateAsync(entree);
        return true;
      } catch {
        return false; // le toast d'erreur vient du hook
      }
    },
    supprimer: async (id, choix) => {
      try {
        await supprimer.mutateAsync({ id, virement: choix });
        return true;
      } catch {
        return false;
      }
    },
    lier: async (entree) => {
      try {
        await lier.mutateAsync(entree);
        return true;
      } catch {
        return false;
      }
    },
    delier: async (id) => {
      try {
        await delier.mutateAsync({ id });
        return true;
      } catch {
        return false;
      }
    },
    lierEcheance: async (entree) => {
      try {
        await lierEcheance.mutateAsync(entree);
        return true;
      } catch {
        return false;
      }
    },
    delierEcheance: async (occurrenceId) => {
      try {
        await delierEcheance.mutateAsync({ occurrenceId });
        return true;
      } catch {
        return false;
      }
    },
    creerRecurrence: (detail: DetailTransaction) => {
      setIdDetail(null);
      setDialogue({ type: "RECURRENCE", detail });
    },
    creerContrepartie: async (entree) => {
      try {
        await creerContrepartie.mutateAsync(entree);
        return true;
      } catch {
        return false;
      }
    },
    ventiler: async (entree) => {
      try {
        await ventiler.mutateAsync(entree);
        return true;
      } catch {
        return false;
      }
    },
    deventiler: async (id) => {
      try {
        await deventiler.mutateAsync({ id });
        return true;
      } catch {
        return false;
      }
    },
    creerRegle: (detail: DetailTransaction) => {
      setIdDetail(null);
      setDialogue({
        type: "REGLE",
        entree: entreeRegleDepuisTransaction({ description: detail.description, subcategoryId: detail.subcategoryId }),
      });
    },
    enCours:
      modifier.isPending ||
      supprimer.isPending ||
      ventiler.isPending ||
      deventiler.isPending ||
      lier.isPending ||
      delier.isPending ||
      lierEcheance.isPending ||
      delierEcheance.isPending ||
      creerContrepartie.isPending,
  };

  const selectionTransactions = versSelectionTransactions(selection, requete);

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <EnTeteTransactions
        totaux={totaux}
        portee={portee}
        texte={filtres.texte ?? ""}
        tri={tri}
        onRechercher={(texte) => {
          naviguer({ ...filtres, texte: texte === "" ? null : texte });
        }}
        onChangerTri={(triSuivant) => {
          naviguer(filtres, triSuivant);
        }}
        onOuvrirFiltres={() => {
          setFiltresOuverts(true);
        }}
        onNouvelleTransaction={() => {
          setDialogue({ type: "NOUVELLE" });
        }}
        modeSelectionMobile={modeSelectionMobile}
        onBasculerSelectionMobile={() => {
          if (modeSelectionMobile) {
            changerSelection(SELECTION_VIDE);
          }
          setModeSelectionMobile(!modeSelectionMobile);
        }}
      />

      <PastillesFiltres
        filtres={filtres}
        noms={referentiel.noms}
        onRetirer={(pastille: Pastille) => {
          naviguer(retirerPastille(filtres, pastille));
        }}
        onToutEffacer={() => {
          naviguer(FILTRES_VIDES);
        }}
      />

      <AvisParametresIgnores ignores={ignores} />

      {(selection.mode !== "AUCUNE" || modeSelectionMobile) && (
        <BarreSelection
          selection={selection}
          total={total}
          enCours={modifierEnMasse.isPending}
          onToutSelectionner={() => {
            changerSelection({ mode: "FILTRE" });
          }}
          onAnnuler={() => {
            changerSelection(SELECTION_VIDE);
          }}
          onOuvrirDialogue={(geste) => {
            setDialogue({ type: "MASSE", geste });
          }}
          onGesteDirect={appliquerGeste}
          onSupprimer={() => {
            setDialogue({ type: "SUPPRESSION_MASSE" });
          }}
        />
      )}

      {etat === "LISTE" ? (
        <>
          <TableauTransactions
            lignes={lignes}
            depliees={depliees}
            selection={selection}
            categories={categories ?? []}
            beneficiaires={(beneficiaires ?? []).map((b) => ({ id: b.id, nom: b.nom }))}
            onOuvrir={setIdDetail}
            onBasculer={basculer}
            onBasculerLigne={(id) => {
              changerSelection(basculerLigne(selection, id));
            }}
            onBasculerAffichees={(idsAffiches) => {
              changerSelection(basculerAffichees(selection, idsAffiches));
            }}
            onModifierEnPlace={modifierEnPlaceLigne}
          />
          <CartesTransactions
            lignes={lignes}
            depliees={depliees}
            selection={selection}
            modeSelectionMobile={modeSelectionMobile}
            onOuvrir={setIdDetail}
            onBasculer={basculer}
            onBasculerLigne={(id) => {
              changerSelection(basculerLigne(selection, id));
            }}
          />
          <PiedListe
            affichees={lignes.length}
            total={totaux?.nombre ?? lignes.length}
            hasNextPage={liste.hasNextPage}
            enChargement={liste.isFetchingNextPage}
            onChargerPlus={() => {
              void chargerPlus();
            }}
          />
        </>
      ) : (
        <EtatVideTransactions
          etat={etat}
          portee={portee}
          messageErreur={liste.isError ? liste.error.message : null}
          onToutEffacer={() => {
            naviguer(FILTRES_VIDES);
          }}
          onReessayer={() => {
            void liste.refetch();
          }}
        />
      )}

      <PanneauFiltres
        ouvert={filtresOuverts}
        filtres={filtres}
        referentiel={referentiel}
        onFermer={() => {
          setFiltresOuverts(false);
        }}
        onAppliquer={(suivants) => {
          setFiltresOuverts(false);
          naviguer(suivants);
        }}
      />

      <PanneauDetail
        id={idDetail}
        onChangerId={setIdDetail}
        actions={actionsDetail}
        referentiel={referentielEcriture}
      />

      <DialogueNouvelleTransaction
        ouvert={dialogue.type === "NOUVELLE"}
        referentiel={referentielEcriture}
        enCours={creer.isPending || saisirVirement.isPending}
        onSoumettre={(saisie) => {
          if (saisie.type === "VIREMENT") {
            saisirVirement.mutate(saisie.entree, { onSuccess: fermerDialogue });
          } else {
            creer.mutate(saisie.entree, { onSuccess: fermerDialogue });
          }
        }}
        onFermer={fermerDialogue}
      />

      <DialogueRegleDepuisTransaction
        entree={dialogue.type === "REGLE" ? dialogue.entree : null}
        enCours={creerRegle.isPending}
        onSoumettre={(entree) => {
          creerRegle.mutate(entree, { onSuccess: fermerDialogue });
        }}
        onFermer={fermerDialogue}
      />

      <DialogueRecurrence
        ouverture={
          dialogue.type === "RECURRENCE"
            ? {
                mode: "CREATION_DEPUIS_TRANSACTION",
                valeursInitiales: valeursDepuisTransaction(dialogue.detail),
                nomCompte: dialogue.detail.compteNom,
              }
            : null
        }
        comptes={referentielEcriture.comptes}
        categories={categories ?? []}
        enCours={creerRecurrence.isPending}
        onSoumettre={(valeurs) => {
          if (dialogue.type === "RECURRENCE") {
            creerRecurrence.mutate(
              {
                accountId: dialogue.detail.accountId,
                transactionId: dialogue.detail.id,
                champs: champsDepuisValeurs(valeurs),
              },
              { onSuccess: fermerDialogue },
            );
          }
        }}
        onFermer={fermerDialogue}
      />

      <DialogueMasse
        geste={dialogue.type === "MASSE" ? dialogue.geste : null}
        descriptionSelection={libelleSelection(selection, total)}
        categories={categories ?? []}
        beneficiaires={referentielEcriture.beneficiaires}
        etiquettes={referentielEcriture.etiquettes}
        enCours={modifierEnMasse.isPending}
        onAppliquer={appliquerGeste}
        onFermer={fermerDialogue}
      />

      <DialogueSuppressionMasse
        ouvert={dialogue.type === "SUPPRESSION_MASSE"}
        selection={selectionTransactions}
        enCours={modifierEnMasse.isPending}
        onFermer={fermerDialogue}
        onConfirmer={(choix) => {
          appliquerGeste({ type: "SUPPRIMER", virements: choix });
        }}
      />
    </div>
  );
}
