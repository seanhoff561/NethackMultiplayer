$ErrorActionPreference = 'Stop'
$gameRoot = $PSScriptRoot
$gameUrl = 'http://127.0.0.1:5179'
if (-not (Test-Path -LiteralPath (Join-Path $gameRoot 'node_modules/three'))) {
    Push-Location $gameRoot
    try { & npm.cmd ci --no-audit --no-fund; if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' } } finally { Pop-Location }
}
if (-not (Test-Path -LiteralPath (Join-Path $gameRoot 'engine/bin/nethack-engine-polished-v06.exe'))) {
    & (Join-Path $gameRoot 'engine/build.ps1')
}
if (-not (Test-Path -LiteralPath (Join-Path $gameRoot 'engine/bin/nethack-engine-coop-v08.exe'))) {
    $previousOutput = $env:NETHACK_BUILD_OUTPUT
    try { $env:NETHACK_BUILD_OUTPUT = '..\port\engine\bin\nethack-engine-coop-v08.exe'; & (Join-Path $gameRoot 'engine/build.ps1') -BridgeOnly } finally { $env:NETHACK_BUILD_OUTPUT = $previousOutput }
}
if (-not (Test-Path -LiteralPath (Join-Path $gameRoot 'dist-polished-v08/index.html'))) {
    Push-Location $gameRoot
    try { & npm.cmd run build; if ($LASTEXITCODE -ne 0) { throw 'Renderer build failed.' } } finally { Pop-Location }
}
$running = $false
$status = $null
try { $status = Invoke-RestMethod "$gameUrl/api/status" -TimeoutSec 2 } catch {}
if ($status -and $status.version -ne '0.8.0') { throw 'An older game server is using port 5179. Save your expedition and restart the server to load v0.8 multiplayer.' }
$running = $status -and $status.ready
if (-not $running) {
    $nodePath = (Get-Command node.exe).Source
    Start-Process -FilePath $nodePath -ArgumentList 'server.mjs' -WorkingDirectory $gameRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $gameRoot '.v08-server.log') -RedirectStandardError (Join-Path $gameRoot '.v08-server-errors.log')
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        Start-Sleep -Milliseconds 200
        try { $status = Invoke-RestMethod "$gameUrl/api/status" -TimeoutSec 1; if ($status.ready -and $status.version -eq '0.8.0') { $running = $true; break } } catch {}
    }
}
if (-not $running) { throw 'The game server did not start. See port/.v08-server-errors.log.' }
$launchUrl = $gameUrl
$chromePath = Join-Path $env:ProgramFiles 'Google/Chrome/Application/chrome.exe'
if (Test-Path -LiteralPath $chromePath) {
    # This visible window is the game the player explicitly launched.
    Start-Process -FilePath $chromePath -ArgumentList "--app=$launchUrl", '--new-window', '--window-size=1440,900'
} else { Start-Process $launchUrl }
