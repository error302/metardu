import type { ParsedInput } from '../types'
import { summarizeParsedInput } from '../uploadSummary'

describe('parser upload summary', () => {
  test('returns entity counts instead of exposing parsed objects to the UI', () => {
    const parsed: ParsedInput = {
      type: 'DXF',
      sourceFileName: 'site.dxf',
      sourceFileSize: 128,
      sourceFileLastModified: 1,
      parsedAt: '2026-10-05T00:00:00.000Z',
      version: '1.0.0',
      errors: [],
      warnings: [],
      confidence: 1.2,
      building: {
        floors: [{ id: 'f1', level: 0, name: 'Ground', elevation: 0, boundingBox: { minEasting: 0, maxEasting: 1, minNorthing: 0, maxNorthing: 1 } }],
        walls: [],
        rooms: [],
        doors: [],
        windows: [],
        columns: [],
        beams: [],
        annotations: [],
        boundingBox: { minEasting: 0, maxEasting: 1, minNorthing: 0, maxNorthing: 1 },
        metadata: { units: 'meters' },
      },
      boq: { items: [], currency: 'KES', subtotal: 0, total: Number.NaN, sourceFileName: 'site.dxf' },
    }

    expect(summarizeParsedInput(parsed)).toMatchObject({
      success: true,
      confidence: 1,
      hasBuilding: true,
      hasCad: false,
      hasBoq: true,
      building: { floors: 1, walls: 0, rooms: 0, doors: 0, windows: 0 },
      boq: { items: 0, total: null },
    })
  })

  test('marks parser errors and clamps invalid confidence without inventing outputs', () => {
    const parsed: ParsedInput = {
      type: 'IFC',
      sourceFileName: 'model.ifc',
      sourceFileSize: 64,
      sourceFileLastModified: 1,
      parsedAt: '2026-10-05T00:00:00.000Z',
      version: '1.0.0',
      errors: ['No supported entities were found.'],
      warnings: [],
      confidence: Number.NaN,
    }

    expect(summarizeParsedInput(parsed)).toEqual({
      success: false,
      type: 'IFC',
      confidence: 0,
      hasBuilding: false,
      hasCad: false,
      hasBoq: false,
      errors: ['No supported entities were found.'],
      warnings: [],
    })
  })

  test('returns a bounded preview and full character count for text-only document results', () => {
    const parsed: ParsedInput = {
      type: 'PDF',
      sourceFileName: 'notes.pdf',
      sourceFileSize: 64,
      sourceFileLastModified: 1,
      parsedAt: '2026-10-05T00:00:00.000Z',
      version: '1.0.0',
      errors: [],
      warnings: ['Text only.'],
      confidence: 0,
      extractedText: 'survey text',
    }

    expect(summarizeParsedInput(parsed)).toMatchObject({
      extractedTextPreview: 'survey text',
      extractedTextCharacters: 11,
      hasBuilding: false,
    })
  })
})
