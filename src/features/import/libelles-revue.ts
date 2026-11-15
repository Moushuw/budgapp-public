// Les libellés chiffrés de la revue d'import — pur, sans React. Un nombre s'accorde en toutes lettres : 0 et 1 au
// singulier, 2 et plus au pluriel (docs/lot-m2.md §10.2 point 6), jamais une marque de pluriel entre parenthèses.

import type { DateCivile } from "@/domain/dates";
import { jourEtMois } from "@/domain/recurrence";
import type { CompteursRevue } from "./etat-revue";

/** `${n} ${singulier}` pour 0 et 1, `${n} ${pluriel}` à partir de 2. */
export function accorder(n: number, singulier: string, pluriel: string): string {
  return `${String(n)} ${n >= 2 ? pluriel : singulier}`;
}

export interface LigneRecapitulatif {
  readonly cle: string;
  readonly texte: string;
  /** Affichée en text-destructive. */
  readonly alerte: boolean;
}

function ligneRecapitulatif(cle: string, texte: string, alerte = false): LigneRecapitulatif {
  return { cle, texte, alerte };
}

export function messageConflitsNonTranches(n: number): string {
  return `${n >= 2 ? `${String(n)} lignes portent` : `${String(n)} ligne porte`} un conflit de règles non tranché.`;
}

export function messageReglesInapplicables(n: number): string {
  return `${n >= 2 ? `${String(n)} règles n'ont` : `${String(n)} règle n'a`} pas pu être évaluée${n >= 2 ? "s" : ""} : configuration invalide.`;
}

/** Le message de la section À importer quand elle n'a aucune ligne (n = lignes réintégrées d'autres sections). */
export function messageAImporterVide(nbReintegreesAilleurs: number): string {
  if (nbReintegreesAilleurs === 0) {
    return "Aucune ligne à importer.";
  }
  const verbe = nbReintegreesAilleurs >= 2 ? "seront" : "sera";
  return `Aucune ligne dans cette section : ${accorder(nbReintegreesAilleurs, "ligne réintégrée", "lignes réintégrées")} d'une autre section ${verbe} importée${nbReintegreesAilleurs >= 2 ? "s" : ""}.`;
}

export function recapitulatifAvant(compteurs: CompteursRevue): readonly LigneRecapitulatif[] {
  const lignes: LigneRecapitulatif[] = [
    ligneRecapitulatif("aImporter", `${accorder(compteurs.aImporter, "ligne", "lignes")} à importer.`),
    ligneRecapitulatif("aMettreAJour", `${accorder(compteurs.aMettreAJour, "ligne", "lignes")} à mettre à jour.`),
    ligneRecapitulatif(
      "ignoreesDoublon",
      `${accorder(compteurs.ignoreesDoublon, "ligne ignorée", "lignes ignorées")} comme ${compteurs.ignoreesDoublon >= 2 ? "doublons" : "doublon"}.`,
    ),
    ligneRecapitulatif(
      "filtrees",
      `${accorder(compteurs.filtrees, "ligne filtrée", "lignes filtrées")}, ${compteurs.filtrees >= 2 ? "non importées" : "non importée"}.`,
    ),
    ligneRecapitulatif("nonReconnues", `${accorder(compteurs.nonReconnues, "ligne non reconnue", "lignes non reconnues")}.`),
  ];
  if (compteurs.virements > 0) {
    lignes.push(
      ligneRecapitulatif(
        "virements",
        `${accorder(compteurs.virements, "ligne", "lignes")} ${compteurs.virements >= 2 ? "seront liées" : "sera liée"} en virement.`,
      ),
    );
  }
  if (compteurs.rapprochements > 0) {
    lignes.push(
      ligneRecapitulatif(
        "rapprochements",
        `${accorder(compteurs.rapprochements, "ligne", "lignes")} ${compteurs.rapprochements >= 2 ? "seront liées" : "sera liée"} à une échéance récurrente.`,
      ),
    );
  }
  if (compteurs.conflitsNonTranches > 0) {
    lignes.push(ligneRecapitulatif("conflits", messageConflitsNonTranches(compteurs.conflitsNonTranches), true));
  }
  return lignes;
}

/** Le sous-ensemble de RecapImport que l'écran affiche (structurel : RecapImport y est assignable). */
export interface ChiffresEnregistrement {
  readonly importees: number;
  readonly misesAJour: number;
  readonly beneficiairesCrees: number;
  readonly etiquettesPosees: number;
  readonly virementsLies: number;
  readonly occurrencesLiees: number;
  readonly couvreDu: DateCivile | null;
  readonly couvreAu: DateCivile | null;
}

export function recapitulatifApres(chiffres: ChiffresEnregistrement): readonly LigneRecapitulatif[] {
  const lignes: LigneRecapitulatif[] = [
    ligneRecapitulatif("importees", `${accorder(chiffres.importees, "transaction importée", "transactions importées")}.`),
    ligneRecapitulatif(
      "misesAJour",
      `${accorder(chiffres.misesAJour, "transaction mise à jour", "transactions mises à jour")}.`,
    ),
    ligneRecapitulatif(
      "beneficiairesCrees",
      `${accorder(chiffres.beneficiairesCrees, "bénéficiaire créé", "bénéficiaires créés")}.`,
    ),
    ligneRecapitulatif(
      "etiquettesPosees",
      `${accorder(chiffres.etiquettesPosees, "étiquette posée", "étiquettes posées")}.`,
    ),
  ];
  if (chiffres.virementsLies > 0) {
    lignes.push(
      ligneRecapitulatif("virementsLies", `${accorder(chiffres.virementsLies, "virement lié", "virements liés")}.`),
    );
  }
  if (chiffres.occurrencesLiees > 0) {
    lignes.push(
      ligneRecapitulatif(
        "occurrencesLiees",
        `${accorder(chiffres.occurrencesLiees, "paiement lié à son échéance", "paiements liés à leur échéance")}.`,
      ),
    );
  }
  if (chiffres.couvreDu !== null && chiffres.couvreAu !== null) {
    lignes.push(ligneRecapitulatif("periode", `Période couverte : ${chiffres.couvreDu} → ${chiffres.couvreAu}.`));
  }
  return lignes;
}

/** Message d'une action d'enregistrement : des lignes visaient une transaction supprimée entre-temps. */
export function messageTransactionsIntrouvables(n: number): string {
  return `${accorder(n, "ligne visait", "lignes visaient")} une transaction qui n'existe plus.`;
}

export interface OccurrenceEnConflitAffichee {
  readonly date: DateCivile;
  readonly description: string;
  readonly motif: "INTROUVABLE" | "AUTRE_COMPTE" | "PRISE" | "PLUS_CANDIDATE" | "LIEE_ENTRE_TEMPS";
  readonly libelle: string | null;
  readonly echeance: DateCivile | null;
}

function fragmentOccurrenceEnConflit(ligne: OccurrenceEnConflitAffichee): string {
  const { libelle, echeance, date, description } = ligne;
  if (ligne.motif === "INTROUVABLE" || libelle === null || echeance === null) {
    return `l'échéance proposée pour la ligne du ${date} (${description}) n'existe plus`;
  }
  const nommee = `${libelle} du ${jourEtMois(echeance)}`;
  switch (ligne.motif) {
    case "PRISE":
    case "LIEE_ENTRE_TEMPS":
      return `le paiement ${nommee} vient d'être lié ailleurs`;
    case "AUTRE_COMPTE":
      return `l'échéance ${nommee} n'est pas du compte de la ligne du ${date}`;
    case "PLUS_CANDIDATE":
      return `l'échéance ${nommee} ne correspond plus à la ligne du ${date}`;
  }
}

const LIMITE_FRAGMENTS_CONFLIT = 5;

/** Message d'une action d'enregistrement : des échéances visées ne conviennent plus (docs/lot-m3.md §4.5). */
export function messageOccurrencesEnConflit(lignes: readonly OccurrenceEnConflitAffichee[]): string {
  const fragments = lignes.slice(0, LIMITE_FRAGMENTS_CONFLIT).map(fragmentOccurrenceEnConflit);
  const reste = lignes.length - LIMITE_FRAGMENTS_CONFLIT;
  const suite = reste > 0 ? ` ; et ${accorder(reste, "autre", "autres")}` : "";
  return `Rien n'a été enregistré : ${fragments.join(" ; ")}${suite}.`;
}

export function messageOccurrencesTronquees(limite: number): string {
  return `Plus de ${String(limite)} échéances attendues sur la période du relevé : seules les ${String(limite)} premières ont été comparées aux lignes. Importe le relevé en plusieurs fois.`;
}

/** Message d'une action d'enregistrement : des lignes sont déjà en base. `detail` est la liste déjà formatée. */
export function messageEmpreintesEnDouble(n: number, detail: string): string {
  return `${accorder(n, "ligne est déjà en base", "lignes sont déjà en base")} (ou en double dans ce lot) : ${detail}. Rien n'a été enregistré.`;
}
