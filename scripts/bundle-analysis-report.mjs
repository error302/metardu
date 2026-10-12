/**
 * Bundle Size Analyzer Report Generator
 *
 * Generates a static HTML report from the latest production build's
 * `.next/analyze` directory (output of `ANALYZE=true next build`).
 * Also falls back to scanning `.next/static/chunks` when analyzer
 * output is not available.
 *
 * Usage:
 *   node scripts/bundle-analysis-report.mjs
 *
 * Output: .next/analyze/bundle-analysis-report.html
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const PROJECT_ROOT = path.resolve(__dirname, '..')
const BUILD_DIR = process.env.METARDU_NEXT_DIST_DIR || '.next'
const DOWNLOAD_DIR = path.join(PROJECT_ROOT, BUILD_DIR, 'analyze')

// Vendor chunk priority order for display
const VENDOR_PRIORITY = [
  'vendor-ol', 'vendor-three', 'vendor-pdfjs', 'vendor-pdf-lib', 'vendor-pdfkit',
  'vendor-exceljs', 'vendor-turf', 'vendor-recharts', 'vendor-proj4', 'vendor-jszip',
  'vendor-d3', 'vendor-radix', 'vendor-common',
]
const VENDOR_NAMES = VENDOR_PRIORITY.map((name) => name.slice('vendor-'.length))

// Known heavy deps that should be lazy-loaded (informational flag)
const LAZY_LOAD_TARGETS = {
  'three': 'Dynamic import in /tools/point-cloud-import',
  'pdfjs-dist': 'Dynamic import in /documents and /import',
  'exceljs': 'Dynamic import in /fieldbook and /tools/statutory-workbook',
  'pdf-lib': 'Dynamic import in /documents/[id]',
  '@turf/turf': 'Dynamic import in /tools/contour-generator',
  'recharts': 'Consider dynamic import in dashboard widgets',
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`
}

function getChunkType(filename) {
  if (filename.startsWith('vendor-')) return 'vendor'
  if (filename.startsWith('framework') || filename.startsWith('webpack')) return 'framework'
  if (filename.startsWith('polyfills')) return 'polyfill'
  if (filename.startsWith('main')) return 'main'
  if (/^pages?\/_app/.test(filename)) return 'app-shell'
  if (filename.includes('/page')) return 'page'
  if (/^\d/.test(filename)) return 'async-chunk'
  return 'other'
}

function getVendorGroup(filename) {
  if (!filename.startsWith('vendor-')) return 'other'
  const vendor = VENDOR_NAMES.find((name) => filename.startsWith(`vendor-${name}-`))
  return vendor ? `vendor-${vendor}` : 'vendor-other'
}

function collectChunks() {
  const chunksDir = path.join(PROJECT_ROOT, BUILD_DIR, 'static', 'chunks')
  const allChunks = []

  if (!fs.existsSync(chunksDir)) {
    return { chunks: [], error: 'No build found. Run `npm run build` first.' }
  }

  function walk(dir, baseRel = '') {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      const rel = baseRel ? `${baseRel}/${entry.name}` : entry.name
      if (entry.isDirectory()) {
        walk(full, rel)
      } else if (entry.name.endsWith('.js')) {
        const stat = fs.statSync(full)
        allChunks.push({
          name: rel,
          filename: entry.name,
          sizeBytes: stat.size,
          type: getChunkType(entry.name),
        })
      }
    }
  }

  walk(chunksDir)
  return { chunks: allChunks, error: null }
}

function analyzeChunks(chunks) {
  // Group by vendor prefix
  const byVendor = {}
  const byType = {}
  let totalSize = 0

  for (const chunk of chunks) {
    totalSize += chunk.sizeBytes

    // Match the configured dependency name before the content hash. Parsing
    // letters from the hash split one vendor into misleading pseudo-groups.
    const vendorKey = getVendorGroup(chunk.filename)
    byVendor[vendorKey] = (byVendor[vendorKey] ?? 0) + chunk.sizeBytes

    // Type bucket
    byType[chunk.type] = (byType[chunk.type] ?? 0) + chunk.sizeBytes
  }

  // Sort chunks by size descending
  const sorted = [...chunks].sort((a, b) => b.sizeBytes - a.sizeBytes)

  return {
    totalSize,
    totalChunks: chunks.length,
    sorted,
    byVendor: Object.entries(byVendor).sort((a, b) => b[1] - a[1]),
    byType: Object.entries(byType).sort((a, b) => b[1] - a[1]),
  }
}

function renderHtml(analysis, error) {
  const { totalSize, totalChunks, sorted, byVendor, byType } = analysis

  const topChunks = sorted.slice(0, 30)
  const recommendations = generateRecommendations(byVendor, sorted)

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>METARDU — Bundle Size Analysis Report</title>
  <style>
    :root {
      --bg: #0a0a0f;
      --panel: #14141b;
      --border: #2a2a35;
      --text: #e5e5e5;
      --text-muted: #8b8b95;
      --accent: #e8841a;
      --accent-dim: #c66e15;
      --good: #4ade80;
      --warn: #facc15;
      --bad: #f87171;
    }
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: var(--bg);
      color: var(--text);
      margin: 0;
      padding: 24px;
      line-height: 1.6;
    }
    h1 {
      font-size: 28px;
      margin: 0 0 8px;
      color: var(--accent);
    }
    .meta { color: var(--text-muted); font-size: 13px; margin-bottom: 24px; }
    .grid { display: grid; gap: 20px; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); margin-bottom: 24px; }
    .panel {
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 20px;
    }
    .panel h2 { margin: 0 0 16px; font-size: 16px; font-weight: 600; color: var(--text); }
    .stat-row { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid var(--border); }
    .stat-row:last-child { border-bottom: none; }
    .stat-row .label { color: var(--text-muted); font-size: 13px; }
    .stat-row .value { font-weight: 600; font-family: ui-monospace, SFMono-Regular, monospace; }
    .bar {
      height: 6px;
      background: var(--border);
      border-radius: 3px;
      overflow: hidden;
      margin-top: 4px;
    }
    .bar > span {
      display: block;
      height: 100%;
      background: var(--accent);
      border-radius: 3px;
    }
    table { width: 100%; border-collapse: collapse; }
    th, td { text-align: left; padding: 10px 8px; border-bottom: 1px solid var(--border); font-size: 13px; }
    th { color: var(--text-muted); font-weight: 600; text-transform: uppercase; font-size: 11px; letter-spacing: 0.05em; }
    td.size { font-family: ui-monospace, SFMono-Regular, monospace; text-align: right; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; }
    .badge-vendor { background: rgba(232, 132, 26, 0.15); color: var(--accent); }
    .badge-page { background: rgba(96, 165, 250, 0.15); color: #60a5fa; }
    .badge-other { background: rgba(139, 139, 149, 0.15); color: var(--text-muted); }
    .recs { padding: 0; margin: 0; list-style: none; }
    .recs li { padding: 12px 0; border-bottom: 1px solid var(--border); }
    .recs li:last-child { border-bottom: none; }
    .recs strong { color: var(--accent); font-size: 13px; }
    .recs .rec-detail { color: var(--text-muted); font-size: 12px; margin-top: 2px; }
    .footer { color: var(--text-muted); font-size: 12px; text-align: center; margin-top: 32px; padding-top: 16px; border-top: 1px solid var(--border); }
    .warn-banner { background: rgba(250, 204, 21, 0.08); border: 1px solid rgba(250, 204, 21, 0.3); color: var(--warn); padding: 12px 16px; border-radius: 8px; margin-bottom: 24px; font-size: 13px; }
  </style>
</head>
<body>
  <h1>METARDU — Bundle Size Analysis</h1>
  <div class="meta">Generated: ${new Date().toISOString()} · Source: <code>.next/static/chunks</code> · Raw bytes across all emitted routes and async chunks; this is not an initial-page transfer size.</div>

  ${error ? `<div class="warn-banner">⚠️ ${error}</div>` : ''}

  <div class="grid">
    <div class="panel">
      <h2>Summary</h2>
      <div class="stat-row"><span class="label">All emitted JavaScript</span><span class="value">${formatBytes(totalSize)}</span></div>
      <div class="stat-row"><span class="label">Emitted chunk files</span><span class="value">${totalChunks}</span></div>
      <div class="stat-row"><span class="label">Largest emitted chunk</span><span class="value">${sorted[0] ? formatBytes(sorted[0].sizeBytes) : '—'}</span></div>
      <div class="stat-row"><span class="label">Vendor chunks (isolated)</span><span class="value">${byVendor.filter(([k]) => k.startsWith('vendor-')).length}</span></div>
    </div>

    <div class="panel">
      <h2>By Chunk Type</h2>
      ${byType.map(([type, size]) => `
        <div class="stat-row">
          <span class="label">${type}</span>
          <span class="value">${formatBytes(size)}</span>
        </div>
        <div class="bar"><span style="width: ${(size / totalSize * 100).toFixed(1)}%"></span></div>
      `).join('')}
    </div>

    <div class="panel">
      <h2>Vendor Isolation</h2>
      ${byVendor.filter(([k]) => k.startsWith('vendor-')).map(([vendor, size]) => `
        <div class="stat-row">
          <span class="label"><code>${vendor}</code></span>
          <span class="value">${formatBytes(size)}</span>
        </div>
        <div class="bar"><span style="width: ${(size / totalSize * 100).toFixed(1)}%"></span></div>
      `).join('') || '<p style="color: var(--text-muted); font-size: 13px;">No isolated vendor chunks detected.</p>'}
    </div>
  </div>

  <div class="panel" style="margin-bottom: 24px;">
    <h2>Top 30 Chunks by Size</h2>
    <table>
      <thead>
        <tr>
          <th>Chunk</th>
          <th>Type</th>
          <th class="size">Size</th>
          <th class="size">% of total</th>
        </tr>
      </thead>
      <tbody>
        ${topChunks.map(c => `
          <tr>
            <td><code>${c.name}</code></td>
            <td><span class="badge badge-${c.type === 'vendor' ? 'vendor' : c.type === 'page' ? 'page' : 'other'}">${c.type}</span></td>
            <td class="size">${formatBytes(c.sizeBytes)}</td>
            <td class="size">${(c.sizeBytes / totalSize * 100).toFixed(2)}%</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  </div>

  <div class="panel">
    <h2>Recommendations</h2>
    <ul class="recs">
      ${recommendations.map(r => `
        <li>
          <strong>${r.title}</strong>
          <div class="rec-detail">${r.detail}</div>
        </li>
      `).join('') || '<li style="color: var(--text-muted);">No recommendations — bundle looks healthy.</li>'}
    </ul>
  </div>

  <div class="footer">
    METARDU Bundle Analyzer · Use the route build report, loadable manifest, and a working analyzer treemap to attribute emitted chunks to routes.
  </div>
</body>
</html>`
}

function generateRecommendations(byVendor, sorted) {
  const recs = []
  const find = (key) => byVendor.find(([k]) => k === key)?.[1] ?? 0

  // Aggregate totals cannot establish which route loads a vendor chunk.
  if (find('vendor-three') > 500_000) {
    recs.push({
      title: 'Three.js is a significant part of emitted JavaScript',
      detail: 'The report totals ' + formatBytes(find('vendor-three')) + ' across all emitted routes and chunks. It cannot show which routes load these files; inspect import call sites and a route-aware treemap before changing imports.',
    })
  }

  // 2. Check pdfjs-dist
  if (find('vendor-pdfjs') > 500_000) {
    recs.push({
      title: 'PDF.js is a significant part of emitted JavaScript',
      detail: 'The report totals ' + formatBytes(find('vendor-pdfjs')) + ' across all emitted routes and chunks. It cannot show which routes load these files; inspect import call sites and a route-aware treemap before changing imports.',
    })
  }

  // 3. Check for any single non-vendor chunk over 250KB
  const largeAsync = sorted.find(c => !c.filename.startsWith('vendor-') && c.sizeBytes > 250_000)
  if (largeAsync) {
    recs.push({
      title: `Large emitted chunk: ${largeAsync.filename} (${formatBytes(largeAsync.sizeBytes)})`,
      detail: 'This report does not map chunks to routes or show whether this file is loaded initially. Use the ANALYZE=true treemap and route build report to identify its caller before changing code splitting.',
    })
  }

  return recs
}

// ─── Main ───────────────────────────────────────────────────────────────────

const { chunks, error } = collectChunks()
const analysis = chunks.length > 0
  ? analyzeChunks(chunks)
  : { totalSize: 0, totalChunks: 0, sorted: [], byVendor: [], byType: [] }

const html = renderHtml(analysis, error)

fs.mkdirSync(DOWNLOAD_DIR, { recursive: true })
const outPath = path.join(DOWNLOAD_DIR, 'bundle-analysis-report.html')
fs.writeFileSync(outPath, html, 'utf-8')

console.log('─' .repeat(60))
console.log('Bundle Analysis Report')
console.log('─' .repeat(60))
if (error) {
  console.log('⚠️  ' + error)
} else {
  console.log(`Emitted chunk files: ${analysis.totalChunks}`)
  console.log(`All emitted JS:      ${formatBytes(analysis.totalSize)} (raw, all routes and async chunks)`)
  console.log(`Largest chunk:       ${analysis.sorted[0]?.name ?? '—'} (${formatBytes(analysis.sorted[0]?.sizeBytes ?? 0)})`)
  console.log(`Vendor chunks:       ${analysis.byVendor.filter(([k]) => k.startsWith('vendor-')).length}`)
  console.log('')
  console.log('Top 5 chunks:')
  analysis.sorted.slice(0, 5).forEach((c, i) => {
    console.log(`  ${i + 1}. ${c.name} — ${formatBytes(c.sizeBytes)}`)
  })
  console.log('')
  console.log(`Report saved to: ${outPath}`)
}
