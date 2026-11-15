import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import * as barillet from "./index";

describe("domain/solde", () => {
  it("IX1 — le barillet exporte les fonctions publiques mais pas empreinteAjustement", () => {
    const exports: Record<string, unknown> = { ...barillet };
    for (const nom of ["soldeCalcule", "ecart", "statutAncrage", "refusAjustement", "ecartRepresentable", "explicationsProbables", "dateLongue", "dateLisible"]) {
      expect(typeof exports[nom], nom).toBe("function");
    }
    expect("empreinteAjustement" in exports).toBe(false);
  });

  it("seul empreinte.ts importe node:*, et aucun module n'atteint un barillet ou le reste du projet", () => {
    const sources = readdirSync(__dirname).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));
    expect(sources.length).toBeGreaterThanOrEqual(8);
    const autorises = new Set([
      "../dates",
      "../money",
      "../referentiel",
      "../recurrence/libelles",
      "../ingestion/types",
      "../edition/limites",
    ]);
    for (const f of sources) {
      const texte = readFileSync(join(__dirname, f), "utf8");
      const imports = [...texte.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1] ?? "");
      for (const i of imports) {
        const ok = i.startsWith("./") || autorises.has(i) || (f === "empreinte.ts" && i === "node:crypto");
        expect(ok, `${f} importe ${i}`).toBe(true);
      }
      expect(texte, f).not.toMatch(/new Date\(|: any\b/);
    }
  });
});
