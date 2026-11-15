// L'état éditable de la revue — docs/lot-m1.md §6.1. Aucun JSX, aucun
// hook : de la transformation pure, testable à froid.

import type { ActionLigne, LigneEnRevue } from "@/domain/ingestion";
// Import direct, pas depuis le barillet @/domain/ingestion : ce fichier est
// tiré par des composants "use client" (LigneAImporter.tsx et consorts), et
// le barillet réexporte aussi calculerEmpreinte (node:crypto, ./empreinte.ts)
// dans le même index.ts. Établi au runtime (npm run dev, /transactions/
// import) que ça ne cassait pas déjà, mais une frontière de module ne doit
// pas dépendre du tree-shaking pour rester vraie (relecture tranche 6,
// point 8).
import { conflitNonTranche } from "@/domain/ingestion/arbitrage";
import { sousCategorieHeritable } from "@/domain/ingestion/heritage";
import { normaliserDescription, normaliserNom } from "@/domain/ingestion/normaliser";
import { candidatsOccurrence, occurrencesEnDouble, type CandidatOccurrence, type OccurrenceCandidate } from "@/domain/recurrence";
import type { SlotAffectation } from "@/domain/categorization";
import type { DateCivile } from "@/domain/dates";
import { formatMontant, parseMontant } from "@/domain/money";
import { messageErreurVentilation, validerVentilation } from "@/domain/ventilation";
import { ciblesEnDouble, messageRefusLiaison, peutLier } from "@/domain/virement";
import type { ControleTotal, LigneRejetee, RaisonRejet } from "@/domain/statement";
import { formatMontantChamp } from "@/lib/champs-formulaire";
import { accorder } from "./libelles-revue";
import { MESSAGE_BENEFICIAIRE_NOUVEAU_VIDE, type EntreeLigneImport } from "./schema";

export interface LigneVentilationEditee {
  readonly subcategoryId: string | null;
  /** La chaîne saisie, pas un nombre (CLAUDE.md §11). */
  readonly montantSaisi: string;
}

/** Ce que le choix d'un virement a vidé sur la ligne ; jamais restauré en décochant (docs/lot-m2.md §4.5). */
export interface RetraitVirement {
  readonly subcategoryId: string | null;
  readonly ventilee: boolean;
}

export interface LigneRevueEditee {
  /** Ce que le pipeline a produit. Jamais modifié : c'est la trace de l'analyse. */
  readonly base: LigneEnRevue;
  readonly date: DateCivile;
  readonly description: string;
  /** La chaîne saisie, pas un nombre (CLAUDE.md §11). */
  readonly montantSaisi: string;
  readonly accountId: string;
  readonly payeeId: string | null;
  readonly payeeNouveauNom: string | null;
  readonly subcategoryId: string | null;
  /** Posée par une règle VENTILER, modifiable ligne par ligne (docs/lot-m2.md §4.3) ; null = pas ventilée. */
  readonly ventilation: readonly LigneVentilationEditee[] | null;
  readonly tagIds: readonly string[];
  readonly note: string | null;
  readonly aRevoir: boolean;
  readonly exclureDuBudget: boolean;
  readonly exclureDesRapports: boolean;
  readonly action: ActionLigne;
  readonly slotsArbitres: readonly SlotAffectation[];
  /** La transaction d'un autre compte dont cette ligne est l'autre côté ; null = pas un virement. */
  readonly virementAvec: string | null;
  readonly retraitVirement: RetraitVirement | null;
  /** L'occurrence que la ligne réalisera ; null = Ne pas lier. */
  readonly occurrenceAvec: string | null;
  /** La sous-catégorie a été posée par la récurrence au dernier geste qui l'a posée. Lire par categorieDeLaRecurrence. */
  readonly categorieHeritee: boolean;
}

export function depuisLigneEnRevue(ligne: LigneEnRevue): LigneRevueEditee {
  return {
    base: ligne,
    date: ligne.date,
    description: ligne.description,
    montantSaisi: formatMontantChamp(ligne.montantCents),
    accountId: ligne.accountId,
    payeeId: ligne.payeeId,
    payeeNouveauNom: ligne.payeeNouveauNom,
    subcategoryId: ligne.subcategoryId,
    ventilation:
      ligne.ventilation?.map((fille) => ({
        subcategoryId: fille.subcategoryId,
        montantSaisi: formatMontantChamp(fille.montantCents),
      })) ?? null,
    tagIds: ligne.tagIds,
    note: ligne.note,
    aRevoir: ligne.aRevoir,
    exclureDuBudget: ligne.exclureDuBudget,
    exclureDesRapports: ligne.exclureDesRapports,
    action: ligne.action,
    slotsArbitres: [],
    virementAvec: ligne.virementAvec,
    retraitVirement:
      ligne.categorisationRetiree === null
        ? null
        : {
            subcategoryId: ligne.categorisationRetiree.subcategoryId,
            ventilee: ligne.categorisationRetiree.ventilation !== null,
          },
    occurrenceAvec: ligne.occurrenceAvec,
    categorieHeritee: ligne.categorieHeritee,
  };
}

/**
 * true si la ventilation éditée est celle que la règle a posée : mêmes sous-catégories, mêmes montants, et
 * montant du parent inchangé (les montants des filles en dépendent).
 */
export function ventilationInchangee(ligne: LigneRevueEditee): boolean {
  const proposee = ligne.base.ventilation;
  const editee = ligne.ventilation;
  if (proposee === null || editee === null || ligne.montantSaisi !== formatMontantChamp(ligne.base.montantCents)) {
    return false;
  }
  return (
    proposee.length === editee.length &&
    proposee.every((fille, i) => {
      const modifiee = editee[i];
      return (
        modifiee?.subcategoryId === fille.subcategoryId &&
        formatMontantChamp(fille.montantCents) === modifiee.montantSaisi
      );
    })
  );
}

/** La ventilation proposée par la règle a été retirée par l'utilisateur. */
export function ventilationRetiree(ligne: LigneRevueEditee): boolean {
  return ligne.base.ventilation !== null && ligne.ventilation === null;
}

/** Seule la fille `rang` change ; une ligne non ventilée est rendue inchangée. */
export function modifierLigneVentilation(
  ligne: LigneRevueEditee,
  rang: number,
  patch: Partial<LigneVentilationEditee>,
): Pick<LigneRevueEditee, "ventilation"> {
  return { ventilation: ligne.ventilation?.map((fille, i) => (i === rang ? { ...fille, ...patch } : fille)) ?? null };
}

export const MESSAGE_VENTILATION_MISE_A_JOUR = "La ventilation proposée par la règle ne s'applique pas à une mise à jour.";

/** La ligne est une mise à jour et porte une ventilation proposée, que versLigneImport n'envoie pas. */
export function ventilationIgnoreeParMiseAJour(ligne: LigneRevueEditee): boolean {
  return ligne.action === "METTRE_A_JOUR" && ligne.ventilation !== null;
}

/**
 * La ventilation éditée ne tient pas : null si la ligne n'est pas importée ou pas ventilée (une mise à jour n'envoie
 * pas sa ventilation). Le montant du parent illisible est déjà dit par son champ. Sinon la première erreur de
 * validerVentilation, en message.
 */
export function erreurVentilationRevue(ligne: LigneRevueEditee): string | null {
  if (ligne.action !== "IMPORTER" || ligne.ventilation === null) {
    return null;
  }
  const montants: number[] = [];
  for (const [rang, fille] of ligne.ventilation.entries()) {
    const montant = parseMontant(fille.montantSaisi);
    if (montant === null) {
      return `La ligne ${String(rang + 1)} de la ventilation porte un montant illisible.`;
    }
    montants.push(montant);
  }
  const parent = parseMontant(ligne.montantSaisi);
  if (parent === null) {
    return null;
  }
  const [premiere] = validerVentilation(
    { montantCents: parent, estFille: false, estVirement: false },
    montants.map((montantCents) => ({ montantCents })),
  );
  return premiere === undefined ? null : messageErreurVentilation(premiere);
}

/** null si action === "IGNORER" : la ligne n'est pas envoyée à l'action. */
export function versLigneImport(ligne: LigneRevueEditee): EntreeLigneImport | null {
  if (ligne.action === "IGNORER") {
    return null;
  }
  // Une mise à jour ne pose pas de virement : le schéma serveur refuserait tout le lot.
  const virementAvec = ligne.action === "METTRE_A_JOUR" ? null : ligne.virementAvec;
  const estVirement = virementAvec !== null;

  return {
    cle: ligne.base.cle,
    action: ligne.action,
    transactionExistanteId: ligne.action === "METTRE_A_JOUR" ? (ligne.base.doublonDe?.id ?? null) : null,
    accountId: ligne.accountId,
    date: ligne.date,
    description: ligne.description,
    typeOperation: ligne.base.typeOperation,
    montant: ligne.montantSaisi,
    note: ligne.note,
    payeeId: ligne.payeeId,
    payeeNouveauNom: ligne.payeeNouveauNom,
    subcategoryId: estVirement ? null : ligne.subcategoryId,
    // Une mise à jour ne pose pas de ventilation : le schéma serveur refuserait tout le lot.
    // Un côté de virement ne se ventile pas non plus.
    ventilation:
      ligne.action === "METTRE_A_JOUR" || estVirement
        ? null
        : (ligne.ventilation?.map((fille) => ({ subcategoryId: fille.subcategoryId, montant: fille.montantSaisi })) ??
          null),
    tagIds: [...ligne.tagIds],
    externalId: ligne.base.externalId,
    // La règle n'est créditée que de ce qu'elle a posé sur le créneau (sous-catégorie ou ventilation) ; changé à la
    // main, elle ne l'a plus posé (CLAUDE.md règle 7). Le serveur revérifie. Un côté de virement n'en porte aucune.
    appliedRuleId:
      !estVirement &&
      ligne.subcategoryId === ligne.base.subcategoryId &&
      (ligne.base.ventilation === null ? ligne.ventilation === null : ventilationInchangee(ligne))
        ? ligne.base.regleAppliqueeId
        : null,
    aRevoir: ligne.aRevoir,
    exclureDuBudget: ligne.exclureDuBudget,
    exclureDesRapports: ligne.exclureDesRapports,
    virementAvec,
    // Une ligne ignorée n'est pas envoyée ; une mise à jour ne se lie pas (le schéma serveur refuserait tout le lot).
    occurrenceAvec: ligne.action === "IMPORTER" ? ligne.occurrenceAvec : null,
    occurrenceAuto: ligne.action === "IMPORTER" && occurrenceAutoConservee(ligne),
  };
}

/** true dès que la date, la description, le montant ou le compte a été touché. */
export function dedoublonnagePerime(ligne: LigneRevueEditee): boolean {
  return (
    ligne.date !== ligne.base.date ||
    ligne.description !== ligne.base.description ||
    ligne.montantSaisi !== formatMontantChamp(ligne.base.montantCents) ||
    ligne.accountId !== ligne.base.accountId
  );
}

/** Le créneau sous-catégorie ne compte pas tant que la ligne est un virement : elle n'en porte pas (docs/lot-m2.md §4.5). */
function conflitsApplicables(ligne: LigneRevueEditee): LigneEnRevue["conflits"] {
  return ligne.virementAvec === null
    ? ligne.base.conflits
    : ligne.base.conflits.filter((conflit) => conflit.slot !== "SOUS_CATEGORIE");
}

export function conflitNonTrancheSurLigne(ligne: LigneRevueEditee): boolean {
  return ligne.action !== "IGNORER" && conflitNonTranche(conflitsApplicables(ligne), ligne.slotsArbitres);
}

/** Les créneaux en conflit que « J'ai tranché » arbitrerait d'un coup. */
export function slotsNonArbitres(ligne: LigneRevueEditee): readonly SlotAffectation[] {
  return conflitsApplicables(ligne)
    .map((conflit) => conflit.slot)
    .filter((slot) => !ligne.slotsArbitres.includes(slot));
}

/**
 * Ce que « J'ai tranché » accepte, en clair. Un créneau en conflit reste à
 * null côté sous-catégorie et note (resolution.ts : un conflit ne tranche
 * pas) — cliquer revient donc à importer sans, et l'utilisateur doit le lire
 * avant de cliquer, pas le découvrir après.
 */
export function decrireTranchage(
  ligne: LigneRevueEditee,
  nomsSousCategories: ReadonlyMap<string, string>,
  nomsBeneficiaires: ReadonlyMap<string, string>,
): string {
  const morceaux = slotsNonArbitres(ligne).map((slot) => {
    if (slot === "SOUS_CATEGORIE") {
      return ligne.subcategoryId === null
        ? "sans sous-catégorie"
        : `avec la sous-catégorie « ${nomsSousCategories.get(ligne.subcategoryId) ?? ligne.subcategoryId} »`;
    }
    if (slot === "BENEFICIAIRE") {
      if (ligne.payeeNouveauNom !== null) {
        return `avec le nouveau bénéficiaire « ${ligne.payeeNouveauNom} »`;
      }
      return ligne.payeeId === null
        ? "sans bénéficiaire"
        : `avec le bénéficiaire « ${nomsBeneficiaires.get(ligne.payeeId) ?? ligne.payeeId} »`;
    }
    return ligne.note === null ? "sans note" : `avec la note « ${ligne.note} »`;
  });
  return `Sera importée ${morceaux.join(", ")}`;
}

/**
 * Le nom d'un nouveau bénéficiaire qui ne passerait pas le serveur : vide
 * une fois normalisé (rien, des espaces, des accents combinants seuls) —
 * import-batches.ts le refuse, mais son message arrive sans dire quelle
 * ligne est en cause. null si la ligne n'est pas envoyée.
 */
export function erreurBeneficiaireNouveau(ligne: LigneRevueEditee): string | null {
  if (ligne.action === "IGNORER" || ligne.payeeNouveauNom === null) {
    return null;
  }
  return normaliserNom(ligne.payeeNouveauNom) === "" ? MESSAGE_BENEFICIAIRE_NOUVEAU_VIDE : null;
}

/** docs/lot-m1.md §5.9 — raisons de rejet que la revue n'affiche pas. */
export const RAISONS_MASQUEES: readonly RaisonRejet[] = ["AUCUNE_DATE"];

/** Les rejets affichés et comptés par la revue, dans l'ordre reçu. */
export function rejeteesAffichees(rejetees: readonly LigneRejetee[]): readonly LigneRejetee[] {
  return rejetees.filter((rejetee) => !RAISONS_MASQUEES.includes(rejetee.raison));
}

/**
 * null s'il n'y a aucun rejet AUCUNE_DATE ; sinon la mention discrète de la
 * revue. Compte des fragments (rejets), pas des lignes source.
 */
export function mentionFragmentsMasques(rejetees: readonly LigneRejetee[]): string | null {
  const n = rejetees.filter((rejetee) => rejetee.raison === "AUCUNE_DATE").length;
  if (n === 0) {
    return null;
  }
  return n === 1 ? "1 fragment sans date masqué." : `${String(n)} fragments sans date masqués.`;
}

/** null si `controle` est null ou si ecartCents === 0 ; sinon l'alerte à afficher en haut de la revue. */
export function messageEcartTotal(controle: ControleTotal | null): string | null {
  if (controle === null || controle.ecartCents === 0) {
    return null;
  }
  const { numeroLigne, totalReleveCents, sommeReconnuesCents, ecartCents } = controle;
  return `Le total du relevé (ligne ${numeroLigne}) vaut ${formatMontant(totalReleveCents)}, mais les lignes reconnues totalisent ${formatMontant(sommeReconnuesCents)} : écart de ${formatMontant(Math.abs(ecartCents))}. Une transaction n'a peut-être pas été reconnue, ou a été mal lue — compare avec le relevé avant d'enregistrer.`;
}

/**
 * Le geste « choisir une sous-catégorie » (A6) : pose la valeur ET arbitre le
 * créneau SOUS_CATEGORIE, sans dupliquer le créneau s'il l'était déjà.
 */
export function choisirSousCategorie(
  ligne: LigneRevueEditee,
  subcategoryId: string | null,
): Pick<LigneRevueEditee, "subcategoryId" | "slotsArbitres" | "ventilation"> {
  const slotsArbitres = ligne.slotsArbitres.includes("SOUS_CATEGORIE")
    ? ligne.slotsArbitres
    : [...ligne.slotsArbitres, "SOUS_CATEGORIE" as const];
  // Le geste vaut arbitrage : il annule la ventilation posée par une règle, « Aucune » compris (docs/lot-m2.md §4.3).
  return { subcategoryId, slotsArbitres, ventilation: null };
}

/**
 * Choisir (ou décocher) le virement d'une ligne. Le retrait est calculé AVANT la remise à zéro (CLAUDE.md §9) ;
 * décocher ne restaure rien : la ligne redevient ordinaire et sans sous-catégorie.
 */
export function choisirVirement(
  ligne: LigneRevueEditee,
  candidatId: string | null,
): Pick<LigneRevueEditee, "virementAvec" | "subcategoryId" | "ventilation" | "retraitVirement"> {
  if (candidatId === null) {
    return {
      virementAvec: null,
      subcategoryId: ligne.subcategoryId,
      ventilation: ligne.ventilation,
      retraitVirement: null,
    };
  }
  const retrait: RetraitVirement | null =
    ligne.subcategoryId !== null || ligne.ventilation !== null
      ? { subcategoryId: ligne.subcategoryId, ventilee: ligne.ventilation !== null }
      : ligne.retraitVirement;
  return { virementAvec: candidatId, subcategoryId: null, ventilation: null, retraitVirement: retrait };
}

/** Ce que le choix du virement a vidé sur cette ligne, dit en clair ; null si rien n'a été retiré. */
export function messageRetraitVirement(
  ligne: LigneRevueEditee,
  nomsSousCategories: ReadonlyMap<string, string>,
): string | null {
  const retrait = ligne.retraitVirement;
  if (retrait === null) {
    return null;
  }
  if (retrait.ventilee) {
    return "La ventilation proposée a été retirée : un virement ne se ventile pas.";
  }
  if (retrait.subcategoryId !== null) {
    const nom = nomsSousCategories.get(retrait.subcategoryId) ?? retrait.subcategoryId;
    return `La sous-catégorie « ${nom} » a été retirée : un virement n'en porte pas.`;
  }
  return null;
}

function candidatChoisi(ligne: LigneRevueEditee): LigneEnRevue["candidatsVirement"][number] | undefined {
  return ligne.virementAvec === null
    ? undefined
    : ligne.base.candidatsVirement.find((candidat) => candidat.id === ligne.virementAvec);
}

/** La sous-catégorie que la liaison retirera de l'autre côté, dite avant l'enregistrement ; null s'il n'y en a pas. */
export function messageAutreCote(ligne: LigneRevueEditee): string | null {
  const candidat = candidatChoisi(ligne);
  const nom = candidat?.sousCategorieNom ?? null;
  if (candidat === undefined || nom === null) {
    return null;
  }
  return `La sous-catégorie « ${nom} » de la ligne du ${candidat.date} (${candidat.compteNom}) sera retirée.`;
}

const MESSAGE_VIREMENT_PLUS_PROPOSE = "Le virement choisi n'est plus proposé pour cette ligne.";

/**
 * Pour toutes les lignes envoyées (action ≠ IGNORER) à virementAvec non nul : clé → message bloquant. Par ligne,
 * dans l'ordre : candidat absent de la proposition, puis (montant lisible) la liaison qui ne tient plus, puis la
 * cible déjà retenue par une ligne précédente.
 */
export function erreursVirementRevue(lignes: readonly LigneRevueEditee[]): ReadonlyMap<string, string> {
  const envoyees = lignes.filter((ligne) => ligne.action !== "IGNORER");
  const doublons = ciblesEnDouble(envoyees.map((ligne) => ({ cle: ligne.base.cle, virementAvec: ligne.virementAvec })));
  const erreurs = new Map<string, string>();

  for (const ligne of envoyees) {
    const candidat = candidatChoisi(ligne);
    if (ligne.virementAvec === null) {
      continue;
    }
    if (candidat === undefined) {
      erreurs.set(ligne.base.cle, MESSAGE_VIREMENT_PLUS_PROPOSE);
      continue;
    }
    const montantCents = parseMontant(ligne.montantSaisi);
    if (montantCents === null) {
      continue;
    }
    const refus = peutLier(
      {
        id: null,
        accountId: ligne.accountId,
        date: ligne.date,
        montantCents,
        parentId: null,
        estVentilee: ligne.ventilation !== null,
        transferTransactionId: null,
      },
      candidat,
    );
    if (refus !== null) {
      erreurs.set(ligne.base.cle, messageRefusLiaison(refus));
      continue;
    }
    const premiereCle = doublons.get(ligne.base.cle);
    if (premiereCle !== undefined) {
      const premiere = lignes.find((autre) => autre.base.cle === premiereCle);
      erreurs.set(
        ligne.base.cle,
        `Ce virement est déjà retenu pour ${premiere === undefined ? premiereCle : designerLigne(premiere)} : décoche-le sur l'une des deux lignes.`,
      );
    }
  }
  return erreurs;
}

export const MESSAGE_OCCURRENCE_PLUS_PROPOSEE = "L'échéance choisie n'est plus proposée pour cette ligne.";
export const MESSAGE_OCCURRENCE_AUTRE_COMPTE =
  "L'échéance choisie est celle du compte du relevé : remets ce compte sur la ligne, ou choisis « Ne pas lier ».";
export const MESSAGE_OCCURRENCE_PLUS_CANDIDATE =
  "La ligne ne correspond plus à l'échéance choisie (date, montant ou description modifiés) : choisis « Ne pas lier », ou rétablis la ligne.";

/** Le candidat de base.candidatsOccurrence que vise occurrenceAvec, ou undefined. */
export function candidatOccurrenceChoisi(
  ligne: LigneRevueEditee,
): CandidatOccurrence<OccurrenceCandidate> | undefined {
  return ligne.occurrenceAvec === null
    ? undefined
    : ligne.base.candidatsOccurrence.find((candidat) => candidat.occurrence.id === ligne.occurrenceAvec);
}

/** La valeur pré-remplie par l'analyse est restée telle quelle (docs/lot-m3.md §4.5). */
export function occurrenceAutoConservee(ligne: LigneRevueEditee): boolean {
  return ligne.base.occurrenceAvec !== null && ligne.occurrenceAvec === ligne.base.occurrenceAvec;
}

/** La sous-catégorie affichée est celle de la récurrence, et rien ne l'a remplacée depuis. */
export function categorieDeLaRecurrence(ligne: LigneRevueEditee): boolean {
  return (
    ligne.categorieHeritee &&
    ligne.virementAvec === null &&
    !ligne.slotsArbitres.includes("SOUS_CATEGORIE") &&
    ligne.subcategoryId !== null &&
    candidatOccurrenceChoisi(ligne)?.occurrence.subcategoryId === ligne.subcategoryId
  );
}

/** Choisir (ou retirer, null) l'échéance d'une ligne, avec l'héritage de §3.6 calculé AVANT le changement (CLAUDE.md §9). */
export function choisirOccurrence(
  ligne: LigneRevueEditee,
  occurrenceId: string | null,
): Pick<LigneRevueEditee, "occurrenceAvec" | "subcategoryId" | "categorieHeritee"> {
  const herite = categorieDeLaRecurrence(ligne);
  if (occurrenceId === null) {
    return { occurrenceAvec: null, subcategoryId: herite ? null : ligne.subcategoryId, categorieHeritee: false };
  }
  const candidat = ligne.base.candidatsOccurrence.find((c) => c.occurrence.id === occurrenceId);
  const sousCategorie = candidat?.occurrence.subcategoryId ?? null;
  const heritable =
    herite ||
    sousCategorieHeritable({
      subcategoryId: ligne.subcategoryId,
      ventilationPresente: ligne.ventilation !== null,
      virementAvec: ligne.virementAvec,
      conflits: ligne.base.conflits,
      slotsArbitres: ligne.slotsArbitres,
    });
  if (heritable && sousCategorie !== null) {
    return { occurrenceAvec: occurrenceId, subcategoryId: sousCategorie, categorieHeritee: true };
  }
  if (heritable) {
    return { occurrenceAvec: occurrenceId, subcategoryId: herite ? null : ligne.subcategoryId, categorieHeritee: false };
  }
  return { occurrenceAvec: occurrenceId, subcategoryId: ligne.subcategoryId, categorieHeritee: false };
}

/**
 * Pour les lignes envoyées (action IMPORTER) à occurrenceAvec non nul : clé → message bloquant. Par ligne, dans
 * l'ordre : candidat absent de la proposition, compte changé, liaison qui ne tient plus (montant lisible), puis
 * l'échéance déjà retenue par une ligne précédente.
 */
export function erreursOccurrenceRevue(lignes: readonly LigneRevueEditee[]): ReadonlyMap<string, string> {
  const envoyees = lignes.filter((ligne) => ligne.action === "IMPORTER");
  const doublons = occurrencesEnDouble(
    envoyees.map((ligne) => ({ cle: ligne.base.cle, occurrenceAvec: ligne.occurrenceAvec })),
  );
  const erreurs = new Map<string, string>();

  for (const ligne of envoyees) {
    if (ligne.occurrenceAvec === null) {
      continue;
    }
    const candidat = candidatOccurrenceChoisi(ligne);
    if (candidat === undefined) {
      erreurs.set(ligne.base.cle, MESSAGE_OCCURRENCE_PLUS_PROPOSEE);
      continue;
    }
    if (ligne.accountId !== ligne.base.accountId) {
      erreurs.set(ligne.base.cle, MESSAGE_OCCURRENCE_AUTRE_COMPTE);
      continue;
    }
    const montantCents = parseMontant(ligne.montantSaisi);
    if (
      montantCents !== null &&
      candidatsOccurrence(
        { date: ligne.date, montantCents, descriptionNormalisee: normaliserDescription(ligne.description) },
        [candidat.occurrence],
      ).length !== 1
    ) {
      erreurs.set(ligne.base.cle, MESSAGE_OCCURRENCE_PLUS_CANDIDATE);
      continue;
    }
    const premiereCle = doublons.get(ligne.base.cle);
    if (premiereCle !== undefined) {
      const premiere = lignes.find((autre) => autre.base.cle === premiereCle);
      erreurs.set(
        ligne.base.cle,
        `Cette échéance est déjà retenue pour ${premiere === undefined ? premiereCle : designerLigne(premiere)} : choisis « Ne pas lier » sur l'une des deux lignes.`,
      );
    }
  }
  return erreurs;
}

/** null si la sous-catégorie n'est pas celle de la récurrence. */
export function messageCategorieRecurrence(
  ligne: LigneRevueEditee,
  nomsSousCategories: ReadonlyMap<string, string>,
): string | null {
  if (!categorieDeLaRecurrence(ligne) || ligne.subcategoryId === null) {
    return null;
  }
  return `Sous-catégorie « ${nomsSousCategories.get(ligne.subcategoryId) ?? ligne.subcategoryId} » : catégorie de la récurrence.`;
}

/** La ligne en regard d'un doublon, en clair ; null sans doublonDe. Un virement déjà enregistré le dit. */
export function libelleReferenceDoublon(ligne: LigneRevueEditee): string | null {
  const reference = ligne.base.doublonDe;
  if (reference === null) {
    return null;
  }
  if (ligne.base.statutDoublon === "VIREMENT_EXISTANT" && reference.virement !== null) {
    return `Déjà enregistrée comme virement ${reference.montantCents > 0 ? "depuis" : "vers"} ${reference.virement.compteNom}, le ${reference.date} — ${reference.description}`;
  }
  return `Transaction existante : ${reference.date} — ${reference.description}`;
}

/** Désigne une ligne pour un message global : numéro dans le relevé et description. */
export function designerLigne(ligne: LigneRevueEditee): string {
  const numero = ligne.base.numeroLigne;
  return numero === null ? `« ${ligne.description} »` : `ligne ${numero} du relevé (« ${ligne.description} »)`;
}

export interface CompteursRevue {
  readonly aImporter: number;
  readonly aMettreAJour: number;
  readonly ignoreesDoublon: number;
  readonly filtrees: number;
  readonly nonReconnues: number;
  readonly conflitsNonTranches: number;
  /** Lignes IMPORTER qui seront liées en virement. */
  readonly virements: number;
  /** Lignes IMPORTER qui seront liées à une échéance récurrente. */
  readonly rapprochements: number;
}

export function compter(lignes: readonly LigneRevueEditee[], nbRejetees: number): CompteursRevue {
  let virements = 0;
  let rapprochements = 0;
  let aImporter = 0;
  let aMettreAJour = 0;
  let ignoreesDoublon = 0;
  let filtrees = 0;
  let conflitsNonTranches = 0;

  for (const ligne of lignes) {
    // Le compteur reflète ce qui sera réellement écarté à l'enregistrement,
    // pas la section d'origine : une ligne filtrée réintégrée (action
    // IMPORTER) reste affichée dans « Filtrées » (§4.5, la section ne change
    // jamais) mais ne doit plus compter parmi les lignes qui seront ignorées.
    if (ligne.base.section === "FILTREES" && ligne.action === "IGNORER") {
      filtrees += 1;
    } else if (ligne.base.section === "DOUBLONS" && ligne.action === "IGNORER") {
      ignoreesDoublon += 1;
    }

    if (ligne.action === "IMPORTER") {
      aImporter += 1;
      if (ligne.virementAvec !== null) {
        virements += 1;
      }
      if (ligne.occurrenceAvec !== null) {
        rapprochements += 1;
      }
    } else if (ligne.action === "METTRE_A_JOUR") {
      aMettreAJour += 1;
    }

    if (conflitNonTrancheSurLigne(ligne)) {
      conflitsNonTranches += 1;
    }
  }

  return {
    aImporter,
    aMettreAJour,
    ignoreesDoublon,
    filtrees,
    nonReconnues: nbRejetees,
    conflitsNonTranches,
    virements,
    rapprochements,
  };
}

export interface EnteteSection {
  /** Lignes affichées dans la section — la section d'une ligne ne change jamais (journal 2026-09-19). */
  readonly compte: number;
  /** Ce que les gestes de l'utilisateur ont changé dans la section ; null si rien. */
  readonly detail: string | null;
}

export interface EntetesRevue {
  readonly aImporter: EnteteSection;
  readonly doublons: EnteteSection;
  readonly filtrees: EnteteSection;
  readonly nonReconnues: EnteteSection;
}

/** Une ligne dont l'action initiale était IGNORER et que l'utilisateur a réintégrée. */
function reintegree(ligne: LigneRevueEditee): boolean {
  return ligne.base.action === "IGNORER" && ligne.action !== "IGNORER";
}

/** Lignes d'une autre section que À importer, réintégrées par l'utilisateur (base.action IGNORER, action ≠ IGNORER). */
export function nbReintegreesAilleurs(lignes: readonly LigneRevueEditee[]): number {
  return lignes.filter((ligne) => ligne.base.section !== "A_IMPORTER" && reintegree(ligne)).length;
}

/**
 * Les en-têtes de section : une ligne issue de l'analyse reste affichée dans sa
 * section d'origine (`base.section` est stable) ; une ligne non reconnue
 * récupérée reste affichée dans Non reconnues (détail « récupérée » ou « récupérées »). Le
 * compte d'une section ne bouge que par l'ajout de la nouvelle ligne que produit
 * la saisie à la main, rangée dans la section que le pipeline lui attribue. Le
 * détail dit ce que les gestes de l'utilisateur ont changé, relativement à
 * l'action initiale `base.action` ; une ligne réintégrée d'une autre section
 * apparaît dans le détail d'À importer, pas dans son compte.
 */
export function entetesSections(
  lignes: readonly LigneRevueEditee[],
  nbRejetees: number,
  nbRecuperees: number,
): EntetesRevue {
  const ecartee = (ligne: LigneRevueEditee): boolean => ligne.base.action !== "IGNORER" && ligne.action === "IGNORER";

  const aImporter = lignes.filter((ligne) => ligne.base.section === "A_IMPORTER");
  const doublons = lignes.filter((ligne) => ligne.base.section === "DOUBLONS");
  const filtrees = lignes.filter((ligne) => ligne.base.section === "FILTREES");

  const reintegreesAilleurs = nbReintegreesAilleurs(lignes);
  const doublonsReintegres = doublons.filter(reintegree).length;
  const doublonsEcartes = doublons.filter(ecartee).length;
  const filtreesReintegrees = filtrees.filter(reintegree).length;

  const detailDoublons: string[] = [];
  if (doublonsReintegres > 0) {
    detailDoublons.push(accorder(doublonsReintegres, "réintégrée", "réintégrées"));
  }
  if (doublonsEcartes > 0) {
    detailDoublons.push(accorder(doublonsEcartes, "écartée", "écartées"));
  }

  return {
    aImporter: {
      compte: aImporter.length,
      detail:
        reintegreesAilleurs > 0
          ? `+ ${accorder(reintegreesAilleurs, "réintégrée", "réintégrées")} d'une autre section`
          : null,
    },
    doublons: { compte: doublons.length, detail: detailDoublons.length > 0 ? detailDoublons.join(" · ") : null },
    filtrees: {
      compte: filtrees.length,
      detail: filtreesReintegrees > 0 ? accorder(filtreesReintegrees, "réintégrée", "réintégrées") : null,
    },
    nonReconnues: {
      compte: nbRejetees,
      detail: nbRecuperees > 0 ? accorder(nbRecuperees, "récupérée", "récupérées") : null,
    },
  };
}
