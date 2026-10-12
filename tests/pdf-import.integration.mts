import assert from 'node:assert/strict'
import test from 'node:test'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { parsePDFContent } from '../src/lib/parsers/parsePDF.ts'

async function makePdf(text?: string): Promise<File> {
  const document = await PDFDocument.create()
  const page = document.addPage([612, 792])
  if (text) {
    const font = await document.embedFont(StandardFonts.Helvetica)
    page.drawText(text, { x: 48, y: 720, font, size: 12 })
  }
  const bytes = await document.save()
  return new File([bytes], 'survey-drawing.pdf', { type: 'application/pdf' })
}

test('PDF text extraction returns text without fabricating survey geometry', async () => {
  const parsed = await parsePDFContent(await makePdf('Control BM-1 RL 123.450 m'))

  assert.deepEqual(parsed.errors, [])
  assert.match(parsed.extractedText ?? '', /Control BM-1 RL 123\.450 m/)
  assert.equal(parsed.building, undefined)
  assert.match(parsed.warnings.join(' '), /PDF page coordinates are not survey coordinates/i)
})

test('image-only PDF pages fail clearly without producing geometry', async () => {
  const parsed = await parsePDFContent(await makePdf())

  assert.match(parsed.errors.join(' '), /No selectable PDF text was found/i)
  assert.equal(parsed.extractedText, '')
  assert.equal(parsed.building, undefined)
})
