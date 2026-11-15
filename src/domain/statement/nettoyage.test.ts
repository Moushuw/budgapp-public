import { describe, expect, it } from "vitest";
import { decouperEtNettoyer } from "./nettoyage";
import type { NettoyageProfil } from "./types";

const profilDesjardins: NettoyageProfil = {
  tabulationsEnSautsDeLigne: true,
  tronquerApres: /\bTotal\b/,
};

describe("decouperEtNettoyer", () => {
  it("convertit les tabulations d'une ligne condensée en fragments indépendants portant le même numéro de ligne", () => {
    const ligneCondensee = "26 FÉV26 Février\tPaiement\t\t+187,40 $\t26 Février Paiement. +187,40 $";

    const fragments = decouperEtNettoyer(ligneCondensee, profilDesjardins);

    expect(fragments).toHaveLength(4);
    expect(fragments.every((f) => f.numeroLigne === 1)).toBe(true);
    expect(fragments.at(-1)?.texte).toBe("26 Février Paiement. +187,40 $");
  });

  it("sans conversion des tabulations, la ligne condensée reste un seul fragment", () => {
    const ligneCondensee = "26 FÉV26 Février\tPaiement\t\t+187,40 $\t26 Février Paiement. +187,40 $";

    const fragments = decouperEtNettoyer(ligneCondensee, { tabulationsEnSautsDeLigne: false });

    expect(fragments).toEqual([{ numeroLigne: 1, texte: ligneCondensee }]);
  });

  it("tronque la ligne \"Total\" et le mot lui-même disparaît, sans laisser de fragment", () => {
    expect(decouperEtNettoyer("Total\t−278,30 $\t", profilDesjardins)).toEqual([]);
    expect(decouperEtNettoyer("Total\t\t+481,06 $", profilDesjardins)).toEqual([]);
  });

  it("sans tronquerApres dans le profil, la ligne \"Total\" survit telle quelle", () => {
    const profilSansTroncature: NettoyageProfil = { tabulationsEnSautsDeLigne: true };

    const fragments = decouperEtNettoyer("Total\t−278,30 $\t", profilSansTroncature);

    expect(fragments).toEqual([
      { numeroLigne: 1, texte: "Total" },
      { numeroLigne: 1, texte: "−278,30 $" },
    ]);
  });

  it("les lignes vides, blanches ou ne contenant qu'une tabulation ne produisent aucun fragment", () => {
    expect(decouperEtNettoyer("\n   \n\t\n", profilDesjardins)).toEqual([]);
  });

  it("aucun fragment ne contient de \\r sur un texte en CRLF, et les numéros suivent le découpage source", () => {
    const fragments = decouperEtNettoyer("ligne1\r\nligne2\r\nligne3", profilDesjardins);

    expect(fragments.some((f) => f.texte.includes("\r"))).toBe(false);
    expect(fragments).toEqual([
      { numeroLigne: 1, texte: "ligne1" },
      { numeroLigne: 2, texte: "ligne2" },
      { numeroLigne: 3, texte: "ligne3" },
    ]);
  });

  it("deux fragments issus de la même ligne source partagent le même numéro de ligne", () => {
    const fragments = decouperEtNettoyer("l1\nl2\na\tb\nl4", profilDesjardins);

    const fragmentsLigne3 = fragments.filter((f) => f.numeroLigne === 3);
    expect(fragmentsLigne3).toEqual([
      { numeroLigne: 3, texte: "a" },
      { numeroLigne: 3, texte: "b" },
    ]);
  });
});
