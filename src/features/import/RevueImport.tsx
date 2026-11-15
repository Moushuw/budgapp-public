"use client";

// Les quatre sections dans l'ordre de §8.2, la barre de compteurs, le bouton
// « Enregistrer » — docs/lot-m1.md §8.2.

import { AlertTriangle } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DialogueFormulaire } from "@/components/referentiel/DialogueFormulaire";
import type { LigneEnRevue } from "@/domain/ingestion";
import { LIMITE_OCCURRENCES_RAPPROCHEMENT } from "@/domain/recurrence";
import type { ResultatAnalyse } from "@/server/actions/import";
import {
  compter,
  designerLigne,
  entetesSections,
  erreurBeneficiaireNouveau,
  erreurVentilationRevue,
  erreursOccurrenceRevue,
  erreursVirementRevue,
  mentionFragmentsMasques,
  messageEcartTotal,
  nbReintegreesAilleurs,
  rejeteesAffichees,
  type LigneRevueEditee,
} from "./etat-revue";
import {
  messageConflitsNonTranches,
  messageOccurrencesTronquees,
  messageReglesInapplicables,
} from "./libelles-revue";
import { RecapitulatifImport } from "./RecapitulatifImport";
import { SectionDoublons } from "./SectionDoublons";
import { SectionFiltrees } from "./SectionFiltrees";
import { SectionNonReconnues } from "./SectionNonReconnues";
import { SectionRepliable } from "./SectionRepliable";
import { TableauAImporter } from "./TableauAImporter";

export interface RevueImportProps {
  readonly analyse: ResultatAnalyse;
  readonly lignes: readonly LigneRevueEditee[];
  readonly recuperees: ReadonlySet<number>;
  readonly onChange: (cle: string, patch: Partial<LigneRevueEditee>) => void;
  readonly onRecupere: (ligne: LigneEnRevue, numeroLigne: number) => void;
  readonly onEnregistrer: () => void;
  readonly enregistrementEnCours: boolean;
}

export function RevueImport(props: RevueImportProps): ReactNode {
  const { analyse, lignes, recuperees, onChange, onRecupere, onEnregistrer, enregistrementEnCours } = props;
  const [dialogueOuvert, setDialogueOuvert] = useState(false);

  const lignesAImporter = lignes.filter((ligne) => ligne.base.section === "A_IMPORTER");
  const lignesDoublons = lignes.filter((ligne) => ligne.base.section === "DOUBLONS");
  const lignesFiltrees = lignes.filter((ligne) => ligne.base.section === "FILTREES");
  const affichees = rejeteesAffichees(analyse.rejetees);
  const mentionMasques = mentionFragmentsMasques(analyse.rejetees);
  const nbRejeteesRestantes = affichees.length - recuperees.size;
  const messageEcart = messageEcartTotal(analyse.controleTotal);

  const compteurs = compter(lignes, nbRejeteesRestantes);
  const entetes = entetesSections(lignes, affichees.length, recuperees.size);
  const nbAEcrire = compteurs.aImporter + compteurs.aMettreAJour;
  const lignesBeneficiaireInvalide = lignes.filter((ligne) => erreurBeneficiaireNouveau(ligne) !== null);
  const lignesVentilationInvalide = lignes.filter((ligne) => erreurVentilationRevue(ligne) !== null);
  const erreursVirement = erreursVirementRevue(lignes);
  const lignesVirementInvalide = lignes.filter((ligne) => erreursVirement.has(ligne.base.cle));
  const erreursOccurrence = erreursOccurrenceRevue(lignes);
  const lignesOccurrenceInvalide = lignes.filter((ligne) => erreursOccurrence.has(ligne.base.cle));
  const enregistrementDesactive =
    compteurs.conflitsNonTranches > 0 ||
    erreursOccurrence.size > 0 ||
    lignesBeneficiaireInvalide.length > 0 ||
    lignesVentilationInvalide.length > 0 ||
    erreursVirement.size > 0 ||
    nbAEcrire === 0 ||
    enregistrementEnCours;

  return (
    <div className="flex flex-col gap-4">
      {messageEcart !== null && (
        <div className="border-destructive/40 bg-destructive/10 text-destructive flex items-start gap-2 rounded-lg border px-3 py-2 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>{messageEcart}</span>
        </div>
      )}
      {analyse.reglesInapplicables.length > 0 && (
        <div className="border-destructive/40 bg-destructive/10 text-destructive flex items-start gap-2 rounded-lg border px-3 py-2 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>{messageReglesInapplicables(analyse.reglesInapplicables.length)}</span>
        </div>
      )}
      {analyse.occurrencesTronquees && (
        <div className="border-destructive/40 bg-destructive/10 text-destructive flex items-start gap-2 rounded-lg border px-3 py-2 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>{messageOccurrencesTronquees(LIMITE_OCCURRENCES_RAPPROCHEMENT)}</span>
        </div>
      )}
      {analyse.filtresInapplicables.length > 0 && (
        <div className="border-destructive/40 bg-destructive/10 text-destructive flex items-start gap-2 rounded-lg border px-3 py-2 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>
            {analyse.filtresInapplicables.map((filtre) => (
              <span key={filtre.filtreId} className="block">
                Le filtre « {filtre.motif} » porte une expression régulière invalide : {filtre.detail}
              </span>
            ))}
          </span>
        </div>
      )}

      <RecapitulatifImport mode="AVANT" compteurs={compteurs} />

      <SectionRepliable titre="À importer" compte={entetes.aImporter.compte} detail={entetes.aImporter.detail}>
        <TableauAImporter
          lignes={lignesAImporter}
          onChange={onChange}
          erreursVirement={erreursVirement}
          erreursOccurrence={erreursOccurrence}
          nbReintegreesAilleurs={nbReintegreesAilleurs(lignes)}
        />
      </SectionRepliable>

      <SectionRepliable
        titre="Doublons"
        compte={entetes.doublons.compte}
        detail={entetes.doublons.detail}
        ouvertParDefaut={lignesDoublons.length > 0}
      >
        <SectionDoublons
          lignes={lignesDoublons}
          onChange={onChange}
          erreursVirement={erreursVirement}
          erreursOccurrence={erreursOccurrence}
        />
      </SectionRepliable>

      <SectionRepliable
        titre="Filtrées"
        compte={entetes.filtrees.compte}
        detail={entetes.filtrees.detail}
        ouvertParDefaut={lignesFiltrees.length > 0}
      >
        <SectionFiltrees
          lignes={lignesFiltrees}
          filtres={analyse.filtres}
          onChange={onChange}
          erreursVirement={erreursVirement}
          erreursOccurrence={erreursOccurrence}
        />
      </SectionRepliable>

      <SectionRepliable
        titre="Non reconnues"
        compte={entetes.nonReconnues.compte}
        detail={entetes.nonReconnues.detail}
        ouvertParDefaut={affichees.length > 0}
      >
        <SectionNonReconnues
          rejetees={affichees}
          recuperees={recuperees}
          accountId={analyse.accountId}
          onRecupere={onRecupere}
        />
      </SectionRepliable>
      {mentionMasques !== null && <p className="text-muted-foreground text-xs">{mentionMasques}</p>}

      <div className="flex flex-col items-end gap-1">
        {compteurs.conflitsNonTranches > 0 && (
          <p className="text-destructive text-sm">{messageConflitsNonTranches(compteurs.conflitsNonTranches)}</p>
        )}
        {lignesBeneficiaireInvalide.length > 0 && (
          <div className="text-destructive text-right text-sm">
            <p>Nom de nouveau bénéficiaire à corriger :</p>
            {lignesBeneficiaireInvalide.map((ligne) => (
              <p key={ligne.base.cle}>{designerLigne(ligne)}</p>
            ))}
          </div>
        )}
        {lignesVentilationInvalide.length > 0 && (
          <div className="text-destructive text-right text-sm">
            <p>Ventilation à corriger :</p>
            {lignesVentilationInvalide.map((ligne) => (
              <p key={ligne.base.cle}>{designerLigne(ligne)}</p>
            ))}
          </div>
        )}
        {lignesVirementInvalide.length > 0 && (
          <div className="text-destructive text-right text-sm">
            <p>Virement à corriger :</p>
            {lignesVirementInvalide.map((ligne) => (
              <p key={ligne.base.cle}>{designerLigne(ligne)}</p>
            ))}
          </div>
        )}
        {lignesOccurrenceInvalide.length > 0 && (
          <div className="text-destructive text-right text-sm">
            <p>Rapprochement à corriger :</p>
            {lignesOccurrenceInvalide.map((ligne) => (
              <p key={ligne.base.cle}>{designerLigne(ligne)}</p>
            ))}
          </div>
        )}
        <Button
          type="button"
          disabled={enregistrementDesactive}
          onClick={() => { setDialogueOuvert(true); }}
        >
          Enregistrer
        </Button>
      </div>

      <DialogueFormulaire ouvert={dialogueOuvert} onOuvertChange={setDialogueOuvert} titre="Confirmer l'enregistrement">
        <div className="flex flex-col gap-4">
          <RecapitulatifImport mode="AVANT" compteurs={compteurs} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => { setDialogueOuvert(false); }}>
              Annuler
            </Button>
            <Button
              type="button"
              disabled={enregistrementEnCours}
              onClick={() => {
                setDialogueOuvert(false);
                onEnregistrer();
              }}
            >
              Confirmer
            </Button>
          </div>
        </div>
      </DialogueFormulaire>
    </div>
  );
}
