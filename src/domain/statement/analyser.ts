// analyserReleve — docs/lot-m1.md §5.3 et §5.4.
//
// Ne lève jamais : toute anomalie sort typée dans `rejetees`. En particulier,
// une date invalide (« 31 février ») est vérifiée avec `estDateCivile()`, qui
// ne lève pas — jamais `dateCivile()`, qui lève sur une combinaison inexistante.

import type { Cents } from "../money";
import { parseMontant } from "../money";
import type { DateCivile } from "../dates";
import { estDateCivile } from "../dates";
import { decouperEtNettoyer } from "./nettoyage";
import { separerOperation } from "./operation";
import type {
  LigneReconnue,
  LigneRejetee,
  ProfilImport,
  RaisonRejet,
  RegleSigne,
  ResultatAnalyse,
} from "./types";

interface Segment {
  readonly index: number;
  readonly longueur: number;
}

// Détecteur générique de « ça ressemble à une date, mais son mois est
// incompréhensible ». Le motif d'un profil ne peut jamais produire lui-même
// un mois inconnu puisqu'il énumère les mois valides : ce détecteur permet
// donc de distinguer AUCUNE_DATE de MOIS_INCONNU quand le motif du profil ne
// correspond pas (docs/lot-m1.md §5.4). Le lookahead
// `(?=\s|$)` évite que les en-têtes de bloc du type « 31 AOÛ31 Août », où le
// nom de mois est collé à un chiffre, ne soient pris pour un candidat.
const CANDIDAT_DATE = /^(\d{1,2})\s+([A-Za-zÀ-ÖØ-öø-ÿ]+)(?=\s|$)/;

// Détecteur générique de « ça ressemble à un montant, mais on n'a pas su le
// lire » (ex. `+38,60 $CAD`, où le `$` est collé à `CAD`).
const CANDIDAT_MONTANT = /\$|\d[.,]\d/;

interface DateReconnue {
  readonly date: DateCivile;
  readonly segment: Segment;
}
interface EchecDate {
  readonly raison: "AUCUNE_DATE" | "MOIS_INCONNU";
}

function resoudreIndexMois(nomMois: string, mois: readonly string[]): number | null {
  const cible = nomMois.toLowerCase();
  const index = mois.findIndex((candidat) => candidat.toLowerCase() === cible);
  return index === -1 ? null : index;
}

function analyserDate(ligne: string, profil: ProfilImport, annee: number): DateReconnue | EchecDate {
  const correspondance = profil.date.motif.exec(ligne);

  if (correspondance) {
    const jourTexte = correspondance[1];
    const moisTexte = correspondance[2];
    if (jourTexte === undefined || moisTexte === undefined) {
      return { raison: "AUCUNE_DATE" };
    }

    const indexMois = resoudreIndexMois(moisTexte, profil.date.mois);
    if (indexMois === null) {
      return { raison: "MOIS_INCONNU" };
    }

    let anneeResolue: number;
    if (profil.date.anneeDansLaLigne) {
      const anneeTexte = correspondance[3];
      if (anneeTexte === undefined || !/^\d+$/.test(anneeTexte)) {
        return { raison: "AUCUNE_DATE" };
      }
      anneeResolue = Number(anneeTexte);
    } else {
      anneeResolue = annee;
    }

    // correspondance[0] (le texte complet) est toujours défini par les types
    // de la bibliothèque standard, contrairement aux groupes de capture.
    const texteComplet = correspondance[0];

    const jour = String(Number(jourTexte)).padStart(2, "0");
    const mois = String(indexMois + 1).padStart(2, "0");
    const dateTexte = `${String(anneeResolue).padStart(4, "0")}-${mois}-${jour}`;

    if (!estDateCivile(dateTexte)) {
      return { raison: "AUCUNE_DATE" };
    }

    return {
      date: dateTexte,
      segment: { index: correspondance.index, longueur: texteComplet.length },
    };
  }

  const candidat = CANDIDAT_DATE.exec(ligne);
  if (candidat) {
    const moisTexte = candidat[2];
    if (moisTexte !== undefined && resoudreIndexMois(moisTexte, profil.date.mois) === null) {
      return { raison: "MOIS_INCONNU" };
    }
  }

  return { raison: "AUCUNE_DATE" };
}

interface MontantReconnu {
  readonly valeurAbsolue: Cents;
  readonly signeExplicite: "+" | "−" | "-" | null;
  readonly segment: Segment;
}
interface EchecMontant {
  readonly raison: "AUCUN_MONTANT" | "MONTANT_ILLISIBLE";
}

function analyserMontant(ligne: string, profil: ProfilImport): MontantReconnu | EchecMontant {
  const correspondance = profil.montant.motif.exec(ligne);

  if (!correspondance) {
    return CANDIDAT_MONTANT.test(ligne) ? { raison: "MONTANT_ILLISIBLE" } : { raison: "AUCUN_MONTANT" };
  }

  const texteComplet = correspondance[0];
  const valeur = parseMontant(texteComplet);
  if (valeur === null) {
    return { raison: "MONTANT_ILLISIBLE" };
  }

  const signeMatch = /^\s*([+−-])/.exec(texteComplet);
  const signeLu = signeMatch?.[1];
  const signeExplicite =
    signeLu === "+" || signeLu === "−" || signeLu === "-" ? signeLu : null;

  return {
    valeurAbsolue: Math.abs(valeur),
    signeExplicite,
    segment: { index: correspondance.index, longueur: texteComplet.length },
  };
}

function determinerSigne(signeExplicite: "+" | "−" | "-" | null, regleSigne: RegleSigne): 1 | -1 {
  if (regleSigne === "PLUS_EXPLICITE") {
    return signeExplicite === "+" ? 1 : -1;
  }
  return signeExplicite === "−" || signeExplicite === "-" ? -1 : 1;
}

/** `-1 * 0` vaut `-0` en JavaScript : un montant nul est toujours `0`. */
function appliquerSigne(signe: 1 | -1, valeurAbsolue: Cents): Cents {
  return valeurAbsolue === 0 ? 0 : signe * valeurAbsolue;
}

/** Retire les segments de la ligne, du plus haut index au plus bas, pour ne jamais décaler un index déjà consommé. */
function retirerSegments(ligne: string, segments: readonly Segment[]): string {
  const parIndexDecroissant = [...segments].sort((a, b) => b.index - a.index);

  let resultat = ligne;
  for (const segment of parIndexDecroissant) {
    resultat = resultat.slice(0, segment.index) + resultat.slice(segment.index + segment.longueur);
  }

  return resultat.replace(/\s+/g, " ").trim();
}

/** Montant signé du premier motif de montant du profil trouvé dans `texte`, signe selon profil.regleSigne ; null si aucun montant lisible. Ne lève jamais. */
export function lireMontant(texte: string, profil: ProfilImport): Cents | null {
  const resultat = analyserMontant(texte, profil);
  if ("raison" in resultat) {
    return null;
  }
  return appliquerSigne(determinerSigne(resultat.signeExplicite, profil.regleSigne), resultat.valeurAbsolue);
}

export function analyserReleve(texte: string, profil: ProfilImport, annee: number): ResultatAnalyse {
  const reconnues: LigneReconnue[] = [];
  const rejetees: LigneRejetee[] = [];

  const fragments = decouperEtNettoyer(texte, profil.nettoyage);

  for (const fragment of fragments) {
    const resultatDate = analyserDate(fragment.texte, profil, annee);
    if ("raison" in resultatDate) {
      rejeter(rejetees, fragment.numeroLigne, fragment.texte, resultatDate.raison);
      continue;
    }

    const resultatMontant = analyserMontant(fragment.texte, profil);
    if ("raison" in resultatMontant) {
      rejeter(rejetees, fragment.numeroLigne, fragment.texte, resultatMontant.raison);
      continue;
    }

    const signe = determinerSigne(resultatMontant.signeExplicite, profil.regleSigne);
    const montantCents: Cents = appliquerSigne(signe, resultatMontant.valeurAbsolue);
    const descriptionComplete = retirerSegments(fragment.texte, [resultatDate.segment, resultatMontant.segment]);
    const { typeOperation, description } = separerOperation(descriptionComplete, profil.operation);

    reconnues.push({
      numeroLigne: fragment.numeroLigne,
      ligneBrute: fragment.texte,
      date: resultatDate.date,
      typeOperation,
      description,
      montantCents,
    });
  }

  return { reconnues, rejetees };
}

function rejeter(rejetees: LigneRejetee[], numeroLigne: number, ligneBrute: string, raison: RaisonRejet): void {
  rejetees.push({ numeroLigne, ligneBrute, raison });
}
