import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { VARIABLE_URL_E2E } from "../e2e/outils/url-e2e.ts";
import { urlSurSchema } from "../prisma/test/environnement.mts";
import { SCHEMA_E2E } from "../prisma/test/url-base-de-test.mts";

const RACINE = fileURLToPath(new URL("../", import.meta.url));
const CLI_PLAYWRIGHT = path.join(RACINE, "node_modules", "@playwright", "test", "cli.js");

let url: string;
try {
  url = urlSurSchema(RACINE, SCHEMA_E2E);
} catch (erreur) {
  process.stderr.write(`${erreur instanceof Error ? erreur.message : "URL e2e illisible."}\n`);
  process.exit(1);
}

// Le bureau d'abord : le projet `mobile` est conservé pour M9 mais ne se lance que nommé
// (`npm run e2e -- --project=mobile`) — docs/pilotage/consignes-benjamin-2026-10-08.md §1.
const argumentsPlaywright = process.argv.slice(2);
const projetNomme = argumentsPlaywright.some((a) => a === "--project" || a.startsWith("--project="));
const projets = projetNomme ? [] : ["--project=bureau"];

const debut = performance.now();
const resultat = spawnSync(process.execPath, [CLI_PLAYWRIGHT, "test", ...projets, ...argumentsPlaywright], {
  cwd: RACINE,
  stdio: "inherit",
  env: { ...process.env, [VARIABLE_URL_E2E]: url },
});

const code = resultat.status ?? 1;
const secondes = Math.round((performance.now() - debut) / 1000);
process.stdout.write(`Parcours e2e terminés en ${String(secondes)} s (code ${String(code)}).\n`);
process.exit(code);
