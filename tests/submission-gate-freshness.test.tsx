import { act, fireEvent, render, screen } from '@testing-library/react'
import SubmissionClient from '@/app/project/[id]/submission/SubmissionClient'
import { apiGet, apiPost } from '@/lib/api/client'
import { runStatutoryGate, formatGateResult } from '@/lib/validation/statutoryGate'

jest.mock('@/lib/api/client', () => ({ apiGet: jest.fn(), apiPost: jest.fn(), apiInvalidate: jest.fn(), ApiError: class extends Error {} }))
jest.mock('@/lib/api-client/client', () => ({ createClient: () => ({ from: jest.fn() }) }))
jest.mock('@/components/submission/SupportingDocUpload', () => ({ SupportingDocUpload: () => null }))
jest.mock('@/components/drawing/FormNo4Preview', () => ({ FormNo4Preview: () => null }))
jest.mock('@/components/submission/NLIMSExportPanel', () => ({ NLIMSExportPanel: () => null }))
jest.mock('@/lib/submission/submissionDocuments', () => ({ getDocumentsForSurveyType: () => [
  { id: 'synthetic-doc', label: 'Synthetic document', description: 'Synthetic only', format: 'pdf', requiredData: [], required: true },
] }))

const reply = () => {
  const gate = runStatutoryGate({ surveyType: 'engineering', surveyor: { name: 'Synthetic', licenseNumber: 'ISK/LS/2020/123' },
    engineering: { horizontalCurveRadiusM: 300, criteria: { reference: 'Synthetic criteria', minimumRadiusM: 200 } } })
  return { gate, formatted: formatGateResult(gate) }
}
const props = (id: string) => ({ projectId: id, project: { id, name: id, survey_type: 'engineering' }, existingDocs: [] })
beforeEach(() => jest.clearAllMocks())

test('actual dossier controls stay disabled throughout a pending rerun', async () => {
  let resolve!: (value: ReturnType<typeof reply>) => void
  const pending = new Promise<ReturnType<typeof reply>>(yes => { resolve = yes })
  let requests = 0
  jest.mocked(apiGet).mockImplementation(async url => url.endsWith('/validate') ? (++requests === 1 ? reply() : pending) : null)
  render(<SubmissionClient {...props('project-a')} />)
  const dossier = await screen.findByRole('button', { name: /Generate Complete Dossier/i })
  await screen.findByText('No configured check flagged an issue')
  expect(dossier).toBeEnabled()
  fireEvent.click(screen.getByRole('button', { name: 'Re-run' }))
  expect(dossier).toBeDisabled()
  fireEvent.click(dossier)
  expect(apiPost).not.toHaveBeenCalled()
  await act(async () => resolve(reply()))
  expect(dossier).toBeEnabled()
})

test('a failed verdict cannot enable exports even with zero declared block count', async () => {
  const failed = reply(); failed.gate.passed = false
  jest.mocked(apiGet).mockImplementation(async url => url.endsWith('/validate') ? failed : null)
  render(<SubmissionClient {...props('project-a')} />)
  await screen.findByText('METARDU Quality Checks')
  expect(screen.getByRole('button', { name: /Generate Complete Dossier/i })).toBeDisabled()
})

test('changing projects revokes the old project permission until the current request completes', async () => {
  let resolve!: (value: ReturnType<typeof reply>) => void
  const pending = new Promise<ReturnType<typeof reply>>(yes => { resolve = yes })
  jest.mocked(apiGet).mockImplementation(async url => url === '/api/project/project-a/validate' ? reply() : url.endsWith('/validate') ? pending : null)
  const view = render(<SubmissionClient {...props('project-a')} />)
  await screen.findByText('No configured check flagged an issue')
  view.rerender(<SubmissionClient {...props('project-b')} />)
  expect(screen.getByRole('button', { name: /Generate Complete Dossier/i })).toBeDisabled()
  await act(async () => resolve(reply()))
  expect(screen.getByRole('button', { name: /Generate Complete Dossier/i })).toBeEnabled()
})

test('all archive generation controls are blocked while validation is pending, including existing-document packages', () => {
  jest.mocked(apiGet).mockImplementation(() => new Promise(() => {}))
  const ready = { document_id: 'synthetic-doc', status: 'ready', file_url: '/synthetic.pdf' }
  render(<SubmissionClient {...props('project-a')} existingDocs={[ready as never]} />)
  expect(screen.getByRole('button', { name: /Download Full Package/i })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Generate Submission Package' })).toBeDisabled()
  for (const button of screen.getAllByRole('button', { name: /Generate.*ZIP/i })) expect(button).toBeDisabled()
})
