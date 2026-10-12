# Compatibility entry point. Docker verification uses the existing production stack.
param([switch]$Build, [switch]$Down, [switch]$Logs, [string]$Service = '')
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
if ($Build -or $Down) {
    Write-Error 'This command no longer creates/removes a duplicate testing stack. Review docs/DOCKER_RUNTIME_WORKFLOW.md before a production build/deployment.'
    exit 1
}
if ($Service -and $Service -ne 'metardu-app') {
    Write-Error 'Use Docker directly for an explicitly reviewed supporting-service action.'
    exit 1
}
$action = if ($Logs) { 'logs' } else { 'status' }
node scripts/verify-production-runtime.mjs $action
exit $LASTEXITCODE
