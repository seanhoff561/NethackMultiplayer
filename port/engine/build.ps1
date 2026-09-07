# NetHack: Descent build, 2026-09-07. Distributed under dat/license.
param([switch]$BridgeOnly)
$ErrorActionPreference = 'Stop'
$engineRoot = $PSScriptRoot
$repoRoot = (Resolve-Path (Join-Path $engineRoot '../..')).Path
$sdkRoot = Join-Path $repoRoot '.tools/sdk'
$vswherePath = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio/Installer/vswhere.exe'
if (-not $env:NETHACK_VCVARS) {
    if (Test-Path -LiteralPath $vswherePath) {
        $vsRoot = & $vswherePath -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
        if ($vsRoot) { $env:NETHACK_VCVARS = Join-Path $vsRoot 'VC/Auxiliary/Build/vcvars64.bat' }
    }
}
if (-not $env:NETHACK_VCVARS) {
    $fallback = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio/2019/BuildTools/VC/Auxiliary/Build/vcvars64.bat'
    if (Test-Path -LiteralPath $fallback) { $env:NETHACK_VCVARS = $fallback }
}
if (-not $env:NETHACK_VCVARS -or -not (Test-Path -LiteralPath $env:NETHACK_VCVARS)) { throw 'Install Visual Studio C++ Build Tools, then run this script again.' }
New-Item -ItemType Directory -Path $sdkRoot -Force | Out-Null
$sdkPackages = @(
    @{ Name='microsoft.windows.sdk.cpp'; File='sdk.zip'; Folder='headers'; Hash='E4EFE1768EA61F4F999DBEF61B09895320629F975F9CEED8290A9633E0C31623' },
    @{ Name='microsoft.windows.sdk.cpp.x64'; File='x64.zip'; Folder='x64'; Hash='F8475CF8654763DD5D5DB050B99788EF3CEAE4436A2FBA8FE4EA3B022C656E19' }
)
foreach ($package in $sdkPackages) {
    $destination = Join-Path $sdkRoot $package.Folder
    if (-not (Test-Path -LiteralPath (Join-Path $destination 'c'))) {
        $archive = Join-Path $sdkRoot $package.File
        if (-not (Test-Path -LiteralPath $archive)) {
            Write-Host "Downloading Microsoft Windows SDK package $($package.Name)..."
            Invoke-WebRequest -Uri "https://api.nuget.org/v3-flatcontainer/$($package.Name)/10.0.22621.3233/$($package.Name).10.0.22621.3233.nupkg" -OutFile $archive
        }
        if ((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash -ne $package.Hash) { throw "SDK package checksum mismatch: $archive" }
        Expand-Archive -LiteralPath $archive -DestinationPath $destination -Force
    }
}
foreach ($folder in @('build','bin','data')) { New-Item -ItemType Directory -Path (Join-Path $engineRoot $folder) -Force | Out-Null }
if (-not $BridgeOnly) {
    if (-not (Test-Path -LiteralPath (Join-Path $repoRoot 'src/Makefile'))) { Copy-Item -LiteralPath (Join-Path $repoRoot 'sys/windows/Makefile.nmake') -Destination (Join-Path $repoRoot 'src/Makefile') }
    & (Join-Path $engineRoot 'build-core.cmd')
    if ($LASTEXITCODE -ne 0) { throw 'NetHack core compilation failed.' }
}
$linkFile = Join-Path $repoRoot 'src/NetHack.lnk'
if (-not (Test-Path -LiteralPath $linkFile)) { throw 'Core link response missing; run without -BridgeOnly.' }
$linkText = [IO.File]::ReadAllText($linkFile).Replace('objtty\x64\windmain.o','..\port\engine\build\windmain.o').Replace('objtty\x64\windows.o','..\port\engine\build\windows.o')
$linkText = $linkText.Replace('objtty\x64\monmove.o','..\port\engine\build\monmove.o').Replace('objtty\x64\mhitu.o','..\port\engine\build\mhitu.o').Replace('objtty\x64\dogmove.o','..\port\engine\build\dogmove.o').Replace('objtty\x64\mon.o','..\port\engine\build\mon.o')
$linkText = $linkText.Replace('objtty\x64\pickup.o','..\port\engine\build\pickup.o')
$linkText = $linkText.Replace('objtty\x64\dothrow.o','..\port\engine\build\dothrow.o').Replace('objtty\x64\zap.o','..\port\engine\build\zap.o')
$linkText = $linkText.Replace('objtty\x64\do_wear.o','..\port\engine\build\do_wear.o')
$linkText += "`r`n..\port\engine\build\bridge.o ..\port\engine\build\winshim.o`r`n"
[IO.File]::WriteAllText((Join-Path $engineRoot 'engine.lnk'),$linkText)
& (Join-Path $engineRoot 'build-bridge.cmd')
if ($LASTEXITCODE -ne 0) { throw 'NetHack bridge compilation failed.' }
foreach ($file in @('nhdat500','Guidebook.txt','NetHack.txt','opthelp','license','symbols','nethackrc.template','sysconf.template')) {
    $source = Join-Path $repoRoot "binary/$file"
    if (Test-Path -LiteralPath $source) { Copy-Item -LiteralPath $source -Destination (Join-Path $engineRoot "data/$file") -Force }
}
if (-not (Test-Path -LiteralPath (Join-Path $engineRoot 'data/sysconf'))) {
    $config = [IO.File]::ReadAllText((Join-Path $engineRoot 'data/sysconf.template')) + "`r`nPORTABLE_DEVICE_PATHS=1`r`n"
    [IO.File]::WriteAllText((Join-Path $engineRoot 'data/sysconf'),$config)
}
if (-not (Test-Path -LiteralPath (Join-Path $engineRoot 'data/record'))) { [IO.File]::WriteAllText((Join-Path $engineRoot 'data/record'),'') }
Write-Host 'Built port/engine/bin/nethack-engine-polished-v06.exe from this NetHack source tree.'
