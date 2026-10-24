[CmdletBinding()]
param([switch]$Apply)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$tokenFile = Join-Path $projectRoot '.env.tunnel-token'
$binary = 'C:\Program Files (x86)\cloudflared\cloudflared.exe'
$receiptPath = Join-Path $projectRoot '.cache\public-availability\service-recovery.json'
$serviceName = 'Cloudflared'
$serviceKey = 'HKLM:\SYSTEM\CurrentControlSet\Services\Cloudflared'
$receipt = [ordered]@{
    checkedAt = [DateTime]::UtcNow.ToString('o')
    mode = $(if ($Apply) { 'apply' } else { 'review' })
    status = 'preflight'
    customerDataChanged = $false
    dnsChanged = $false
    secretsPrinted = $false
}
function Save-Receipt {
    New-Item -ItemType Directory -Path (Split-Path -Parent $receiptPath) -Force | Out-Null
    $receipt | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $receiptPath -Encoding UTF8
}
function Invoke-Sc([string[]]$ScArgs) {
    $output = & "$env:SystemRoot\System32\sc.exe" @ScArgs 2>&1
    if ($LASTEXITCODE -ne 0) { throw "Service control action failed with exit code $LASTEXITCODE." }
    return ($output -join "`n")
}

$configurationChanged = $false
$manualStopped = $false
$original = $null
$oldRecovery = $null
try {
    if (-not (Test-Path -LiteralPath $tokenFile -PathType Leaf)) { throw 'Existing tunnel token file is missing.' }
    if (-not (Test-Path -LiteralPath $binary -PathType Leaf)) { throw 'Existing cloudflared binary is missing.' }
    foreach ($path in @($tokenFile, $binary)) {
        if ((Get-Item -LiteralPath $path).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Unexpected redirected connector file; inspect before applying.' }
    }
    $original = Get-CimInstance Win32_Service -Filter "Name='$serviceName'"
    if (-not $original -or $original.StartName -ne 'LocalSystem' -or
        $original.PathName -notlike "*$binary*" -or $original.State -ne 'Stopped') {
        throw 'The existing service identity or state changed; inspect before applying.'
    }
    $manual = @(Get-CimInstance Win32_Process -Filter "Name='cloudflared.exe'")
    if ($manual.Count -ne 1 -or $manual[0].ExecutablePath -ne $binary -or
        -not $manual[0].CommandLine.Contains($tokenFile)) {
        throw 'Expected exactly the owned manual connector; inspect before applying.'
    }
    $receipt.before = @{ serviceState = $original.State; startMode = $original.StartMode; manualPid = $manual[0].ProcessId }
    $receipt.proposed = @{ startMode = 'Delayed automatic'; tokenSource = 'Existing token file'; restartDelaysSeconds = @(5,15,60); resetPeriodSeconds = 86400; restartOnNonCrashFailure = $true }
    Save-Receipt
    if (-not $Apply) { $receipt.status = 'reviewed'; Save-Receipt; Write-Output 'Preflight passed; no service settings changed.'; exit 0 }
    $principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
    if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'Administrator approval is required to configure the existing service.' }

    # Keep original settings in memory only: the old ImagePath may contain a token.
    $oldRecovery = Get-ItemProperty -LiteralPath $serviceKey
    $command = '"' + $binary + '" tunnel --protocol http2 --no-autoupdate --logfile "' +
        (Join-Path $projectRoot 'tunnel-service.log') + '" run --token-file "' + $tokenFile + '"'
    $configurationChanged = $true
    # CIM preserves the quoted executable and token-file paths without the
    # legacy Windows PowerShell native-argument quoting used by sc binPath.
    $receipt.phase = 'service-command'; Save-Receipt
    $change = Invoke-CimMethod -InputObject $original -MethodName Change -Arguments @{ PathName = $command; StartMode = 'Automatic' }
    if ($change.ReturnValue -ne 0) { throw "Service command update failed with code $($change.ReturnValue)." }
    $receipt.phase = 'service-recovery'; Save-Receipt
    Invoke-Sc -ScArgs @('config', $serviceName, 'start=', 'delayed-auto') | Out-Null
    Invoke-Sc -ScArgs @('failure', $serviceName, 'reset=', '86400', 'actions=', 'restart/5000/restart/15000/restart/60000') | Out-Null
    Invoke-Sc -ScArgs @('failureflag', $serviceName, '1') | Out-Null
    $receipt.status = 'configured'; Save-Receipt

    # Only the preflight-identified owned connector is replaced; no blanket kill.
    $sameProcess = Get-CimInstance Win32_Process -Filter "ProcessId=$($manual[0].ProcessId)"
    if (-not $sameProcess -or $sameProcess.CreationDate -ne $manual[0].CreationDate -or
        $sameProcess.ExecutablePath -ne $binary -or -not $sameProcess.CommandLine.Contains($tokenFile)) {
        throw 'Manual connector identity changed before handover.'
    }
    Stop-Process -Id $sameProcess.ProcessId -ErrorAction Stop
    $manualStopped = $true
    Start-Service -Name $serviceName
    (Get-Service -Name $serviceName).WaitForStatus('Running', [TimeSpan]::FromSeconds(20))
    $after = Get-CimInstance Win32_Service -Filter "Name='$serviceName'"
    $settings = Get-ItemProperty -LiteralPath $serviceKey
    if ($after.PathName -ne $command -or $after.StartMode -ne 'Auto' -or $settings.DelayedAutoStart -ne 1 -or
        $settings.FailureActionsOnNonCrashFailures -ne 1 -or $after.ProcessId -eq 0) { throw 'Service settings verification failed.' }
    $receipt.after = @{ serviceState = $after.State; startMode = $after.StartMode; delayedAutoStart = $settings.DelayedAutoStart; servicePid = $after.ProcessId; failureActions = (Invoke-Sc -ScArgs @('qfailure', $serviceName)); failureFlag = (Invoke-Sc -ScArgs @('qfailureflag', $serviceName)) }
    $receipt.status = 'passed'; Save-Receipt
    Write-Output 'Existing Cloudflared service running with delayed automatic startup, file-backed token and restart-on-failure. Verify public HTTP separately.'
} catch {
    $receipt.status = 'failed'
    $receipt.reason = $_.Exception.Message
    if ($configurationChanged -and $original) {
        try {
            Stop-Service -Name $serviceName -ErrorAction SilentlyContinue
            $previousMode = switch ($original.StartMode) { 'Disabled' {'Disabled'} 'Manual' {'Manual'} 'Auto' {'Automatic'} default { throw 'Unknown original start mode.' } }
            $rollbackService = Get-CimInstance Win32_Service -Filter "Name='$serviceName'"
            $rollback = Invoke-CimMethod -InputObject $rollbackService -MethodName Change -Arguments @{ PathName = $original.PathName; StartMode = $previousMode }
            if ($rollback.ReturnValue -ne 0) { throw 'Original service configuration could not be restored.' }
            foreach ($name in @('FailureActions','FailureActionsOnNonCrashFailures','DelayedAutoStart')) {
                if ($oldRecovery.PSObject.Properties.Name -contains $name) { Set-ItemProperty -LiteralPath $serviceKey -Name $name -Value $oldRecovery.$name }
                else { Remove-ItemProperty -LiteralPath $serviceKey -Name $name -ErrorAction SilentlyContinue }
            }
            $receipt.configurationRolledBack = $true
        } catch { $receipt.configurationRolledBack = $false }
    }
    if ($manualStopped -and (Get-Service -Name $serviceName).Status -ne 'Running') {
        try { & (Join-Path $PSScriptRoot 'start-metardu-tunnel.ps1'); $receipt.manualRecoveryStarted = $true }
        catch { $receipt.manualRecoveryStarted = $false }
    }
    Save-Receipt
    Write-Error $receipt.reason
    exit 1
}
