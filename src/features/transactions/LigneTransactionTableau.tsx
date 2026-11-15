import { ChevronDown, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TableCell, TableRow } from "@/components/ui/table";
import type { LigneTransactionListe } from "@/domain/consultation";
import type { CategorieListe } from "@/server/actions/categories";
import { CaseSelection } from "./CaseSelection";
import { EtatsTransaction } from "./EtatsTransaction";
import { MontantTransaction } from "./MontantTransaction";
import type { ChangementEnPlace } from "./optimiste";
import {
  AUCUN_BENEFICIAIRE,
  AUCUNE_SOUS_CATEGORIE,
  libelleSousCategorieLigne,
  optionsSousCategories,
  sousCategorieModifiableEnPlace,
} from "./presentation";

export interface BeneficiaireOption {
  readonly id: string;
  readonly nom: string;
}

export interface LigneTransactionTableauProps {
  readonly ligne: LigneTransactionListe;
  readonly deplie: boolean;
  readonly cochee: boolean;
  /** Mode « tout le résultat » : les cases sont cochées et désactivées. */
  readonly caseDesactivee: boolean;
  readonly categories: readonly CategorieListe[];
  readonly beneficiaires: readonly BeneficiaireOption[];
  readonly onOuvrir: (id: string) => void;
  readonly onBasculer: (id: string) => void;
  readonly onBasculerSelection: (id: string) => void;
  readonly onModifierEnPlace: (ligne: LigneTransactionListe, changement: ChangementEnPlace) => void;
}

const CLASSE_DECLENCHEUR = "w-full min-w-0 max-w-48";

/** Aucun hook ici : la ligne ne reçoit que des données et des rappels (CLAUDE.md §8). */
export function LigneTransactionTableau(props: LigneTransactionTableauProps): ReactNode {
  const {
    ligne,
    deplie,
    cochee,
    caseDesactivee,
    categories,
    beneficiaires,
    onOuvrir,
    onBasculer,
    onBasculerSelection,
    onModifierEnPlace,
  } = props;
  const Chevron = deplie ? ChevronDown : ChevronRight;
  const sousCategorieModifiable = sousCategorieModifiableEnPlace(ligne);

  return (
    <TableRow data-transaction-id={ligne.id} data-date={ligne.date} data-montant-cents={ligne.montantCents}>
      <TableCell>
        <CaseSelection
          aria-label={`Sélectionner : ${ligne.description}`}
          checked={cochee}
          disabled={caseDesactivee}
          onChange={() => {
            onBasculerSelection(ligne.id);
          }}
        />
      </TableCell>
      <TableCell className="font-montant">{ligne.date}</TableCell>
      <TableCell>{ligne.compteNom}</TableCell>
      <TableCell className="whitespace-normal wrap-anywhere">
        <div className="flex items-start gap-1">
          {ligne.estVentilee && (
            <button
              type="button"
              aria-expanded={deplie}
              aria-label={
                deplie
                  ? "Masquer les lignes de ventilation"
                  : `Afficher les ${String(ligne.nbLignesVentilation)} lignes de ventilation`
              }
              className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 -ml-1 rounded-sm p-0.5 outline-none focus-visible:ring-3"
              onClick={() => {
                onBasculer(ligne.id);
              }}
            >
              <Chevron className="size-4" aria-hidden />
            </button>
          )}
          <div className="min-w-0">
            <button
              type="button"
              aria-label={`Ouvrir le détail : ${ligne.description}`}
              className="focus-visible:ring-ring/50 text-left underline-offset-4 outline-none hover:underline focus-visible:ring-3"
              onClick={() => {
                onOuvrir(ligne.id);
              }}
            >
              {ligne.description}
            </button>
            {ligne.typeOperation !== null && (
              <div className="text-muted-foreground text-xs">{ligne.typeOperation}</div>
            )}
          </div>
        </div>
      </TableCell>
      <TableCell className="whitespace-normal">
        <Select
          value={ligne.payeeId ?? AUCUN_BENEFICIAIRE}
          onValueChange={(valeur) => {
            onModifierEnPlace(ligne, {
              champ: "BENEFICIAIRE",
              payeeId: valeur === AUCUN_BENEFICIAIRE ? null : valeur,
            });
          }}
        >
          <SelectTrigger size="sm" className={CLASSE_DECLENCHEUR} aria-label={`Bénéficiaire : ${ligne.description}`}>
            <SelectValue placeholder="Aucun" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={AUCUN_BENEFICIAIRE}>Aucun</SelectItem>
            {beneficiaires.map((beneficiaire) => (
              <SelectItem key={beneficiaire.id} value={beneficiaire.id}>
                {beneficiaire.nom}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell className="whitespace-normal wrap-anywhere">
        {sousCategorieModifiable ? (
          <Select
            value={ligne.subcategoryId ?? AUCUNE_SOUS_CATEGORIE}
            onValueChange={(valeur) => {
              onModifierEnPlace(ligne, {
                champ: "SOUS_CATEGORIE",
                subcategoryId: valeur === AUCUNE_SOUS_CATEGORIE ? null : valeur,
              });
            }}
          >
            <SelectTrigger size="sm" className={CLASSE_DECLENCHEUR} aria-label={`Sous-catégorie : ${ligne.description}`}>
              <SelectValue placeholder="Aucune" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={AUCUNE_SOUS_CATEGORIE}>Aucune</SelectItem>
              {optionsSousCategories(categories, ligne.subcategoryId).map((groupe) => (
                <SelectGroup key={groupe.titre}>
                  <SelectLabel>{groupe.titre}</SelectLabel>
                  {groupe.options.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      {option.libelle}
                    </SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
        ) : (
          libelleSousCategorieLigne(ligne)
        )}
      </TableCell>
      <TableCell>
        <div className="flex flex-wrap gap-1">
          {ligne.etiquettes.map((etiquette) => (
            <Badge key={etiquette.id} variant="secondary">
              {etiquette.nom}
            </Badge>
          ))}
        </div>
      </TableCell>
      <TableCell className="text-right">
        <MontantTransaction cents={ligne.montantCents} />
      </TableCell>
      <TableCell>
        <EtatsTransaction ligne={ligne} variante="icones" />
      </TableCell>
    </TableRow>
  );
}
