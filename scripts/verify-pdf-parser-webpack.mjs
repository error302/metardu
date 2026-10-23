#!/usr/bin/env node
// Bundle the actual parser with Webpack's Node external-module interop. A plain
// TS unit test misses the createRequire namespace failure in the shipped app.
import assert from 'node:assert/strict'
import path from 'node:path'
import { readFileSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'
import { jsPDF } from 'jspdf'

const runtimeRequire = createRequire(import.meta.url)
const nextWebpack = runtimeRequire('next/dist/compiled/webpack/webpack')
nextWebpack.init()

const directory = path.resolve('.cache/pdf-parser-webpack')
await mkdir(directory, { recursive: true })
const source = readFileSync('src/lib/parsers/parsePDF.ts', 'utf8')
await writeFile(path.join(directory, 'parser.mjs'), ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext },
}).outputText)
const compiler = nextWebpack.webpack({
  mode: 'production', target: 'node22', entry: path.join(directory, 'parser.mjs'),
  optimization: { minimize: false },
  output: { path: directory, filename: 'parser.cjs', library: { type: 'commonjs2' } },
  externals: [({ request }, callback) => {
    if (request?.startsWith('pdfjs-dist')) callback(null, `import ${request}`)
    else callback()
  }],
})
await new Promise((resolve, reject) => {
  compiler.run((error, stats) => {
    compiler.close(closeError => {
      if (error || closeError) reject(error || closeError)
      else if (stats.hasErrors()) reject(new Error(stats.toString({ all: false, errors: true })))
      else resolve()
    })
  })
})
const require = createRequire(pathToFileURL(path.join(directory, 'entry.mjs')))
// fallow-ignore-next-line unresolved-import
const { parsePDFContent } = require('./parser.cjs')
const document = new jsPDF()
document.text('SYNTHETIC METARDU WEBPACK PARSER', 15, 20)
document.text('RL 100.0054 m - synthetic input only', 15, 30)
const parsed = await parsePDFContent(new File([document.output('arraybuffer')], 'synthetic-webpack.pdf', { type: 'application/pdf' }))
assert.deepEqual(parsed.errors, [], 'the actual bundled parser must extract text')
assert.ok(parsed.extractedText.includes('SYNTHETIC METARDU WEBPACK PARSER'))
assert.ok(parsed.extractedText.includes('100.0054'))
assert.equal(parsed.confidence, 0)
assert.equal(parsed.cad, undefined)
assert.equal(parsed.building, undefined)
const result = { synthetic: true, webpack_bundled_parser: true, text_extracted: true, original_decimal_text_preserved: true, no_geometry_or_confidence_invented: true }
await mkdir('test-results/runtime-database', { recursive: true })
await writeFile('test-results/runtime-database/pdf-webpack.json', JSON.stringify(result, null, 2) + '\n')
console.log(JSON.stringify(result))
