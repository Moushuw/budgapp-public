// Libellés et décisions d'affichage de la consultation — pur, sans React.
// docs/lot-m2.md §5.2 à §5.5.

import type {
  DetailTransaction,
  FiltresTransactions,
  LigneTransactionListe,
  Pastille,
  TotauxPremierePage,
  TotauxTransactions,
} from "@/domain/consultation";
import {
  messageRefus,
  RAISONS_IGNOREES,
  refusSousCategorie,
  type MotifRefus,
  type ApercuSuppression,
  type ChoixSuppressionVirement,
  type CompteIgnorees,
  type CompteRenduMasse,
  type RaisonIgnoree,
} from "@/domain/edition";
import { formatMontant } from "@/domain/money";
import { descriptionContrepartie, type CandidatVirement } from "@/domain/virement";
import { libellePeriode, type Periode } from "@/domain/periode";
import { messageSuppressionLieeDetail, phraseLiaison } from "@/domain/recurrence";
import { LIBELLES_ETAT_TRANSACTION, LIBELLES_SOURCE_INGESTION } from "@/domain/referentiel";
import { LIBELLE_AUCUNE_RECURRENCE } from "@/features/recurrences/libelles";
import type { CategorieListe } from "@/server/actions/categories";
import type { ParametreIgnore } from "./filtres-url";
import type { EtatSelection } from "./selection";

const TIRET = "—";

/** Nom français de chaque paramètre d'adresse que `lireEtatUrl` peut signaler. */
export const LIBELLES_PARAMETRE_URL: Readonly<Record<string, string>> = {
  du: "Date de début",
  au: "Date de fin",
  toutesDates: "Toutes les dates",
  texte: "Recherche",
  compte: "Compte",
  sousCategorie: "Sous-catégorie",
  beneficiaire: "Bénéficiaire",
  etiquette: "Étiquette",
  montantMin: "Montant minimum",
  montantMax: "Montant maximum",
  sens: "Sens",
  aRevoir: "À revoir",
  virements: "Virements",
  recurrences: "Liées à une récurrence",
  ventilees: "Ventilées seulement",
  exclueBudget: "Exclues du budget",
  exclueRapports: "Exclues des rapports",
  tri: "Tri",
  ordre: "Ordre du tri",
};

/** « <libellé> : « <valeur> » ignoré. <motif> » ; libellé = la clé brute si elle est inconnue. */
export function libelleParametreIgnore(ignore: ParametreIgnore): string {
  const libelle = LIBELLES_PARAMETRE_URL[ignore.parametre] ?? ignore.parametre;
  return `${libelle} : « ${ignore.valeur} » ignoré. ${ignore.motif}`;
}

function pluriel(n: number, singulier: string, plur: string): string {
  return `${String(n)} ${n >= 2 ? plur : singulier}`;
}

export function libelleNombreTransactions(n: number): string {
  return pluriel(n, "transaction", "transactions");
}

/**
 * La sous-catégorie d'une ligne de liste se modifie-t-elle en place ? Un côté de virement ne l'est jamais, même quand
 * l'id de l'autre côté est masqué (virement !== null ⇔ transferTransactionId non nul).
 */
export function sousCategorieModifiableEnPlace(ligne: LigneTransactionListe): boolean {
  return (
    ligne.virement === null &&
    refusSousCategorie({ parentId: null, estVentilee: ligne.estVentilee, transferTransactionId: null }) === null
  );
}

export function libelleTotaux(totaux: TotauxTransactions): string {
  return `${libelleNombreTransactions(totaux.nombre)} · ${formatMontant(totaux.sommeCents, "CENTS")}`;
}

function libellePlage(du: string | null, au: string | null): string {
  if (du !== null && au !== null) return `Du ${du} au ${au}`;
  if (du !== null) return `Depuis le ${du}`;
  return `Jusqu'au ${au ?? ""}`;
}

export function libellePortee(filtres: FiltresTransactions, periode: Periode): string {
  if (filtres.toutesDates) {
    return "Toutes les dates";
  }
  if (filtres.du !== null || filtres.au !== null) {
    return libellePlage(filtres.du, filtres.au);
  }
  return libellePeriode(periode, "LONG");
}

export interface NomsReferentiel {
  readonly comptes: ReadonlyMap<string, string>;
  readonly sousCategories: ReadonlyMap<string, string>;
  readonly beneficiaires: ReadonlyMap<string, string>;
  readonly etiquettes: ReadonlyMap<string, string>;
}

export function libellePastille(pastille: Pastille, noms: NomsReferentiel): string {
  switch (pastille.type) {
    case "PLAGE":
      return libellePlage(pastille.du, pastille.au);
    case "TOUTES_DATES":
      return "Toutes les dates";
    case "TEXTE":
      return `Recherche : ${pastille.texte}`;
    case "COMPTE":
      return `Compte : ${noms.comptes.get(pastille.id) ?? "Compte inconnu"}`;
    case "SOUS_CATEGORIE":
      return `Sous-catégorie : ${noms.sousCategories.get(pastille.id) ?? "Sous-catégorie inconnue"}`;
    case "NON_CATEGORISEE":
      return "Non catégorisée";
    case "BENEFICIAIRE":
      return `Bénéficiaire : ${noms.beneficiaires.get(pastille.id) ?? "Bénéficiaire inconnu"}`;
    case "ETIQUETTE":
      return `Étiquette : ${noms.etiquettes.get(pastille.id) ?? "Étiquette inconnue"}`;
    case "MONTANT_MIN":
      return `Montant ≥ ${formatMontant(pastille.cents, "CENTS")}`;
    case "MONTANT_MAX":
      return `Montant ≤ ${formatMontant(pastille.cents, "CENTS")}`;
    case "SENS":
      return pastille.sens === "ENTREES" ? "Entrées seulement" : "Sorties seulement";
    case "A_REVOIR":
      return "À revoir";
    case "VIREMENTS":
      return pastille.mode === "SEULEMENT" ? "Virements seulement" : "Sans les virements";
    case "RECURRENCES":
      return pastille.mode === "SEULEMENT" ? "Liées à une récurrence seulement" : "Sans les liées à une récurrence";
    case "VENTILEES":
      return "Ventilées seulement";
    case "EXCLUE_BUDGET":
      return "Exclues du budget";
    case "EXCLUE_RAPPORTS":
      return "Exclues des rapports";
  }
}

export type CleEtat = "A_REVOIR" | "VIREMENT" | "VENTILEE" | "EXCLUE_BUDGET" | "EXCLUE_RAPPORTS";

export interface EtatAffiche {
  readonly cle: CleEtat;
  readonly libelle: string;
}

export function etatsDeLigne(ligne: LigneTransactionListe): readonly EtatAffiche[] {
  const etats: EtatAffiche[] = [];
  if (ligne.aRevoir) {
    etats.push({ cle: "A_REVOIR", libelle: "À revoir" });
  }
  if (ligne.virement !== null) {
    etats.push({ cle: "VIREMENT", libelle: `Virement avec ${ligne.virement.compteNom ?? "un compte inconnu"}` });
  }
  if (ligne.estVentilee) {
    etats.push({ cle: "VENTILEE", libelle: `Ventilée en ${pluriel(ligne.nbLignesVentilation, "ligne", "lignes")}` });
  }
  if (ligne.exclureDuBudget) {
    etats.push({ cle: "EXCLUE_BUDGET", libelle: "Exclue du budget" });
  }
  if (ligne.exclureDesRapports) {
    etats.push({ cle: "EXCLUE_RAPPORTS", libelle: "Exclue des rapports" });
  }
  return etats;
}

export function libelleSousCategorieLigne(ligne: LigneTransactionListe): string {
  if (ligne.estVentilee) {
    return "Ventilée";
  }
  if (ligne.virement !== null) {
    return "Virement";
  }
  if (ligne.sousCategorieNom === null) {
    return "Non catégorisée";
  }
  return ligne.categorieNom === null ? ligne.sousCategorieNom : `${ligne.categorieNom} › ${ligne.sousCategorieNom}`;
}

export type EtatListe =
  | "CHARGEMENT"
  | "ERREUR"
  | "SANS_TRANSACTION"
  | "AUCUN_RESULTAT_FILTRES"
  | "AUCUN_RESULTAT_PERIODE"
  | "LISTE";

/** Ordre de décision : chargement, erreur, nombre > 0, propriétaire sans transaction, filtres actifs, sinon période vide. */
export function etatListe(e: {
  readonly chargement: boolean;
  readonly erreur: boolean;
  readonly totaux: TotauxPremierePage | null;
  readonly filtresActifs: boolean;
}): EtatListe {
  if (e.chargement) return "CHARGEMENT";
  if (e.erreur) return "ERREUR";
  if (e.totaux === null || e.totaux.nombre > 0) return "LISTE";
  if (e.totaux.proprietaireSansTransaction) return "SANS_TRANSACTION";
  if (e.filtresActifs) return "AUCUN_RESULTAT_FILTRES";
  return "AUCUN_RESULTAT_PERIODE";
}

export type ChampDetail =
  | "compte"
  | "date"
  | "description"
  | "typeOperation"
  | "montant"
  | "beneficiaire"
  | "sousCategorie"
  | "note"
  | "etiquettes"
  | "aRevoir"
  | "exclureDuBudget"
  | "exclureDesRapports"
  | "source"
  | "lotImport"
  | "regle"
  | "recurrence"
  | "etat"
  | "externalId"
  | "empreinte"
  | "virement"
  | "ventilation";

export const LIBELLES_CHAMP_DETAIL: Record<ChampDetail, string> = {
  compte: "Compte",
  date: "Date",
  description: "Description",
  typeOperation: "Type d'opération",
  montant: "Montant",
  beneficiaire: "Bénéficiaire",
  sousCategorie: "Sous-catégorie",
  note: "Note",
  etiquettes: "Étiquettes",
  aRevoir: "À revoir",
  exclureDuBudget: "Exclue du budget",
  exclureDesRapports: "Exclue des rapports",
  source: "Source",
  lotImport: "Lot d'import",
  regle: "Règle appliquée",
  recurrence: "Liaison",
  etat: "État",
  externalId: "Identifiant externe",
  empreinte: "Empreinte",
  virement: "Virement",
  ventilation: "Lignes de ventilation",
};

function ouiNon(valeur: boolean): string {
  return valeur ? "Oui" : "Non";
}

function lotImport(detail: DetailTransaction): string {
  const lot = detail.lotImport;
  if (lot === null) {
    return TIRET;
  }
  let texte = `Importé le ${lot.importeLeDate}`;
  if (lot.couvreDu !== null && lot.couvreAu !== null) {
    texte += ` · relevé du ${lot.couvreDu} au ${lot.couvreAu}`;
  }
  if (lot.libelle !== null) {
    texte += ` · ${lot.libelle}`;
  }
  return texte;
}

function virement(detail: DetailTransaction): string {
  const contrepartie = detail.contrepartie;
  if (contrepartie === null) {
    return TIRET;
  }
  const montant = contrepartie.montantCents === null ? "montant inconnu" : formatMontant(contrepartie.montantCents, "CENTS");
  return `${contrepartie.compteNom ?? "Compte inconnu"} · ${contrepartie.date ?? "date inconnue"} · ${montant}`;
}

function ventilation(detail: DetailTransaction): string {
  if (!detail.estVentilee) {
    return TIRET;
  }
  const base = pluriel(detail.nbLignesVentilation, "ligne", "lignes");
  return detail.lignesVentilation.length < detail.nbLignesVentilation
    ? `${base} (${String(detail.lignesVentilation.length)} affichées)`
    : base;
}

function sousCategorie(detail: DetailTransaction): string {
  if (detail.estVentilee) {
    return "Ventilée";
  }
  if (detail.sousCategorieNom === null) {
    return "Aucune";
  }
  return detail.categorieNom === null ? detail.sousCategorieNom : `${detail.categorieNom} › ${detail.sousCategorieNom}`;
}

export function valeursDetail(detail: DetailTransaction): Record<ChampDetail, string> {
  return {
    compte: detail.compteNom,
    date: detail.date,
    description: detail.description,
    typeOperation: detail.typeOperation ?? TIRET,
    montant: formatMontant(detail.montantCents, "CENTS"),
    beneficiaire: detail.beneficiaireNom ?? "Aucun",
    sousCategorie: sousCategorie(detail),
    note: detail.note ?? TIRET,
    etiquettes:
      detail.etiquettes.length === 0
        ? "Aucune"
        : detail.etiquettes
            .map((etiquette) => etiquette.nom)
            .sort((a, b) => a.localeCompare(b, "fr-CA"))
            .join(", "),
    aRevoir: ouiNon(detail.aRevoir),
    exclureDuBudget: ouiNon(detail.exclureDuBudget),
    exclureDesRapports: ouiNon(detail.exclureDesRapports),
    source: LIBELLES_SOURCE_INGESTION[detail.source],
    lotImport: lotImport(detail),
    regle: detail.regle?.libelle ?? "Aucune",
    recurrence: detail.recurrence === null ? LIBELLE_AUCUNE_RECURRENCE : phraseLiaison(detail.recurrence),
    etat: LIBELLES_ETAT_TRANSACTION[detail.etat],
    externalId: detail.externalId ?? TIRET,
    empreinte: detail.empreinte,
    virement: virement(detail),
    ventilation: ventilation(detail),
  };
}

/** messageSuppressionLieeDetail (qui renvoie à la section Récurrence du panneau) si le refus vient d'une liaison à une récurrence ; sinon le message du motif. */
export function messageRefusSuppression(detail: DetailTransaction, motif: MotifRefus): string {
  if (motif === "SUPPRESSION_LIEE" && detail.recurrence !== null) {
    return messageSuppressionLieeDetail(detail.recurrence.libelle, detail.recurrence.echeance);
  }
  return messageRefus(motif);
}

export function libelleNombreARevoir(n: number): string {
  return `${libelleNombreTransactions(n)} à revoir`;
}

// ── écritures — docs/lot-m2.md §6

export const AUCUNE_SOUS_CATEGORIE = "__aucune__";
export const AUCUN_BENEFICIAIRE = "__aucun__";
export const NOUVEAU_BENEFICIAIRE = "__nouveau__";

export interface GroupeOptions {
  readonly titre: string;
  readonly options: readonly { readonly id: string; readonly libelle: string }[];
}

/** Sous-catégories non masquées groupées par catégorie, dans l'ordre reçu. Une sous-catégorie masquée n'apparaît que si son id vaut idCourant. Une catégorie sans option est omise. */
export function optionsSousCategories(
  categories: readonly CategorieListe[],
  idCourant: string | null,
): readonly GroupeOptions[] {
  const groupes: GroupeOptions[] = [];
  for (const categorie of categories) {
    const options = categorie.sousCategories
      .filter((sousCategorie) => !sousCategorie.masquee || sousCategorie.id === idCourant)
      .map((sousCategorie) => ({ id: sousCategorie.id, libelle: sousCategorie.nom }));
    if (options.length > 0) {
      groupes.push({ titre: categorie.nom, options });
    }
  }
  return groupes;
}

const LIBELLES_RAISON_IGNOREE: Record<RaisonIgnoree, string> = {
  VIREMENT: "virements",
  VENTILEE: "ventilées",
  LIGNE_FILLE: "lignes de ventilation",
  LIEE: "rattachées à une échéance, une cotisation ou un objectif",
  CONTREPARTIE_LIEE: "virements dont l'autre côté est rattaché à une échéance, une cotisation ou un objectif",
  INTROUVABLE: "introuvables",
};

function totalIgnorees(ignorees: CompteIgnorees): number {
  return RAISONS_IGNOREES.reduce((somme, raison) => somme + ignorees[raison], 0);
}

export function libelleRaisonsIgnorees(ignorees: CompteIgnorees): string {
  const libelles = RAISONS_IGNOREES.filter((raison) => ignorees[raison] > 0).map(
    (raison) => LIBELLES_RAISON_IGNOREE[raison],
  );
  if (libelles.length <= 1) {
    return libelles[0] ?? "";
  }
  const dernier = libelles[libelles.length - 1] ?? "";
  return `${libelles.slice(0, -1).join(", ")} ou ${dernier}`;
}

export function libelleCompteRendu(c: CompteRenduMasse): string {
  const pluriel = c.traitees >= 2;
  let verbe: string;
  if (c.geste === "SUPPRIMER") {
    verbe = pluriel ? "supprimées" : "supprimée";
  } else {
    verbe = pluriel ? "modifiées" : "modifiée";
  }
  let texte = `${String(c.traitees)} ${verbe}`;
  if (c.lignesVentilationSupprimees > 0) {
    texte +=
      c.lignesVentilationSupprimees === 1
        ? " (avec 1 ligne de ventilation)"
        : ` (avec ${String(c.lignesVentilationSupprimees)} lignes de ventilation)`;
  }
  if (c.contrepartiesSupprimees > 0) {
    texte +=
      c.contrepartiesSupprimees === 1
        ? " (et 1 autre côté de virement supprimé)"
        : ` (et ${String(c.contrepartiesSupprimees)} autres côtés de virement supprimés)`;
  }
  if (c.contrepartiesDeliees > 0) {
    texte +=
      c.contrepartiesDeliees === 1
        ? " (1 autre côté de virement délié)"
        : ` (${String(c.contrepartiesDeliees)} autres côtés de virement déliés)`;
  }
  if (c.inchangees > 0) {
    texte += `, ${String(c.inchangees)} ${c.inchangees >= 2 ? "inchangées" : "inchangée"}`;
  }
  const ignorees = totalIgnorees(c.ignorees);
  if (ignorees > 0) {
    texte += `, ${String(ignorees)} ${ignorees >= 2 ? "ignorées" : "ignorée"} : ${libelleRaisonsIgnorees(c.ignorees)}`;
  }
  return texte;
}

export function libelleApercuSuppression(a: ApercuSuppression): string {
  let texte: string;
  if (a.aSupprimer === 0) {
    texte = "Aucune transaction de la sélection ne peut être supprimée.";
  } else {
    texte =
      a.aSupprimer === 1 ? "1 transaction sera supprimée" : `${String(a.aSupprimer)} transactions seront supprimées`;
    if (a.parentsVentiles === 1) {
      texte +=
        a.lignesVentilation === 1
          ? ", dont 1 ventilée (sa ligne part avec elle)"
          : `, dont 1 ventilée (ses ${String(a.lignesVentilation)} lignes partent avec elle)`;
    } else if (a.parentsVentiles >= 2) {
      texte += `, dont ${String(a.parentsVentiles)} ventilées (leurs ${String(a.lignesVentilation)} lignes partent avec elles)`;
    }
    if (a.cotesVirement > 0) {
      texte += a.cotesVirement === 1 ? ", dont 1 côté de virement" : `, dont ${String(a.cotesVirement)} côtés de virement`;
    }
    texte += ".";
    if (a.contrepartiesSupprimees > 0) {
      texte +=
        a.contrepartiesSupprimees === 1
          ? " 1 autre côté de virement sera aussi supprimé."
          : ` ${String(a.contrepartiesSupprimees)} autres côtés de virement seront aussi supprimés.`;
    }
    if (a.contrepartiesDeliees > 0) {
      texte +=
        a.contrepartiesDeliees === 1
          ? " 1 autre côté de virement sera délié."
          : ` ${String(a.contrepartiesDeliees)} autres côtés de virement seront déliés.`;
    }
  }
  const ignorees = totalIgnorees(a.ignorees);
  if (ignorees > 0) {
    texte +=
      ignorees === 1
        ? ` 1 transaction sera ignorée : ${libelleRaisonsIgnorees(a.ignorees)}.`
        : ` ${String(ignorees)} transactions seront ignorées : ${libelleRaisonsIgnorees(a.ignorees)}.`;
  }
  if (a.aSupprimer > 0) {
    texte += " Cette action est définitive.";
  }
  return texte;
}

export function libelleSuppressionUnique(d: DetailTransaction): string {
  let texte = `La transaction « ${d.description} » du ${d.date} (${formatMontant(d.montantCents, "CENTS")}) sera supprimée.`;
  if (d.estVentilee) {
    texte += ` Ses ${String(d.nbLignesVentilation)} lignes de ventilation partent avec elle.`;
  }
  return `${texte} Cette action est définitive.`;
}

// ── virements — docs/lot-m2.md §4.4 et §5.3

/** Ce que lier retirera : une phrase par côté qui porte une sous-catégorie, le détail d'abord. */
export function libelleLiaison(detail: DetailTransaction, candidat: CandidatVirement): readonly string[] {
  const phrases: string[] = [];
  if (detail.sousCategorieNom !== null) {
    phrases.push(`La sous-catégorie « ${detail.sousCategorieNom} » de la ligne du ${detail.date} (${detail.compteNom}) sera retirée.`);
  }
  if (candidat.sousCategorieNom !== null) {
    phrases.push(
      `La sous-catégorie « ${candidat.sousCategorieNom} » de la ligne du ${candidat.date} (${candidat.compteNom}) sera retirée.`,
    );
  }
  return phrases.length === 0 ? ["Aucune sous-catégorie à retirer."] : phrases;
}

export function libelleContrepartie(detail: DetailTransaction, compteNom: string, nomCompteSource: string): string {
  const oppose = -detail.montantCents;
  let texte = `Une transaction de ${formatMontant(oppose, "CENTS")} sera créée sur ${compteNom} le ${detail.date}, décrite « ${descriptionContrepartie(oppose, nomCompteSource)} », puis liée à celle-ci.`;
  if (detail.sousCategorieNom !== null) {
    texte += ` La sous-catégorie « ${detail.sousCategorieNom} » de cette transaction sera retirée.`;
  }
  return texte;
}

function resumeContrepartie(detail: DetailTransaction): { readonly compteNom: string; readonly date: string; readonly montant: string } {
  const c = detail.contrepartie;
  const montantCents = c?.montantCents ?? null;
  return {
    compteNom: c?.compteNom ?? "compte inconnu",
    date: c?.date ?? "date inconnue",
    montant: montantCents === null ? "montant inconnu" : formatMontant(montantCents, "CENTS"),
  };
}

export function libelleDeliaison(detail: DetailTransaction): string {
  const c = resumeContrepartie(detail);
  return `Le virement entre « ${detail.description} » (${detail.compteNom}, ${detail.date}, ${formatMontant(detail.montantCents, "CENTS")}) et sa contrepartie (${c.compteNom}, ${c.date}, ${c.montant}) sera délié. Les deux lignes redeviendront des transactions ordinaires, sans sous-catégorie.`;
}

export function libelleSuppressionVirement(detail: DetailTransaction, choix: ChoixSuppressionVirement): string {
  const c = resumeContrepartie(detail);
  if (choix === "SUPPRIMER_LES_DEUX") {
    return `Les deux côtés du virement seront supprimés : « ${detail.description} » (${detail.compteNom}) et sa contrepartie sur ${c.compteNom}. Cette action est définitive.`;
  }
  return `« ${detail.description} » (${detail.compteNom}) sera supprimée ; sa contrepartie sur ${c.compteNom} restera, déliée et sans sous-catégorie. Cette action est définitive.`;
}

export function libelleRetourSuppression(contrepartie: "SUPPRIMEE" | "DELIEE" | null): string {
  if (contrepartie === "SUPPRIMEE") {
    return "Les deux côtés du virement ont été supprimés.";
  }
  if (contrepartie === "DELIEE") {
    return "Transaction supprimée ; l'autre côté du virement est délié.";
  }
  return "Transaction supprimée.";
}

/** docs/lot-m2.md §4.2 : la confirmation dit combien de lignes partent. */
export function libelleDeventilation(d: DetailTransaction): string {
  const n = d.nbLignesVentilation;
  const lignes = n === 1 ? "sa ligne sera supprimée" : `ses ${String(n)} lignes seront supprimées`;
  return `La ventilation de « ${d.description} » (${formatMontant(d.montantCents, "CENTS")}) sera retirée : ${lignes} et la transaction redeviendra non catégorisée. Cette action est définitive.`;
}

export function libelleSelection(e: EtatSelection, total: number | null): string {
  switch (e.mode) {
    case "AUCUNE":
      return "Aucune transaction sélectionnée";
    case "IDS":
      return e.ids.size === 1 ? "1 transaction sélectionnée" : `${String(e.ids.size)} transactions sélectionnées`;
    case "FILTRE": {
      const n = total ?? 0;
      return n <= 1
        ? `Tout le résultat : ${String(n)} transaction sélectionnée`
        : `Tout le résultat : ${String(n)} transactions sélectionnées`;
    }
  }
}
