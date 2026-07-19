<#
Create or remove a private agent worktree per CLAUDE.md's concurrent-session
rules - the whole ritual as one command, including the safe teardown order.

  powershell -File scripts/agent-worktree.ps1 -Name mywork           # create
  powershell -File scripts/agent-worktree.ps1 -Name mywork -Remove   # tear down

Create: git fetch, worktree at origin/main under $env:TEMP\stb-wt-<name>,
junction the shared v2\node_modules in (no npm install), suggest a unique
STB_E2E_PORT.

Remove: delete the node_modules junction FIRST and verify it is gone before
`git worktree remove` - a recursive delete through a live junction nukes the
REAL node_modules (see docs/PITFALLS.md). Refuses to remove a dirty worktree.

NOTE: keep this file pure ASCII - PowerShell 5.1 reads BOM-less UTF-8 as ANSI
and mangles anything fancier into parse errors.
#>
param(
  [Parameter(Mandatory = $true)] [string]$Name,
  [switch]$Remove,
  [string]$Parent = $env:TEMP
)
$ErrorActionPreference = 'Stop'

$repo = Split-Path -Parent $PSScriptRoot   # scripts/ lives at the repo root
$wt = Join-Path $Parent "stb-wt-$Name"
$junction = Join-Path $wt 'v2\node_modules'

if ($Remove) {
  if (Test-Path $junction) {
    cmd /c rmdir $junction   # removes the junction only, never its target
    if (Test-Path $junction) {
      throw "Junction still present after rmdir: $junction - NOT removing the worktree."
    }
  }
  git -C $repo worktree remove $wt   # refuses if dirty; do not add --force
  if ($LASTEXITCODE -ne 0) { throw 'git worktree remove failed (dirty worktree? commit or discard first)' }
  Write-Host "Removed $wt"
  return
}

git -C $repo fetch
if ($LASTEXITCODE -ne 0) { throw 'git fetch failed' }
git -C $repo worktree add $wt origin/main
if ($LASTEXITCODE -ne 0) { throw 'git worktree add failed' }

New-Item -ItemType Junction -Path $junction -Target (Join-Path $repo 'v2\node_modules') | Out-Null
if (-not (Test-Path (Join-Path $junction 'astro'))) { throw 'node_modules junction did not resolve' }

$port = Get-Random -Minimum 4400 -Maximum 4999
Write-Host "Worktree ready: $wt"
Write-Host "Gate there with:  cd $wt\v2; npm run gate"
Write-Host "For e2e, use your own port:  `$env:STB_E2E_PORT = '$port'"
Write-Host "Before pushing: git fetch, rebase onto origin/main, re-gate, push HEAD:main (CLAUDE.md)."
Write-Host "Tear down with:  powershell -File scripts/agent-worktree.ps1 -Name $Name -Remove"
