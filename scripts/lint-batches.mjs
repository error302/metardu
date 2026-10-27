// Keep the real ESLint configuration and exact file inventory while releasing
// TypeScript programs between bounded, sequential child processes.
import assert from 'node:assert/strict'
import { fork } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const workerPath = fileURLToPath(new URL('./lint-batch-worker.mjs', import.meta.url))
export const eslintOptions = cwd => ({
  cwd, resolvePluginsRelativeTo: projectRoot, useEslintrc: true,
  extensions: ['.ts', '.tsx', '.js', '.mjs'],
})

export function assertBatchCoverage(files, results) {
  assert.ok(Array.isArray(results), 'Lint worker did not return a result array')
  const actual = results.map(row => {
    assert.equal(typeof row.filePath, 'string', 'Lint worker returned an invalid path')
    assert.ok(Array.isArray(row.messages), 'Lint worker omitted its findings')
    assert.equal(row.fatalErrorCount, 0, `Lint could not parse ${row.filePath}`)
    return path.resolve(row.filePath)
  })
  assert.equal(new Set(actual).size, actual.length, 'Lint worker duplicated a file')
  assert.deepEqual([...actual].sort(), files.map(file => path.resolve(file)).sort(), 'Lint worker coverage differs from its assigned files')
}

async function runBatch(files, { cwd, heapMb, timeoutMs }) {
  const child = fork(workerPath, [], {
    cwd, execPath: process.execPath, execArgv: [`--max-old-space-size=${heapMb}`],
    env: { ...process.env, TSESTREE_SINGLE_RUN: 'true' },
    windowsHide: true, stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
  })
  let message, messages = 0, stderr = '', timedOut = false
  child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-8000) })
  child.on('message', value => { message = value; messages++ })
  const timer = setTimeout(() => { timedOut = true; child.kill() }, timeoutMs)
  try {
    const code = await new Promise((resolve, reject) => {
      child.once('error', reject)
      child.once('exit', resolve)
      child.send({ files, cwd }, error => { if (error) reject(error) })
    })
    assert.ok(!timedOut, `Lint worker timed out after ${timeoutMs} ms`)
    assert.equal(code, 0, `Lint worker failed: ${stderr || `exit ${code}`}`)
    assert.equal(messages, 1, 'Lint worker must return exactly one complete result')
    assertBatchCoverage(files, message?.results)
    return message
  } finally {
    clearTimeout(timer)
    if (child.exitCode === null && child.signalCode === null) child.kill()
  }
}

export async function lintFilesInBatches(scope, {
  cwd = process.cwd(), batchSize = 400, heapMb = 3072, timeoutMs = 180000,
  onBatch = () => {},
} = {}) {
  assert.ok(Number.isInteger(batchSize) && batchSize > 0 && batchSize <= 400)
  assert.ok(Number.isInteger(heapMb) && heapMb >= 256 && heapMb <= 3072)
  // This is ESLint 8's own enumeration engine, including ignores, extensions,
  // overlapping-pattern deduplication and unmatched-pattern refusal. Fail on a
  // future major API change rather than substituting a different glob scanner.
  assert.match(require('eslint/package.json').version, /^8\./, 'Review file enumeration when upgrading ESLint')
  const { FileEnumerator, builtinRules } = require('eslint/use-at-your-own-risk')
  const { Legacy: { CascadingConfigArrayFactory } } = require('@eslint/eslintrc')
  const configArrayFactory = new CascadingConfigArrayFactory({
    cwd, resolvePluginsRelativeTo: projectRoot, useEslintrc: true, builtInRules: builtinRules,
    getEslintRecommendedConfig: () => require('@eslint/js').configs.recommended,
    getEslintAllConfig: () => require('@eslint/js').configs.all,
  })
  const entries = [...new FileEnumerator({ ...eslintOptions(cwd), configArrayFactory }).iterateFiles(scope)]
  assert.ok(entries.length, 'Refusing an empty lint inventory')
  const files = entries.map(entry => entry.filePath)
  const groups = new Map()
  for (const entry of entries) {
    const parser = entry.config.extractConfig(entry.filePath).parserOptions
    const key = JSON.stringify([parser.project, parser.tsconfigRootDir])
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(entry.filePath)
  }
  const batches = [...groups.values()].flatMap(group => {
    const chunks = []
    for (let i = 0; i < group.length; i += batchSize) chunks.push(group.slice(i, i + batchSize))
    return chunks
  })
  const results = []
  for (const [index, batch] of batches.entries()) {
    const output = await runBatch(batch, { cwd, heapMb, timeoutMs })
    results.push(...output.results)
    onBatch({ batch: index + 1, batches: batches.length, files: batch.length, completed: results.length, total: files.length, maxRssKb: output.maxRssKb })
  }
  assertBatchCoverage(files, results)
  const byPath = new Map(results.map(row => [row.filePath, row]))
  return files.map(file => byPath.get(file))
}
