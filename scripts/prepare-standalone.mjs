import { cpSync, existsSync, mkdirSync, rmSync, lstatSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { standalonePaths, copyStandaloneStaticAssets, assertBuildDestination, assertNoBundledEnvironmentFiles, removeBundledEnvironmentFiles } from './standalone-paths.mjs'

const rootDir = process.cwd()
const {standalone:standaloneDir}=standalonePaths(rootDir,process.env.METARDU_NEXT_DIST_DIR||'.next')

if (!existsSync(standaloneDir)) {
  console.log('[prepare-standalone] standalone output missing, skipping asset copy')
  process.exit(0)
}

const removedEnvironmentFiles = removeBundledEnvironmentFiles(standaloneDir)
if (removedEnvironmentFiles.length) {
  console.log(`[prepare-standalone] removed ${removedEnvironmentFiles.length} generated environment file(s) from standalone output`)
}
assertNoBundledEnvironmentFiles(standaloneDir)
copyStandaloneStaticAssets(rootDir,process.env.METARDU_NEXT_DIST_DIR||'.next')
console.log('[prepare-standalone] copied static assets into the selected standalone runtime directory')

const publicSource = path.join(rootDir, 'public')
const publicTarget = path.join(standaloneDir, 'public')

if (existsSync(publicSource)) {
  assertBuildDestination(rootDir,publicTarget)
  if (existsSync(publicTarget)) {
    rmSync(publicTarget, { recursive: true, force: true })
  }
  cpSync(publicSource, publicTarget, { recursive: true })
  console.log('[prepare-standalone] copied public into standalone output')
}

// Runtime secrets are loaded by the source launcher or injected by the host.
// Never copy dotenv files into a portable deployment artifact.

// Next's output tracing may include the canvas package without its dynamically
// loaded .node binding. Copy the complete installed package into standalone so
// the Linux runtime image receives the binary built in its matching builder.
const nmSource = path.join(rootDir, 'node_modules')
const nmTarget = path.join(standaloneDir, 'node_modules')
assertBuildDestination(rootDir,nmTarget)
if(!existsSync(nmTarget))throw new Error('[prepare-standalone] traced runtime dependencies are missing; rebuild standalone output')

// Keep PDFKit external and attest the built-in metrics in the packaged tree.
// Its default font is opened during document construction, before custom fonts.
const standaloneRequire=createRequire(path.join(standaloneDir,'package.json'))
const pdfkitEntry=standaloneRequire.resolve('pdfkit')
const fontMetrics=path.join(path.dirname(pdfkitEntry),'data','Helvetica.afm')
if(!existsSync(fontMetrics))throw new Error('[prepare-standalone] PDFKit built-in font metrics were not traced into the runtime')
const PackagedPdfDocument=standaloneRequire('pdfkit')
const packagedPdf=new PackagedPdfDocument()
packagedPdf.resume();packagedPdf.text('METARDU packaged PDF engine verification');packagedPdf.end()
console.log('[prepare-standalone] verified packaged PDFKit module and built-in font metrics')

const nativeRuntimePackages = [
  { name: 'canvas', binding: path.join('build', 'Release', 'canvas.node') },
]
for (const nativePackage of nativeRuntimePackages) {
  const source = path.join(nmSource, nativePackage.name)
  const target = path.join(nmTarget, nativePackage.name)
  assertBuildDestination(rootDir,target)
  if (!existsSync(source) || !existsSync(nmTarget)) continue
  try {
    if (lstatSync(nmTarget).isSymbolicLink()) continue
    if (existsSync(target)) rmSync(target, { recursive: true, force: true })
    cpSync(source, target, { recursive: true })
    if (!existsSync(path.join(target, nativePackage.binding))) {
      console.warn(`[prepare-standalone] ${nativePackage.name} native binding is missing from the build environment`)
    } else {
      console.log(`[prepare-standalone] copied ${nativePackage.name} package and native binding`)
    }
  } catch (e) {
    console.warn(`[prepare-standalone] could not copy ${nativePackage.name} native package:`, e.message)
  }
}

// PDF.js selects @napi-rs/canvas dynamically in Node; tracing its JS entrypoint
// does not reliably include that package or its platform-specific Skia binary.
// Load the installed binding to select only this build platform's dependency.
if (existsSync(nmTarget) && !lstatSync(nmTarget).isSymbolicLink()) {
  const require = createRequire(import.meta.url)
  const napiCanvas = require('@napi-rs/canvas')
  for (const constructor of ['DOMMatrix', 'ImageData', 'Path2D']) {
    if (typeof napiCanvas[constructor] !== 'function') {
      throw new Error(`[prepare-standalone] PDF.js runtime is missing ${constructor}`)
    }
  }
  const canvasMetadata = JSON.parse(readFileSync(require.resolve('@napi-rs/canvas/package.json'), 'utf8'))
  const loadedBindings = Object.keys(require.cache).filter(filename => filename.endsWith('.node'))
  const selectedPackages = Object.keys(canvasMetadata.optionalDependencies || {}).filter(name =>
    /^@napi-rs\/canvas-[a-z0-9-]+$/.test(name)
    && loadedBindings.some(filename => filename.startsWith(path.resolve(nmSource, name) + path.sep)),
  )
  const localBinding = loadedBindings.some(filename => filename.startsWith(path.resolve(nmSource, '@napi-rs/canvas') + path.sep))
  if (!selectedPackages.length && !localBinding) {
    throw new Error('[prepare-standalone] PDF.js native canvas binding could not be identified')
  }
  for (const name of ['@napi-rs/canvas', ...selectedPackages]) {
    const source = path.join(nmSource, name)
    const target = path.join(nmTarget, name)
    assertBuildDestination(rootDir,target)
    mkdirSync(path.dirname(target), { recursive: true })
    cpSync(source, target, { recursive: true })
    console.log(`[prepare-standalone] copied PDF.js native runtime ${name}`)
  }
}

// Sharp reads this dynamically for codec provenance. The native library was
// traced correctly in the previous package, but its versions.json was omitted.
const require=createRequire(import.meta.url)
require('sharp')
for(const file of Object.keys(require.cache).filter(file=>file.endsWith(path.sep+'versions.json')&&file.startsWith(path.join(nmSource,'@img')+path.sep))){
  const target=path.join(nmTarget,path.relative(nmSource,file))
  assertBuildDestination(rootDir,target)
  mkdirSync(path.dirname(target),{recursive:true});cpSync(file,target)
  console.log('[prepare-standalone] copied Sharp codec version metadata')
}
