// Valeurs initiales du formulaire de récurrence — pures. Les montants passent par
// formatMontantChamp, les nombres par String : le formulaire détient des chaînes.

import type { DetailTransaction } from "@/domain/consultation";
import type { DateCivile } from "@/domain/dates";
import { normaliserDescription } from "@/domain/ingestion/normaliser";
import {
  TOLERANCE_MONTANT_DEFAUT_CENTS,
  toleranceJoursPourCadence,
  type RegleProposee,
  type SerieAffichee,
} from "@/domain/recurrence";
import { formatMontantChamp } from "@/lib/champs-formulaire";
import type { EntreeChampsRecurrence, ValeursFormulaireRecurrence } from "./schema";

/** Les champs que les actions reçoivent : les valeurs du formulaire, sans le compte (chaînes saisies comprises). */
export function champsDepuisValeurs(valeurs: ValeursFormulaireRecurrence): EntreeChampsRecurrence {
  return {
    libelle: valeurs.libelle,
    nature: valeurs.nature,
    montant: valeurs.montant,
    cadence: valeurs.cadence,
    dateAncrage: valeurs.dateAncrage,
    subcategoryId: valeurs.subcategoryId,
    motifRapprochement: valeurs.motifRapprochement,
    toleranceMontant: valeurs.toleranceMontant,
    toleranceJours: valeurs.toleranceJours,
  };
}

export function valeursDepuisProposition(p: RegleProposee): ValeursFormulaireRecurrence {
  return {
    libelle: p.libelle,
    accountId: p.accountId,
    nature: p.nature,
    montant: formatMontantChamp(p.montantCents),
    cadence: p.cadence,
    dateAncrage: p.dateAncrage,
    subcategoryId: p.subcategoryId,
    motifRapprochement: p.motifRapprochement,
    toleranceMontant: formatMontantChamp(p.toleranceCents),
    toleranceJours: String(p.toleranceJours),
  };
}

export function valeursDepuisSerie(s: SerieAffichee): ValeursFormulaireRecurrence {
  return {
    libelle: s.libelle,
    accountId: s.accountId,
    nature: s.nature,
    montant: formatMontantChamp(s.montantCents),
    cadence: s.cadence,
    dateAncrage: s.dateAncrage,
    subcategoryId: s.subcategoryId,
    motifRapprochement: s.motifRapprochement ?? "",
    toleranceMontant: formatMontantChamp(s.toleranceCents),
    toleranceJours: String(s.toleranceJours),
  };
}

/** Compte, montant, motif (description normalisée), ancrage (date) et sous-catégorie de la transaction ; le reste par défaut. */
export function valeursDepuisTransaction(d: DetailTransaction): ValeursFormulaireRecurrence {
  return {
    libelle: "",
    accountId: d.accountId,
    nature: "FIXE",
    montant: formatMontantChamp(d.montantCents),
    cadence: "MENSUEL",
    dateAncrage: d.date,
    subcategoryId: d.subcategoryId,
    motifRapprochement: normaliserDescription(d.description),
    toleranceMontant: formatMontantChamp(TOLERANCE_MONTANT_DEFAUT_CENTS),
    toleranceJours: String(toleranceJoursPourCadence("MENSUEL")),
  };
}

export function valeursVides(aujourdhui: DateCivile): ValeursFormulaireRecurrence {
  return {
    libelle: "",
    accountId: "",
    nature: "FIXE",
    montant: "",
    cadence: "MENSUEL",
    dateAncrage: aujourdhui,
    subcategoryId: null,
    motifRapprochement: "",
    toleranceMontant: formatMontantChamp(TOLERANCE_MONTANT_DEFAUT_CENTS),
    toleranceJours: String(toleranceJoursPourCadence("MENSUEL")),
  };
}
