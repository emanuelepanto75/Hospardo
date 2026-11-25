# Hospardo - installazione della copia di emergenza dell'agenda su un PC dello studio.
# Ogni 15 minuti (e all'accesso a Windows) scarica dal server una copia in sola lettura
# dell'agenda dei prossimi giorni nel file "Agenda di emergenza.html" sul Desktop.
#
# Esecuzione (PowerShell, nella cartella Download):
#   powershell -ExecutionPolicy Bypass -File .\installa-agenda-emergenza.ps1 -Url https://app.hospardo.it
# Disinstallazione:
#   powershell -ExecutionPolicy Bypass -File .\installa-agenda-emergenza.ps1 -Disinstalla
param(
  [string]$Url,
  [switch]$Disinstalla
)
$ErrorActionPreference = 'Stop'
$TaskName = 'Hospardo - agenda di emergenza'
$Dir = Join-Path $env:LOCALAPPDATA 'Hospardo'

if ($Disinstalla) {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
  Remove-Item -Recurse -Force $Dir -ErrorAction SilentlyContinue
  Write-Host 'Copia di emergenza disinstallata (il file sul Desktop puoi cancellarlo a mano).' -ForegroundColor Green
  return
}

Write-Host ''
Write-Host 'Hospardo - installazione della copia di emergenza' -ForegroundColor Cyan
Write-Host ''
if (-not $Url) { $Url = Read-Host "Indirizzo dell'agenda (es. https://app.hospardo.it)" }
$Url = $Url.Trim().TrimEnd('/')
if ($Url -notmatch '^https?://') { throw "Indirizzo non valido: $Url" }

$Key = Read-Host 'Incolla la chiave della postazione (non viene mostrata)' -AsSecureString
if ($Key.Length -lt 10) { throw 'Chiave mancante o troppo corta.' }

New-Item -ItemType Directory -Force -Path $Dir | Out-Null

# La chiave viene salvata cifrata con le protezioni di Windows (DPAPI):
# solo questo utente, su questo PC, puo' leggerla.
@{ url = $Url; token = (ConvertFrom-SecureString $Key) } | ConvertTo-Json | Set-Content -Path (Join-Path $Dir 'config.json') -Encoding UTF8

# Script di aggiornamento, eseguito dall'attivita' pianificata
$Updater = @'
$ErrorActionPreference = 'Stop'
$Dir = Join-Path $env:LOCALAPPDATA 'Hospardo'
$Log = Join-Path $Dir 'emergenza.log'
$Desktop = [Environment]::GetFolderPath('Desktop')
$File = Join-Path $Desktop 'Agenda di emergenza.html'
$Tmp = Join-Path $Dir 'agenda.tmp'
try {
  $cfg = Get-Content -Raw -Path (Join-Path $Dir 'config.json') | ConvertFrom-Json
  $sec = ConvertTo-SecureString $cfg.token
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)
  try { $token = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  Invoke-WebRequest -UseBasicParsing -Uri ($cfg.url + '/api/emergency/snapshot') -Headers @{ Authorization = "Bearer $token" } -OutFile $Tmp -TimeoutSec 60
  $content = Get-Content -Raw -Encoding UTF8 -Path $Tmp
  if ($content -notmatch 'hospardo-snapshot') { throw 'risposta non riconosciuta' }
  Move-Item -Force -Path $Tmp -Destination $File
  Add-Content -Path $Log -Value ((Get-Date -Format 'yyyy-MM-dd HH:mm') + ' aggiornata')
} catch {
  Remove-Item -Force -Path $Tmp -ErrorAction SilentlyContinue
  Add-Content -Path $Log -Value ((Get-Date -Format 'yyyy-MM-dd HH:mm') + ' NON aggiornata: ' + $_.Exception.Message)
}
# registro corto: ultime 500 righe
if (Test-Path $Log) { $lines = Get-Content -Path $Log; if ($lines.Count -gt 500) { $lines | Select-Object -Last 500 | Set-Content -Path $Log } }
'@
Set-Content -Path (Join-Path $Dir 'aggiorna.ps1') -Value $Updater -Encoding UTF8

# Lanciatore senza finestre
$Ps1 = Join-Path $Dir 'aggiorna.ps1'
$Vbs = 'CreateObject("WScript.Shell").Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""' + $Ps1 + '""", 0, False'
Set-Content -Path (Join-Path $Dir 'avvia.vbs') -Value $Vbs -Encoding ASCII

# Attivita' pianificata: ogni 15 minuti e all'accesso a Windows
$Action = New-ScheduledTaskAction -Execute 'wscript.exe' -Argument ('"' + (Join-Path $Dir 'avvia.vbs') + '"')
$Every15 = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 15) -RepetitionDuration (New-TimeSpan -Days 3650)
$AtLogon = New-ScheduledTaskTrigger -AtLogOn -User ("$env:USERDOMAIN\$env:USERNAME")
$Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 5)
Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger @($Every15, $AtLogon) -Settings $Settings -Description "Scarica ogni 15 minuti la copia di emergenza dell'agenda Hospardo" -Force | Out-Null

# Primo aggiornamento subito
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $Ps1
$Desktop = [Environment]::GetFolderPath('Desktop')
$File = Join-Path $Desktop 'Agenda di emergenza.html'
$Last = Get-Content -Path (Join-Path $Dir 'emergenza.log') -Tail 1 -ErrorAction SilentlyContinue
Write-Host ''
if ((Test-Path $File) -and ($Last -match 'aggiornata$')) {
  Write-Host 'Fatto: sul Desktop trovi "Agenda di emergenza.html".' -ForegroundColor Green
  Write-Host 'Si aggiorna da sola ogni 15 minuti finche'' c''e'' internet. Senza internet aprila con doppio clic.'
} else {
  Write-Host "Installazione completata, ma il primo scaricamento non e' riuscito:" -ForegroundColor Yellow
  Write-Host "  $Last"
  Write-Host "Controlla l'indirizzo e la chiave. Per reinstallare, rilancia questo script."
}
