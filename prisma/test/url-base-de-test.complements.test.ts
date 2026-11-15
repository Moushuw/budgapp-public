// Compléments aux cas D/E/V de la spec : octets du mot de passe, variantes de budgapp_prod,
// absence de fuite dans les messages. Tests purs, sans base.

import { describe, expect, it } from "vitest";
import { deriverUrlBaseDeTest, ErreurUrlBaseDeTest, estUrlBaseDeTest } from "./url-base-de-test.mts";

function messageDe(entree: string | undefined): string {
  try {
    deriverUrlBaseDeTest(entree);
  } catch (e) {
    return e instanceof Error ? e.message : "";
  }
  return "";
}

describe("deriverUrlBaseDeTest, compléments", () => {
  it("conserve à l'octet un mot de passe à caractères spéciaux (encodés et bruts)", () => {
    const prefixes = [
      "postgresql://us%C3%A9r:p%40ss%3Aw%2Fo%3Frd%23%25!$*'()~@hote:5432/budgapp_dev",
      "postgresql://user:p@ss!$*'()~w@hote/budgapp_dev",
      "postgresql://user:%F0%9F%94%91%20x@hote/budgapp_dev",
    ];
    for (const prefixe of prefixes) {
      for (const requete of ["", "?schema=public", "?a=b%20c&schema=x"]) {
        const resultat = deriverUrlBaseDeTest(`${prefixe}${requete}`);
        expect(resultat.startsWith(`${prefixe}?`)).toBe(true);
        expect(resultat.endsWith("schema=test")).toBe(true);
        expect(estUrlBaseDeTest(resultat)).toBe(true);
      }
    }
  });

  it("ne coupe qu'au premier ? et conserve un second ? dans une valeur", () => {
    expect(deriverUrlBaseDeTest("postgresql://u:p@h/budgapp_dev?a=x?y&schema=public")).toBe(
      "postgresql://u:p@h/budgapp_dev?a=x?y&schema=test",
    );
  });

  it("refuse budgapp_prod même avec schema, port ou nom encodé", () => {
    const entrees = [
      "postgresql://u:pass@h/budgapp_prod?schema=public",
      "postgresql://u:pass@h:6543/budgapp_prod",
      "postgresql://u:pass@h/budgapp%5Fprod",
      "postgres://u:pass@h/budgapp_prod?schema=test",
    ];
    for (const entree of entrees) {
      expect(() => deriverUrlBaseDeTest(entree)).toThrow(ErreurUrlBaseDeTest);
      expect(messageDe(entree)).toContain("production");
      expect(messageDe(entree)).not.toContain("pass");
    }
  });

  it("n'assimile pas budgapp_prod_copie, budgapp_prod2 ni budgapp_dev à la production", () => {
    // La spec §3.1 étape 5 ne refuse que le nom exactement égal à budgapp_prod.
    for (const nom of ["budgapp_prod_copie", "budgapp_prod2", "budgapp_dev"]) {
      expect(deriverUrlBaseDeTest(`postgresql://u:p@h/${nom}`)).toBe(`postgresql://u:p@h/${nom}?schema=test`);
    }
  });

  it("refuse une URL dont le nom de base est un encodage invalide (%ZZ)", () => {
    expect(() => deriverUrlBaseDeTest("postgresql://u:pass@h/%ZZ")).toThrow(ErreurUrlBaseDeTest);
    expect(messageDe("postgresql://u:pass@h/%ZZ")).toBe("DATABASE_URL n'est pas une URL lisible.");
  });

  it("aucun message n'expose l'hôte, l'utilisateur ni le mot de passe", () => {
    const entrees = [
      "pas une url secret",
      "mysql://utilisateurX:motdepasseY@hoteZ/db",
      "postgresql://utilisateurX:motdepasseY@hoteZ/budgapp_dev#frag",
      "postgresql://utilisateurX:motdepasseY@hoteZ/budgapp_prod",
    ];
    for (const entree of entrees) {
      const message = messageDe(entree);
      expect(message).not.toBe("");
      for (const secret of ["utilisateurX", "motdepasseY", "hoteZ", "secret"]) {
        expect(message).not.toContain(secret);
      }
    }
  });

  it("le message d'absence est celui de la spec", () => {
    expect(messageDe(undefined)).toBe(
      "DATABASE_URL est absente : définis-la dans .env ou dans l'environnement avant de lancer les tests.",
    );
  });

  it("le résultat est toujours reconnu comme URL de test, schema une seule fois", () => {
    const resultat = deriverUrlBaseDeTest("postgresql://u:p@h/budgapp_dev?schema=a&SCHEMA=b&schema=c");
    expect(estUrlBaseDeTest(resultat)).toBe(true);
    expect(resultat.match(/schema=/gi)).toHaveLength(2);
  });
});
