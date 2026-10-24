import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useSession } from 'next-auth/react'
import Page from '@/app/project/[id]/topo/page'
import type { DrawingEntity } from '@/lib/drawing/topoEntities'
import { createHash, webcrypto } from 'node:crypto'
import { canonicalJson } from '@/lib/provenance/canonicalJson'
import { surfaceRequestSchema, surfaceRequestPayload, surfaceExportRequestSchema, surfaceExportPayload } from '@/lib/topo/surfaceRequest'

let projectId = '11111111-1111-4111-8111-111111111111'
jest.mock('next/navigation', () => ({ useParams: () => ({ id: projectId }) }))
jest.mock('next-auth/react', () => ({ useSession: jest.fn() }))
jest.mock('next/dynamic', () => () => function Canvas({ entities }: { entities: DrawingEntity[] }) { return <div data-testid="preview">{JSON.stringify(entities.filter(entity => entity.kind === 'point'))}</div> })
const REVISION = '22222222-2222-4222-8222-222222222222'
const OWNER = '99999999-9999-4999-8999-999999999999'
const CRS = 'EPSG:21037'
const ids = [1, 2, 3, 4].map(value => `33333333-3333-4333-8333-33333333333${value}`)
const reference = { version: 1, prs: { horizontalCrs: 'EPSG:21037', datum: 'Arc 1960', zone: 37, hemisphere: 'S', units: 'metres', distanceMode: 'grid', verticalDatum: 'Synthetic BM', heightType: 'local', coordinatePrecision: 3 }, declaredAt: '2026-10-23T00:00:00Z' }
const observations = ids.map((id, i) => ({ id, point_name: `P${i}`, easting: 500100 + i * 10, northing: 9850000 + i * 10, elevation: i === 3 ? null : i - 2, code: 'UNK', description: null, horizontal_crs: CRS, vertical_datum: 'Synthetic BM' }))
const saved = () => ({ projectId, revisionId: REVISION, revision: 1, name: 'Original ground', crs: 'EPSG:21037', verticalDatum: 'Synthetic BM', inputHash: 'b'.repeat(64), fieldVerified: false,
  contours: [], snapshot: { observations: observations.slice(0, 3).map(point => ({ id: point.id, pointName: point.point_name, x: point.easting - 100, y: point.northing, z: point.elevation, code: point.code })) } })
const reply = (body: unknown, ok = true) => ({ ok, json: async () => body })
const fetchMock = jest.fn<Promise<ReturnType<typeof reply>>, [string, RequestInit?]>()
beforeEach(() => {
  localStorage.clear()
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true })
  Object.defineProperty(navigator, 'locks', { value: { request: async (_name: string, work: () => Promise<unknown>) => work() }, configurable: true })
  projectId = '11111111-1111-4111-8111-111111111111'
  jest.mocked(useSession).mockReturnValue({ data: { user: { id: OWNER }, expires: '2099' }, status: 'authenticated', update: jest.fn() })
  global.fetch = fetchMock as unknown as typeof fetch
  fetchMock.mockReset().mockImplementation(async (url: string, options?: RequestInit) => {
    if (url.includes('points?')) return reply({ data: observations, meta: { project_id: projectId } })
    if (url.includes('point-imports')) return reply({ data: { referenceSystem: reference, referenceHash: 'a'.repeat(64) } })
    if (url.includes('contourRevision=')) return reply({ data: saved() })
    if (options?.method === 'POST' && url.includes('/surfaces')) {
      const body = surfaceRequestSchema.parse(JSON.parse(String(options.body)))
      return reply({ data: { revisionId: REVISION, requestId: body.requestId, requestHash: createHash('sha256').update(canonicalJson(surfaceRequestPayload(body))).digest('hex') } })
    }
    if (url === '/api/topo/export/dxf') {
      const body = surfaceExportRequestSchema.parse(JSON.parse(String(options?.body)))
      return reply({ error: 'DXF export requires a paid plan.', details: { requestOutcome: 'rejected', requestId: body.requestId, payloadHash: createHash('sha256').update(canonicalJson(surfaceExportPayload(body))).digest('hex') } }, false)
    }
    return reply({ data: { revisions: [{ revision_id: REVISION, name: 'Original ground', revision: 1 }], historyLimited: false } })
  })
})
async function loaded() {
  await screen.findByText('P0')
  await waitFor(() => expect(screen.getByRole('button', { name: /Reload observations/ })).toBeEnabled())
}
test('unknown heights stay visible and measured zero stays selected; computation needs explicit ground review', async () => {
  render(<Page />); await loaded()
  expect(screen.getByText('Unknown')).toBeInTheDocument()
  expect(screen.getByRole('checkbox', { name: 'Ground point P3' })).toBeDisabled()
  expect(screen.getByRole('checkbox', { name: 'Ground point P2' })).toBeChecked()
  const compute = screen.getByRole('button', { name: 'Compute new draft revision' })
  expect(compute).toBeDisabled()
  fireEvent.click(screen.getByRole('checkbox', { name: /I reviewed/ })); fireEvent.click(compute)
  await screen.findByTestId('preview')
  const request = fetchMock.mock.calls.find(([url, options]) => url.endsWith('/surfaces') && options?.method === 'POST')
  expect(JSON.parse(String(request?.[1]?.body)) as unknown).toMatchObject({ pointIds: ids.slice(0, 3), expectedReferenceHash: 'a'.repeat(64), useStoredBreaklines: false })
})
test('restoring a historical revision previews its retained source instead of current observations, including a flat empty-contour result', async () => {
  render(<Page />); await loaded()
  fireEvent.change(screen.getByRole('combobox', { name: 'Saved revision' }), { target: { value: REVISION } })
  const preview = await screen.findByTestId('preview')
  expect(preview).toHaveTextContent('500000')
  expect(preview).not.toHaveTextContent('500100')
  expect(screen.getByRole('button', { name: /Export registered/ })).toBeEnabled()
})
test('DXF sends only the exact selected revision, and a denied paid export is visible', async () => {
  render(<Page />); await loaded()
  fireEvent.change(screen.getByRole('combobox', { name: 'Saved revision' }), { target: { value: REVISION } })
  fireEvent.click(await screen.findByRole('button', { name: /Export registered/ }))
  expect(await screen.findByRole('alert')).toHaveTextContent('requires a paid plan')
  const request = fetchMock.mock.calls.find(([url]) => url === '/api/topo/export/dxf')
  expect(JSON.parse(String(request?.[1]?.body)) as unknown).toEqual({ projectId, surfaceRevisionId: REVISION, expectedUserId: OWNER, requestId: expect.any(String) as unknown })
})
test('changing the ground selection revokes the previous review', async () => {
  render(<Page />); await loaded()
  const review = screen.getByRole('checkbox', { name: /I reviewed/ })
  fireEvent.click(review); fireEvent.click(screen.getByRole('checkbox', { name: 'Ground point P0' }))
  expect(review).not.toBeChecked()
  expect(screen.getByRole('button', { name: 'Compute new draft revision' })).toBeDisabled()
})

test('reviewed boundary, exclusion and ordered original breakline are sent in the durable computation',async()=>{
  render(<Page/>);await loaded()
  fireEvent.click(screen.getByRole('checkbox',{name:'Use a reviewed terrain boundary'}))
  fireEvent.change(screen.getByRole('textbox',{name:'Boundary source or field-note reference'}),{target:{value:'Synthetic field-note test'}})
  fireEvent.change(screen.getByRole('textbox',{name:'Area 1 outer boundary'}),{target:{value:'500101,9850001\n500119,9850001\n500119,9850019\n500101,9850019'}})
  fireEvent.click(screen.getByRole('button',{name:'Add exclusion to area 1'}))
  fireEvent.change(screen.getByRole('textbox',{name:'Area 1 exclusion 1'}),{target:{value:'500108,9850008\n500112,9850008\n500112,9850012\n500108,9850012'}})
  fireEvent.click(screen.getByRole('button',{name:'Add measured point-chain breakline'}))
  fireEvent.change(screen.getByRole('combobox',{name:'Breakline 1 point 1'}),{target:{value:ids[0]}})
  fireEvent.change(screen.getByRole('combobox',{name:'Breakline 1 point 2'}),{target:{value:ids[2]}})
  const compute=screen.getByRole('button',{name:'Compute new draft revision'})
  fireEvent.click(screen.getByRole('checkbox',{name:/I reviewed/}))
  expect(compute).toBeDisabled()
  fireEvent.click(screen.getByRole('checkbox',{name:/These definitions use the stated project basis/}))
  expect(compute).toBeEnabled()
  fireEvent.click(compute)
  await screen.findByTestId('preview')
  const request=fetchMock.mock.calls.find(([url,options])=>url.endsWith('/surfaces')&&options?.method==='POST')
  expect(JSON.parse(String(request?.[1]?.body))).toMatchObject({
    expectedReferenceHash:'a'.repeat(64),pointIds:ids.slice(0,3),
    terrainDomain:{horizontalCrs:CRS,units:'metres',supportUseReviewed:true,sourceLabel:'Synthetic field-note test'},
    breaklineChains:[{reviewed:true,pointIds:[ids[0],ids[2]]}],
  })
})
test('an unconfirmed computation revokes review and directs the user to retained records before retrying', async () => {
  const implementation = fetchMock.getMockImplementation()
  fetchMock.mockImplementation((url, options) => {
    if (options?.method === 'POST' && url.endsWith('/surfaces')) throw new TypeError('Failed to fetch')
    if (!implementation) throw new Error('Missing test fixture.')
    return implementation(url, options)
  })
  render(<Page />); await loaded()
  const review = screen.getByRole('checkbox', { name: /I reviewed/ })
  fireEvent.click(review); fireEvent.click(screen.getByRole('button', { name: 'Compute new draft revision' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Use request recovery')
  expect(review).not.toBeChecked()
  expect(screen.getByRole('button', { name: 'Compute new draft revision' })).toBeDisabled()
  expect(screen.queryByTestId('preview')).not.toBeInTheDocument()
  expect(screen.getByRole('region', { name: 'Pending request recovery' })).toBeInTheDocument()
})
test('an unconfirmed request survives reload and retry sends the same original wire identity', async () => {
  const original = fetchMock.getMockImplementation()
  fetchMock.mockImplementation((url, options) => {
    if (url.endsWith('/surfaces') && options?.method === 'POST') throw new TypeError('Lost response')
    if (!original) throw new Error('Missing fixture')
    return original(url, options)
  })
  const view = render(<Page />); await loaded()
  fireEvent.click(screen.getByRole('checkbox', { name: /I reviewed/ })); fireEvent.click(screen.getByRole('button', { name: 'Compute new draft revision' }))
  await screen.findByRole('alert'); const first = fetchMock.mock.calls.find(([url, options]) => url.endsWith('/surfaces') && options?.method === 'POST')?.[1]?.body
  view.unmount()
  if (!original) throw new Error('Missing fixture')
  fetchMock.mockImplementation(original)
  render(<Page />); await loaded()
  expect(screen.getByRole('region', { name: 'Pending request recovery' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Compute new draft revision' })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: 'Retry original request' })); await screen.findByTestId('preview')
  await waitFor(() => expect(screen.queryByRole('region', { name: 'Pending request recovery' })).not.toBeInTheDocument())
  const requests = fetchMock.mock.calls.filter(([url, options]) => url.endsWith('/surfaces') && options?.method === 'POST')
  expect(requests).toHaveLength(2); expect(requests[1][1]?.body).toBe(first)
})
test('missing cross-tab locking prevents a new network mutation', async () => {
  Object.defineProperty(navigator, 'locks', { value: undefined, configurable: true })
  render(<Page />); await loaded()
  fireEvent.click(screen.getByRole('checkbox', { name: /I reviewed/ })); fireEvent.click(screen.getByRole('button', { name: 'Compute new draft revision' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('browser session lock is unavailable')
  expect(fetchMock.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(0)
})
test('read-only recovery adds a just-committed result to a previously empty revision selector', async () => {
  const original = fetchMock.getMockImplementation()
  let ack: { revisionId: string; requestId: string; requestHash: string } | undefined
  fetchMock.mockImplementation((url, options) => {
    if (url.endsWith('/surfaces') && options?.method === 'POST') {
      const body = surfaceRequestSchema.parse(JSON.parse(String(options.body)))
      ack = { revisionId: REVISION, requestId: body.requestId, requestHash: createHash('sha256').update(canonicalJson(surfaceRequestPayload(body))).digest('hex') }
      throw new TypeError('Lost response after commit')
    }
    if (url.includes('requestId=')) return Promise.resolve(reply({ data: ack }))
    if (url.endsWith('/surfaces')) return Promise.resolve(reply({ data: { revisions: [], historyLimited: false } }))
    if (!original) throw new Error('Missing fixture')
    return original(url, options)
  })
  const view = render(<Page />); await loaded()
  fireEvent.click(screen.getByRole('checkbox', { name: /I reviewed/ })); fireEvent.click(screen.getByRole('button', { name: 'Compute new draft revision' })); await screen.findByRole('alert')
  view.unmount(); render(<Page />); await loaded()
  fireEvent.click(screen.getByRole('button', { name: 'Check saved result' })); await screen.findByTestId('preview')
  await waitFor(() => expect(screen.getByRole('combobox', { name: 'Saved revision' })).toHaveValue(REVISION))
})
test('sign-out clears both private source and saved preview immediately', async () => {
  const view = render(<Page />); await loaded()
  fireEvent.change(screen.getByRole('combobox', { name: 'Saved revision' }), { target: { value: REVISION } }); await screen.findByTestId('preview')
  jest.mocked(useSession).mockReturnValue({ data: null, status: 'unauthenticated', update: jest.fn() }); view.rerender(<Page />)
  expect(screen.queryByText('P0')).not.toBeInTheDocument(); expect(screen.queryByTestId('preview')).not.toBeInTheDocument()
})
test('late saved-revision responses cannot cross a project switch', async () => {
  const original = saved(), pending: { resolve?: (value: ReturnType<typeof reply>) => void } = {}
  const promise = new Promise<ReturnType<typeof reply>>(resolve => { pending.resolve = resolve })
  const implementation = fetchMock.getMockImplementation()
  fetchMock.mockImplementation((url: string, options?: RequestInit) => {
    if (!implementation) throw new Error('Missing test fixture.')
    return url.includes('contourRevision=') ? promise : implementation(url, options)
  })
  const view = render(<Page />); await loaded()
  fireEvent.change(screen.getByRole('combobox', { name: 'Saved revision' }), { target: { value: REVISION } })
  projectId = '44444444-4444-4444-8444-444444444444'; view.rerender(<Page />)
  await act(async () => { pending.resolve?.(reply({ data: original })); await promise })
  await loaded(); expect(screen.queryByTestId('preview')).not.toBeInTheDocument()
})
