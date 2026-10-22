#!/usr/bin/env node
// Compiler acceptance for the actual 3D source, not a complete Next build,
// deployed artifact, browser upload or real-model/field accuracy check.
import assert from 'node:assert/strict'
import path from 'node:path'
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import ts from 'typescript'

const require = createRequire(import.meta.url)
const nextWebpack = require('next/dist/compiled/webpack/webpack')
nextWebpack.init()
const directory = path.resolve('.cache/model-parser-webpack')
const reportPath = path.resolve('test-results/runtime-database/model-webpack.json')
const inputs = ['src/lib/parsers/parse3D.ts', 'src/lib/parsers/types.ts', 'package-lock.json']
const hash = data => createHash('sha256').update(data).digest('hex')
const hashes = () => Object.fromEntries(inputs.map(file => [file, hash(readFileSync(file))]))
const report = {
  synthetic: true, scope: 'Next Webpack source compiler and original synthetic model fixtures',
  productionChanged: false, compiler: 'Next bundled Webpack', webpackVersion: nextWebpack.webpack.version,
  target: 'node20', hostNode: process.version, startedAt: new Date().toISOString(),
  sourceHashes: hashes(), checks: [], assets: [], status: 'running',
}
const check = (name, condition) => { assert.ok(condition, name); report.checks.push(name) }
const fixtureFile = (name, content) => new File([content], name)

try {
  mkdirSync(directory, { recursive: true })
  // .js keeps the application's extensionless TS import resolution. Strict
  // .mjs resolution would introduce a probe-only failure for './types'.
  for (const name of ['parse3D', 'types']) {
    writeFileSync(path.join(directory, name + '.js'), ts.transpileModule(readFileSync(`src/lib/parsers/${name}.ts`, 'utf8'), {
      compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext },
    }).outputText)
  }
  const compiler = nextWebpack.webpack({
    mode: 'production', target: 'node20', cache: false,
    entry: path.join(directory, 'parse3D.js'), resolve: { extensions: ['.js', '.json'] },
    optimization: { minimize: false },
    output: { path: directory, filename: 'parser.cjs', library: { type: 'commonjs2' } },
  })
  const stats = await new Promise((resolve, reject) => {
    compiler.run((error, result) => compiler.close(closeError => {
      if (error || closeError) reject(error || closeError)
      else if (!result || result.hasErrors()) reject(new Error(result?.toString({ all: false, errors: true }) || 'Compiler returned no statistics'))
      else resolve(result)
    }))
  })
  const moduleNames = [...stats.compilation.modules].map(module => module.nameForCondition?.()).filter(Boolean)
  check('native GLTFLoader is present in the compiled graph', moduleNames.some(name => name.replaceAll('\\', '/').endsWith('three/examples/jsm/loaders/GLTFLoader.js')))
  check('higher-level file router is absent from the compiled graph', !moduleNames.some(name => /[/\\]fileRouter\.[jt]s$/.test(name)))
  report.assets = stats.compilation.getAssets().map(asset => {
    const file = path.resolve(directory, asset.name)
    assert.ok(file.startsWith(directory + path.sep), 'Compiler assets must stay in the owned cache directory')
    return { file: asset.name, sha256: hash(readFileSync(file)) }
  })
  const { parseOBJFile, parseGLTFFile } = require(path.join(directory, 'parser.cjs'))
  const savedFetch = globalThis.fetch
  const requests = []
  globalThis.fetch = async request => { requests.push(String(request?.url ?? request)); throw new Error('Compiler verification forbids resource requests') }
  try {
    const obj = await parseOBJFile(fixtureFile('synthetic-model.obj', 'v 1.25 2 3\nv -4 8.125 9\n'))
    assert.deepEqual(obj.errors, [])
    check('compiled OBJ retains observed component bounds', /X: -4 to 1.25/.test(obj.extractedText) && /Y: 2 to 8.125/.test(obj.extractedText))
    check('compiled OBJ invents no building or confidence', obj.building === undefined && obj.confidence === 0)
    const invalid = await parseOBJFile(fixtureFile('invalid.obj', 'v 1oops 2 3'))
    check('compiled OBJ rejects partial numeric tokens', invalid.errors.length > 0 && invalid.building === undefined)

    const binary = Buffer.alloc(36)
    ;[1, 2, 3, 4, 5, 6, -1, 8, 2].forEach((value, i) => binary.writeFloatLE(value, i * 4))
    const document = {
      asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0, translation: [10, 20, 30] }],
      meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
      accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [-1, 2, 2], max: [4, 8, 6] }],
      bufferViews: [{ buffer: 0, byteLength: 36 }],
      buffers: [{ byteLength: 36, uri: 'data:application/octet-stream;base64,' + binary.toString('base64') }],
    }
    const gltf = await parseGLTFFile(fixtureFile('synthetic-triangle.gltf', JSON.stringify(document)))
    assert.deepEqual(gltf.errors, [], JSON.stringify(gltf))
    check('compiled native glTF applies scene transforms', /X: 9 to 14/.test(gltf.extractedText) && /Y: 22 to 28/.test(gltf.extractedText) && /Z: 32 to 36/.test(gltf.extractedText))
    check('compiled native glTF invents no building or confidence', gltf.building === undefined && gltf.confidence === 0)

    delete document.buffers[0].uri
    const json = Buffer.from(JSON.stringify(document)), jsonLength = Math.ceil(json.length / 4) * 4
    const glb = Buffer.alloc(12 + 8 + jsonLength + 8 + binary.length)
    glb.writeUInt32LE(0x46546c67, 0); glb.writeUInt32LE(2, 4); glb.writeUInt32LE(glb.length, 8)
    glb.writeUInt32LE(jsonLength, 12); glb.writeUInt32LE(0x4e4f534a, 16)
    glb.fill(0x20, 20, 20 + jsonLength); json.copy(glb, 20)
    glb.writeUInt32LE(binary.length, 20 + jsonLength); glb.writeUInt32LE(0x004e4942, 24 + jsonLength); binary.copy(glb, 28 + jsonLength)
    const parsedGlb = await parseGLTFFile(fixtureFile('synthetic-triangle.glb', glb))
    assert.deepEqual(parsedGlb.errors, [], JSON.stringify(parsedGlb))
    check('compiled native GLB retains binary geometry transforms', /X: 9 to 14/.test(parsedGlb.extractedText) && parsedGlb.building === undefined)

    // A null count is safe even against a regression; do not allocate a huge
    // declared array merely to check the compiled pre-decoding validation.
    const invalidCount = { ...document, accessors: document.accessors.map(accessor => ({ ...accessor, count: null })) }
    const invalidAccessor = await parseGLTFFile(fixtureFile('invalid-accessor.gltf', JSON.stringify(invalidCount)))
    check('compiled parser validates accessor declarations before decoding', /invalid glTF accessor/i.test(invalidAccessor.errors.join(' ')) && invalidAccessor.extractedText === undefined)

    document.buffers[0].uri = 'http://127.0.0.1/private-synthetic-only.bin'
    const external = await parseGLTFFile(fixtureFile('external.gltf', JSON.stringify(document)))
    check('compiled parser rejects external model resources', external.errors.length > 0 && /self-contained|external/.test(external.errors.join(' ')))
    check('all compiled fixtures complete without a resource fetch', requests.length === 0)
  } finally { globalThis.fetch = savedFetch }
  assert.deepEqual(hashes(), report.sourceHashes, 'Source and lockfile must not change during compiler verification')
  report.status = 'passed'
} catch (error) {
  report.status = 'failed'
  report.error = error instanceof Error ? error.message : String(error)
  process.exitCode = 1
} finally {
  report.finishedAt = new Date().toISOString()
  mkdirSync(path.dirname(reportPath), { recursive: true })
  writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify({ status: report.status, checks: report.checks.length, report: 'test-results/runtime-database/model-webpack.json', ...(report.error ? { error: report.error } : {}) }))
}
