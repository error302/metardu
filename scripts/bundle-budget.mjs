#!/usr/bin/env node
/**
 * bundle-budget.mjs — CI gate: fails when the landing route's initial JS
 * exceeds the configured budget.
 *
 * What counts as "initial JS for /":
 *   The union of all JS chunk files listed in .next/app-build-manifest.json
 *   under the '/page' and '/layout' entries (App Router initial graph).
 *   CSS is tracked separately (informational — budget is JS-only).
 *
 * Why: the landing page has repeatedly absorbed heavy deps (OpenLayers via
 * ProjectionInit, all i18n locales, the Sentry SDK, crypto-browserify).
 * This gate makes that regression visible at PR time instead of at
 * deploy-time Lighthouse.
 *
 * Usage:
 *   node scripts/bundle-budget.mjs               # default budget
 *   node scripts/bundle-budget.mjs --max-kb 900  # custom budget
 *   node scripts/bundle-budget.mjs --report      # print per-chunk table, always exit 0
 *
 * Options can also come from env: BUNDLE_BUDGET_KB.
 * Exit codes: 0 = within budget, 1 = over budget or missing build output.
 * Wired into pr-checks.yml after the production build step.
 *
 * No external dependencies — pure Node fs + path.
 */

import { readFileSync, existsSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const MANIFEST = join(ROOT, '.next', 'app-build-manifest.json')

// ─── Budget (tuned to the post-optimization build; ratchet down as it drops) ──
// 2026-09-13: the catch-all vendor-common group forced lazy dependencies into
// initial scripts. It was removed. The HTTP script payload dropped from
// 3,334,922 bytes / 997,447 gzip bytes to 774,905 / 237,840.
// The App Router page/layout entries are initial chunks; do not excuse a
// regression by treating them as an entirely lazy dependency graph.
const DEFAULT_BUDGET_KB = 1000

function parseArgs(argv) {
  const args = { report: false, maxKb: undefined }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--report') args.report = true
    else if (a === '--max-kb') args.maxKb = Number(argv[++i])
    else if (a === '--help' || a === '-h') {
      console.log('Usage: node scripts/bundle-budget.mjs [--max-kb N] [--report]')
      process.exit(0)
    }
  }
  return args
}

function collectFiles(entries) {
  // Deduplicate chunk paths across the manifest entries.
  const js = new Set()
  const css = new Set()
  for (const f of entries) {
    if (f.endsWith('.js')) js.add(f)
    else if (f.endsWith('.css')) css.add(f)
  }
  return { js: [...js], css: [...css] }
}

function sumSizes(files, base = '.next') {
  let total = 0
  const rows = []
  for (const f of files) {
    const p = join(ROOT, base, f)
    if (!existsSync(p)) {
      rows.push({ file: f, size: 0, missing: true })
      continue
    }
    const size = statSync(p).size
    total += size
    rows.push({ file: f, size, missing: false })
  }
  rows.sort((a, b) => b.size - a.size)
  return { total, rows }
}

function kb(bytes) {
  return Math.round(bytes / 1024)
}

function main() {
  const { report, maxKb } = parseArgs(process.argv.slice(2))
  const budgetKb = maxKb ?? (Number(process.env.BUNDLE_BUDGET_KB) || DEFAULT_BUDGET_KB)

  if (!existsSync(MANIFEST)) {
    console.error(
      `[bundle-budget] .next/app-build-manifest.json not found.\n` +
      `  Run the production build first (npx next build), then re-run this gate.`
    )
    process.exit(1)
  }

  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'))
  const landingEntries = [...(manifest.pages?.['/page'] ?? []), ...(manifest.pages?.['/layout'] ?? [])]
  if (landingEntries.length === 0) {
    console.error('[bundle-budget] No /page entry in app-build-manifest.json — did the landing route build?')
    process.exit(1)
  }

  const { js, css } = collectFiles(landingEntries)
  const jsSum = sumSizes(js)
  const cssSum = sumSizes(css)
  const jsKb = kb(jsSum.total)
  const missing = jsSum.rows.filter((r) => r.missing)
  const over = jsKb > budgetKb

  // ─── Report ───
  console.log('Landing route initial JS budget check')
  console.log('─────────────────────────────────────')
  console.log(`Budget:  ${budgetKb} KB   Actual: ${jsKb} KB   ${over ? 'OVER by ' + (jsKb - budgetKb) + ' KB' : 'within budget (' + (budgetKb - jsKb) + ' KB headroom)'}   (CSS informational: ${kb(cssSum.total)} KB)`)
  if (report || over || process.env.CI) {
    console.log('Top chunks (uncompressed):')
    for (const r of jsSum.rows.slice(0, 15)) {
      const flag = r.missing ? '  [MISSING FROM .next]' : ''
      console.log(`  ${String(kb(r.size)).padStart(6)} KB  ${r.file.split('/static/')[1] ?? r.file}${flag}`)
    }
  }
  if (missing.length > 0) {
    console.error(`[bundle-budget] ${missing.length} manifest chunk(s) missing from .next — build output truncated?`)
    process.exit(1)
  }
  if (over && !report) {
    console.error(
      `[bundle-budget] Landing initial JS ${jsKb} KB exceeds budget ${budgetKb} KB.\n` +
      `  Suspects: a new static import of a heavy dep (ol, three, pdf*, recharts,\n` +
      `  @sentry/*, locale JSONs, Node 'crypto' pulling crypto-browserify).\n` +
      `  Fix: dynamic-import it behind the interaction that needs it, or raise\n` +
      `  the budget explicitly (BUNDLE_BUDGET_KB / --max-kb) with justification in the PR.`
    )
    process.exit(1)
  }
  process.exit(0)
}

main()
