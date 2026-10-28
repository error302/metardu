/** @jest-environment node */
import { invokeMockApi } from '@/test-utils/invokeMockApi'
import { requiredValue } from '@/test-utils/requiredValue'
import JSZip from 'jszip'
import { db } from '@/lib/db'
import { POST } from '@/app/api/survey-report/export/route'

jest.mock('@/lib/apiHandler', () => ({ apiHandler: (_options: unknown, handler: unknown) => handler }))
jest.mock('@/lib/db', () => ({ db: { query: jest.fn() } }))
jest.mock('@/lib/api-client/surveyReports', () => ({ getSurveyReportById: () => { throw new Error('Browser client cannot load server reports') } }))
jest.mock('@/lib/pdf/generatePdf', () => ({ generatePdf: jest.fn() }))

const row = {
  report_title: 'Saved survey report', report_number: 'R-1', revision: 'Rev 2', status: 'draft',
  input_data: { clientName: 'Recorded client', reportTitle: 'Stale title' },
  sections: [{ sectionNumber: 1, section: 'INTRODUCTION', title: 'Recorded observations',
    content: '<p>Recorded closure is 1:12345 from actual measurements.</p>' }],
}
const context = { userId: 'owner', body: { reportId: 'report', format: 'docx' } }

beforeEach(() => {
  jest.clearAllMocks()
  ;(db.query as jest.Mock).mockImplementation(async (sql: string, params: unknown[]) => {
    if (!sql.includes('p.user_id = $2') || params[0] !== 'report' || params[1] !== 'owner') {
      throw new Error('Report query must enforce ownership')
    }
    return { rows: [row] }
  })
})

test('exports the owner saved sections and canonical title through the server database', async () => {
  const response = await invokeMockApi(POST, context)
  expect(response.status).toBe(200)
  const zip = await JSZip.loadAsync(await response.arrayBuffer())
  const xml = await requiredValue(zip.file('word/document.xml')).async('string')
  expect(xml).toContain('Recorded closure is 1:12345')
  expect(xml).toContain('SAVED SURVEY REPORT')
  expect(xml).toContain('Recorded client')
  expect(xml).not.toContain('1:5000')
  expect(response.headers.get('Content-Disposition')).toContain('R_1.docx')
})

test('does not export a report absent from the owner-scoped query', async () => {
  ;(db.query as jest.Mock).mockResolvedValue({ rows: [] })
  expect((await invokeMockApi(POST, context)).status).toBe(404)
})

test('does not invent sections when the saved report contains no content', async () => {
  ;(db.query as jest.Mock).mockResolvedValue({ rows: [{ ...row, sections: null }] })
  expect((await invokeMockApi(POST, context)).status).toBe(422)
})
