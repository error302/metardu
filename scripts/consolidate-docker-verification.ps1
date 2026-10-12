# One-time allowlisted cleanup for the inspected 8-9 October verification resources.
# Default is inspection only. Never deletes customer volumes or unrelated images.
param([switch]$Execute)
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
$evidence = Join-Path (Get-Location) 'test-results/docker-consolidation'
function Docker-Checked {
    param([string[]]$DockerArgs)
    $result = & docker @DockerArgs
    if ($LASTEXITCODE -ne 0) { throw "Docker operation failed: $($DockerArgs[0])" }
    return $result
}
$before = @(Get-Content -LiteralPath "$evidence/containers-before.json" -Raw | ConvertFrom-Json)
$images = @(Get-Content -LiteralPath "$evidence/images-before.json" -Raw | ConvertFrom-Json)
$previews = @($before | Where-Object { $_.Name -match '^metardu-.+-preview-2026100[89]$' })
if ($previews.Count -ne 20) { throw 'Expected the 20 inspected previews' }
$current = @(Docker-Checked -DockerArgs (@('inspect') + @(Docker-Checked -DockerArgs @('ps','-aq'))) | ConvertFrom-Json)
foreach ($preview in $previews) {
    $live = @($current | Where-Object Id -eq $preview.Id)
    if ($live.Count -ne 1 -or $live[0].Name -ne "/$($preview.Name)" -or
        $live[0].Image -ne $preview.Image -or @($live[0].Mounts).Count -ne 0 -or
        $live[0].Config.Labels.'com.docker.compose.project' -or
        $live[0].Config.Labels.'metardu.purpose' -ne $preview.Purpose -or
        $preview.Purpose -notmatch '^(synthetic-.+|release-preview)$' -or
        @($live[0].NetworkSettings.Networks.PSObject.Properties.Name).Count -ne 1 -or
        -not $live[0].NetworkSettings.Networks.'metardu-release-rehearsal-20261008') {
        throw "Ownership/mount validation failed for $($preview.Name)"
    }
}
$productionNames = @('metardu-app','metardu-worker','metardu-postgres','metardu-redis','metardu-collaboration','metardu-ntrip','metardu-backup')
foreach ($name in $productionNames) {
    $live = @($current | Where-Object Name -eq "/$name")
    if ($live.Count -ne 1 -or $live[0].State.Status -ne 'running' -or
        $live[0].Config.Labels.'com.docker.compose.project' -ne 'metardu') {
        throw "Production preservation check failed: $name"
    }
}
$ownedImages = @($images | Where-Object Repository -eq 'metardu-release-verify')
if ($ownedImages.Count -ne 22) { throw 'Expected 22 inspected verification images' }
foreach ($candidate in $ownedImages) {
    if ($candidate.Tag -notmatch '^2026100[89]($|-)') { throw 'Unexpected image date' }
    $live = @(Docker-Checked -DockerArgs @('image','inspect',"$($candidate.Repository):$($candidate.Tag)") | ConvertFrom-Json)[0]
    if ($live.Id -ne $candidate.ID -or @($live.RepoTags | Where-Object { $_ -notlike 'metardu-release-verify:*' }).Count) { throw 'Image identity changed' }
    if (@($current | Where-Object { $_.Image -eq $candidate.ID -and $_.Id -notin $previews.Id }).Count) { throw 'Image is used outside inspected previews' }
}
$builderName = 'metardu-release-verify-20261008'
$builderContainer = @($current | Where-Object Id -eq ($before | Where-Object Name -eq 'buildx_buildkit_metardu-release-verify-202610080').Id)[0]
if (-not $builderContainer -or $builderContainer.Name -ne '/buildx_buildkit_metardu-release-verify-202610080' -or
    @($builderContainer.Mounts).Count -ne 1 -or $builderContainer.Mounts[0].Name -ne 'buildx_buildkit_metardu-release-verify-202610080_state') { throw 'Builder ownership changed' }
$cache = @(Docker-Checked -DockerArgs @('buildx','du','--builder',$builderName,'--format','{{json .}}') | ForEach-Object { $_ | ConvertFrom-Json })
if (@($cache | Where-Object InUse).Count) { throw 'Builder cache is in use' }
$history = Docker-Checked -DockerArgs @('buildx','history','ls','--builder',$builderName)
if ($history -match '\bRunning\b') { throw 'Build is active' }
Write-Output "Validated $($previews.Count) mount-free previews, $($ownedImages.Count) owned images and idle builder. Seven production services and all data volumes are protected."
if (-not $Execute) { Write-Output 'Inspection only. Pass -Execute to perform this exact cleanup.'; exit 0 }
$appImage = ($current | Where-Object Name -eq '/metardu-app').Image
$rollbackTag = 'metardu-metardu-app:rollback-20261010'
$existingRollback = @($images | Where-Object { $_.Repository -eq 'metardu-metardu-app' -and $_.Tag -eq 'rollback-20261010' })
if ($existingRollback.Count -and $existingRollback[0].ID -ne $appImage) { throw 'Rollback tag already points at another image' }
Docker-Checked -DockerArgs @('image','tag',$appImage,$rollbackTag)
foreach ($preview in $previews) {
    if (($current | Where-Object Id -eq $preview.Id).State.Running) { Docker-Checked -DockerArgs @('stop','--timeout','20',$preview.Id) }
    Docker-Checked -DockerArgs @('rm',$preview.Id)
}
foreach ($candidate in $ownedImages) { Docker-Checked -DockerArgs @('image','rm',"$($candidate.Repository):$($candidate.Tag)") }
Docker-Checked -DockerArgs @('buildx','rm',$builderName)
$left = @(Docker-Checked -DockerArgs @('ps','-a','--format','{{.Names}}'))
if (@($left | Where-Object { $_ -in $previews.Name -or $_ -eq 'buildx_buildkit_metardu-release-verify-202610080' }).Count) { throw 'Disposable containers remain' }
$volumes = @(Docker-Checked -DockerArgs @('volume','ls','--format','{{.Name}}'))
if ($volumes -contains 'buildx_buildkit_metardu-release-verify-202610080_state') { throw 'Builder state remains; inspect before removing it separately' }
foreach ($volume in @('metardu_postgres_data','metardu_uploads_data','metardu_redis_data','metardu_backups')) {
    if ($volumes -notcontains $volume) { throw "Protected volume missing: $volume" }
}
Write-Output "Cleanup finished. Production rollback: $rollbackTag ($appImage)."
