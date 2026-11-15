import { describe, expect, it } from "vitest";
import {
  comparerLignes,
  curseurApres,
  FILTRES_VIDES,
  pastillesActives,
  resoudreCriteres,
  retirerPastille,
  type FiltresTransactions,
  type Pastille,
} from "./filtres";

const PERIODE_MARS_2099 = { type: "MOIS", mois: "2099-03" } as const;

const FILTRES_PLEINS: FiltresTransactions = {
  du: "2026-01-01",
  au: "2026-01-31",
  toutesDates: true,
  texte: "cafe",
  comptes: ["a", "b", "c"],
  sousCategories: ["s1", "s2"],
  nonCategorisee: true,
  beneficiaires: ["p1"],
  etiquettes: ["t1", "t2"],
  montantMinCents: 1000,
  montantMaxCents: 5000,
  sens: "SORTIES",
  aRevoir: true,
  virements: "EXCLURE",
  recurrences: "SEULEMENT",
  ventileesSeulement: true,
  exclueDuBudget: true,
  exclueDesRapports: true,
};

describe("resoudreCriteres", () => {
  it("prend les bornes de la période quand aucune date n'est posée", () => {
    const criteres = resoudreCriteres(FILTRES_VIDES, PERIODE_MARS_2099);
    expect(criteres.du).toBe("2099-03-01");
    expect(criteres.au).toBe("2099-03-31");
  });

  it("toutesDates : aucune borne, quelle que soit la période", () => {
    const criteres = resoudreCriteres({ ...FILTRES_VIDES, toutesDates: true }, PERIODE_MARS_2099);
    expect(criteres.du).toBeNull();
    expect(criteres.au).toBeNull();
  });

  it("du seul : gardé, au null, la période ignorée", () => {
    const criteres = resoudreCriteres({ ...FILTRES_VIDES, du: "2099-01-10" }, PERIODE_MARS_2099);
    expect(criteres.du).toBe("2099-01-10");
    expect(criteres.au).toBeNull();
  });

  it("le résultat n'a pas de clé toutesDates", () => {
    expect("toutesDates" in resoudreCriteres(FILTRES_VIDES, PERIODE_MARS_2099)).toBe(false);
    expect("toutesDates" in resoudreCriteres({ ...FILTRES_VIDES, toutesDates: true }, PERIODE_MARS_2099)).toBe(false);
  });
});

describe("pastillesActives", () => {
  it("aucune pastille pour des filtres vides", () => {
    expect(pastillesActives(FILTRES_VIDES)).toEqual([]);
  });

  it("une pastille par valeur, dans l'ordre de l'union ; du et au en font une seule", () => {
    const types = pastillesActives(FILTRES_PLEINS).map((pastille) => pastille.type);
    expect(types).toEqual([
      "PLAGE",
      "TOUTES_DATES",
      "TEXTE",
      "COMPTE",
      "COMPTE",
      "COMPTE",
      "SOUS_CATEGORIE",
      "SOUS_CATEGORIE",
      "NON_CATEGORISEE",
      "BENEFICIAIRE",
      "ETIQUETTE",
      "ETIQUETTE",
      "MONTANT_MIN",
      "MONTANT_MAX",
      "SENS",
      "A_REVOIR",
      "VIREMENTS",
      "RECURRENCES",
      "VENTILEES",
      "EXCLUE_BUDGET",
      "EXCLUE_RAPPORTS",
    ]);
  });

  it("INCLURE et TOUT ne donnent pas de pastille", () => {
    expect(pastillesActives({ ...FILTRES_VIDES, virements: "INCLURE", recurrences: "INCLURE", sens: "TOUT" })).toEqual([]);
  });

  it("FILTRES_VIDES.recurrences vaut INCLURE", () => {
    expect(FILTRES_VIDES.recurrences).toBe("INCLURE");
  });

  it("la pastille des récurrences vient juste après celle des virements", () => {
    const pastilles = pastillesActives({ ...FILTRES_VIDES, virements: "SEULEMENT", recurrences: "SEULEMENT" });
    expect(pastilles).toEqual([
      { type: "VIREMENTS", mode: "SEULEMENT" },
      { type: "RECURRENCES", mode: "SEULEMENT" },
    ]);
  });

  it("retirer la pastille des récurrences remet INCLURE", () => {
    const filtres = { ...FILTRES_VIDES, recurrences: "EXCLURE" } as const;
    expect(retirerPastille(filtres, { type: "RECURRENCES", mode: "EXCLURE" }).recurrences).toBe("INCLURE");
  });
});

describe("retirerPastille", () => {
  it("retire un compte seulement", () => {
    const filtres = { ...FILTRES_VIDES, comptes: ["a", "b", "c"] };
    expect(retirerPastille(filtres, { type: "COMPTE", id: "b" }).comptes).toEqual(["a", "c"]);
  });

  it("PLAGE remet du et au à null", () => {
    const resultat = retirerPastille({ ...FILTRES_VIDES, du: "2026-01-01", au: "2026-01-31" }, { type: "PLAGE", du: "2026-01-01", au: "2026-01-31" });
    expect(resultat.du).toBeNull();
    expect(resultat.au).toBeNull();
  });

  it("retirer toutes les pastilles une à une ramène aux filtres vides", () => {
    let courant = FILTRES_PLEINS;
    for (const pastille of pastillesActives(FILTRES_PLEINS)) {
      courant = retirerPastille(courant, pastille);
    }
    expect(courant).toEqual(FILTRES_VIDES);
  });

  it("chaque type ramène son champ à la valeur de FILTRES_VIDES sans toucher aux autres", () => {
    const champsParType: Record<Pastille["type"], (keyof FiltresTransactions)[]> = {
      PLAGE: ["du", "au"],
      TOUTES_DATES: ["toutesDates"],
      TEXTE: ["texte"],
      COMPTE: ["comptes"],
      SOUS_CATEGORIE: ["sousCategories"],
      NON_CATEGORISEE: ["nonCategorisee"],
      BENEFICIAIRE: ["beneficiaires"],
      ETIQUETTE: ["etiquettes"],
      MONTANT_MIN: ["montantMinCents"],
      MONTANT_MAX: ["montantMaxCents"],
      SENS: ["sens"],
      A_REVOIR: ["aRevoir"],
      VIREMENTS: ["virements"],
      RECURRENCES: ["recurrences"],
      VENTILEES: ["ventileesSeulement"],
      EXCLUE_BUDGET: ["exclueDuBudget"],
      EXCLUE_RAPPORTS: ["exclueDesRapports"],
    };
    const cles = Object.keys(FILTRES_PLEINS) as (keyof FiltresTransactions)[];
    const vues = new Set<Pastille["type"]>();
    for (const pastille of pastillesActives(FILTRES_PLEINS)) {
      vues.add(pastille.type);
      const apres = retirerPastille(FILTRES_PLEINS, pastille);
      const attendus = champsParType[pastille.type];
      // Les listes (comptes, etc.) perdent seulement la valeur ciblée : leur retrait unitaire est couvert plus haut.
      const listes: (keyof FiltresTransactions)[] = ["comptes", "sousCategories", "etiquettes", "beneficiaires"];
      for (const cle of cles) {
        if (attendus.includes(cle)) {
          if (!listes.includes(cle)) {
            expect(apres[cle], `${pastille.type} → ${cle}`).toEqual(FILTRES_VIDES[cle]);
          }
        } else {
          expect(apres[cle], `${pastille.type} ne doit pas toucher ${cle}`).toEqual(FILTRES_PLEINS[cle]);
        }
      }
    }
    expect([...vues].sort()).toEqual(Object.keys(champsParType).sort());
  });
});

describe("curseurApres", () => {
  const ligne = { id: "x", date: "2026-01-02", montantCents: -500 };

  it("DATE", () => {
    expect(curseurApres(ligne, "DATE")).toEqual({ champ: "DATE", date: "2026-01-02", id: "x" });
  });

  it("MONTANT", () => {
    expect(curseurApres(ligne, "MONTANT")).toEqual({ champ: "MONTANT", montantCents: -500, id: "x" });
  });
});

describe("comparerLignes", () => {
  const base = { date: "2026-01-01", montantCents: -100 };

  it("à clé égale, l'id départage dans le sens du tri", () => {
    const a = { ...base, id: "a" };
    const b = { ...base, id: "b" };
    expect(comparerLignes(a, b, { champ: "DATE", ordre: "ASC" })).toBeLessThan(0);
    expect(comparerLignes(a, b, { champ: "DATE", ordre: "DESC" })).toBeGreaterThan(0);
  });

  it("ordre de code, pas ordre alphabétique de la locale", () => {
    const tri = { champ: "DATE", ordre: "ASC" } as const;
    expect(comparerLignes({ ...base, id: "a" }, { ...base, id: "b" }, tri)).toBeLessThan(0);
    expect(comparerLignes({ ...base, id: "B" }, { ...base, id: "a" }, tri)).toBeLessThan(0);
  });

  it("un montant négatif précède un positif en ASC (valeur signée)", () => {
    const sortie = { id: "a", date: "2026-01-01", montantCents: -5000 };
    const entree = { id: "b", date: "2026-01-01", montantCents: 100 };
    expect(comparerLignes(sortie, entree, { champ: "MONTANT", ordre: "ASC" })).toBeLessThan(0);
    expect(comparerLignes(sortie, entree, { champ: "MONTANT", ordre: "DESC" })).toBeGreaterThan(0);
  });

  it("DATE DESC : la plus récente d'abord", () => {
    const recente = { id: "a", date: "2026-02-01", montantCents: 0 };
    const ancienne = { id: "b", date: "2026-01-01", montantCents: 0 };
    expect(comparerLignes(recente, ancienne, { champ: "DATE", ordre: "DESC" })).toBeLessThan(0);
  });
});
