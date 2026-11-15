// Les cinq explications probables d'un écart de solde, dans un ordre constant —
// docs/modele-ingestion-recurrences.md §5.2 ; docs/lot-m3.md §5.3.

import type { DateCivile } from "../dates";
import { TOLERANCE_QUASI_DOUBLON_JOURS } from "../ingestion/types";
import { formatMontant } from "../money";
import { jourEtMois } from "../recurrence/libelles";
import { LIMITE_DOUBLONS_DIAGNOSTIC, LIMITE_LIGNES_MONTANT_DIAGNOSTIC } from "./constantes";
import { dateLisible } from "./libelles";
import type {
  ContexteDiagnostic,
  Explication,
  LigneMontantErrone,
  MotifMontantErrone,
  TransactionDiagnostic,
} from "./types";

function fmt(c: number): string {
  return formatMontant(c, "CENTS");
}

function periodeNonCouverte(c: ContexteDiagnostic): Explication {
  const a = c.dateAncrage;
  const derniere = c.dateDerniereTransaction;
  const imports = c.finCouvertureImports;
  const fin = [derniere, imports].reduce<DateCivile | null>(
    (max, d) => (d !== null && (max === null || d > max) ? d : max),
    null,
  );
  if (fin === null) {
    return {
      nature: "PERIODE_NON_COUVERTE",
      constat: "PISTE",
      message: "Aucune transaction ni aucun import sur ce compte : rien ne couvre la période jusqu'à l'ancrage.",
    };
  }
  if (fin >= a) {
    return { nature: "PERIODE_NON_COUVERTE", constat: "RIEN", message: "Couverture complète jusqu'à l'ancrage." };
  }
  if (imports !== null && imports >= (derniere ?? "")) {
    return {
      nature: "PERIODE_NON_COUVERTE",
      constat: "PISTE",
      message: `Le dernier import s'arrête au ${dateLisible(imports, a)} ; l'ancrage est daté du ${jourEtMois(a)}. Il manque probablement des transactions.`,
    };
  }
  return {
    nature: "PERIODE_NON_COUVERTE",
    constat: "PISTE",
    message: `La transaction la plus récente du compte date du ${dateLisible(derniere ?? "", a)} ; l'ancrage est daté du ${jourEtMois(a)}. Il manque probablement des transactions.`,
  };
}

function enAttente(c: ContexteDiagnostic): Explication {
  const { nombre: n, sommeCents: s } = c.enAttente;
  if (n === 0) {
    return { nature: "EN_ATTENTE", constat: "RIEN", message: "Aucune transaction en attente.", nombre: n, sommeCents: s };
  }
  const message =
    n === 1
      ? `1 transaction en attente, de ${fmt(s)}, est comptée dans le solde calculé : la banque ne l'a peut-être pas encore portée au solde déclaré.`
      : `${n} transactions en attente, pour un total de ${fmt(s)}, sont comptées dans le solde calculé : la banque ne les a peut-être pas encore portées au solde déclaré.`;
  return { nature: "EN_ATTENTE", constat: "PISTE", message, nombre: n, sommeCents: s };
}

function doublons(c: ContexteDiagnostic, portee: string): Explication {
  const paires = c.quasiDoublons;
  const tronquee = c.quasiDoublonsTronques;
  const k = paires.length;
  const T = TOLERANCE_QUASI_DOUBLON_JOURS;
  if (k === 0) {
    return { nature: "DOUBLON", constat: "RIEN", message: `Aucun doublon possible ${portee}.`, paires, tronquee };
  }
  let message: string;
  if (tronquee) {
    message = `Plus de ${LIMITE_DOUBLONS_DIAGNOSTIC} paires de transactions identiques (même montant, même description, à ${T} jours ou moins d'écart) ${portee} : seules les ${LIMITE_DOUBLONS_DIAGNOSTIC} premières sont affichées.`;
  } else if (k === 1) {
    message = `1 paire de transactions identiques (même montant, même description, à ${T} jours ou moins d'écart) ${portee} : l'une est peut-être comptée deux fois.`;
  } else {
    message = `${k} paires de transactions identiques (même montant, même description, à ${T} jours ou moins d'écart) ${portee} : l'une de chaque paire est peut-être comptée deux fois.`;
  }
  return { nature: "DOUBLON", constat: "PISTE", message, paires, tronquee };
}

function ligneMontant(t: TransactionDiagnostic, ecartCourantCents: number, a: DateCivile): LigneMontantErrone | null {
  const manuelle = t.source === "MANUELLE";
  const egale = ecartCourantCents !== 0 && Math.abs(t.montantCents) === Math.abs(ecartCourantCents);
  if (!manuelle && !egale) return null;
  const motif: MotifMontantErrone = manuelle && egale ? "LES_DEUX" : manuelle ? "MANUELLE" : "MONTANT_EGAL_ECART";
  const date = dateLisible(t.date, a);
  const message =
    motif === "MONTANT_EGAL_ECART"
      ? `Une transaction de ${fmt(Math.abs(t.montantCents))} le ${date} : comptée en trop ou manquante ?`
      : motif === "LES_DEUX"
        ? `Une transaction de ${fmt(Math.abs(t.montantCents))} le ${date}, saisie à la main : comptée en trop ou manquante ?`
        : `Saisie à la main : ${t.description}, ${fmt(t.montantCents)} le ${date}.`;
  return { transaction: t, motif, message };
}

function comparerLignes(x: LigneMontantErrone, y: LigneMontantErrone): number {
  if (x.transaction.date !== y.transaction.date) return x.transaction.date < y.transaction.date ? 1 : -1;
  if (x.transaction.id === y.transaction.id) return 0;
  return x.transaction.id < y.transaction.id ? -1 : 1;
}

function montantErrone(c: ContexteDiagnostic, portee: string): Explication {
  const lignes = c.transactionsAVerifier
    .map((t) => ligneMontant(t, c.ecartCourantCents, c.dateAncrage))
    .filter((l): l is LigneMontantErrone => l !== null)
    .sort(comparerLignes);
  const tronquee = c.transactionsAVerifierTronquees;
  if (lignes.length === 0) {
    return {
      nature: "MONTANT_ERRONE",
      constat: "RIEN",
      message: `Aucune transaction saisie à la main ni aucune transaction du montant de l'écart ${portee}.`,
      lignes,
      tronquee,
    };
  }
  const message = tronquee
    ? `Plus de ${LIMITE_LIGNES_MONTANT_DIAGNOSTIC} transactions à vérifier ${portee} : seules les ${LIMITE_LIGNES_MONTANT_DIAGNOSTIC} premières sont affichées.`
    : lignes.length === 1
      ? `1 transaction à vérifier ${portee}.`
      : `${lignes.length} transactions à vérifier ${portee}.`;
  return { nature: "MONTANT_ERRONE", constat: "PISTE", message, lignes, tronquee };
}

/** §5.3 : cinq entrées, toujours dans ORDRE_EXPLICATIONS. Pure : ne filtre que ce qui est décrit ici. */
export function explicationsProbables(contexte: ContexteDiagnostic): readonly Explication[] {
  const portee =
    contexte.dateAncragePrecedent === null ? "jusqu'à cet ancrage" : "entre l'ancrage précédent et celui-ci";
  return [
    periodeNonCouverte(contexte),
    enAttente(contexte),
    doublons(contexte, portee),
    {
      nature: "LIGNE_NON_RECONNUE",
      constat: "RAPPEL",
      message:
        "Une ligne écartée à l'import a peut-être été oubliée : vérifie la section Non reconnues lors du prochain import.",
    },
    montantErrone(contexte, portee),
  ];
}
