# Automated Postgres backup for Pharmacy_System.
# Usage:
#   .\scripts\backup-database.ps1
#   .\scripts\backup-database.ps1 -KeepDays 14
#
# Schedule with Task Scheduler (weekly/daily) pointing at this file.

param(
  [string]$EnvFile = "",
  [string]$OutDir = "",
  [int]$KeepDays = 30
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot

if (-not $EnvFile) {
  $EnvFile = Join-Path $RepoRoot "backend\.env"
}
if (-not $OutDir) {
  $OutDir = Join-Path $RepoRoot "backups"
}

if (-not (Test-Path $EnvFile)) {
  throw "Env file not found: $EnvFile`nCreate backend\.env with DATABASE_URL=..."
}

$pgDump = Get-Command pg_dump -ErrorAction SilentlyContinue
if (-not $pgDump) {
  throw "pg_dump not found. Install PostgreSQL client tools and ensure pg_dump is on PATH."
}

$databaseUrl = $null
Get-Content $EnvFile | ForEach-Object {
  $line = $_.Trim()
  if (-not $line -or $line.StartsWith("#")) { return }
  if ($line -match '^(?:export\s+)?DATABASE_URL\s*=\s*(.+)$') {
    $databaseUrl = $Matches[1].Trim().Trim('"').Trim("'")
  }
}

if (-not $databaseUrl) {
  throw "DATABASE_URL not found in $EnvFile"
}

# SQLAlchemy style URL -> libpq URL
$databaseUrl = $databaseUrl -replace '^postgresql\+psycopg2://', 'postgresql://'
$databaseUrl = $databaseUrl -replace '^postgres\+psycopg2://', 'postgresql://'

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$stamp = Get-Date -Format "yyyy-MM-dd_HHmmss"
$outFile = Join-Path $OutDir "pharmacy_$stamp.dump"

Write-Host "Backing up database to $outFile ..."
& pg_dump $databaseUrl -F c -f $outFile
if ($LASTEXITCODE -ne 0) {
  throw "pg_dump failed with exit code $LASTEXITCODE"
}

$sizeMb = [math]::Round((Get-Item $outFile).Length / 1MB, 2)
Write-Host "Backup OK ($sizeMb MB): $outFile"

if ($KeepDays -gt 0) {
  $cutoff = (Get-Date).AddDays(-$KeepDays)
  Get-ChildItem $OutDir -Filter "pharmacy_*.dump" |
    Where-Object { $_.LastWriteTime -lt $cutoff } |
    ForEach-Object {
      Write-Host "Removing old backup $($_.Name)"
      Remove-Item $_.FullName -Force
    }
}
