// Chargement de l'URL source (environnement puis .env) et arrêt net sans DATABASE_URL.
// Utilise un dossier temporaire : le .env du projet n'est jamais lu ici.

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { lireDatabaseUrlSource, urlBaseDeTest } from "./environnement.mts";
import { ErreurUrlBaseDeTest, estUrlBaseDeTest } from "./url-base-de-test.mts";

let dossier: string;

beforeEach(() => {
  dossier = mkdtempSync(path.join(tmpdir(), "budgapp-env-"));
});

afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(dossier, { recursive: true, force: true });
});

describe("lireDatabaseUrlSource", () => {
  it("l'environnement prime sur .env", () => {
    writeFileSync(path.join(dossier, ".env"), 'DATABASE_URL="postgresql://a:b@fichier/x"\n');
    vi.stubEnv("DATABASE_URL", "postgresql://a:b@env/x");
    expect(lireDatabaseUrlSource(dossier)).toBe("postgresql://a:b@env/x");
  });

  it("retombe sur .env quand l'environnement est vide", () => {
    writeFileSync(path.join(dossier, ".env"), 'DATABASE_URL="postgresql://a:b@fichier/x"\n');
    vi.stubEnv("DATABASE_URL", "  ");
    expect(lireDatabaseUrlSource(dossier)).toBe("postgresql://a:b@fichier/x");
  });

  it("rend undefined sans .env ni variable, et sans modifier process.env", () => {
    vi.stubEnv("DATABASE_URL", "");
    expect(lireDatabaseUrlSource(dossier)).toBeUndefined();
    expect(process.env.DATABASE_URL).toBe("");
  });

  it("rend undefined si .env n'a pas la clé", () => {
    writeFileSync(path.join(dossier, ".env"), "AUTRE=1\n");
    vi.stubEnv("DATABASE_URL", "");
    expect(lireDatabaseUrlSource(dossier)).toBeUndefined();
  });
});

describe("urlBaseDeTest", () => {
  it("dérive une URL de test depuis .env", () => {
    writeFileSync(path.join(dossier, ".env"), 'DATABASE_URL="postgresql://u:p%40x@h:5432/budgapp_dev?schema=public"\n');
    vi.stubEnv("DATABASE_URL", "");
    const url = urlBaseDeTest(dossier);
    expect(estUrlBaseDeTest(url)).toBe(true);
    expect(url).toBe("postgresql://u:p%40x@h:5432/budgapp_dev?schema=test");
  });

  it("s'arrête net, avec le message de la spec, sans aucune URL", () => {
    vi.stubEnv("DATABASE_URL", "");
    let erreur: unknown;
    try {
      urlBaseDeTest(dossier);
    } catch (e) {
      erreur = e;
    }
    expect(erreur).toBeInstanceOf(ErreurUrlBaseDeTest);
    const message = erreur instanceof Error ? erreur.message : "";
    expect(message).toBe(
      "DATABASE_URL est absente : définis-la dans .env ou dans l'environnement avant de lancer les tests.",
    );
    expect(message).not.toMatch(/postgres/);
  });

  it("refuse une .env qui pointe sur budgapp_prod sans afficher le secret", () => {
    writeFileSync(path.join(dossier, ".env"), 'DATABASE_URL="postgresql://u:motsecret@h/budgapp_prod"\n');
    vi.stubEnv("DATABASE_URL", "");
    expect(() => urlBaseDeTest(dossier)).toThrow(ErreurUrlBaseDeTest);
    expect(() => urlBaseDeTest(dossier)).not.toThrow(/motsecret/);
  });
});
