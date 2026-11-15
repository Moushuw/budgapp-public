import { describe, expect, it } from "vitest";
import type { Cadence } from "../dates";
import {
  casseDeTitre,
  jourEtMois,
  libelleCadence,
  libelleCandidatAttendu,
  libellePaiementAttendu,
  messageSuppressionLiee,
  messageSuppressionLieeDetail,
  moisEtAnnee,
  phraseLiaison,
} from "./libelles";

describe("libelleCadence (L1)", () => {
  it.each([
    ["HEBDO", "toutes les semaines"],
    ["AUX_2_SEMAINES", "toutes les deux semaines"],
    ["AUX_4_SEMAINES", "toutes les quatre semaines"],
    ["DEUX_FOIS_PAR_MOIS", "deux fois par mois"],
    ["MENSUEL", "tous les mois"],
    ["AUX_2_MOIS", "tous les deux mois"],
    ["AUX_3_MOIS", "tous les trois mois"],
    ["AUX_4_MOIS", "tous les quatre mois"],
    ["SEMESTRIEL", "tous les six mois"],
    ["ANNUEL", "tous les ans"],
    ["AUX_2_ANS", "tous les deux ans"],
    ["PONCTUEL", "une seule fois"],
  ] satisfies [Cadence, string][])("%s → %s", (cadence, attendu) => {
    expect(libelleCadence(cadence)).toBe(attendu);
  });
});

describe("phraseLiaison et messageSuppressionLiee", () => {
  const base = { libelle: "Netflix.com", echeance: "2026-08-12", liaison: "AUTO", lieeLe: "2026-10-14" } as const;

  it("L1 — liée automatiquement à l'import", () => {
    expect(phraseLiaison(base)).toBe(
      "Paiement de Netflix.com, échéance du 12 août — lié automatiquement à l'import le 14 octobre",
    );
  });

  it("L2 — liée à la main", () => {
    expect(phraseLiaison({ ...base, liaison: "MANUELLE" })).toBe(
      "Paiement de Netflix.com, échéance du 12 août — lié à la main le 14 octobre",
    );
  });

  it("L3 — liée à la confirmation", () => {
    expect(phraseLiaison({ ...base, liaison: "RETROACTIVE" })).toBe(
      "Paiement de Netflix.com, échéance du 12 août — lié à la confirmation le 14 octobre",
    );
  });

  it("L4 — sans date de liaison", () => {
    expect(phraseLiaison({ ...base, liaison: "RETROACTIVE", lieeLe: null })).toBe(
      "Paiement de Netflix.com, échéance du 12 août — lié à la confirmation",
    );
  });

  it("L5 — le premier du mois s'écrit « 1er »", () => {
    expect(phraseLiaison({ ...base, echeance: "2026-09-01" })).toContain("échéance du 1er septembre —");
  });

  it("L6 — message de suppression refusée", () => {
    expect(messageSuppressionLiee("Netflix", "2026-08-12")).toBe(
      "Cette transaction est le paiement de Netflix du 12 août. Délie-la d'abord depuis son détail.",
    );
  });

  it("L7 — message du panneau de détail", () => {
    expect(messageSuppressionLieeDetail("Netflix", "2026-08-12")).toBe(
      "Cette transaction est le paiement de Netflix du 12 août. Délie-la d'abord dans la section Récurrence ci-dessous.",
    );
    expect(messageSuppressionLieeDetail("Netflix", "2026-09-01")).toBe(
      "Cette transaction est le paiement de Netflix du 1er septembre. Délie-la d'abord dans la section Récurrence ci-dessous.",
    );
  });
});

describe("libellePaiementAttendu", () => {
  it("LPA1 — jour ordinaire", () => {
    expect(libellePaiementAttendu("Netflix.com", "2026-10-12")).toBe("Paiement de Netflix.com, échéance du 12 octobre");
  });

  it("LPA2 — le premier du mois s'écrit « 1er »", () => {
    expect(libellePaiementAttendu("X", "2026-11-01")).toBe("Paiement de X, échéance du 1er novembre");
  });

  it.each(["AUTO", "MANUELLE", "RETROACTIVE"] as const)("LPA3 — phraseLiaison (%s) commence par ce libellé", (liaison) => {
    const r = { libelle: "Netflix.com", echeance: "2026-10-12", liaison, lieeLe: "2026-10-14" } as const;
    expect(phraseLiaison(r).startsWith(`${libellePaiementAttendu(r.libelle, r.echeance)} — `)).toBe(true);
  });
});

describe("libelleCandidatAttendu", () => {
  it("LCA1 — montant en valeur absolue, sans « attendu »", () => {
    const attendu = "Paiement de Netflix.com, échéance du 12 novembre — 17,99 $";
    expect(libelleCandidatAttendu("Netflix.com", "2026-11-12", -1799)).toBe(attendu);
    expect(libelleCandidatAttendu("Netflix.com", "2026-11-12", 1799)).toBe(attendu);
    expect(attendu).not.toContain("attendu");
  });

  it("LCA2 — montant nul", () => {
    expect(libelleCandidatAttendu("X", "2026-11-12", 0)).toContain("0,00");
  });
});

describe("casseDeTitre, jourEtMois, moisEtAnnee (T)", () => {
  it.each([
    ["NETFLIX.COM", "Netflix.com"],
    ["HYDRO-QUEBEC", "Hydro-Quebec"],
    ["DEPOT PAIE EMPLOYEUR ABC INC", "Depot Paie Employeur Abc Inc"],
    ["CAFE DEPOT", "Cafe Depot"],
    ["", ""],
  ])("casseDeTitre(%j) → %j", (entree, attendu) => {
    expect(casseDeTitre(entree)).toBe(attendu);
  });

  it("jourEtMois", () => {
    expect(jourEtMois("2026-10-20")).toBe("20 octobre");
    expect(jourEtMois("2026-11-01")).toBe("1er novembre");
  });

  it("moisEtAnnee", () => {
    expect(moisEtAnnee("2025-03-12")).toBe("mars 2025");
    expect(moisEtAnnee("2026-08-01")).toBe("août 2026");
  });
});
