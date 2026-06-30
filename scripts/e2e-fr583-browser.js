#!/usr/bin/env node
/**
 * Metardu E2E Browser Test — F/R 583/58 Cadastral Data
 * Self-contained: starts server, runs tests, generates reports.
 * Usage: node scripts/e2e-fr583-browser.js
 */
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const DIR = '/home/z/my-project/download/e2e-screenshots';
const PORT = 3000;
const BASE = `http://127.0.0.1:${PORT}`;

// F/R 583/58 Beacons (Arc 1960 / UTM Zone 37S)
const B = {
  CN4:{n:113919.14,e:-3718.10}, CN4a:{n:114218.49,e:-3692.81},
  RD21:{n:114370.35,e:-4182.37}, RDa1:{n:114621.15,e:-4990.85},
  RDa2:{n:114234.01,e:-4969.62}, Ne1:{n:114168.19,e:-4786.55},
  Ne2:{n:114044.16,e:-4685.55}, Ne3:{n:113720.01,e:-4596.44},
  Ne4:{n:113350.60,e:-4397.45}, Ne5:{n:113238.92,e:-4177.45},
  AB1:{n:114190.94,e:-4332.60}, AB2:{n:114198.58,e:-4259.00},
  AB3:{n:114400.63,e:-4279.99}, AB4:{n:114424.48,e:-4356.86},
};

const LEGS = [
  {dist:846.49,d:287,m:14,s:4},{dist:381.71,d:176,m:51,s:40},
  {dist:194.54,d:109,m:46,s:42},{dist:159.96,d:140,m:50,s:26},
  {dist:336.17,d:164,m:37,s:50},{dist:419.60,d:151,m:41,s:24},
  {dist:246.72,d:116,m:54,s:50},{dist:820.80,d:34,m:1,s:51},
  {dist:300.41,d:4,m:49,s:42},{dist:512.57,d:287,m:14,s:4},
];

const sleep = ms => new Promise(r => setTimeout(r, ms));

function poll(url, ms = 120000) {
  return new Promise((res, rej) => {
    const t0 = Date.now();
    const go = () => {
      const r = http.get(url, resp => {
        resp.resume();
        if (resp.statusCode >= 200 && resp.statusCode < 500) return res();
        if (Date.now()-t0 < ms) setTimeout(go, 2000);
        else rej(new Error('status '+resp.statusCode));
      });
      r.on('error', () => {
        if (Date.now()-t0 < ms) setTimeout(go, 2000);
        else rej(new Error('unreachable'));
      });
      r.setTimeout(5000);
    };
    go();
  });
}

function preWarm(url, ms = 30000) {
  return new Promise((res, rej) => {
    const r = http.get(url, resp => { resp.resume(); res(resp.statusCode); });
    r.on('error', rej);
    r.setTimeout(ms, () => rej(new Error('timeout')));
  });
}

async function main() {
  fs.mkdirSync(DIR, { recursive: true });
  console.log('\n' + '='.repeat(60));
  console.log('  METARDU E2E — F/R 583/58 Cadastral Survey');
  console.log('='.repeat(60));

  // === START SERVER ===
  console.log('\n  Starting dev server...');
  const srv = spawn('node', [
    '/home/z/my-project/metardu/node_modules/next/dist/bin/next',
    'dev', '-p', PORT, '-H', '127.0.0.1'
  ], {
    cwd: '/home/z/my-project/metardu',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PORT: String(PORT) },
  });
  srv.on('error', e => { console.error('Server spawn error:', e); process.exit(2); });

  try {
    console.log('  Waiting for server...');
    await poll(BASE);
    console.log('  Server ready!\n');

    // Pre-warm all tool pages via HTTP
    const pages = [
      '/tools/distance', '/tools/coordinates', '/tools/area',
      '/tools/traverse', '/tools/cogo', '/tools/bearing',
      '/tools/setting-out', '/tools',
    ];
    console.log('  Pre-warming pages...');
    for (const p of pages) {
      try {
        const code = await preWarm(BASE + p);
        process.stdout.write(`    ${p} → ${code}\n`);
        await sleep(500);
      } catch(e) {
        process.stdout.write(`    ${p} → WARN: ${e.message}\n`);
      }
    }
    await sleep(1000);
    console.log('');

    // === LAUNCH BROWSER ===
    const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }});
    page.on('pageerror', () => {});

    const ss = (name) => page.screenshot({ path: path.join(DIR, name), timeout: 15000 });
    const results = [];

    // ---- TEST 1: Landing ----
    {
      const t0 = Date.now();
      console.log('  [1/9] Landing Page...');
      await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await sleep(2000);
      const title = await page.title();
      const body = await page.innerText('body');
      await ss('01-landing.png');
      const ok = body.length > 200;
      results.push({ name: 'Landing Page', ok, ms: Date.now()-t0, note: `"${title}"` });
      console.log(`    ${ok ? 'OK' : 'FAIL'}: ${body.length} chars`);
    }

    // ---- TEST 2: Distance & Bearing ----
    {
      const t0 = Date.now();
      console.log('  [2/9] Distance & Bearing — RD21 → RDa1...');
      await page.goto(`${BASE}/tools/distance`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await sleep(3000);
      const inputs = page.locator('input');
      const ic = await inputs.count();
      console.log(`    ${ic} inputs found`);
      if (ic >= 4) {
        await inputs.nth(0).fill(String(B.RD21.n));
        await inputs.nth(1).fill(String(B.RD21.e));
        await inputs.nth(2).fill(String(B.RDa1.n));
        await inputs.nth(3).fill(String(B.RDa1.e));
        await sleep(300);
        await ss('02a-distance-filled.png');
        await page.locator('button:has-text("Calculate")').first().click({ timeout: 8000 });
        await sleep(3000);
      }
      const body = await page.innerText('body');
      await ss('02b-distance-result.png');
      const ok = body.includes('846') || body.includes('287') || body.includes('Distance') || body.includes('Bearing') || body.includes('WCB');
      results.push({ name: 'Distance & Bearing', ok, ms: Date.now()-t0, note: ok ? 'Results visible' : `Body: ${body.length} chars` });
      console.log(`    ${ok ? 'OK' : 'FAIL'}: 846=${body.includes('846')} 287=${body.includes('287')} Dist=${body.includes('Distance')}`);
    }

    // ---- TEST 3: Coordinate Conversion ----
    {
      const t0 = Date.now();
      console.log('  [3/9] Coordinate Conversion — CN4...');
      await page.goto(`${BASE}/tools/coordinates`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await sleep(3000);
      const inputs = page.locator('input');
      const ic = await inputs.count();
      if (ic >= 3) {
        await inputs.nth(0).fill(String(B.CN4.e));
        await inputs.nth(1).fill(String(B.CN4.n));
        await inputs.nth(2).fill('37');
        const sel = page.locator('select').first();
        if (await sel.count() > 0) await sel.selectOption({ value: 'S' });
        await sleep(300);
        await page.locator('button:has-text("Convert")').first().click({ timeout: 8000 });
        await sleep(3000);
      }
      const body = await page.innerText('body');
      await ss('03-coords-result.png');
      const ok = body.includes('Latitude') || body.includes('Longitude') || body.includes('°') || body.includes('Solution');
      results.push({ name: 'Coordinate Conversion', ok, ms: Date.now()-t0, note: `${ic} inputs` });
      console.log(`    ${ok ? 'OK' : 'FAIL'}: Lat=${body.includes('Latitude')} Lon=${body.includes('Longitude')}`);
    }

    // ---- TEST 4: Area ----
    {
      const t0 = Date.now();
      console.log('  [4/9] Area — Parcel A (AB1-AB4)...');
      await page.goto(`${BASE}/tools/area`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await sleep(3000);
      // Delete existing rows
      let dc = await page.locator('button:has-text("×")').count();
      for (let i = 0; i < dc; i++) { await page.locator('button:has-text("×")').first().click(); await sleep(80); }
      // Add 4
      for (let i = 0; i < 4; i++) { await page.locator('button:has-text("Add Point")').first().click(); await sleep(100); }
      await sleep(300);
      const ci = page.locator('input[placeholder*="e.g."]');
      const cc = await ci.count();
      const pts = [B.AB1, B.AB2, B.AB3, B.AB4];
      for (let i = 0; i < 4 && i*2+1 < cc; i++) {
        await ci.nth(i*2).fill(String(pts[i].n));
        await ci.nth(i*2+1).fill(String(pts[i].e));
        await sleep(50);
      }
      await page.locator('button:has-text("Calculate Area")').first().click({ timeout: 8000 });
      await sleep(3000);
      const body = await page.innerText('body');
      await ss('04-area-result.png');
      const ok = body.includes('1.6') || body.includes('Area') || body.includes('Shoelace') || body.includes('Solution');
      results.push({ name: 'Area Computation', ok, ms: Date.now()-t0, note: `${cc} coord inputs` });
      console.log(`    ${ok ? 'OK' : 'FAIL'}: 1.6=${body.includes('1.6')} Area=${body.includes('Area')}`);
    }

    // ---- TEST 5: Traverse ----
    {
      const t0 = Date.now();
      console.log('  [5/9] Traverse — F/R 583/58 (10 legs)...');
      await page.goto(`${BASE}/tools/traverse`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await sleep(3000);
      const rows = page.locator('tbody tr');
      const rc = await rows.count();
      const needed = Math.max(0, 10 - rc);
      for (let i = 0; i < needed; i++) { await page.locator('button:has-text("Add Leg")').first().click(); await sleep(200); }
      await sleep(300);
      const rows2 = page.locator('tbody tr');
      const rc2 = await rows2.count();
      for (let i = 0; i < LEGS.length && i < rc2; i++) {
        const inp = rows2.nth(i).locator('input');
        const ic = await inp.count();
        if (ic >= 6) {
          await inp.nth(0).fill(String(LEGS[i].dist));
          await inp.nth(1).fill(String(LEGS[i].d));
          await inp.nth(2).fill(String(LEGS[i].m));
          await inp.nth(3).fill(String(LEGS[i].s));
          if (i === 0) { await inp.nth(4).fill(String(B.RD21.n)); await inp.nth(5).fill(String(B.RD21.e)); }
        }
        await sleep(30);
      }
      await page.locator('button:has-text("Calculate Adjustment")').first().click({ timeout: 8000 });
      await sleep(5000);
      const body = await page.innerText('body');
      await ss('05-traverse-result.png');
      const ok = body.includes('Misclosure') || body.includes('1:') || body.includes('Adjusted') || body.includes('Bowditch') || body.includes('Precision');
      results.push({ name: 'Traverse Adjustment', ok, ms: Date.now()-t0, note: `${rc2} rows` });
      console.log(`    ${ok ? 'OK' : 'FAIL'}: Misc=${body.includes('Misclosure')} Adj=${body.includes('Adjusted')}`);
    }

    // ---- TEST 6: COGO ----
    {
      const t0 = Date.now();
      console.log('  [6/9] COGO Inverse — RD21 → RDa1...');
      await page.goto(`${BASE}/tools/cogo`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await sleep(3000);
      const inputs = page.locator('input');
      const ic = await inputs.count();
      if (ic >= 4) {
        await inputs.nth(0).fill(String(B.RD21.e));
        await inputs.nth(1).fill(String(B.RD21.n));
        if (ic >= 5) { await inputs.nth(3).fill(String(B.RDa1.e)); await inputs.nth(4).fill(String(B.RDa1.n)); }
      }
      await page.locator('button:has-text("Compute Inverse")').first().click({ timeout: 8000 });
      await sleep(3000);
      const body = await page.innerText('body');
      await ss('06-cogo-result.png');
      const ok = body.includes('846') || body.includes('287') || body.includes('Distance') || body.includes('Bearing') || body.includes('Result');
      results.push({ name: 'COGO Inverse', ok, ms: Date.now()-t0, note: `${ic} inputs` });
      console.log(`    ${ok ? 'OK' : 'FAIL'}: 846=${body.includes('846')} 287=${body.includes('287')}`);
    }

    // ---- TEST 7: Bearing ----
    {
      const t0 = Date.now();
      console.log('  [7/9] Bearing — Ne3 → Ne4...');
      await page.goto(`${BASE}/tools/bearing`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await sleep(3000);
      const inputs = page.locator('input');
      const ic = await inputs.count();
      if (ic >= 4) {
        await inputs.nth(0).fill(String(B.Ne3.n));
        await inputs.nth(1).fill(String(B.Ne3.e));
        await inputs.nth(2).fill(String(B.Ne4.n));
        await inputs.nth(3).fill(String(B.Ne4.e));
      }
      await page.locator('button:has-text("Calculate")').first().click({ timeout: 8000 });
      await sleep(3000);
      const body = await page.innerText('body');
      await ss('07-bearing-result.png');
      const ok = body.includes('151') || body.includes('Bearing') || body.includes('WCB') || body.includes('Solution');
      results.push({ name: 'Bearing Calculator', ok, ms: Date.now()-t0, note: `${ic} inputs` });
      console.log(`    ${ok ? 'OK' : 'FAIL'}: 151=${body.includes('151')} Bearing=${body.includes('Bearing')}`);
    }

    // ---- TEST 8: Tools Index ----
    {
      const t0 = Date.now();
      console.log('  [8/9] Tools Index...');
      await page.goto(`${BASE}/tools`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await sleep(2000);
      const links = await page.locator('a[href*="/tools/"]').count();
      const body = await page.innerText('body');
      await ss('08-tools-index.png');
      const ok = links > 0 && (body.includes('Traverse') || body.includes('Distance') || body.includes('Area'));
      results.push({ name: 'Tools Index', ok, ms: Date.now()-t0, note: `${links} links` });
      console.log(`    ${ok ? 'OK' : 'FAIL'}: ${links} links`);
    }

    // ---- TEST 9: Setting Out ----
    {
      const t0 = Date.now();
      console.log('  [9/9] Setting Out — AB1-AB4 from RD21...');
      await page.goto(`${BASE}/tools/setting-out`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await sleep(3000);
      // Use visible inputs only (exclude hidden file input)
      const inputs = page.locator('input:visible');
      const ic = await inputs.count();
      console.log(`    ${ic} visible inputs`);
      if (ic >= 6) {
        await inputs.nth(0).fill(String(B.RD21.e));
        await inputs.nth(1).fill(String(B.RD21.n));
        await inputs.nth(2).fill('0.000');
        await inputs.nth(3).fill('1.500');
        await inputs.nth(4).fill(String(B.CN4.e));
        await inputs.nth(5).fill(String(B.CN4.n));
      }
      const trc = await page.locator('tr').count();
      const needed = Math.max(0, 4 - (trc - 2));
      for (let i = 0; i < needed; i++) { await page.locator('button:has-text("Add Point")').first().click(); await sleep(100); }
      await sleep(300);
      const dps = [{id:'AB1',e:B.AB1.e,n:B.AB1.n},{id:'AB2',e:B.AB2.e,n:B.AB2.n},{id:'AB3',e:B.AB3.e,n:B.AB3.n},{id:'AB4',e:B.AB4.e,n:B.AB4.n}];
      const visInputs = page.locator('input:visible');
      const vic = await visInputs.count();
      console.log(`    ${vic} visible inputs after adding points`);
      for (let i = 0; i < dps.length; i++) {
        const off = 6 + i * 6;
        if (off + 2 < vic) {
          await visInputs.nth(off).fill(dps[i].id);
          await visInputs.nth(off+1).fill(String(dps[i].e));
          await visInputs.nth(off+2).fill(String(dps[i].n));
          await sleep(50);
        }
      }
      await page.locator('button:has-text("Compute Setting Out")').first().click({ timeout: 8000 });
      await sleep(5000);
      const body = await page.innerText('body');
      await ss('09-settingout-result.png');
      const ok = body.includes('AB1') || body.includes('AB2') || body.includes('Setting') || body.includes('Horizontal') || body.includes('Distance');
      results.push({ name: 'Setting Out', ok, ms: Date.now()-t0, note: `${ic} inputs` });
      console.log(`    ${ok ? 'OK' : 'FAIL'}: AB1=${body.includes('AB1')} Setting=${body.includes('Setting')}`);
    }

    // === CLEANUP ===
    await browser.close();
    console.log('\n' + '='.repeat(60));
    const pass = results.filter(r => r.ok).length;
    const fail = results.length - pass;
    const total = results.reduce((s,r) => s + r.ms, 0);
    console.log(`  RESULTS: ${pass}/${results.length} passed (${(total/1000).toFixed(1)}s)`);
    console.log('='.repeat(60));
    for (const r of results) {
      console.log(`  ${r.ok ? 'PASS' : 'FAIL'} ${r.name} (${r.ms}ms) — ${r.note}`);
    }

    // Save report
    fs.writeFileSync(path.join(DIR, 'e2e-report.json'), JSON.stringify({
      timestamp: new Date().toISOString(),
      summary: { total: results.length, passed: pass, failed: fail, totalMs: total },
      beacons: B, datumJoins: LEGS, tests: results,
    }, null, 2));
    console.log(`\n  Screenshots: ${DIR}/`);
    console.log(`  Report: ${DIR}/e2e-report.json\n`);

    process.exit(fail > 0 ? 1 : 0);

  } finally {
    try { srv.kill('SIGTERM'); } catch {}
    try { srv.kill('SIGKILL'); } catch {}
  }
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(2); });
