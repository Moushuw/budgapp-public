import { describe, expect, it } from "vitest";
import { LIBELLES_SOURCE_SOLDE, SOURCES_SOLDE } from "../referentiel";
import {
  dateLisible,
  dateLongue,
  libelleEnteteSolde,
  LIBELLES_CONSTAT,
  LIBELLES_NATURE_EXPLICATION,
  LIBELLES_STATUT_ANCRAGE,
  MESSAGES_REFUS_AJUSTEMENT,
  sousTitreCompte,
} from "./libelles";
import { ORDRE_EXPLICATIONS } from "./types";

describe("dates lisibles", () => {
  it("LB1 — date longue, premier du mois en ordinal", () => {
    expect(dateLongue("2026-09-20")).toBe("20 septembre 2026");
    expect(dateLongue("2099-03-01")).toBe("1er mars 2099");
  });
  it("LB2 — l'année n'apparaît que si elle diffère de la référence", () => {
    expect(dateLisible("2026-09-03", "2026-09-20")).toBe("3 septembre");
    expect(dateLisible("2025-12-28", "2026-01-05")).toBe("28 décembre 2025");
  });
});

describe("sousTitreCompte et libelleEnteteSolde", () => {
  it("LB4 — le nom seul quand il coïncide avec le type (casse, accents, espaces de bord ignorés)", () => {
    expect(sousTitreCompte("Épargne", "EPARGNE")).toBe("Épargne");
    expect(sousTitreCompte("epargne", "EPARGNE")).toBe("epargne");
    expect(sousTitreCompte("  ÉPARGNE ", "EPARGNE")).toBe("ÉPARGNE");
    expect(sousTitreCompte("Epargne", "EPARGNE")).toBe("Epargne");
  });
  it("LB5 — nom et type sinon", () => {
    expect(sousTitreCompte("Mon compte", "EPARGNE")).toBe("Mon compte · Épargne");
    expect(sousTitreCompte("Épargne", "CHEQUE")).toBe("Épargne · Compte chèque");
  });
  it("LB6 — en-tête de la colonne Solde", () => {
    expect(libelleEnteteSolde("2026-10-10")).toBe("Solde au 10 octobre 2026");
    expect(libelleEnteteSolde("2099-03-01")).toBe("Solde au 1er mars 2099");
    expect(libelleEnteteSolde(null)).toBe("Solde");
  });
});

describe("tables de libellés", () => {
  it("LB3 — chaque clé a un libellé non vide", () => {
    for (const statut of ["EQUILIBRE", "EXPLIQUE", "ECART_OUVERT"] as const) {
      expect(LIBELLES_STATUT_ANCRAGE[statut].length).toBeGreaterThan(0);
    }
    for (const nature of ORDRE_EXPLICATIONS) expect(LIBELLES_NATURE_EXPLICATION[nature].length).toBeGreaterThan(0);
    for (const constat of ["PISTE", "RIEN", "RAPPEL"] as const) expect(LIBELLES_CONSTAT[constat].length).toBeGreaterThan(0);
    for (const motif of ["AJUSTEMENT_EXISTANT", "ECART_NUL", "ECART_HORS_LIMITE"] as const) {
      expect(MESSAGES_REFUS_AJUSTEMENT[motif].length).toBeGreaterThan(0);
    }
    for (const source of SOURCES_SOLDE) expect(LIBELLES_SOURCE_SOLDE[source].length).toBeGreaterThan(0);
  });
  it("LB3 — textes exacts de la spec", () => {
    expect(LIBELLES_STATUT_ANCRAGE).toEqual({ EQUILIBRE: "Équilibré", EXPLIQUE: "Expliqué", ECART_OUVERT: "Écart ouvert" });
    expect(LIBELLES_SOURCE_SOLDE).toEqual({ MANUEL: "Saisie manuelle", RELEVE: "Relevé", AGREGATEUR: "Agrégateur" });
    expect(MESSAGES_REFUS_AJUSTEMENT.AJUSTEMENT_EXISTANT).toBe("Ce solde a déjà un ajustement.");
  });
});
