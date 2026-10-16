import type Map from 'ol/Map'
import type { PrintOptions } from './printSurface'

/** Snapshot the existing frame; never retarget, resize or fit the working map. */
export async function captureMapViewport(map: Map): Promise<HTMLCanvasElement> {
  await new Promise<void>((resolve, reject) => {
    const done = () => { clearTimeout(timer); map.un('rendercomplete', done); resolve() }
    const timer = setTimeout(() => { map.un('rendercomplete', done); reject(new Error('Map tiles are still loading. Wait for them to finish, then print again.')) }, 12000)
    map.on('rendercomplete', done)
    map.renderSync()
  })
  const size = map.getSize()
  if (!size || size[0] <= 0 || size[1] <= 0 || size[0] * size[1] > 8_388_608) throw new Error('The map viewport is unavailable or too large to print.')
  const raster = document.createElement('canvas')
  raster.width = size[0]; raster.height = size[1]
  const context = raster.getContext('2d')
  if (!context) throw new Error('This browser cannot prepare the map image.')
  context.fillStyle = '#fff'; context.fillRect(0, 0, raster.width, raster.height)
  const layers = map.getViewport().querySelectorAll<HTMLCanvasElement>('.ol-layer canvas, canvas.ol-layer')
  let count = 0
  for (const layer of layers) {
    if (!layer.width || !layer.height || getComputedStyle(layer.parentElement ?? layer).display === 'none') continue
    const opacity = layer.parentElement?.style.opacity || layer.style.opacity
    context.globalAlpha = opacity ? Number(opacity) : 1
    const transform = layer.style.transform
    if (transform) {
      const values = /^matrix\(([^)]+)\)$/.exec(transform)?.[1].split(',').map(Number)
      if (!values || values.length !== 6 || !values.every(Number.isFinite)) throw new Error('The rendered map transform could not be printed.')
      context.setTransform(values[0], values[1], values[2], values[3], values[4], values[5])
    } else context.setTransform(parseFloat(layer.style.width || String(layer.width)) / layer.width, 0, 0, parseFloat(layer.style.height || String(layer.height)) / layer.height, 0, 0)
    context.filter = getComputedStyle(layer.closest('.metardu-dark-basemap') ?? layer).filter || 'none'
    context.drawImage(layer, 0, 0); count++
  }
  context.setTransform(1, 0, 0, 1, 0, 0); context.globalAlpha = 1; context.filter = 'none'
  if (!count) throw new Error('No rendered map layers are available to print.')
  try { context.getImageData(0, 0, 1, 1) } catch { throw new Error('A map source prevents image export. Switch to an export-enabled basemap and retry.') }
  return raster
}

export interface MapPrintFrame {
  raster: HTMLCanvasElement
  surveyCrs: string | null
  credits: string
  capturedAt: string
  rotation: number
}

/** Print-ready PDF of the current raster, with its source credits and no UI overlays. */
export async function mapViewportPdf(frame: MapPrintFrame, options: Partial<PrintOptions> = {}): Promise<Blob> {
  const { jsPDF } = await import('jspdf')
  const paper = options.paperSize === 'a1' || options.paperSize === 'a3' ? options.paperSize : 'a4'
  const orientation = options.orientation === 'portrait' ? 'portrait' : 'landscape'
  const pdf = new jsPDF({ format: paper, orientation, unit: 'mm' })
  pdf.setProperties({ title: 'METARDU | Current map view', subject: 'Reference map, not a certified survey plan', creator: 'METARDU' })
  const width = pdf.internal.pageSize.getWidth() - 20
  const pageHeight = pdf.internal.pageSize.getHeight()
  const meta = `Captured ${frame.capturedAt} | Survey CRS: ${frame.surveyCrs ?? 'not declared'} | Display EPSG:3857 | Rotation ${(frame.rotation * 180 / Math.PI).toFixed(1)} deg`
  const footerText = [meta, 'Current-view reference. Not to a certified scale; not a cadastral plan or construction approval.', frame.credits].join('\n')
  pdf.setFontSize(8)
  const lines = pdf.splitTextToSize(footerText, width) as string[]
  const footerHeight = lines.length * 4 + 10
  const availableHeight = pageHeight - 36 - footerHeight
  if (availableHeight < 20) throw new Error('Source credits exceed this paper size. Choose a larger sheet.')
  const scale = Math.min(width / frame.raster.width, availableHeight / frame.raster.height)
  const logo = new Image()
  logo.src = '/metardu-icon.png'
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('The company logo could not be loaded. Try printing again.')), 10000)
    logo.decode().then(resolve, reject).finally(() => clearTimeout(timeout))
  })
  pdf.addImage(logo, 'PNG', 10, 8, 10, 10)
  pdf.setFontSize(14); pdf.text('METARDU | Current map view', 24, 15)
  pdf.addImage(frame.raster.toDataURL('image/png'), 'PNG', 10 + (width - frame.raster.width * scale) / 2, 24, frame.raster.width * scale, frame.raster.height * scale)
  pdf.setFontSize(8); pdf.text(lines, 10, pageHeight - footerHeight)
  return pdf.output('blob')
}
