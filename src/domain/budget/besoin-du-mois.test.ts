import { describe, expect, it } from "vitest";
import { besoinDuMois } from "./besoin-du-mois";
import type { Cible } from "./types";

describe("besoinDuMois", () => {
  it("RECOMPLETER — ramené au prorata d'un cycle ANNUEL (340 $/an, échéance le 15 mars)", () => {
    const cible: Cible = {
      montantCents: 34_000,
      cadence: "ANNUEL",
      mode: "RECOMPLETER",
      dateDebut: "2026-03-15",
    };
    // 34 000 ¢ / 12 mois, arrondi au cent supérieur pour ne jamais manquer l'échéance.
    expect(besoinDuMois(cible, 0, 0, "2026-01")).toBe(2_834);
  });

  it("RECOMPLETER — se base sur le disponible, pas sur l'alloué", () => {
    const cible: Cible = { montantCents: 60_000, cadence: "MENSUEL", mode: "RECOMPLETER", dateDebut: "2026-01-01" };
    expect(besoinDuMois(cible, 60_000, 60_000, "2026-01")).toBe(0); // déjà comblé
    expect(besoinDuMois(cible, 60_000, 40_000, "2026-01")).toBe(20_000); // sous-financé malgré l'alloué
  });

  it("ACCUMULER — se base sur l'alloué, pas sur le disponible", () => {
    const cible: Cible = { montantCents: 10_000, cadence: "MENSUEL", mode: "ACCUMULER", dateDebut: "2026-01-01" };
    expect(besoinDuMois(cible, 4_000, 999_999, "2026-01")).toBe(6_000);
  });

  it("jamais négatif : une cible dépassée ne produit aucun besoin", () => {
    const cible: Cible = { montantCents: 10_000, cadence: "MENSUEL", mode: "ACCUMULER", dateDebut: "2026-01-01" };
    expect(besoinDuMois(cible, 15_000, 0, "2026-01")).toBe(0);
  });

  it("HEBDO — le besoin mensuel varie selon le nombre réel d'occurrences (4 ou 5 jeudis)", () => {
    // 2026-01-01 est un jeudi : 5 jeudis en janvier, 4 en février.
    const cible: Cible = { montantCents: 5_000, cadence: "HEBDO", mode: "ACCUMULER", dateDebut: "2026-01-01" };
    expect(besoinDuMois(cible, 0, 0, "2026-01")).toBe(1_000); // 5 000 / 5
    expect(besoinDuMois(cible, 0, 0, "2026-02")).toBe(1_250); // 5 000 / 4
  });

  it("DEUX_FOIS_PAR_MOIS — toujours deux occurrences par mois", () => {
    const cible: Cible = { montantCents: 10_000, cadence: "DEUX_FOIS_PAR_MOIS", mode: "ACCUMULER", dateDebut: "2026-01-01" };
    expect(besoinDuMois(cible, 0, 0, "2026-03")).toBe(5_000);
  });

  it("PONCTUEL — le diviseur est le nombre de mois restants jusqu'à l'échéance", () => {
    const cible: Cible = { montantCents: 12_000, cadence: "PONCTUEL", mode: "ACCUMULER", dateDebut: "2026-01-01", dateCible: "2026-06-15" };
    expect(besoinDuMois(cible, 0, 0, "2026-01")).toBe(2_000); // 6 mois restants (janvier à juin inclus)
    expect(besoinDuMois(cible, 0, 0, "2026-06")).toBe(12_000); // dernier mois : tout est dû
    expect(besoinDuMois(cible, 0, 0, "2026-07")).toBe(12_000); // échéance dépassée : plancher à 1 mois
  });

  it("retourne 0 quand aucune occurrence de la cadence ne tombe dans le mois", () => {
    // La cadence ne commence qu'en mai : rien n'est dû en janvier.
    const cible: Cible = { montantCents: 5_000, cadence: "HEBDO", mode: "ACCUMULER", dateDebut: "2026-05-01" };
    expect(besoinDuMois(cible, 0, 0, "2026-01")).toBe(0);
  });
});
