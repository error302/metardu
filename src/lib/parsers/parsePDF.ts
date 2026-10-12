import type { ParsedInput } from './types'

export interface PDFParseOptions {
  scale?: number
}

/** Structural subset of the pdfjs TextItem used by the text extractor. */
interface PDFTextItem {
  str?: string
}

const MAX_PDF_PAGES = 500
const MAX_EXTRACTED_TEXT_CHARS = 100_000

export async function parsePDFContent(file: File, _options: PDFParseOptions = {}): Promise<ParsedInput> {
  const base = {
    type: 'PDF' as const,
    sourceFileName: file.name,
    sourceFileSize: file.size,
    sourceFileLastModified: file.lastModified,
    parsedAt: new Date().toISOString(),
    version: '1.0.0',
  }
  let destroyLoadingTask: (() => Promise<void>) | undefined
  try {
    // The route runs in Node. Use PDF.js's Node entrypoint so it can select
    // its packaged worker instead of relying on a missing public worker file.
    const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
    const [{ default: nodeModule }, path] = await Promise.all([
      import('node:module'),
      import('node:path'),
    ])
    // Webpack's dynamic CJS namespace wrapper exposes Module as default;
    // its static createRequire method is not a named namespace export there.
    const require = nodeModule.createRequire(import.meta.url)
    const standardFontDirectory = path.join(
      path.dirname(require.resolve('pdfjs-dist/package.json')),
      'standard_fonts',
    )
    const loadingTask = getDocument({
      data: new Uint8Array(await file.arrayBuffer()),
      isEvalSupported: false,
      standardFontDataUrl: `${standardFontDirectory.replace(/\\/g, '/')}/`,
    })
    destroyLoadingTask = () => loadingTask.destroy()
    const pdf = await loadingTask.promise
    if (pdf.numPages > MAX_PDF_PAGES) {
      throw new Error(`PDF has ${pdf.numPages} pages; the parser limit is ${MAX_PDF_PAGES}. Split the file and retry.`)
    }

    let extractedText = ''
    let extractedPageCount = 0
    let truncated = false
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum)
      const textContent = await page.getTextContent()
      const pageText = textContent.items.map(item => {
        const textItem = item as PDFTextItem
        return typeof textItem.str === 'string' ? textItem.str : ''
      }).filter(Boolean).join(' ')
      if (pageText) {
        const pageChunk = `${extractedPageCount ? '\n\n' : ''}Page ${pageNum}\n${pageText}`
        const remainingChars = MAX_EXTRACTED_TEXT_CHARS - extractedText.length
        if (pageChunk.length > remainingChars) {
          extractedText += pageChunk.slice(0, remainingChars)
          truncated = true
          await page.cleanup()
          break
        }
        extractedPageCount++
        extractedText += pageChunk
      }
      await page.cleanup()
    }

    if (!extractedText.trim()) {
      return {
        ...base,
        extractedText: '',
        errors: ['No selectable PDF text was found. Scanned or image-only PDFs need OCR; no geometry was generated.'],
        warnings: [],
        confidence: 0,
      }
    }

    return {
      ...base,
      extractedText,
      errors: [],
      warnings: [
        'Text extraction only. PDF page coordinates are not survey coordinates; no walls, rooms, levels, units, or scale were inferred.',
        ...(truncated ? [`Text preview is limited to ${MAX_EXTRACTED_TEXT_CHARS.toLocaleString()} characters.`] : []),
      ],
      confidence: 0,
    }
  } catch (error) {
    return {
      ...base,
      errors: [error instanceof Error ? error.message : 'PDF parsing failed'],
      warnings: [],
      confidence: 0,
    }
  } finally {
    await destroyLoadingTask?.().catch(() => undefined)
  }
}

export async function rasterizePDFPage(file: File, pageNumber: number = 1, scale: number = 2): Promise<Blob> {
  const pdfjsLib = await import('pdfjs-dist')
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js'

  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
  const page = await pdf.getPage(pageNumber)

  const viewport = page.getViewport({ scale })
  const canvas = document.createElement('canvas')
  canvas.width = viewport.width
  canvas.height = viewport.height

  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas context not available')

  await page.render({ canvasContext: context, viewport, canvas }).promise

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('Failed to create blob'))
    }, 'image/png')
  })
}
