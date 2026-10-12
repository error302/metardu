// Mutating rehearsal scripts accept only explicit loopback test databases.
// Never fall back to DATABASE_URL, DB_*, .env, or deployment credentials.
export function rehearsalDatabaseConfig() {
  const adminUrl = process.env.TEST_ADMIN_DATABASE_URL
    || 'postgresql://release_verify:local_release_verify_only@127.0.0.1:55433/metardu_release_rehearsal'
  const runtimeUrl = process.env.TEST_RUNTIME_DATABASE_URL
    || 'postgresql://release_app:local_release_runtime_only@127.0.0.1:55433/metardu_release_rehearsal'
  const parse = value => {
    let url
    try { url = new URL(value) } catch { throw new Error('Rehearsal database URL is invalid.') }
    const database = decodeURIComponent(url.pathname.slice(1))
    if (!['postgres:', 'postgresql:'].includes(url.protocol)
      || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
      || !['metardu_release_rehearsal', 'metardu_e2e', 'metardu_runtime_verify'].includes(database)
      || url.search || url.hash) {
      throw new Error('Rehearsals require a loopback connection to an allowlisted disposable test database.')
    }
    return { url, database, role: decodeURIComponent(url.username) }
  }
  const admin = parse(adminUrl)
  const runtime = parse(runtimeUrl)
  if (admin.url.hostname !== runtime.url.hostname
    || (admin.url.port || '5432') !== (runtime.url.port || '5432')
    || admin.database !== runtime.database || admin.role === runtime.role
    || !/^[a-z_][a-z0-9_]{0,62}$/i.test(runtime.role)) {
    throw new Error('Rehearsals require separate admin/runtime roles on the same test database.')
  }
  return { adminUrl, runtimeUrl, database: runtime.database, runtimeRole: runtime.role }
}
