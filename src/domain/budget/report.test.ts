import { describe, expect, it } from "vitest";
import { report } from "./report";

describe("report", () => {
  it("AUCUN — jamais de report, même positif", () => {
    expect(report(50_00, "AUCUN")).toBe(0);
    expect(report(-50_00, "AUCUN")).toBe(0);
  });

  it("SIGNE — reporte tel quel, y compris un dépassement négatif", () => {
    expect(report(50_00, "SIGNE")).toBe(50_00);
    expect(report(-84_00, "SIGNE")).toBe(-84_00);
  });

  it("POSITIF_SEULEMENT — jamais de report négatif", () => {
    expect(report(50_00, "POSITIF_SEULEMENT")).toBe(50_00);
    expect(report(-84_00, "POSITIF_SEULEMENT")).toBe(0);
  });
});
