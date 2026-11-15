// Libellés français de l'écran des récurrences — purs, sans React.
// docs/lot-m3.md §4.6 et §4.7.

import type { Cadence, DateCivile } from "@/domain/dates";
import { formatMontant } from "@/domain/money";
import {
  libelleCadence,
  LIMITE_GROUPES_DETECTION,
  type CompteRenduLiaisonRetroactive,
  type PartVentilationRecurrente,
  type SerieAffichee,
} from "@/domain/recurrence";
import { accorder } from "@/features/import/libelles-revue";
import type { ResultatRecherche } from "@/server/actions/recurrences";

export const AVERTISSEMENT_MODIFICATION =
  "Les échéances à venir encore ouvertes seront recréées selon ces valeurs, montant compris ; les échéances liées, ignorées ou passées ne bougent pas.";
export const LIBELLE_AUCUNE_RECURRENCE = "Aucune récurrence";

const FORMAT_POUR_CENT = new Intl.NumberFormat("fr-CA", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** libelleCadence avec la majuscule initiale : « Tous les mois ». */
export function libelleOptionCadence(c: Cadence): string {
  const libelle = libelleCadence(c);
  return libelle.charAt(0).toLocaleUpperCase("fr-CA") + libelle.slice(1);
}

export function libelleMontantSerie(s: Pick<SerieAffichee, "nature" | "montantCents">): string {
  if (s.montantCents === null) {
    return "—";
  }
  const montant = formatMontant(s.montantCents, "CENTS");
  return s.nature === "VARIABLE" ? `≈ ${montant}` : montant;
}

function valeurPart(part: PartVentilationRecurrente): string {
  if (part.partMille !== null) {
    return `${FORMAT_POUR_CENT.format(part.partMille / 10)} %`;
  }
  if (part.montantCents !== null) {
    return formatMontant(part.montantCents, "CENTS");
  }
  return "—";
}

export function libelleVentilationSerie(parts: readonly PartVentilationRecurrente[]): string | null {
  if (parts.length === 0) {
    return null;
  }
  const textes = parts.map((p) => `${p.libelle ?? p.sousCategorieNom ?? "Sans sous-catégorie"} ${valeurPart(p)}`);
  return `Ventilation : ${textes.join(" · ")}`;
}

export function lignesCompteRenduConfirmation(c: CompteRenduLiaisonRetroactive): {
  readonly titre: string;
  readonly details: readonly string[];
} {
  const details: string[] = [];
  const sans = c.sansEcheance.length;
  if (sans > 0) {
    const liste = c.sansEcheance.map((t) => `le ${t.date}, ${formatMontant(t.montantCents, "CENTS")}`).join(" ; ");
    details.push(
      `${accorder(
        sans,
        "transaction sans échéance correspondante n'a pas été liée",
        "transactions sans échéance correspondante n'ont pas été liées",
      )} : ${liste}.`,
    );
  }
  if (c.indisponibles > 0) {
    details.push(
      `${accorder(
        c.indisponibles,
        "transaction du groupe, supprimée ou liée ailleurs entre-temps, n'a pas été reprise",
        "transactions du groupe, supprimées ou liées ailleurs entre-temps, n'ont pas été reprises",
      )}.`,
    );
  }
  if (c.echeancesPasseesSansPaiement > 0) {
    const k = c.echeancesPasseesSansPaiement;
    details.push(
      `${accorder(k, "échéance passée sans paiement", "échéances passées sans paiement")} : ${k >= 2 ? "elles apparaissent" : "elle apparaît"} dans les paiements attendus non vus.`,
    );
  }
  return {
    titre: `Récurrence ${c.libelle} créée : ${accorder(c.paiementsLies, "paiement lié", "paiements liés")}.`,
    details,
  };
}

export function libelleRecherche(r: Pick<ResultatRecherche, "nbSuggestions" | "limiteAtteinte">): string {
  const base = `Recherche terminée : ${accorder(r.nbSuggestions, "suggestion", "suggestions")}.`;
  return r.limiteAtteinte
    ? `${base} La recherche s'est limitée aux ${String(LIMITE_GROUPES_DETECTION)} groupes les plus fréquents.`
    : base;
}

export function libelleCreation(r: {
  readonly libelle: string;
  readonly toleranceJours: number;
  readonly transaction: null | { readonly date: DateCivile; readonly echeance: DateCivile | null };
}): { readonly titre: string; readonly details: readonly string[] } {
  const titre = `Récurrence ${r.libelle} créée.`;
  if (r.transaction === null) {
    return { titre, details: [] };
  }
  const { date, echeance } = r.transaction;
  return {
    titre,
    details: [
      echeance === null
        ? `La transaction du ${date} n'a pas été liée : aucune échéance à ${String(r.toleranceJours)} jours ou moins de sa date.`
        : `La transaction du ${date} est liée à l'échéance du ${echeance}.`,
    ],
  };
}

export function libelleModification(echeancesCreees: number): string {
  return `Récurrence modifiée : ${accorder(echeancesCreees, "échéance à venir recréée", "échéances à venir recréées")}.`;
}

export function libelleTerminaison(echeancesRetirees: number, dontIgnorees: number): string {
  const ignorees = dontIgnorees > 0 ? ` dont ${accorder(dontIgnorees, "ignorée", "ignorées")}` : "";
  return `Série terminée : ${accorder(echeancesRetirees, "échéance à venir retirée", "échéances à venir retirées")}${ignorees}.`;
}

export function consequenceSuppressionSerie(nbLiees: number): string {
  return `${accorder(nbLiees, "liaison", "liaisons")} ${nbLiees >= 2 ? "seront défaites" : "sera défaite"} ; les transactions restent.`;
}

export function libelleSuppressionSerie(liaisonsDefaites: number): string {
  return `Récurrence supprimée : ${accorder(liaisonsDefaites, "liaison défaite", "liaisons défaites")} ; les transactions restent.`;
}
