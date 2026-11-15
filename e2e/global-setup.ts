import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { FullConfig } from "@playwright/test";
import { fermerClientE2e, nbUtilisateurs, schemaCourant } from "./outils/base";
import {
  DOSSIER_CAPTURES,
  enteteIndexCaptures,
  FICHIER_INDEX_CAPTURES,
  lireFiltreCaptures,
  lireModeCaptures,
} from "./outils/captures-noms";

export default async function preparerE2e(config: FullConfig): Promise<void> {
  if (config.configFile === undefined) {
    throw new Error("Le fichier de configuration Playwright est introuvable.");
  }
  const racine = path.dirname(config.configFile);

  const mode = lireModeCaptures(process.env);
  if (mode === "PASSE") {
    lireFiltreCaptures(process.env);
    const dossier = path.join(racine, DOSSIER_CAPTURES);
    rmSync(dossier, { recursive: true, force: true });
    mkdirSync(dossier, { recursive: true });
    writeFileSync(path.join(dossier, FICHIER_INDEX_CAPTURES), enteteIndexCaptures(), "utf8");
  }

  const resultat = spawnSync(
    process.execPath,
    [path.join(racine, "node_modules", "tsx", "dist", "cli.mjs"), "prisma/test/preparer-e2e.mts"],
    { cwd: racine, stdio: "inherit" },
  );
  if (resultat.status !== 0) {
    throw new Error("Préparation du schéma e2e en échec : aucun parcours n'est lancé.");
  }

  try {
    const schema = await schemaCourant();
    if (schema !== "e2e") {
      throw new Error("Le client de vérification ne vise pas le schéma e2e : aucun parcours n'est lancé.");
    }
    const nb = await nbUtilisateurs();
    if (nb !== 1) {
      throw new Error("Le schéma e2e ne contient pas exactement un utilisateur : aucun parcours n'est lancé.");
    }
  } finally {
    await fermerClientE2e();
  }
}
