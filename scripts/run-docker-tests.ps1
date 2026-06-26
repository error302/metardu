#!/usr/bin/env pwsh
# METARDU Docker Testing Script
# Run: .\scripts\run-docker-tests.ps1

param(
    [switch]$Build,
    [switch]$Down,
    [switch]$Logs,
    [string]$Service = ""
)

$ErrorActionPreference = "Stop"

function Write-Header($text) {
    Write-Host "`n=== $text ===" -ForegroundColor Cyan
}

function Write-Success($text) {
    Write-Host $text -ForegroundColor Green
}

function Write-Error($text) {
    Write-Host $text -ForegroundColor Red
}

function Write-Warning($text) {
    Write-Host $text -ForegroundColor Yellow
}

# Check if Docker is running
try {
    docker info | Out-Null
    Write-Success "Docker is running"
} catch {
    Write-Error "Docker is not running. Please start Docker Desktop."
    exit 1
}

# Check if .env.test exists
if (-not (Test-Path ".env.test")) {
    Write-Warning ".env.test not found. Creating from template..."
    Copy-Item ".env.test.example" ".env.test" -ErrorAction SilentlyContinue
    if (-not (Test-Path ".env.test")) {
        Write-Error "Could not create .env.test. Please create it manually."
        exit 1
    }
}

if ($Down) {
    Write-Header "Stopping Docker Testing Environment"
    docker compose -f docker-compose.testing.yml down -v
    Write-Success "Docker environment stopped and volumes removed"
    exit 0
}

if ($Logs) {
    Write-Header "Showing Docker Logs"
    docker compose -f docker-compose.testing.yml logs -f
    exit 0
}

Write-Header "Starting METARDU Docker Testing Environment"
Write-Host "This will build and run the full testing stack:"
Write-Host "  - PostgreSQL + PostGIS (port 5433)"
Write-Host "  - Next.js App (port 3001)"
Write-Host "  - Test Runner"
Write-Host ""

if ($Build) {
    Write-Host "Building fresh images..."
    docker compose -f docker-compose.testing.yml up --build -d
} else {
    Write-Host "Using existing images..."
    docker compose -f docker-compose.testing.yml up -d
}

Write-Header "Waiting for services to be healthy"
$maxAttempts = 30
$attempt = 0
$healthy = $false

while ($attempt -lt $maxAttempts -and -not $healthy) {
    $attempt++
    Start-Sleep -Seconds 2
    
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:3001/api/public/health" -UseBasicParsing -TimeoutSec 5 -ErrorAction SilentlyContinue
        if ($response.StatusCode -eq 200) {
            $healthy = $true
            Write-Success "App is healthy! (Attempt $attempt/$maxAttempts)"
            break
        }
    } catch {
        Write-Host "  Waiting for app... (Attempt $attempt/$maxAttempts)" -NoNewline
        Write-Host ""
    }
}

if (-not $healthy) {
    Write-Error "App failed to start within 60 seconds"
    Write-Host "Showing logs..."
    docker compose -f docker-compose.testing.yml logs --tail=50 metardu-app
    exit 1
}

Write-Success "`nMETARDU testing environment is ready!"
Write-Host ""
Write-Host "Access points:"
Write-Host "  App: http://localhost:3001"
Write-Host "  Database: localhost:5433 (metardu_test/metardu_test)"
Write-Host ""
Write-Host "Run tests:"
Write-Host "  Quick smoke test: npx tsx scripts/quick-test.ts"
Write-Host "  Full browser test: npx tsx scripts/live-browser-test.ts"
Write-Host ""
Write-Host "Manage environment:"
Write-Host "  View logs: .\scripts\run-docker-tests.ps1 -Logs"
Write-Host "  Stop: .\scripts\run-docker-tests.ps1 -Down"
Write-Host "  Rebuild: .\scripts\run-docker-tests.ps1 -Build"
