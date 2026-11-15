export const SCHEMA_DE_TEST = "test";
export const SCHEMA_E2E = "e2e";
export const SCHEMAS_ISOLES = [SCHEMA_DE_TEST, SCHEMA_E2E] as const;
export type SchemaIsole = (typeof SCHEMAS_ISOLES)[number];

/** Erreur de configuration de la base de test. Son message ne contient JAMAIS l'URL ni un fragment de l'URL (mot de passe). */
export class ErreurUrlBaseDeTest extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ErreurUrlBaseDeTest";
  }
}

/** Vrai ssi `url` est une URL lisible dont les paramètres `schema` valent exactement [schema]. Ne lève jamais. */
export function estUrlSurSchema(url: string, schema: SchemaIsole): boolean {
  try {
    const valeurs = new URL(url).searchParams.getAll("schema");
    return valeurs.length === 1 && valeurs[0] === schema;
  } catch {
    return false;
  }
}

/** Vrai ssi `url` est une URL lisible dont les paramètres `schema` valent exactement ["test"]. Ne lève jamais. */
export function estUrlBaseDeTest(url: string): boolean {
  return estUrlSurSchema(url, SCHEMA_DE_TEST);
}

/**
 * Dérive l'URL d'un schéma isolé de l'URL de dev : retire tout paramètre de requête
 * dont la clé décodée est `schema`, puis ajoute `schema=<schema>` en dernier.
 * Lève ErreurUrlBaseDeTest si le schéma est inconnu, si l'entrée est absente, illisible ou interdite,
 * ou si le résultat ne passe pas estUrlSurSchema.
 */
export function deriverUrlSurSchema(urlSource: string | undefined, schema: SchemaIsole): string {
  if (!SCHEMAS_ISOLES.includes(schema)) {
    throw new ErreurUrlBaseDeTest("Schéma isolé inconnu.");
  }

  if (urlSource === undefined || urlSource.trim() === "") {
    throw new ErreurUrlBaseDeTest(
      "DATABASE_URL est absente : définis-la dans .env ou dans l'environnement avant de lancer les tests.",
    );
  }

  let url: URL;
  try {
    url = new URL(urlSource);
  } catch {
    throw new ErreurUrlBaseDeTest("DATABASE_URL n'est pas une URL lisible.");
  }

  if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") {
    throw new ErreurUrlBaseDeTest("DATABASE_URL doit être une URL PostgreSQL (postgresql:// ou postgres://).");
  }
  if (url.hash !== "") {
    throw new ErreurUrlBaseDeTest("DATABASE_URL ne doit pas porter de fragment (#…).");
  }

  let nomBase: string;
  try {
    nomBase = decodeURIComponent(url.pathname.slice(1));
  } catch {
    throw new ErreurUrlBaseDeTest("DATABASE_URL n'est pas une URL lisible.");
  }
  if (nomBase === "budgapp_prod") {
    throw new ErreurUrlBaseDeTest("Les tests ne s'exécutent jamais contre la base de production.");
  }

  const positionRequete = urlSource.indexOf("?");
  const avant = positionRequete === -1 ? urlSource : urlSource.slice(0, positionRequete);
  const requete = positionRequete === -1 ? "" : urlSource.slice(positionRequete + 1);

  const conserves = requete
    .split("&")
    .filter((morceau) => morceau !== "")
    .filter((morceau) => [...new URLSearchParams(morceau).keys()][0] !== "schema");

  const resultat = `${avant}?${[...conserves, `schema=${schema}`].join("&")}`;

  if (!estUrlSurSchema(resultat, schema)) {
    throw new ErreurUrlBaseDeTest(`La dérivation n'a pas produit une URL sur le schéma ${schema}.`);
  }
  return resultat;
}

/** deriverUrlSurSchema(urlSource, SCHEMA_DE_TEST). */
export function deriverUrlBaseDeTest(urlSource: string | undefined): string {
  return deriverUrlSurSchema(urlSource, SCHEMA_DE_TEST);
}
