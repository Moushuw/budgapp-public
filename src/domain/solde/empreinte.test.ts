import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { calculerEmpreinte } from "../ingestion/empreinte";
import { empreinteContrepartie } from "../virement/empreinte";
import { empreinteLigneFille } from "../ventilation/empreinte";
import { empreinteAjustement } from "./empreinte";

const ID = "clx0000000000000000099999";

describe("empreinteAjustement", () => {
  it("EM1 — stable, 64 caractères hexadécimaux", () => {
    expect(empreinteAjustement(ID)).toBe(empreinteAjustement(ID));
    expect(empreinteAjustement(ID)).toMatch(/^[0-9a-f]{64}$/);
  });
  it("EM2 — sha256 de « ajustement:<id> »", () => {
    expect(empreinteAjustement(ID)).toBe(createHash("sha256").update("ajustement:" + ID).digest("hex"));
  });
  it("EM3 — distincte des autres familles d'empreintes pour un même id, et d'un id à l'autre", () => {
    const e = empreinteAjustement(ID);
    expect(e).not.toBe(empreinteLigneFille(ID, 1));
    expect(e).not.toBe(empreinteContrepartie(ID));
    expect(e).not.toBe(calculerEmpreinte(ID, "2026-09-20", 5_000, "AJUSTEMENT DE SOLDE"));
    expect(empreinteAjustement("clx0000000000000000088888")).not.toBe(e);
  });
});
