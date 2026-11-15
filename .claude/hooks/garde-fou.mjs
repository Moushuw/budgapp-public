#!/usr/bin/env node
// Garde-fou du mode pilote (docs/pilotage/gouvernance.md §5).
// Hook PreToolUse sur Bash : bloque les commandes destructrices, où qu'elles
// apparaissent dans la ligne (une règle de permission ne voit que le début).
// Code de sortie 2 = refus ; le message part à Claude, qui doit s'adapter.

import { readFileSync } from "node:fs";

let commande = "";
try {
  const entree = JSON.parse(readFileSync(0, "utf8"));
  commande = String(entree?.tool_input?.command ?? "");
} catch {
  process.exit(0); // entrée illisible : on ne bloque pas un outil qu'on ne comprend pas
}

const INTERDITS = [
  [/\bgit\s+push\b[^\n;&|]*\s(--force\b|--force-with-lease\b|-f\b|\+[\w/-]+)/, "push forcé"],
  [/\bgit\s+reset\s+[^\n;&|]*--hard\b/, "git reset --hard"],
  [/\bgit\s+clean\b[^\n;&|]*\s-[a-zA-Z]*f/, "git clean -f"],
  [/\bgit\s+checkout\s+(--\s+)?\.(\s|$)/, "git checkout -- ."],
  [/\bgit\s+restore\s+[^\n;&|]*(\s\.|--staged\s+\.)(\s|$)/, "git restore ."],
  [/\bgit\s+(rebase|filter-branch|filter-repo)\b/, "réécriture d'historique"],
  [/\bgit\s+branch\s+[^\n;&|]*-D\b/, "suppression forcée de branche"],
  [/\bgit\s+push\b[^\n;&|]*--delete\s+(main|master)\b/, "suppression de main"],
  [/\bgit\s+tag\s+[^\n;&|]*-d\b/, "suppression d'étiquette"],
  [/--no-verify\b/, "contournement des hooks git (--no-verify)"],
  [/\bprisma\s+migrate\s+reset\b/, "prisma migrate reset"],
  [/\bprisma\s+db\s+push\b/, "prisma db push"],
  [/budgapp_prod/i, "toute commande qui touche la base de production"],
  [/\b(DROP\s+(DATABASE|SCHEMA|TABLE)|TRUNCATE)\b/i, "SQL destructeur"],
  [/\brm\s+(-[a-zA-Z]*r[a-zA-Z]*f|-[a-zA-Z]*f[a-zA-Z]*r)\b(?![^\n;&|]*(\.pipeline|\.next|test-results|playwright-report|coverage|node_modules\/\.cache))/, "rm -rf hors dossiers de travail"],
  [/(^|[\s;&|])(cat|type|more|less|head|tail|Get-Content)\s+[^\n;&|]*\.env(\s|$|\.)/, "lecture du fichier .env"],
  [/\b(curl|wget|Invoke-WebRequest|iwr)\b[^\n]*\b(-d|--data|-F|--upload-file|-T|-Body)\b/, "envoi de données vers l'extérieur (passer par scripts/notifier.mjs)"],
];

for (const [motif, nom] of INTERDITS) {
  if (motif.test(commande)) {
    process.stderr.write(
      `Refusé par le garde-fou du mode pilote : ${nom}.\n` +
        `Commande : ${commande}\n` +
        `Voir docs/pilotage/gouvernance.md §5. Si cette action est vraiment nécessaire, ` +
        `c'est une décision pour Benjamin : notifie-la (scripts/notifier.mjs) et continue autre chose.\n`,
    );
    process.exit(2);
  }
}
process.exit(0);
