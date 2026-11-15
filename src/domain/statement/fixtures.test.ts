// Les fixtures, comparées à leur `.json` écrit à la main — docs/lot-m1.md §5.6.
// Les `.json` font foi : en cas d'écart, on ne les régénère jamais depuis la sortie du parser.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { analyserReleve } from "./analyser";
import { DESJARDINS_ACCESD } from "./profils";
import { controlerTotal } from "./total";
import type { RaisonRejet } from "./types";

import attenduCheque from "./fixtures/cheque-desjardins.json";
import attenduVisa from "./fixtures/visa-desjardins.json";
import attenduVisaSeptembre from "./fixtures/visa-desjardins-2026-09.json";
import attenduCasLimites from "./fixtures/cas-limites.json";
import attenduVirementCheque from "./fixtures/virement-cheque.json";
import attenduVirementVisa from "./fixtures/virement-visa.json";
import attenduNetflixConforme from "./fixtures/netflix-visa-conforme.json";
import attenduNetflixEcart from "./fixtures/netflix-visa-ecart.json";

function lireTexte(nom: string): string {
  return readFileSync(new URL(`./fixtures/${nom}.txt`, import.meta.url), "utf8");
}

function projeter(resultat: ReturnType<typeof analyserReleve>) {
  return {
    reconnues: resultat.reconnues.map(({ numeroLigne, date, typeOperation, description, montantCents }) => ({
      numeroLigne,
      date,
      typeOperation,
      description,
      montantCents,
    })),
    rejetees: resultat.rejetees.map(({ numeroLigne, raison }) => ({ numeroLigne, raison })),
  };
}

describe("fixtures — cheque-desjardins", () => {
  const texte = lireTexte("cheque-desjardins");
  const resultat = analyserReleve(texte, DESJARDINS_ACCESD, attenduCheque.annee);

  it("correspond exactement au .json attendu", () => {
    expect(projeter(resultat)).toEqual({
      reconnues: attenduCheque.reconnues,
      rejetees: attenduCheque.rejetees,
    });
  });

  it("la somme des montants reconnus vaut le Total du relevé (-27830)", () => {
    const somme = resultat.reconnues.reduce((total, ligne) => total + ligne.montantCents, 0);
    expect(somme).toBe(-27830);
  });

  it("aucune reconnue ne porte un montant de solde (le solde n'est jamais un montant)", () => {
    const soldesConnus = [41235, 42685, 205750];
    const montantsAbsolus = resultat.reconnues.map((ligne) => Math.abs(ligne.montantCents));

    for (const solde of soldesConnus) {
      expect(montantsAbsolus).not.toContain(solde);
    }
  });

  it("le montant à quatre chiffres (1 500,00 $) est lu sans perte le 2026-08-28", () => {
    expect(resultat.reconnues).toContainEqual(
      expect.objectContaining({ date: "2026-08-28", montantCents: -150000 }),
    );
  });

  it("aucune reconnue ni rejetée ne vient de la ligne 123 — la ligne Total est tronquée", () => {
    expect(resultat.reconnues.some((l) => l.numeroLigne === 123)).toBe(false);
    expect(resultat.rejetees.some((l) => l.numeroLigne === 123)).toBe(false);
  });
});

describe("fixtures — visa-desjardins", () => {
  const texte = lireTexte("visa-desjardins");
  const resultat = analyserReleve(texte, DESJARDINS_ACCESD, attenduVisa.annee);

  it("correspond exactement au .json attendu", () => {
    expect(projeter(resultat)).toEqual({
      reconnues: attenduVisa.reconnues,
      rejetees: attenduVisa.rejetees,
    });
  });

  // Le relevé porte « Total +481,06 $ » (ligne 78) ; l'anonymisation des
  // fixtures en écarte 19,00 $, écart documenté par docs/lot-m1.md
  // §5.9. C'est ce contrôle qui distingue 164,90 $ de 2 164,90 $ ligne 14.
  it("la somme des montants reconnus vaut 46206 — le Total du relevé (+481,06 $) à 19,00 $ près", () => {
    const somme = resultat.reconnues.reduce((total, ligne) => total + ligne.montantCents, 0);
    expect(somme).toBe(46206);
  });

  it("les 14 achats sans signe sont négatifs, les 3 lignes + sont positives", () => {
    const positifs = resultat.reconnues.filter((l) => l.montantCents > 0);
    const negatifs = resultat.reconnues.filter((l) => l.montantCents < 0);

    expect(positifs).toHaveLength(3);
    expect(negatifs).toHaveLength(14);
  });

  it("les deux lignes condensées (paiements) sont bien reconnues, numéros de ligne 4 et 50", () => {
    expect(resultat.reconnues).toContainEqual(
      expect.objectContaining({ numeroLigne: 4, montantCents: 18740 }),
    );
    expect(resultat.reconnues).toContainEqual(
      expect.objectContaining({ numeroLigne: 50, montantCents: 74520 }),
    );
  });

  it("sans conversion des tabulations, les deux paiements condensés disparaissent", () => {
    const profilSansTabulations = {
      ...DESJARDINS_ACCESD,
      nettoyage: { ...DESJARDINS_ACCESD.nettoyage, tabulationsEnSautsDeLigne: false },
    };

    const resultatSansTabulations = analyserReleve(texte, profilSansTabulations, attenduVisa.annee);

    expect(resultatSansTabulations.reconnues.some((l) => l.montantCents === 18740)).toBe(false);
    expect(resultatSansTabulations.reconnues.some((l) => l.montantCents === 74520)).toBe(false);
  });
});

describe("fixtures — visa-desjardins-2026-09", () => {
  const texte = lireTexte("visa-desjardins-2026-09");
  const resultat = analyserReleve(texte, DESJARDINS_ACCESD, attenduVisaSeptembre.annee);

  it("correspond exactement au .json attendu", () => {
    expect(projeter(resultat)).toEqual({
      reconnues: attenduVisaSeptembre.reconnues,
      rejetees: attenduVisaSeptembre.rejetees,
    });
  });

  it("le contrôle du total correspond au .json attendu", () => {
    expect(controlerTotal(texte, DESJARDINS_ACCESD, resultat.reconnues)).toEqual(attenduVisaSeptembre.controleTotal);
  });

  it("9 reconnues, 42 rejets tous AUCUNE_DATE, somme égale à 42", () => {
    expect(resultat.reconnues).toHaveLength(9);
    expect(resultat.rejetees).toHaveLength(42);
    expect(resultat.rejetees.every((l) => l.raison === "AUCUNE_DATE")).toBe(true);
    expect(resultat.reconnues.reduce((total, ligne) => total + ligne.montantCents, 0)).toBe(42);
  });

  it("garde d'origine : le .txt est strictement le JSON.parse du bloc json de docs/arbitrages-passe-m1.md", () => {
    const arbitrages = readFileSync(new URL("../../../docs/arbitrages-passe-m1.md", import.meta.url), "utf8");
    const blocs = [...arbitrages.matchAll(/```json\r?\n([\s\S]*?)\r?\n```/g)];
    expect(blocs).toHaveLength(1);
    expect(texte).toBe(JSON.parse(blocs[0]?.[1] ?? "null"));
  });
});

describe("fixtures — contrôle du total des fixtures existantes", () => {
  it("cheque-desjardins", () => {
    const resultat = analyserReleve(lireTexte("cheque-desjardins"), DESJARDINS_ACCESD, attenduCheque.annee);
    expect(controlerTotal(lireTexte("cheque-desjardins"), DESJARDINS_ACCESD, resultat.reconnues)).toEqual(
      attenduCheque.controleTotal,
    );
  });

  it("visa-desjardins", () => {
    const resultat = analyserReleve(lireTexte("visa-desjardins"), DESJARDINS_ACCESD, attenduVisa.annee);
    expect(controlerTotal(lireTexte("visa-desjardins"), DESJARDINS_ACCESD, resultat.reconnues)).toEqual(
      attenduVisa.controleTotal,
    );
  });
});

describe("fixtures — cas-limites", () => {
  const texte = lireTexte("cas-limites");
  const resultat = analyserReleve(texte, DESJARDINS_ACCESD, attenduCasLimites.annee);

  it("correspond exactement au .json attendu", () => {
    expect(projeter(resultat)).toEqual({
      reconnues: attenduCasLimites.reconnues,
      rejetees: attenduCasLimites.rejetees,
    });
  });

  it("pas de ligne de total : le contrôle vaut null", () => {
    expect(controlerTotal(texte, DESJARDINS_ACCESD, resultat.reconnues)).toBeNull();
  });

  it("aucune ligne n'est reconnue : ce fichier n'est fait que de cas limites", () => {
    expect(resultat.reconnues).toEqual([]);
  });

  it("les quatre raisons de rejet sont toutes présentes", () => {
    const raisonsAttendues: RaisonRejet[] = [
      "AUCUNE_DATE",
      "AUCUN_MONTANT",
      "MOIS_INCONNU",
      "MONTANT_ILLISIBLE",
    ];
    const raisonsPresentes = new Set(resultat.rejetees.map((l) => l.raison));

    for (const raison of raisonsAttendues) {
      expect(raisonsPresentes.has(raison)).toBe(true);
    }
  });
});

describe("fixtures — virement-cheque", () => {
  const texte = lireTexte("virement-cheque");
  const resultat = analyserReleve(texte, DESJARDINS_ACCESD, attenduVirementCheque.annee);

  it("FX1 — correspond exactement au .json attendu", () => {
    expect(projeter(resultat)).toEqual({
      reconnues: attenduVirementCheque.reconnues,
      rejetees: attenduVirementCheque.rejetees,
    });
  });

  it("FX1 — pas de ligne de total : le contrôle vaut null", () => {
    expect(controlerTotal(texte, DESJARDINS_ACCESD, resultat.reconnues)).toBeNull();
  });
});

describe("fixtures — virement-visa", () => {
  const texte = lireTexte("virement-visa");
  const resultat = analyserReleve(texte, DESJARDINS_ACCESD, attenduVirementVisa.annee);

  it("FX2 — correspond exactement au .json attendu", () => {
    expect(projeter(resultat)).toEqual({
      reconnues: attenduVirementVisa.reconnues,
      rejetees: attenduVirementVisa.rejetees,
    });
  });

  it("FX2 — pas de ligne de total : le contrôle vaut null", () => {
    expect(controlerTotal(texte, DESJARDINS_ACCESD, resultat.reconnues)).toBeNull();
  });
});

describe("fixtures — netflix-visa-conforme", () => {
  const texte = lireTexte("netflix-visa-conforme");
  const resultat = analyserReleve(texte, DESJARDINS_ACCESD, attenduNetflixConforme.annee);

  it("FX3 — correspond exactement au .json attendu", () => {
    expect(projeter(resultat)).toEqual({
      reconnues: attenduNetflixConforme.reconnues,
      rejetees: attenduNetflixConforme.rejetees,
    });
  });

  it("FX3 — pas de ligne de total : le contrôle vaut null", () => {
    expect(controlerTotal(texte, DESJARDINS_ACCESD, resultat.reconnues)).toBeNull();
  });
});

describe("fixtures — netflix-visa-ecart", () => {
  const texte = lireTexte("netflix-visa-ecart");
  const resultat = analyserReleve(texte, DESJARDINS_ACCESD, attenduNetflixEcart.annee);

  it("FX4 — correspond exactement au .json attendu", () => {
    expect(projeter(resultat)).toEqual({
      reconnues: attenduNetflixEcart.reconnues,
      rejetees: attenduNetflixEcart.rejetees,
    });
  });

  it("FX4 — pas de ligne de total : le contrôle vaut null", () => {
    expect(controlerTotal(texte, DESJARDINS_ACCESD, resultat.reconnues)).toBeNull();
  });
});
