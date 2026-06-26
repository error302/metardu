#!/usr/bin/env node
/**
 * i18n-sync.mjs
 * ───────────────────────────────────────────────────────────────────────────
 * METARDU i18n integrity + sync tool.
 *
 * What it does:
 *   1. Loads messages/en.json as the canonical source of truth.
 *   2. For every other locale file in /messages/*.json:
 *        a. Parses it (fails the check on JSON syntax errors).
 *        b. Walks the English key tree and reports any missing keys.
 *        c. Optionally fills missing keys with the English value,
 *           marked with a "// TODO: translate" comment block at top.
 *   3. Reports unused keys (keys present in locale but not in en).
 *   4. Exits non-zero if --check is passed and any locale has
 *      missing keys or syntax errors. Used by CI.
 *
 * Usage:
 *   node scripts/i18n-sync.mjs                # report only
 *   node scripts/i18n-sync.mjs --check        # exit 1 on missing keys (CI mode)
 *   node scripts/i18n-sync.mjs --fill         # write English fallbacks into missing keys
 *   node scripts/i18n-sync.mjs --fill --check # fill then re-verify
 *
 * No external dependencies — pure Node fs + path.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const MESSAGES_DIR = path.resolve(__dirname, '..', 'messages')
const EN_PATH = path.join(MESSAGES_DIR, 'en.json')

const argv = new Set(process.argv.slice(2))
const CHECK_MODE = argv.has('--check')
const FILL_MODE = argv.has('--fill')

// ─── helpers ────────────────────────────────────────────────────────────────

function loadJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch (err) {
    console.error(`✗ Failed to parse ${path.basename(filePath)}: ${err.message}`)
    process.exit(1)
  }
}

/** Collect every dotted key path present in obj. */
function collectKeys(obj, prefix = '') {
  const keys = []
  for (const [k, v] of Object.entries(obj)) {
    const p = prefix ? `${prefix}.${k}` : k
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      keys.push(...collectKeys(v, p))
    } else {
      keys.push(p)
    }
  }
  return keys
}

/** Read a value at a dotted path. */
function getPath(obj, dotted) {
  return dotted.split('.').reduce((acc, k) => (acc == null ? acc : acc[k]), obj)
}

/** Set a value at a dotted path, creating intermediate objects. */
function setPath(obj, dotted, value) {
  const parts = dotted.split('.')
  let cur = obj
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i]
    if (cur[k] == null || typeof cur[k] !== 'object') cur[k] = {}
    cur = cur[k]
  }
  cur[parts[parts.length - 1]] = value
}

// ─── main ───────────────────────────────────────────────────────────────────

const enRaw = loadJson(EN_PATH)
const enKeys = new Set(collectKeys(enRaw))
console.log(`✓ en.json — ${enKeys.size} canonical keys`)

const localeFiles = fs
  .readdirSync(MESSAGES_DIR)
  .filter((f) => f.endsWith('.json') && f !== 'en.json')
  .sort()

let totalMissing = 0
let totalUnused = 0
let totalParseErrors = 0
const summary = []

for (const file of localeFiles) {
  const fullPath = path.join(MESSAGES_DIR, file)
  const lang = path.basename(file, '.json')
  let locale
  try {
    locale = JSON.parse(fs.readFileSync(fullPath, 'utf8'))
  } catch (err) {
    console.error(`✗ ${file}: JSON parse error — ${err.message}`)
    totalParseErrors++
    summary.push({ lang, missing: 0, unused: 0, error: true })
    continue
  }

  const localeKeys = new Set(collectKeys(locale))
  const missing = [...enKeys].filter((k) => !localeKeys.has(k))
  const unused = [...localeKeys].filter((k) => !enKeys.has(k))

  if (missing.length === 0 && unused.length === 0) {
    console.log(`✓ ${lang}.json — ${localeKeys.size} keys, complete`)
    summary.push({ lang, missing: 0, unused: 0 })
    continue
  }

  if (missing.length > 0) {
    console.log(`✗ ${lang}.json — ${missing.length} missing key(s):`)
    missing.slice(0, 8).forEach((k) => console.log(`    - ${k}`))
    if (missing.length > 8) console.log(`    … and ${missing.length - 8} more`)

    if (FILL_MODE) {
      // Fill missing keys with English values (preserves structure)
      for (const k of missing) {
        const enValue = getPath(enRaw, k)
        setPath(locale, k, enValue)
      }
      fs.writeFileSync(fullPath, JSON.stringify(locale, null, 2) + '\n', 'utf8')
      console.log(`  ↳ filled ${missing.length} key(s) with English fallbacks`)
    }
    totalMissing += missing.length
  }

  if (unused.length > 0) {
    console.log(`⚠ ${lang}.json — ${unused.length} unused key(s) not in en.json:`)
    unused.slice(0, 5).forEach((k) => console.log(`    - ${k}`))
    if (unused.length > 5) console.log(`    … and ${unused.length - 5} more`)
    totalUnused += unused.length
  }

  summary.push({ lang, missing: missing.length, unused: unused.length })
}

console.log('')
console.log('─── i18n summary ────────────────────────────')
console.log(
  'Locale | Missing | Unused\n' +
    '-------+---------+--------\n' +
    summary
      .map((s) => `${s.lang.padEnd(6)} | ${String(s.missing).padStart(7)} | ${String(s.unused).padStart(7)}`)
      .join('\n')
)
console.log('')
console.log(`Total missing keys: ${totalMissing}`)
console.log(`Total unused keys:  ${totalUnused}`)
console.log(`Parse errors:       ${totalParseErrors}`)

if (CHECK_MODE) {
  if (totalMissing > 0 || totalParseErrors > 0) {
    console.error('\n✗ i18n check FAILED — missing keys or parse errors present.')
    console.error('  Run `node scripts/i18n-sync.mjs --fill` to fill missing keys with English fallbacks.')
    process.exit(1)
  }
  console.log('\n✓ i18n check passed.')
}
