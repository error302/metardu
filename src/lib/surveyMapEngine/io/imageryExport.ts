import type { ImageryProvider, ImageryView } from '@/lib/online/satellite'
import { rasterWorldFile, WEB_MERCATOR_WKT } from './imageryGeoreference'
import { SRID_3857 } from '@/lib/map/projectionConstants'

export interface ImageryExportFrame {
  width: number; height: number; viewport: HTMLElement
  topLeftPixel: [number, number]; nextColumnPixel: [number, number]; nextRowPixel: [number, number]
  provider: ImageryProvider; dataDay: string | null; catalogueRetrievedAt: string; view: ImageryView; exportedAt: string
}
function bounded<T>(operation: Promise<T>, milliseconds: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(message)), milliseconds)
    operation.then(resolve, reject).finally(() => clearTimeout(timeout))
  })
}
function png(canvas: HTMLCanvasElement): Promise<Blob> {
  return bounded(new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('The browser could not encode the imagery PNG.')), 'image/png')), 15000, 'PNG preparation timed out. Reduce the map window and try again.')
}
/** Copy the rendered frame before awaiting encoding, branding or ZIP assembly. */
export function composeImageryCanvas(frame: ImageryExportFrame): HTMLCanvasElement {
  if (frame.provider.id !== 'nasa-modis-terra' || !frame.provider.exportAllowed) throw new Error(frame.provider.exportReason ?? 'This source does not allow this raster export.')
  if (frame.width <= 0 || frame.height <= 0 || frame.width * frame.height > 8_388_608) throw new Error('The export viewport is too large. Reduce the map window size.')
  const canvas = document.createElement('canvas'); canvas.width = frame.width; canvas.height = frame.height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('The browser canvas is unavailable')
  const layers = frame.viewport.querySelectorAll<HTMLCanvasElement>('.ol-layer canvas, canvas.ol-layer')
  if (!layers.length) throw new Error('No rendered imagery canvas is available')
  for (const layer of layers) {
    if (!layer.width || !layer.height) continue
    const opacity = layer.parentElement?.style.opacity || layer.style.opacity
    context.globalAlpha = opacity === '' ? 1 : Number(opacity)
    const transform = layer.style.transform
    if (transform) {
      const match = /^matrix\(([^)]+)\)$/.exec(transform)
      const matrix = match?.[1].split(',').map(Number)
      if (!matrix || matrix.length !== 6 || !matrix.every(Number.isFinite)) throw new Error('The rendered canvas transform is unsupported')
      context.setTransform(matrix[0], matrix[1], matrix[2], matrix[3], matrix[4], matrix[5])
    } else context.setTransform(1, 0, 0, 1, 0, 0)
    context.drawImage(layer, 0, 0)
  }
  context.setTransform(1, 0, 0, 1, 0, 0); context.globalAlpha = 1
  // Reading a pixel detects cross-origin taint before offering a misleading ZIP.
  context.getImageData(0, 0, 1, 1)
  return canvas
}
function wrappedText(context: CanvasRenderingContext2D, text: string, x: number, y: number, width: number) {
  let line = ''
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word
    if (line && context.measureText(next).width > width) { context.fillText(line, x, y); line = word; y += 18 } else line = next
  }
  if (line) context.fillText(line, x, y)
}
async function brandedReference(raster: HTMLCanvasElement, frame: ImageryExportFrame): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas'); canvas.width = Math.max(600, raster.width); canvas.height = raster.height + 140
  const context = canvas.getContext('2d')
  if (!context) throw new Error('The browser canvas is unavailable')
  context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(raster, 0, 0)
  const logo = new Image(); logo.src = '/metardu-icon.png'
  await bounded(logo.decode(), 10000, 'The company logo could not be loaded. Try the export again.')
  context.drawImage(logo, 16, raster.height + 16, 32, 32)
  context.fillStyle = '#17212b'; context.font = 'bold 16px sans-serif'; context.fillText('METARDU | Imagery context', 58, raster.height + 37)
  context.font = '12px sans-serif'
  wrappedText(context, `${frame.provider.name}; requested data day ${frame.dataDay ?? 'not supplied by source'}. Acquisition time and positional accuracy are not established.`, 16, raster.height + 66, canvas.width - 32)
  wrappedText(context, frame.provider.credits, 16, raster.height + 104, canvas.width - 32)
  return canvas
}
/** A GIS raster plus separate attributed reference image; captions do not corrupt georeferencing. */
export async function exportImageryZip(frame: ImageryExportFrame): Promise<Blob> {
  const raster = composeImageryCanvas(frame)
  const worldFile = rasterWorldFile(frame.topLeftPixel, frame.nextColumnPixel, frame.nextRowPixel)
  const rasterBlob = await png(raster)
  const referenceBlob = await png(await brandedReference(raster, frame))
  const rasterBuffer = await rasterBlob.arrayBuffer()
  const checksum = async (bytes: ArrayBuffer) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join('')
  const rasterSha256 = await checksum(rasterBuffer)
  const { default: JSZip } = await import('jszip')
  const zip = new JSZip()
  zip.file('imagery.png', rasterBuffer)
  zip.file('imagery.pgw', worldFile + '\n'); zip.file('imagery.prj', WEB_MERCATOR_WKT + '\n')
  zip.file('reference-map.png', await referenceBlob.arrayBuffer())
  zip.file('provenance.json', JSON.stringify({ schemaVersion: 1, producer: 'METARDU', purpose: 'planning_context', certified: false, fieldVerified: false,
    crs: SRID_3857, pixelReference: 'centres', width: frame.width, height: frame.height, affine: worldFile.split('\n').map(Number), rasterSha256,
    source: { id: frame.provider.id, name: frame.provider.name, url: frame.provider.sourceUrl, termsUrl: frame.provider.termsUrl, credits: frame.provider.credits, sourceResolution: frame.provider.sourceResolution },
    requestedDataDay: frame.dataDay, acquisitionTime: null, positionalAccuracy: null, catalogueRetrievedAt: frame.catalogueRetrievedAt, exportedAt: frame.exportedAt, view: frame.view,
  }, null, 2) + '\n')
  zip.file('README.txt', `METARDU imagery context export\n\nLoad imagery.png with imagery.pgw and imagery.prj together in a GIS. The affine locates pixel centres in ${SRID_3857}. Do not use display-projection distances as survey measurements.\n\nreference-map.png includes the company brand and source credits for reference/report use; it is not the georeferenced raster. The PNG may show clouds or missing source data. Acquisition time, positional accuracy and survey certification are not established. The pixels are a browse visualization, not calibrated reflectance bands.\n\n${frame.provider.credits}\nSource: ${frame.provider.sourceUrl}\nData use: ${frame.provider.termsUrl}\n`)
  return bounded(zip.generateAsync({ type: 'blob', compression: 'STORE' }), 30000, 'ZIP preparation timed out. Reduce the map window and try again.')
}
