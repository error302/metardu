/** @jest-environment jsdom */
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { TopologyGuardrail } from '@/components/survey/TopologyGuardrail'
import type { TopologyCheckResult } from '@/lib/survey/topologyChecker'
const mockCheck = jest.fn<Promise<TopologyCheckResult>, [unknown]>()
jest.mock('@/lib/survey/topologyChecker', () => ({ runTopologyCheck: (input: unknown) => mockCheck(input) }))
jest.mock('@/lib/logger', () => ({ logger: { error: jest.fn() } }))
beforeEach(() => { jest.useFakeTimers(); jest.clearAllMocks(); Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }) })
afterEach(() => jest.useRealTimers())
const vertices = [{ easting: 500000, northing: 9800000 }, { easting: 500010, northing: 9800000 }, { easting: 500010, northing: 9800010 }]
const clear: TopologyCheckResult = { issues: [], hasErrors: false, hasWarnings: false, isValid: true }
test('failed checks clear an earlier pass and cannot claim submission readiness', async () => {
  mockCheck.mockResolvedValueOnce(clear).mockRejectedValueOnce(new Error('Geometry failed'))
  const host = document.createElement('div'), root = createRoot(host)
  await act(async () => root.render(<TopologyGuardrail vertices={vertices} epsg={'EPSG:' + 32736} />))
  await act(async () => { jest.advanceTimersByTime(300) })
  expect(host.textContent).toContain('Available topology checks passed')
  expect(host.textContent).not.toContain('Safe for registry submission')
  await act(async () => root.render(<TopologyGuardrail vertices={vertices.map(p => ({ ...p, easting: p.easting + 1 }))} epsg={'EPSG:' + 32736} />))
  expect(host.textContent).not.toContain('Available topology checks passed')
  await act(async () => { jest.advanceTimersByTime(300) })
  expect(host.textContent).toContain('Topology check could not be completed')
  await act(async () => root.unmount())
})
test('a stale completion cannot overwrite the result for new geometry or a missing CRS', async () => {
  let finishOld: (value: TopologyCheckResult) => void = () => { throw new Error('No pending check') }
  mockCheck.mockImplementationOnce(() => new Promise(resolve => { finishOld = resolve }))
  const host = document.createElement('div'), root = createRoot(host)
  await act(async () => root.render(<TopologyGuardrail vertices={vertices} epsg={'EPSG:' + 32736} />))
  await act(async () => { jest.advanceTimersByTime(300) })
  await act(async () => root.render(<TopologyGuardrail vertices={vertices} epsg={null} />))
  await act(async () => { jest.advanceTimersByTime(300); finishOld(clear) })
  expect(host.textContent).toContain('Topology check could not be completed')
  expect(host.textContent).not.toContain('Available topology checks passed')
  expect(mockCheck).toHaveBeenCalledTimes(1)
  await act(async () => root.unmount())
})
