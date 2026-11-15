#!/usr/bin/env node
// Jalons du pilote : une ligne lisible, sans le raisonnement de Claude.
// Voir docs/pilotage/README.md §3.
//
//   node --env-file=.env scripts/jalon.mjs "M1-P2 · planner : spec écrite, 0 question ouverte"
//   node --env-file=.env scripts/jalon.mjs --niveau cycle --fichier .pilote/resume-cycle.md --titre "Cycle 3 terminé"
//
// --niveau : unite (début/fin d'unité), etape (agent, commit, push — défaut), cycle (résumé de fin de cycle),
//            alerte (blocage, échec).
// Écrit toujours dans .pilote/jalons.log (lu en direct par scripts/pilote.ps1). Poste aussi sur Discord
// si DISCORD_BOT_TOKEN est configuré, dans DISCORD_JALONS_CHANNEL_ID ou, à défaut, DISCORD_CHANNEL_ID.
// PILOTE_JALONS_DISCORD=etape (défaut) envoie tout ; =unite n'envoie que unite/cycle/alerte ; =non n'envoie rien.
// Ne fait jamais échouer l'appelant : sortie 0 dans tous les cas.

import { appendFileSync, mkdirSync, readFileSync } from "node:fs";

const args = process.argv.slice(2);
const opts = {};
const positionnels = [];
for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith("--")) opts[args[i].slice(2)] = args[i + 1] ?? "", i++;
  else positionnels.push(args[i]);
}

const niveau = ["unite", "etape", "cycle", "alerte"].includes(opts.niveau) ? opts.niveau : "etape";
let texte = positionnels.join(" ").trim();
if (opts.fichier) {
  try {
    texte = readFileSync(opts.fichier, "utf8").trim();
  } catch {
    /* fichier absent : on garde le texte positionnel */
  }
}
const titre = (opts.titre ?? "").trim();
const premiereLigne = titre || texte.split("\n")[0] || "(jalon vide)";

const ICONES = { unite: "▶", etape: "·", cycle: "■", alerte: "!" };
const horodatage = new Date().toLocaleString("sv-SE", { timeZone: "America/Toronto" }).slice(0, 19);
const ligne = `[${horodatage}] ${ICONES[niveau]} ${premiereLigne}`;

try {
  mkdirSync(".pilote", { recursive: true });
  appendFileSync(".pilote/jalons.log", `${ligne}\n`);
} catch {
  /* journal local indisponible : on continue */
}
process.stdout.write(`${ligne}\n`);

const BOT = process.env.DISCORD_BOT_TOKEN ?? "";
const SALON = process.env.DISCORD_JALONS_CHANNEL_ID || process.env.DISCORD_CHANNEL_ID || "";
const filtre = (process.env.PILOTE_JALONS_DISCORD ?? "etape").toLowerCase();
const envoyer = BOT && SALON && filtre !== "non" && !(filtre === "unite" && niveau === "etape");

if (envoyer) {
  const PREFIXES = { unite: "▶️", etape: "▫️", cycle: "🟩", alerte: "⚠️" };
  const corps =
    niveau === "cycle" && texte
      ? `${PREFIXES.cycle} **${premiereLigne}**\n${(titre ? texte : texte.split("\n").slice(1).join("\n")).slice(0, 1800)}`
      : `${PREFIXES[niveau]} ${niveau === "unite" || niveau === "alerte" ? `**${premiereLigne}**` : premiereLigne}`;
  try {
    const api = process.env.DISCORD_API_URL ?? "https://discord.com/api/v10";
    const r = await fetch(`${api}/channels/${SALON}/messages`, {
      method: "POST",
      headers: { Authorization: `Bot ${BOT}`, "Content-Type": "application/json" },
      body: JSON.stringify({ content: corps.slice(0, 2000), allowed_mentions: { parse: [] } }),
    });
    if (!r.ok) process.stderr.write(`jalon : Discord ${r.status}\n`);
  } catch (e) {
    process.stderr.write(`jalon : Discord injoignable (${e.message})\n`);
  }
}
process.exit(0);
