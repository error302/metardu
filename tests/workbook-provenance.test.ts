/** @jest-environment node */
import ExcelJS from 'exceljs'
import { generateDocument } from '@/lib/submission/assembleDocument'
import { uploadFile, getSignedUrl } from '@/lib/storage'
import db from '@/lib/db'
jest.mock('@/lib/storage', () => ({ uploadFile: jest.fn().mockResolvedValue('submissions/p/actual-stored-report.xlsx'), getSignedUrl: jest.fn().mockResolvedValue('https://files.example/report.xlsx') }))
jest.mock('@/lib/db', () => {
  const db = { query: jest.fn() }
  return { __esModule: true, default: db, db }
})
jest.mock('@/lib/logger', () => ({ logger: { warn: jest.fn() } }))
const stations = [
  { station: 'A', easting: 100, northing: 100 },
  { station: 'B', easting: 200, northing: 100 },
  { station: 'C', easting: 200, northing: 200 },
]
jest.mock('@/lib/generators/deedPlanGeometry', () => ({
  loadPreAdjustedFromDB: jest.fn().mockResolvedValue(null),
  computeDeedPlanGeometry: jest.fn(async () => ({
    stations,
    bearingSchedule: [
      { from: 'A', to: 'B', bearing: '090°00\'00"', distance: '100.000' },
      { from: 'B', to: 'C', bearing: '000°00\'00"', distance: '100.000' },
      { from: 'C', to: 'A', bearing: '225°00\'00"', distance: '141.421' },
    ],
    areaM2: 5000, areaHa: 0.5, misclosureMm: NaN, precisionRatio: 'Unverified', closureStatus: 'UNVERIFIED',
  })),
}))

test('exported workbook does not invent raw observations, credentials, CRS or QA evidence', async () => {
  jest.clearAllMocks()
  ;(db.query as jest.Mock).mockImplementation(async (sql: string) => ({ rows: sql.includes('SELECT name,') ? [{ name: 'Review', survey_type: 'cadastral' }] : [] }))
  await generateDocument({ projectId: 'p', documentId: 'statutory-workbook', surveyType: 'cadastral' })
  expect(getSignedUrl).toHaveBeenCalledWith('submissions/p/actual-stored-report.xlsx', 604800)
  const args = (uploadFile as jest.Mock).mock.calls[0]
  const buffer = args.find((v: unknown) => Buffer.isBuffer(v))
  expect(buffer).toBeDefined()
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buffer)
  const cells: string[] = []
  wb.eachSheet(sheet => sheet.eachRow(row => row.eachCell(cell => cells.push(cell.text))))
  expect(cells.join('\n')).not.toContain('MISK-001')
  expect(cells).not.toContain('AUTHENTICATED')
  expect(cells.join('\n')).not.toContain('ALL CHECKS PASS')
  expect(cells.join('\n')).not.toContain('Beacon verified')
  expect(cells.join('\n')).toContain('UNVERIFIED')
  const field = wb.getWorksheet('2. Field Abstract')!
  expect(field.getRow(6).getCell(1).text).not.toBe('A')
})

test.each(['form-c22', 'traverse-computation-sheet'])('%s labels coordinate-derived content and unknown QA', async (documentId) => {
  jest.clearAllMocks()
  ;(db.query as jest.Mock).mockResolvedValue({ rows: [] })
  await generateDocument({ projectId: 'p', documentId, surveyType: 'cadastral' })
  const buffer = (uploadFile as jest.Mock).mock.calls[0].find((v: unknown) => Buffer.isBuffer(v)) as Buffer
  const pdf = buffer.toString('latin1')
  expect(pdf).toContain('UNVERIFIED')
  expect(pdf).toContain('DERIVED')
  expect(pdf).not.toContain('(NaN')
})
