import { ChevronDown, ChevronRight, CornerDownRight } from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import type { LigneTransactionListe } from "@/domain/consultation";
import { CaseSelection } from "./CaseSelection";
import { EtatsTransaction } from "./EtatsTransaction";
import { MontantTransaction } from "./MontantTransaction";
import { libelleSousCategorieLigne } from "./presentation";

export interface CarteTransactionProps {
  readonly ligne: LigneTransactionListe;
  readonly deplie: boolean;
  /** Mode « Sélectionner » de l'écran : une case vient en tête de la carte. */
  readonly modeSelection: boolean;
  readonly cochee: boolean;
  readonly caseDesactivee: boolean;
  readonly onOuvrir: (id: string) => void;
  readonly onBasculer: (id: string) => void;
  readonly onBasculerSelection: (id: string) => void;
}

export function CarteTransaction(props: CarteTransactionProps): ReactNode {
  const { ligne, deplie, modeSelection, cochee, caseDesactivee, onOuvrir, onBasculer, onBasculerSelection } = props;
  const Chevron = deplie ? ChevronDown : ChevronRight;
  const secondaire = [ligne.beneficiaireNom, libelleSousCategorieLigne(ligne)].filter((valeur) => valeur !== null).join(" · ");

  return (
    <div
      data-transaction-id={ligne.id}
      data-date={ligne.date}
      data-montant-cents={ligne.montantCents}
      role="group"
      aria-label={`${ligne.date} · ${ligne.description}`}
      className="bg-card min-w-0 rounded-lg border p-3"
    >
      {modeSelection && (
        <div className="mb-2">
          <CaseSelection
            aria-label={`Sélectionner : ${ligne.description}`}
            checked={cochee}
            disabled={caseDesactivee}
            onChange={() => {
              onBasculerSelection(ligne.id);
            }}
          />
        </div>
      )}
      <button
        type="button"
        aria-label={`Ouvrir le détail : ${ligne.description}`}
        className="focus-visible:ring-ring/50 flex w-full min-w-0 flex-col gap-1 text-left outline-none focus-visible:ring-3"
        onClick={() => {
          onOuvrir(ligne.id);
        }}
      >
        <span className="flex items-baseline justify-between gap-2">
          <span className="font-montant text-muted-foreground text-xs">{ligne.date}</span>
          <MontantTransaction cents={ligne.montantCents} />
        </span>
        <span className="text-sm break-words">{ligne.description}</span>
        {ligne.typeOperation !== null && (
          <span className="text-muted-foreground text-xs break-words">{ligne.typeOperation}</span>
        )}
        <span className="text-muted-foreground text-xs break-words">{secondaire}</span>
      </button>

      {ligne.etiquettes.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {ligne.etiquettes.map((etiquette) => (
            <Badge key={etiquette.id} variant="secondary">
              {etiquette.nom}
            </Badge>
          ))}
        </div>
      )}

      <div className="mt-2 flex items-start justify-between gap-2">
        <EtatsTransaction ligne={ligne} variante="pastilles" />
        {ligne.estVentilee && (
          <button
            type="button"
            aria-expanded={deplie}
            aria-label={
              deplie
                ? "Masquer les lignes de ventilation"
                : `Afficher les ${String(ligne.nbLignesVentilation)} lignes de ventilation`
            }
            className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 ml-auto shrink-0 rounded-sm p-1 outline-none focus-visible:ring-3"
            onClick={() => {
              onBasculer(ligne.id);
            }}
          >
            <Chevron className="size-4" aria-hidden />
          </button>
        )}
      </div>

      {deplie && (
        <ul className="mt-2 flex flex-col gap-2 border-t pt-2">
          {ligne.lignesVentilation.map((fille) => (
            <li
              key={fille.id}
              data-ligne-ventilation-id={fille.id}
              className="flex min-w-0 items-start justify-between gap-2 text-sm"
            >
              <span className="text-muted-foreground flex min-w-0 items-start gap-1 break-words">
                <CornerDownRight className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                <span className="min-w-0">
                  {fille.sousCategorieNom === null
                    ? "Non catégorisée"
                    : fille.categorieNom === null
                      ? fille.sousCategorieNom
                      : `${fille.categorieNom} › ${fille.sousCategorieNom}`}
                  {fille.note !== null && <span className="block text-xs">{fille.note}</span>}
                  {fille.etiquettes.length > 0 && (
                    <span className="mt-1 flex flex-wrap gap-1">
                      {fille.etiquettes.map((etiquette) => (
                        <Badge key={etiquette.id} variant="secondary">
                          {etiquette.nom}
                        </Badge>
                      ))}
                    </span>
                  )}
                </span>
              </span>
              <MontantTransaction cents={fille.montantCents} />
            </li>
          ))}
          {ligne.lignesVentilation.length < ligne.nbLignesVentilation && (
            <li className="text-muted-foreground text-xs">
              {String(ligne.lignesVentilation.length)} lignes affichées sur {String(ligne.nbLignesVentilation)}
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
