import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { StrictMode } from 'react'
import { apiGet } from '@/lib/api/client'
import { StatutoryGatePanel } from './StatutoryGatePanel'
import { runStatutoryGate, formatGateResult } from '@/lib/validation/statutoryGate'

jest.mock('@/lib/api/client', () => ({ apiGet: jest.fn(), apiInvalidate: jest.fn(), ApiError: class extends Error {} }))

beforeEach(() => jest.clearAllMocks())

function gateReply(blocked: boolean) {
  const gate = runStatutoryGate({ surveyType: 'engineering', surveyor: { name: 'Synthetic checker', licenseNumber: 'ISK/LS/2020/123' },
    engineering: { horizontalCurveRadiusM: 300, ...(blocked ? {} : { criteria: { reference: 'Synthetic criteria revision', minimumRadiusM: 250 } }) } })
  return { gate, formatted: formatGateResult(gate) }
}

function pendingReply() {
  let resolve!: (value: ReturnType<typeof gateReply>) => void
  let reject!: (reason: Error) => void
  const promise = new Promise<ReturnType<typeof gateReply>>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

test('revokes a successful parent result immediately while a rerun is pending', async () => {
  const pending = pendingReply(), onResult = jest.fn()
  jest.mocked(apiGet).mockResolvedValueOnce(gateReply(false)).mockImplementationOnce(() => pending.promise)
  render(<StatutoryGatePanel projectId="project-a" onResult={onResult} />)
  await screen.findByText('No configured check flagged an issue')
  fireEvent.click(screen.getByRole('button', { name: 'Re-run' }))
  expect(onResult).toHaveBeenLastCalledWith(null)
  await act(async () => pending.resolve(gateReply(true)))
  expect(await screen.findByText('METARDU checks block export')).toBeInTheDocument()
  expect(onResult).toHaveBeenLastCalledWith(expect.objectContaining({ passed: false }))
})

test.each(['success', 'failure'])('ignores an old project request completing with %s', async outcome => {
  const first = pendingReply(), second = pendingReply(), onResult = jest.fn()
  jest.mocked(apiGet).mockImplementationOnce(() => first.promise).mockImplementationOnce(() => second.promise)
  const view = render(<StatutoryGatePanel projectId="project-a" onResult={onResult} />)
  view.rerender(<StatutoryGatePanel projectId="project-b" onResult={onResult} />)
  await act(async () => second.resolve(gateReply(true)))
  await screen.findByText('METARDU checks block export')
  const calls = onResult.mock.calls.length
  await act(async () => { if (outcome === 'success') first.resolve(gateReply(false)); else first.reject(new Error('Old project failed')) })
  expect(screen.getByText('METARDU checks block export')).toBeInTheDocument()
  expect(screen.queryByText('Validation Unavailable')).not.toBeInTheDocument()
  expect(onResult).toHaveBeenCalledTimes(calls)
})

test('does not refetch just because the parent callback identity changes', async () => {
  jest.mocked(apiGet).mockResolvedValue(gateReply(false))
  const first = jest.fn(), second = jest.fn()
  const view = render(<StatutoryGatePanel projectId="project-a" onResult={first} />)
  await screen.findByText('No configured check flagged an issue')
  view.rerender(<StatutoryGatePanel projectId="project-a" onResult={second} />)
  await waitFor(() => expect(apiGet).toHaveBeenCalledTimes(1))
})

test('does not notify the parent after an in-flight request is unmounted', async () => {
  const pending = pendingReply(), onResult = jest.fn()
  jest.mocked(apiGet).mockImplementationOnce(() => pending.promise)
  const view = render(<StatutoryGatePanel projectId="project-a" onResult={onResult} />)
  view.unmount()
  const calls = onResult.mock.calls.length
  await act(async () => pending.resolve(gateReply(false)))
  expect(onResult).toHaveBeenCalledTimes(calls)
})

test('effect replay ignores an earlier request for the same project', async () => {
  const first = pendingReply(), second = pendingReply(), onResult = jest.fn()
  jest.mocked(apiGet).mockImplementationOnce(() => first.promise).mockImplementationOnce(() => second.promise)
  render(<StrictMode><StatutoryGatePanel projectId="project-a" onResult={onResult} /></StrictMode>)
  await act(async () => second.resolve(gateReply(true)))
  await screen.findByText('METARDU checks block export')
  const calls = onResult.mock.calls.length
  await act(async () => first.resolve(gateReply(false)))
  expect(screen.getByText('METARDU checks block export')).toBeInTheDocument()
  expect(onResult).toHaveBeenCalledTimes(calls)
})

test('a failed rerun keeps the prior pass revoked until an explicit retry succeeds', async () => {
  const pending = pendingReply(), onResult = jest.fn()
  jest.mocked(apiGet).mockResolvedValueOnce(gateReply(false)).mockImplementationOnce(() => pending.promise).mockResolvedValueOnce(gateReply(false))
  render(<StatutoryGatePanel projectId="project-a" onResult={onResult} />)
  await screen.findByText('No configured check flagged an issue')
  fireEvent.click(screen.getByRole('button', { name: 'Re-run' }))
  await act(async () => pending.reject(new Error('Synthetic validation outage')))
  await screen.findByText('Validation Unavailable')
  expect(onResult).toHaveBeenLastCalledWith(null)
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
  await screen.findByText('No configured check flagged an issue')
  expect(onResult).toHaveBeenLastCalledWith(expect.objectContaining({ passed: true }))
})

test('unassessed road evidence stays visible when informational findings are collapsed', async () => {
  const response = { formatted: 'Synthetic unassessed road check', gate: { passed: true, profile: 'engineering', evaluatedAt: '2026-10-23T00:00:00Z', ruleVersion: '1.3.0',
    summary: { block: 0, warn: 0, info: 1, total: 1 }, violations: [{ rule: 'metardu_qc.road_unassessed', source: 'metardu_qc', severity: 'info', field: 'engineering',
      assessment: 'UNASSESSED', standardCompliance: 'NOT_ASSESSED', message: 'Road design is unassessed: no road measurements/criteria were requested.' }] } }
  jest.mocked(apiGet).mockImplementation(async (_url, schema) => {
    if (!schema) throw new Error('Response schema required')
    return schema.parse(response)
  })
  render(<StatutoryGatePanel projectId="synthetic-project" />)
  expect(await screen.findByText('Road checks unassessed')).toBeInTheDocument()
  expect(screen.getByRole('status')).toHaveTextContent('no road measurements/criteria were requested')
  expect(screen.queryByText('No configured check flagged an issue')).not.toBeInTheDocument()
})

test.each([false, true])('actual gate data survives response parsing and parent notification, criteria supplied=%s', supplied => {
  const gate = runStatutoryGate({ surveyType: 'engineering', surveyor: { name: 'Synthetic checker', licenseNumber: 'ISK/LS/2020/123' },
    engineering: { horizontalCurveRadiusM: 300, ...(supplied ? { criteria: { reference: 'Synthetic criteria revision', minimumRadiusM: 250 } } : {}) } })
  jest.mocked(apiGet).mockImplementation(async (_url, schema) => {
    if (!schema) throw new Error('Response schema required')
    return schema.parse({ gate, formatted: formatGateResult(gate) })
  })
  const onResult = jest.fn()
  render(<StatutoryGatePanel projectId="synthetic-project" onResult={onResult} />)
  return screen.findByText(supplied ? 'No configured check flagged an issue' : 'METARDU checks block export').then(() => {
    expect(onResult).toHaveBeenLastCalledWith(expect.objectContaining({ passed: supplied }))
    if (supplied) fireEvent.click(screen.getByRole('button', { name: /Show 1 finding/i }))
    expect(screen.getByText(supplied ? /Only this comparison is assessed/ : /Horizontal radius unassessed/)).toBeInTheDocument()
  })
})
