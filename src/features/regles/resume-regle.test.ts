import { describe, expect, it } from "vitest";
import {
  CHAMPS_CONDITION,
  OPERATEURS_PAR_CHAMP,
  type ChampCondition,
  type OperateurCondition,
} from "@/domain/categorization";
import { formatMontant } from "@/domain/money";
import type { ConditionListe } from "@/server/actions/rules";
import {
  LIBELLE_COMPTE_INTROUVABLE,
  LIBELLE_COMPTES_EN_CHARGEMENT,
  LIBELLE_COMPTES_INDISPONIBLES,
  resumeCondition,
} from "./resume-regle";

function condition(
  champ: ChampCondition,
  operateur: OperateurCondition,
  valeur: string,
  valeurFin: string | null = null,
): ConditionListe {
  return { id: "c1", champ, operateur, valeur, valeurFin };
}

const COMPTES = new Map([
  ["id1", "Chèque"],
  ["id2", "Visa"],
]);

describe("resumeCondition", () => {
  it("aucune condition", () => {
    expect(resumeCondition([], "CHARGEMENT")).toBe("Aucune condition");
  });

  it("texte", () => {
    expect(resumeCondition([condition("DESCRIPTION_NORMALISEE", "CONTIENT", "IGA")], "CHARGEMENT")).toBe(
      "Description normalisée contient « IGA »",
    );
  });

  it("seule la première condition est résumée", () => {
    const resume = resumeCondition(
      [condition("DESCRIPTION", "CONTIENT", "IGA"), condition("DESCRIPTION", "CONTIENT", "AUTRE")],
      "CHARGEMENT",
    );
    expect(resume).toContain("IGA");
    expect(resume).not.toContain("AUTRE");
  });

  it("montant inférieur", () => {
    expect(resumeCondition([condition("MONTANT", "INF", "-5000")], "CHARGEMENT")).toBe(
      `Montant est inférieur à ${formatMontant(-5000, "CENTS")}`,
    );
  });

  it("montant entre deux bornes", () => {
    expect(resumeCondition([condition("MONTANT", "ENTRE", "1000", "5000")], "CHARGEMENT")).toBe(
      `Montant est entre ${formatMontant(1000, "CENTS")} et ${formatMontant(5000, "CENTS")}`,
    );
  });

  it("montant entre sans borne de fin : la première seule", () => {
    expect(resumeCondition([condition("MONTANT", "ENTRE", "1000", null)], "CHARGEMENT")).toBe(
      `Montant est entre ${formatMontant(1000, "CENTS")}`,
    );
  });

  it("montant vide ou en espaces : valeur brute, jamais 0,00 $", () => {
    expect(resumeCondition([condition("MONTANT", "SUP", "")], "CHARGEMENT")).toBe("Montant est supérieur à «  »");
    expect(resumeCondition([condition("MONTANT", "SUP", "  ")], "CHARGEMENT")).toBe("Montant est supérieur à «    »");
  });

  it("montant non entier : valeur brute", () => {
    expect(resumeCondition([condition("MONTANT", "SUP", "abc")], "CHARGEMENT")).toBe("Montant est supérieur à « abc »");
  });

  it("compte : nom, et liste de noms", () => {
    expect(resumeCondition([condition("COMPTE", "EGALE", "id1")], COMPTES)).toBe("Compte est exactement Chèque");
    expect(resumeCondition([condition("COMPTE", "DANS", "id1|id2")], COMPTES)).toBe(
      "Compte est dans la liste Chèque, Visa",
    );
  });

  it("compte introuvable ou en chargement", () => {
    expect(resumeCondition([condition("COMPTE", "EGALE", "inconnu")], COMPTES)).toContain(LIBELLE_COMPTE_INTROUVABLE);
    expect(resumeCondition([condition("COMPTE", "EGALE", "id1")], "CHARGEMENT")).toContain(LIBELLE_COMPTES_EN_CHARGEMENT);
    // Un chargement échoué ne reste pas bloqué sur « (chargement…) ».
    expect(resumeCondition([condition("COMPTE", "EGALE", "id1")], "ERREUR")).toContain(LIBELLE_COMPTES_INDISPONIBLES);
    expect(resumeCondition([condition("COMPTE", "EGALE", "id1")], "ERREUR")).not.toContain(LIBELLE_COMPTES_EN_CHARGEMENT);
  });

  it("sens", () => {
    expect(resumeCondition([condition("SENS", "EGALE", "SORTIE")], "CHARGEMENT")).toBe("Sens est exactement Sortie d'argent");
    expect(resumeCondition([condition("SENS", "EGALE", "X")], "CHARGEMENT")).toBe("Sens est exactement « X »");
  });

  it("texte avec DANS : chaque élément entre guillemets", () => {
    expect(resumeCondition([condition("DESCRIPTION", "DANS", "A|B")], "CHARGEMENT")).toBe(
      "Description est dans la liste « A », « B »",
    );
  });

  it("ne laisse jamais fuir le code brut du champ ni de l'opérateur", () => {
    for (const champ of CHAMPS_CONDITION) {
      for (const operateur of OPERATEURS_PAR_CHAMP[champ]) {
        const resume = resumeCondition([condition(champ, operateur, "1", "2")], COMPTES);
        expect(resume).not.toContain(champ);
        expect(resume).not.toContain(operateur);
      }
    }
  });
});
