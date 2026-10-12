$ErrorActionPreference = "Continue"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$LogPath = Join-Path $env:TEMP "miks-firebase-auto-deploy.log"
$QuietSeconds = 8
$RetrySeconds = 30
$env:FIREBASE_CLI_DISABLE_UPDATE_CHECK = "true"

Set-Location -LiteralPath $ProjectRoot

function Write-DeployLog([string]$Message) {
  $Line = "[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Message
  Add-Content -LiteralPath $LogPath -Value $Line -Encoding utf8
  Write-Host $Line
}

function Get-ProjectSnapshot {
  $Files = @()
  $Files += Get-ChildItem -LiteralPath $ProjectRoot -File -ErrorAction SilentlyContinue |
    Where-Object { $_.Extension -ne ".log" }
  foreach ($Folder in @("src", "icons", "scripts")) {
    $Path = Join-Path $ProjectRoot $Folder
    if (Test-Path -LiteralPath $Path) {
      $Files += Get-ChildItem -LiteralPath $Path -File -Recurse -ErrorAction SilentlyContinue
    }
  }
  return (($Files | Sort-Object FullName | ForEach-Object {
    "{0}|{1}|{2}" -f $_.FullName, $_.Length, $_.LastWriteTimeUtc.Ticks
  }) -join "`n")
}

function Invoke-FirebaseHostingDeploy {
  Write-DeployLog "Building Miks before Firebase Hosting deploy."
  & npm run build 2>&1 | ForEach-Object {
    Add-Content -LiteralPath $LogPath -Value $_ -Encoding utf8
    Write-Host $_
  }
  if ($LASTEXITCODE -ne 0) {
    Write-DeployLog "Build failed (exit $LASTEXITCODE); no deploy was made."
    return $false
  }

  Write-DeployLog "Deploying to Firebase project miks-510e5."
  & firebase deploy --only hosting --project miks-510e5 2>&1 | ForEach-Object {
    Add-Content -LiteralPath $LogPath -Value $_ -Encoding utf8
    Write-Host $_
  }
  if ($LASTEXITCODE -ne 0) {
    Write-DeployLog "Firebase deploy failed (exit $LASTEXITCODE)."
    return $false
  }
  Write-DeployLog "Firebase Hosting deploy completed successfully."
  return $true
}

Write-DeployLog "Firebase auto-deploy watcher started for $ProjectRoot."
$Snapshot = Get-ProjectSnapshot
$LastAttempt = Get-Date
$Succeeded = Invoke-FirebaseHostingDeploy
$PendingSince = if ($Succeeded) { $null } else { Get-Date }

while ($true) {
  Start-Sleep -Seconds 2
  $NextSnapshot = Get-ProjectSnapshot
  if ($NextSnapshot -ne $Snapshot) {
    $Snapshot = $NextSnapshot
    $PendingSince = Get-Date
    Write-DeployLog "Project files changed; waiting for edits to settle."
  }

  if ($null -ne $PendingSince) {
    $QuietFor = ((Get-Date) - $PendingSince).TotalSeconds
    $SinceAttempt = ((Get-Date) - $LastAttempt).TotalSeconds
    if ($QuietFor -ge $QuietSeconds -and ($Succeeded -or $SinceAttempt -ge $RetrySeconds)) {
      $LastAttempt = Get-Date
      $Succeeded = Invoke-FirebaseHostingDeploy
      if ($Succeeded) {
        $PendingSince = $null
        $Snapshot = Get-ProjectSnapshot
      } else {
        $PendingSince = Get-Date
      }
    }
  }
}
