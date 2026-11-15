import { describe, expect, it } from "vitest";
import { analyserReleve, lireMontant } from "./analyser";
import { DESJARDINS_ACCESD, profilImportParId } from "./profils";
import type { ProfilImport, RegleSigne } from "./types";

const ANNEE = 2026;

describe("analyserReleve — cas nominal", () => {
  it("reconnaît une ligne de compte chèque complète", () => {
    const ligne = "31 Août Achat /CAFE LUCIOLE (VALBRUM −7,85 $";

    const resultat = analyserReleve(ligne, DESJARDINS_ACCESD, ANNEE);

    expect(resultat).toEqual({
      reconnues: [
        {
          numeroLigne: 1,
          ligneBrute: ligne,
          date: "2026-08-31",
          typeOperation: "Achat",
          description: "CAFE LUCIOLE (VALBRUM",
          montantCents: -785,
        },
      ],
      rejetees: [],
    });
  });
});

describe("analyserReleve — montants et cents", () => {
  it("préserve les cents sur un séparateur de milliers insécable, sans jamais retomber sur un multiple de 100 par arrondi", () => {
    const positif = analyserReleve("31 Août X 1 234,56 $", DESJARDINS_ACCESD, ANNEE);
    expect(positif.reconnues[0]?.montantCents).toBe(-123456);

    const negatifExplicite = analyserReleve("31 Août X −2 000,00 $", DESJARDINS_ACCESD, ANNEE);
    expect(negatifExplicite.reconnues[0]?.montantCents).toBe(-200000);
  });

  it("lit un montant à sept chiffres avec séparateurs de milliers répétés", () => {
    const resultat = analyserReleve("31 Août X 1 234 567,89 $", DESJARDINS_ACCESD, ANNEE);

    expect(resultat.reconnues[0]?.montantCents).toBe(-123456789);
  });
});

describe("analyserReleve — règle de signe PLUS_EXPLICITE", () => {
  it("seul le + explicite marque une entrée, tout le reste sort", () => {
    const entree = analyserReleve("31 Août X +38,60 $", DESJARDINS_ACCESD, ANNEE);
    expect(entree.reconnues[0]?.montantCents).toBe(3860);

    const sansSigne = analyserReleve("31 Août X 36,77 $", DESJARDINS_ACCESD, ANNEE);
    expect(sansSigne.reconnues[0]?.montantCents).toBe(-3677);

    const moinsTypographique = analyserReleve("31 Août X −15,95 $", DESJARDINS_ACCESD, ANNEE);
    expect(moinsTypographique.reconnues[0]?.montantCents).toBe(-1595);
  });
});

describe("analyserReleve — règle de signe MOINS_EXPLICITE (profil fabriqué)", () => {
  const profilMoinsExplicite: ProfilImport = {
    ...DESJARDINS_ACCESD,
    regleSigne: "MOINS_EXPLICITE" satisfies RegleSigne,
  };

  it("seul le − explicite marque une sortie, tout le reste entre", () => {
    const sansSigne = analyserReleve("31 Août X 36,77 $", profilMoinsExplicite, ANNEE);
    expect(sansSigne.reconnues[0]?.montantCents).toBe(3677);

    const moinsTypographique = analyserReleve("31 Août X −15,95 $", profilMoinsExplicite, ANNEE);
    expect(moinsTypographique.reconnues[0]?.montantCents).toBe(-1595);

    const plusExplicite = analyserReleve("31 Août X +38,60 $", profilMoinsExplicite, ANNEE);
    expect(plusExplicite.reconnues[0]?.montantCents).toBe(3860);
  });
});

describe("analyserReleve — rejets datés", () => {
  it("une ligne de solde seule (sans date) est rejetée AUCUNE_DATE et ne produit aucune reconnue", () => {
    const resultat = analyserReleve("412,35 $", DESJARDINS_ACCESD, ANNEE);

    expect(resultat.reconnues).toEqual([]);
    expect(resultat.rejetees).toEqual([{ numeroLigne: 1, ligneBrute: "412,35 $", raison: "AUCUNE_DATE" }]);
  });

  it("un en-tête de bloc au mois collé à un chiffre est AUCUNE_DATE, jamais MOIS_INCONNU", () => {
    const resultat = analyserReleve("31 AOÛ31 Août", DESJARDINS_ACCESD, ANNEE);

    expect(resultat.rejetees).toEqual([{ numeroLigne: 1, ligneBrute: "31 AOÛ31 Août", raison: "AUCUNE_DATE" }]);
  });

  it("un mois mal orthographié (accent différent) est MOIS_INCONNU et ne produit aucune date", () => {
    const resultat = analyserReleve("31 Aoüt Achat /CAFE LUCIOLE (VALBRUM −11,40 $", DESJARDINS_ACCESD, ANNEE);

    expect(resultat.reconnues).toEqual([]);
    expect(resultat.rejetees).toEqual([
      { numeroLigne: 1, ligneBrute: "31 Aoüt Achat /CAFE LUCIOLE (VALBRUM −11,40 $", raison: "MOIS_INCONNU" },
    ]);
  });

  it("un mois sans accent est aussi MOIS_INCONNU : la comparaison n'aplatit pas les accents", () => {
    const resultat = analyserReleve("31 Aout Achat X −11,40 $", DESJARDINS_ACCESD, ANNEE);

    expect(resultat.rejetees).toEqual([
      { numeroLigne: 1, ligneBrute: "31 Aout Achat X −11,40 $", raison: "MOIS_INCONNU" },
    ]);
  });

  it("une ligne datée sans montant est AUCUN_MONTANT", () => {
    const resultat = analyserReleve("27 Août Paie /Atelier Quenouille", DESJARDINS_ACCESD, ANNEE);

    expect(resultat.rejetees).toEqual([
      { numeroLigne: 1, ligneBrute: "27 Août Paie /Atelier Quenouille", raison: "AUCUN_MONTANT" },
    ]);
  });

  it("un $ collé à un suffixe (CAD) qui ressemble à un montant est MONTANT_ILLISIBLE", () => {
    const ligne = "31 Août Dépôt direct /Galet Commerce Ca +38,60 $CAD";
    const resultat = analyserReleve(ligne, DESJARDINS_ACCESD, ANNEE);

    expect(resultat.rejetees).toEqual([{ numeroLigne: 1, ligneBrute: ligne, raison: "MONTANT_ILLISIBLE" }]);
  });

  it("une ligne sans date et sans montant sort avec la raison de la date (priorité)", () => {
    const resultat = analyserReleve("texte de bruit quelconque", DESJARDINS_ACCESD, ANNEE);

    expect(resultat.rejetees).toEqual([
      { numeroLigne: 1, ligneBrute: "texte de bruit quelconque", raison: "AUCUNE_DATE" },
    ]);
  });

  it("une date impossible (31 février) est rejetée AUCUNE_DATE sans lever", () => {
    expect(() => analyserReleve("31 Février Achat 10,00 $", DESJARDINS_ACCESD, ANNEE)).not.toThrow();

    const resultat = analyserReleve("31 Février Achat 10,00 $", DESJARDINS_ACCESD, ANNEE);
    expect(resultat.rejetees).toEqual([
      { numeroLigne: 1, ligneBrute: "31 Février Achat 10,00 $", raison: "AUCUNE_DATE" },
    ]);
  });
});

describe("analyserReleve — ne lève jamais", () => {
  it("un texte vide retourne des listes vides", () => {
    expect(analyserReleve("", DESJARDINS_ACCESD, ANNEE)).toEqual({ reconnues: [], rejetees: [] });
  });

  it("un texte de bruit sans aucune ligne exploitable ne lève jamais", () => {
    const bruit = "###\n???\n\t\n   \nfoo bar baz";

    expect(() => analyserReleve(bruit, DESJARDINS_ACCESD, ANNEE)).not.toThrow();
  });
});

describe("analyserReleve — description", () => {
  // La ligne est copiée telle quelle de visa-desjardins.txt (ligne 14), sans
  // signe explicite : c'est le cas que docs/lot-m1.md §5.6 désigne nommément.
  // Une ligne fabriquée avec un « − » explicite neutraliserait le défaut que
  // ce test existe pour attraper (frontière gauche du motif, §5.4).
  it("retire la date et le montant, compresse les espaces, et garde un suffixe de référence intact", () => {
    const ligne = "22 Février Boutique Web Ca Qz37*9kb2 164,90 $";

    const resultat = analyserReleve(ligne, DESJARDINS_ACCESD, ANNEE);

    expect(resultat.reconnues[0]?.description).toBe("Boutique Web Ca Qz37*9kb2");
    expect(resultat.reconnues[0]?.montantCents).toBe(-16490);
  });

  it("une description contenant un nom de mois n'est pas confondue avec la date", () => {
    const resultat = analyserReleve(
      "3 Août Paiement internet de /ZORVANE/juillet +60,00 $",
      DESJARDINS_ACCESD,
      ANNEE,
    );

    expect(resultat.reconnues).toEqual([
      {
        numeroLigne: 1,
        ligneBrute: "3 Août Paiement internet de /ZORVANE/juillet +60,00 $",
        date: "2026-08-03",
        typeOperation: "Paiement internet de",
        description: "ZORVANE/juillet",
        montantCents: 6000,
      },
    ]);
  });

  it("un libellé bourré de chiffres reste intact et le montant est lu correctement", () => {
    const resultat = analyserReleve("4 Février Pixelia I07215-5550282 16,50 $", DESJARDINS_ACCESD, ANNEE);

    expect(resultat.reconnues[0]?.description).toBe("Pixelia I07215-5550282");
    expect(resultat.reconnues[0]?.montantCents).toBe(-1650);
  });
});

describe("analyserReleve — type d'opération (A1)", () => {
  it("sépare le type du marchand, nettoie la barre finale, garde la ligne brute intacte", () => {
    const ligne = "18 Août Virement Interac à /Odile ferland  / −25,00 $";

    const resultat = analyserReleve(ligne, DESJARDINS_ACCESD, ANNEE);

    expect(resultat.reconnues).toEqual([
      {
        numeroLigne: 1,
        ligneBrute: ligne,
        date: "2026-08-18",
        typeOperation: "Virement Interac à",
        description: "Odile ferland",
        montantCents: -2500,
      },
    ]);
  });

  it("une ligne Visa « Paiement. » n'a pas de type d'opération", () => {
    const resultat = analyserReleve("14 Septembre Paiement. +8,75 $", DESJARDINS_ACCESD, ANNEE);

    expect(resultat.reconnues[0]).toMatchObject({
      typeOperation: null,
      description: "Paiement.",
      montantCents: 875,
    });
  });
});

describe("lireMontant", () => {
  it("lit un montant positif explicite", () => {
    expect(lireMontant("\t\t+0,28 $\t", DESJARDINS_ACCESD)).toBe(28);
  });

  it("lit un montant négatif typographique", () => {
    expect(lireMontant("\t−278,30 $\t", DESJARDINS_ACCESD)).toBe(-27830);
  });

  it("rend null sans montant lisible", () => {
    expect(lireMontant("aucun montant", DESJARDINS_ACCESD)).toBeNull();
  });

  it("normalise un montant nul en 0, jamais -0", () => {
    expect(Object.is(lireMontant("0,00 $", DESJARDINS_ACCESD), 0)).toBe(true);
    expect(Object.is(lireMontant("−0,00 $", DESJARDINS_ACCESD), 0)).toBe(true);
  });

  it("reconnaît une ligne à 0,00 $ avec montantCents: 0 (pas -0)", () => {
    const resultat = analyserReleve("31 Août Frais annulés 0,00 $", DESJARDINS_ACCESD, ANNEE);
    expect(resultat.reconnues).toHaveLength(1);
    expect(resultat.rejetees).toHaveLength(0);
    expect(Object.is(resultat.reconnues[0]?.montantCents, 0)).toBe(true);
  });
});

describe("analyserReleve — anneeDansLaLigne (profil fabriqué)", () => {
  const profilAnneeDansLaLigne: ProfilImport = {
    ...DESJARDINS_ACCESD,
    date: {
      motif:
        /^(\d{1,2})\s+(janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)\s+(\d{4})\b/i,
      mois: DESJARDINS_ACCESD.date.mois,
      anneeDansLaLigne: true,
    },
  };

  it("l'année de la ligne l'emporte sur l'argument annee", () => {
    const resultat = analyserReleve("31 Août 2024 Achat X −10,00 $", profilAnneeDansLaLigne, ANNEE);

    expect(resultat.reconnues[0]?.date).toBe("2024-08-31");
  });

  it("groupe 3 (année) absent de la ligne ⇒ AUCUNE_DATE", () => {
    const resultat = analyserReleve("31 Août Achat X −10,00 $", profilAnneeDansLaLigne, ANNEE);

    expect(resultat.reconnues).toEqual([]);
    expect(resultat.rejetees).toEqual([
      { numeroLigne: 1, ligneBrute: "31 Août Achat X −10,00 $", raison: "AUCUNE_DATE" },
    ]);
  });
});

describe("profilImportParId", () => {
  it("retourne le profil connu par son identifiant", () => {
    expect(profilImportParId("desjardins-accesd")).toBe(DESJARDINS_ACCESD);
  });

  it("retourne null pour un identifiant inconnu", () => {
    expect(profilImportParId("inconnu")).toBeNull();
  });
});

describe("analyserReleve — le profil est une donnée", () => {
  it("un profil fabriqué à motifs entièrement différents (mois anglais, montant en point) est analysé correctement sans toucher au parser", () => {
    const profilFabrique: ProfilImport = {
      id: "fabrique",
      libelle: "Fabriqué",
      institution: "Test",
      nettoyage: { tabulationsEnSautsDeLigne: false },
      date: {
        motif:
          /^(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\b/i,
        mois: [
          "january",
          "february",
          "march",
          "april",
          "may",
          "june",
          "july",
          "august",
          "september",
          "october",
          "november",
          "december",
        ],
        anneeDansLaLigne: false,
      },
      montant: {
        motif: /([+-]?\d{1,3}(?:,\d{3})*|[+-]?\d+)\.(\d{2})\s*\$/,
        separateurDecimal: ".",
      },
      regleSigne: "PLUS_EXPLICITE",
    };

    const resultat = analyserReleve("15 August Grocery Store 12.34 $", profilFabrique, ANNEE);

    expect(resultat.reconnues).toEqual([
      {
        numeroLigne: 1,
        ligneBrute: "15 August Grocery Store 12.34 $",
        date: "2026-08-15",
        typeOperation: null,
        description: "Grocery Store",
        montantCents: -1234,
      },
    ]);
  });
});
