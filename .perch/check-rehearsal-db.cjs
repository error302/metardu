const pg = require('pg');
(async () => {
  const client = new pg.Client({ connectionString: 'postgresql://release_verify:local_release_verify_only@127.0.0.1:55433/metardu_runtime_verify', connectionTimeoutMillis: 5000 });
  await client.connect();
  const marker = (await client.query("SELECT shobj_description(oid,'pg_database') AS marker FROM pg_database WHERE datname=current_database()")).rows[0].marker;
  console.log('marker:', JSON.stringify(marker));
  const r = await client.query("SELECT rolname FROM pg_roles WHERE rolname='release_app'");
  console.log('release_app role exists:', r.rowCount > 0);
  await client.end();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
