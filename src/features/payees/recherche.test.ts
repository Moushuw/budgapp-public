import { describe, expect, it } from "vitest";
import { correspondARecherche } from "./recherche";

describe("correspondARecherche", () => {
  it("recherche vide trouve tout le monde", () => {
    expect(correspondARecherche({ nom: "Amazon.ca", nomNormalise: "AMAZON.CA" }, "")).toBe(true);
  });

  it("recherche blanche trouve tout le monde", () => {
    expect(correspondARecherche({ nom: "Amazon.ca", nomNormalise: "AMAZON.CA" }, "   ")).toBe(true);
  });

  it("insensible à la casse", () => {
    expect(correspondARecherche({ nom: "Amazon.ca", nomNormalise: "AMAZON.CA" }, "amazon")).toBe(true);
  });

  it("accents dans la requête", () => {
    expect(correspondARecherche({ nom: "Cafe Depot", nomNormalise: "CAFE DEPOT" }, "café")).toBe(true);
  });

  it("accents dans la donnée", () => {
    expect(correspondARecherche({ nom: "Café Dépôt", nomNormalise: "CAFE DEPOT" }, "cafe")).toBe(true);
  });

  it("correspondance sur le nom normalisé seulement", () => {
    expect(
      correspondARecherche({ nom: "Amazon (marketplace)", nomNormalise: "AMZN MKTP CA" }, "AMZN"),
    ).toBe(true);
  });

  it("fragment interne", () => {
    expect(correspondARecherche({ nom: "Amazon.ca", nomNormalise: "AMAZON.CA" }, "mazon")).toBe(true);
  });

  it("aucun résultat", () => {
    expect(correspondARecherche({ nom: "Amazon.ca", nomNormalise: "AMAZON.CA" }, "xyz")).toBe(false);
  });

  it("nom normalisé vide, trouvé par le nom", () => {
    expect(correspondARecherche({ nom: "7 Jours", nomNormalise: "" }, "7 jours")).toBe(true);
  });

  it("nom normalisé vide, pas trouvé par un autre mot", () => {
    expect(correspondARecherche({ nom: "7 Jours", nomNormalise: "" }, "epicerie")).toBe(false);
  });
});
