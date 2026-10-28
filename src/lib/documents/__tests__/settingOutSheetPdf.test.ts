import { inflateSync } from 'node:zlib'
import { SETTING_OUT_TEMPLATE } from '../templates/setting-out'

// Declared reference systems for the synthetic controls in this suite.
const fixtureCrs32737 = 'EPSG:32737'


function pdfTextStreams(pdf: Buffer): string {
  const binary = pdf.toString('latin1')
  const streams: string[] = []
  for (const match of binary.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    try {
      const content = inflateSync(Buffer.from(match[1], 'latin1')).toString('latin1')
      // PDFKit stores text as hex-encoded glyph runs and inserts numeric kerning
      // adjustments between runs. Decode only the glyph strings, ignoring those
      // spacing operators so visible words remain readable to the assertions.
      for (const operator of content.matchAll(/\[([^\]]*)\]\s*TJ/gi)) {
        const glyphRuns: string[] = []
        for (const glyphs of operator[1].matchAll(/<([\da-f]+)>/gi)) {
          glyphRuns.push(Buffer.from(glyphs[1].length % 2 ? `${glyphs[1]}0` : glyphs[1], 'hex').toString('latin1'))
        }
        streams.push(glyphRuns.join(''))
      }
    } catch {
      // Ignore non-page streams such as metadata and fonts.
    }
  }
  return streams.join('\n')
}

describe('general setting-out PDF', () => {
  it('includes supplied points, explicit draft limits, and prepared/checked signature areas', async () => {
    const pdf = await SETTING_OUT_TEMPLATE.generate({
      projectName: 'Synthetic access road',
      surveyorName: 'Surveyor Example',
      surveyorLicense: 'LS-123',
      checkedByName: 'Checker Example',
      checkedByLicense: 'LS-456',
      date: '2026-10-12',
      projection: fixtureCrs32737,
      datum: 'WGS 84',
      points: [{ pointId: 'MH-01', designE: 500010, designN: 9900000, remarks: 'Start manhole' }],
    })

    const text = pdfTextStreams(pdf)
    expect(pdf.subarray(0, 5).toString('ascii')).toBe('%PDF-')
    expect(text).toContain('MH-01')
    expect(text).toContain('PREPARED BY')
    expect(text).toContain('CHECKED BY')
    expect(text).toContain('Surveyor Example')
    expect(text).toContain('Checker Example')
    expect(text).toContain('Signature')
    expect(text).toContain('DRAFT')
    expect(text).toContain('not verified')
  })
})
