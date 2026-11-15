import { fileURLToPath } from "node:url";
import { preparerSchema } from "./preparer-schema.mts";
import { SCHEMA_E2E } from "./url-base-de-test.mts";

const RACINE = fileURLToPath(new URL("../../", import.meta.url));

try {
  await preparerSchema(RACINE, SCHEMA_E2E);
} catch (erreur) {
  process.stderr.write(`${erreur instanceof Error ? erreur.message : "Préparation du schéma e2e en échec."}\n`);
  process.exitCode = 1;
}
