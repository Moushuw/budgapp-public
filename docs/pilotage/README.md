# Mode pilote — mode d'emploi pour Benjamin

Le pilote fait avancer BudgApp sans toi : il écrit les specs de lot, fait coder et tester les tranches par les agents, vérifie, commite, pousse et fusionne. Tu interviens pour trancher et pour lever ce qu'aucun agent ne peut lever. Les règles exactes : `gouvernance.md`.

## 1. Préparer (une fois)

1. **Notifications.** Sur la forge Gitea qui héberge le dépôt : Paramètres → Applications → *Générer un jeton*, avec les droits `issue` en lecture/écriture sur le dépôt. Ajoute à `.env` (jamais commité) :
   ```
   GITEA_URL=https://<instance>
   GITEA_TOKEN=<le jeton>
   GITEA_REPO=<proprietaire>/<depot>
   ```
   Tu reçois alors les tickets par les notifications de la forge (courriel ou appli). Pour une notification instantanée sur le téléphone, ajoute l'un ou l'autre :
   ```
   NTFY_URL=https://ntfy.sh/<un-sujet-long-et-imprévisible>   # puis abonne-toi au sujet dans l'appli ntfy
   WEBHOOK_URL=<un webhook HTTP>                               # reçoit {type, titre, message, url}
   ```
   **Discord, notification seule** : mets l'URL du webhook du salon dans `WEBHOOK_URL` ; le script la reconnaît et envoie un message Discord formaté, avec le lien du ticket Gitea où répondre.

   **Discord, question et réponse** (recommandé) : le pilote ouvre un **fil** par question dans un salon, tu réponds dans le fil depuis ton téléphone, il lit ta réponse au cycle suivant et ferme le fil. Il faut un bot (un webhook ne sait qu'envoyer) :
   1. <https://discord.com/developers/applications> → *New Application* « Pilote BudgApp » → onglet *Bot* : *Reset Token*, copie le jeton ; active **Message Content Intent**.
   2. Onglet *OAuth2* → *URL Generator* : portée `bot`, permissions *View Channels*, *Send Messages*, *Create Public Threads*, *Send Messages in Threads*, *Read Message History*, *Manage Threads*. Ouvre l'URL, ajoute le bot à ton serveur.
   3. Discord → Paramètres → Avancés → *Mode développeur* ; clic droit sur le salon → *Copier l'identifiant*.
   4. Dans `.env` :
      ```
      DISCORD_BOT_TOKEN=<le jeton du bot>
      DISCORD_CHANNEL_ID=<l'identifiant du salon>
      ```
   Le webhook devient alors inutile pour ce salon (le script ne double pas le message). Les tickets Gitea restent ouverts en parallèle : ils gardent l'historique, et une réponse à l'un ou à l'autre suffit.

   Test : `node --env-file=.env scripts/notifier.mjs envoyer --type info --titre "Test" --message "Le pilote sait te joindre."`
2. **Le PC reste allumé** pendant que le pilote tourne : désactive la mise en veille (Paramètres → Système → Alimentation).
3. **Tes vrais relevés** dans `donnees-reelles/`. Ils ne sont jamais commités (dossier absent de la copie publique du dépôt).

## 2. Lancer, arrêter

```powershell
# à la racine du dépôt
powershell -ExecutionPolicy Bypass -File .\scripts\pilote.ps1
```

- **Arrêter proprement** : `New-Item .pilote-stop` à la racine. Le cycle en cours se termine, puis le script s'arrête. Supprime le fichier pour pouvoir relancer.
- **Limite d'utilisation** atteinte : le script attend et reprend tout seul quand elle se réinitialise. Rien à faire.
- **Tout attend ta réponse** : le script relit tes réponses toutes les heures.
- Le script s'arrête de lui-même après trois échecs consécutifs, et te notifie.
- `-Detail` affiche en plus chaque commande lancée par l'architecte (sans son raisonnement).

**Jalons sur Discord.** Par défaut dans le même salon que les questions (les questions ont leur fil, les jalons restent dans le salon). Réglages facultatifs dans `.env` :
```
DISCORD_JALONS_CHANNEL_ID=<un salon dédié au suivi>   # sinon : DISCORD_CHANNEL_ID
PILOTE_JALONS_DISCORD=unite                          # unite : seulement début/fin d'unité, résumés et alertes ; non : rien
```

## 3. Suivre et répondre

| Pour… | Lis |
|---|---|
| savoir ce qui a été décidé, et pourquoi | `decisions.md` — une ligne par décision |
| répondre à une question | le ticket Gitea `[pilote] …` (réponds en commentaire), ou `questions-ouvertes.md` directement |
| savoir où on en est | `etat.md`, puis `feuille-de-route.md` |
| le résultat d'un lot | `passes/mN.md`, et l'étiquette `mN` sur `main` |
| ce qui se passe **maintenant** | la console du script (jalons, agents lancés, commits, résumé de fin de cycle) et Discord (mêmes jalons + résumé) ; `.pilote/jalons.log` |
| le détail brut d'un cycle | `.pilote/journal.log` (flux complet, sur le PC, pas commité) |

Une question **`decision`** n'arrête rien : le pilote a déjà appliqué sa recommandation, marquée `PROVISOIRE`. Si tu choisis autrement, il défait et refait. Une question **`bloque`** arrête l'unité concernée jusqu'à ta réponse ; le reste continue.

## 4. Reprendre la main

Arrête le pilote (`.pilote-stop`), puis travaille comme avant : `/ship` reste disponible et inchangé. Pour revenir au pilote, mets `etat.md` à jour si tu as fait avancer quelque chose à la main, et relance le script.

Pour faire traiter une unité précise : `claude` puis `/piloter M1-P4`.
