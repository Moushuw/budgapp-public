import { describe, expect, it } from "vitest";
import {
  ajouterJours,
  dateCivile,
  dateCivileDansFuseau,
  depuisDateUtc,
  dernierJourDuMois,
  differenceMois,
  ecartJours,
  echeances,
  estDateCivile,
  jourSemaine,
  moisDansPlage,
  moisDe,
  moisPrecedent,
  moisSuivant,
  premierJourDuMois,
  versDateUtc,
} from "./dates";

describe("dateCivile", () => {
  it("construit une date valide", () => {
    expect(dateCivile(2026, 9, 13)).toBe("2026-09-13");
  });

  it("rejette une date qui n'existe pas", () => {
    expect(() => dateCivile(2026, 2, 30)).toThrow();
  });
});

describe("ajouterJours", () => {
  it("avance dans le même mois", () => {
    expect(ajouterJours("2026-09-13", 5)).toBe("2026-09-18");
  });

  it("passe le mois", () => {
    expect(ajouterJours("2026-09-28", 5)).toBe("2026-10-03");
  });

  it("recule", () => {
    expect(ajouterJours("2026-09-13", -20)).toBe("2026-08-24");
  });
});

describe("moisDe", () => {
  it("extrait l'année et le mois", () => {
    expect(moisDe("2026-09-13")).toBe("2026-09");
  });
});

describe("premierJourDuMois et dernierJourDuMois", () => {
  it("donne les bornes d'un mois de 30 jours", () => {
    expect(premierJourDuMois("2026-09")).toBe("2026-09-01");
    expect(dernierJourDuMois("2026-09")).toBe("2026-09-30");
  });

  it("donne le 29 février une année bissextile", () => {
    expect(dernierJourDuMois("2028-02")).toBe("2028-02-29");
  });

  it("donne le 28 février une année non bissextile", () => {
    expect(dernierJourDuMois("2026-02")).toBe("2026-02-28");
  });
});

describe("moisSuivant, moisPrecedent, differenceMois", () => {
  it("avance et recule d'un mois, y compris sur un passage d'année", () => {
    expect(moisSuivant("2025-12")).toBe("2026-01");
    expect(moisPrecedent("2026-01")).toBe("2025-12");
  });

  it("calcule la différence en mois, signée", () => {
    expect(differenceMois("2026-01", "2026-09")).toBe(8);
    expect(differenceMois("2026-09", "2026-01")).toBe(-8);
    expect(differenceMois("2025-06", "2026-06")).toBe(12);
  });
});

describe("moisDansPlage", () => {
  it("énumère les mois inclusivement, y compris un passage d'année", () => {
    expect(moisDansPlage("2025-11", "2026-02")).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
  });

  it("retourne un seul mois quand début = fin", () => {
    expect(moisDansPlage("2026-09", "2026-09")).toEqual(["2026-09"]);
  });
});

describe("ecartJours", () => {
  it("calcule un écart positif", () => {
    expect(ecartJours("2026-09-01", "2026-09-10")).toBe(9);
  });

  it("calcule un écart négatif", () => {
    expect(ecartJours("2026-09-10", "2026-09-01")).toBe(-9);
  });
});

describe("echeances — les 12 cadences", () => {
  it("HEBDO — tous les 7 jours", () => {
    expect(echeances("HEBDO", "2026-01-01", "2026-01-22")).toEqual([
      "2026-01-01",
      "2026-01-08",
      "2026-01-15",
      "2026-01-22",
    ]);
  });

  it("AUX_2_SEMAINES — tous les 14 jours (la paie)", () => {
    expect(echeances("AUX_2_SEMAINES", "2026-01-01", "2026-02-12")).toEqual([
      "2026-01-01",
      "2026-01-15",
      "2026-01-29",
      "2026-02-12",
    ]);
  });

  it("AUX_4_SEMAINES — tous les 28 jours", () => {
    expect(echeances("AUX_4_SEMAINES", "2026-01-01", "2026-03-26")).toEqual(["2026-01-01", "2026-01-29", "2026-02-26", "2026-03-26"]);
  });

  it("DEUX_FOIS_PAR_MOIS — l'ancrage et l'ancrage + 15 jours, chaque mois", () => {
    expect(echeances("DEUX_FOIS_PAR_MOIS", "2026-01-01", "2026-03-01")).toEqual([
      "2026-01-01",
      "2026-01-16",
      "2026-02-01",
      "2026-02-16",
      "2026-03-01",
    ]);
  });

  it("MENSUEL — même jour chaque mois", () => {
    expect(echeances("MENSUEL", "2026-01-15", "2026-04-15")).toEqual([
      "2026-01-15",
      "2026-02-15",
      "2026-03-15",
      "2026-04-15",
    ]);
  });

  it("AUX_2_MOIS — tous les 2 mois", () => {
    expect(echeances("AUX_2_MOIS", "2026-01-10", "2026-07-10")).toEqual([
      "2026-01-10",
      "2026-03-10",
      "2026-05-10",
      "2026-07-10",
    ]);
  });

  it("AUX_3_MOIS — tous les 3 mois", () => {
    expect(echeances("AUX_3_MOIS", "2026-01-10", "2026-10-10")).toEqual([
      "2026-01-10",
      "2026-04-10",
      "2026-07-10",
      "2026-10-10",
    ]);
  });

  it("AUX_4_MOIS — tous les 4 mois", () => {
    expect(echeances("AUX_4_MOIS", "2026-01-10", "2027-01-10")).toEqual(["2026-01-10", "2026-05-10", "2026-09-10", "2027-01-10"]);
  });

  it("SEMESTRIEL — tous les 6 mois", () => {
    expect(echeances("SEMESTRIEL", "2026-01-10", "2027-01-10")).toEqual(["2026-01-10", "2026-07-10", "2027-01-10"]);
  });

  it("ANNUEL — tous les 12 mois", () => {
    expect(echeances("ANNUEL", "2026-01-10", "2028-01-10")).toEqual(["2026-01-10", "2027-01-10", "2028-01-10"]);
  });

  it("AUX_2_ANS — tous les 24 mois", () => {
    expect(echeances("AUX_2_ANS", "2026-01-10", "2030-01-10")).toEqual(["2026-01-10", "2028-01-10", "2030-01-10"]);
  });

  it("PONCTUEL — une seule occurrence, jamais répétée", () => {
    expect(echeances("PONCTUEL", "2026-03-15", "2030-01-01")).toEqual(["2026-03-15"]);
  });

  it("PONCTUEL — rien si l'échéance dépasse la borne", () => {
    expect(echeances("PONCTUEL", "2026-03-15", "2026-01-01")).toEqual([]);
  });
});

describe("estDateCivile", () => {
  it("accepte une date bien formée et existante", () => {
    expect(estDateCivile("2026-09-14")).toBe(true);
  });

  it.each(["2026-02-30", "2026-13-01", "14-09-2026", "2026-9-1", ""])(
    "refuse sans lever : %s",
    (valeur) => {
      expect(() => estDateCivile(valeur)).not.toThrow();
      expect(estDateCivile(valeur)).toBe(false);
    },
  );
});

describe("versDateUtc et depuisDateUtc", () => {
  it("versDateUtc produit un instant UTC minuit", () => {
    const date = versDateUtc("2026-09-14");
    expect(date.getUTCFullYear()).toBe(2026);
    expect(date.getUTCMonth()).toBe(8);
    expect(date.getUTCDate()).toBe(14);
    expect(date.getUTCHours()).toBe(0);
  });

  it("depuisDateUtc ne recule pas d'un jour, quel que soit le fuseau de la machine", () => {
    expect(depuisDateUtc(new Date("2026-01-01T00:00:00.000Z"))).toBe("2026-01-01");
  });

  it.each(["2026-01-01", "2026-12-31", "2024-02-29"])("fait un aller-retour sans perte : %s", (d) => {
    expect(depuisDateUtc(versDateUtc(d))).toBe(d);
  });

  it("versDateUtc lève sur une date invalide", () => {
    expect(() => versDateUtc("2026-02-30")).toThrow();
  });
});

describe("echeances — cas limites du calendrier", () => {
  it("un ancrage le 31 se borne au dernier jour d'un mois de 30 jours, puis revient au 31", () => {
    expect(echeances("MENSUEL", "2026-01-31", "2026-05-31")).toEqual([
      "2026-01-31",
      "2026-02-28",
      "2026-03-31",
      "2026-04-30",
      "2026-05-31",
    ]);
  });

  it("une année bissextile porte le 29 février", () => {
    expect(echeances("MENSUEL", "2028-01-31", "2028-03-31")).toEqual(["2028-01-31", "2028-02-29", "2028-03-31"]);
  });

  it("un passage d'année ne perturbe pas la cadence", () => {
    expect(echeances("MENSUEL", "2025-12-15", "2026-02-15")).toEqual(["2025-12-15", "2026-01-15", "2026-02-15"]);
  });

  it("retourne un tableau vide quand l'ancrage dépasse la borne", () => {
    expect(echeances("MENSUEL", "2026-05-01", "2026-01-01")).toEqual([]);
  });
});

describe("dateCivileDansFuseau", () => {
  const toronto = "America/Toronto";

  it("heure avancée (UTC−4) : le jour change à 04:00 UTC", () => {
    expect(dateCivileDansFuseau(new Date("2026-10-01T03:30:00Z"), toronto)).toBe("2026-09-30");
    expect(dateCivileDansFuseau(new Date("2026-10-01T04:30:00Z"), toronto)).toBe("2026-10-01");
  });

  it("heure normale (UTC−5) : le jour change à 05:00 UTC", () => {
    expect(dateCivileDansFuseau(new Date("2026-01-01T04:59:00Z"), toronto)).toBe("2025-12-31");
    expect(dateCivileDansFuseau(new Date("2026-01-01T05:00:00Z"), toronto)).toBe("2026-01-01");
  });

  it("le jour du changement d'heure", () => {
    expect(dateCivileDansFuseau(new Date("2026-03-08T06:59:00Z"), toronto)).toBe("2026-03-08");
  });

  it("fuseau UTC, dont le 29 février d'une année bissextile", () => {
    expect(dateCivileDansFuseau(new Date("2026-02-28T23:59:59Z"), "UTC")).toBe("2026-02-28");
    expect(dateCivileDansFuseau(new Date("2028-02-29T12:00:00Z"), "UTC")).toBe("2028-02-29");
  });

  it("lève sur un fuseau inconnu", () => {
    expect(() => dateCivileDansFuseau(new Date("2026-01-01T00:00:00Z"), "Mars/Olympus")).toThrow();
  });

  it("rend une date civile bien formée", () => {
    expect(estDateCivile(dateCivileDansFuseau(new Date("2026-06-15T12:00:00Z"), toronto))).toBe(true);
  });
});

describe("jourSemaine", () => {
  it.each([
    ["1970-01-01", 4],
    ["2026-03-01", 7],
    ["2026-03-02", 1],
    ["2026-10-08", 4],
    ["2024-02-29", 4],
    ["1969-12-29", 1],
  ])("%s → %i", (date, attendu) => {
    expect(jourSemaine(date)).toBe(attendu);
  });
});
