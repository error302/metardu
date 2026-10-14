import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import FieldSetOutPage from '../page'
import { listDevicePlumbReadings } from '@/lib/field/verticalityQueue'

jest.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams('projectId=project-1&mode=plumb') }))
jest.mock('next-auth/react', () => ({ useSession: () => ({ status: 'authenticated', data: { user: { id: 'alice' } } }) }))
jest.mock('next/link', () => ({ __esModule: true, default: ({ href, children, ...props }: { href: string; children: React.ReactNode; [key: string]: unknown }) => React.createElement('a', { href, ...props }, children) }))
jest.mock('@/lib/field/setoutQueue', () => ({ cacheSetoutDefinitionList: jest.fn().mockResolvedValue(undefined), cacheSetoutDefinitionPlan: jest.fn().mockResolvedValue(undefined), deliverShot: jest.fn(), flushQueuedShots: jest.fn().mockResolvedValue({ delivered: 0, queued: 0 }), getCachedSetoutProjectPlan: jest.fn().mockResolvedValue(null), listQueuedShots: jest.fn().mockResolvedValue([]), saveShotLocally: jest.fn() }))
let container: HTMLDivElement, root: Root
const fixtureCrs = 'EPSG:21037'
const firstId = 'd8aa0101-6066-4700-ae25-302c05d8bf81'
const secondId = 'd8aa0101-6066-4700-ae25-302c05d8bf82'
beforeEach(() => {
  localStorage.clear()
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  let nextId = false
  Object.defineProperty(crypto, 'randomUUID', { configurable: true, value: () => { const id = nextId ? secondId : firstId; nextId = true; return id } })
  global.fetch = jest.fn(async (_url: string, options?: RequestInit) => {
    if (options?.method === 'POST') throw new Error('offline')
    return { ok: true, status: 200, json: async () => ({ referenceSystem: { prs: { horizontalCrs: fixtureCrs, verticalDatum: 'BM1', distanceMode: 'grid' } }, data: { definitions: [], register: [], verticality: [] } }) }
  }) as unknown as typeof fetch
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container)
})
afterEach(async () => { await act(async () => root.unmount()); container.remove(); jest.restoreAllMocks() })
async function input(label: string, value: string) {
  const element = container.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)
  if (!element) throw new Error(`Missing field: ${label}`)
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(element, value)
    element.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
async function enterReading() {
  await act(async () => root.render(<FieldSetOutPage />))
  for (const [label, value] of [['Column label', 'C1'], ['Base easting', '500000.0001234567'], ['Base northing', '9800000'], ['Top easting', '500000.0041234567'], ['Top northing', '9800000']]) await input(label, value)
}
test('plumb mode opens the field form with unknown measurements retained as blanks', async () => {
  await act(async () => root.render(<FieldSetOutPage />))
  const base = container.querySelector<HTMLInputElement>('input[aria-label="Base easting"]')
  expect(base).not.toBeNull()
  expect(base?.value).toBe('')
  expect(container.textContent).toContain('Column plumb observations')
  expect(container.querySelector<HTMLButtonElement>('button[data-action="record-plumb"]')?.disabled).toBe(true)
})
test('offline recording retains exact unassessed evidence before clearing the next-entry form', async () => {
  await enterReading()
  await act(async () => container.querySelector<HTMLButtonElement>('button[data-action="record-plumb"]')?.click())
  const records = listDevicePlumbReadings('alice', 'project-1')
  expect(records).toHaveLength(1)
  expect(records[0].snapshot.base.easting).toBe(500000.0001234567)
  expect(records[0].snapshot.base.rl).toBeNull()
  expect(records[0].snapshot.assessment.result).toBe('INFO')
  expect(records[0].state).toBe('queued')
  expect(container.textContent).toContain('Only on this device')
  expect(container.querySelector<HTMLInputElement>('input[aria-label="Base easting"]')?.value).toBe('')
})
test('double tapping record cannot create two separate observations from the same action', async () => {
  await enterReading()
  const button = container.querySelector<HTMLButtonElement>('button[data-action="record-plumb"]')
  await act(async () => { button?.click(); button?.click() })
  expect(listDevicePlumbReadings('alice', 'project-1')).toHaveLength(1)
})
test('device quota failure leaves measurements in the form without attempting server delivery', async () => {
  await enterReading()
  const nativeSet = Storage.prototype.setItem
  jest.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key: string, value: string) {
    if (key.includes(':reading:')) throw new Error('quota exceeded')
    nativeSet.call(this, key, value)
  })
  await act(async () => container.querySelector<HTMLButtonElement>('button[data-action="record-plumb"]')?.click())
  expect(listDevicePlumbReadings('alice', 'project-1')).toHaveLength(0)
  expect(container.querySelector<HTMLInputElement>('input[aria-label="Base easting"]')?.value).toBe('500000.0001234567')
  const requests = jest.mocked(fetch).mock.calls
  expect(requests.some(([, options]) => options?.method === 'POST')).toBe(false)
})
test('a complete numerical comparison preserves issued criteria and clears observation-specific uncertainty for the next reading', async () => {
  await enterReading()
  for (const [label, value] of [['Base RL', '100'], ['Top RL', '103'], ['Displacement uncertainty (m)', '0.001'], ['Height-difference uncertainty (m)', '0.001'], ['Observed height reference', 'BM1'], ['Device capture UTC (ISO timestamp)', '2026-10-14T06:00:00Z'], ['Criteria name', 'Synthetic issued criteria'], ['Drawing / specification reference', 'Synthetic drawing C1'], ['Criteria revision', 'R1'], ['Named project approver', 'Synthetic reviewer'], ['Maximum offset (m)', '0.025'], ['Minimum tilt ratio denominator', '600']]) await input(label, value)
  for (const description of ['The observed coordinates use the displayed project grid.', 'I transcribed these criteria from the applicable project specification.']) {
    const label = Array.from(container.querySelectorAll('label')).find(element => element.textContent === description)
    await act(async () => label?.querySelector<HTMLInputElement>('input[type="checkbox"]')?.click())
  }
  expect(container.textContent).toContain('Numerical result: PASS')
  await act(async () => container.querySelector<HTMLButtonElement>('button[data-action="record-plumb"]')?.click())
  const records = listDevicePlumbReadings('alice', 'project-1')
  expect(records[0].snapshot.assessment.result).toBe('PASS')
  expect(records[0].snapshot.criteria?.reference).toBe('Synthetic drawing C1')
  expect(container.querySelector<HTMLInputElement>('input[aria-label="Displacement uncertainty (m)"]')?.value).toBe('')
  expect(container.querySelector<HTMLInputElement>('input[aria-label="Height-difference uncertainty (m)"]')?.value).toBe('')
})
test('an unfinished device form restores on reopening without invented coordinates', async () => {
  await enterReading()
  await act(async () => root.render(<></>))
  await act(async () => root.render(<FieldSetOutPage />))
  expect(container.querySelector<HTMLInputElement>('input[aria-label="Base easting"]')?.value).toBe('500000.0001234567')
  expect(container.querySelector<HTMLInputElement>('input[aria-label="Base RL"]')?.value).toBe('')
})
test('an authoritative access refusal cannot enable capture from an old cached reference', async () => {
  await enterReading()
  await act(async () => root.render(<></>))
  global.fetch = jest.fn(async () => ({ ok: false, status: 403, json: async () => ({ error: 'Access refused.' }) })) as unknown as typeof fetch
  await act(async () => root.render(<FieldSetOutPage />))
  expect(container.querySelector<HTMLButtonElement>('button[data-action="record-plumb"]')?.disabled).toBe(true)
  expect(container.textContent).not.toContain('I reviewed the cached project reference')
})
