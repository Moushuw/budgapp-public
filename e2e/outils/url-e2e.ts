export const VARIABLE_URL_E2E = "BUDGAPP_E2E_DATABASE_URL";

export class ErreurUrlE2e extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ErreurUrlE2e";
  }
}

// Double volontairement estUrlSurSchema (prisma/test) : Playwright charge ce fichier en CommonJS et on n'y importe pas de .mts.
export function verifierUrlE2e(url: string | undefined): string {
  if (url === undefined || url.trim() === "") {
    throw new ErreurUrlE2e(
      `${VARIABLE_URL_E2E} est absente : lance les parcours par npm run e2e, jamais par npx playwright test directement.`,
    );
  }

  let lue: URL;
  try {
    lue = new URL(url);
  } catch {
    throw new ErreurUrlE2e(`${VARIABLE_URL_E2E} n'est pas une URL lisible.`);
  }

  if (lue.protocol !== "postgresql:" && lue.protocol !== "postgres:") {
    throw new ErreurUrlE2e(`${VARIABLE_URL_E2E} doit être une URL PostgreSQL.`);
  }
  if (lue.hash !== "") {
    throw new ErreurUrlE2e(`${VARIABLE_URL_E2E} ne doit pas porter de fragment.`);
  }

  let nomBase: string;
  try {
    nomBase = decodeURIComponent(lue.pathname.slice(1));
  } catch {
    throw new ErreurUrlE2e(`${VARIABLE_URL_E2E} n'est pas une URL lisible.`);
  }
  if (nomBase === "budgapp_prod") {
    throw new ErreurUrlE2e("Les parcours e2e ne s'exécutent jamais contre la base de production.");
  }

  const schemas = lue.searchParams.getAll("schema");
  if (schemas.length !== 1 || schemas[0] !== "e2e") {
    throw new ErreurUrlE2e(`${VARIABLE_URL_E2E} doit viser exactement le schéma e2e.`);
  }
  return url;
}

export function lireUrlE2e(): string {
  return verifierUrlE2e(process.env[VARIABLE_URL_E2E]);
}
