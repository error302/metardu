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
  ;(downloadFile as jest.Mock).mockResolvedValue(Buffer.from('local document'))
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
  const entry = zip.file('submission_dossier/README_STATUTORY_DOSSIER.txt')
  if (!entry) throw new Error('Missing dossier manifest')
  const manifest = await entry.async('string')
  expect(manifest).not.toContain('[x] 06_Beacon_Coordinates.csv')
  expect(manifest).not.toContain('have passed statutory QA gates')
  expect(manifest).not.toContain('METARDU Certified Submission')
})
test('coordinate CSV preserves elevations and leaves unknown elevations empty', async () => {
  const zip = await JSZip.loadAsync(await generateFullPackage('project'))
  const entry = zip.file('submission_dossier/06_Beacon_Coordinates.csv')
  if (!entry) throw new Error('Missing retained beacon coordinates')
  const csv = await entry.async('string')
  expect(csv).toContain('"A",100.000,200.000,123.456,')
  expect(csv).toContain('"B",200.000,200.000,,')
})
test('packages local storage files without fetching a relative HTTP URL', async () => {
  ;(db.query as jest.Mock).mockImplementation(async (sql: string) => ({ rows: sql.includes('FROM projects')
    ? [{ name: 'Integrity test', survey_type: 'cadastral' }]
    : ids.map(document_id => ({ document_id, file_url: `/api/storage?path=${encodeURIComponent(`submissions/project/${document_id}.pdf`)}` })) }))
  const zip = await JSZip.loadAsync(await generateFullPackage('project'))
  const entry = zip.file('submission_dossier/deed-plan.pdf')
  if (!entry) throw new Error('Missing retained deed plan')
  expect(await entry.async('string')).toBe('local document')
  expect(downloadFile).toHaveBeenCalledWith('submissions/project/deed-plan.pdf')
})

test('missing documents require an explicit generator before any document write', async () => {
  ;(db.query as jest.Mock).mockImplementation(async (sql: string) => ({ rows: sql.includes('FROM projects')
    ? [{ name: 'Synthetic missing dossier', survey_type: 'cadastral' }] : [] }))
  await expect(generateFullPackage('project')).rejects.toThrow(/statutory-workbook.*explicit document generator/)
  expect((db.query as jest.Mock).mock.calls.some(([sql]: [string]) => sql.startsWith('INSERT'))).toBe(false)
  expect(downloadFile).not.toHaveBeenCalled()
})

test('concurrent package calls keep their own generator, project and owner context', async () => {
  ;(db.query as jest.Mock).mockImplementation(async (sql: string) => ({ rows: sql.includes('FROM projects')
    ? [{ name: 'Synthetic generated dossier', survey_type: 'cadastral' }] : [] }))
  ;(computeDeedPlanGeometry as jest.Mock).mockResolvedValue({ stations: [] })
  ;(downloadFile as jest.Mock).mockImplementation(async (key: string) => Buffer.from(key))
  const generatorFor = (project: string, owner: string) => jest.fn(async (input: {
    projectId: string; documentId: string; surveyType: string; userId?: string
  }) => {
    expect(input).toMatchObject({ projectId: project, userId: owner, surveyType: 'cadastral' })
    return { fileUrl: `/api/storage?path=${encodeURIComponent(`submissions/${project}/${input.documentId}.pdf`)}` }
  })
  const first = generatorFor('project-a', 'owner-a'), second = generatorFor('project-b', 'owner-b')
  const buffers = await Promise.all([
    generateFullPackage('project-a', 'owner-a', first), generateFullPackage('project-b', 'owner-b', second),
  ])
  expect(first).toHaveBeenCalledTimes(ids.length)
  expect(second).toHaveBeenCalledTimes(ids.length)
  for (const [index, project] of ['project-a', 'project-b'].entries()) {
    const zip = await JSZip.loadAsync(buffers[index])
    for (const documentId of ids) {
      const entry = zip.file(`submission_dossier/${documentId}.pdf`)
      if (!entry) throw new Error(`Missing retained ${documentId} file for ${project}`)
      expect(await entry.async('string')).toBe(`submissions/${project}/${documentId}.pdf`)
    }
  }
})
