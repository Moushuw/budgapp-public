// docs/lot-m1.md §9 — preparerRevue : invariants, ordre exact des étapes,
// agrégation des inapplicables, conflitNonTranche.

import { describe, expect, it } from "vitest";
import type { RegleCategorisation } from "../categorization";
import { calculerEmpreinte } from "./empreinte";
import { normaliserDescription, normaliserNom } from "./normaliser";
import { analyserReleve, DESJARDINS_ACCESD } from "../statement";
import { formatMontant } from "../money";
import { occurrencesEnDouble, type OccurrenceCandidate } from "../recurrence";
import { serialiserPartsVentilation } from "../ventilation";
import { ciblesEnDouble, type CandidatVirement } from "../virement";
import { conflitNonTranche } from "./arbitrage";
import { preparerRevue } from "./pipeline";
import type { BeneficiaireIngestion, ContexteIngestion, FiltreIngestion, RawEntry, TransactionExistante } from "./types";

function entree(overrides: Partial<RawEntry> & { cle: string }): RawEntry {
  return {
    date: "2026-03-05",
    description: "Description",
    typeOperation: null,
    montantCents: -1000,
    accountId: "cpt-1",
    externalId: null,
    ligneBrute: null,
    numeroLigne: null,
    ...overrides,
  };
}

function contexteVide(overrides: Partial<ContexteIngestion> = {}): ContexteIngestion {
  return {
    filtres: [],
    beneficiaires: [],
    regles: [],
    existantes: [],
    transactionsAutresComptes: [],
    occurrencesOuvertes: [],
    ...overrides,
  };
}

function regle(overrides: Partial<RegleCategorisation> & { id: string }): RegleCategorisation {
  return { libelle: overrides.id, priorite: 5, actif: true, conditions: [], actions: [], ...overrides };
}

describe("preparerRevue — invariants", () => {
  it("lignes.length === entrees.length, avec un lot mêlant filtrée, doublon, quasi-doublon et ligne ordinaire", () => {
    const existante: TransactionExistante = {
      id: "tx-existante",
      accountId: "cpt-1",
      date: "2026-03-05",
      description: "Epicerie",
      descriptionNormalisee: "EPICERIE",
      montantCents: -2000,
      // Empreinte réelle (pas un jeton arbitraire) : sinon la couche 2 ne
      // correspond jamais et cette ligne retombe en QUASI_DOUBLON (couche 3).
      empreinte: calculerEmpreinte("cpt-1", "2026-03-05", -2000, "EPICERIE"),
      externalId: null,
      virement: null,
    };
    const quasiExistante: TransactionExistante = {
      id: "tx-quasi",
      accountId: "cpt-1",
      date: "2026-03-07",
      description: "Resto",
      descriptionNormalisee: "RESTO",
      montantCents: -3000,
      empreinte: "empreinte-quasi-existante",
      externalId: null,
      virement: null,
    };
    const filtres: FiltreIngestion[] = [{ id: "f1", motif: "PHARMACIE", mode: "CONTIENT" }];

    const entrees: RawEntry[] = [
      entree({ cle: "e-filtree", description: "Pharmacie Jean Coutu" }),
      entree({ cle: "e-doublon", description: "Epicerie", montantCents: -2000 }),
      entree({ cle: "e-quasi", description: "Resto", montantCents: -3000, date: "2026-03-08" }),
      entree({ cle: "e-ordinaire", description: "Abonnement quelconque" }),
    ];

    const contexte = contexteVide({ filtres, existantes: [existante, quasiExistante] });
    const resultat = preparerRevue(entrees, contexte);

    expect(resultat.lignes).toHaveLength(4);
    expect(resultat.lignes.map((l) => l.cle)).toEqual(["e-filtree", "e-doublon", "e-quasi", "e-ordinaire"]);
    expect(resultat.lignes.find((l) => l.cle === "e-filtree")?.section).toBe("FILTREES");
    expect(resultat.lignes.find((l) => l.cle === "e-doublon")?.statutDoublon).toBe("EMPREINTE_EXISTANTE");
    expect(resultat.lignes.find((l) => l.cle === "e-quasi")?.statutDoublon).toBe("QUASI_DOUBLON");
    expect(resultat.lignes.find((l) => l.cle === "e-ordinaire")?.section).toBe("A_IMPORTER");
  });

  it("ne mute ni entrees ni contexte (objets gelés : une tentative de mutation lèverait en mode strict)", () => {
    const entrees = Object.freeze([Object.freeze(entree({ cle: "e1" }))]) as readonly RawEntry[];
    const contexte = Object.freeze(
      contexteVide({
        filtres: Object.freeze([Object.freeze({ id: "f1", motif: "X", mode: "CONTIENT" as const })]),
      }),
    ) as ContexteIngestion;
    const copieEntrees = JSON.parse(JSON.stringify(entrees)) as unknown;
    const copieContexte = JSON.parse(JSON.stringify(contexte)) as unknown;

    expect(() => preparerRevue(entrees, contexte)).not.toThrow();

    expect(JSON.parse(JSON.stringify(entrees))).toEqual(copieEntrees);
    expect(JSON.parse(JSON.stringify(contexte))).toEqual(copieContexte);
  });

  it("limite : entrees vide → tout vide, aucune exception", () => {
    const resultat = preparerRevue([], contexteVide());
    expect(resultat).toEqual({
      lignes: [],
      reglesInapplicables: [],
      filtresInapplicables: [],
    });
  });
});

describe("preparerRevue — empreinte et normalisation", () => {
  it("deux entrées identiques dans le même lot produisent la même empreinte (le lot ne se dédoublonne pas contre lui-même)", () => {
    const entrees: RawEntry[] = [
      entree({ cle: "e1", description: "Café Central", montantCents: -450 }),
      entree({ cle: "e2", description: "Café Central", montantCents: -450 }),
    ];
    const resultat = preparerRevue(entrees, contexteVide());
    const [ligne1, ligne2] = resultat.lignes;
    expect(ligne1?.empreinte).toBe(ligne2?.empreinte);
    expect(ligne1?.action).toBe("IMPORTER"); // pas de dédoublonnage intra-lot dans le domaine
    expect(ligne2?.action).toBe("IMPORTER");
  });

  it("descriptionNormalisee est bien celle de normaliserDescription, et c'est elle qui entre dans l'empreinte", () => {
    const entrees: RawEntry[] = [entree({ cle: "e1", description: "Café Central 12345", montantCents: -450, accountId: "cpt-1", date: "2026-03-05" })];
    const resultat = preparerRevue(entrees, contexteVide());
    const ligne = resultat.lignes[0];
    const descriptionAttendue = normaliserDescription("Café Central 12345");
    expect(ligne?.descriptionNormalisee).toBe(descriptionAttendue);
    expect(ligne?.empreinte).toBe(calculerEmpreinte("cpt-1", "2026-03-05", -450, descriptionAttendue));
  });
});

describe("preparerRevue — ordre des étapes", () => {
  it("une ligne filtrée est quand même catégorisée (sous-catégorie posée malgré IGNORER)", () => {
    const filtres: FiltreIngestion[] = [{ id: "f1", motif: "FRAIS", mode: "CONTIENT" }];
    const regles: RegleCategorisation[] = [
      regle({
        id: "r1",
        conditions: [{ id: "c1", champ: "DESCRIPTION_NORMALISEE", operateur: "CONTIENT", valeur: "FRAIS", valeurFin: null }],
        actions: [{ id: "a1", type: "CATEGORISER", subcategoryId: "sc-frais", valeur: null, ordre: 0 }],
      }),
    ];
    const resultat = preparerRevue([entree({ cle: "e1", description: "Frais de service" })], contexteVide({ filtres, regles }));
    const ligne = resultat.lignes[0];
    expect(ligne?.action).toBe("IGNORER");
    expect(ligne?.section).toBe("FILTREES");
    expect(ligne?.subcategoryId).toBe("sc-frais");
  });

  it("payeeNom posé par RENOMMER_BENEFICIAIRE et résolu → payeeId écrasé, payeeNouveauNom null", () => {
    const beneficiaires: BeneficiaireIngestion[] = [
      { id: "b-hydro", nom: "Hydro-Québec", nomNormalise: "HYDRO-QUEBEC", sousCategorieParDefautId: null, autoCategorisation: true, categorieVerrouillee: false },
    ];
    const regles: RegleCategorisation[] = [
      regle({
        id: "r-renommer",
        conditions: [{ id: "c1", champ: "DESCRIPTION_NORMALISEE", operateur: "CONTIENT", valeur: "HYDRO", valeurFin: null }],
        actions: [{ id: "a1", type: "RENOMMER_BENEFICIAIRE", subcategoryId: null, valeur: "Hydro-Québec", ordre: 0 }],
      }),
    ];
    const resultat = preparerRevue(
      [entree({ cle: "e1", description: "HYDRO PAIEMENT COMPTE" })],
      contexteVide({ regles, beneficiaires }),
    );
    const ligne = resultat.lignes[0];
    expect(ligne?.payeeId).toBe("b-hydro");
    expect(ligne?.payeeNouveauNom).toBeNull();
  });

  it("payeeNom posé et introuvable → payeeId conservé, payeeNouveauNom renseigné", () => {
    const regles: RegleCategorisation[] = [
      regle({
        id: "r-renommer",
        conditions: [{ id: "c1", champ: "DESCRIPTION_NORMALISEE", operateur: "CONTIENT", valeur: "HQ", valeurFin: null }],
        actions: [{ id: "a1", type: "RENOMMER_BENEFICIAIRE", subcategoryId: null, valeur: "Hydro-Québec Nouveau", ordre: 0 }],
      }),
    ];
    const resultat = preparerRevue([entree({ cle: "e1", description: "HQ PAIEMENT COMPTE" })], contexteVide({ regles }));
    const ligne = resultat.lignes[0];
    expect(ligne?.payeeId).toBeNull();
    expect(ligne?.payeeNouveauNom).toBe("Hydro-Québec Nouveau");
  });
});

describe("preparerRevue — conflit à priorité égale", () => {
  it("reglesEnConflit porte les deux ids, conflits porte le créneau et les deux valeurs candidates", () => {
    const regles: RegleCategorisation[] = [
      regle({
        id: "r-a",
        libelle: "Resto A",
        priorite: 5,
        conditions: [{ id: "ca", champ: "DESCRIPTION_NORMALISEE", operateur: "CONTIENT", valeur: "RESTO", valeurFin: null }],
        actions: [{ id: "aa", type: "CATEGORISER", subcategoryId: "sc-a", valeur: null, ordre: 0 }],
      }),
      regle({
        id: "r-b",
        libelle: "Resto B",
        priorite: 5,
        conditions: [{ id: "cb", champ: "DESCRIPTION_NORMALISEE", operateur: "CONTIENT", valeur: "RESTO", valeurFin: null }],
        actions: [{ id: "ab", type: "CATEGORISER", subcategoryId: "sc-b", valeur: null, ordre: 0 }],
      }),
    ];
    const resultat = preparerRevue([entree({ cle: "e1", description: "Resto Chez Nous" })], contexteVide({ regles }));
    const ligne = resultat.lignes[0];
    expect(ligne?.reglesEnConflit).toEqual(["r-a", "r-b"]);
    expect(ligne?.subcategoryId).toBeNull();
    expect(ligne?.aRevoir).toBe(true);
    expect(ligne?.conflits).toHaveLength(1);
    expect(ligne?.conflits[0]?.slot).toBe("SOUS_CATEGORIE");
    expect(ligne?.conflits[0]?.candidats.map((c) => c.valeur).sort()).toEqual(["sc-a", "sc-b"]);
  });
});

describe("preparerRevue — agrégation", () => {
  it("une règle mal configurée n'apparaît qu'une fois dans reglesInapplicables même sur dix lignes", () => {
    const regles: RegleCategorisation[] = [regle({ id: "r-cassee", conditions: [] })];
    const entrees = Array.from({ length: 10 }, (_, i) => entree({ cle: `e${i}`, description: `Ligne ${i}` }));
    const resultat = preparerRevue(entrees, contexteVide({ regles }));
    expect(resultat.reglesInapplicables).toHaveLength(1);
    expect(resultat.reglesInapplicables[0]?.ruleId).toBe("r-cassee");
    expect(resultat.reglesInapplicables[0]?.motif).toBe("AUCUNE_CONDITION");
  });

  it("un filtre à regex invalide n'apparaît qu'une fois dans filtresInapplicables", () => {
    const filtres: FiltreIngestion[] = [{ id: "f-cassee", motif: "[", mode: "REGEX" }];
    const entrees = Array.from({ length: 5 }, (_, i) => entree({ cle: `e${i}`, description: `Ligne ${i}` }));
    const resultat = preparerRevue(entrees, contexteVide({ filtres }));
    expect(resultat.filtresInapplicables).toHaveLength(1);
    expect(resultat.filtresInapplicables[0]?.filtreId).toBe("f-cassee");
  });

});

describe("preparerRevue — VENTILER (docs/lot-m2.md §4.3)", () => {
  const PARTS = serialiserPartsVentilation([
    { subcategoryId: "A", partMille: 333 },
    { subcategoryId: "B", partMille: 333 },
    { subcategoryId: "C", partMille: 334 },
  ]);
  const CONDITION_VENTIL = [
    { id: "c1", champ: "DESCRIPTION_NORMALISEE", operateur: "CONTIENT", valeur: "VENTIL", valeurFin: null },
  ] as const;
  function regleVentiler(id = "r-ventile", valeur: string | null = PARTS, priorite = 5): RegleCategorisation {
    return regle({
      id,
      priorite,
      conditions: [...CONDITION_VENTIL],
      actions: [{ id: `a-${id}`, type: "VENTILER", subcategoryId: null, valeur, ordre: 0 }],
    });
  }
  const ligneVentil = entree({ cle: "e1", description: "Ventiler quelque chose", montantCents: -10001 });

  it("IV1 — la ventilation posée par une règle, montants de repartirParPourMille", () => {
    const resultat = preparerRevue([ligneVentil], contexteVide({ regles: [regleVentiler()] }));
    const ligne = resultat.lignes[0];
    expect(ligne?.subcategoryId).toBeNull();
    expect(ligne?.ventilation).toEqual([
      { subcategoryId: "A", montantCents: -3330 },
      { subcategoryId: "B", montantCents: -3330 },
      { subcategoryId: "C", montantCents: -3341 },
    ]);
    expect(ligne?.regleAppliqueeId).toBe("r-ventile");
    expect(ligne?.aRevoir).toBe(false);
    expect(ligne?.conflits).toEqual([]);
  });

  it("IV2 — VENTILER contre CATEGORISER à priorité égale : conflit, rien de posé", () => {
    const categoriser = regle({
      id: "r-cat",
      priorite: 5,
      conditions: [...CONDITION_VENTIL],
      actions: [{ id: "a-cat", type: "CATEGORISER", subcategoryId: "sc-x", valeur: null, ordre: 0 }],
    });
    const resultat = preparerRevue([ligneVentil], contexteVide({ regles: [regleVentiler(), categoriser] }));
    const ligne = resultat.lignes[0];
    expect(ligne?.ventilation).toBeNull();
    expect(ligne?.subcategoryId).toBeNull();
    expect(ligne?.aRevoir).toBe(true);
    expect([...(ligne?.reglesEnConflit ?? [])].sort()).toEqual(["r-cat", "r-ventile"]);
  });

  it("IV3 — un bénéficiaire à catégorie verrouillée bat la ventilation", () => {
    const beneficiaires: BeneficiaireIngestion[] = [
      {
        id: "b1",
        nom: "Ventiler quelque chose",
        nomNormalise: normaliserNom("Ventiler quelque chose"),
        sousCategorieParDefautId: "sc-defaut",
        autoCategorisation: true,
        categorieVerrouillee: true,
      },
    ];
    const resultat = preparerRevue([ligneVentil], contexteVide({ regles: [regleVentiler()], beneficiaires }));
    expect(resultat.lignes[0]?.ventilation).toBeNull();
    expect(resultat.lignes[0]?.subcategoryId).toBe("sc-defaut");
  });

  it("IV4 — une ventilation illisible est remontée une fois pour le lot, et aucune ligne n'est ventilée", () => {
    const entrees = Array.from({ length: 10 }, (_, i) => entree({ cle: `e${i}`, description: `Ventiler ${i}` }));
    const resultat = preparerRevue(entrees, contexteVide({ regles: [regleVentiler("r-illisible", null)] }));
    expect(resultat.reglesInapplicables).toHaveLength(1);
    expect(resultat.reglesInapplicables[0]).toMatchObject({ ruleId: "r-illisible", motif: "VENTILATION_ILLISIBLE" });
    expect(resultat.lignes.every((l) => l.ventilation === null)).toBe(true);
  });

  it("IV5 — le garde-fou actionsVentilationIgnorees n'existe plus", () => {
    const resultat = preparerRevue([ligneVentil], contexteVide({ regles: [regleVentiler()] }));
    expect("actionsVentilationIgnorees" in resultat).toBe(false);
  });

  it("IV6 — une ligne filtrée est quand même ventilée", () => {
    const filtres: FiltreIngestion[] = [{ id: "f1", motif: "VENTIL", mode: "CONTIENT" }];
    const resultat = preparerRevue([ligneVentil], contexteVide({ regles: [regleVentiler()], filtres }));
    const ligne = resultat.lignes[0];
    expect(ligne?.section).toBe("FILTREES");
    expect(ligne?.ventilation).toHaveLength(3);
  });
});

describe("preparerRevue — virements (docs/lot-m2.md §4.5)", () => {
  const CONDITION_PAIEMENT = [
    { id: "c1", champ: "DESCRIPTION_NORMALISEE", operateur: "CONTIENT", valeur: "PAIEMENT", valeurFin: null },
  ] as const;
  const ligne = entree({ cle: "e1", description: "Paiement carte", montantCents: 48713, accountId: "visa", date: "2026-05-14" });

  function candidat(id: string, surcharge: Partial<CandidatVirement> = {}): CandidatVirement {
    return {
      id,
      accountId: "cheque",
      date: "2026-05-12",
      montantCents: -48713,
      parentId: null,
      estVentilee: false,
      transferTransactionId: null,
      compteNom: "Chèque",
      description: "VISA DESJARDINS",
      sousCategorieNom: null,
      ...surcharge,
    };
  }

  const categoriser = regle({
    id: "r-cat",
    conditions: [...CONDITION_PAIEMENT],
    actions: [{ id: "a-cat", type: "CATEGORISER", subcategoryId: "sc-x", valeur: null, ordre: 0 }],
  });

  it("PV1 — zéro candidat : catégorisation intacte, rien de retiré", () => {
    const l = preparerRevue([ligne], contexteVide({ regles: [categoriser] })).lignes[0];
    expect(l?.candidatsVirement).toEqual([]);
    expect(l?.virementAvec).toBeNull();
    expect(l?.subcategoryId).toBe("sc-x");
    expect(l?.regleAppliqueeId).toBe("r-cat");
    expect(l?.categorisationRetiree).toBeNull();
  });

  it("PV2 — un candidat et une règle CATEGORISER : pré-rempli, catégorisation vidée et consignée, ETIQUETER et NOTER conservés", () => {
    const etiqueter = regle({
      id: "r-tag",
      conditions: [...CONDITION_PAIEMENT],
      actions: [
        { id: "a-tag", type: "ETIQUETER", subcategoryId: null, valeur: "tag-1", ordre: 0 },
        { id: "a-note", type: "NOTER", subcategoryId: null, valeur: "une note", ordre: 1 },
      ],
    });
    const l = preparerRevue([ligne], contexteVide({ regles: [categoriser, etiqueter], transactionsAutresComptes: [candidat("c-1")] }))
      .lignes[0];
    expect(l?.virementAvec).toBe("c-1");
    expect(l?.subcategoryId).toBeNull();
    expect(l?.ventilation).toBeNull();
    expect(l?.regleAppliqueeId).toBeNull();
    expect(l?.categorisationRetiree).toEqual({ subcategoryId: "sc-x", ventilation: null, regleAppliqueeId: "r-cat" });
    expect(l?.tagIds).toEqual(["tag-1"]);
    expect(l?.note).toBe("une note");
  });

  it("PV3 — un candidat et une règle VENTILER : ventilation vidée, montants de repartirParPourMille consignés", () => {
    const parts = serialiserPartsVentilation([
      { subcategoryId: "A", partMille: 333 },
      { subcategoryId: "B", partMille: 333 },
      { subcategoryId: "C", partMille: 334 },
    ]);
    const ventiler = regle({
      id: "r-v",
      conditions: [...CONDITION_PAIEMENT],
      actions: [{ id: "a-v", type: "VENTILER", subcategoryId: null, valeur: parts, ordre: 0 }],
    });
    const entreeV = entree({ ...ligne, cle: "e1", montantCents: 10001 });
    // Candidat à montant opposé exact.
    const l = preparerRevue([entreeV], contexteVide({ regles: [ventiler], transactionsAutresComptes: [candidat("c-1", { montantCents: -10001 })] }))
      .lignes[0];
    expect(l?.ventilation).toBeNull();
    expect(l?.regleAppliqueeId).toBeNull();
    expect(l?.categorisationRetiree?.ventilation).toEqual([
      { subcategoryId: "A", montantCents: 3330 },
      { subcategoryId: "B", montantCents: 3330 },
      { subcategoryId: "C", montantCents: 3341 },
    ]);
    expect(l?.categorisationRetiree?.regleAppliqueeId).toBe("r-v");
  });

  it("un candidat sans catégorisation proposée : categorisationRetiree reste null", () => {
    const l = preparerRevue([ligne], contexteVide({ transactionsAutresComptes: [candidat("c-1")] })).lignes[0];
    expect(l?.virementAvec).toBe("c-1");
    expect(l?.categorisationRetiree).toBeNull();
  });

  it("PV4 — deux candidats : les deux, triés ; rien de pré-rempli ; catégorisation intacte", () => {
    const l = preparerRevue(
      [ligne],
      contexteVide({
        regles: [categoriser],
        transactionsAutresComptes: [candidat("z", { date: "2026-05-14" }), candidat("a", { date: "2026-05-12" })],
      }),
    ).lignes[0];
    expect(l?.candidatsVirement.map((c) => c.id)).toEqual(["z", "a"]);
    expect(l?.virementAvec).toBeNull();
    expect(l?.subcategoryId).toBe("sc-x");
    expect(l?.categorisationRetiree).toBeNull();
  });

  it("PV5 — une transaction du même compte n'est jamais proposée", () => {
    const l = preparerRevue([ligne], contexteVide({ transactionsAutresComptes: [candidat("c-1", { accountId: "visa" })] }))
      .lignes[0];
    expect(l?.candidatsVirement).toEqual([]);
    expect(l?.virementAvec).toBeNull();
  });

  it("PV6 — deux lignes du lot sur le même candidat : toutes deux pré-remplies, ciblesEnDouble signale la seconde", () => {
    const autre = entree({ ...ligne, cle: "e2", description: "Paiement carte bis" });
    const lignes = preparerRevue([ligne, autre], contexteVide({ transactionsAutresComptes: [candidat("c-1")] })).lignes;
    expect(lignes.map((x) => x.virementAvec)).toEqual(["c-1", "c-1"]);
    expect([...ciblesEnDouble(lignes).entries()]).toEqual([["e2", "e1"]]);
  });

  it("PV7 — une ligne VIREMENT_EXISTANT : section DOUBLONS, action IGNORER", () => {
    const existante: TransactionExistante = {
      id: "ex-1",
      accountId: "visa",
      date: "2026-05-13",
      description: "Virement depuis Chèque",
      descriptionNormalisee: "VIREMENT DEPUIS CHEQUE",
      montantCents: 48713,
      empreinte: "empreinte-virement",
      externalId: null,
      virement: { compteNom: "Chèque" },
    };
    const l = preparerRevue([ligne], contexteVide({ existantes: [existante] })).lignes[0];
    expect(l?.statutDoublon).toBe("VIREMENT_EXISTANT");
    expect(l?.section).toBe("DOUBLONS");
    expect(l?.action).toBe("IGNORER");
    expect(l?.doublonDe?.virement).toEqual({ compteNom: "Chèque" });
  });

  it("les candidats se calculent aussi pour une ligne filtrée", () => {
    const filtres: FiltreIngestion[] = [{ id: "f1", motif: "PAIEMENT", mode: "CONTIENT" }];
    const l = preparerRevue([ligne], contexteVide({ filtres, transactionsAutresComptes: [candidat("c-1")] })).lignes[0];
    expect(l?.section).toBe("FILTREES");
    expect(l?.virementAvec).toBe("c-1");
  });

  it("ne mute pas le contexte", () => {
    const autres = Object.freeze([Object.freeze(candidat("c-1"))]);
    expect(() => preparerRevue([ligne], contexteVide({ transactionsAutresComptes: autres }))).not.toThrow();
  });
});

describe("preparerRevue — bénéficiaire cherché sur la clé douce de la description brute", () => {
  function beneficiaireIngestion(id: string, nom: string): BeneficiaireIngestion {
    return {
      id,
      nom,
      nomNormalise: normaliserNom(nom),
      sousCategorieParDefautId: null,
      autoCategorisation: true,
      categorieVerrouillee: false,
    };
  }

  it("la troncature des relevés ne touche pas au bénéficiaire, mais reste dans descriptionNormalisee", () => {
    const beneficiaires = [beneficiaireIngestion("p-3b", "Les 3 Brasseurs"), beneficiaireIngestion("p-pizza", "Pizza 900")];
    const resultat = preparerRevue(
      [
        entree({ cle: "e1", description: "Les 3 Brasseurs Montreal" }),
        entree({ cle: "e2", description: "Pizza Hut 0042" }),
      ],
      contexteVide({ beneficiaires }),
    );
    expect(resultat.lignes.map((ligne) => ligne.payeeId)).toEqual(["p-3b", null]);
    // Le dédoublonnage et l'empreinte gardent la clé agressive.
    expect(resultat.lignes[0]?.descriptionNormalisee).toBe("LES");
  });
});

describe("preparerRevue — type d'opération (A1)", () => {
  it("P1 — typeOperation se retrouve dans la LigneEnRevue, null reste null", () => {
    const resultat = preparerRevue(
      [entree({ cle: "e1", typeOperation: "Achat" }), entree({ cle: "e2", typeOperation: null })],
      contexteVide(),
    );
    expect(resultat.lignes.map((l) => l.typeOperation)).toEqual(["Achat", null]);
  });

  // Le même mapping qu'analyserReleveColle (src/server/actions/import.ts).
  function entreeDepuisReleve(texte: string): RawEntry {
    const { reconnues } = analyserReleve(texte, DESJARDINS_ACCESD, 2026);
    const ligne = reconnues[0];
    if (ligne === undefined) {
      throw new Error("le relevé de test doit produire une ligne reconnue");
    }
    return {
      cle: "L1.0",
      date: ligne.date,
      description: ligne.description,
      typeOperation: ligne.typeOperation,
      montantCents: ligne.montantCents,
      accountId: "cpt-1",
      externalId: null,
      ligneBrute: ligne.ligneBrute,
      numeroLigne: ligne.numeroLigne,
    };
  }

  const RELEVE = "31 Août Achat /CAFE DEPOT −4,50 $";

  it("P2 — « Achat /CAFE DEPOT » résout le bénéficiaire, et l'empreinte porte le marchand seul", () => {
    const beneficiaires: BeneficiaireIngestion[] = [
      {
        id: "b-cafe",
        nom: "Café Dépôt",
        nomNormalise: normaliserNom("Café Dépôt"),
        sousCategorieParDefautId: null,
        autoCategorisation: true,
        categorieVerrouillee: false,
      },
    ];
    const ligne = preparerRevue([entreeDepuisReleve(RELEVE)], contexteVide({ beneficiaires })).lignes[0];

    expect(ligne?.payeeId).toBe("b-cafe");
    expect(ligne?.typeOperation).toBe("Achat");
    expect(ligne?.empreinte).toBe(calculerEmpreinte("cpt-1", "2026-08-31", -450, "CAFE DEPOT"));
  });

  it("P3 — une règle DESCRIPTION EGALE sur le marchand s'applique, COMMENCE_PAR sur le type non", () => {
    const sur = (champOperateur: "EGALE" | "COMMENCE_PAR", valeur: string, id: string) =>
      regle({
        id,
        conditions: [{ id: `c-${id}`, champ: "DESCRIPTION", operateur: champOperateur, valeur, valeurFin: null }],
        actions: [{ id: `a-${id}`, type: "CATEGORISER", subcategoryId: "sc-1", valeur: null, ordre: 0 }],
      });

    const egale = preparerRevue(
      [entreeDepuisReleve(RELEVE)],
      contexteVide({ regles: [sur("EGALE", "CAFE DEPOT", "r-egale")] }),
    ).lignes[0];
    expect(egale?.regleAppliqueeId).toBe("r-egale");

    const commencePar = preparerRevue(
      [entreeDepuisReleve(RELEVE)],
      contexteVide({ regles: [sur("COMMENCE_PAR", "ACHAT", "r-type")] }),
    ).lignes[0];
    expect(commencePar?.regleAppliqueeId).toBeNull();
    expect(commencePar?.subcategoryId).toBeNull();
  });

  it("P4 — un filtre sur le type n'écarte pas la ligne : les filtres voient le marchand (OQ1)", () => {
    const filtres: FiltreIngestion[] = [{ id: "f-type", motif: "ACHAT", mode: "CONTIENT" }];
    const ligne = preparerRevue([entreeDepuisReleve(RELEVE)], contexteVide({ filtres })).lignes[0];
    expect(ligne?.filtreId).toBeNull();
    expect(ligne?.section).toBe("A_IMPORTER");
  });

  it("un filtre sur le marchand écarte bien la ligne", () => {
    const filtres: FiltreIngestion[] = [{ id: "f-marchand", motif: "CAFE DEPOT", mode: "CONTIENT" }];
    const ligne = preparerRevue([entreeDepuisReleve(RELEVE)], contexteVide({ filtres })).lignes[0];
    expect(ligne?.filtreId).toBe("f-marchand");
  });

  it("deux types différents, même marchand, date et montant : même empreinte, les deux restent visibles", () => {
    const a = entreeDepuisReleve("31 Août Achat /CAFE DEPOT −4,50 $");
    const b = { ...entreeDepuisReleve("31 Août Paiement /CAFE DEPOT −4,50 $"), cle: "L2.0" };
    const [la, lb] = preparerRevue([a, b], contexteVide()).lignes;
    expect(la?.empreinte).toBe(lb?.empreinte);
    expect(la?.action).toBe("IMPORTER");
    expect(lb?.action).toBe("IMPORTER");
  });
});

describe("conflitNonTranche", () => {
  const conflitSousCategorie = { slot: "SOUS_CATEGORIE" as const, priorite: 5, candidats: [] };
  const conflitNote = { slot: "NOTE" as const, priorite: 5, candidats: [] };

  it("vrai sans arbitrage", () => {
    expect(conflitNonTranche([conflitSousCategorie], [])).toBe(true);
  });

  it("faux une fois le créneau arbitré", () => {
    expect(conflitNonTranche([conflitSousCategorie], ["SOUS_CATEGORIE"])).toBe(false);
  });

  it("vrai si un autre créneau reste en conflit", () => {
    expect(conflitNonTranche([conflitSousCategorie, conflitNote], ["SOUS_CATEGORIE"])).toBe(true);
  });
});

describe("preparerRevue — rapprochement (docs/lot-m3.md §4.5)", () => {
  const occ1: OccurrenceCandidate = {
    id: "occ-1",
    ruleId: "r-1",
    echeance: "2026-10-12",
    montantCents: -1799,
    libelle: "Netflix.com",
    motifRapprochement: "NETFLIX.COM",
    toleranceCents: 500,
    toleranceJours: 3,
    subcategoryId: "sc-rec",
  };
  const ligneNetflix = entree({ cle: "e1", description: "NETFLIX.COM", date: "2026-10-12", montantCents: -1799 });
  const conditionNetflix = [
    { id: "c1", champ: "DESCRIPTION_NORMALISEE", operateur: "CONTIENT", valeur: "NETFLIX", valeurFin: null },
  ] as const;

  function ctx(overrides: Partial<ContexteIngestion> = {}): ContexteIngestion {
    return contexteVide({ occurrencesOuvertes: [occ1], ...overrides });
  }

  it("PR1 — aucune occurrence : rien de proposé", () => {
    const l = preparerRevue([ligneNetflix], contexteVide()).lignes[0];
    expect(l?.candidatsOccurrence).toEqual([]);
    expect(l?.occurrenceAvec).toBeNull();
    expect(l?.categorieHeritee).toBe(false);
  });

  it("PR2 — AUTO sans règle : lien pré-rempli, sous-catégorie de la récurrence", () => {
    const sans = preparerRevue([ligneNetflix], contexteVide()).lignes[0];
    const l = preparerRevue([ligneNetflix], ctx()).lignes[0];
    expect(l?.occurrenceAvec).toBe("occ-1");
    expect(l?.subcategoryId).toBe("sc-rec");
    expect(l?.categorieHeritee).toBe(true);
    expect(l?.regleAppliqueeId).toBeNull();
    expect(l?.aRevoir).toBe(sans?.aRevoir);
  });

  it("PR3 — AUTO, occurrence sans sous-catégorie : lien posé, rien d'hérité", () => {
    const l = preparerRevue([ligneNetflix], ctx({ occurrencesOuvertes: [{ ...occ1, subcategoryId: null }] })).lignes[0];
    expect(l?.occurrenceAvec).toBe("occ-1");
    expect(l?.subcategoryId).toBeNull();
    expect(l?.categorieHeritee).toBe(false);
  });

  it("PR4 — une règle CATEGORISER l'emporte sur la récurrence", () => {
    const categoriser = regle({
      id: "r-cat",
      conditions: [...conditionNetflix],
      actions: [{ id: "a1", type: "CATEGORISER", subcategoryId: "sc-x", valeur: null, ordre: 0 }],
    });
    const l = preparerRevue([ligneNetflix], ctx({ regles: [categoriser] })).lignes[0];
    expect(l?.occurrenceAvec).toBe("occ-1");
    expect(l?.subcategoryId).toBe("sc-x");
    expect(l?.regleAppliqueeId).toBe("r-cat");
    expect(l?.categorieHeritee).toBe(false);
  });

  it("PR5 — deux règles CATEGORISER à priorité égale : le conflit reste, rien d'hérité", () => {
    const regles = ["a", "b"].map((s) =>
      regle({
        id: `r-${s}`,
        priorite: 5,
        conditions: [...conditionNetflix],
        actions: [{ id: `a-${s}`, type: "CATEGORISER", subcategoryId: `sc-${s}`, valeur: null, ordre: 0 }],
      }),
    );
    const l = preparerRevue([ligneNetflix], ctx({ regles })).lignes[0];
    expect(l?.subcategoryId).toBeNull();
    expect(l?.categorieHeritee).toBe(false);
    expect(l?.conflits).toHaveLength(1);
    expect(l?.conflits[0]?.slot).toBe("SOUS_CATEGORIE");
    expect(l?.reglesEnConflit).toEqual(["r-a", "r-b"]);
    expect(l?.occurrenceAvec).toBe("occ-1");
  });

  it("PR6 — une règle VENTILER : ventilation proposée, rien d'hérité", () => {
    const parts = serialiserPartsVentilation([
      { subcategoryId: "A", partMille: 500 },
      { subcategoryId: "B", partMille: 500 },
    ]);
    const ventiler = regle({
      id: "r-v",
      conditions: [...conditionNetflix],
      actions: [{ id: "a-v", type: "VENTILER", subcategoryId: null, valeur: parts, ordre: 0 }],
    });
    const l = preparerRevue([ligneNetflix], ctx({ regles: [ventiler] })).lignes[0];
    expect(l?.ventilation).not.toBeNull();
    expect(l?.subcategoryId).toBeNull();
    expect(l?.categorieHeritee).toBe(false);
    expect(l?.occurrenceAvec).toBe("occ-1");
  });

  it("PR7 — un candidat de virement et une occurrence : les deux pré-remplis, aucune catégorie héritée", () => {
    const entreeV = entree({ cle: "e1", description: "NETFLIX.COM", date: "2026-10-12", montantCents: -1799, accountId: "visa" });
    const candidatV: CandidatVirement = {
      id: "c-1",
      accountId: "cheque",
      date: "2026-10-12",
      montantCents: 1799,
      parentId: null,
      estVentilee: false,
      transferTransactionId: null,
      compteNom: "Chèque",
      description: "X",
      sousCategorieNom: null,
    };
    const l = preparerRevue([entreeV], ctx({ transactionsAutresComptes: [candidatV] })).lignes[0];
    expect(l?.virementAvec).toBe("c-1");
    expect(l?.occurrenceAvec).toBe("occ-1");
    expect(l?.subcategoryId).toBeNull();
    expect(l?.categorieHeritee).toBe(false);
  });

  it("PR8 — montant différent : candidat à confirmer, ce qui cloche est dit", () => {
    const l = preparerRevue([{ ...ligneNetflix, montantCents: -2499 }], ctx()).lignes[0];
    expect(l?.occurrenceAvec).toBeNull();
    expect(l?.candidatsOccurrence[0]?.cloche).toEqual([
      `montant de ${formatMontant(2499)} au lieu de ${formatMontant(1799)} attendu`,
    ]);
    expect(l?.subcategoryId).toBeNull();
    expect(l?.categorieHeritee).toBe(false);
  });

  it("PR9 — deux occurrences candidates : rien de pré-rempli, ordre d'evaluerRapprochement", () => {
    const occ2: OccurrenceCandidate = { ...occ1, id: "occ-2", ruleId: "r-2", echeance: "2026-10-14" };
    const l = preparerRevue([ligneNetflix], ctx({ occurrencesOuvertes: [occ2, occ1] })).lignes[0];
    expect(l?.occurrenceAvec).toBeNull();
    expect(l?.candidatsOccurrence.map((c) => c.occurrence.id)).toEqual(["occ-1", "occ-2"]);
  });

  it("PR10 — deux lignes du lot sur la même échéance : toutes deux pré-remplies, occurrencesEnDouble signale la seconde", () => {
    const autre = entree({ ...ligneNetflix, cle: "e2", description: "NETFLIX.COM BIS" });
    const lignes = preparerRevue([ligneNetflix, autre], ctx()).lignes;
    expect(lignes.map((x) => x.occurrenceAvec)).toEqual(["occ-1", "occ-1"]);
    expect([...occurrencesEnDouble(lignes).entries()]).toEqual([["e2", "e1"]]);
  });

  it("PR11 — une ligne EMPREINTE_EXISTANTE n'est jamais rapprochée", () => {
    const existante: TransactionExistante = {
      id: "tx-1",
      accountId: "cpt-1",
      date: "2026-10-12",
      description: "NETFLIX.COM",
      descriptionNormalisee: normaliserDescription("NETFLIX.COM"),
      montantCents: -1799,
      empreinte: calculerEmpreinte("cpt-1", "2026-10-12", -1799, normaliserDescription("NETFLIX.COM")),
      externalId: null,
      virement: null,
    };
    const l = preparerRevue([ligneNetflix], ctx({ existantes: [existante] })).lignes[0];
    expect(l?.action).toBe("IGNORER");
    expect(l?.candidatsOccurrence).toHaveLength(1);
    expect(l?.occurrenceAvec).toBeNull();
    expect(l?.categorieHeritee).toBe(false);
  });

  it("PR12 — une ligne filtrée n'est pas rapprochée, ses candidats sont calculés", () => {
    const filtres: FiltreIngestion[] = [{ id: "f1", motif: "NETFLIX", mode: "CONTIENT" }];
    const l = preparerRevue([ligneNetflix], ctx({ filtres })).lignes[0];
    expect(l?.section).toBe("FILTREES");
    expect(l?.occurrenceAvec).toBeNull();
    expect(l?.candidatsOccurrence).toHaveLength(1);
  });

  it("PR13 — un quasi-doublon (action IMPORTER) est rapproché", () => {
    const quasi: TransactionExistante = {
      id: "tx-q",
      accountId: "cpt-1",
      date: "2026-10-13",
      description: "NETFLIX.COM",
      descriptionNormalisee: normaliserDescription("NETFLIX.COM"),
      montantCents: -1799,
      empreinte: "autre-empreinte",
      externalId: null,
      virement: null,
    };
    const l = preparerRevue([ligneNetflix], ctx({ existantes: [quasi] })).lignes[0];
    expect(l?.statutDoublon).toBe("QUASI_DOUBLON");
    expect(l?.action).toBe("IMPORTER");
    expect(l?.occurrenceAvec).toBe("occ-1");
  });

  it("PR14 — la sous-catégorie par défaut du bénéficiaire passe avant la récurrence", () => {
    const beneficiaires: BeneficiaireIngestion[] = [
      {
        id: "b1",
        nom: "NETFLIX.COM",
        nomNormalise: normaliserNom("NETFLIX.COM"),
        sousCategorieParDefautId: "sc-benef",
        autoCategorisation: true,
        categorieVerrouillee: false,
      },
    ];
    const l = preparerRevue([ligneNetflix], ctx({ beneficiaires })).lignes[0];
    expect(l?.subcategoryId).toBe("sc-benef");
    expect(l?.categorieHeritee).toBe(false);
    expect(l?.occurrenceAvec).toBe("occ-1");
  });

  it("PR15 — un conflit sur la note seule ne bloque pas l'héritage (D3)", () => {
    const regles = ["a", "b"].map((s) =>
      regle({
        id: `r-${s}`,
        priorite: 5,
        conditions: [...conditionNetflix],
        actions: [{ id: `a-${s}`, type: "NOTER", subcategoryId: null, valeur: `note ${s}`, ordre: 0 }],
      }),
    );
    const l = preparerRevue([ligneNetflix], ctx({ regles })).lignes[0];
    expect(l?.conflits.map((c) => c.slot)).toEqual(["NOTE"]);
    expect(l?.subcategoryId).toBe("sc-rec");
    expect(l?.categorieHeritee).toBe(true);
  });

  it("PR16 — un contexte gelé ne lève pas", () => {
    const gele = Object.freeze({ ...ctx(), occurrencesOuvertes: Object.freeze([Object.freeze({ ...occ1 })]) }) as ContexteIngestion;
    expect(() => preparerRevue([ligneNetflix], gele)).not.toThrow();
  });

  it("PR17 — une règle sans motif n'est jamais AUTO, même aux bons date et montant", () => {
    const l = preparerRevue([ligneNetflix], ctx({ occurrencesOuvertes: [{ ...occ1, motifRapprochement: null }] })).lignes[0];
    expect(l?.occurrenceAvec).toBeNull();
    expect(l?.candidatsOccurrence).toHaveLength(1);
    expect(l?.candidatsOccurrence[0]?.cloche).toEqual(["aucun motif de description pour cette récurrence"]);
    expect(l?.categorieHeritee).toBe(false);
  });
});
