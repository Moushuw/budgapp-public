// docs/lot-m1.md §9 — trouverFiltre : les quatre modes de correspondance,
// jamais de RegExp construite depuis un motif hors REGEX, une regex invalide
// ressort dans `inapplicables` sans jamais faire correspondre la ligne.

import { describe, expect, it } from "vitest";
import { trouverFiltre } from "./filtres";
import type { FiltreIngestion } from "./types";

function filtre(id: string, motif: string, mode: FiltreIngestion["mode"]): FiltreIngestion {
  return { id, motif, mode };
}

describe("trouverFiltre — EXACT", () => {
  it("nominal : égalité insensible à la casse et aux accents", () => {
    const resultat = trouverFiltre("frais de service", [filtre("f1", "FRAIS DE SERVICE", "EXACT")]);
    expect(resultat.filtre?.id).toBe("f1");
  });

  it("« Paiement » ne filtre pas « Paiement carte »", () => {
    const resultat = trouverFiltre("Paiement carte", [filtre("f1", "Paiement", "EXACT")]);
    expect(resultat.filtre).toBeNull();
  });
});

describe("trouverFiltre — CONTIENT", () => {
  it("nominal : sous-chaîne trouvée", () => {
    const resultat = trouverFiltre("Frais de service mensuel", [filtre("f1", "SERVICE", "CONTIENT")]);
    expect(resultat.filtre?.id).toBe("f1");
  });

  it("sous-chaîne non trouvée", () => {
    const resultat = trouverFiltre("Frais de service mensuel", [filtre("f1", "ABONNEMENT", "CONTIENT")]);
    expect(resultat.filtre).toBeNull();
  });
});

describe("trouverFiltre — MOT_ENTIER", () => {
  it("REST ne filtre pas FOREST (le piège nommé au §5.5 du document v1)", () => {
    const resultat = trouverFiltre("Le Forest Bistro", [filtre("f1", "REST", "MOT_ENTIER")]);
    expect(resultat.filtre).toBeNull();
  });

  it("REST filtre REST DU COIN", () => {
    const resultat = trouverFiltre("Rest Du Coin", [filtre("f1", "REST", "MOT_ENTIER")]);
    expect(resultat.filtre?.id).toBe("f1");
  });

  it("motif à deux mots trouvé contigu", () => {
    const resultat = trouverFiltre("Frais de service annuel", [filtre("f1", "DE SERVICE", "MOT_ENTIER")]);
    expect(resultat.filtre?.id).toBe("f1");
  });

  it("les deux mots présents mais séparés → pas de correspondance", () => {
    const resultat = trouverFiltre("De frais et de service", [filtre("f1", "FRAIS SERVICE", "MOT_ENTIER")]);
    expect(resultat.filtre).toBeNull();
  });

  it("un motif à caractère spécial (A+B) est découpé en jetons, pas interprété comme une regex", () => {
    const resultat = trouverFiltre("Description A+B quelconque", [filtre("f1", "A+B", "MOT_ENTIER")]);
    expect(resultat.filtre?.id).toBe("f1");
    expect(resultat.inapplicables).toHaveLength(0);
  });

  it("un motif à caractère spécial ((VALBRUM) est découpé en jetons, pas interprété comme une regex", () => {
    const resultat = trouverFiltre("IGA (VALBRUM) succursale", [filtre("f1", "(VALBRUM", "MOT_ENTIER")]);
    expect(resultat.filtre?.id).toBe("f1");
    expect(resultat.inapplicables).toHaveLength(0);
  });
});

describe("trouverFiltre — REGEX", () => {
  it("nominal : ^VIREMENT correspond, insensible à la casse", () => {
    const resultat = trouverFiltre("virement interac reçu", [filtre("f1", "^VIREMENT", "REGEX")]);
    expect(resultat.filtre?.id).toBe("f1");
  });

  it("échec : motif « [ » → aucune correspondance, un FiltreInapplicable avec le message du moteur, l'évaluation continue", () => {
    const resultat = trouverFiltre("Description quelconque", [
      filtre("f1", "[", "REGEX"),
      filtre("f2", "QUELCONQUE", "CONTIENT"),
    ]);
    expect(resultat.filtre?.id).toBe("f2");
    expect(resultat.inapplicables).toHaveLength(1);
    expect(resultat.inapplicables[0]?.filtreId).toBe("f1");
    expect(resultat.inapplicables[0]?.detail.length).toBeGreaterThan(0);
  });
});

describe("trouverFiltre — limites communes", () => {
  it("motif vide → jamais de correspondance", () => {
    const resultat = trouverFiltre("N'importe quoi", [filtre("f1", "", "CONTIENT"), filtre("f2", "   ", "EXACT")]);
    expect(resultat.filtre).toBeNull();
  });

  it("plusieurs filtres correspondent → le premier de la liste reçue, toujours le même", () => {
    const filtres = [filtre("f1", "IGA", "CONTIENT"), filtre("f2", "VALBRUME", "CONTIENT")];
    const resultat = trouverFiltre("IGA Valbrume", filtres);
    expect(resultat.filtre?.id).toBe("f1");

    const resultatInverse = trouverFiltre("IGA Valbrume", [...filtres].reverse());
    expect(resultatInverse.filtre?.id).toBe("f2");
  });

  it("aucun filtre → { filtre: null, inapplicables: [] }", () => {
    const resultat = trouverFiltre("Description", []);
    expect(resultat).toEqual({ filtre: null, inapplicables: [] });
  });
});
