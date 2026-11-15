import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import * as barillet from "./index";

describe("domain/recurrence", () => {
  it("le barillet exporte les fonctions publiques", () => {
    const exports: Record<string, unknown> = { ...barillet };
    for (const nom of [
      "detecterRecurrences",
      "phraseSuggestion",
      "regleDepuisSuggestion",
      "occurrencesAMaterialiser",
      "apparierRetroactivement",
      "evaluerRapprochement",
      "etatAffiche",
      "etatApresLiaison",
      "libelleCadence",
      "occurrencesEnDouble",
      "libellePaiementAttendu",
      "libelleCandidatAttendu",
      "taillePageOccurrences",
    ]) {
      expect(typeof exports[nom], nom).toBe("function");
    }
  });

  it("aucun module n'importe node:*, Prisma ni le reste du projet hors dates, money et referentiel", () => {
    const dossier = __dirname;
    const sources = readdirSync(dossier).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));
    expect(sources.length).toBeGreaterThan(10);
    for (const f of sources) {
      const texte = readFileSync(join(dossier, f), "utf8");
      const imports = [...texte.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1] ?? "");
      for (const i of imports) {
        const ok = i.startsWith("./") || i === "../dates" || i === "../money" || i === "../referentiel";
        expect(ok, `${f} importe ${i}`).toBe(true);
      }
      expect(texte, f).not.toMatch(/new Date\(|getDay\(|: any\b/);
    }
  });
});
