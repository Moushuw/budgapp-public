import { describe, expect, it } from "vitest";
import { aplatirTexte, normaliserDescription } from "./normaliser";

describe("aplatirTexte", () => {
  it("majuscules et accents retirés", () => {
    expect(aplatirTexte("Café Dépôt")).toBe("CAFE DEPOT");
  });

  it("coupe les espaces de bord", () => {
    expect(aplatirTexte("  metro  ")).toBe("METRO");
  });

  it("chaîne vide reste vide", () => {
    expect(aplatirTexte("")).toBe("");
  });

  it("ne tronque rien, à la différence de normaliserDescription", () => {
    expect(aplatirTexte("PETRO-CANADA 07421 VALBRUME")).toBe("PETRO-CANADA 07421 VALBRUME");
  });

  it("ne coupe pas sur *", () => {
    expect(aplatirTexte("CA*2K4LM9")).toBe("CA*2K4LM9");
  });
});

describe("normaliserDescription", () => {
  it("retire le numéro de succursale précédé de #", () => {
    expect(normaliserDescription("IGA VALBRUME #8412")).toBe("IGA VALBRUME");
  });

  it("retire un numéro de terminal isolé et ce qui suit", () => {
    expect(normaliserDescription("PETRO-CANADA 07421 VALBRUME")).toBe("PETRO-CANADA");
  });

  it("retire le suffixe de référence après *", () => {
    expect(normaliserDescription("AMZN Mktp CA*2K4LM9")).toBe("AMZN MKTP CA");
  });

  it("retire les accents et uniformise la casse", () => {
    expect(normaliserDescription("Café Dépôt")).toBe("CAFE DEPOT");
  });

  it("réduit les espaces multiples", () => {
    expect(normaliserDescription("IGA   VALBRUME")).toBe("IGA VALBRUME");
  });
});
