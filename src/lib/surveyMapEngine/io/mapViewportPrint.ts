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
  useCompanyLogo?: boolean
}

function withTimeout<T>(task: Promise<T>, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(message)), 8000)
    task.then(resolve, reject).finally(() => clearTimeout(timeout))
  })
}

async function loadLogo(src: string) {
  const image = new Image()
  image.src = src
  await withTimeout(image.decode(), 'The map capture logo could not be loaded.')
  if (!image.naturalWidth || !image.naturalHeight) throw new Error('The map capture logo is empty.')
  return image
}

async function captureBrand(useCompanyLogo?: boolean) {
  if (useCompanyLogo) {
    try {
      const response = await fetch('/api/documents/logo/data', { cache: 'no-store', signal: AbortSignal.timeout(5000) })
      if (response.ok) {
        const src = URL.createObjectURL(await response.blob())
        try {
          const image = await loadLogo(src)
          if (image.naturalWidth <= 4096 && image.naturalHeight <= 4096) return { image, custom: true }
        } finally { URL.revokeObjectURL(src) }
      }
    } catch { /* A missing, invalid or unauthorized logo falls back to METARDU. */ }
  }
  return { image: await loadLogo('/metardu-icon.png'), custom: false }
}

function logoSize(image: HTMLImageElement, maxWidth: number, maxHeight: number) {
  const scale = Math.min(maxWidth / image.naturalWidth, maxHeight / image.naturalHeight)
  return { width: image.naturalWidth * scale, height: image.naturalHeight * scale }
}

function captureMetadata(frame: MapPrintFrame) {
  return [
    `Captured ${frame.capturedAt} | Survey CRS: ${frame.surveyCrs ?? 'not declared'} | Display EPSG:3857 | Rotation ${(frame.rotation * 180 / Math.PI).toFixed(1)} deg`,
    'Current-view reference. Not to a certified scale; not a cadastral plan or construction approval.',
    frame.credits,
  ]
}

function wrapCaption(context: CanvasRenderingContext2D, text: string, width: number) {
  const lines: string[] = []
  let line = ''
  for (const word of text.split(/\s+/)) {
    const next = line ? line + ' ' + word : word
    if (line && context.measureText(next).width > width) {
      lines.push(line)
      line = word
    } else line = next
    if (context.measureText(line).width > width) {
      let part = ''
      for (const character of line) {
        if (part && context.measureText(part + character).width > width) {
          lines.push(part)
          part = ''
        }
        part += character
      }
      line = part
    }
  }
  if (line) lines.push(line)
  return lines
}

/** PNG of the map frame, with attribution and branding outside the map pixels. */
export async function mapViewportPng(frame: MapPrintFrame): Promise<Blob> {
  const { image, custom } = await captureBrand(frame.useCompanyLogo)
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')
  if (!context) throw new Error('This browser cannot prepare the map image.')
  canvas.width = Math.max(640, frame.raster.width)
  context.font = '12px sans-serif'
  const lines = captureMetadata(frame).flatMap(text => wrapCaption(context, text, canvas.width - 32))
  canvas.height = 64 + frame.raster.height + 24 + lines.length * 17
  context.fillStyle = '#fff'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.drawImage(frame.raster, (canvas.width - frame.raster.width) / 2, 64)
  const size = logoSize(image, custom ? 132 : 40, 40)
  context.drawImage(image, 16, 12 + (40 - size.height) / 2, size.width, size.height)
  context.fillStyle = '#1a1816'
  context.font = 'bold 18px sans-serif'
  context.fillText(custom ? 'Current map view' : 'METARDU | Current map view', 28 + size.width, 38)
  context.font = '12px sans-serif'
  lines.forEach((line, index) => context.fillText(line, 16, 84 + frame.raster.height + index * 17))
  return withTimeout(new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('The browser could not encode the map PNG.')), 'image/png')
  }), 'Map PNG preparation timed out.')
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
  const footerText = captureMetadata(frame).join('\n')
  pdf.setFontSize(8)
  const lines = pdf.splitTextToSize(footerText, width) as string[]
  const footerHeight = lines.length * 4 + 10
  const availableHeight = pageHeight - 36 - footerHeight
  if (availableHeight < 20) throw new Error('Source credits exceed this paper size. Choose a larger sheet.')
  const scale = Math.min(width / frame.raster.width, availableHeight / frame.raster.height)
  const { image, custom } = await captureBrand(frame.useCompanyLogo)
  const size = logoSize(image, custom ? 37 : 10, 10)
  const logoRaster = document.createElement('canvas')
  logoRaster.width = Math.ceil(size.width * 12)
  logoRaster.height = Math.ceil(size.height * 12)
  const logoContext = logoRaster.getContext('2d')
  if (!logoContext) throw new Error('This browser cannot prepare the map logo.')
  logoContext.drawImage(image, 0, 0, logoRaster.width, logoRaster.height)
  pdf.addImage(logoRaster.toDataURL('image/png'), 'PNG', 10, 8 + (10 - size.height) / 2, size.width, size.height)
  pdf.setFontSize(14)
  pdf.text(custom ? 'Current map view' : 'METARDU | Current map view', 14 + size.width, 15)
  pdf.addImage(frame.raster.toDataURL('image/png'), 'PNG', 10 + (width - frame.raster.width * scale) / 2, 24, frame.raster.width * scale, frame.raster.height * scale)
  pdf.setFontSize(8); pdf.text(lines, 10, pageHeight - footerHeight)
  return pdf.output('blob')
}
