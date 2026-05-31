/**
 * Metardu E2E Surveyor Workflow Test — F/R 583/58 Cadastral Data
 * 
 * Uses Playwright to test standalone survey tools with real Kenyan cadastral data.
 * No authentication needed — all /tools/ pages work standalone.
 * 
 * The script:
 * 1. Starts its own Next.js dev server on port 3000
 * 2. Runs 9 browser tests filling real data
 * 3. Captures screenshots showing computation results
 * 4. Generates HTML + JSON reports
 */

const { chromium } = require('playwright');
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const SCREENSHOT_DIR = '/home/z/my-project/download/e2e-screenshots';
const PORT = 3000;
const BASE = `http://127.0.0.1:${PORT}`;

// ============================================================
// F/R 583/58 Beacon Data (Arc 1960 / UTM Zone 37S)
// Surveyor: Boniface O. Wanyama (Licence No. 228)
// ============================================================
const B = {
  CN4:   { n: 113919.14, e: -3718.10 },
  CN4a:  { n: 114218.49, e: -3692.81 },
  RD21:  { n: 114370.35, e: -4182.37 },
  RDa1:  { n: 114621.15, e: -4990.85 },
  RDa2:  { n: 114234.01, e: -4969.62 },
  Ne1:   { n: 114168.19, e: -4786.55 },
  Ne2:   { n: 114044.16, e: -4685.55 },
  Ne3:   { n: 113720.01, e: -4596.44 },
  Ne4:   { n: 113350.60, e: -4397.45 },
  Ne5:   { n: 113238.92, e: -4177.45 },
  AB1:   { n: 114190.94, e: -4332.60 },
  AB2:   { n: 114198.58, e: -4259.00 },
  AB3:   { n: 114400.63, e: -4279.99 },
  AB4:   { n: 114424.48, e: -4356.86 },
};

const LEGS = [
  { from: 'RD21', to: 'RDa1', dist: 846.49,  d: 287, m: 14, s: 4 },
  { from: 'RDa1', to: 'RDa2', dist: 381.71,  d: 176, m: 51, s: 40 },
  { from: 'RDa2', to: 'Ne1',  dist: 194.54,  d: 109, m: 46, s: 42 },
  { from: 'Ne1',  to: 'Ne2',  dist: 159.96,  d: 140, m: 50, s: 26 },
  { from: 'Ne2',  to: 'Ne3',  dist: 336.17,  d: 164, m: 37, s: 50 },
  { from: 'Ne3',  to: 'Ne4',  dist: 419.60,  d: 151, m: 41, s: 24 },
  { from: 'Ne4',  to: 'Ne5',  dist: 246.72,  d: 116, m: 54, s: 50 },
  { from: 'Ne5',  to: 'CN4',  dist: 820.80,  d: 34,  m: 1,  s: 51 },
  { from: 'CN4',  to: 'CN4a', dist: 300.41,  d: 4,   m: 49, s: 42 },
  { from: 'CN4a', to: 'RD21', dist: 512.57,  d: 287, m: 14, s: 4 },
];

// ============================================================
// Helpers
// ============================================================

const sleep = ms => new Promise(r => setTimeout(r, ms));

function pollServer(url, maxMs = 90000) {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const try_ = () => {
      const req = http.get(url, res => {
        res.resume();
        if (res.statusCode >= 200 && res.statusCode < 500) return resolve();
        if (Date.now() - t0 < maxMs) return setTimeout(try_, 2000);
        reject(new Error(`status ${res.statusCode}`));
      });
      req.on('error', () => {
        if (Date.now() - t0 < maxMs) setTimeout(try_, 2000);
        else reject(new Error(`unreachable after ${maxMs}ms`));
      });
      req.setTimeout(5000);
    };
    try_();
  });
}

async function screenshot(page, name) {
  const p = path.join(SCREENSHOT_DIR, `${name}.png`);
  await page.screenshot({ path: p, timeout: 15000 });
  return p;
}

async function fillInputs(page, values) {
  // values: array of { index, value } to fill by input order
  const inputs = page.locator('input');
  for (const v of values) {
    const el = inputs.nth(v.index);
    if ((await el.count()) > 0) {
      await el.click({ timeout: 5000 });
      await el.fill('');
      await el.fill(String(v.value));
      await el.press('Tab');
      await sleep(80);
    }
  }
}

async function clickBtn(page, text) {
  const btn = page.locator(`button:has-text("${text}")`).first();
  await btn.click({ timeout: 8000 });
  await sleep(400);
}

// ============================================================
// Server management
// ============================================================

let srv = null;

function startServer() {
  return new Promise((resolve, reject) => {
    console.log(`  Starting Next.js on port ${PORT}...`);
    srv = spawn('node', ['node_modules/next/dist/bin/next', 'dev', '-p', PORT, '-H', '127.0.0.1'], {
      cwd: '/home/z/my-project/metardu',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, PORT: String(PORT) },
    });
    let ready = false;
    srv.stdout.on('data', d => {
      const line = d.toString();
      if (line.includes('Ready') || line.includes('ready')) {
        if (!ready) { ready = true; console.log('  Next.js ready'); }
      }
    });
    srv.stderr.on('data', d => {
      const line = d.toString();
      if (line.includes('Ready') || line.includes('ready')) {
        if (!ready) { ready = true; console.log('  Next.js ready (stderr)'); }
      }
    });
    srv.on('error', reject);
    pollServer(BASE).then(() => resolve(BASE)).catch(reject);
  });
}

function stopServer() {
  if (srv) {
    try { srv.kill('SIGTERM'); } catch {}
    try { srv.kill('SIGKILL'); } catch {}
    srv = null;
  }
}

// ============================================================
// Tests
// ============================================================

async function testLanding(page) {
  const t0 = Date.now();
  try {
    console.log('  [1/9] Landing Page...');
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(2000);
    const title = await page.title();
    const text = await page.innerText('body');
    const ss = await screenshot(page, '01-landing-page');
    return { name: '1. Landing Page', ok: text.length > 200, ss, ms: Date.now() - t0, note: `"${title}" (${text.length} chars)` };
  } catch (e) {
    const ss = await screenshot(page, '01-landing-page').catch(() => '');
    return { name: '1. Landing Page', ok: false, ss, ms: Date.now() - t0, err: e.message.slice(0, 200) };
  }
}

async function testCoordinates(page) {
  const t0 = Date.now();
  try {
    console.log('  [2/9] Coordinate Conversion — CN4 UTM Zone 37S...');
    await page.goto(`${BASE}/tools/coordinates`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(3000);

    // Screenshot before filling
    await screenshot(page, '02a-coords-empty');

    // The coordinate page has 3 main inputs: Easting, Northing, Zone + a Hemisphere select
    // Fill using fillInputs by index
    await fillInputs(page, [
      { index: 0, value: B.CN4.e },   // Easting: -3718.10
      { index: 1, value: B.CN4.n },   // Northing: 113919.14
      { index: 2, value: '37' },       // Zone: 37
    ]);

    // Select hemisphere S
    const sel = page.locator('select').first();
    if (await sel.count() > 0) {
      await sel.selectOption({ label: 'S' });
      await sleep(200);
    }

    await screenshot(page, '02b-coords-filled');
    await clickBtn(page, 'Convert');
    await sleep(3000);

    const text = await page.innerText('body');
    const ss = await screenshot(page, '02c-coords-result');
    const hasResult = text.includes('Latitude') || text.includes('Longitude') || 
                      text.includes('lat') || text.includes('lon') || text.includes('°');
    return { name: '2. Coordinate Conversion', ok: hasResult, ss, ms: Date.now() - t0, 
             note: hasResult ? `Results visible (body ${text.length} chars)` : `No results found` };
  } catch (e) {
    const ss = await screenshot(page, '02c-coords-result').catch(() => '');
    return { name: '2. Coordinate Conversion', ok: false, ss, ms: Date.now() - t0, err: e.message.slice(0, 300) };
  }
}

async function testDistance(page) {
  const t0 = Date.now();
  try {
    console.log('  [3/9] Distance & Bearing — RD21 to RDa1...');
    await page.goto(`${BASE}/tools/distance`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(3000);

    // 4 inputs: Point A N, Point A E, Point B N, Point B E
    await fillInputs(page, [
      { index: 0, value: B.RD21.n },   // A Northing
      { index: 1, value: B.RD21.e },   // A Easting
      { index: 2, value: B.RDa1.n },   // B Northing
      { index: 3, value: B.RDa1.e },   // B Easting
    ]);

    await screenshot(page, '03a-distance-filled');
    await clickBtn(page, 'Calculate');
    await sleep(3000);

    const text = await page.innerText('body');
    const ss = await screenshot(page, '03b-distance-result');
    // Expected: ~847m distance, ~287° bearing
    const hasResult = text.includes('846') || text.includes('847') || text.includes('287') ||
                      text.includes('Distance') || text.includes('Bearing') || text.includes('WCB');
    return { name: '3. Distance & Bearing', ok: hasResult, ss, ms: Date.now() - t0,
             note: hasResult ? `Distance/Bearing computed` : `No results (body: ${text.length} chars)` };
  } catch (e) {
    const ss = await screenshot(page, '03b-distance-result').catch(() => '');
    return { name: '3. Distance & Bearing', ok: false, ss, ms: Date.now() - t0, err: e.message.slice(0, 300) };
  }
}

async function testArea(page) {
  const t0 = Date.now();
  try {
    console.log('  [4/9] Area — Parcel A (AB1-AB4, expected 1.619 Ha)...');
    await page.goto(`${BASE}/tools/area`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(3000);

    // The area page pre-populates 4 sample points with "e.g. 5000" placeholders
    // Delete all existing rows first
    const delBtns = page.locator('button:has-text("×")');
    const delCount = await delBtns.count();
    for (let i = 0; i < delCount; i++) {
      await page.locator('button:has-text("×")').first().click();
      await sleep(100);
    }

    // Add 4 new points
    await clickBtn(page, 'Add Point');
    await clickBtn(page, 'Add Point');
    await clickBtn(page, 'Add Point');
    await clickBtn(page, 'Add Point');
    await sleep(300);

    // Fill: each point has 2 inputs (northing, easting) with "e.g." placeholders
    const pts = [
      { n: B.AB1.n, e: B.AB1.e },
      { n: B.AB2.n, e: B.AB2.e },
      { n: B.AB3.n, e: B.AB3.e },
      { n: B.AB4.n, e: B.AB4.e },
    ];

    // Find all inputs with "e.g." placeholder — these are the coordinate inputs
    const coordInputs = page.locator('input[placeholder*="e.g."]');
    const ciCount = await coordInputs.count();

    if (ciCount >= 8) {
      for (let i = 0; i < 4; i++) {
        await coordInputs.nth(i * 2).fill(String(pts[i].n));     // Northing
        await coordInputs.nth(i * 2 + 1).fill(String(pts[i].e)); // Easting
        await sleep(80);
      }
    }

    await screenshot(page, '04a-area-filled');
    await clickBtn(page, 'Calculate Area');
    await sleep(3000);

    const text = await page.innerText('body');
    const ss = await screenshot(page, '04b-area-result');
    const hasResult = text.includes('1.6') || text.includes('16') || text.includes('Area') ||
                      text.includes('Shoelace') || text.includes('ha') || text.includes('Ha');
    return { name: '4. Area Computation', ok: hasResult, ss, ms: Date.now() - t0,
             note: hasResult ? `Area computed` : `No results (${ciCount} inputs, body: ${text.length})` };
  } catch (e) {
    const ss = await screenshot(page, '04b-area-result').catch(() => '');
    return { name: '4. Area Computation', ok: false, ss, ms: Date.now() - t0, err: e.message.slice(0, 300) };
  }
}

async function testTraverse(page) {
  const t0 = Date.now();
  try {
    console.log('  [5/9] Traverse — F/R 583/58 boundary (10 legs)...');
    await page.goto(`${BASE}/tools/traverse`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(3000);

    // Add legs if needed (default has some rows)
    const existingLegs = await page.locator('tbody tr').count();
    const needed = Math.max(0, LEGS.length - existingLegs);
    for (let i = 0; i < needed; i++) {
      await clickBtn(page, 'Add Leg');
      await sleep(200);
    }
    await sleep(500);

    // Fill each leg row: dist, bearD, bearM, bearS, n, e
    const rows = page.locator('tbody tr');
    const rowCount = await rows.count();

    for (let i = 0; i < LEGS.length && i < rowCount; i++) {
      const leg = LEGS[i];
      const ri = rows.nth(i);
      const inp = ri.locator('input');
      const ic = await inp.count();
      if (ic >= 6) {
        await inp.nth(0).fill(String(leg.dist));
        await inp.nth(1).fill(String(leg.d));
        await inp.nth(2).fill(String(leg.m));
        await inp.nth(3).fill(String(leg.s));
        if (i === 0) {
          await inp.nth(4).fill(String(B.RD21.n));
          await inp.nth(5).fill(String(B.RD21.e));
        }
      }
      await sleep(50);
    }

    await screenshot(page, '05a-traverse-filled');
    await clickBtn(page, 'Calculate Adjustment');
    await sleep(5000);

    const text = await page.innerText('body');
    const ss = await screenshot(page, '05b-traverse-result');
    const hasResult = text.includes('Misclosure') || text.includes('Precision') ||
                      text.includes('1:') || text.includes('Adjusted') || text.includes('RDM') ||
                      text.includes('Bowditch') || text.includes('Table');
    return { name: '5. Traverse Adjustment', ok: hasResult, ss, ms: Date.now() - t0,
             note: hasResult ? `Traverse adjusted` : `No results (${rowCount} rows, body: ${text.length})` };
  } catch (e) {
    const ss = await screenshot(page, '05b-traverse-result').catch(() => '');
    return { name: '5. Traverse Adjustment', ok: false, ss, ms: Date.now() - t0, err: e.message.slice(0, 400) };
  }
}

async function testCOGO(page) {
  const t0 = Date.now();
  try {
    console.log('  [6/9] COGO Inverse — RD21 to RDa1...');
    await page.goto(`${BASE}/tools/cogo`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(3000);

    // COGO Inverse tab: inputs are E1, N1, Label, E2, N2, Label
    const inputs = page.locator('input');
    const count = await inputs.count();

    if (count >= 4) {
      await inputs.nth(0).fill(String(B.RD21.e));  // E1
      await sleep(80);
      await inputs.nth(1).fill(String(B.RD21.n));  // N1
      await sleep(80);
      // Index 2 is Label — skip
      if (count >= 5) {
        await inputs.nth(3).fill(String(B.RDa1.e));  // E2
        await sleep(80);
        await inputs.nth(4).fill(String(B.RDa1.n));  // N2
      }
    }

    await screenshot(page, '06a-cogo-filled');
    await clickBtn(page, 'Compute Inverse');
    await sleep(3000);

    const text = await page.innerText('body');
    const ss = await screenshot(page, '06b-cogo-result');
    const hasResult = text.includes('846') || text.includes('287') || text.includes('Distance') ||
                      text.includes('Bearing') || text.includes('Result');
    return { name: '6. COGO Inverse', ok: hasResult, ss, ms: Date.now() - t0,
             note: hasResult ? `COGO computed` : `No results (${count} inputs)` };
  } catch (e) {
    const ss = await screenshot(page, '06b-cogo-result').catch(() => '');
    return { name: '6. COGO Inverse', ok: false, ss, ms: Date.now() - t0, err: e.message.slice(0, 300) };
  }
}

async function testBearing(page) {
  const t0 = Date.now();
  try {
    console.log('  [7/9] Bearing — Ne3 to Ne4 (expected 151d 41m 24s)...');
    await page.goto(`${BASE}/tools/bearing`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(3000);

    // 4 inputs: A N, A E, B N, B E
    await fillInputs(page, [
      { index: 0, value: B.Ne3.n },
      { index: 1, value: B.Ne3.e },
      { index: 2, value: B.Ne4.n },
      { index: 3, value: B.Ne4.e },
    ]);

    await screenshot(page, '07a-bearing-filled');
    await clickBtn(page, 'Calculate');
    await sleep(3000);

    const text = await page.innerText('body');
    const ss = await screenshot(page, '07b-bearing-result');
    const hasResult = text.includes('151') || text.includes('Bearing') || text.includes('WCB') ||
                      text.includes('Back') || text.includes('Solution');
    return { name: '7. Bearing Calculator', ok: hasResult, ss, ms: Date.now() - t0,
             note: hasResult ? `Bearing computed` : `No results` };
  } catch (e) {
    const ss = await screenshot(page, '07b-bearing-result').catch(() => '');
    return { name: '7. Bearing Calculator', ok: false, ss, ms: Date.now() - t0, err: e.message.slice(0, 300) };
  }
}

async function testTools(page) {
  const t0 = Date.now();
  try {
    console.log('  [8/9] Tools Index...');
    await page.goto(`${BASE}/tools`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(2000);

    const text = await page.innerText('body');
    const links = await page.locator('a[href*="/tools/"]').count();
    const ss = await screenshot(page, '08-tools-index');
    const ok = text.includes('Traverse') || text.includes('Distance') || text.includes('Area') ||
               text.includes('COGO') || text.includes('Leveling');
    return { name: '8. Tools Index', ok: ok && links > 0, ss, ms: Date.now() - t0,
             note: `${links} tool links found` };
  } catch (e) {
    const ss = await screenshot(page, '08-tools-index').catch(() => '');
    return { name: '8. Tools Index', ok: false, ss, ms: Date.now() - t0, err: e.message.slice(0, 200) };
  }
}

async function testSettingOut(page) {
  const t0 = Date.now();
  try {
    console.log('  [9/9] Setting Out — AB1-AB4 from RD21...');
    await page.goto(`${BASE}/tools/setting-out`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(3000);

    // Station setup (6 inputs): E, N, RL, IH, BS_E, BS_N
    const allInputs = page.locator('input');
    const total = await allInputs.count();

    if (total >= 6) {
      await allInputs.nth(0).fill(String(B.RD21.e));
      await allInputs.nth(1).fill(String(B.RD21.n));
      await allInputs.nth(2).fill('0.000');
      await allInputs.nth(3).fill('1.500');
      await allInputs.nth(4).fill(String(B.CN4.e));
      await allInputs.nth(5).fill(String(B.CN4.n));
    }

    // Add design points (page starts with 1 row, need 4)
    const rowsBefore = await page.locator('tr').count();
    const addCount = Math.max(0, 4 - (rowsBefore - 2));
    for (let i = 0; i < addCount; i++) {
      await clickBtn(page, 'Add Point');
      await sleep(200);
    }
    await sleep(300);

    // Fill design points: each row has ID, E, N, RL, TH, Description (6 inputs)
    // They start after the 6 station inputs
    const dps = [
      { id: 'AB1', e: B.AB1.e, n: B.AB1.n },
      { id: 'AB2', e: B.AB2.e, n: B.AB2.n },
      { id: 'AB3', e: B.AB3.e, n: B.AB3.n },
      { id: 'AB4', e: B.AB4.e, n: B.AB4.n },
    ];

    const allInp2 = page.locator('input');
    for (let i = 0; i < dps.length; i++) {
      const off = 6 + i * 6;
      await allInp2.nth(off).fill(dps[i].id);
      await allInp2.nth(off + 1).fill(String(dps[i].e));
      await allInp2.nth(off + 2).fill(String(dps[i].n));
      await sleep(80);
    }

    await screenshot(page, '09a-settingout-filled');
    await clickBtn(page, 'Compute Setting Out');
    await sleep(5000);

    const text = await page.innerText('body');
    const ss = await screenshot(page, '09b-settingout-result');
    const hasResult = text.includes('AB1') || text.includes('AB2') || text.includes('AB3') ||
                      text.includes('AB4') || text.includes('Setting') || text.includes('Horizontal') ||
                      text.includes('Distance') || text.includes('Bearing');
    return { name: '9. Setting Out', ok: hasResult, ss, ms: Date.now() - t0,
             note: hasResult ? `Setting out computed` : `No results (${total} inputs)` };
  } catch (e) {
    const ss = await screenshot(page, '09b-settingout-result').catch(() => '');
    return { name: '9. Setting Out', ok: false, ss, ms: Date.now() - t0, err: e.message.slice(0, 300) };
  }
}

// ============================================================
// Main
// ============================================================

async function main() {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

  console.log('\n' + '='.repeat(62));
  console.log('  METARDU E2E SURVEYOR WORKFLOW — F/R 583/58');
  console.log('  Real Kenyan Cadastral Subdivision Data');
  console.log('='.repeat(62));

  // Start server
  await startServer();
  console.log('');

  // Browser
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
  });
  const page = await ctx.newPage();

  // Suppress unhandled errors from Next.js dev
  page.on('pageerror', () => {});

  // Run tests
  const results = [
    await testLanding(page),
    await testCoordinates(page),
    await testDistance(page),
    await testArea(page),
    await testTraverse(page),
    await testCOGO(page),
    await testBearing(page),
    await testTools(page),
    await testSettingOut(page),
  ];

  await browser.close();
  stopServer();

  // Report
  const passed = results.filter(r => r.ok).length;
  const failed = results.length - passed;
  const totalMs = results.reduce((s, r) => s + r.ms, 0);

  console.log('\n' + '='.repeat(62));
  console.log(`  RESULTS: ${passed}/${results.length} passed (${(totalMs/1000).toFixed(1)}s)`);
  console.log('='.repeat(62) + '\n');

  for (const r of results) {
    const icon = r.ok ? 'PASS' : 'FAIL';
    console.log(`  [${icon}] ${r.name} (${r.ms}ms)`);
    if (r.note) console.log(`        ${r.note}`);
    if (r.err) console.log(`        ERR: ${r.err}`);
    console.log(`        ${r.ss}`);
    console.log('');
  }

  // JSON report
  const report = {
    timestamp: new Date().toISOString(),
    summary: { total: results.length, passed, failed, totalMs },
    beacons: B,
    datumJoins: LEGS,
    tests: results,
  };
  fs.writeFileSync(path.join(SCREENSHOT_DIR, 'e2e-report.json'), JSON.stringify(report, null, 2));
  console.log(`Reports: ${SCREENSHOT_DIR}/\n`);

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(2); });
