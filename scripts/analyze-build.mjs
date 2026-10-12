#!/usr/bin/env node
import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'

const root = process.cwd()
const nextCli = path.join(root, 'node_modules', 'next', 'dist', 'bin', 'next')
if (!existsSync(nextCli)) {
  console.error('[analyze] Next.js is not installed. Run npm ci first.')
  process.exit(1)
}

const env = {
  ...process.env,
  ANALYZE: 'true',
  // Keep the bundle audit from clearing or racing a local development build.
  METARDU_NEXT_DIST_DIR: process.env.METARDU_NEXT_DIST_DIR || '.next-analyze',
}
const build = spawnSync(process.execPath, [nextCli, 'build'], {
  cwd: root,
  env,
  stdio: 'inherit',
})

if (build.error) {
  console.error('[analyze] Could not start the Next.js analyzer build:', build.error.message)
  process.exit(1)
}
if (build.status !== 0) process.exit(build.status ?? 1)

if (process.argv.includes('--report')) {
  const reportScript = path.join(root, 'scripts', 'bundle-analysis-report.mjs')
  const report = spawnSync(process.execPath, [reportScript], {
    cwd: root,
    env,
    stdio: 'inherit',
  })
  if (report.error) {
    console.error('[analyze] Could not generate the bundle summary:', report.error.message)
    process.exit(1)
  }
  process.exit(report.status ?? 1)
}
