import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { calculerEmpreinte } from "../ingestion/empreinte";
import { empreinteLigneFille } from "./empreinte";

describe("empreinteLigneFille (docs/lot-m2.md §3.2)", () => {
  it("EM1 — stable, 64 caractères hexadécimaux minuscules", () => {
    const a = empreinteLigneFille("parent", 1);
    expect(empreinteLigneFille("parent", 1)).toBe(a);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it("EM2 — distincte selon le rang et du parent", () => {
    const e = "parent";
    expect(empreinteLigneFille(e, 1)).not.toBe(empreinteLigneFille(e, 2));
    expect(empreinteLigneFille(e, 1)).not.toBe(e);
    expect(empreinteLigneFille(e, 2)).not.toBe(e);
  });

  it("EM3 — deux parents différents, même rang", () => {
    expect(empreinteLigneFille("p1", 1)).not.toBe(empreinteLigneFille("p2", 1));
  });

  it("EM4 — distincte de toute empreinte de relevé", () => {
    const e = calculerEmpreinte("cpt", "2026-08-03", -1234, "IGA");
    const fille = empreinteLigneFille(e, 1);
    expect(fille).not.toBe(calculerEmpreinte("ventilation", e, 1, ""));
    expect(fille).not.toBe(calculerEmpreinte(`ventilation:${e}`, "1", 0, ""));
    expect(fille).not.toBe(calculerEmpreinte("cpt", "2026-08-03", -1234, "IGA"));
  });

  it("EM5 — valeur figée", () => {
    expect(empreinteLigneFille("abc", 1)).toBe(createHash("sha256").update("ventilation:abc:1").digest("hex"));
  });
});
