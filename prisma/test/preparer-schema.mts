import { spawnSync } from "node:child_process";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { urlSurSchema } from "./environnement.mts";
import { estUrlSurSchema, SCHEMA_DE_TEST, type SchemaIsole } from "./url-base-de-test.mts";

export interface LigneExtension {
  extension: string;
  schema: string;
}

// Sans ce contrôle, sur une base neuve, la migration pg_trgm_unaccent créerait
// les extensions dans le schéma isolé et deviendrait un no-op pour public.
export function verifierEmplacementExtensions(
  lignes: readonly LigneExtension[],
  schemaIsole: SchemaIsole = SCHEMA_DE_TEST,
): void {
  for (const nom of ["pg_trgm", "unaccent"]) {
    const ligne = lignes.find((l) => l.extension === nom);
    if (ligne === undefined) {
      throw new Error(
        `L'extension ${nom} n'est pas installée dans la base. Applique d'abord les migrations sur le schéma public (npx prisma migrate deploy, avec la base de dev) : sinon la migration la créerait dans le schéma ${schemaIsole}.`,
      );
    }
    if (ligne.schema !== "public") {
      throw new Error(
        `L'extension ${nom} est installée dans le schéma ${ligne.schema}, pas dans public : public.similarity() ne fonctionnera pas.`,
      );
    }
  }
}

// Fermé par défaut : si le format de sortie de Prisma change, on s'arrête sans seeder.
export function migrationAnnonceSchema(sortie: string, schema: SchemaIsole): boolean {
  return sortie.includes(`schema "${schema}"`);
}

export function migrationAnnonceSchemaTest(sortie: string): boolean {
  return migrationAnnonceSchema(sortie, SCHEMA_DE_TEST);
}

async function verifierExtensionsDansPublic(url: string, schema: SchemaIsole): Promise<void> {
  const prisma = new PrismaClient({ datasourceUrl: url });
  try {
    const lignes = await prisma.$queryRaw<LigneExtension[]>`
      SELECT e.extname AS "extension", n.nspname AS "schema"
      FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace
      WHERE e.extname IN ('pg_trgm', 'unaccent')
    `;
    verifierEmplacementExtensions(lignes, schema);
  } finally {
    await prisma.$disconnect();
  }
}

export const MARQUEUR_HOTE = "[hôte masqué]";

/** Remplace le fragment `at "hôte:port"` (ou entre accents graves) des sorties Prisma. */
export function masquerHote(sortie: string): string {
  return sortie.replace(/\bat (["`])[^"`]*\1/g, (_m, q: string) => `at ${q}${MARQUEUR_HOTE}${q}`);
}

function executer(racine: string, schema: SchemaIsole, libelle: string, args: readonly string[], url: string): string {
  const resultat = spawnSync(process.execPath, [...args], {
    cwd: racine,
    env: { ...process.env, DATABASE_URL: url },
    encoding: "utf8",
  });
  const stdout = resultat.stdout;
  const stderr = resultat.stderr;
  if (resultat.error !== undefined || resultat.status !== 0) {
    process.stderr.write(masquerHote(stdout));
    process.stderr.write(masquerHote(stderr));
    throw new Error(`Préparation du schéma ${schema} : échec de ${libelle} (code ${String(resultat.status)}).`);
  }
  return stdout + stderr;
}

export async function preparerSchema(racine: string, schema: SchemaIsole): Promise<void> {
  const url = urlSurSchema(racine, schema);
  if (!estUrlSurSchema(url, schema)) {
    throw new Error(`L'URL dérivée n'est pas sur le schéma ${schema} : préparation annulée.`);
  }
  const debut = performance.now();

  await verifierExtensionsDansPublic(url, schema);

  const cliPrisma = path.join(racine, "node_modules", "prisma", "build", "index.js");
  const cliTsx = path.join(racine, "node_modules", "tsx", "dist", "cli.mjs");

  const sortieMigration = executer(racine, schema, "prisma migrate deploy", [cliPrisma, "migrate", "deploy"], url);
  if (!migrationAnnonceSchema(sortieMigration, schema)) {
    throw new Error(
      `prisma migrate deploy n'annonce pas le schéma ${schema} : seed annulé pour protéger la base de dev.`,
    );
  }

  executer(racine, schema, "seed", [cliTsx, "prisma/seed.ts"], url);

  const ms = Math.round(performance.now() - debut);
  process.stdout.write(`Base prête (schéma ${schema}) : migrations et seed en ${String(ms)} ms.\n`);
}
