<#
.SYNOPSIS
Deploys DND Online: the web version, the desktop app and, if asked, the server.

.DESCRIPTION
In this order, so every client finds its update when the server comes back and they
reconnect (they look for one then, see src/lib/updates.svelte.ts):

1. Builds the web version and copies it to the server, which serves it without a restart.
2. Pushes crud to release, GitHub builds and publishes the desktop app.
3. With -Server: pushes the server and builds it on the host, the old one keeps running.
4. Restarts the server, the new one with -Server. Everyone is dropped for a few seconds on
   purpose: reconnecting, the web clients load the new version. The desktop apps follow
   once their update is out, after a restart they look for it every two minutes for half
   an hour.
5. Waits until the desktop app is published, a few minutes.

Run from PowerShell, ssh to the host only works from there.

.EXAMPLE
./scripts/deploy.ps1 -Bump
.EXAMPLE
./scripts/deploy.ps1 -Bump -Server
.EXAMPLE
./scripts/deploy.ps1 -NoRelease
#>
param(
    # Raises the patch version and commits it
    [switch]$Bump,
    # Also deploys the new server, which the restart starts
    [switch]$Server,
    # Only the web version, no desktop release
    [switch]$NoRelease,
    # No longer needed, the server always restarts right after the web version is out:
    # kept so older calls still run
    [switch]$Now,
    [switch]$Force,
    [string]$Me
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

function Restart-Server {
    Step "Restarting the server, everyone reconnects and gets the new version"
    # A newly built server is started in place of the old one, else the same restarts
    $how = if ($Server) { "up -d" } else { "restart" }
    ssh private "bash -c 'cd $host_dir && docker compose $how'"
    Check "Restarting the server"
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

Restart-Server

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
    # Asked every half minute: gh run watch gave up on a passing error of GitHub's API
    # while the build went on
    $result = $null
    while (-not $result) {
        Start-Sleep -Seconds 30
        $state = gh run view $run.databaseId --json status,conclusion 2>$null | ConvertFrom-Json
        if ($state.status -eq "completed") { $result = $state.conclusion }
    }
    if ($result -ne "success") { throw "The desktop release failed: $result" }
    Write-Host "Published"
}

Step "Done: $version"
