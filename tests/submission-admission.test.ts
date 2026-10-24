/** @jest-environment node */
import { generateDocument } from '@/lib/submission/assembleDocument'
import { generateFullPackage } from '@/lib/generators/fullPackage'
import { db } from '@/lib/db'
import { loadGateInputForProject } from '@/lib/validation/statutoryGateLoader'
import { generateDeedPlan } from '@/lib/generators/deedPlan'
import { uploadFile, downloadFile } from '@/lib/storage'
import { appendAuditEntry } from '@/lib/audit/auditLog'
import { fetchSurveyorProfile } from '@/lib/survey/fetchSurveyorProfile'
import { requireSubmissionAdmission } from '@/lib/submission/submissionAdmission'
import { RULE_VERSION } from '@/lib/validation/statutoryGate'
import type { StatutoryGateResult } from '@/lib/validation/statutoryGate'
import { AppError } from '@/lib/api/errors'

jest.mock('@/lib/db', () => { const db = { query: jest.fn() }; return { __esModule: true, default: db, db } })
jest.mock('@/lib/storage', () => ({ uploadFile: jest.fn(async () => 'submissions/project/test.pdf'), getSignedUrl: jest.fn(async () => '/api/storage?path=test'), downloadFile: jest.fn(async () => Buffer.from('document')) }))
jest.mock('@/lib/survey/fetchSurveyorProfile', () => ({ fetchSurveyorProfile: jest.fn(async () => ({ surveyorName: 'Synthetic reviewer', licenseNumber: 'ISK/LS/2020/123' })) }))
jest.mock('@/lib/validation/statutoryGateLoader', () => ({
  loadGateInputForProject: jest.fn(),
  mergeGateInput: jest.requireActual<typeof import('@/lib/validation/statutoryGateLoader')>('@/lib/validation/statutoryGateLoader').mergeGateInput,
}))
jest.mock('@/lib/generators/deedPlan', () => ({ generateDeedPlan: jest.fn(async () => Buffer.from('%PDF synthetic')) }))
jest.mock('@/lib/generators/deedPlanGeometry', () => ({ loadPreAdjustedFromDB: jest.fn(), computeDeedPlanGeometry: jest.fn(async () => ({ stations: [] })) }))
jest.mock('@/lib/audit/auditLog', () => ({ appendAuditEntry: jest.fn() }))
jest.mock('@/lib/logger', () => ({ logger: { warn: jest.fn(), error: jest.fn() } }))

const ids = ['statutory-workbook', 'deed-plan', 'traverse-computation-sheet', 'area-computation', 'field-book']
const validEvidence = () => ({ surveyType: 'cadastral' as const, surveyor: { name: '', licenseNumber: '' },
  traverse: { stationCount: 4, angularMisclosureSeconds: 0, linearErrorM: 0.001, totalDistanceM: 400, precisionRatio: 400000 },
  parcels: [{ parcelNumber: 'Synthetic parcel', vertices: [{ easting: 0, northing: 0 }, { easting: 100, northing: 0 }, { easting: 100, northing: 100 }, { easting: 0, northing: 100 }] }],
})
beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(loadGateInputForProject).mockResolvedValue(null)
  jest.mocked(fetchSurveyorProfile).mockResolvedValue({ surveyorName: 'Synthetic reviewer', licenseNumber: 'ISK/LS/2020/123', firmName: '', iskNumber: '', referenceNumber: '' })
  jest.mocked(db.query).mockImplementation(async (sql: string) => ({ rows: sql.includes('FROM projects')
    ? [{ name: 'Synthetic project', survey_type: 'cadastral' }]
    : ids.map(document_id => ({ document_id, file_url: `/api/storage?path=${encodeURIComponent(`submissions/project/${document_id}.pdf`)}` })) }) as never)
})

test('missing gate evidence refuses deed generation before rendering, storage or SQL writes', async () => {
  await expect(generateDocument({ projectId: 'project', documentId: 'deed-plan', surveyType: 'cadastral' }))
    .rejects.toMatchObject({ code: 'SUBMISSION_EVIDENCE_UNAVAILABLE' })
  expect(generateDeedPlan).not.toHaveBeenCalled()
  expect(uploadFile).not.toHaveBeenCalled()
  expect(jest.mocked(db.query).mock.calls.some(([sql]) => /INSERT|UPDATE/.test(sql))).toBe(false)
})

test('an all-ready dossier cannot bypass a fresh server evidence check', async () => {
  await expect(generateFullPackage('project')).rejects.toMatchObject({ code: 'SUBMISSION_EVIDENCE_UNAVAILABLE' })
  expect(downloadFile).not.toHaveBeenCalled()
  expect(uploadFile).not.toHaveBeenCalled()
})

test('credentials alone cannot admit a cadastral submission', async () => {
  jest.mocked(loadGateInputForProject).mockResolvedValue({ surveyType: 'cadastral', surveyor: { name: '', licenseNumber: '' } })
  await expect(generateDocument({ projectId: 'project', documentId: 'deed-plan', surveyType: 'cadastral' }))
    .rejects.toMatchObject({ code: 'SUBMISSION_QUALITY_BLOCKED' })
  expect(generateDeedPlan).not.toHaveBeenCalled()
})

test('passing configured checks generate a deed and record the actual evaluated rule version', async () => {
  jest.mocked(loadGateInputForProject).mockResolvedValue(validEvidence())
  await generateDocument({ projectId: 'project', documentId: 'deed-plan', surveyType: 'cadastral' })
  expect(generateDeedPlan).toHaveBeenCalledTimes(1)
  expect(jest.mocked(appendAuditEntry).mock.calls[0]?.[0].payload.metadata?.gateRuleVersion).toBe(RULE_VERSION)
})

test('a previous passing request grants no permission to a later blocked dossier', async () => {
  jest.mocked(loadGateInputForProject).mockResolvedValue(validEvidence())
  await generateFullPackage('project')
  jest.mocked(downloadFile).mockClear()
  const changed = validEvidence(); changed.traverse.precisionRatio = 100
  jest.mocked(loadGateInputForProject).mockResolvedValue(changed)
  await expect(generateFullPackage('project')).rejects.toMatchObject({ statusCode: 422, code: 'SUBMISSION_QUALITY_BLOCKED' })
  expect(downloadFile).not.toHaveBeenCalled()
})

test('mutation output cannot use a resulting parcel as missing parent evidence', async () => {
  jest.mocked(loadGateInputForProject).mockResolvedValue(validEvidence())
  const error: unknown = await requireSubmissionAdmission('project', 'mutation-form').catch((error: unknown) => error)
  if (!(error instanceof AppError)) throw new Error('Expected an admission refusal')
  expect(error.code).toBe('SUBMISSION_QUALITY_BLOCKED')
  const { gate } = error.details as { gate: StatutoryGateResult }
  expect(gate.violations.find(v => v.field === 'parentParcel')?.assessment).toBe('UNASSESSED')
})

test.each(['loader', 'profile'])('%s infrastructure errors fail closed without leaking internals', async source => {
  jest.mocked(loadGateInputForProject).mockResolvedValue(validEvidence())
  if (source === 'loader') jest.mocked(loadGateInputForProject).mockRejectedValue(new Error('private SQL connection text'))
  else jest.mocked(fetchSurveyorProfile).mockRejectedValue(new Error('private SQL connection text'))
  const error: unknown = await requireSubmissionAdmission('project').catch((error: unknown) => error)
  expect(error).toMatchObject({ statusCode: 503, code: 'SUBMISSION_EVIDENCE_UNAVAILABLE' })
  if (!(error instanceof Error)) throw new Error('Expected an error response')
  expect(error.message).not.toContain('private SQL')
})
