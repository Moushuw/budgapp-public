<#
  Pilote BudgApp — enchaîne les cycles autonomes de Claude Code.
  Voir docs/pilotage/README.md.

  Usage (PowerShell, à la racine du dépôt) :
      .\scripts\pilote.ps1                 # tourne jusqu'à la fin de la feuille de route
      .\scripts\pilote.ps1 -Cycles 3       # trois cycles puis s'arrête
      .\scripts\pilote.ps1 -Detail         # affiche aussi chaque commande lancée par l'architecte
  Arrêt propre : créer le fichier .pilote-stop à la racine (le cycle en cours se termine).

  Chaque cycle lance une session Claude Code neuve qui exécute le skill « piloter »
  (une unité de travail, puis mise à jour de docs/pilotage/etat.md).

  Ce qui s'affiche en direct, sans le raisonnement de Claude :
    - les jalons que l'architecte publie (scripts/jalon.mjs : début d'unité, verdict de
      chaque agent, commit, push, question posée) ;
    - chaque agent lancé (planner, coder, tester, reviewer, verificateur) ;
    - les commandes git qui écrivent (commit, push, merge, tag) et les vérifications
      (npm run check, e2e) ;
    - en fin de cycle : le résumé, la durée, et le même résumé posté sur Discord.
  Le flux brut complet reste dans .pilote\journal.log.
#>
param(
  [int]$Cycles = 0,                 # 0 = illimité
  [int]$PauseLimiteMinutes = 20,    # attente par défaut si l'heure de réinitialisation est inconnue
  [int]$PauseAttenteMinutes = 60,   # attente quand tout est bloqué sur une réponse de Benjamin
  [string]$Modele = "opus",
  [switch]$Detail                   # affiche aussi les autres commandes Bash
)

$ErrorActionPreference = "Continue"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$racine = Split-Path $PSScriptRoot -Parent
Set-Location $racine
New-Item -ItemType Directory -Force -Path ".pilote" | Out-Null
$journal = Join-Path $racine ".pilote\journal.log"
$fichierJalons = Join-Path $racine ".pilote\jalons.log"

function Ecrire([string]$texte, [string]$couleur = "Gray") {
  $ligne = "[{0:yyyy-MM-dd HH:mm:ss}] {1}" -f (Get-Date), $texte
  Write-Host $ligne -ForegroundColor $couleur
  Add-Content -Path $journal -Value $ligne -Encoding UTF8
}

function Jalon([string]$niveau, [string]$titre, [string]$fichier = "") {
  # Publie un jalon du script lui-même (début/fin de cycle) ; n'échoue jamais.
  $arguments = @("--env-file=.env", "scripts/jalon.mjs", "--niveau", $niveau, "--titre", $titre)
  if ($fichier) { $arguments += @("--fichier", $fichier) }
  & node @arguments 2>$null | Out-Null
}

# Position de lecture de .pilote\jalons.log : on n'affiche que les lignes nouvelles.
$script:posJalons = 0
function Lire-NouveauxJalons {
  if (-not (Test-Path $fichierJalons)) { return }
  $contenu = [System.IO.File]::ReadAllText($fichierJalons, [System.Text.Encoding]::UTF8)
  if ($contenu.Length -le $script:posJalons) { return }
  $nouveau = $contenu.Substring($script:posJalons)
  $script:posJalons = $contenu.Length
  foreach ($l in ($nouveau -split "`r?`n")) {
    if (-not $l.Trim()) { continue }
    $couleur = "Cyan"
    if ($l -match "\] ▶") { $couleur = "Green" }
    elseif ($l -match "\] !") { $couleur = "Yellow" }
    elseif ($l -match "\] ■") { $couleur = "White" }
    Write-Host "  $l" -ForegroundColor $couleur
  }
}
if (Test-Path $fichierJalons) { $script:posJalons = ([System.IO.File]::ReadAllText($fichierJalons, [System.Text.Encoding]::UTF8)).Length }

function Afficher-Outil($bloc) {
  $nom = [string]$bloc.name
  $entree = $bloc.input
  if ($nom -eq "Task" -or $nom -eq "Agent") {
    $agent = [string]$entree.subagent_type
    if (-not $agent) { $agent = "agent" }
    $desc = [string]$entree.description
    Write-Host ("    → {0} : {1}" -f $agent, $desc) -ForegroundColor Magenta
    return
  }
  if ($nom -eq "Bash") {
    $cmd = ([string]$entree.command).Trim()
    if ($cmd -match "jalon\.mjs") { return }   # le jalon s'affiche par le journal
    $court = ($cmd -replace "\s+", " ")
    if ($court.Length -gt 110) { $court = $court.Substring(0, 110) + "…" }
    if ($cmd -match "^(git\s+(commit|push|merge|tag|switch|branch -d)|npm run (check|e2e|test:reel|seed)|npx playwright)") {
      Write-Host ("    $ {0}" -f $court) -ForegroundColor DarkYellow
    } elseif ($Detail) {
      Write-Host ("    $ {0}" -f $court) -ForegroundColor DarkGray
    }
  }
}

$consigne = "Exécute un cycle du skill piloter : lis .claude/skills/piloter/SKILL.md et suis-le à la lettre. " +
            "Ne lance jamais un agent ni une commande en arrière-plan : attends le résultat de chacun avant de continuer, " +
            "car la session s'arrête dès que tu rends la main et tue ce qui tourne encore. " +
            "Termine ta réponse par exactement une des lignes PILOTE: CONTINUER, PILOTE: ATTENTE, PILOTE: TERMINE."

$n = 0
$echecs = 0
Ecrire "Démarrage du pilote (modèle $Modele)." "Green"
while ($true) {
  if (Test-Path ".pilote-stop") { Ecrire "Fichier .pilote-stop présent : arrêt."; break }
  if ($Cycles -gt 0 -and $n -ge $Cycles) { Ecrire "$Cycles cycle(s) faits : arrêt."; break }
  $n++
  $debut = Get-Date
  Ecrire "Cycle $n — début." "Green"

  $script:resultat = ""
  $script:infoResultat = $null
  $script:limite = $null          # dernier rate_limit_info reçu
  $script:agentsTues = 0
  $brut = New-Object System.Text.StringBuilder
  $horsJson = New-Object System.Text.StringBuilder   # messages d'erreur de la CLI, hors flux JSON

  & claude -p $consigne --model $Modele --permission-mode acceptEdits --output-format stream-json --verbose 2>&1 | ForEach-Object {
    $ligneBrute = [string]$_
    [void]$brut.AppendLine($ligneBrute)
    Add-Content -Path $journal -Value $ligneBrute -Encoding UTF8
    $ev = $null
    try { $ev = $ligneBrute | ConvertFrom-Json -ErrorAction Stop } catch { [void]$horsJson.AppendLine($ligneBrute) }
    if ($null -ne $ev) {
      if ($ev.type -eq "rate_limit_event") { $script:limite = $ev.rate_limit_info }
      if ($ev.type -eq "system" -and $ev.subtype -eq "task_notification" -and $ev.status -eq "stopped") { $script:agentsTues++ }
      if ($ev.type -eq "assistant" -and -not $ev.parent_tool_use_id) {
        foreach ($bloc in $ev.message.content) {
          if ($bloc.type -eq "tool_use") { Afficher-Outil $bloc }
        }
      } elseif ($ev.type -eq "result") {
        $script:resultat = [string]$ev.result
        $script:infoResultat = $ev
      }
    }
    Lire-NouveauxJalons
  }
  $code = $LASTEXITCODE
  Lire-NouveauxJalons
  $sortie = $brut.ToString()
  $duree = [int]((Get-Date) - $debut).TotalMinutes

  # Résumé de fin de cycle : la réponse finale de l'architecte, sans la ligne PILOTE.
  $resume = ($script:resultat -split "`r?`n" | Where-Object { $_ -notmatch "^\s*PILOTE:" }) -join "`n"
  if ($resume.Trim()) {
    Write-Host ""
    Write-Host $resume.Trim() -ForegroundColor White
    Write-Host ""
  }
  $texteFin = if ($script:resultat) { $script:resultat } else { $horsJson.ToString() }
  $utilisation = ""
  if ($script:limite -and $script:limite.unifiedWindows) {
    $u5 = [math]::Round(100 * [double]$script:limite.unifiedWindows.five_hour.utilization)
    $u7 = [math]::Round(100 * [double]$script:limite.unifiedWindows.seven_day.utilization)
    $utilisation = "utilisation : $u5 % sur 5 h, $u7 % sur 7 jours"
    Ecrire $utilisation "DarkGray"
  }

  if ($texteFin -match "PILOTE:\s*TERMINE") {
    Set-Content -Path ".pilote\resume-cycle.md" -Value $resume -Encoding UTF8
    Jalon "cycle" "Cycle $n terminé ($duree min) — feuille de route TERMINÉE" ".pilote\resume-cycle.md"
    Ecrire "Feuille de route terminée." "Green"
    break
  }

  if ($texteFin -match "PILOTE:\s*ATTENTE") {
    $echecs = 0
    Set-Content -Path ".pilote\resume-cycle.md" -Value $resume -Encoding UTF8
    Jalon "cycle" "Cycle $n terminé ($duree min) — tout attend ta réponse" ".pilote\resume-cycle.md"
    Ecrire "Tout attend une réponse de Benjamin : prochaine lecture dans $PauseAttenteMinutes min." "Yellow"
    Start-Sleep -Seconds ($PauseAttenteMinutes * 60)
    continue
  }

  if ($texteFin -notmatch "PILOTE:\s*CONTINUER") {
    # Pas de ligne de fin : soit la limite d'utilisation a coupé le cycle, soit il a échoué.
    # Limite d'utilisation : on se fie au dernier rate_limit_event (statut autre que « allowed »),
    # ou au message d'erreur final — jamais au flux brut, qui contient « rate_limit » à chaque événement.
    $limiteAtteinte = ($script:limite -and [string]$script:limite.status -ne "allowed") -or
      (($script:infoResultat -and $script:infoResultat.is_error) -and ($texteFin -match "(?i)(usage limit|limit reached|hit your limit|limite d'utilisation)")) -or
      ($horsJson.ToString() -match "(?i)(usage limit|limit reached|hit your limit)")
    if ($limiteAtteinte) {
      $attente = $PauseLimiteMinutes
      if ($script:limite -and $script:limite.resetsAt) {
        $reprise = [DateTimeOffset]::FromUnixTimeSeconds([int64]$script:limite.resetsAt).LocalDateTime.AddMinutes(2)
        $attente = [math]::Max(1, [math]::Ceiling(($reprise - (Get-Date)).TotalMinutes))
      }
      Jalon "alerte" "Limite d'utilisation atteinte au cycle $n : reprise automatique dans $attente min"
      Ecrire "Limite d'utilisation atteinte : nouvelle tentative dans $attente min." "Yellow"
      $n--   # un cycle coupé par la limite ne compte pas
      Start-Sleep -Seconds ($attente * 60)
      continue
    }
    if ($script:agentsTues -gt 0) {
      # L'architecte a rendu la main avec un agent encore au travail : la session l'a tué.
      # Pas une vraie panne : le cycle suivant reprend l'unité depuis etat.md.
      Jalon "alerte" "Cycle $n interrompu : un agent tournait encore en arrière-plan ($($script:agentsTues) arrêté). Reprise dans 1 min."
      Ecrire "Cycle $n interrompu (agent en arrière-plan arrêté) : reprise dans 1 min." "Yellow"
      Start-Sleep -Seconds 60
      continue
    }
    $echecs++
    if ($echecs -ge 3) {
      Ecrire "Trois cycles de suite terminés de façon inattendue : arrêt. Voir .pilote\journal.log." "Red"
      Jalon "alerte" "Pilote arrêté après trois échecs de suite (dernier code $code) — voir .pilote/journal.log sur le PC"
      & node --env-file=.env scripts/notifier.mjs envoyer --type bloque --titre "Pilote arrêté après trois échecs" --message "Trois cycles de suite ont échoué (dernier code $code). Le journal est dans .pilote/journal.log sur le PC." | Out-Null
      break
    }
    Jalon "alerte" "Cycle $n terminé de façon inattendue (code $code, échec $echecs/3) : reprise dans 5 min"
    Ecrire "Cycle $n terminé de façon inattendue (code $code, échec $echecs/3) : pause de 5 min puis reprise." "Yellow"
    Start-Sleep -Seconds 300
    continue
  }

  $echecs = 0
  Set-Content -Path ".pilote\resume-cycle.md" -Value $resume -Encoding UTF8
  Jalon "cycle" "Cycle $n terminé ($duree min)" ".pilote\resume-cycle.md"
  Ecrire "Cycle $n — terminé ($duree min)." "Green"
}
