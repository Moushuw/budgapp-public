"use client";

// Une ligne éditable — docs/lot-m1.md §8.2. N'importe aucun hook de
// mutation : uniquement useBeneficiaires, useCategories, useEtiquettes,
// useComptes (au travers des sélecteurs) — le défaut de la v1 que
// docs/lot-m1.md §8.2 nomme explicitement. Reçoit onChange(cle, patch) du
// parent, qui décide seul de l'arbitrage des créneaux en conflit (le geste
// de l'utilisateur sur le créneau, docs/lot-m1.md §6.3, A6).

import { AlertTriangle, HelpCircle } from "lucide-react";
import { useId, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverHeader, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { SlotAffectation } from "@/domain/categorization";
import { parseMontant } from "@/domain/money";
import { formatPartMille } from "@/domain/ventilation";
import { formatMontantChamp } from "@/lib/champs-formulaire";
import { useCategories } from "@/features/categories/use-categories";
import { useComptes } from "@/features/accounts/use-comptes";
import { useBeneficiaires } from "@/features/payees/use-beneficiaires";
import {
  choisirSousCategorie,
  conflitNonTrancheSurLigne,
  decrireTranchage,
  dedoublonnagePerime,
  erreurBeneficiaireNouveau,
  erreurVentilationRevue,
  MESSAGE_VENTILATION_MISE_A_JOUR,
  modifierLigneVentilation,
  slotsNonArbitres,
  ventilationIgnoreeParMiseAJour,
  ventilationRetiree,
  type LigneRevueEditee,
} from "./etat-revue";
import { GRILLE_A_IMPORTER } from "./colonnes-a-importer";
import { LIMITE_NOTE } from "./schema";
import { SelecteurBeneficiaire } from "./SelecteurBeneficiaire";
import { SelecteurEtiquettes } from "./SelecteurEtiquettes";
import { SelecteurSousCategorie } from "./SelecteurSousCategorie";
import { OccurrenceProposee } from "./OccurrenceProposee";
import { VirementPropose } from "./VirementPropose";

export interface LigneAImporterProps {
  readonly ligne: LigneRevueEditee;
  readonly onChange: (cle: string, patch: Partial<LigneRevueEditee>) => void;
  /** Ce qui empêche d'enregistrer le virement choisi pour cette ligne ; null si rien. */
  readonly erreurVirement: string | null;
  /** Ce qui empêche d'enregistrer le rapprochement choisi pour cette ligne ; null si rien. */
  readonly erreurOccurrence: string | null;
}

const LIBELLES_SLOT: Record<SlotAffectation, string> = {
  SOUS_CATEGORIE: "Sous-catégorie",
  BENEFICIAIRE: "Bénéficiaire",
  NOTE: "Note",
};

function EtatLigne({
  ligne,
  onBasculerARevoir,
  onTrancherConflit,
}: {
  readonly ligne: LigneRevueEditee;
  readonly onBasculerARevoir: () => void;
  readonly onTrancherConflit: () => void;
}): ReactNode {
  const conflit = conflitNonTrancheSurLigne(ligne);
  const perime = dedoublonnagePerime(ligne);
  // Résout un id de sous-catégorie en son nom pour le tooltip de conflit —
  // pour BENEFICIAIRE et NOTE, candidat.valeur est déjà la valeur à afficher
  // (docs/lot-m1.md §3.2, domain/categorization/types.ts : CandidatConflit).
  const { data: categories } = useCategories();
  const { data: beneficiaires } = useBeneficiaires();
  const nomsSousCategories = new Map(
    (categories ?? []).flatMap((categorie) => categorie.sousCategories.map((sc) => [sc.id, sc.nom] as const)),
  );
  const nomsBeneficiaires = new Map((beneficiaires ?? []).map((beneficiaire) => [beneficiaire.id, beneficiaire.nom] as const));
  const idTranchage = useId();

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {conflit && (
        <>
          {/* Un Popover, pas un Tooltip : le détail s'ouvre aussi au toucher (docs/lot-m2.md §10.2 point 1). */}
          <Popover>
            <PopoverTrigger asChild>
              <button type="button" data-conflit-declencheur="" aria-label="Conflit de règles : voir le détail">
                <Badge variant="destructive" className="gap-1">
                  <AlertTriangle className="size-3" /> Conflit
                </Badge>
              </button>
            </PopoverTrigger>
            <PopoverContent data-detail-conflit="" className="w-72 max-w-[calc(100vw-2rem)]">
              <PopoverHeader>
                <PopoverTitle>Règles en conflit</PopoverTitle>
              </PopoverHeader>
              {ligne.base.conflits.map((unConflit) => (
                <p key={unConflit.slot}>
                  {LIBELLES_SLOT[unConflit.slot]} :{" "}
                  {unConflit.candidats
                    .map((candidat) => {
                      if (candidat.ventilation !== undefined) {
                        const parts = candidat.ventilation
                          .map(
                            (part) =>
                              `${nomsSousCategories.get(part.subcategoryId) ?? part.subcategoryId} ${formatPartMille(part.partMille)} %`,
                          )
                          .join(", ");
                        return `${candidat.libelle} → Ventilation ${parts}`;
                      }
                      const valeur =
                        unConflit.slot === "SOUS_CATEGORIE"
                          ? (nomsSousCategories.get(candidat.valeur) ?? candidat.valeur)
                          : candidat.valeur;
                      return `${candidat.libelle} → ${valeur}`;
                    })
                    .join(" vs ")}
                </p>
              ))}
            </PopoverContent>
          </Popover>
          {/*
            Le geste de trancher doit exister indépendamment de tout widget
            de saisie : Radix ne déclenche pas onValueChange quand on
            re-sélectionne la valeur déjà affichée, donc « accepter la
            valeur telle quelle » (y compris NOTE laissée vide) ne
            déclencherait jamais rien sans ce bouton — exactement le blocage
            permanent que « J'ai tranché » (docs/lot-m1.md §6.3) existe pour éviter.
          */}
          <button type="button" onClick={onTrancherConflit} aria-describedby={idTranchage}>
            <Badge variant="outline" className="cursor-pointer">
              J&apos;ai tranché
            </Badge>
          </button>
          <span id={idTranchage} className="text-muted-foreground text-xs">
            {decrireTranchage(ligne, nomsSousCategories, nomsBeneficiaires)}
          </span>
        </>
      )}
      <button type="button" onClick={onBasculerARevoir} aria-pressed={ligne.aRevoir}>
        <Badge variant={ligne.aRevoir ? "default" : "outline"} className="cursor-pointer">
          À revoir
        </Badge>
      </button>
      {ligne.exclureDuBudget && <Badge variant="secondary">Exclue du budget</Badge>}
      {ligne.exclureDesRapports && <Badge variant="secondary">Exclue des rapports</Badge>}
      {ligne.payeeNouveauNom !== null && <Badge variant="outline">Bénéficiaire à créer</Badge>}
      {perime && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span>
              <Badge variant="outline" className="gap-1">
                <HelpCircle className="size-3" /> Doublon à revérifier
              </Badge>
            </span>
          </TooltipTrigger>
          <TooltipContent>Contrôle de doublon refait à l&apos;enregistrement.</TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}

export function LigneAImporter(props: LigneAImporterProps): ReactNode {
  const { ligne, onChange, erreurVirement, erreurOccurrence } = props;
  const { data: comptes } = useComptes();
  const idBeneficiaire = useId();
  const idSousCategorie = useId();
  const nomCompte = comptes?.find((compte) => compte.id === ligne.accountId)?.nom ?? null;
  // Une mise à jour n'envoie pas la ventilation proposée : elle ne s'affiche pas comme si elle s'appliquait.
  const ventilationAppliquee = ligne.ventilation !== null && ligne.action !== "METTRE_A_JOUR";

  return (
    <div data-ligne-a-importer="" className={cn("flex flex-col gap-3 md:grid md:items-start", GRILLE_A_IMPORTER)}>
      <div className="grid grid-cols-2 gap-2 md:contents">
        <Input
          data-colonne="date"
          className="col-span-2 md:col-span-1"
          type="date"
          value={ligne.date}
          onChange={(evenement) => { onChange(ligne.base.cle, { date: evenement.target.value }); }}
        />
        <div data-colonne="description" className="col-span-2 flex flex-col gap-1 md:col-span-1">
          <Input
            aria-label="Description"
            value={ligne.description}
            onChange={(evenement) => { onChange(ligne.base.cle, { description: evenement.target.value }); }}
          />
          {ligne.base.typeOperation !== null && ligne.base.typeOperation !== "" && (
            <span className="text-muted-foreground text-xs">{ligne.base.typeOperation}</span>
          )}
        </div>
        <div data-colonne="beneficiaire" className="flex min-w-0 flex-col gap-1">
          <Label
            htmlFor={idBeneficiaire}
            data-etiquette-champ="beneficiaire"
            className="text-muted-foreground text-xs font-normal md:sr-only"
          >
            Bénéficiaire
          </Label>
          <SelecteurBeneficiaire
            id={idBeneficiaire}
            payeeId={ligne.payeeId}
            payeeNouveauNom={ligne.payeeNouveauNom}
            erreur={erreurBeneficiaireNouveau(ligne)}
            onChange={(patch) => {
              // Le choix d'un bénéficiaire arbitre le créneau BENEFICIAIRE d'un
              // conflit éventuel — c'est le geste de l'utilisateur sur ce créneau.
              const slotsArbitres = ligne.slotsArbitres.includes("BENEFICIAIRE")
                ? ligne.slotsArbitres
                : [...ligne.slotsArbitres, "BENEFICIAIRE" as const];
              onChange(ligne.base.cle, { ...patch, slotsArbitres });
            }}
          />
        </div>
        <div data-colonne="sousCategorie" className="flex min-w-0 flex-col gap-1">
          <Label
            htmlFor={idSousCategorie}
            data-etiquette-champ="sousCategorie"
            className="text-muted-foreground text-xs font-normal md:sr-only"
          >
            Sous-catégorie
          </Label>
          <SelecteurSousCategorie
            id={idSousCategorie}
            subcategoryId={ligne.subcategoryId}
            ventilee={ventilationAppliquee}
            virement={ligne.virementAvec !== null}
            onChange={(subcategoryId) => {
              onChange(ligne.base.cle, choisirSousCategorie(ligne, subcategoryId));
            }}
          />
        </div>
        <Input
          data-colonne="montant"
          className="font-montant"
          inputMode="decimal"
          value={ligne.montantSaisi}
          onChange={(evenement) => { onChange(ligne.base.cle, { montantSaisi: evenement.target.value }); }}
          onBlur={() => {
            // Reformate ce qui est lisible, sur le même principe que ChampMontant.
            const nettoye = ligne.montantSaisi.trim();
            const valeur = nettoye === "" ? null : parseMontant(nettoye);
            if (valeur !== null) {
              onChange(ligne.base.cle, { montantSaisi: formatMontantChamp(valeur) });
            }
          }}
        />
        <div data-colonne="compte" className="min-w-0">
          <Select value={ligne.accountId} onValueChange={(accountId) => { onChange(ligne.base.cle, { accountId }); }}>
            <SelectTrigger className="w-full min-w-0" title={nomCompte ?? undefined}>
              <SelectValue className="min-w-0">
                {nomCompte === null ? undefined : (
                  <span data-nom-compte="" className="block min-w-0 truncate">
                    {nomCompte}
                  </span>
                )}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {(comptes ?? []).map((compte) => (
                <SelectItem key={compte.id} value={compte.id}>
                  {compte.nom}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div data-colonne="complements" className="flex flex-col gap-2">
        <Input
          placeholder="Note"
          maxLength={LIMITE_NOTE}
          value={ligne.note ?? ""}
          onChange={(evenement) => {
            const valeur = evenement.target.value;
            // Une note en conflit qu'on choisit de laisser vide reste un
            // arbitrage explicite dès qu'on touche le champ — mais le bouton
            // « J'ai tranché » couvre le cas où on ne le touche pas du tout.
            const slotsArbitres = ligne.slotsArbitres.includes("NOTE")
              ? ligne.slotsArbitres
              : [...ligne.slotsArbitres, "NOTE" as const];
            onChange(ligne.base.cle, { note: valeur === "" ? null : valeur, slotsArbitres });
          }}
        />
        <SelecteurEtiquettes tagIds={ligne.tagIds} onChange={(tagIds) => { onChange(ligne.base.cle, { tagIds }); }} />
        <EtatLigne
          ligne={ligne}
          onBasculerARevoir={() => { onChange(ligne.base.cle, { aRevoir: !ligne.aRevoir }); }}
          onTrancherConflit={() => {
            const nouveauxSlots = slotsNonArbitres(ligne);
            if (nouveauxSlots.length > 0) {
              onChange(ligne.base.cle, { slotsArbitres: [...ligne.slotsArbitres, ...nouveauxSlots] });
            }
          }}
        />
      </div>

      {ligne.base.candidatsVirement.length > 0 && (
        <VirementPropose ligne={ligne} onChange={onChange} erreur={erreurVirement} />
      )}
      {ligne.base.candidatsOccurrence.length > 0 && ligne.action === "IMPORTER" && (
        <OccurrenceProposee ligne={ligne} onChange={onChange} erreur={erreurOccurrence} />
      )}
      {ventilationAppliquee && <VentilationProposee ligne={ligne} onChange={onChange} />}
      {ventilationIgnoreeParMiseAJour(ligne) && (
        <p data-ventilation-mise-a-jour="" className="text-muted-foreground text-xs md:col-span-full">
          {MESSAGE_VENTILATION_MISE_A_JOUR}
        </p>
      )}
      {ventilationRetiree(ligne) && ligne.virementAvec === null && (
        <p className="text-muted-foreground text-xs md:col-span-full">
          La ventilation de la règle a été retirée : la sous-catégorie choisie s&apos;applique.
        </p>
      )}
    </div>
  );
}

/** Les lignes de la ventilation posée par une règle : sous-catégorie et montant modifiables, rien d'autre (docs/lot-m2.md §4.3). */
function VentilationProposee({
  ligne,
  onChange,
}: {
  readonly ligne: LigneRevueEditee;
  readonly onChange: LigneAImporterProps["onChange"];
}): ReactNode {
  const filles = ligne.ventilation ?? [];
  const erreur = erreurVentilationRevue(ligne);
  return (
    <div data-ventilation-revue="" className="flex min-w-0 flex-col gap-2 md:col-span-full">
      <p className="text-muted-foreground text-xs">{`Ventilée en ${String(filles.length)} lignes par une règle`}</p>
      {filles.map((fille, i) => {
        const rang = i + 1;
        return (
          // La ventilation d'une ligne de la revue ne change jamais de forme (ni ajout ni retrait, docs/lot-m2.md §4.3) :
          // le rang est une clé stable.
          <div key={rang} className="flex min-w-0 items-start gap-2">
            <div className="min-w-0 flex-1">
              <SelecteurSousCategorie
                subcategoryId={fille.subcategoryId}
                ariaLabel={`Sous-catégorie, ligne ${String(rang)} de la ventilation`}
                onChange={(subcategoryId) => {
                  onChange(ligne.base.cle, modifierLigneVentilation(ligne, i, { subcategoryId }));
                }}
              />
            </div>
            <Input
              className="font-montant w-32 shrink-0"
              inputMode="decimal"
              aria-label={`Montant, ligne ${String(rang)} de la ventilation`}
              value={fille.montantSaisi}
              onChange={(evenement) => {
                onChange(ligne.base.cle, modifierLigneVentilation(ligne, i, { montantSaisi: evenement.target.value }));
              }}
              onBlur={() => {
                const nettoye = fille.montantSaisi.trim();
                const valeur = nettoye === "" ? null : parseMontant(nettoye);
                if (valeur !== null) {
                  onChange(ligne.base.cle, modifierLigneVentilation(ligne, i, { montantSaisi: formatMontantChamp(valeur) }));
                }
              }}
            />
          </div>
        );
      })}
      {erreur !== null && (
        <p data-erreur-ventilation="" className="text-destructive text-sm">
          {erreur}
        </p>
      )}
    </div>
  );
}
