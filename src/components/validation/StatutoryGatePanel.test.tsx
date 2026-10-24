import { fireEvent, render, screen } from '@testing-library/react'
import { apiGet } from '@/lib/api/client'
import { StatutoryGatePanel } from './StatutoryGatePanel'
import { runStatutoryGate, formatGateResult } from '@/lib/validation/statutoryGate'

jest.mock('@/lib/api/client', () => ({ apiGet: jest.fn(), apiInvalidate: jest.fn(), ApiError: class extends Error {} }))

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
