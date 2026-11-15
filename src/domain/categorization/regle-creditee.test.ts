// docs/lot-m2.md §10.1.2 et §4.3 : la sous-catégorie qu'une règle pose, lue comme le moteur.

import { describe, expect, it } from "vitest";
import { serialiserPartsVentilation } from "../ventilation";
import { type PoseSousCategorie, poseSousCategorie, regleJustifieCreneau } from "./regle-creditee";
import { appliquerRegles } from "./resolution";
import type { ActionRegle, LigneACategoriser, RegleCategorisation, TypeAction } from "./types";

const LIGNE: LigneACategoriser = {
  description: "IGA VALBRUME",
  descriptionNormalisee: "IGA VALBRUME",
  montantCents: -8500,
  accountId: "cpt-cheque",
  payeeNom: null,
};

function action(type: TypeAction, subcategoryId: string | null, ordre: number, valeur: string | null = null): ActionRegle {
  return { id: `a-${type}-${ordre}`, type, subcategoryId, valeur, ordre };
}

function idCategorise(pose: PoseSousCategorie | null): string | undefined {
  return pose?.type === "CATEGORISER" ? pose.subcategoryId : undefined;
}

const PARTS_ABC = [
  { subcategoryId: "A", partMille: 333 },
  { subcategoryId: "B", partMille: 333 },
  { subcategoryId: "C", partMille: 334 },
];
const VENTILER_LISIBLE = serialiserPartsVentilation(PARTS_ABC);

describe("poseSousCategorie", () => {
  it("C1 — une CATEGORISER", () => {
    expect(poseSousCategorie([action("CATEGORISER", "sc-a", 0)])).toEqual({
      type: "CATEGORISER",
      subcategoryId: "sc-a",
    });
  });

  it("C2 — aucune CATEGORISER : null", () => {
    expect(
      poseSousCategorie([action("ETIQUETER", null, 0), action("NOTER", null, 1), action("MARQUER_A_REVOIR", null, 2)]),
    ).toBeNull();
  });

  it("C3 — CATEGORISER null puis sc-b : sc-b", () => {
    expect(idCategorise(poseSousCategorie([action("CATEGORISER", null, 0), action("CATEGORISER", "sc-b", 1)]))).toBe(
      "sc-b",
    );
  });

  it("C4 — CATEGORISER blanche ignorée", () => {
    expect(idCategorise(poseSousCategorie([action("CATEGORISER", "  ", 0), action("CATEGORISER", "sc-b", 1)]))).toBe(
      "sc-b",
    );
  });

  it("C5 — tableau non trié : l'ordre croissant gagne, sans muter l'entrée", () => {
    const entree = [action("CATEGORISER", "sc-x", 2), action("CATEGORISER", "sc-y", 1)];
    expect(idCategorise(poseSousCategorie(entree))).toBe("sc-y");
    expect(entree.map((a) => a.subcategoryId)).toEqual(["sc-x", "sc-y"]);
  });

  it("C6 — un VENTILER illisible ne pose rien, le CATEGORISER suivant pose", () => {
    expect(idCategorise(poseSousCategorie([action("VENTILER", null, 0), action("CATEGORISER", "sc-a", 1)]))).toBe(
      "sc-a",
    );
  });

  it("C7 — aucune action : null", () => {
    expect(poseSousCategorie([])).toBeNull();
  });

  it("CR1 — un VENTILER lisible", () => {
    expect(poseSousCategorie([action("VENTILER", null, 0, VENTILER_LISIBLE)])).toEqual({
      type: "VENTILER",
      parts: PARTS_ABC,
    });
  });

  it("CR2 — l'ordre, pas la position", () => {
    const pose = poseSousCategorie([action("CATEGORISER", "sc-a", 1), action("VENTILER", null, 0, VENTILER_LISIBLE)]);
    expect(pose?.type).toBe("VENTILER");
  });
});

describe("regleJustifieCreneau", () => {
  const sca = { type: "CATEGORISER", subcategoryId: "sc-a" } as const;
  const recu = (subcategoryId: string | null) => ({ subcategoryId, montantCents: -1000, ventilation: null });

  it("J1 — même sous-catégorie : true", () => {
    expect(regleJustifieCreneau(sca, recu("sc-a"))).toBe(true);
  });
  it("J2 — autre sous-catégorie : false", () => {
    expect(regleJustifieCreneau(sca, recu("sc-b"))).toBe(false);
  });
  it("J3 — reçu null : false", () => {
    expect(regleJustifieCreneau(sca, recu(null))).toBe(false);
  });
  it("J4 — pose null, reçu sc-a : false", () => {
    expect(regleJustifieCreneau(null, recu("sc-a"))).toBe(false);
  });
  it("J5 — pose null, reçu null : false", () => {
    expect(regleJustifieCreneau(null, recu(null))).toBe(false);
  });

  describe("VENTILER", () => {
    const pose: PoseSousCategorie = { type: "VENTILER", parts: PARTS_ABC };
    const filles = [
      { subcategoryId: "A", montantCents: -3330 },
      { subcategoryId: "B", montantCents: -3330 },
      { subcategoryId: "C", montantCents: -3341 },
    ];
    const ventile = { subcategoryId: null, montantCents: -10001, ventilation: filles };

    it("CR3 — la ventilation exacte de repartirParPourMille", () => {
      expect(regleJustifieCreneau(pose, ventile)).toBe(true);
    });

    it("CR4 — un cent déplacé, une sous-catégorie changée, un nombre de lignes différent, un montant différent", () => {
      expect(
        regleJustifieCreneau(pose, {
          ...ventile,
          ventilation: [
            { subcategoryId: "A", montantCents: -3331 },
            { subcategoryId: "B", montantCents: -3330 },
            { subcategoryId: "C", montantCents: -3340 },
          ],
        }),
      ).toBe(false);
      expect(
        regleJustifieCreneau(pose, {
          ...ventile,
          ventilation: [filles[0], { subcategoryId: "X", montantCents: -3330 }, filles[2]].filter(
            (f): f is NonNullable<typeof f> => f !== undefined,
          ),
        }),
      ).toBe(false);
      expect(regleJustifieCreneau(pose, { ...ventile, ventilation: filles.slice(0, 2) })).toBe(false);
      expect(regleJustifieCreneau(pose, { ...ventile, montantCents: -10000 })).toBe(false);
    });

    it("CR5 — le mauvais genre de créneau", () => {
      expect(regleJustifieCreneau(pose, { subcategoryId: "A", montantCents: -10001, ventilation: null })).toBe(false);
      expect(regleJustifieCreneau(sca, { subcategoryId: null, montantCents: -10001, ventilation: filles })).toBe(false);
      expect(regleJustifieCreneau(sca, { subcategoryId: "sc-a", montantCents: -10001, ventilation: filles })).toBe(false);
    });
  });
});

describe("cohérence avec le moteur", () => {
  it("K1 — ce que le moteur pose, la lecture le justifie", () => {
    const r1: RegleCategorisation = {
      id: "r1",
      libelle: "r1",
      priorite: 0,
      actif: true,
      conditions: [
        { id: "c-1", champ: "DESCRIPTION_NORMALISEE", operateur: "CONTIENT", valeur: "IGA", valeurFin: null },
      ],
      actions: [action("ETIQUETER", null, 0), action("CATEGORISER", null, 1), action("CATEGORISER", "sc-a", 2)],
    };
    const resultat = appliquerRegles(LIGNE, [r1]);
    expect(resultat.regleAppliqueeId).toBe("r1");
    expect(resultat.affectation.subcategoryId).toBe("sc-a");
    expect(
      regleJustifieCreneau(poseSousCategorie(r1.actions), { subcategoryId: "sc-a", montantCents: -8500, ventilation: null }),
    ).toBe(true);
  });
});
