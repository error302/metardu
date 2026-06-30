#!/usr/bin/env node
/**
 * Deploy Step 2: Apply RLS migration directly + Rebuild container
 */

const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');

const VM_HOST = '34.170.248.156';
const VM_USER = 'mohameddosho20';
const SSH_KEY = fs.readFileSync(path.join(process.env.HOME, '.ssh/id_ed25519'), 'utf8');

const conn = new Client();
function exec(cmd) {
  return new Promise((resolve, reject) => {
    conn.exec(cmd, (err, stream) => {
      if (err) { reject(err); return; }
      let stdout = '', stderr = '';
      stream.on('data', (data) => { stdout += data.toString(); process.stdout.write(data.toString()); });
      stream.on('stderr', (data) => { stderr += data.toString(); process.stderr.write(data.toString()); });
      stream.on('close', (code) => { resolve({ code, stdout, stderr }); });
    });
  });
}

conn.on('ready', async () => {
  console.log('✓ Connected\n');

  try {
    // Step 1: Apply the RLS migration directly via psql on the host
    console.log('=== Applying RLS migration via psql ===');
    let r = await exec(`PGPASSWORD=Metardu2026SecurePwd psql -U metardu -h localhost -d metardu -f ~/metardu/src/lib/db/migrations/011_disable_rls.sql 2>&1`);
    console.log(r.stdout || r.stderr);
    console.log(r.code === 0 ? '✓ RLS migration applied' : '✗ Migration may have errors');

    // Verify RLS is disabled
    console.log('\n=== Verify RLS disabled on users and surveyor_profiles ===');
    r = await exec(`PGPASSWORD=Metardu2026SecurePwd psql -U metardu -h localhost -d metardu -c "SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname IN ('users', 'surveyor_profiles', 'profiles') ORDER BY relname" 2>&1`);
    console.log(r.stdout || r.stderr);

    // Step 2: Start the containers (redis and python_worker first, then web)
    console.log('\n=== Starting Redis and Python worker ===');
    r = await exec(`cd ~/metardu && docker compose up -d redis python_worker ntrip_proxy 2>&1`);
    console.log(r.stdout || r.stderr);

    // Step 3: Rebuild and start the web container
    console.log('\n=== Rebuilding web container (this may take several minutes) ===');
    r = await exec(`cd ~/metardu && docker compose up -d --build web 2>&1`);
    console.log(r.stdout || r.stderr);

  } catch (err) {
    console.error('Error:', err.message);
  }

  conn.end();
});

conn.on('error', (err) => {
  console.error('Connection error:', err.message);
});

conn.connect({ host: VM_HOST, port: 22, username: VM_USER, privateKey: SSH_KEY, readyTimeout: 30000 });
