import { describe, expect, it } from "vitest";
import { formatMontant } from "@/domain/money";
import type { CompteRenduLiaisonRetroactive } from "@/domain/recurrence";
import {
  consequenceSuppressionSerie,
  libelleCreation,
  libelleMontantSerie,
  libelleOptionCadence,
  libelleRecherche,
  libelleTerminaison,
  libelleVentilationSerie,
  lignesCompteRenduConfirmation,
} from "./libelles";

const COMPTE_RENDU: CompteRenduLiaisonRetroactive = {
  ruleId: "r1",
  libelle: "Netflix.com",
  paiementsLies: 19,
  sansEcheance: [],
  indisponibles: 0,
  echeancesPasseesSansPaiement: 0,
};

describe("lignesCompteRenduConfirmation", () => {
  it("B1 — titre, avec le pluriel de « paiement lié »", () => {
    expect(lignesCompteRenduConfirmation(COMPTE_RENDU).titre).toBe("Récurrence Netflix.com créée : 19 paiements liés.");
    expect(lignesCompteRenduConfirmation({ ...COMPTE_RENDU, paiementsLies: 1 }).titre).toBe(
      "Récurrence Netflix.com créée : 1 paiement lié.",
    );
    expect(lignesCompteRenduConfirmation({ ...COMPTE_RENDU, paiementsLies: 0 }).titre).toBe(
      "Récurrence Netflix.com créée : 0 paiement lié.",
    );
    expect(lignesCompteRenduConfirmation(COMPTE_RENDU).details).toEqual([]);
  });

  it("B2 — transactions sans échéance", () => {
    const une = lignesCompteRenduConfirmation({
      ...COMPTE_RENDU,
      sansEcheance: [{ id: "t1", date: "2099-04-14", montantCents: -4000 }],
    });
    expect(une.details).toEqual([
      `1 transaction sans échéance correspondante n'a pas été liée : le 2099-04-14, ${formatMontant(-4000, "CENTS")}.`,
    ]);
    const deux = lignesCompteRenduConfirmation({
      ...COMPTE_RENDU,
      sansEcheance: [
        { id: "t1", date: "2099-04-14", montantCents: -4000 },
        { id: "t2", date: "2099-05-02", montantCents: -1000 },
      ],
    });
    expect(deux.details).toEqual([
      `2 transactions sans échéance correspondante n'ont pas été liées : le 2099-04-14, ${formatMontant(-4000, "CENTS")} ; le 2099-05-02, ${formatMontant(-1000, "CENTS")}.`,
    ]);
  });

  it("B3 — indisponibles, échéances passées, et l'ordre des détails", () => {
    expect(lignesCompteRenduConfirmation({ ...COMPTE_RENDU, indisponibles: 1 }).details).toEqual([
      "1 transaction du groupe, supprimée ou liée ailleurs entre-temps, n'a pas été reprise.",
    ]);
    expect(lignesCompteRenduConfirmation({ ...COMPTE_RENDU, indisponibles: 2 }).details).toEqual([
      "2 transactions du groupe, supprimées ou liées ailleurs entre-temps, n'ont pas été reprises.",
    ]);
    expect(lignesCompteRenduConfirmation({ ...COMPTE_RENDU, echeancesPasseesSansPaiement: 1 }).details).toEqual([
      "1 échéance passée sans paiement : elle apparaît dans les paiements attendus non vus.",
    ]);
    expect(lignesCompteRenduConfirmation({ ...COMPTE_RENDU, echeancesPasseesSansPaiement: 2 }).details).toEqual([
      "2 échéances passées sans paiement : elles apparaissent dans les paiements attendus non vus.",
    ]);
    const tout = lignesCompteRenduConfirmation({
      ...COMPTE_RENDU,
      sansEcheance: [{ id: "t1", date: "2099-04-14", montantCents: -4000 }],
      indisponibles: 1,
      echeancesPasseesSansPaiement: 1,
    }).details;
    expect(tout).toHaveLength(3);
    expect(tout[0]).toContain("sans échéance correspondante");
    expect(tout[1]).toContain("du groupe");
    expect(tout[2]).toContain("passée");
  });
});

describe("conséquences et comptes rendus de série", () => {
  it("B4 — suppression d'une série", () => {
    expect(consequenceSuppressionSerie(19)).toBe("19 liaisons seront défaites ; les transactions restent.");
    expect(consequenceSuppressionSerie(1)).toBe("1 liaison sera défaite ; les transactions restent.");
    expect(consequenceSuppressionSerie(0)).toBe("0 liaison sera défaite ; les transactions restent.");
  });

  it("B5 — terminaison", () => {
    expect(libelleTerminaison(9, 1)).toBe("Série terminée : 9 échéances à venir retirées dont 1 ignorée.");
    expect(libelleTerminaison(0, 0)).toBe("Série terminée : 0 échéance à venir retirée.");
  });
});

describe("libellés d'affichage", () => {
  it("B6 — options de cadence", () => {
    expect(libelleOptionCadence("MENSUEL")).toBe("Tous les mois");
    expect(libelleOptionCadence("PONCTUEL")).toBe("Une seule fois");
  });

  it("B7 — ventilation d'une série", () => {
    const part = { id: "p", sousCategorieNom: null, montantCents: null };
    expect(
      libelleVentilationSerie([
        { ...part, libelle: "Capital", partMille: 400 },
        { ...part, libelle: "Intérêts", partMille: 550 },
        { ...part, libelle: "Assurance", partMille: 50 },
      ]),
    ).toBe("Ventilation : Capital 40,0 % · Intérêts 55,0 % · Assurance 5,0 %");
    expect(libelleVentilationSerie([])).toBeNull();
  });

  it("B8 — montant d'une série", () => {
    expect(libelleMontantSerie({ nature: "VARIABLE", montantCents: -10500 })).toBe(
      `≈ ${formatMontant(-10500, "CENTS")}`,
    );
    expect(libelleMontantSerie({ nature: "FIXE", montantCents: -1799 })).toBe(formatMontant(-1799, "CENTS"));
    expect(libelleMontantSerie({ nature: "FIXE", montantCents: null })).toBe("—");
  });

  it("B9 — recherche", () => {
    expect(libelleRecherche({ nbSuggestions: 3, limiteAtteinte: false })).toBe("Recherche terminée : 3 suggestions.");
    expect(libelleRecherche({ nbSuggestions: 3, limiteAtteinte: true })).toBe(
      "Recherche terminée : 3 suggestions. La recherche s'est limitée aux 500 groupes les plus fréquents.",
    );
  });

  it("B10 — création", () => {
    expect(
      libelleCreation({ libelle: "Salle", toleranceJours: 3, transaction: { date: "2099-03-05", echeance: "2099-03-05" } }),
    ).toEqual({
      titre: "Récurrence Salle créée.",
      details: ["La transaction du 2099-03-05 est liée à l'échéance du 2099-03-05."],
    });
    expect(
      libelleCreation({ libelle: "Salle", toleranceJours: 3, transaction: { date: "2099-08-05", echeance: null } }).details,
    ).toEqual(["La transaction du 2099-08-05 n'a pas été liée : aucune échéance à 3 jours ou moins de sa date."]);
    expect(libelleCreation({ libelle: "Salle", toleranceJours: 3, transaction: null }).details).toEqual([]);
  });
});
