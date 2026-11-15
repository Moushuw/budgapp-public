import { describe, expect, it } from "vitest";
import { TYPES_COMPTE, type TypeCompte } from "@/domain/referentiel";
import type { CompteListe } from "@/server/actions/accounts";
import {
  afficheChampsCredit,
  afficheChampsPlacement,
  afficheCompteLie,
  estBudgetaireParDefaut,
  schemaCompte,
  schemaModificationCompte,
  versEntreeCompte,
} from "./schema";

const BASE = {
  nom: "Compte chèque",
  type: "CHEQUE" as TypeCompte,
  institution: null,
  soldeInitialCents: "100,00",
  dateSoldeInitial: "2026-01-01",
  estBudgetaire: true,
  inclureDansPrevision: true,
  inclureDansValeurNette: true,
  perdDelaiDeGrace: true,
  archive: false,
  seuilSecuriteCents: "",
  ordre: "0",
  limiteCreditCents: "",
  tauxAnnuel: "",
  jourReleve: "",
  jourEcheance: "",
  regimeFiscal: "NON_ENREGISTRE",
  tauxRendementAnnuel: "",
  compteLieId: null,
};

describe("schemaCompte", () => {
  it("accepte le cas nominal CHEQUE et convertit le solde en cents", () => {
    const resultat = schemaCompte.safeParse(BASE);
    expect(resultat.success).toBe(true);
    if (resultat.success) {
      expect(resultat.data.soldeInitialCents).toBe(10000);
    }
  });

  it("accepte un solde initial négatif sur une carte de crédit", () => {
    const resultat = schemaCompte.safeParse({ ...BASE, type: "CREDIT", soldeInitialCents: "-100,00" });
    expect(resultat.success).toBe(true);
    if (resultat.success) {
      expect(resultat.data.soldeInitialCents).toBe(-10000);
    }
  });

  it("refuse un nom vide", () => {
    expect(schemaCompte.safeParse({ ...BASE, nom: "" }).success).toBe(false);
  });

  it("refuse un nom de 61 caractères", () => {
    expect(schemaCompte.safeParse({ ...BASE, nom: "a".repeat(61) }).success).toBe(false);
  });

  it.each(["2026-02-30", "14/09/2026", ""])("refuse une date de solde initial invalide : %s", (date) => {
    const resultat = schemaCompte.safeParse({ ...BASE, dateSoldeInitial: date });
    expect(resultat.success).toBe(false);
    if (!resultat.success) {
      expect(resultat.error.flatten().fieldErrors.dateSoldeInitial).toContain(
        "Date invalide. Format attendu : AAAA-MM-JJ.",
      );
    }
  });

  it("efface les champs de crédit, taux et jours pour un compte chèque même s'ils sont renseignés", () => {
    const resultat = schemaCompte.safeParse({
      ...BASE,
      type: "CHEQUE",
      tauxAnnuel: "19,99",
      limiteCreditCents: "500,00",
      jourReleve: "5",
      perdDelaiDeGrace: false,
    });
    expect(resultat.success).toBe(true);
    if (resultat.success) {
      expect(resultat.data.tauxAnnuel).toBeNull();
      expect(resultat.data.limiteCreditCents).toBeNull();
      expect(resultat.data.jourReleve).toBeNull();
      expect(resultat.data.perdDelaiDeGrace).toBe(true);
    }
  });

  it("réinitialise le régime fiscal d'un compte chèque, même renseigné", () => {
    const resultat = schemaCompte.safeParse({ ...BASE, type: "CHEQUE", regimeFiscal: "CELI" });
    expect(resultat.success).toBe(true);
    if (resultat.success) {
      expect(resultat.data.regimeFiscal).toBe("NON_ENREGISTRE");
    }
  });

  it("efface le compte lié d'une épargne, même renseigné", () => {
    const resultat = schemaCompte.safeParse({
      ...BASE,
      type: "EPARGNE",
      compteLieId: "clx0000000000000000000000",
    });
    expect(resultat.success).toBe(true);
    if (resultat.success) {
      expect(resultat.data.compteLieId).toBeNull();
    }
  });

  it("convertit le taux annuel d'une carte de crédit", () => {
    const resultat = schemaCompte.safeParse({ ...BASE, type: "CREDIT", tauxAnnuel: "19,99" });
    expect(resultat.success).toBe(true);
    if (resultat.success) {
      expect(resultat.data.tauxAnnuel).toBe(0.1999);
    }
  });

  it.each(["0", "32"])("refuse un jour de relevé hors bornes sur une carte de crédit : %s", (jour) => {
    const resultat = schemaCompte.safeParse({ ...BASE, type: "CREDIT", jourReleve: jour });
    expect(resultat.success).toBe(false);
  });

  it("refuse une limite de crédit négative avec le message sur ce champ", () => {
    const resultat = schemaCompte.safeParse({ ...BASE, type: "CREDIT", limiteCreditCents: "-100" });
    expect(resultat.success).toBe(false);
    if (!resultat.success) {
      expect(resultat.error.flatten().fieldErrors.limiteCreditCents).toContain(
        "La limite de crédit ne peut pas être négative.",
      );
    }
  });
});

describe("schemaModificationCompte", () => {
  it("refuse un compte lié à lui-même", () => {
    const id = "clx0000000000000000000001";
    const resultat = schemaModificationCompte.safeParse({
      ...BASE,
      id,
      type: "PRET",
      compteLieId: id,
    });
    expect(resultat.success).toBe(false);
    if (!resultat.success) {
      expect(resultat.error.flatten().fieldErrors.compteLieId).toContain(
        "Un compte ne peut pas être lié à lui-même.",
      );
    }
  });

  it("refuse un id qui n'est pas un cuid", () => {
    const resultat = schemaModificationCompte.safeParse({ ...BASE, id: "pas-un-cuid" });
    expect(resultat.success).toBe(false);
  });
});

describe("estBudgetaireParDefaut", () => {
  it.each(TYPES_COMPTE)("type %s", (type) => {
    const attendu = type !== "PLACEMENT" && type !== "ACTIF" && type !== "PASSIF";
    expect(estBudgetaireParDefaut(type)).toBe(attendu);
  });
});

describe("affichage conditionnel selon le type", () => {
  it.each(TYPES_COMPTE)("type %s", (type) => {
    expect(afficheChampsCredit(type)).toBe(type === "CREDIT" || type === "MARGE");
    expect(afficheChampsPlacement(type)).toBe(type === "PLACEMENT");
    expect(afficheCompteLie(type)).toBe(type === "PRET" || type === "PASSIF" || type === "ACTIF");
  });
});

describe("versEntreeCompte", () => {
  it("fait un aller-retour sans perte via schemaCompte, sur un compte de crédit complet", () => {
    const compte: CompteListe = {
      id: "clx0000000000000000000002",
      nom: "Visa Desjardins",
      type: "CREDIT",
      institution: "Desjardins",
      soldeInitialCents: -50000,
      dateSoldeInitial: "2026-01-01",
      seuilSecuriteCents: 10000,
      estBudgetaire: true,
      inclureDansPrevision: true,
      inclureDansValeurNette: true,
      limiteCreditCents: 500000,
      tauxAnnuel: 0.1999,
      jourReleve: 15,
      jourEcheance: 5,
      perdDelaiDeGrace: false,
      regimeFiscal: "NON_ENREGISTRE",
      tauxRendementAnnuel: null,
      compteLieId: null,
      archive: false,
      ordre: 3,
      nbTransactions: 12,
      nbRecurrences: 0,
      nbReleves: 0,
      nbReconciliations: 0,
      nbLotsImport: 0,
    };

    const resultat = schemaCompte.safeParse(versEntreeCompte(compte));
    expect(resultat.success).toBe(true);
    if (resultat.success) {
      expect(resultat.data).toMatchObject({
        nom: compte.nom,
        type: compte.type,
        institution: compte.institution,
        soldeInitialCents: compte.soldeInitialCents,
        dateSoldeInitial: compte.dateSoldeInitial,
        estBudgetaire: compte.estBudgetaire,
        inclureDansPrevision: compte.inclureDansPrevision,
        inclureDansValeurNette: compte.inclureDansValeurNette,
        limiteCreditCents: compte.limiteCreditCents,
        tauxAnnuel: compte.tauxAnnuel,
        jourReleve: compte.jourReleve,
        jourEcheance: compte.jourEcheance,
        perdDelaiDeGrace: compte.perdDelaiDeGrace,
        regimeFiscal: compte.regimeFiscal,
        tauxRendementAnnuel: compte.tauxRendementAnnuel,
        compteLieId: compte.compteLieId,
        ordre: compte.ordre,
      });
    }
  });
});
