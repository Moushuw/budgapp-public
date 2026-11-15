import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { calculerEmpreinte } from "../ingestion/empreinte";
import { empreinteLigneFille } from "../ventilation/empreinte";
import { empreinteContrepartie } from "./empreinte";

describe("empreinteContrepartie (docs/lot-m2.md §3.2)", () => {
  it("E1 — stable, 64 hexadécimaux, égale au sha256 de virement:<id>", () => {
    const e = empreinteContrepartie("abc");
    expect(empreinteContrepartie("abc")).toBe(e);
    expect(e).toMatch(/^[0-9a-f]{64}$/);
    expect(e).toBe(createHash("sha256").update("virement:abc").digest("hex"));
  });

  it("E2 — deux ids, deux empreintes ; distincte des empreintes de ventilation et de relevé", () => {
    expect(empreinteContrepartie("a")).not.toBe(empreinteContrepartie("b"));
    expect(empreinteContrepartie("a")).not.toBe(empreinteLigneFille("a", 1));
    expect(empreinteContrepartie("a")).not.toBe(calculerEmpreinte("a", "2026-01-01", 0, ""));
    expect(empreinteContrepartie("a")).not.toBe(calculerEmpreinte("virement", "a", 0, ""));
  });
});
