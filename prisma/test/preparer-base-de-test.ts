import { fileURLToPath } from "node:url";
import { preparerSchema } from "./preparer-schema.mts";
import { SCHEMA_DE_TEST } from "./url-base-de-test.mts";

export {
  verifierEmplacementExtensions,
  migrationAnnonceSchemaTest,
  type LigneExtension,
} from "./preparer-schema.mts";

const RACINE = fileURLToPath(new URL("../../", import.meta.url));

export default async function preparerBaseDeTest(): Promise<void> {
  await preparerSchema(RACINE, SCHEMA_DE_TEST);
}
