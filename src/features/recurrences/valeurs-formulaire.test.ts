import { describe, expect, it } from "vitest";
import { AUCUN_REFUS } from "@/domain/edition";
import type { DetailTransaction } from "@/domain/consultation";
import { formatMontantChamp } from "@/lib/champs-formulaire";
import type { SerieAffichee } from "@/domain/recurrence";
import { schemaChampsModificationRecurrence } from "./schema";
import {
  champsDepuisValeurs,
  valeursDepuisProposition,
  valeursDepuisSerie,
  valeursDepuisTransaction,
  valeursVides,
} from "./valeurs-formulaire";

const DETAIL: DetailTransaction = {
  id: "t1",
  parentId: null,
  accountId: "visa",
  compteNom: "Visa",
  date: "2026-08-12",
  description: "NETFLIX.COM",
  typeOperation: null,
  montantCents: -1799,
  payeeId: null,
  beneficiaireNom: null,
  subcategoryId: "streaming",
  sousCategorieNom: "Streaming",
  categorieNom: "Loisirs",
  note: null,
  etiquettes: [],
  aRevoir: false,
  exclureDuBudget: false,
  exclureDesRapports: false,
  source: "COPIER_COLLER",
  etat: "COMPTABILISEE",
  rapprochement: "NON_RAPPROCHEE",
  externalId: null,
  empreinte: "e",
  lotImport: null,
  regle: null,
  estVentilee: false,
  contrepartie: null,
  lignesVentilation: [],
  nbLignesVentilation: 0,
  recurrence: null,
  refus: AUCUN_REFUS,
};

describe("valeurs initiales du formulaire de récurrence", () => {
  it("V1 — depuis la proposition d'une suggestion", () => {
    const valeurs = valeursDepuisProposition({
      libelle: "Netflix.com",
      accountId: "visa",
      nature: "FIXE",
      montantCents: -1799,
      cadence: "MENSUEL",
      dateAncrage: "2025-03-12",
      subcategoryId: "streaming",
      motifRapprochement: "NETFLIX.COM",
      toleranceCents: 500,
      toleranceJours: 3,
    });
    expect(valeurs).toEqual({
      libelle: "Netflix.com",
      accountId: "visa",
      nature: "FIXE",
      montant: formatMontantChamp(-1799),
      cadence: "MENSUEL",
      dateAncrage: "2025-03-12",
      subcategoryId: "streaming",
      motifRapprochement: "NETFLIX.COM",
      toleranceMontant: formatMontantChamp(500),
      toleranceJours: "3",
    });
  });

  it("V2 — depuis une transaction", () => {
    const valeurs = valeursDepuisTransaction(DETAIL);
    expect(valeurs.motifRapprochement).toBe("NETFLIX.COM");
    expect(valeurs.dateAncrage).toBe("2026-08-12");
    expect(valeurs.libelle).toBe("");
    expect(valeurs.accountId).toBe("visa");
    expect(valeurs.montant).toBe(formatMontantChamp(-1799));
    expect(valeurs.subcategoryId).toBe("streaming");
    expect(valeurs.cadence).toBe("MENSUEL");
    expect(valeurs.nature).toBe("FIXE");
  });

  it("V3 — valeurs vides", () => {
    const valeurs = valeursVides("2026-10-09");
    expect(valeurs.dateAncrage).toBe("2026-10-09");
    expect(valeurs.accountId).toBe("");
    expect(valeurs.toleranceJours).toBe("3");
    expect(valeurs.toleranceMontant).toBe(formatMontantChamp(500));
    expect(valeurs.subcategoryId).toBeNull();
  });

  it("V4 — aller-retour signé : « Modifier » sans rien toucher garde le signe", () => {
    const serie: SerieAffichee = {
      id: "s1",
      libelle: "Hydro-Québec",
      accountId: "cheque",
      compteNom: "Chèque",
      nature: "FIXE",
      montantCents: -10500,
      cadence: "MENSUEL",
      dateAncrage: "2025-03-05",
      dateFin: null,
      terminee: false,
      subcategoryId: null,
      sousCategorieNom: null,
      categorieNom: null,
      motifRapprochement: "HYDRO-QUEBEC",
      toleranceCents: 2000,
      toleranceJours: 3,
      prochaineEcheance: null,
      nbLiees: 0,
      ventilation: [],
    };
    const analyse = (s: SerieAffichee) =>
      schemaChampsModificationRecurrence.parse(champsDepuisValeurs(valeursDepuisSerie(s))).montant;
    expect(analyse(serie)).toBe(-10500);
    expect(analyse({ ...serie, montantCents: 240600 })).toBe(240600);
  });
});
