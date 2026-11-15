import { describe, expect, it } from "vitest";
import { descriptionContrepartie } from "./description";

describe("descriptionContrepartie", () => {
  it("D1 — positive : depuis ; négative : vers", () => {
    expect(descriptionContrepartie(5000, "Chèque")).toBe("Virement depuis Chèque");
    expect(descriptionContrepartie(-5000, "Visa")).toBe("Virement vers Visa");
  });

  it("D1 — un cent suffit à choisir le sens ; zéro ne lève pas", () => {
    expect(descriptionContrepartie(1, "A")).toBe("Virement depuis A");
    expect(descriptionContrepartie(-1, "A")).toBe("Virement vers A");
    expect(descriptionContrepartie(0, "A")).toBe("Virement avec A");
  });
});
