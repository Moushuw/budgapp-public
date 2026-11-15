// Les trois couches de docs/modele-ingestion-recurrences.md §2 —
// docs/lot-m1.md §6.2. Une seule fonction, totale et déterministe.

import { ecartJours, type DateCivile } from "../dates";
import type { Cents } from "../money";
import {
  TOLERANCE_QUASI_DOUBLON_JOURS,
  TOLERANCE_VIREMENT_EXISTANT_JOURS,
  type ActionLigne,
  type ReferenceTransaction,
  type StatutDoublon,
  type TransactionExistante,
} from "./types";

export interface VerdictDoublon {
  readonly statut: StatutDoublon;
  readonly doublonDe: ReferenceTransaction | null;
  readonly actionParDefaut: ActionLigne;
}

function versReference(existante: TransactionExistante): ReferenceTransaction {
  return {
    id: existante.id,
    date: existante.date,
    description: existante.description,
    montantCents: existante.montantCents,
    empreinte: existante.empreinte,
    virement: existante.virement,
  };
}

/** Le plus proche en date, puis le plus petit id — jamais l'ordre de la liste reçue. */
function meilleurQuasiCandidat(
  date: DateCivile,
  candidats: readonly TransactionExistante[],
): TransactionExistante | null {
  let meilleur: TransactionExistante | null = null;
  let meilleurEcart = Number.POSITIVE_INFINITY;

  for (const candidat of candidats) {
    const ecart = Math.abs(ecartJours(date, candidat.date));
    if (meilleur === null || ecart < meilleurEcart || (ecart === meilleurEcart && candidat.id < meilleur.id)) {
      meilleur = candidat;
      meilleurEcart = ecart;
    }
  }

  return meilleur;
}

export function classerDoublon(
  entree: {
    readonly accountId: string;
    readonly date: DateCivile;
    readonly montantCents: Cents;
    readonly externalId: string | null;
  },
  empreinte: string,
  descriptionNormalisee: string,
  existantes: readonly TransactionExistante[],
): VerdictDoublon {
  // Couche 1 — externalId.
  if (entree.externalId !== null) {
    const correspondance = existantes.find(
      (existante) => existante.accountId === entree.accountId && existante.externalId === entree.externalId,
    );
    if (correspondance !== undefined) {
      return { statut: "EXTERNAL_ID_EXISTANT", doublonDe: versReference(correspondance), actionParDefaut: "METTRE_A_JOUR" };
    }
  }

  // Couche 2 — empreinte.
  const memeEmpreinte = existantes.find((existante) => existante.empreinte === empreinte);
  if (memeEmpreinte !== undefined) {
    return { statut: "EMPREINTE_EXISTANTE", doublonDe: versReference(memeEmpreinte), actionParDefaut: "IGNORER" };
  }

  // Entre l'empreinte et le quasi-doublon — docs/lot-m2.md §4.5 : le côté d'un virement déjà enregistré, même s'il
  // est décrit autrement (« Virement depuis … »).
  const cotesDeVirement = existantes.filter(
    (existante) =>
      existante.accountId === entree.accountId &&
      existante.montantCents === entree.montantCents &&
      existante.virement !== null &&
      Math.abs(ecartJours(entree.date, existante.date)) <= TOLERANCE_VIREMENT_EXISTANT_JOURS,
  );
  const coteProche = meilleurQuasiCandidat(entree.date, cotesDeVirement);
  if (coteProche !== null) {
    return { statut: "VIREMENT_EXISTANT", doublonDe: versReference(coteProche), actionParDefaut: "IGNORER" };
  }

  // Couche 3 — quasi-doublon.
  const candidatsQuasi = existantes.filter(
    (existante) =>
      existante.accountId === entree.accountId &&
      existante.montantCents === entree.montantCents &&
      existante.descriptionNormalisee === descriptionNormalisee &&
      Math.abs(ecartJours(entree.date, existante.date)) <= TOLERANCE_QUASI_DOUBLON_JOURS,
  );
  const meilleur = meilleurQuasiCandidat(entree.date, candidatsQuasi);
  if (meilleur !== null) {
    return { statut: "QUASI_DOUBLON", doublonDe: versReference(meilleur), actionParDefaut: "IMPORTER" };
  }

  return { statut: "AUCUN", doublonDe: null, actionParDefaut: "IMPORTER" };
}
