import { ErreurUrlBaseDeTest, estUrlBaseDeTest } from "./url-base-de-test.mts";

if (!estUrlBaseDeTest(process.env.DATABASE_URL ?? "")) {
  throw new ErreurUrlBaseDeTest(
    "Garde-fou : DATABASE_URL ne vise pas le schéma test dans ce worker de Vitest. Aucun test n'est lancé.",
  );
}
