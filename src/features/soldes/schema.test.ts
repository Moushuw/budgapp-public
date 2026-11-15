import { describe, expect, it } from "vitest";
import {
  schemaExplication,
  schemaFormulaireExplication,
  schemaFormulaireSolde,
  schemaIdentifiantAncrage,
  schemaSaisieSolde,
} from "./schema";

const CUID = "clx0000000000000000099999";
const BASE = { date: "2026-09-20", montant: "855,00", source: "RELEVE" };

function messages(schema: { safeParse: (v: unknown) => { success: boolean; error?: { issues: { message: string }[] } } }, v: unknown): string[] {
  const r = schema.safeParse(v);
  return r.success ? [] : (r.error?.issues.map((i) => i.message) ?? []);
}

describe("schemaFormulaireSolde", () => {
  it("SS1 — le montant est obligatoire, lisible et converti en cents signés", () => {
    expect(messages(schemaFormulaireSolde, { ...BASE, montant: "" })).toEqual(["Ce montant est obligatoire."]);
    expect(messages(schemaFormulaireSolde, { ...BASE, montant: "abc" })).toEqual(["Montant illisible. Exemple : 1 250,00"]);
    expect(schemaFormulaireSolde.parse({ ...BASE, montant: "1 250,00" }).montant).toBe(125_000);
    expect(schemaFormulaireSolde.parse({ ...BASE, montant: "-50" }).montant).toBe(-5_000);
  });
  it("SS1 — un montant démesuré est refusé", () => {
    expect(messages(schemaFormulaireSolde, { ...BASE, montant: "-21 474 836,48" })).toEqual(["Montant trop grand."]);
    expect(schemaFormulaireSolde.parse({ ...BASE, montant: "-21 474 836,47" }).montant).toBe(-2_147_483_647);
  });
  it("SS2 — seules MANUEL et RELEVE sont saisissables", () => {
    expect(messages(schemaFormulaireSolde, { ...BASE, source: "AGREGATEUR" })).toEqual(["Choisis une source."]);
    expect(schemaFormulaireSolde.parse({ ...BASE, source: "MANUEL" }).source).toBe("MANUEL");
    expect(schemaFormulaireSolde.parse({ ...BASE, source: "RELEVE" }).source).toBe("RELEVE");
  });
  it("SS3 — une date impossible est refusée", () => {
    expect(messages(schemaFormulaireSolde, { ...BASE, date: "2026-02-30" })).toEqual(["Date invalide (AAAA-MM-JJ attendu)."]);
    expect(schemaFormulaireSolde.parse({ ...BASE, date: "2028-02-29" }).date).toBe("2028-02-29");
  });
});

describe("schemaSaisieSolde", () => {
  it("exige un identifiant de compte valide", () => {
    expect(schemaSaisieSolde.safeParse({ ...BASE, accountId: CUID }).success).toBe(true);
    expect(messages(schemaSaisieSolde, { ...BASE, accountId: "x" })).toEqual(["Identifiant invalide."]);
  });
});

describe("schemaFormulaireExplication / schemaExplication", () => {
  it("SS4 — vide ou d'espaces refusée, 500 caractères au plus, bords rognés", () => {
    expect(messages(schemaFormulaireExplication, { explication: "   " })).toEqual(["Écris l'explication."]);
    expect(messages(schemaFormulaireExplication, { explication: "x".repeat(501) })).toEqual(["500 caractères au maximum."]);
    expect(schemaFormulaireExplication.safeParse({ explication: "x".repeat(500) }).success).toBe(true);
    expect(schemaFormulaireExplication.parse({ explication: "  texte  " }).explication).toBe("texte");
  });
  it("SS5 — identifiant d'ancrage invalide", () => {
    expect(messages(schemaIdentifiantAncrage, { statementId: "x" })).toEqual(["Identifiant invalide."]);
    expect(messages(schemaExplication, { statementId: "x", explication: "ok" })).toEqual(["Identifiant invalide."]);
    expect(schemaExplication.safeParse({ statementId: CUID, explication: "ok" }).success).toBe(true);
  });
});
