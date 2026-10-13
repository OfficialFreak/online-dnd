<#
.SYNOPSIS
Deploys DND Online: the web version, the desktop app and, if asked, the server.

.DESCRIPTION
In this order, so every client finds its update when the server comes back and they
reconnect (they look for one then, see src/lib/updates.svelte.ts):

1. Builds the web version and copies it to the server, which serves it without a restart.
2. Pushes crud to release, GitHub builds and publishes the desktop app.
3. With -Server: pushes the server and builds it on the host, the old one keeps running.
4. Waits until the desktop app is published, a few minutes.
5. With -Server: restarts the server, unless someone other than -Me is playing.

Run from PowerShell, ssh to the host only works from there.

.EXAMPLE
./scripts/deploy.ps1 -Bump
.EXAMPLE
./scripts/deploy.ps1 -Bump -Server
#>
param(
    # Raises the patch version and commits it
    [switch]$Bump,
    # Also deploys and restarts the server
    [switch]$Server,
    # Restarts the server even while others are playing, it drops them for a few seconds
    [switch]$Force,
    # Only the web version, no desktop release
    [switch]$NoRelease,
    # Who may be online during a restart, the one deploying
    [string]$Me = "Nils"
)

$ErrorActionPreference = "Stop"
$client = Split-Path $PSScriptRoot -Parent
$server_repo = Join-Path (Split-Path $client -Parent) "dnd-online-server"
$host_dir = "/home/brot/dnd-online-server"
Set-Location $client

function Step([string]$text) {
    Write-Host "`n== $text" -ForegroundColor Cyan
}

function Check([string]$what) {
    if ($LASTEXITCODE) { throw "$what failed" }
}

# The showcase with its mocked app.html must not go into the build
if (Test-Path "src/routes/dev-drag") { throw "The dev-drag showcase is set up, remove it first" }
if (git status --porcelain --untracked-files=no) { throw "There are uncommitted changes" }
if ((git rev-parse --abbrev-ref HEAD) -ne "crud") { throw "Not on the crud branch" }

$config = "src-tauri/tauri.conf.json"
if ($Bump) {
    $text = Get-Content $config -Raw
    if ($text -notmatch '"version": "(\d+)\.(\d+)\.(\d+)"') { throw "No version in $config" }
    $version = "$($Matches[1]).$($Matches[2]).$([int]$Matches[3] + 1)"
    $text = $text -replace '"version": "\d+\.\d+\.\d+"', "`"version`": `"$version`""
    Set-Content $config $text -NoNewline
    git add $config
    git commit -q -m "chore(release): bump version to $version"
    Check "Committing the version"
}
$version = (Get-Content $config -Raw | ConvertFrom-Json).version
Step "Version $version"

Step "Building the web version"
npm run build
Check "Building the web version"

Step "Copying it to the server"
$archive = Join-Path $env:TEMP "web-build.tgz"
tar -czf $archive -C build .
Check "Packing the web version"
scp -q $archive private:/tmp/web-build.tgz
Check "Copying the web version"
ssh private "bash -c 'cd $host_dir/web && find . -mindepth 1 -delete && tar -xzf /tmp/web-build.tgz && rm /tmp/web-build.tgz'"
Check "Unpacking the web version"

$head = git rev-parse HEAD
git push -q origin crud
Check "Pushing crud"
if (-not $NoRelease) {
    Step "Publishing the desktop app"
    git push -q origin crud:release
    Check "Pushing release"
}

if ($Server) {
    Step "Building the server, the old one keeps running"
    git -C $server_repo push -q origin master
    Check "Pushing the server"
    ssh private "bash -c 'cd $host_dir && git pull --ff-only && docker compose build'"
    Check "Building the server"
}

if (-not $NoRelease) {
    Step "Waiting until the desktop app is published"
    # The run shows up a few seconds after the push
    $run = $null
    for ($i = 0; $i -lt 24 -and -not $run; $i++) {
        $run = gh run list --branch release --limit 5 --json databaseId,headSha |
            ConvertFrom-Json | Where-Object headSha -eq $head | Select-Object -First 1
        if (-not $run) { Start-Sleep -Seconds 5 }
    }
    if (-not $run) { throw "No release run for $head" }
    gh run watch $run.databaseId --exit-status --interval 30 | Out-Null
    Check "The desktop release"
    Write-Host "Published"
}

if ($Server) {
    Step "Restarting the server"
    # Who joined and hasn't left since, by the server's log of the last half day
    $online = @{}
    foreach ($line in (ssh private "bash -c 'docker logs --since 12h dnd_online_server 2>&1'")) {
        if ($line -match '^(\S+) joined the game') { $online[$Matches[1]] = 1 + $online[$Matches[1]] }
        elseif ($line -match '^(\S+) left the game') { $online[$Matches[1]] = $online[$Matches[1]] - 1 }
    }
    $others = @($online.Keys | Where-Object { $online[$_] -gt 0 -and $_ -ne $Me })
    if ($others.Count -and -not $Force) {
        throw "Playing right now: $($others -join ', '). Restart with -Force or later: ssh private 'cd $host_dir; docker compose up -d'"
    }
    ssh private "bash -c 'cd $host_dir && docker compose up -d'"
    Check "Restarting the server"
}

Step "Done: $version"
