/** @jest-environment jsdom */
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { QADashboard } from '@/components/dashboard/QADashboard'
jest.mock('@/lib/survey/topologyChecker', () => ({ runTopologyCheck: async () => ({ issues: [] }) }))
const originalFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = originalFetch })
const declaredReference = { code: 'EPSG:21037', name: 'Synthetic Arc 1960', source: 'declared' as const, hemisphere: 'S' as const, verticalDatum: null, distanceMode: 'grid' as const }
beforeAll(()=>{Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })})
test('an empty project cannot be marked ready for submission', async()=>{
  const host=document.createElement('div'); document.body.appendChild(host)
  const root=createRoot(host)
  await act(async()=>{root.render(<QADashboard projectId="fictional" />)})
  expect(host.textContent).toContain('Generated plans require surveyor review before submission')
  expect(host.textContent).not.toContain('READY FOR SUBMISSION')
  expect(host.textContent).not.toContain('All quality checks passed')
  await act(async()=>root.unmount());host.remove()
})

test('geometry cannot manufacture document compliance or submission readiness, and failed saves can be retried', async () => {
 const success = new Response('{}', { status: 201 }); Object.defineProperty(success, 'ok', { value: true })
 const failure = new Response('{}', { status: 503 }); Object.defineProperty(failure, 'ok', { value: false })
 const fetchMock = jest.fn<Promise<Response>, [RequestInfo | URL, RequestInit?]>().mockResolvedValueOnce(failure).mockResolvedValue(success)
 globalThis.fetch = fetchMock
 const host=document.createElement('div');document.body.appendChild(host);const root=createRoot(host)
 const props = { projectId: 'synthetic', reference: declaredReference, parentAreaHa: 0.01,
   parcels: [{ id: 'parcel', lrNumber: 'SYN', vertices: [{ easting: 0, northing: 0 }, { easting: 10, northing: 0 }, { easting: 10, northing: 10 }, { easting: 0, northing: 10 }] }],
   traverseData: { linearErrorM: 0.01, totalDistanceM: 40, angularMisclosureSec: -100, stationCount: 4 } }
 await act(async()=>root.render(<QADashboard {...props} />))
 expect(host.textContent).toContain('A generated document has not been reviewed by a licensed surveyor.')
 expect(host.textContent).toContain('METARDU does not certify legal or registry compliance.')
 expect(host.textContent).toContain('A surveyor has not completed the manual handoff review')
 expect(host.textContent).toContain('NOT READY — FIX ERRORS')
 expect(host.textContent).not.toContain('READY FOR SUBMISSION')
 expect(host.textContent).not.toContain('READY WITH WARNINGS')
 expect(host.textContent).toContain('100.0"')
 expect(host.textContent).toContain('this run was not saved')
 await act(async()=>{ (host.querySelector('button') as HTMLButtonElement).click() })
 expect(fetchMock).toHaveBeenCalledTimes(2)
 expect(host.textContent).toContain('Saved as reported QA evidence')
 const text = fetchMock.mock.calls[1][1]?.body
 expect(typeof text).toBe('string')
 const body = JSON.parse(String(text)) as { inputSnapshot: string; results: Array<{ checkType: string }> }
 expect((JSON.parse(body.inputSnapshot) as { traverseData: { angularMisclosureSec: number } }).traverseData.angularMisclosureSec).toBe(-100)
 expect(body.results.find((r: {checkType: string})=>r.checkType === 'dashboard.trav-angular')).toMatchObject({ result: 'FAIL', measuredValue: 100, unit: 'arcsec', details: { comparison: 'lte' } })
 // Same verdict/count with new measurements must produce new evidence.
 await act(async()=>root.render(<QADashboard {...props} traverseData={{ ...props.traverseData, angularMisclosureSec: -101 }} />))
 expect(fetchMock).toHaveBeenCalledTimes(3)
 await act(async()=>root.unmount());host.remove()
})
test('missing independent angle readings remain pending after linear closure passes',async()=>{
 const host=document.createElement('div');document.body.appendChild(host);const root=createRoot(host)
 await act(async()=>root.render(<QADashboard projectId="fictional" reference={declaredReference} traverseData={{linearErrorM:0.01,totalDistanceM:360,angularMisclosureSec:NaN,stationCount:4}} />))
 expect(host.textContent).toContain('Independent angular observations were not supplied.')
 expect(host.textContent).not.toContain('READY FOR SUBMISSION')
 await act(async()=>root.unmount());host.remove()
})
