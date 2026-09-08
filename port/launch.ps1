$ErrorActionPreference = 'Stop'
$gameRoot = $PSScriptRoot
$gameUrl = 'http://127.0.0.1:5178'
if (-not (Test-Path -LiteralPath (Join-Path $gameRoot 'node_modules/three'))) {
    Push-Location $gameRoot
    try { & npm.cmd ci --no-audit --no-fund; if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' } } finally { Pop-Location }
}
if (-not (Test-Path -LiteralPath (Join-Path $gameRoot 'engine/bin/nethack-engine-polished-v06.exe'))) {
    & (Join-Path $gameRoot 'engine/build.ps1')
}
if (-not (Test-Path -LiteralPath (Join-Path $gameRoot 'dist-polished-v07/index.html'))) {
    Push-Location $gameRoot
    try { & npm.cmd run build; if ($LASTEXITCODE -ne 0) { throw 'Renderer build failed.' } } finally { Pop-Location }
}
$running = $false
$status = $null
try { $status = Invoke-RestMethod "$gameUrl/api/status" -TimeoutSec 2 } catch {}
if ($status -and $status.version -ne '0.7.0') { throw 'A different build is using this port. Open the v0.7 game server.' }
$running = $status -and $status.ready
if (-not $running) {
    $nodePath = (Get-Command node.exe).Source
    Start-Process -FilePath $nodePath -ArgumentList 'server.mjs' -WorkingDirectory $gameRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $gameRoot '.v07-server.log') -RedirectStandardError (Join-Path $gameRoot '.v07-server-errors.log')
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        Start-Sleep -Milliseconds 200
        try { $status = Invoke-RestMethod "$gameUrl/api/status" -TimeoutSec 1; if ($status.ready -and $status.version -eq '0.7.0') { $running = $true; break } } catch {}
    }
}
if (-not $running) { throw 'The game server did not start. See port/.v07-server-errors.log.' }
# Carry this browser's existing preferences across the local version upgrade.
$launchUrl = $gameUrl
try {
    $previousStatus = Invoke-RestMethod 'http://127.0.0.1:5177/api/status' -TimeoutSec 1
    $previousPage = Join-Path $gameRoot 'dist-polished-v06/index.html'
    if ($previousStatus.ready -and (Test-Path -LiteralPath $previousPage)) {
        $previousHtml = [IO.File]::ReadAllText($previousPage)
        if (-not $previousHtml.Contains('descent-v07-upgrade')) {
            $handoff = @'
<script id="descent-v07-upgrade">if(new URLSearchParams(location.search).get('upgrade')==='v07'){let prefs='{}';try{prefs=localStorage.getItem('descent.settings')||'{}';}catch{}location.replace('http://127.0.0.1:5178/#descentSettings='+encodeURIComponent(prefs));}</script>
'@
            [IO.File]::WriteAllText($previousPage,$previousHtml.Replace('</head>',$handoff+'</head>'))
        }
        $launchUrl = 'http://127.0.0.1:5177/?upgrade=v07'
    }
} catch {}
$chromePath = Join-Path $env:ProgramFiles 'Google/Chrome/Application/chrome.exe'
if (Test-Path -LiteralPath $chromePath) {
    # This visible window is the game the player explicitly launched.
    Start-Process -FilePath $chromePath -ArgumentList "--app=$launchUrl", '--new-window', '--window-size=1440,900'
} else { Start-Process $launchUrl }
