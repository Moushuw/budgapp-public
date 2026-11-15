import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parseEnv } from "node:util";
import { deriverUrlSurSchema, SCHEMA_DE_TEST, type SchemaIsole } from "./url-base-de-test.mts";

/**
 * L'URL source : process.env.DATABASE_URL si non vide, sinon la clé DATABASE_URL
 * de `<racine>/.env` lue par util.parseEnv (fichier absent ⇒ undefined).
 * N'écrit rien, n'affiche rien, ne modifie pas process.env.
 */
export function lireDatabaseUrlSource(racine: string): string | undefined {
  const deLEnvironnement = process.env.DATABASE_URL;
  if (deLEnvironnement !== undefined && deLEnvironnement.trim() !== "") {
    return deLEnvironnement;
  }
  const chemin = path.join(racine, ".env");
  if (!existsSync(chemin)) {
    return undefined;
  }
  return parseEnv(readFileSync(chemin, "utf8")).DATABASE_URL;
}

export function urlBaseDeTest(racine: string): string {
  return urlSurSchema(racine, SCHEMA_DE_TEST);
}

export function urlSurSchema(racine: string, schema: SchemaIsole): string {
  return deriverUrlSurSchema(lireDatabaseUrlSource(racine), schema);
}
