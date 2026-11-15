// Rapprochement d'une ligne de relevé aux occurrences ouvertes — docs/lot-m3.md §4.5.
// Le domaine propose un verdict, il n'écrit aucune liaison : AUTO n'est qu'un pré-remplissage.

import { ecartJours } from "../dates";
import { formatMontant } from "../money";
import { MARGE_CANDIDAT_JOURS } from "./constantes";
import { jourEtMois } from "./libelles";
import type {
  CandidatOccurrence,
  EvaluationRapprochement,
  LigneARapprocher,
  OccurrenceCandidate,
} from "./types";

function comparer(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function motifPresent(motif: string | null): motif is string {
  return motif !== null && motif.trim() !== "";
}

function messageMontant(ligneCents: number, attenduCents: number): string {
  const memeSigne = ligneCents === 0 || attenduCents === 0 || Math.sign(ligneCents) === Math.sign(attenduCents);
  const a = memeSigne ? Math.abs(ligneCents) : ligneCents;
  const b = memeSigne ? Math.abs(attenduCents) : attenduCents;
  return `montant de ${formatMontant(a)} au lieu de ${formatMontant(b)} attendu`;
}

/** Candidats de la ligne parmi les occurrences reçues, chacun avec ses critères et ce qui cloche, triés comme EvaluationRapprochement.candidats. */
export function candidatsOccurrence<T extends OccurrenceCandidate>(
  ligne: LigneARapprocher,
  occurrences: readonly T[],
): CandidatOccurrence<T>[] {
  const retenus: { candidat: CandidatOccurrence<T>; ecart: number }[] = [];

  for (const occurrence of occurrences) {
    const ecart = Math.abs(ecartJours(occurrence.echeance, ligne.date));
    if (ecart > occurrence.toleranceJours + MARGE_CANDIDAT_JOURS) continue;

    const motif = occurrence.motifRapprochement;
    const description = motifPresent(motif) && ligne.descriptionNormalisee.includes(motif);
    const montant = Math.abs(ligne.montantCents - occurrence.montantCents) <= occurrence.toleranceCents;
    const date = ecart <= occurrence.toleranceJours;
    if (!description && !montant) continue;

    const cloche: string[] = [];
    if (!montant) cloche.push(messageMontant(ligne.montantCents, occurrence.montantCents));
    if (!date) {
      const jours = occurrence.toleranceJours <= 1 ? "jour" : "jours";
      cloche.push(
        `le ${jourEtMois(ligne.date)}, échéance attendue le ${jourEtMois(occurrence.echeance)} à ± ${occurrence.toleranceJours} ${jours}`,
      );
    }
    if (!description) {
      cloche.push(
        motifPresent(motif)
          ? `description « ${ligne.descriptionNormalisee} » sans « ${motif} »`
          : "aucun motif de description pour cette récurrence",
      );
    }
    retenus.push({ candidat: { occurrence, criteres: { description, montant, date }, cloche }, ecart });
  }

  return retenus
    .sort(
      (a, b) =>
        a.ecart - b.ecart ||
        comparer(a.candidat.occurrence.echeance, b.candidat.occurrence.echeance) ||
        comparer(a.candidat.occurrence.id, b.candidat.occurrence.id),
    )
    .map((r) => r.candidat);
}

/** `occurrences` = les occurrences ouvertes reçues ; la fonction retient elle-même les candidats. */
export function evaluerRapprochement<T extends OccurrenceCandidate>(
  ligne: LigneARapprocher,
  occurrences: readonly T[],
): EvaluationRapprochement<T> {
  const candidats = candidatsOccurrence(ligne, occurrences);
  const unique = candidats.length === 1 ? candidats[0] : undefined;
  if (unique?.cloche.length === 0) {
    return { verdict: "AUTO", candidats, occurrenceAutoId: unique.occurrence.id };
  }
  return { verdict: candidats.length === 0 ? "AUCUN" : "A_CONFIRMER", candidats, occurrenceAutoId: null };
}
