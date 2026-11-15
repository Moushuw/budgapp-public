#!/usr/bin/env node
// Canal entre le pilote (Claude Code en mode autonome) et Benjamin.
// Voir docs/pilotage/README.md §3. Lancer avec : node --env-file=.env scripts/notifier.mjs <commande>
//
//   envoyer --type decision|bloque|info --titre "…" --fichier chemin.md [--id Q-n]
//       Ouvre un ticket Gitea (étiquettes « pilote » + type), poste la question sur Discord
//       (fil de discussion dédié si le bot est configuré), pousse ntfy/webhook si configurés.
//   reponses
//       Liste en JSON les tickets « pilote » ouverts et les fils Discord ouverts, avec leurs réponses.
//   fermer [--numero N] [--id Q-n] --commentaire "…"
//       Commente et ferme le ticket N, répond dans le fil Discord de Q-n et l'archive.
//
// Variables (.env, jamais commitées) :
//   GITEA_URL (ex. https://gitea.example.com)  GITEA_TOKEN  GITEA_REPO (ex. proprietaire/budgapp)
//   NTFY_URL (optionnel, ex. https://ntfy.sh/budgapp-xxxx)  NTFY_TOKEN (optionnel)
//   WEBHOOK_URL (optionnel, ex. webhook HTTP) — reçoit {type, titre, message, url} ;
//               une URL de webhook Discord est reconnue et reçoit un message Discord formaté
//   DISCORD_BOT_TOKEN + DISCORD_CHANNEL_ID (optionnels) — mode conversation : chaque question
//               ouvre un fil dans le salon, Benjamin y répond, le pilote lit le fil.
//               Correspondance question → fil dans .pilote/discord.json (local, non commité).
// Aucune variable configurée : le script le dit et sort en 0. Le fichier
// docs/pilotage/questions-ouvertes.md reste la trace de référence.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";

const [commande, ...reste] = process.argv.slice(2);
const opts = {};
for (let i = 0; i < reste.length; i++) {
  if (reste[i].startsWith("--")) opts[reste[i].slice(2)] = reste[i + 1] ?? "", i++;
}

// Seule l'origine compte (https://hôte[:port]) : une URL collée depuis le navigateur
// porte souvent le chemin du dépôt, ce qui donnait des 404 sur l'API.
const GITEA_URL = (() => {
  const brute = process.env.GITEA_URL ?? "";
  try {
    return brute ? new URL(brute).origin : "";
  } catch {
    return brute.replace(/\/$/, "");
  }
})();
const GITEA_TOKEN = process.env.GITEA_TOKEN ?? "";
const GITEA_REPO = process.env.GITEA_REPO ?? "";
const giteaActif = Boolean(GITEA_URL && GITEA_TOKEN && GITEA_REPO);


// ── Discord ──────────────────────────────────────────────────────────────────
const DISCORD_API = process.env.DISCORD_API_URL ?? "https://discord.com/api/v10"; // surchargeable pour les tests
const BOT = process.env.DISCORD_BOT_TOKEN ?? "";
const SALON = process.env.DISCORD_CHANNEL_ID ?? "";
const botActif = Boolean(BOT && SALON);
const FICHIER_FILS = ".pilote/discord.json";
const COULEURS_DISCORD = { decision: 0xf59e0b, bloque: 0xdc2626, info: 0x16a34a };

function estWebhookDiscord(url) {
  return /^https:\/\/(\w+\.)?discord(app)?\.com\/api\/webhooks\//.test(url ?? "");
}

function embedDiscord(type, titre, message, url) {
  return {
    title: `BudgApp — ${titre}`.slice(0, 256),
    description: message.slice(0, 4000),
    color: COULEURS_DISCORD[type] ?? 0x6b7280,
    ...(url ? { url } : {}),
    footer: { text: type === "decision" ? "Décision provisoire appliquée — réponds pour trancher" : type === "bloque" ? "Unité bloquée en attendant ta réponse" : "Pour information" },
  };
}

async function discord(methode, chemin, corps) {
  const r = await fetch(`${DISCORD_API}${chemin}`, {
    method: methode,
    headers: { Authorization: `Bot ${BOT}`, "Content-Type": "application/json" },
    body: corps ? JSON.stringify(corps) : undefined,
  });
  if (!r.ok) throw new Error(`Discord ${methode} ${chemin} → ${r.status} ${await r.text()}`);
  return r.status === 204 ? null : r.json();
}

function lireFils() {
  return existsSync(FICHIER_FILS) ? JSON.parse(readFileSync(FICHIER_FILS, "utf8")) : {};
}
function ecrireFils(fils) {
  mkdirSync(".pilote", { recursive: true });
  writeFileSync(FICHIER_FILS, JSON.stringify(fils, null, 2));
}

async function ouvrirFilDiscord(id, type, titre, message, url) {
  const msg = await discord("POST", `/channels/${SALON}/messages`, {
    content: type === "info" ? "" : "Réponds dans le fil ci-dessous ; le pilote lit les réponses au début de chaque cycle.",
    embeds: [embedDiscord(type, titre, message, url)],
  });
  if (type === "info") return null;
  const fil = await discord("POST", `/channels/${SALON}/messages/${msg.id}/threads`, {
    name: `${id} — ${titre}`.slice(0, 100),
    auto_archive_duration: 10080,
  });
  const fils = lireFils();
  fils[id] = { fil: fil.id, titre, type, ouvertLe: new Date().toISOString() };
  ecrireFils(fils);
  return fil.id;
}

async function gitea(methode, chemin, corps) {
  const r = await fetch(`${GITEA_URL}/api/v1${chemin}`, {
    method: methode,
    headers: { Authorization: `token ${GITEA_TOKEN}`, "Content-Type": "application/json", Accept: "application/json" },
    body: corps ? JSON.stringify(corps) : undefined,
  });
  if (!r.ok) throw new Error(`Gitea ${methode} ${chemin} → ${r.status} ${await r.text()}`);
  return r.status === 204 ? null : r.json();
}

const COULEURS = { pilote: "#6b7280", decision: "#f59e0b", bloque: "#dc2626", info: "#16a34a" };

async function etiquettes(noms) {
  const existantes = await gitea("GET", `/repos/${GITEA_REPO}/labels?limit=100`);
  const ids = [];
  for (const nom of noms) {
    let e = existantes.find((x) => x.name === nom);
    if (!e) e = await gitea("POST", `/repos/${GITEA_REPO}/labels`, { name: nom, color: COULEURS[nom] ?? "#6b7280" });
    ids.push(e.id);
  }
  return ids;
}

async function pousser(type, titre, message, url) {
  const envois = [];
  if (process.env.NTFY_URL) {
    const u = new URL(process.env.NTFY_URL);
    const headers = { "Content-Type": "application/json" };
    if (process.env.NTFY_TOKEN) headers.Authorization = `Bearer ${process.env.NTFY_TOKEN}`;
    envois.push(
      fetch(u.origin, {
        method: "POST",
        headers,
        body: JSON.stringify({
          topic: u.pathname.replace(/^\//, ""),
          title: `BudgApp — ${titre}`,
          message: message.slice(0, 3500),
          priority: type === "info" ? 3 : 4,
          tags: [type === "bloque" ? "warning" : type === "decision" ? "question" : "white_check_mark"],
          ...(url ? { click: url } : {}),
        }),
      }).then((r) => `ntfy ${r.status}`),
    );
  }
  if (process.env.WEBHOOK_URL && !(botActif && estWebhookDiscord(process.env.WEBHOOK_URL))) {
    const corpsWebhook = estWebhookDiscord(process.env.WEBHOOK_URL)
      ? { username: "Pilote BudgApp", embeds: [embedDiscord(type, titre, message, url)] }
      : { type, titre: `BudgApp — ${titre}`, message: message.slice(0, 3500), url };
    envois.push(
      fetch(process.env.WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpsWebhook),
      }).then((r) => `webhook ${r.status}`),
    );
  }
  return Promise.allSettled(envois);
}

async function envoyer() {
  const type = opts.type ?? "info";
  if (!["decision", "bloque", "info"].includes(type)) throw new Error("--type doit valoir decision, bloque ou info");
  const titre = opts.titre ?? "(sans titre)";
  const corps = opts.fichier ? readFileSync(opts.fichier, "utf8") : (opts.message ?? "");
  let url = null;
  const canaux = [];
  // Chaque canal est indépendant : un Gitea en panne n'empêche pas Discord, et inversement.
  if (giteaActif && type !== "info") {
    try {
      const ticket = await gitea("POST", `/repos/${GITEA_REPO}/issues`, {
        title: `[pilote] ${titre}`,
        body: `${corps}\n\n---\n*Réponds en commentaire ; le pilote lit les réponses au début de chaque cycle.*`,
        labels: await etiquettes(["pilote", type]),
      });
      url = ticket.html_url;
      canaux.push(`gitea ticket ${ticket.number}`);
    } catch (e) {
      canaux.push(`gitea échec: ${e.message}`);
    }
  }
  const id = opts.id || (url ? `G-${url.split("/").pop()}` : `Q-${Date.now()}`);
  if (botActif) {
    try {
      const fil = await ouvrirFilDiscord(id, type, titre, url ? `${corps.slice(0, 3500)}\n\n${url}` : corps, url);
      canaux.push(fil ? `discord fil ${fil}` : "discord message");
    } catch (e) {
      canaux.push(`discord échec: ${e.message}`);
    }
  }
  const resultats = await pousser(type, titre, url ? `${corps.split("\n").find((l) => l.trim()) ?? ""}\n${url}` : corps, url);
  canaux.push(...resultats.map((r) => (r.status === "fulfilled" ? r.value : `échec: ${r.reason}`)));
  if (!giteaActif && canaux.length === 0) {
    process.stdout.write("Aucun canal configuré (GITEA_URL/GITEA_TOKEN, NTFY_URL, WEBHOOK_URL) : rien n'a été envoyé.\n");
  }
  process.stdout.write(JSON.stringify({ id, ticket: url, canaux }) + "\n");
}

async function reponses() {
  const sortie = { gitea: giteaActif, discord: botActif, tickets: [], fils: [] };
  if (giteaActif) {
    let tickets = [];
    try {
      tickets = await gitea("GET", `/repos/${GITEA_REPO}/issues?state=open&type=issues&labels=pilote&limit=50`);
    } catch (e) {
      sortie.erreurGitea = e.message;
    }
    for (const t of tickets) {
      const commentaires = await gitea("GET", `/repos/${GITEA_REPO}/issues/${t.number}/comments`);
      sortie.tickets.push({
        numero: t.number,
        titre: t.title,
        etiquettes: t.labels.map((l) => l.name),
        ouvertLe: t.created_at,
        url: t.html_url,
        commentaires: commentaires.map((c) => ({ auteur: c.user?.login, date: c.created_at, texte: c.body })),
      });
    }
  }
  if (botActif) {
    let moi = null;
    try {
      moi = await discord("GET", "/users/@me");
    } catch (e) {
      sortie.erreurDiscord = e.message;
    }
    for (const [id, f] of moi ? Object.entries(lireFils()) : []) {
      if (f.ferme) continue;
      let messages = [];
      try {
        messages = await discord("GET", `/channels/${f.fil}/messages?limit=50`);
      } catch (e) {
        sortie.erreurDiscord = e.message;
        continue;
      }
      sortie.fils.push({
        id,
        titre: f.titre,
        type: f.type,
        ouvertLe: f.ouvertLe,
        reponses: messages
          .filter((m) => m.author?.id !== moi.id && (m.content ?? "").trim())
          .reverse()
          .map((m) => ({ auteur: m.author?.username, date: m.timestamp, texte: m.content })),
      });
    }
  }
  process.stdout.write(JSON.stringify(sortie, null, 2) + "\n");
}

async function fermer() {
  const faits = [];
  const n = Number(opts.numero);
  if (Number.isInteger(n) && n > 0 && giteaActif) {
    try {
      if (opts.commentaire) await gitea("POST", `/repos/${GITEA_REPO}/issues/${n}/comments`, { body: opts.commentaire });
      await gitea("PATCH", `/repos/${GITEA_REPO}/issues/${n}`, { state: "closed" });
      faits.push(`ticket ${n} fermé`);
    } catch (e) {
      faits.push(`gitea échec: ${e.message}`);
    }
  }
  if (opts.id && botActif) {
    const fils = lireFils();
    const f = fils[opts.id];
    if (f && !f.ferme) {
      try {
      if (opts.commentaire) await discord("POST", `/channels/${f.fil}/messages`, { content: `✅ ${opts.commentaire}`.slice(0, 2000) });
      await discord("PATCH", `/channels/${f.fil}`, { archived: true });
      f.ferme = new Date().toISOString();
      ecrireFils(fils);
      faits.push(`fil ${opts.id} archivé`);
      } catch (e) {
        faits.push(`discord échec: ${e.message}`);
      }
    }
  }
  process.stdout.write((faits.length ? faits.join(", ") : "Rien à fermer (vérifie --numero / --id et la configuration).") + "\n");
}

const actions = { envoyer, reponses, fermer };
if (!actions[commande]) {
  console.error("Usage : notifier.mjs envoyer|reponses|fermer [options] — voir l'en-tête du fichier.");
  process.exit(1);
}
actions[commande]().catch((e) => {
  console.error(`notifier : ${e.message}`);
  process.exit(1);
});
