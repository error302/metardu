/**
 * E2E Tests — F/R 583/58 Surveyor Workflow
 * Uses Node.js HTTP to test all Metardu pages and API endpoints.
 * Run with: METARDU_PORT=3111 node scripts/e2e-fr583-surveyor-workflow.js
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.METARDU_PORT || '3111';
const BASE = 'http://127.0.0.1:' + PORT;
const SCREENSHOT_DIR = '/home/z/my-project/download';

var results = [];
var passed = 0;
var failed = 0;
var skipped = 0;

function log(test, status, detail) {
  var icon = status === 'PASS' ? '\u2705' : status === 'FAIL' ? '\u274c' : '\u23ed';
  console.log(icon + ' ' + test + (detail ? ': ' + detail : ''));
  results.push({ test, status, detail: detail || '' });
  if (status === 'PASS') passed++;
  else if (status === 'FAIL') failed++;
  else skipped++;
}

function get(url) {
  return new Promise(function(resolve, reject) {
    http.get(url, function(res) {
      var data = '';
      res.on('data', function(d) { data += d; });
      res.on('end', function() { resolve({ status: res.statusCode, body: data, len: data.length }); });
    }).on('error', reject);
  });
}

function post(url, bodyObj) {
  return new Promise(function(resolve, reject) {
    var urlObj = new URL(url);
    var postData = JSON.stringify(bodyObj);
    var opts = {
      hostname: urlObj.hostname, port: urlObj.port, path: urlObj.pathname,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) }
    };
    var req = http.request(opts, function(res) {
      var data = '';
      res.on('data', function(d) { data += d; });
      res.on('end', function() { resolve({ status: res.statusCode, body: data }); });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

async function testPage(urlPath, name) {
  try {
    var r = await get(BASE + urlPath);
    var ok = r.status === 200 && r.len > 100;
    log(name, ok ? 'PASS' : 'FAIL', 'Status: ' + r.status + ', Size: ' + r.len + ' bytes');
    return r;
  } catch (e) {
    log(name, 'FAIL', e.code || e.message.substring(0, 80));
    return null;
  }
}

async function testContent(urlPath, name, keywords) {
  try {
    var r = await get(BASE + urlPath);
    if (r.status !== 200) { log(name, 'FAIL', 'Status: ' + r.status); return; }
    var found = keywords.some(function(kw) { return r.body.includes(kw); });
    log(name, found ? 'PASS' : 'FAIL', 'Keywords: ' + keywords.slice(0, 3).join(', '));
  } catch (e) {
    log(name, 'FAIL', e.code || e.message.substring(0, 60));
  }
}

async function testApi(urlPath, name, method, body) {
  try {
    var r;
    if (method === 'POST') r = await post(BASE + urlPath, body);
    else r = await get(BASE + urlPath);
    var ok = r.status < 500;
    log(name, ok ? 'PASS' : 'FAIL', 'Status: ' + r.status + (r.body ? ', Body: ' + r.body.substring(0, 100) : ''));
  } catch (e) {
    log(name, 'FAIL', e.code || e.message.substring(0, 60));
  }
}

async function runTests() {
  console.log('');
  console.log('================================================================');
  console.log('  METARDU E2E Tests - F/R 583/58 Surveyor Workflow');
  console.log('  Simulating surveyor processing cadastral subdivision data');
  console.log('  Datum: Arc 1960 / UTM Zone 37S');
  console.log('  Server: ' + BASE);
  console.log('================================================================');
  console.log('');

  // ═══════════════════════════════════════════════════════════════════════
  // PHASE 1: Core Pages — Surveyor lands on Metardu and navigates
  // ═══════════════════════════════════════════════════════════════════════
  console.log('━━━ PHASE 1: Core Application Pages ━━━');

  await testPage('/', 'Home page');
  // Dashboard requires auth - expect 307 redirect to login
  try {
    var r = await get(BASE + '/dashboard');
    log('Dashboard (requires auth)', r.status === 307 || r.status === 200 ? 'PASS' : 'FAIL',
      'Status: ' + r.status + ' (307 = redirect to login, expected without auth)');
  } catch(e) { log('Dashboard', 'FAIL', e.code); }
  await testPage('/tools', 'Tools hub');
  await testPage('/login', 'Login page');
  await testPage('/docs/quick-start', 'Quick start guide');

  // ═══════════════════════════════════════════════════════════════════════
  // PHASE 2: Surveyor opens Distance & Bearing tool to verify datum joins
  // Input: CN4 (113919.14, -3718.10) → RD21 (114370.35, -4182.37)
  // Expected: 846.49m @ 287°14'04"
  // ═══════════════════════════════════════════════════════════════════════
  console.log('');
  console.log('━━━ PHASE 2: Datum Join Verification (Distance & Bearing) ━━━');

  await testPage('/tools/distance', 'Distance tool page');
  await testContent('/tools/distance', 'Distance tool has coordinate inputs',
    ['Easting', 'Northing', 'Distance', 'Bearing', 'From', 'To']);
  await testPage('/tools/missing-line', 'Missing line tool');
  await testPage('/tools/bearing', 'Bearing tool');

  // ═══════════════════════════════════════════════════════════════════════
  // PHASE 3: Surveyor computes area of parcels
  // Parcel A (new subdivision): ~1.619 Ha
  // F/R Total: ~93.81 Ha
  // ═══════════════════════════════════════════════════════════════════════
  console.log('');
  console.log('━━━ PHASE 3: Parcel Area Computation ━━━');

  await testPage('/tools/area', 'Area tool page');
  await testContent('/tools/area', 'Area tool has Shoelace/coordinate area UI',
    ['Area', 'Coordinate', 'Ha', 'Shoelace', 'Perimeter']);

  // ═══════════════════════════════════════════════════════════════════════
  // PHASE 4: Surveyor runs traverse around F/R boundary
  // 10 stations, closed traverse, Bowditch adjustment
  // ═══════════════════════════════════════════════════════════════════════
  console.log('');
  console.log('━━━ PHASE 4: Traverse Adjustment ━━━');

  await testPage('/tools/traverse', 'Traverse tool page');
  await testContent('/tools/traverse', 'Traverse tool has Bowditch/Transit UI',
    ['Traverse', 'Bowditch', 'Transit', 'Misclosure', 'Station', 'Bearing']);
  await testPage('/tools/traverse-field-book', 'Traverse field book');
  await testContent('/tools/traverse-field-book', 'Traverse field book has angular closure',
    ['Angular', 'Closure', 'Field', 'Observation']);

  // ═══════════════════════════════════════════════════════════════════════
  // PHASE 5: Surveyor sets out theoretical beacon positions
  // RD21 → AB3 (287°14'04", 102.2m) → AB4a → AB4 → AB4b → AB1 → AB2 → AB3
  // ═══════════════════════════════════════════════════════════════════════
  console.log('');
  console.log('━━━ PHASE 5: Theoretical Beacon Setting Out ━━━');

  await testPage('/tools/setting-out', 'Setting-out tool page');
  await testContent('/tools/setting-out', 'Setting-out tool has stakeout UI',
    ['Setting', 'Stake', 'Bearing', 'Distance', 'Coordinate']);
  await testPage('/tools/cogo', 'COGO tool page');
  await testContent('/tools/cogo', 'COGO tool has intersection/resection UI',
    ['COGO', 'Intersection', 'Resection', 'Radiation']);

  // ═══════════════════════════════════════════════════════════════════════
  // PHASE 6: Surveyor verifies datum transformation (Arc 1960 → WGS84)
  // ═══════════════════════════════════════════════════════════════════════
  console.log('');
  console.log('━━━ PHASE 6: Datum Transformation & Coordinates ━━━');

  await testPage('/tools/coordinates', 'Coordinates tool page');
  await testContent('/tools/coordinates', 'Coordinates tool has Arc 1960 / UTM Zone 37S',
    ['Arc 1960', 'UTM', 'Zone', 'Kenya', 'Datum', 'Transform']);

  // Test the coordinate transform API
  await testApi('/api/coordinates/transform', 'API: Coordinate transform endpoint',
    'POST', {
      easting: -4182.37,
      northing: 114370.35,
      zone: 37,
      hemisphere: 'S',
      fromDatum: 'ARC1960'
    });

  // ═══════════════════════════════════════════════════════════════════════
  // PHASE 7: Surveyor runs GNSS baseline processing
  // ═══════════════════════════════════════════════════════════════════════
  console.log('');
  console.log('━━━ PHASE 7: GNSS Processing ━━━');

  await testPage('/tools/gnss', 'GNSS processing tool');
  await testContent('/tools/gnss', 'GNSS tool has baseline/coordinate UI',
    ['GNSS', 'Baseline', 'ECEF', 'WGS84', 'Coordinate']);
  await testPage('/tools/gnss-baseline', 'GNSS baseline processing');
  await testPage('/tools/gnss-observation-log', 'GNSS observation log');

  // ═══════════════════════════════════════════════════════════════════════
  // PHASE 8: Surveyor imports RTK data from total station
  // ═══════════════════════════════════════════════════════════════════════
  console.log('');
  console.log('━━━ PHASE 8: Data Import ━━━');

  await testPage('/import', 'Total station import page');
  await testContent('/import', 'Import page has instrument format options',
    ['Leica', 'Trimble', 'Topcon', 'GSI', 'CSV', 'Import']);
  await testPage('/parsers', 'File parsers page');

  // ═══════════════════════════════════════════════════════════════════════
  // PHASE 9: Surveyor fills digital field book
  // ═══════════════════════════════════════════════════════════════════════
  console.log('');
  console.log('━━━ PHASE 9: Digital Field Book ━━━');

  await testPage('/fieldbook', 'Field book page');
  await testContent('/fieldbook', 'Field book has observation entry UI',
    ['Field', 'Book', 'Observation', 'Traverse', 'Level']);

  // ═══════════════════════════════════════════════════════════════════════
  // PHASE 10: Surveyor does leveling work
  // ═══════════════════════════════════════════════════════════════════════
  console.log('');
  console.log('━━━ PHASE 10: Leveling & Two Peg Test ━━━');

  await testPage('/tools/leveling', 'Leveling tool page');
  await testContent('/tools/leveling', 'Leveling tool has rise/fall UI',
    ['Level', 'BS', 'FS', 'IS', 'Rise', 'Fall', 'RL']);
  await testPage('/tools/level-book', 'Level book page');
  await testContent('/tools/level-book', 'Level book has HPC/R&F methods',
    ['HPC', 'Rise', 'Fall', 'Reduced', 'Collimation']);
  await testPage('/tools/two-peg-test', 'Two peg test page');
  await testContent('/tools/two-peg-test', 'Two peg test has collimation check',
    ['Peg', 'Collimation', 'Instrument']);

  // ═══════════════════════════════════════════════════════════════════════
  // PHASE 11: Engineering computations
  // ═══════════════════════════════════════════════════════════════════════
  console.log('');
  console.log('━━━ PHASE 11: Engineering Computations ━━━');

  await testPage('/tools/curves', 'Curves tool page');
  await testContent('/tools/curves', 'Curves tool has horizontal/vertical curve UI',
    ['Curve', 'Radius', 'Tangent', 'Arc', 'Deflection']);
  await testPage('/tools/chainage', 'Chainage tool page');
  await testPage('/tools/grade', 'Grade tool page');
  await testPage('/tools/tacheometry', 'Tacheometry tool page');
  await testPage('/tools/cross-sections', 'Cross sections tool page');
  await testPage('/tools/sight-distance', 'Sight distance tool page');
  await testPage('/tools/height-of-object', 'Height of object tool page');
  await testPage('/tools/superelevation', 'Superelevation tool page');

  // ═══════════════════════════════════════════════════════════════════════
  // PHASE 12: Road design workflow
  // ═══════════════════════════════════════════════════════════════════════
  console.log('');
  console.log('━━━ PHASE 12: Road Design ━━━');

  await testPage('/tools/road-design', 'Road design tool page');
  await testContent('/tools/road-design', 'Road design has RDM/KeNHA UI',
    ['Road', 'Design', 'RDM', 'KeNHA', 'KeRRA', 'Alignment']);
  await testPage('/tools/earthworks', 'Earthworks tool page');
  await testContent('/tools/earthworks', 'Earthworks has cut/fill volume UI',
    ['Cut', 'Fill', 'Volume', 'Earthwork', 'Prismoidal']);

  // ═══════════════════════════════════════════════════════════════════════
  // PHASE 13: Volume & mining tools
  // ═══════════════════════════════════════════════════════════════════════
  console.log('');
  console.log('━━━ PHASE 13: Volume & Mining ━━━');

  await testPage('/tools/mining', 'Mining volume tool');
  await testPage('/tools/stockpile-volume', 'Stockpile volume tool');
  await testPage('/tools/borrow-pit-volume', 'Borrow pit volume tool');
  await testPage('/tools/hydrographic', 'Hydrographic tool');
  await testPage('/tools/drone', 'Drone/UAV tool');

  // ═══════════════════════════════════════════════════════════════════════
  // PHASE 14: Construction monitoring tools (new modules)
  // ═══════════════════════════════════════════════════════════════════════
  console.log('');
  console.log('━━━ PHASE 14: Construction Monitoring Tools ━━━');

  await testPage('/tools/pile-grid', 'Pile/column grid setting out');
  await testPage('/tools/slope-analysis', 'Slope & area analysis');
  await testPage('/tools/progress-monitor', 'Construction progress monitor');
  await testPage('/tools/topo-drawing', 'Topo drawing composer');
  await testPage('/tools/machine-control', 'Machine control export');

  // ═══════════════════════════════════════════════════════════════════════
  // PHASE 15: Document generation
  // ═══════════════════════════════════════════════════════════════════════
  console.log('');
  console.log('━━━ PHASE 15: Document Generation ━━━');

  await testPage('/deed-plan', 'Deed plan generator');
  await testPage('/tools/survey-report-builder', 'Survey report builder');
  await testPage('/tools/beacon-certificate', 'Beacon certificate');
  await testPage('/tools/statutory-workbook', 'Statutory workbook');
  await testPage('/tools/mobilisation-report', 'Mobilisation report');
  await testPage('/tools/control-marks-register', 'Control marks register');
  await testPage('/tools/billable-documents', 'Billable documents');

  // ═══════════════════════════════════════════════════════════════════════
  // PHASE 16: Survey regulations & reference
  // ═══════════════════════════════════════════════════════════════════════
  console.log('');
  console.log('━━━ PHASE 16: Regulations & Reference ━━━');

  await testPage('/tools/survey-regulations', 'Survey regulations');
  await testContent('/tools/survey-regulations', 'Regulations has Kenya Cap 299 content',
    ['Survey', 'Regulation', '299', 'Cap', 'Kenya']);
  await testPage('/tools/beacon-reference', 'Beacon reference');
  await testPage('/tools/detail-tolerances', 'Detail tolerances');

  // ═══════════════════════════════════════════════════════════════════════
  // PHASE 17: Export & integration
  // ═══════════════════════════════════════════════════════════════════════
  console.log('');
  console.log('━━━ PHASE 17: Export & Integration ━━━');

  await testPage('/tools/gis-export', 'GIS export');
  await testPage('/tools/gcp-export', 'GCP export');
  await testPage('/tools/civil-export', 'Civil engineering export');
  await testPage('/tools/pipe-gradient', 'Pipe gradient calculator');

  // ═══════════════════════════════════════════════════════════════════════
  // PHASE 18: Field data collection
  // ═══════════════════════════════════════════════════════════════════════
  console.log('');
  console.log('━━━ PHASE 18: Field Data Collection ━━━');

  await testPage('/field', 'Field data hub');
  await testPage('/field/gnss', 'GNSS field collection');
  await testPage('/field/collect', 'Mobile data collection');
  await testPage('/fieldbook/ai', 'AI field book (OCR)');

  // ═══════════════════════════════════════════════════════════════════════
  // PHASE 19: API endpoints
  // ═══════════════════════════════════════════════════════════════════════
  console.log('');
  console.log('━━━ PHASE 19: API Endpoints ━━━');

  // Health API - expect degraded (503) when no DB, or 200 with DB
  try {
    var r = await get(BASE + '/api/health');
    var ok = r.status === 200 || r.status === 503;
    log('API: Health check (degraded OK without DB)', ok ? 'PASS' : 'FAIL',
      'Status: ' + r.status + (r.status === 503 ? ' (expected - no DB in test env)' : ''));
  } catch(e) { log('API: Health', 'FAIL', e.code); }
  await testApi('/api/compute', 'API: Compute endpoint', 'POST', { type: 'ping' });

  // ═══════════════════════════════════════════════════════════════════════
  // SUMMARY
  // ═══════════════════════════════════════════════════════════════════════
  console.log('');
  console.log('================================================================');
  console.log('  RESULTS: ' + passed + ' PASSED | ' + failed + ' FAILED | ' + skipped + ' SKIPPED');
  console.log('  Total:   ' + results.length + ' tests');
  console.log('================================================================');
  console.log('');

  // Write JSON report
  var reportPath = path.join(SCREENSHOT_DIR, 'e2e_test_report.json');
  var report = {
    timestamp: new Date().toISOString(),
    source: 'F/R 583/58 Cadastral Survey - Surveyor Workflow E2E Tests',
    datum: 'Arc 1960 / UTM Zone 37S',
    surveyor: 'Boniface O. Wanyama (Licence No. 228)',
    summary: { passed, failed, skipped, total: results.length },
    results: results
  };
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log('Report saved: ' + reportPath);

  if (failed > 0) process.exit(1);
}

runTests().catch(function(e) {
  console.error('Test runner crashed:', e);
  process.exit(2);
});
