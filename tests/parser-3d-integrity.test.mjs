// Real parser source, real Three.js/GLTFLoader, synthetic self-contained models.
// No app imports, credentials, database, browser storage or external requests.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

const imports = []
let nativeParses = 0
class ObservedGLTFLoader extends GLTFLoader {
  parse(...args) { nativeParses++; return super.parse(...args) }
}
function loadSource(file) {
  const source = fs.readFileSync(file, 'utf8')
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
  const module = { exports: {} }
  vm.runInThisContext('(function(exports,require){' + compiled + '\n})', { filename: file })(module.exports, name => {
    imports.push(name)
    if (name === 'three') return THREE
    if (name === 'three/examples/jsm/loaders/GLTFLoader.js') return { GLTFLoader: ObservedGLTFLoader }
    if (name === './types') return parserTypes
    if (name === './fileRouter') {
      // Baseline compatibility only: evaluate the actual scoring declaration
      // while excluding the unrelated higher-level parser dependencies.
      const router = ts.createSourceFile('fileRouter.ts', fs.readFileSync('src/lib/parsers/fileRouter.ts', 'utf8'), ts.ScriptTarget.Latest, true)
      const fn = router.statements.find(s => ts.isFunctionDeclaration(s) && s.name?.text === 'calculateConfidence')
      const output = { exports: {} }
      const js = ts.transpileModule(fn.getText(router), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
      vm.runInThisContext('(function(exports){' + js + '\n})')(output.exports)
      return output.exports
    }
    throw Error('Unexpected parser dependency: ' + name)
  })
  return module.exports
}
const parserTypes = loadSource('src/lib/parsers/types.ts')
const { parseOBJFile, parseGLTFFile } = loadSource('src/lib/parsers/parse3D.ts')
const { summarizeParsedInput } = loadSource('src/lib/parsers/uploadSummary.ts')
function file(name, content) {
  const bytes = typeof content === 'string' ? new TextEncoder().encode(content) : content
  return { name, size: bytes.length, lastModified: 17, text: async () => new TextDecoder().decode(bytes), arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) }
}
function model({ uri, translation = [10, 20, 30] } = {}) {
  const buffer = Buffer.alloc(36)
  ;[1, 2, 3, 4, 5, 6, -1, 8, 2].forEach((value, i) => buffer.writeFloatLE(value, i * 4))
  const document = { asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0, translation }], meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }], accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [-1, 2, 2], max: [4, 8, 6] }], bufferViews: [{ buffer: 0, byteLength: buffer.length }], buffers: [{ byteLength: buffer.length, uri: uri ?? 'data:application/octet-stream;base64,' + buffer.toString('base64') }] }
  return { document, buffer }
}
function glb(document, binary) {
  const json = Buffer.from(JSON.stringify(document))
  const jsonLength = Math.ceil(json.length / 4) * 4
  const data = Buffer.alloc(12 + 8 + jsonLength + 8 + binary.length)
  data.writeUInt32LE(0x46546c67, 0); data.writeUInt32LE(2, 4); data.writeUInt32LE(data.length, 8)
  data.writeUInt32LE(jsonLength, 12); data.writeUInt32LE(0x4e4f534a, 16)
  data.fill(0x20, 20, 20 + jsonLength); json.copy(data, 20)
  data.writeUInt32LE(binary.length, 20 + jsonLength); data.writeUInt32LE(0x004e4942, 24 + jsonLength); binary.copy(data, 28 + jsonLength)
  return data
}
function instancedModel(vertexCount = 3, instanceCount = 2) {
  const { document } = model({ translation: [10, 20, 30] })
  const positions = Buffer.alloc(vertexCount * 12)
  for (let i = 0; i < vertexCount; i++) [1, 2, 3].forEach((v, axis) => positions.writeFloatLE(v, i * 12 + axis * 4))
  const translations = Buffer.alloc(instanceCount * 12)
  if (instanceCount === 2) translations.writeFloatLE(100, 12)
  const combined = Buffer.concat([positions, translations])
  document.buffers = [{ uri: 'data:application/octet-stream;base64,' + combined.toString('base64'), byteLength: combined.length }]
  document.bufferViews = [{ buffer: 0, byteLength: positions.length }, { buffer: 0, byteOffset: positions.length, byteLength: translations.length }]
  document.accessors = [{ bufferView: 0, componentType: 5126, count: vertexCount, type: 'VEC3', min: [1, 2, 3], max: [1, 2, 3] }, { bufferView: 1, componentType: 5126, count: instanceCount, type: 'VEC3' }]
  document.extensionsUsed = document.extensionsRequired = ['EXT_mesh_gpu_instancing']
  document.nodes[0].extensions = { EXT_mesh_gpu_instancing: { attributes: { TRANSLATION: 1 } } }
  return document
}
async function withoutFetch(operation) {
  const saved = globalThis.fetch
  const attempts = []
  globalThis.fetch = async request => { attempts.push(String(request?.url ?? request)); throw Error('No fetch permitted in this isolated parser test') }
  try { const result = await operation(); assert.deepEqual(attempts, [], 'Model must be decoded without fetching any resource'); return result }
  finally { globalThis.fetch = saved }
}
for (const content of ['', '# no vertices', 'v NaN 2 3', 'v Infinity 2 3', 'v 1oops 2 3', 'v 1 2', 'v 1e309 2 3']) test(`OBJ rejects invalid source without invented output: ${content || 'empty'}`, async () => {
  const result = await parseOBJFile(file('invalid.obj', content))
  assert.ok(result.errors.length > 0)
  assert.equal(result.building, undefined)
  assert.equal(summarizeParsedInput(result).success, false)
})
test('OBJ preserves finite source-space coordinates without inventing units, floors or confidence', async () => {
  const result = await parseOBJFile(file('site.obj', '# local model\nv 1.25 2 3\nv -4 8.125 9\n'))
  assert.deepEqual(result.errors, [])
  assert.equal(result.building, undefined)
  assert.equal(result.confidence, 0)
  assert.match(result.extractedText, /Vertices: 2/)
  assert.match(result.extractedText, /X: -4.*1.25/)
  assert.match(result.extractedText, /Y: 2.*8.125/)
  assert.match(result.extractedText, /Z: 3.*9/)
  assert.match(result.extractedText, /units.*unknown/i)
  assert.equal(summarizeParsedInput(result).hasBuilding, false)
})
test('large finite OBJ extents do not allocate invented floors', async () => {
  const result = await parseOBJFile(file('large.obj', 'v 0 0 0\nv 1 300000 1'))
  assert.deepEqual(result.errors, [])
  assert.equal(result.building, undefined)
  assert.match(result.extractedText, /300000/)
})
test('native self-contained glTF reports observed transformed XYZ bounds without semantic buildings', async () => {
  const { document } = model()
  const result = await withoutFetch(() => parseGLTFFile(file('triangle.gltf', JSON.stringify(document))))
  assert.deepEqual(result.errors, [], JSON.stringify(result))
  assert.equal(result.building, undefined)
  assert.equal(result.confidence, 0)
  assert.match(result.extractedText, /Meshes: 1/)
  assert.match(result.extractedText, /X: 9.*14/)
  assert.match(result.extractedText, /Y: 22.*28/)
  assert.match(result.extractedText, /Z: 32.*36/)
  assert.match(result.warnings.join(' '), /survey control|set-out/i)
})
test('native GLB binary geometry follows the same model-space inventory path', async () => {
  const { document, buffer } = model()
  delete document.buffers[0].uri
  const result = await withoutFetch(() => parseGLTFFile(file('triangle.glb', glb(document, buffer))))
  assert.deepEqual(result.errors, [], JSON.stringify(result))
  assert.equal(result.building, undefined)
  assert.match(result.extractedText, /X: 9.*14/)
})
for (const [mode, label] of [[0, 'Point sets: 1'], [3, 'Line sets: 1']]) test(`native self-contained glTF inventories non-mesh geometry: ${label}`, async () => {
  const { document } = model()
  document.meshes[0].primitives[0].mode = mode
  const result = await withoutFetch(() => parseGLTFFile(file('geometry.gltf', JSON.stringify(document))))
  assert.deepEqual(result.errors, [], JSON.stringify(result))
  assert.match(result.extractedText, new RegExp(label))
  assert.match(result.extractedText, /X: 9.*14/)
  assert.equal(result.building, undefined)
})
test('empty native glTF scene is not reported as a measured building', async () => {
  const result = await parseGLTFFile(file('empty.gltf', JSON.stringify({ asset: { version: '2.0' }, scenes: [{ nodes: [] }], scene: 0, nodes: [] })))
  assert.ok(result.errors.length > 0)
  assert.equal(result.building, undefined)
})
for (const uri of ['http://127.0.0.1/private.bin', 'https://invalid.invalid/model.bin', 'file:///private.bin', '../buffer.bin']) test(`glTF rejects external resource before fetch: ${uri}`, async () => {
  const result = await withoutFetch(() => parseGLTFFile(file('external.gltf', JSON.stringify(model({ uri }).document))))
  assert.ok(result.errors.length > 0)
  assert.match(result.errors.join(' '), /self-contained|external|embedded/i)
  assert.equal(result.building, undefined)
})
test('3D parser does not load the higher-level file router', () => assert.equal(imports.includes('./fileRouter'), false))

for (const [property, values] of [['translation', [null, 20, 30]], ['scale', [1, 1, null]], ['matrix', [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, null, 0, 0, 1]]]) test(`glTF rejects null ${property} components rather than coercing them to zero`, async () => {
  const { document } = model()
  delete document.nodes[0].translation
  document.nodes[0][property] = values
  const result = await withoutFetch(() => parseGLTFFile(file('invalid-transform.gltf', JSON.stringify(document))))
  assert.ok(result.errors.length > 0)
  assert.equal(result.extractedText, undefined)
})
test('native geometry with a non-finite position does not produce inventory bounds', async () => {
  const { document, buffer } = model()
  buffer.writeFloatLE(NaN, 0)
  document.buffers[0].uri = 'data:application/octet-stream;base64,' + buffer.toString('base64')
  const result = await withoutFetch(() => parseGLTFFile(file('nan.gltf', JSON.stringify(document))))
  assert.ok(result.errors.length > 0)
  assert.equal(result.extractedText, undefined)
})
test('glTF refuses external image resources even when geometry is embedded', async () => {
  const { document } = model()
  document.images = [{ uri: 'http://127.0.0.1/private.png' }]
  const result = await withoutFetch(() => parseGLTFFile(file('image.gltf', JSON.stringify(document))))
  assert.ok(result.errors.length > 0)
})
test('native inventory accepts embedded geometry with texture data without decoding appearance', async () => {
  const { document } = model()
  document.images = [{ uri: 'data:image/png;base64,aW52ZW50b3J5LW9ubHk=' }]
  document.textures = [{ source: 0 }]
  document.materials = [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }]
  document.meshes[0].primitives[0].material = 0
  const result = await withoutFetch(() => parseGLTFFile(file('textured.gltf', JSON.stringify(document))))
  assert.deepEqual(result.errors, [], JSON.stringify(result))
  assert.match(result.warnings.join(' '), /material rendering.*not performed/i)
})
test('truncated GLB never produces a successful summary', async () => {
  const { document, buffer } = model()
  delete document.buffers[0].uri
  const bytes = glb(document, buffer).subarray(0, -4)
  const result = await withoutFetch(() => parseGLTFFile(file('truncated.glb', bytes)))
  assert.equal(summarizeParsedInput(result).success, false)
})
test('native glTF inventory applies every instance transform to observed geometry', async () => {
  const result = await withoutFetch(() => parseGLTFFile(file('instances.gltf', JSON.stringify(instancedModel()))))
  assert.deepEqual(result.errors, [], JSON.stringify(result))
  assert.match(result.extractedText, /X: 11.*111/)
  assert.match(result.extractedText, /Position samples.*6/)
})
test('compact instancing cannot multiply position processing beyond the explicit inventory budget', async () => {
  const result = await withoutFetch(() => parseGLTFFile(file('too-many-instances.gltf', JSON.stringify(instancedModel(1000, 10001)))))
  assert.ok(result.errors.length > 0)
  assert.match(result.errors.join(' '), /position.*limit|position.*budget/i)
  assert.equal(result.extractedText, undefined)
})
test('unknown required glTF semantics are rejected instead of silently ignored', async () => {
  const { document } = model()
  document.extensionsRequired = ['UNKNOWN_changes_geometry']
  const result = await withoutFetch(() => parseGLTFFile(file('unsupported.gltf', JSON.stringify(document))))
  assert.ok(result.errors.length > 0)
  assert.match(result.errors.join(' '), /required.*extension/i)
})
test('cyclic glTF node dependencies are rejected before native recursion', { timeout: 1500 }, async () => {
  const { document } = model()
  document.nodes[0].children = [0]
  const before = nativeParses
  const result = await withoutFetch(() => parseGLTFFile(file('cycle.gltf', JSON.stringify(document))))
  assert.equal(nativeParses, before, 'Invalid node cycles must be rejected before native recursion')
  assert.ok(result.errors.length > 0)
  assert.match(result.errors.join(' '), /cycle|cyclic/i)
})
