$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$tokenFile = Join-Path $projectRoot '.env.tunnel-token'
$binary = 'C:\Program Files (x86)\cloudflared\cloudflared.exe'
if (-not (Test-Path -LiteralPath $tokenFile)) {
    throw 'Missing .env.tunnel-token. Save the existing Cloudflare tunnel token in that local file.'
}
if (-not (Test-Path -LiteralPath $binary)) { throw 'cloudflared is not installed.' }
if (Get-Process -Name cloudflared -ErrorAction SilentlyContinue) {
    Write-Output 'cloudflared is already running.'
    exit 0
}
$tunnelArgs = @('tunnel', '--protocol', 'http2', '--no-autoupdate', '--logfile', ('"' + (Join-Path $projectRoot 'tunnel-named-repair.log') + '"'), 'run', '--token-file', ('"' + $tokenFile + '"'))
Start-Process -FilePath $binary -ArgumentList $tunnelArgs -WindowStyle Hidden
Write-Output 'Named Cloudflare tunnel started. Verify metardu.space before reporting it healthy.'
