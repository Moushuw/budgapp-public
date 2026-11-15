import { describe, expect, it } from "vitest";
import {
  captureRetenue,
  dimensionsPng,
  enteteIndexCaptures,
  ErreurCaptures,
  libellePartie,
  ligneIndexCapture,
  lireFiltreCaptures,
  lireModeCaptures,
  lireProjet,
  nomFichierCapture,
  slugCapture,
  tranchesCapture,
} from "./captures-noms";

function messageDe(action: () => unknown): string {
  try {
    action();
  } catch (erreur) {
    expect(erreur).toBeInstanceOf(ErreurCaptures);
    return erreur instanceof Error ? erreur.message : "";
  }
  throw new Error("Aucun refus levé.");
}

function nbBarres(ligne: string): number {
  return (ligne.replace(/\n$/, "").match(/(?<!\\)\|/g) ?? []).length;
}

describe("lireModeCaptures", () => {
  it("K1 absent, vide ou 0 : NORMAL", () => {
    expect(lireModeCaptures({})).toBe("NORMAL");
    expect(lireModeCaptures({ BUDGAPP_E2E_CAPTURES: "" })).toBe("NORMAL");
    expect(lireModeCaptures({ BUDGAPP_E2E_CAPTURES: "0" })).toBe("NORMAL");
  });

  it("K2 1 : PASSE", () => {
    expect(lireModeCaptures({ BUDGAPP_E2E_CAPTURES: "1" })).toBe("PASSE");
  });

  it("K3 toute autre valeur est refusée en nommant la variable", () => {
    for (const valeur of ["true", "oui", "2", " 1", "1 "]) {
      expect(messageDe(() => lireModeCaptures({ BUDGAPP_E2E_CAPTURES: valeur }))).toContain("BUDGAPP_E2E_CAPTURES");
    }
  });
});

describe("lireFiltreCaptures et captureRetenue", () => {
  it("K-F1 absent ou vide : pas de filtre, tout est retenu", () => {
    expect(lireFiltreCaptures({})).toBeNull();
    expect(lireFiltreCaptures({ BUDGAPP_E2E_CAPTURES_ECRANS: " " })).toBeNull();
    expect(captureRetenue("Transactions › Détail", null)).toBe(true);
  });

  it("K-F2 motifs mis en slug, retenus par inclusion dans le slug du contexte", () => {
    const filtre = lireFiltreCaptures({ BUDGAPP_E2E_CAPTURES_ECRANS: "Transactions,Paramètres › Règles" });
    expect(filtre).toEqual(["transactions", "parametres-regles"]);
    expect(captureRetenue("Transactions › Ventilation (somme inexacte)", filtre)).toBe(true);
    expect(captureRetenue("Paramètres › Règles › Nouvelle règle", filtre)).toBe(true);
    expect(captureRetenue("Import › Revue", filtre)).toBe(false);
  });

  it("K-F3 un motif vide est refusé en nommant la variable", () => {
    expect(messageDe(() => lireFiltreCaptures({ BUDGAPP_E2E_CAPTURES_ECRANS: "import,,regles" }))).toContain(
      "BUDGAPP_E2E_CAPTURES_ECRANS",
    );
  });
});

describe("lireProjet", () => {
  it("K4 mobile et bureau passent, le reste est refusé", () => {
    expect(lireProjet("mobile")).toBe("mobile");
    expect(lireProjet("bureau")).toBe("bureau");
    expect(messageDe(() => lireProjet("chromium"))).toBe("Projet Playwright inconnu : chromium.");
  });
});

describe("slugCapture", () => {
  it("K5 retire les diacritiques et les séparateurs", () => {
    expect(slugCapture("Paramètres › Bénéficiaires › Fusionner (destination choisie)")).toBe(
      "parametres-beneficiaires-fusionner-destination-choisie",
    );
  });

  it("K6 l'apostrophe devient un tiret", () => {
    expect(slugCapture("Revue de l'import (recollage, doublons)")).toBe("revue-de-l-import-recollage-doublons");
  });

  it("K7 cas des parcours", () => {
    expect(slugCapture("Paramètres › Étiquettes › Nouvelle")).toBe("parametres-etiquettes-nouvelle");
    expect(slugCapture("Paramètres › Comptes › Nouveau compte (Carte de crédit)")).toBe(
      "parametres-comptes-nouveau-compte-carte-de-credit",
    );
  });

  it("K8 un slug vide est refusé", () => {
    expect(() => slugCapture("  ›  ")).toThrow(ErreurCaptures);
    expect(() => slugCapture("")).toThrow(ErreurCaptures);
  });

  it("K9 la longueur maximale est 100", () => {
    expect(() => slugCapture("a".repeat(101))).toThrow(ErreurCaptures);
    expect(slugCapture("a".repeat(100))).toBe("a".repeat(100));
  });
});

describe("nomFichierCapture", () => {
  it("K10 fenêtre, page, tranches et dialogue", () => {
    const base = { projet: "mobile", theme: "sombre", contexte: "Revue de l'import (cas limites)" } as const;
    const prefixe = "mobile__sombre__revue-de-l-import-cas-limites";
    expect(nomFichierCapture({ ...base, partie: { type: "fenetre" } })).toBe(`${prefixe}.png`);
    expect(nomFichierCapture({ ...base, partie: { type: "page" } })).toBe(`${prefixe}.png`);
    expect(nomFichierCapture({ ...base, partie: { type: "tranche", numero: 1, total: 4 } })).toBe(`${prefixe}__t01.png`);
    expect(nomFichierCapture({ ...base, partie: { type: "tranche", numero: 12, total: 12 } })).toBe(
      `${prefixe}__t12.png`,
    );
    expect(nomFichierCapture({ ...base, partie: { type: "dialogue" } })).toBe(`${prefixe}__dialogue.png`);
  });

  it("K11 le tri alphabétique regroupe par projet, thème puis écran", () => {
    const noms: string[] = [];
    for (const projet of ["mobile", "bureau"] as const) {
      for (const theme of ["sombre", "clair"] as const) {
        for (const contexte of ["Zeta", "Alpha"]) {
          noms.push(nomFichierCapture({ projet, theme, contexte, partie: { type: "page" } }));
        }
      }
    }
    expect([...noms].sort()).toEqual([
      "bureau__clair__alpha.png",
      "bureau__clair__zeta.png",
      "bureau__sombre__alpha.png",
      "bureau__sombre__zeta.png",
      "mobile__clair__alpha.png",
      "mobile__clair__zeta.png",
      "mobile__sombre__alpha.png",
      "mobile__sombre__zeta.png",
    ]);
  });

  it("K17 les tranches se trient dans l'ordre numérique", () => {
    const base = { projet: "mobile", theme: "clair" } as const;
    const noms = [
      nomFichierCapture({ ...base, contexte: "Alpha", partie: { type: "tranche", numero: 10, total: 10 } }),
      nomFichierCapture({ ...base, contexte: "Alpha", partie: { type: "tranche", numero: 2, total: 10 } }),
      nomFichierCapture({ ...base, contexte: "Alpha", partie: { type: "tranche", numero: 1, total: 10 } }),
      nomFichierCapture({ ...base, contexte: "Beta", partie: { type: "page" } }),
    ];
    expect([...noms].sort()).toEqual([
      "mobile__clair__alpha__t01.png",
      "mobile__clair__alpha__t02.png",
      "mobile__clair__alpha__t10.png",
      "mobile__clair__beta.png",
    ]);
  });

  it("K18 une tranche invalide est refusée par le nom et par le libellé", () => {
    const invalides = [
      { numero: 0, total: 4 },
      { numero: 5, total: 4 },
      { numero: 1, total: 1 },
      { numero: 100, total: 100 },
      { numero: 1.5, total: 4 },
      { numero: 1, total: 2.5 },
    ];
    for (const { numero, total } of invalides) {
      const partie = { type: "tranche", numero, total } as const;
      expect(
        messageDe(() => nomFichierCapture({ projet: "mobile", theme: "clair", contexte: "Alpha", partie })),
      ).toContain("Tranche de capture invalide");
      expect(messageDe(() => libellePartie(partie))).toContain("Tranche de capture invalide");
    }
  });
});

describe("tranchesCapture", () => {
  it("K15 découpe aux bornes", () => {
    expect(tranchesCapture(1)).toEqual([{ y: 0, hauteur: 1 }]);
    expect(tranchesCapture(2000)).toEqual([{ y: 0, hauteur: 2000 }]);
    expect(tranchesCapture(2001)).toEqual([
      { y: 0, hauteur: 2000 },
      { y: 2000, hauteur: 1 },
    ]);
    expect(tranchesCapture(4000)).toEqual([
      { y: 0, hauteur: 2000 },
      { y: 2000, hauteur: 2000 },
    ]);
    expect(tranchesCapture(7529)).toEqual([
      { y: 0, hauteur: 2000 },
      { y: 2000, hauteur: 2000 },
      { y: 4000, hauteur: 2000 },
      { y: 6000, hauteur: 1529 },
    ]);
  });

  it("K16 une hauteur invalide est refusée", () => {
    for (const hauteur of [0, -1, 1.5, Number.NaN]) {
      expect(messageDe(() => tranchesCapture(hauteur))).toContain("Hauteur de page invalide");
    }
  });
});

function entetePng(largeur: number, hauteur: number): number[] {
  const entier = (n: number): number[] => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
  return [
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, ...entier(largeur),
    ...entier(hauteur),
  ];
}

describe("dimensionsPng", () => {
  it("K19 lit largeur et hauteur gros-boutistes", () => {
    expect(dimensionsPng(new Uint8Array(entetePng(375, 7529)))).toEqual({ largeur: 375, hauteur: 7529 });
    expect(dimensionsPng(new Uint8Array(entetePng(1280, 70000)))).toEqual({ largeur: 1280, hauteur: 70000 });
    expect(dimensionsPng(new Uint8Array([...entetePng(375, 667), 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]))).toEqual({
      largeur: 375,
      hauteur: 667,
    });
  });

  it("K20 un en-tête illisible est refusé", () => {
    const valide = entetePng(375, 667);
    const mauvaiseSignature = [...valide];
    mauvaiseSignature[0] = 0x88;
    const mauvaisBloc = [...valide];
    mauvaisBloc.splice(12, 4, 0x49, 0x44, 0x41, 0x54);
    for (const octets of [valide.slice(0, 23), mauvaiseSignature, mauvaisBloc]) {
      expect(messageDe(() => dimensionsPng(new Uint8Array(octets)))).toBe("En-tête PNG illisible.");
    }
  });
});

describe("libellePartie", () => {
  it("K21 libellés et ligne d'index d'une tranche", () => {
    expect(libellePartie({ type: "fenetre" })).toBe("fenêtre");
    expect(libellePartie({ type: "page" })).toBe("page");
    expect(libellePartie({ type: "tranche", numero: 2, total: 4 })).toBe("tranche 2/4");
    expect(libellePartie({ type: "dialogue" })).toBe("dialogue");
    const ligne = ligneIndexCapture({
      fichier: "f__t02.png",
      partie: { type: "tranche", numero: 2, total: 4 },
      largeur: 375,
      hauteur: 2000,
      contexte: "c",
      url: "/",
      dialogue: null,
      projet: "mobile",
      theme: "clair",
    });
    expect(ligne.startsWith("| f__t02.png | tranche 2/4 | 375 × 2000 |")).toBe(true);
  });
});

describe("index", () => {
  it("K12 ligne complète", () => {
    expect(
      ligneIndexCapture({
        fichier: "fichier",
        partie: { type: "fenetre" },
        largeur: 1280,
        hauteur: 800,
        contexte: "contexte",
        url: "/parametres?onglet=comptes",
        dialogue: "Nouveau compte",
        projet: "bureau",
        theme: "clair",
      }),
    ).toBe("| fichier | fenêtre | 1280 × 800 | contexte | /parametres?onglet=comptes | Nouveau compte | bureau | clair |\n");
  });

  it("K13 dialogue nul, barre échappée, retour à la ligne neutralisé", () => {
    const ligne = ligneIndexCapture({
      fichier: "f.png",
      partie: { type: "page" },
      largeur: 375,
      hauteur: 1999,
      contexte: "a|b\nsuite",
      url: "/",
      dialogue: null,
      projet: "mobile",
      theme: "sombre",
    });
    expect(ligne).toContain("| page | 375 × 1999 |");
    expect(ligne).toContain("| — |");
    expect(ligne).toContain("a\\|b suite");
    expect(ligne.slice(0, -1)).not.toContain("\n");
  });

  it("K14 en-tête exact et neuf barres par ligne de tableau", () => {
    const entete = enteteIndexCaptures();
    expect(entete).toBe(
      [
        "# Captures e2e — mode passe",
        "",
        "Une ligne par fichier. Capture : `fenêtre` = ce que voit l'utilisateur quand un dialogue est ouvert ; `page` = page entière de 2000 px de haut au plus ; `tranche n/N` = page de plus de 2000 px découpée en N tranches de 2000 px au plus (suffixe `__tNN`), à lire dans l'ordre ; `dialogue` = élément entier d'un dialogue plus haut que la fenêtre (suffixe `__dialogue`).",
        "",
        "| Fichier | Capture | Taille (px) | Écran ou dialogue (contexte) | URL | Dialogue ouvert | Projet | Thème |",
        "|---|---|---|---|---|---|---|---|",
        "",
      ].join("\n"),
    );
    const lignes = entete.split("\n").filter((l) => l.startsWith("|"));
    expect(lignes).toHaveLength(2);
    for (const l of lignes) {
      expect(nbBarres(l)).toBe(9);
    }
    const ligne = ligneIndexCapture({
      fichier: "f.png",
      partie: { type: "page" },
      largeur: 1280,
      hauteur: 10,
      contexte: "c",
      url: "/",
      dialogue: null,
      projet: "bureau",
      theme: "clair",
    });
    expect(nbBarres(ligne)).toBe(9);
  });
});
