import { readFileSync } from 'node:fs'
import { ESLint } from 'eslint'

const files = readFileSync(0, 'utf8')
  .split(/\r?\n/)
  .map((file) => file.trim())
  .filter(Boolean)

if (files.length === 0) process.exit(0)

try {
  const eslint = new ESLint()
  const results = await eslint.lintFiles(files)
  const formatter = await eslint.loadFormatter('stylish')
  const output = formatter.format(results)
  if (output) process.stdout.write(output)
  process.exitCode = results.some((result) => result.errorCount > 0) ? 1 : 0
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}
