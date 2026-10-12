[CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'High')]
param(
    [string]$Email = 'mohameddosho20@gmail.com'
)

# Run interactively yourself. This script never writes the password to disk,
# command-line arguments, logs, or this chat. Requires local Docker access.
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
if (-not $PSCmdlet.ShouldProcess($Email, 'Replace the existing METARDU password and invalidate unused reset links')) { return }

$first = Read-Host 'New METARDU password (at least 12 characters)' -AsSecureString
$second = Read-Host 'Repeat new password' -AsSecureString
$firstPtr = [IntPtr]::Zero
$secondPtr = [IntPtr]::Zero
try {
    $firstPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($first)
    $secondPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($second)
    $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($firstPtr)
    $confirmation = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($secondPtr)
    if ($plain.Length -lt 12) { throw 'Password must have at least 12 characters.' }
    if ($plain -cne $confirmation) { throw 'Passwords do not match. Nothing changed.' }
    $payload = @{ email = $Email.Trim().ToLowerInvariant(); password = $plain } | ConvertTo-Json -Compress
    $resetCode = @'
const { Client } = require('pg');
const bcrypt = require('bcryptjs');
(async () => {
  let raw = '';
  for await (const chunk of process.stdin) raw += chunk;
  const { email, password } = JSON.parse(raw);
  if (typeof email !== 'string' || typeof password !== 'string' || password.length < 12) throw new Error('Invalid input');
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query('BEGIN');
    const user = await client.query('SELECT id FROM users WHERE lower(email)=$1 FOR UPDATE', [email]);
    if (user.rowCount !== 1) throw new Error('Expected exactly one existing account');
    const hash = await bcrypt.hash(password, 12);
    await client.query('UPDATE users SET password_hash=$1, updated_at=NOW() WHERE id=$2', [hash, user.rows[0].id]);
    await client.query('UPDATE password_reset_tokens SET used_at=NOW() WHERE user_id=$1 AND used_at IS NULL', [user.rows[0].id]);
    await client.query('COMMIT');
    console.log('Password updated for the existing account. Sign in again at https://metardu.space/login. Existing roles and projects were not changed.');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { await client.end(); }
})().catch(error => { console.error('Recovery failed; no successful change was confirmed. Diagnostic code: ' + (error.code || 'ACCOUNT_OR_INPUT_CHECK')); process.exitCode = 1; });
'@
    $previousEncoding = $OutputEncoding
    try {
        $OutputEncoding = [System.Text.UTF8Encoding]::new($false)
        $payload | & docker compose exec -T metardu-app node -e $resetCode
        if ($LASTEXITCODE -ne 0) { throw 'Local password recovery failed.' }
    } finally { $OutputEncoding = $previousEncoding }
} finally {
    if ($firstPtr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($firstPtr) }
    if ($secondPtr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($secondPtr) }
    $plain = $null; $confirmation = $null; $payload = $null
    $first.Dispose(); $second.Dispose()
}
