$ErrorActionPreference = 'Stop'
function Test-DockerReady {
    # Windows PowerShell turns native stderr into an error record. A stopped
    # engine is an expected probe result, not a reason to abort startup.
    $ErrorActionPreference = 'Continue'
    docker info --format '{{.ServerVersion}}' 2>$null | Out-Null
    return $LASTEXITCODE -eq 0
}
$projectDir = Split-Path -Parent $PSScriptRoot
Push-Location $projectDir
try {
    if (-not (Test-DockerReady)) {
        $desktop = Join-Path $env:ProgramFiles 'Docker\Docker\Docker Desktop.exe'
        if (-not (Test-Path -LiteralPath $desktop)) { throw 'Docker Desktop is not installed.' }
        Start-Process -FilePath $desktop -WindowStyle Hidden
        $ready = $false
        for ($attempt = 0; $attempt -lt 60; $attempt++) {
            Start-Sleep -Seconds 3
            if (Test-DockerReady) { $ready = $true; break }
        }
        if (-not $ready) { throw 'Docker Desktop did not become ready. Open Docker Desktop and retry.' }
    }
    docker compose up -d --wait --wait-timeout 180
    if ($LASTEXITCODE -ne 0) { throw 'METARDU containers did not become healthy.' }
    & (Join-Path $PSScriptRoot 'start-metardu-tunnel.ps1')
    $health = Invoke-RestMethod -Uri 'https://metardu.space/api/public/health' -TimeoutSec 30
    if ($health.status -ne 'healthy') { throw 'Public health check did not pass.' }
    Write-Output 'METARDU is healthy at https://metardu.space'
} finally {
    Pop-Location
}
