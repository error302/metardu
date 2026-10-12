/** @jest-environment node */
import JSZip from 'jszip'
import db from '@/lib/db'
import { computeDeedPlanGeometry } from '@/lib/generators/deedPlanGeometry'
import { generateFullPackage } from '@/lib/generators/fullPackage'
import { downloadFile } from '@/lib/storage'
jest.mock('@/lib/storage', () => ({ downloadFile: jest.fn().mockResolvedValue(Buffer.from('local document')) }))

jest.mock('@/lib/db', () => ({ __esModule: true, default: { query: jest.fn() } }))
jest.mock('@/lib/logger', () => ({ logger: { warn: jest.fn() } }))
jest.mock('@/lib/generators/deedPlanGeometry', () => ({ computeDeedPlanGeometry: jest.fn() }))

const ids = ['statutory-workbook', 'deed-plan', 'traverse-computation-sheet', 'area-computation', 'field-book']
const originalFetch = global.fetch
beforeEach(() => {
  jest.clearAllMocks()
  ;(db.query as jest.Mock).mockImplementation(async (sql: string) => ({ rows: sql.includes('FROM projects')
    ? [{ name: 'Integrity test', survey_type: 'cadastral' }]
    : ids.map(document_id => ({ document_id, file_url: `https://files.example/${document_id}.pdf` })) }))
  ;(computeDeedPlanGeometry as jest.Mock).mockResolvedValue({ stations: [
    { station: 'A', easting: 100, northing: 200, elevation: 123.456 },
    { station: 'B', easting: 200, northing: 200 },
  ] })
  global.fetch = jest.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => Buffer.from('document') })
})
afterEach(() => { global.fetch = originalFetch })

test('rejects a package when a listed document cannot be downloaded', async () => {
  ;(global.fetch as jest.Mock).mockResolvedValueOnce({ ok: false, status: 404 })
  await expect(generateFullPackage('project')).rejects.toThrow(/statutory-workbook/)
})
test('manifest lists only actual files and does not certify unperformed QA', async () => {
  ;(computeDeedPlanGeometry as jest.Mock).mockResolvedValue({stations: []})
  const zip = await JSZip.loadAsync(await generateFullPackage('project'))
  const manifest = await zip.file('submission_dossier/README_STATUTORY_DOSSIER.txt')!.async('string')
  expect(manifest).not.toContain('[x] 06_Beacon_Coordinates.csv')
  expect(manifest).not.toContain('have passed statutory QA gates')
  expect(manifest).not.toContain('METARDU Certified Submission')
})
test('coordinate CSV preserves elevations and leaves unknown elevations empty', async () => {
  const zip = await JSZip.loadAsync(await generateFullPackage('project'))
  const csv = await zip.file('submission_dossier/06_Beacon_Coordinates.csv')!.async('string')
  expect(csv).toContain('"A",100.000,200.000,123.456,')
  expect(csv).toContain('"B",200.000,200.000,,')
})
test('packages local storage files without fetching a relative HTTP URL', async () => {
  ;(db.query as jest.Mock).mockImplementation(async (sql: string) => ({ rows: sql.includes('FROM projects')
    ? [{ name: 'Integrity test', survey_type: 'cadastral' }]
    : ids.map(document_id => ({ document_id, file_url: `/api/storage?path=${encodeURIComponent(`submissions/project/${document_id}.pdf`)}` })) }))
  const zip = await JSZip.loadAsync(await generateFullPackage('project'))
  expect(await zip.file('submission_dossier/deed-plan.pdf')!.async('string')).toBe('local document')
  expect(downloadFile).toHaveBeenCalledWith('submissions/project/deed-plan.pdf')
})
