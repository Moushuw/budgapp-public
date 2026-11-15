import { describe, expect, it } from "vitest";
import { formatMontant } from "../money";
import { LIMITE_LIGNES_VENTILATION } from "./limites";
import {
  type ErreurVentilation,
  messageErreurVentilation,
  type ParentVentilation,
  validerVentilation,
} from "./validation";

function parent(partiel: Partial<ParentVentilation> = {}): ParentVentilation {
  return { montantCents: -5000, estFille: false, estVirement: false, ...partiel };
}

function l(montantCents: number): { montantCents: number } {
  return { montantCents };
}

describe("validerVentilation (docs/lot-m2.md §4.2)", () => {
  it("VV1 — une ventilation juste ne donne aucune erreur", () => {
    expect(validerVentilation(parent(), [l(-2000), l(-3000)])).toEqual([]);
  });

  it("VV2 — moins de deux lignes", () => {
    expect(validerVentilation(parent(), [l(-5000)])).toEqual([{ motif: "MOINS_DE_DEUX_LIGNES" }]);
    expect(validerVentilation(parent(), [])).toEqual([
      { motif: "MOINS_DE_DEUX_LIGNES" },
      { motif: "SOMME_INEXACTE", resteCents: -5000, sensParent: "SORTIE" },
    ]);
  });

  it("VV3 — trop de lignes", () => {
    const lignes = [...Array.from({ length: 50 }, () => l(-98)), l(-100)];
    expect(lignes).toHaveLength(LIMITE_LIGNES_VENTILATION + 1);
    expect(validerVentilation(parent(), lignes)).toEqual([{ motif: "TROP_DE_LIGNES" }]);
  });

  it("VV4 — une ligne à zéro", () => {
    expect(validerVentilation(parent(), [l(-5000), l(0)])).toEqual([{ motif: "LIGNE_A_ZERO", rang: 1 }]);
  });

  it("VV5 — une ligne de signe opposé", () => {
    expect(validerVentilation(parent(), [l(-5500), l(500)])).toEqual([
      { motif: "SIGNE_OPPOSE", rang: 1, sensParent: "SORTIE" },
    ]);
    expect(validerVentilation(parent({ montantCents: 5000 }), [l(5500), l(-500)])).toEqual([
      { motif: "SIGNE_OPPOSE", rang: 1, sensParent: "ENTREE" },
    ]);
  });

  it("VV6 — il reste de l'argent à répartir", () => {
    const erreurs = validerVentilation(parent(), [l(-2000), l(-1760)]);
    expect(erreurs).toEqual([{ motif: "SOMME_INEXACTE", resteCents: -1240, sensParent: "SORTIE" }]);
    expect(messageErreurVentilation({ motif: "SOMME_INEXACTE", resteCents: -1240, sensParent: "SORTIE" })).toBe(
      `Il reste ${formatMontant(1240)} à répartir.`,
    );
  });

  it("VV7 — les lignes dépassent la transaction", () => {
    const erreurs = validerVentilation(parent(), [l(-4000), l(-2240)]);
    expect(erreurs).toEqual([{ motif: "SOMME_INEXACTE", resteCents: 1240, sensParent: "SORTIE" }]);
    expect(messageErreurVentilation({ motif: "SOMME_INEXACTE", resteCents: 1240, sensParent: "SORTIE" })).toBe(
      `Les lignes dépassent la transaction de ${formatMontant(1240)}.`,
    );
  });

  it("VV8 — un parent fille ou virement est rendu seul", () => {
    expect(validerVentilation(parent({ estFille: true }), [l(-2000), l(-3000)])).toEqual([{ motif: "PARENT_FILLE" }]);
    expect(validerVentilation(parent({ estVirement: true }), [l(-1)])).toEqual([{ motif: "PARENT_VIREMENT" }]);
    expect(validerVentilation(parent({ estFille: true, estVirement: true }), [])).toEqual([
      { motif: "PARENT_FILLE" },
      { motif: "PARENT_VIREMENT" },
    ]);
  });

  it("VV9 — une transaction de 0,00 $ ne se ventile pas", () => {
    expect(validerVentilation(parent({ montantCents: 0 }), [l(-100), l(100)])).toEqual([{ motif: "PARENT_NUL" }]);
  });

  it("VV10 — l'ordre des erreurs est déterministe", () => {
    expect(validerVentilation(parent(), [l(0), l(500), l(-3000)])).toEqual([
      { motif: "LIGNE_A_ZERO", rang: 0 },
      { motif: "SIGNE_OPPOSE", rang: 1, sensParent: "SORTIE" },
      { motif: "SOMME_INEXACTE", resteCents: -2500, sensParent: "SORTIE" },
    ]);
  });

  it("VV11 — messages au caractère près", () => {
    const m = formatMontant(0);
    const cas: readonly [ErreurVentilation, string][] = [
      [{ motif: "PARENT_FILLE" }, "Une ligne de ventilation ne se ventile pas : la ventilation n'a qu'un niveau."],
      [
        { motif: "PARENT_VIREMENT" },
        "Un côté de virement ne se ventile pas : un virement n'est ni une dépense ni un revenu. Pour le ventiler, délie d'abord le virement.",
      ],
      [{ motif: "PARENT_NUL" }, `Une transaction de ${m} ne se ventile pas : il n'y a rien à répartir.`],
      [{ motif: "MOINS_DE_DEUX_LIGNES" }, "Une ventilation compte au moins deux lignes."],
      [{ motif: "TROP_DE_LIGNES" }, `Une ventilation compte au plus ${LIMITE_LIGNES_VENTILATION} lignes.`],
      [{ motif: "LIGNE_A_ZERO", rang: 2 }, `La ligne 3 est à ${m} : retire-la ou donne-lui un montant.`],
      [
        { motif: "SIGNE_OPPOSE", rang: 0, sensParent: "SORTIE" },
        "La ligne 1 est une entrée alors que la transaction est une sortie : chaque ligne garde le signe de la transaction.",
      ],
      [
        { motif: "SIGNE_OPPOSE", rang: 1, sensParent: "ENTREE" },
        "La ligne 2 est une sortie alors que la transaction est une entrée : chaque ligne garde le signe de la transaction.",
      ],
      [
        { motif: "SOMME_INEXACTE", resteCents: -1240, sensParent: "SORTIE" },
        `Il reste ${formatMontant(1240)} à répartir.`,
      ],
      [
        { motif: "SOMME_INEXACTE", resteCents: 1240, sensParent: "SORTIE" },
        `Les lignes dépassent la transaction de ${formatMontant(1240)}.`,
      ],
    ];
    for (const [erreur, attendu] of cas) {
      expect(messageErreurVentilation(erreur)).toBe(attendu);
    }
  });

  it("VV12 — le sens d'une entrée se lit dans l'erreur", () => {
    const erreurs = validerVentilation(parent({ montantCents: 5000 }), [l(2000), l(1760)]);
    expect(erreurs).toEqual([{ motif: "SOMME_INEXACTE", resteCents: 1240, sensParent: "ENTREE" }]);
    expect(messageErreurVentilation({ motif: "SOMME_INEXACTE", resteCents: 1240, sensParent: "ENTREE" })).toBe(
      `Il reste ${formatMontant(1240)} à répartir.`,
    );
    expect(messageErreurVentilation({ motif: "SOMME_INEXACTE", resteCents: -1240, sensParent: "ENTREE" })).toBe(
      `Les lignes dépassent la transaction de ${formatMontant(1240)}.`,
    );
  });
});
