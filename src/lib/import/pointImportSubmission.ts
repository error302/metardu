import type { PointImportRequest } from './pointImport'
import type { PointImportReceipt } from './pointImportClient'

interface Capture {
  projectId: string
  projectName: string
  body: PointImportRequest
}

export type PointImportSubmission =
  | { status: 'editing'; error: string }
  | { status: 'submitting'; capture: Capture; attempt: 'first' | 'retry' }
  | { status: 'unconfirmed'; capture: Capture; error: string }
  | { status: 'saved'; receipt: PointImportReceipt & { projectId: string; projectName: string } }

export type PointImportSubmissionEvent =
  | { type: 'start'; capture: Capture }
  | { type: 'retry' }
  | { type: 'failed'; requestId: string; outcome: 'rejected' | 'unconfirmed'; error: string }
  | { type: 'confirmed'; receipt: PointImportReceipt }
  | { type: 'reset' }

export const initialPointImportSubmission: PointImportSubmission = { status: 'editing', error: '' }

export function pointImportSubmissionReducer(
  state: PointImportSubmission,
  event: PointImportSubmissionEvent,
): PointImportSubmission {
  switch (event.type) {
    case 'start':
      return state.status === 'editing' ? { status: 'submitting', capture: event.capture, attempt: 'first' } : state
    case 'retry':
      return state.status === 'unconfirmed' ? { status: 'submitting', capture: state.capture, attempt: 'retry' } : state
    case 'failed':
      if (state.status !== 'submitting' || state.capture.body.requestId !== event.requestId) return state
      // A retry can fail before reaching the server. Its rejection cannot resolve the first attempt.
      if (state.attempt === 'first' && event.outcome === 'rejected') return { status: 'editing', error: event.error }
      return { status: 'unconfirmed', capture: state.capture, error: event.error }
    case 'confirmed':
      if (state.status !== 'submitting' || state.capture.body.requestId !== event.receipt.requestId) return state
      return {
        status: 'saved',
        receipt: { ...event.receipt, projectId: state.capture.projectId, projectName: state.capture.projectName },
      }
    case 'reset':
      return state.status === 'editing' || state.status === 'saved' ? initialPointImportSubmission : state
  }
}
