$ErrorActionPreference = 'Stop'
$gameRoot = $PSScriptRoot
$gameUrl = 'http://127.0.0.1:5173'
if (-not (Test-Path -LiteralPath (Join-Path $gameRoot 'node_modules/three'))) {
    Push-Location $gameRoot
    try { & npm.cmd ci --no-audit --no-fund; if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' } } finally { Pop-Location }
}
if (-not (Test-Path -LiteralPath (Join-Path $gameRoot 'engine/bin/nethack-engine.exe'))) {
    & (Join-Path $gameRoot 'engine/build.ps1')
}
$running = $false
try { $status = Invoke-RestMethod "$gameUrl/api/status" -TimeoutSec 2; $running = $status.ready } catch {}
if (-not $running) {
    $nodePath = (Get-Command node.exe).Source
    Start-Process -FilePath $nodePath -ArgumentList 'server.mjs' -WorkingDirectory $gameRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $gameRoot '.server.log') -RedirectStandardError (Join-Path $gameRoot '.server-errors.log')
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        Start-Sleep -Milliseconds 200
        try { $status = Invoke-RestMethod "$gameUrl/api/status" -TimeoutSec 1; if ($status.ready) { $running = $true; break } } catch {}
    }
}
if (-not $running) { throw 'The game server did not start. See port/.server-errors.log.' }
$chromePath = Join-Path $env:ProgramFiles 'Google/Chrome/Application/chrome.exe'
if (Test-Path -LiteralPath $chromePath) {
    # This visible window is the game the player explicitly launched.
    Start-Process -FilePath $chromePath -ArgumentList "--app=$gameUrl", '--new-window', '--window-size=1440,900'
} else { Start-Process $gameUrl }
