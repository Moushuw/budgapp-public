import { describe, expect, it } from "vitest";
import { ajouterJours, ajouterMois, dateCivileDansFuseau, FUSEAU_APPLICATION } from "@/domain/dates";
import { ANCIENNETE_ANCRAGE_MAX_ANS } from "@/domain/recurrence";
import {
  schemaChampsRecurrence,
  schemaCreationRecurrence,
  schemaFormulaireRecurrence,
  schemaModificationRecurrence,
  schemaPageOccurrences,
  versChampsRecurrence,
  type EntreeChampsRecurrence,
} from "./schema";

describe("schemaPageOccurrences", () => {
  const base = { ruleId: "clx0000000000000000099999", curseur: null };

  it("SP1 — la portion est obligatoire et bornée", () => {
    expect(schemaPageOccurrences.safeParse(base).success).toBe(false);
    expect(schemaPageOccurrences.safeParse({ ...base, portion: "AUTRE" }).success).toBe(false);
  });

  it("SP2 — A_VENIR et PASSEES sont acceptées", () => {
    expect(schemaPageOccurrences.safeParse({ ...base, portion: "A_VENIR" }).success).toBe(true);
    expect(schemaPageOccurrences.safeParse({ ...base, portion: "PASSEES" }).success).toBe(true);
  });
});

const CUID = "clx0000000000000000099999";

const BASE: EntreeChampsRecurrence = {
  libelle: "Netflix",
  nature: "FIXE",
  montant: "-17,99",
  cadence: "MENSUEL",
  dateAncrage: "2025-03-12",
  subcategoryId: null,
  motifRapprochement: "netflix.com",
  toleranceMontant: "5,00",
  toleranceJours: "3",
};

function messages(entree: Partial<EntreeChampsRecurrence>): string[] {
  const resultat = schemaChampsRecurrence.safeParse({ ...BASE, ...entree });
  return resultat.success ? [] : resultat.error.issues.map((issue) => issue.message);
}

describe("schemaChampsRecurrence", () => {
  it("S1 — une saisie valide est convertie en cents et normalisée", () => {
    const resultat = schemaChampsRecurrence.parse(BASE);
    expect(resultat.montant).toBe(-1799);
    expect(resultat.motifRapprochement).toBe("NETFLIX.COM");
    expect(resultat.toleranceMontant).toBe(500);
    expect(resultat.toleranceJours).toBe(3);
  });

  it("S2 — un motif vide ou que la normalisation vide est refusé", () => {
    expect(messages({ motifRapprochement: "   " })).toEqual(["Le motif de rapprochement est obligatoire."]);
    expect(messages({ motifRapprochement: "1234" })).toEqual(["Le motif de rapprochement est obligatoire."]);
  });

  it("S3 — libellé vide ou trop long", () => {
    expect(messages({ libelle: "" })).toEqual(["Le libellé est obligatoire."]);
    expect(messages({ libelle: "x".repeat(81) })).toEqual(["80 caractères au maximum."]);
  });

  it("S4 — montant illisible ou absent", () => {
    expect(messages({ montant: "abc" })).toEqual(["Montant illisible. Exemple : -17,99"]);
    expect(messages({ montant: "" })).toEqual(["Ce montant est obligatoire."]);
  });

  it("S5 — tolérance de montant négative", () => {
    expect(messages({ toleranceMontant: "-1,00" })).toEqual(["La tolérance de montant ne peut pas être négative."]);
  });

  it("S6 — tolérance de jours", () => {
    expect(messages({ toleranceJours: "32" })).toEqual(["La tolérance de jours va de 0 à 31."]);
    expect(messages({ toleranceJours: "-1" })).toEqual(["La tolérance de jours va de 0 à 31."]);
    expect(messages({ toleranceJours: "2,5" })).toEqual(["Nombre entier de jours attendu."]);
    expect(messages({ toleranceJours: "0" })).toEqual([]);
    expect(messages({ toleranceJours: "31" })).toEqual([]);
  });

  it("S7 — date d'ancrage impossible", () => {
    expect(messages({ dateAncrage: "2025-02-30" })).toEqual(["Date invalide (AAAA-MM-JJ attendu)."]);
  });

  it("S10 — une date d'ancrage de plus de dix ans est refusée, celle d'il y a dix ans et d'il y a 24 mois passent", () => {
    const aujourdhui = dateCivileDansFuseau(new Date(), FUSEAU_APPLICATION);
    const limite = ajouterMois(aujourdhui, -12 * ANCIENNETE_ANCRAGE_MAX_ANS);
    const message = `La date d'ancrage ne peut pas remonter à plus de ${ANCIENNETE_ANCRAGE_MAX_ANS} ans.`;
    expect(ANCIENNETE_ANCRAGE_MAX_ANS).toBe(10);
    expect(messages({ dateAncrage: "1900-01-01" })).toEqual([message]);
    expect(messages({ dateAncrage: ajouterJours(limite, -1) })).toEqual([message]);
    expect(messages({ dateAncrage: limite })).toEqual([]);
    expect(messages({ dateAncrage: ajouterMois(aujourdhui, -24) })).toEqual([]);
  });

  it("S11 — la modification accepte un ancrage de plus de dix ans, la création le refuse", () => {
    const ancien = ajouterMois(dateCivileDansFuseau(new Date(), FUSEAU_APPLICATION), -12 * 11);
    expect(schemaModificationRecurrence.safeParse({ id: CUID, champs: { ...BASE, dateAncrage: ancien } }).success).toBe(true);
    const creation = schemaCreationRecurrence.safeParse({
      accountId: CUID,
      transactionId: null,
      champs: { ...BASE, dateAncrage: ancien },
    });
    expect(creation.success).toBe(false);
    expect([...new Set((creation.error?.issues ?? []).map((i) => i.message))]).toEqual([
      `La date d'ancrage ne peut pas remonter à plus de ${ANCIENNETE_ANCRAGE_MAX_ANS} ans.`,
    ]);
  });

  it("S8 — le formulaire exige un compte", () => {
    const resultat = schemaFormulaireRecurrence.safeParse({ ...BASE, accountId: "" });
    expect(resultat.success).toBe(false);
    if (!resultat.success) {
      expect([...new Set(resultat.error.issues.map((issue) => issue.message))]).toEqual(["Choisis un compte."]);
    }
  });

  it("S9 — versChampsRecurrence rend exactement les neuf champs du domaine", () => {
    expect(versChampsRecurrence(schemaChampsRecurrence.parse(BASE))).toEqual({
      libelle: "Netflix",
      nature: "FIXE",
      montantCents: -1799,
      cadence: "MENSUEL",
      dateAncrage: "2025-03-12",
      subcategoryId: null,
      motifRapprochement: "NETFLIX.COM",
      toleranceCents: 500,
      toleranceJours: 3,
    });
  });
});
