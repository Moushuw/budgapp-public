// docs/lot-m1.md §9 — resoudreBeneficiaire (égalité puis préfixe sur
// frontière de mot, le plus long préfixe gagne) et beneficiaireParNom. La
// règle de rapprochement (en-tête de beneficiaire.ts) est testée sur ce qui
// doit réussir ET sur ce qui doit échouer — c'est par la frontière qu'un
// préfixe se remettrait à tout capter.

import { describe, expect, it } from "vitest";
import { beneficiaireParNom, prefixeAutorise, resoudreBeneficiaire } from "./beneficiaire";
import { normaliserNom } from "./normaliser";
import type { BeneficiaireIngestion } from "./types";

function beneficiaire(overrides: Partial<BeneficiaireIngestion> & { id: string; nom: string }): BeneficiaireIngestion {
  return {
    nomNormalise: normaliserNom(overrides.nom),
    sousCategorieParDefautId: null,
    autoCategorisation: true,
    categorieVerrouillee: false,
    ...overrides,
  };
}

describe("resoudreBeneficiaire", () => {
  it("nominal : égalité de nomNormalise", () => {
    const iga = beneficiaire({ id: "b-iga", nom: "IGA", nomNormalise: "IGA" });
    const resultat = resoudreBeneficiaire("IGA", [iga]);
    expect(resultat?.id).toBe("b-iga");
  });

  it("préfixe sur frontière de mot (IGA / IGA VALBRUME)", () => {
    const iga = beneficiaire({ id: "b-iga", nom: "IGA", nomNormalise: "IGA" });
    const resultat = resoudreBeneficiaire("IGA VALBRUME", [iga]);
    expect(resultat?.id).toBe("b-iga");
  });

  it("limite : préfixe au milieu d'un mot refusé (IGA ne trouve pas IGAME, ni IGA2)", () => {
    const iga = beneficiaire({ id: "b-iga", nom: "IGA", nomNormalise: "IGA" });
    expect(resoudreBeneficiaire("IGAME QUEBEC", [iga])).toBeNull();
    expect(resoudreBeneficiaire("IGA2 VALBRUME", [iga])).toBeNull();
  });

  it("limite : le plus long préfixe gagne", () => {
    const iga = beneficiaire({ id: "b-iga", nom: "IGA", nomNormalise: "IGA" });
    const igaValbrume = beneficiaire({ id: "b-iga-valbrume", nom: "IGA Valbrume", nomNormalise: "IGA VALBRUME" });
    const resultat = resoudreBeneficiaire("IGA VALBRUME QUEBEC", [iga, igaValbrume]);
    expect(resultat?.id).toBe("b-iga-valbrume");

    // Indépendant de l'ordre de la liste.
    const resultatInverse = resoudreBeneficiaire("IGA VALBRUME QUEBEC", [igaValbrume, iga]);
    expect(resultatInverse?.id).toBe("b-iga-valbrume");
  });

  it("limite : description vide → null", () => {
    const iga = beneficiaire({ id: "b-iga", nom: "IGA", nomNormalise: "IGA" });
    expect(resoudreBeneficiaire("", [iga])).toBeNull();
  });

  it("limite : bénéficiaire au nomNormalise vide → jamais candidat", () => {
    const vide = beneficiaire({ id: "b-vide", nom: "", nomNormalise: "" });
    const resultat = resoudreBeneficiaire("N'IMPORTE QUOI", [vide]);
    expect(resultat).toBeNull();
  });

  it("déterminisme : ex æquo → premier par nom, résultat stable si on inverse la liste", () => {
    // Deux clés égales ne peuvent plus coexister en base (@@unique), mais le
    // domaine ne le suppose pas : il reste déterministe si on le lui passe.
    const alpha = beneficiaire({ id: "b-z", nom: "Alpha", nomNormalise: "MEME" });
    const zeta = beneficiaire({ id: "b-a", nom: "Zeta", nomNormalise: "MEME" });

    const resultat1 = resoudreBeneficiaire("MEME", [zeta, alpha]);
    const resultat2 = resoudreBeneficiaire("MEME", [alpha, zeta]);

    expect(resultat1?.id).toBe("b-z"); // "Alpha" < "Zeta"
    expect(resultat2?.id).toBe("b-z");
  });
});

describe("beneficiaireParNom", () => {
  it("trouve par normalisation (Hydro-Québec → HYDRO-QUEBEC)", () => {
    const hydro = beneficiaire({ id: "b-hydro", nom: "Hydro-Québec", nomNormalise: "HYDRO-QUEBEC" });
    const resultat = beneficiaireParNom("Hydro-Québec", [hydro]);
    expect(resultat?.id).toBe("b-hydro");
  });

  it("introuvable → null", () => {
    const hydro = beneficiaire({ id: "b-hydro", nom: "Hydro-Québec", nomNormalise: "HYDRO-QUEBEC" });
    expect(beneficiaireParNom("Bell Canada", [hydro])).toBeNull();
  });

  it("nom vide → null", () => {
    const hydro = beneficiaire({ id: "b-hydro", nom: "Hydro-Québec", nomNormalise: "HYDRO-QUEBEC" });
    expect(beneficiaireParNom("", [hydro])).toBeNull();
  });

  it("jamais par préfixe (contrairement à resoudreBeneficiaire)", () => {
    const iga = beneficiaire({ id: "b-iga", nom: "IGA", nomNormalise: "IGA" });
    expect(beneficiaireParNom("IGA Valbrume", [iga])).toBeNull();
  });
});

describe("règle de rapprochement — ce qui doit réussir", () => {
  const b = (nom: string) => beneficiaire({ id: `b-${nom}`, nom });

  it("séparateurs : espace, astérisque, point, dièse", () => {
    expect(resoudreBeneficiaire("IGA VALBRUME", [b("IGA")])?.nom).toBe("IGA");
    expect(resoudreBeneficiaire("Amzn Mktp Ca*2K4LM9", [b("AMZN MKTP CA")])?.nom).toBe("AMZN MKTP CA");
    expect(resoudreBeneficiaire("NETFLIX.COM", [b("Netflix")])?.nom).toBe("Netflix");
    expect(resoudreBeneficiaire("A&W #1234 VALBRUME", [b("A&W")])?.nom).toBe("A&W");
  });

  it("casse, accents et espaces multiples ne comptent pas, des deux côtés", () => {
    expect(resoudreBeneficiaire("CAFE   DEPOT 0042", [b("Café Dépôt")])?.nom).toBe("Café Dépôt");
  });

  it("les jetons numériques sont gardés : Les 3 Brasseurs et Les 5 Saisons restent distincts", () => {
    const brasseurs = b("Les 3 Brasseurs");
    const saisons = b("Les 5 Saisons");
    expect(resoudreBeneficiaire("LES 3 BRASSEURS MONTREAL", [saisons, brasseurs])?.nom).toBe("Les 3 Brasseurs");
    expect(resoudreBeneficiaire("LES 5 SAISONS", [brasseurs, saisons])?.nom).toBe("Les 5 Saisons");
    expect(resoudreBeneficiaire("PETRO-CANADA 07421 VALBRUME", [b("Petro-Canada")])?.nom).toBe("Petro-Canada");
  });

  it("A&W, trois caractères de mot, se reconnaît aussi par égalité", () => {
    expect(resoudreBeneficiaire("A&w", [b("A&W")])?.nom).toBe("A&W");
  });

  it("l'égalité exacte n'a pas de longueur minimale : BP reconnaît BP, 3M reconnaît 3M", () => {
    expect(resoudreBeneficiaire("BP", [b("BP")])?.nom).toBe("BP");
    expect(resoudreBeneficiaire("  bp ", [b("BP")])?.nom).toBe("BP");
    expect(resoudreBeneficiaire("3M", [b("3M")])?.nom).toBe("3M");
  });

  it("un nom court reconnu par égalité ne gêne pas un préfixe plus long sur une autre ligne", () => {
    const liste = [b("BP"), b("BP Canada")];
    expect(resoudreBeneficiaire("BP", liste)?.nom).toBe("BP");
    expect(resoudreBeneficiaire("BP CANADA 0042", liste)?.nom).toBe("BP Canada");
  });
});

describe("règle de rapprochement — ce qui doit échouer", () => {
  const b = (nom: string) => beneficiaire({ id: `b-${nom}`, nom });

  it("un bénéficiaire nommé « A » ne capte pas « A&W » (longueur et liant, chacun suffit)", () => {
    expect(resoudreBeneficiaire("A&W", [b("A")])).toBeNull();
    // Longueur seule : l'espace serait une frontière valide.
    expect(resoudreBeneficiaire("A W", [b("A")])).toBeNull();
    // Liant seul : trois caractères de mot, mais « & » soude le nom.
    expect(resoudreBeneficiaire("ABC&D", [b("ABC")])).toBeNull();
  });

  it("l'apostrophe soude aussi : MCDONALD ne capte pas MCDONALD'S", () => {
    expect(resoudreBeneficiaire("MCDONALD'S #123", [b("McDonald")])).toBeNull();
  });

  it("un nom d'une ou deux lettres ne capte rien par préfixe", () => {
    expect(resoudreBeneficiaire("LE CAFE DU COIN", [b("Le")])).toBeNull();
    expect(resoudreBeneficiaire("BP GAS", [b("BP")])).toBeNull();
    expect(resoudreBeneficiaire("BP #4521", [b("BP")])).toBeNull();
    expect(resoudreBeneficiaire("3M CANADA", [b("3M")])).toBeNull();
  });

  it("de la ponctuation seule ne compte pas comme des lettres", () => {
    expect(resoudreBeneficiaire("... ET LE RESTE", [b("...")])).toBeNull();
  });

  it("un nom à chiffres ne capte plus ce que la troncature lui donnait", () => {
    // Avec normaliserDescription, « Pizza 900 » devenait « PIZZA » et captait
    // tout ce qui commence par PIZZA.
    expect(resoudreBeneficiaire("PIZZA HUT", [b("Pizza 900")])).toBeNull();
    expect(resoudreBeneficiaire("PIZZA PIZZA 1234", [b("Pizza 900")])).toBeNull();
    expect(resoudreBeneficiaire("MICROSOFT*XBOX", [b("MICROSOFT 365")])).toBeNull();
    expect(resoudreBeneficiaire("LES CAFES SECOND CUP", [b("Les 3 Brasseurs")])).toBeNull();
  });
});

describe("prefixeAutorise", () => {
  it("compte les caractères de mot, pas la ponctuation", () => {
    expect(prefixeAutorise("IGA")).toBe(true);
    expect(prefixeAutorise("A&W")).toBe(true);
    expect(prefixeAutorise("H&M")).toBe(true);
    expect(prefixeAutorise("BP")).toBe(false);
    expect(prefixeAutorise("3M")).toBe(false);
    expect(prefixeAutorise("A.")).toBe(false);
    expect(prefixeAutorise("...")).toBe(false);
    expect(prefixeAutorise("")).toBe(false);
  });
});

describe("beneficiaireParNom — égalité seule, donc sans longueur minimale", () => {
  it("un nom écrit par l'utilisateur est une identité, pas une ligne à reconnaître", () => {
    const bp = beneficiaire({ id: "b-bp", nom: "BP" });
    expect(beneficiaireParNom("Bp", [bp])?.id).toBe("b-bp");
  });

  it("Les 5 Saisons ne trouve pas Les 3 Brasseurs", () => {
    const brasseurs = beneficiaire({ id: "b-3b", nom: "Les 3 Brasseurs" });
    expect(beneficiaireParNom("Les 5 Saisons", [brasseurs])).toBeNull();
  });
});
