import {
  initialPointImportSubmission,
  pointImportSubmissionReducer,
  type PointImportSubmission,
} from '../pointImportSubmission'

const capture = {
  projectId: 'project-a',
  projectName: 'Synthetic road',
  body: {
    requestId: 'request-a', fileName: 'points.csv', sourceText: 'P1,1,2', fileSize: 6,
    sourceFileHash: 'a'.repeat(64), expectedReferenceHash: 'b'.repeat(64), selectedIndices: [0],
    options: { format: 'csv' as const }, sourceCrs: 'EPSG:' + 32737,
    coordinateUnit: 'metres' as const, heightUnit: 'metres' as const,
    confirmTransformation: false, confirmVerticalDatum: false, confirmWarnings: false,
  },
}
const receipt = {
  requestId: capture.body.requestId, batchId: 'batch-a', sourceFileHash: capture.body.sourceFileHash,
  inputHash: 'c'.repeat(64), imported: 1, pointIds: ['point-a'], replayed: true, fieldVerified: false as const,
}
const start = () => pointImportSubmissionReducer(initialPointImportSubmission, { type: 'start', capture })

test('an unconfirmed import cannot be replaced or reset, and retry carries the original request', () => {
  const unresolved = pointImportSubmissionReducer(start(), {
    type: 'failed', requestId: capture.body.requestId, outcome: 'unconfirmed', error: 'Connection lost',
  })
  expect(pointImportSubmissionReducer(unresolved, { type: 'reset' })).toBe(unresolved)
  expect(pointImportSubmissionReducer(unresolved, { type: 'start', capture: { ...capture, projectId: 'project-b' } })).toBe(unresolved)
  expect(pointImportSubmissionReducer(unresolved, { type: 'retry' })).toEqual({ status: 'submitting', capture, attempt: 'retry' })
})

test('a stale event cannot change an active or confirmed import', () => {
  const submitting = start()
  expect(pointImportSubmissionReducer(submitting, { type: 'confirmed', receipt: { ...receipt, requestId: 'stale' } })).toBe(submitting)
  expect(pointImportSubmissionReducer(submitting, { type: 'failed', requestId: 'stale', outcome: 'rejected', error: 'Expired' })).toBe(submitting)
  const saved: PointImportSubmission = pointImportSubmissionReducer(submitting, { type: 'confirmed', receipt })
  expect(saved).toEqual({ status: 'saved', receipt: { ...receipt, projectId: capture.projectId, projectName: capture.projectName } })
  expect(pointImportSubmissionReducer(saved, { type: 'failed', requestId: capture.body.requestId, outcome: 'rejected', error: 'Expired' })).toBe(saved)
  expect(pointImportSubmissionReducer(saved, { type: 'reset' })).toBe(initialPointImportSubmission)
})
