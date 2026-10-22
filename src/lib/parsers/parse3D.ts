import type { ParsedInput } from './types'
import { MAX_FILE_SIZE, PARSER_VERSION } from './types'
import type { Mesh, Line, Points, Object3D } from 'three'

type Bounds = { min: [number, number, number]; max: [number, number, number] }
const emptyBounds = (): Bounds => ({ min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] })
const numberToken = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/
const MAX_POSITION_SAMPLES = 10_000_000
// Native geometry extensions plus appearance-only extensions (appearance is
// explicitly not decoded). Compressed geometry requires a separate decoder.
const supportedRequiredExtensions = new Set([
  'EXT_mesh_gpu_instancing', 'KHR_mesh_quantization', 'KHR_lights_punctual',
  'KHR_materials_clearcoat', 'KHR_materials_dispersion', 'KHR_materials_ior', 'KHR_materials_sheen',
  'KHR_materials_specular', 'KHR_materials_transmission', 'KHR_materials_iridescence', 'KHR_materials_anisotropy',
  'KHR_materials_unlit', 'KHR_materials_volume', 'KHR_materials_emissive_strength', 'EXT_materials_bump',
  'KHR_texture_basisu', 'KHR_texture_transform', 'EXT_texture_webp', 'EXT_texture_avif',
])
const limitations = 'Model coordinates are not georeferenced survey control or set-out. No floors, walls, project CRS or building semantics are inferred.'

function base(file: File, type: 'GLTF' | 'OBJ'): ParsedInput {
  return { type, sourceFileName: file.name, sourceFileSize: file.size, sourceFileLastModified: file.lastModified,
    parsedAt: new Date().toISOString(), version: PARSER_VERSION, errors: [], warnings: [], confidence: 0 }
}
function checkSize(size: number): void {
  if (!Number.isFinite(size) || size <= 0 || size > MAX_FILE_SIZE) throw new Error('Choose a nonempty model within the 100 MB parser limit.')
}
function extend(bounds: Bounds, coordinates: [number, number, number]): void {
  coordinates.forEach((value, axis) => {
    if (!Number.isFinite(value)) throw new Error('Model positions and transforms must produce finite coordinates.')
    bounds.min[axis] = Math.min(bounds.min[axis], value)
    bounds.max[axis] = Math.max(bounds.max[axis], value)
  })
}
function boundsText(bounds: Bounds): string[] {
  return ['X', 'Y', 'Z'].map((axis, i) => `${axis}: ${bounds.min[i]} to ${bounds.max[i]}`)
}
function failure(result: ParsedInput, error: unknown): ParsedInput {
  return { ...result, errors: [error instanceof Error ? error.message : 'Model parsing failed.'] }
}
function geometryObject(child: Object3D): child is Mesh | Line | Points {
  return ('isMesh' in child && child.isMesh === true) || ('isLine' in child && child.isLine === true) || ('isPoints' in child && child.isPoints === true)
}

/** Inventory source OBJ vertex components; OBJ supplies no project CRS or units. */
export async function parseOBJFile(file: File): Promise<ParsedInput> {
  const result = base(file, 'OBJ')
  try {
    checkSize(file.size)
    const content = await file.text()
    checkSize(new TextEncoder().encode(content).byteLength)
    const bounds = emptyBounds()
    let vertices = 0
    for (const [index, line] of content.split(/\r?\n/).entries()) {
      const parts = line.split('#', 1)[0].trim().split(/\s+/)
      if (parts[0] !== 'v') continue
      if (parts.length < 4 || parts.slice(1).some(token => !numberToken.test(token) || !Number.isFinite(Number(token)))) {
        throw new Error(`Invalid OBJ vertex at line ${index + 1}; complete finite numeric components are required.`)
      }
      extend(bounds, [Number(parts[1]), Number(parts[2]), Number(parts[3])])
      vertices++
    }
    if (vertices === 0) throw new Error('No valid OBJ vertex positions were found.')
    return { ...result, extractedText: [
      'OBJ source vertex inventory', `File: ${file.name}`, `Vertices: ${vertices}`, 'Model units: unknown',
      'Source vertex components (X/Y/Z; no axis or geodetic interpretation applied)', ...boundsText(bounds),
    ].join('\n'), warnings: [limitations, 'OBJ faces, materials, optional vertex weights and colors are not interpreted as building semantics. Units and orientation require an explicit reviewed mapping.'] }
  } catch (error) { return failure(result, error) }
}

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
/** Bound declarations that can allocate arrays before positions are inventoried.
 * This conservative aggregate covers all buffer views/accessors, including
 * unused ones, and per-node instance matrices. It is not a total memory bound.
 */
function checkDeclaredStorage(document: Record<string, unknown>): void {
  const shapes: Record<string, [number, number]> = { SCALAR: [1, 1], VEC2: [1, 2], VEC3: [1, 3], VEC4: [1, 4], MAT2: [2, 2], MAT3: [3, 3], MAT4: [4, 4] }
  const componentBytes: Record<number, number> = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 }
  if (document.accessors !== undefined && !Array.isArray(document.accessors)) throw new Error('Invalid glTF accessor collection.')
  let storage = 0
  const reserve = (bytes: number) => {
    if (!Number.isSafeInteger(bytes) || bytes < 0 || storage + bytes > MAX_FILE_SIZE) {
      throw new Error('Declared glTF buffer-view, accessor and instance storage exceeds the 100 MiB inventory storage budget. Reduce the model before importing.')
    }
    storage += bytes
  }
  if (document.bufferViews !== undefined && !Array.isArray(document.bufferViews)) throw new Error('Invalid glTF buffer-view collection.')
  for (const view of (document.bufferViews ?? []) as unknown[]) {
    if (!object(view) || typeof view.byteLength !== 'number' || !Number.isSafeInteger(view.byteLength) || view.byteLength < 1
      || view.byteOffset !== undefined && (typeof view.byteOffset !== 'number' || !Number.isSafeInteger(view.byteOffset) || view.byteOffset < 0)) throw new Error('Invalid glTF buffer-view length or offset.')
    // GLTFLoader slices a new ArrayBuffer for each distinct loaded view.
    reserve(view.byteLength)
  }
  const accessors = ((document.accessors ?? []) as unknown[]).map(accessor => {
    if (!object(accessor) || typeof accessor.count !== 'number' || !Number.isSafeInteger(accessor.count) || accessor.count < 1
      || typeof accessor.type !== 'string' || !Object.hasOwn(shapes, accessor.type)
      || typeof accessor.componentType !== 'number' || !Object.hasOwn(componentBytes, accessor.componentType)) throw new Error('Invalid glTF accessor count, shape or component type.')
    const [columns, rows] = shapes[accessor.type], width = componentBytes[accessor.componentType]
    // Matrix columns have 4-byte alignment in glTF buffer storage.
    const stride = columns === 1 ? rows * width : columns * Math.ceil(rows * width / 4) * 4
    const bytes = accessor.count * stride
    reserve(bytes)
    if (accessor.normalized === true) reserve(accessor.count * columns * rows * 4)
    if (accessor.sparse !== undefined) {
      if (!object(accessor.sparse) || typeof accessor.sparse.count !== 'number' || !Number.isSafeInteger(accessor.sparse.count)
        || accessor.sparse.count < 1 || accessor.sparse.count > accessor.count) throw new Error('Invalid glTF sparse accessor count.')
      // Sparse expansion may copy a complete buffer-backed accessor.
      if (accessor.bufferView !== undefined) reserve(bytes)
    }
    return { count: accessor.count }
  })
  for (const node of (document.nodes ?? []) as Record<string, unknown>[]) {
    if (!object(node.extensions) || node.extensions.EXT_mesh_gpu_instancing === undefined) continue
    const instance = node.extensions.EXT_mesh_gpu_instancing
    if (!object(instance) || !object(instance.attributes) || Object.keys(instance.attributes).length === 0) throw new Error('Invalid glTF instancing accessor attributes.')
    let count: number | undefined
    for (const reference of Object.values(instance.attributes)) {
      if (typeof reference !== 'number' || !Number.isSafeInteger(reference) || reference < 0 || !accessors[reference]) throw new Error('Invalid glTF instancing accessor reference.')
      const next = accessors[reference].count
      if (count !== undefined && next !== count) throw new Error('Invalid glTF instancing accessor counts; all instance attributes must agree.')
      count = next
    }
    const mesh: unknown = Array.isArray(document.meshes) && typeof node.mesh === 'number' && Number.isSafeInteger(node.mesh) ? document.meshes[node.mesh] : undefined
    if (!object(mesh) || !Array.isArray(mesh.primitives) || mesh.primitives.length === 0) throw new Error('Invalid glTF instancing mesh primitives.')
    // The native extension constructs one Float32 instance matrix per primitive.
    reserve((count ?? 0) * 16 * 4 * mesh.primitives.length)
  }
}
/** Inspect JSON/GLB resource policy before the native loader can load anything. */
function gltfDocument(data: ArrayBuffer): Record<string, unknown> {
  const view = new DataView(data)
  let json: string
  const decoder = new TextDecoder('utf-8', { fatal: true })
  if (data.byteLength >= 4 && view.getUint32(0, true) === 0x46546c67) {
    if (data.byteLength < 20 || view.getUint32(4, true) !== 2 || view.getUint32(8, true) !== data.byteLength) throw new Error('Invalid GLB version or declared container length.')
    const length = view.getUint32(12, true)
    if (view.getUint32(16, true) !== 0x4e4f534a || length % 4 !== 0 || length > data.byteLength - 20) throw new Error('Invalid GLB JSON chunk.')
    let offset = 20 + length
    while (offset < data.byteLength) {
      if (offset + 8 > data.byteLength) throw new Error('Truncated GLB chunk header.')
      const chunkLength = view.getUint32(offset, true)
      if (chunkLength % 4 !== 0 || chunkLength > data.byteLength - offset - 8 || view.getUint32(offset + 4, true) === 0x4e4f534a) throw new Error('Invalid or duplicate GLB chunk.')
      offset += 8 + chunkLength
    }
    json = decoder.decode(new Uint8Array(data, 20, length))
  } else json = decoder.decode(data)
  const document: unknown = JSON.parse(json)
  if (!object(document)) throw new Error('Expected a glTF JSON object.')
  if (document.extensionsRequired !== undefined && (!Array.isArray(document.extensionsRequired)
    || document.extensionsRequired.some(name => typeof name !== 'string' || !supportedRequiredExtensions.has(name)))) {
    throw new Error('The model requires an unsupported required glTF extension; no geometry was inferred. Export supported uncompressed geometry for this inventory.')
  }
  if (document.nodes !== undefined && !Array.isArray(document.nodes)) throw new Error('Invalid glTF nodes collection.')
  const nodes = (document.nodes ?? []) as unknown[]
  const children: number[][] = []
  const incoming = new Uint32Array(nodes.length)
  for (const node of nodes) {
    if (!object(node)) throw new Error('Invalid glTF node.')
    for (const [key, length] of [['translation', 3], ['scale', 3], ['rotation', 4], ['matrix', 16]] as const) {
      const values = node[key]
      if (values !== undefined && (!Array.isArray(values) || values.length !== length || values.some(value => typeof value !== 'number' || !Number.isFinite(value)))) {
        throw new Error(`glTF node ${key} requires ${length} finite numeric components.`)
      }
    }
    if (node.children !== undefined && (!Array.isArray(node.children)
      || node.children.some(index => !Number.isInteger(index) || index < 0 || index >= nodes.length))) throw new Error('Invalid glTF child node reference.')
    const refs = (node.children ?? []) as number[]
    for (const child of refs) {
      incoming[child]++
      if (incoming[child] > 1) throw new Error('glTF node hierarchy must not have multiple parents.')
    }
    children.push(refs)
  }
  const queue = nodes.flatMap((_, index) => incoming[index] === 0 ? [index] : [])
  for (let index = 0; index < queue.length; index++) {
    for (const child of children[queue[index]]) { incoming[child]--; if (incoming[child] === 0) queue.push(child) }
  }
  if (queue.length !== nodes.length) throw new Error('Cyclic glTF node hierarchy; no geometry was decoded.')
  for (const key of ['buffers', 'images']) {
    const resources = document[key]
    if (resources !== undefined && !Array.isArray(resources)) throw new Error(`Invalid glTF ${key} collection.`)
    for (const resource of (resources ?? []) as unknown[]) {
      if (!object(resource)) throw new Error(`Invalid glTF ${key} resource.`)
      if (resource.uri !== undefined && (typeof resource.uri !== 'string' || !/^data:/i.test(resource.uri))) {
        throw new Error('Only self-contained glTF/GLB resources are accepted; external references are not fetched.')
      }
    }
  }
  checkDeclaredStorage(document)
  return document
}

/** Decode embedded buffer bytes locally, with no fetch or browser globals. */
function embeddedBuffer(uri: string): ArrayBuffer {
  const match = /^data:application\/(?:octet-stream|gltf-buffer);base64,([A-Za-z0-9+/]*={0,2})$/i.exec(uri)
  if (!match || match[1].length % 4 !== 0 || match[1].length > Math.ceil(MAX_FILE_SIZE / 3) * 4) throw new Error('Expected a bounded embedded base64 glTF buffer.')
  const binary = atob(match[1])
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes.buffer
}

/** Native geometry decoding, reported only as a model-space inventory. */
export async function parseGLTFFile(file: File): Promise<ParsedInput> {
  const result = base(file, 'GLTF')
  try {
    checkSize(file.size)
    const data = await file.arrayBuffer()
    checkSize(data.byteLength)
    gltfDocument(data)
    const THREE = await import('three')
    const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js')
    const manager = new THREE.LoadingManager()
    manager.setURLModifier(() => { throw new Error('External model resources are disabled; upload a self-contained model.') })
    const loader = new GLTFLoader(manager)
    loader.register(parser => {
      // Scoped transport: buffers are embedded bytes, never a network request.
      // This also avoids FileLoader's browser ProgressEvent requirement on Node.
      parser.fileLoader.load = (uri, onLoad, _onProgress, onError) => {
        try { const buffer = embeddedBuffer(uri); queueMicrotask(() => onLoad?.(buffer)) }
        catch (error) { queueMicrotask(() => onError?.(error)) }
      }
      // This endpoint inventories geometry, not textures or material appearance.
      return { name: 'METARDU_GEOMETRY_INVENTORY', loadMaterial: async () => new THREE.MeshBasicMaterial() }
    })
    const gltf = await loader.parseAsync(data, '')
    const geometries = new Set<import('three').BufferGeometry>()
    const materials = new Set<import('three').Material>()
    try {
      const bounds = emptyBounds()
      let meshes = 0, lines = 0, points = 0, vertices = 0
      gltf.scene.updateMatrixWorld(true)
      gltf.scene.traverse(child => {
        if (!geometryObject(child)) return
        const mesh = child
        geometries.add(mesh.geometry)
        for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) materials.add(material)
        const position = mesh.geometry.getAttribute('position')
        if (!position || position.itemSize !== 3 || position.count === 0) throw new Error('A model geometry has no valid 3D position attribute.')
        const instanced = 'isInstancedMesh' in mesh && mesh.isInstancedMesh ? mesh as import('three').InstancedMesh : null
        const instanceCount = instanced?.count ?? 1
        const samples = position.count * instanceCount
        if (!Number.isSafeInteger(samples) || samples < 0 || vertices + samples > MAX_POSITION_SAMPLES) throw new Error('Model position processing exceeds the 10,000,000 sample inventory budget. Reduce the model before importing.')
        if ('isMesh' in mesh && mesh.isMesh) meshes++
        else if ('isLine' in mesh && mesh.isLine) lines++
        else points++
        const vertex = new THREE.Vector3()
        const instanceMatrix = new THREE.Matrix4()
        for (let instance = 0; instance < instanceCount; instance++) {
          instanced?.getMatrixAt(instance, instanceMatrix)
          for (let i = 0; i < position.count; i++) {
            if ('isMesh' in mesh && mesh.isMesh) mesh.getVertexPosition(i, vertex)
            else vertex.fromBufferAttribute(position, i)
            if (instanced) vertex.applyMatrix4(instanceMatrix)
            vertex.applyMatrix4(mesh.matrixWorld)
            extend(bounds, [vertex.x, vertex.y, vertex.z])
            vertices++
          }
        }
      })
      if (vertices === 0) throw new Error('No finite geometry positions were found in the selected glTF scene.')
      return { ...result, extractedText: [
        'glTF/GLB geometry inventory', `File: ${file.name}`, `Meshes: ${meshes}`, `Line sets: ${lines}`, `Point sets: ${points}`, `Position samples (geometry instances): ${vertices}`,
        'Model-space convention: meters, Y-up; no project CRS applied',
        'Model bounds (scene transforms applied; current pose)', ...boundsText(bounds),
      ].join('\n'), warnings: [limitations, 'Model-space meters and Y-up are format conventions, not verified site alignment. Texture/material rendering and animation playback are not performed.'] }
    } finally {
      gltf.scenes.forEach(scene => scene.traverse(child => {
        if (!geometryObject(child)) return
        const mesh = child
        geometries.add(mesh.geometry)
        for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) materials.add(material)
      }))
      geometries.forEach(geometry => geometry.dispose())
      materials.forEach(material => material.dispose())
    }
  } catch (error) { return failure(result, error) }
}
