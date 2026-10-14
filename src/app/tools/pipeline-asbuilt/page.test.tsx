import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import PipelineAsBuiltPage from './page'
import { analyzePipelineAsBuilt } from '@/lib/engineering/pipelineAsBuilt'
import { parsePipelineAsBuiltCsv } from '@/lib/engineering/pipelineAsBuiltCsv'
let mockUser: string | null = null
jest.mock('next-auth/react', () => ({ useSession: () => ({ data: mockUser ? { user: { id: mockUser } } : null, status: mockUser ? 'authenticated' : 'unauthenticated' }) }))
let container: HTMLDivElement, root: Root
beforeEach(() => { mockUser = null; window.history.replaceState({}, '', '/tools/pipeline-asbuilt'); Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true, fetch: jest.fn() }); container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container) })
afterEach(async () => { await act(async () => root.unmount()); container.remove() })
async function input(selector: string, value: string) {
  const field = container.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector)
  if (!field) throw new Error(`Missing ${selector}`)
  await act(async () => { Object.getOwnPropertyDescriptor(Object.getPrototypeOf(field), 'value')?.set?.call(field, value); field.dispatchEvent(new Event('input', { bubbles: true })) })
}
async function analyze() {
  const button = Array.from(container.querySelectorAll('button')).find(button => button.textContent === 'Analyze Pipeline')
  if (!button) throw new Error('Missing analyze action')
  await act(async () => button.click())
}
const csv = 'point_id,chainage_m,invert_rl_m,ground_rl_m,internal_diameter_mm,outside_diameter_mm,joint_type,remarks\nP1,0,10,10.2,300,400,,exposed\nP2,50,9.5,11,300,400,,measured'
test('the page begins with blank observations and does not assert an unspecified country standard', async () => {
  await act(async () => root.render(<PipelineAsBuiltPage />))
  expect(container.querySelector<HTMLTextAreaElement>('textarea')?.value).toBe('')
  expect(container.textContent).not.toContain('Kenya Water Pipeline Standards')
})
test('malformed input reports a validation error rather than inventing observations', async () => {
  await act(async () => root.render(<PipelineAsBuiltPage />))
  await input('textarea', 'point_id,chainage_m,invert_rl_m\nP1,0,broken'); await analyze()
  expect(container.querySelector('[role="alert"]')?.textContent).toContain('finite decimal')
  expect(container.querySelector('[data-result="pipeline-profile"]')).toBeNull()
})
test('measured exposed cover is signed and any input edit removes stale results and export actions', async () => {
  await act(async () => root.render(<PipelineAsBuiltPage />))
  await input('textarea', csv); await analyze()
  expect(container.querySelector('[data-result="pipeline-profile"]')?.textContent).toContain('-0.150')
  expect(container.textContent).toContain('NOT ASSESSED')
  expect(container.querySelector('[data-export="pipeline-csv"]')).not.toBeNull()
  await input('textarea', csv.replace('10.2', '12'))
  expect(container.querySelector('[data-result="pipeline-profile"]')).toBeNull()
  expect(container.querySelector('[data-export="pipeline-csv"]')).toBeNull()
})
const projectId = 'e2908a64-bd40-4975-acd5-037a58deecbf'
const recordId = '4c186ff0-ddbb-4b52-8d11-54c63f2e970d'
const metadata = { route: 'Drain A', designReference: '', verticalReference: '', observer: '', instrument: '' }
const result = () => analyzePipelineAsBuilt(parsePipelineAsBuiltCsv(csv))
const record = (clientBatchId: string) => ({ id: recordId, project_id: projectId, actor_id: 'alice', client_batch_id: clientBatchId, input_hash: 'a'.repeat(64), project_name: 'Private Drain', reference_snapshot: null, recorded_at: '2026-10-14T12:00:00Z', capture: { schemaVersion: 1, rawCsv: csv, metadata, criterion: null, result: result() } })
const json = (payload: unknown, ok = true) => ({ ok, json: async () => payload })
async function click(text: string) {
  const button = Array.from(container.querySelectorAll('button')).find(candidate => candidate.textContent === text)
  if (!button) throw new Error(`Missing button: ${text}`)
  await act(async () => button.click())
}
test('failed save retains input and retries the same delivery ID, then shows recorded evidence', async () => {
  mockUser = 'alice'; window.history.replaceState({}, '', `/tools/pipeline-asbuilt?projectId=${projectId}`)
  const posted: Array<{ clientBatchId: string; rawCsv: string }> = []
  const fetchMock = jest.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
    if (String(url).includes('/api/projects')) return json({ data: [{ id: projectId, name: 'Private Drain' }] }) as Response
    if (!init?.method) return json({ data: [], nextCursor: null }) as Response
    const request = JSON.parse(String(init.body)) as typeof posted[number]; posted.push(request)
    return (posted.length === 1 ? json({ error: 'Keep this draft; upgrade pending.' }, false) : json({ data: record(request.clientBatchId), replayed: false })) as Response
  })
  try {
    await act(async () => root.render(<PipelineAsBuiltPage />))
    await input('textarea', csv); await analyze()
    await click('Save measured batch to project')
    expect(container.querySelector<HTMLTextAreaElement>('textarea')?.value).toBe(csv)
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('upgrade pending')
    await click('Save measured batch to project')
    expect(posted).toHaveLength(2); expect(posted[0].clientBatchId).toBe(posted[1].clientBatchId)
    expect(container.textContent).toContain('Retained batch'); expect(container.textContent).toContain(recordId)
    await input('textarea', csv.replace('10.2', '12'))
    expect(container.textContent).not.toContain('Retained batch')
    expect(container.querySelector('[data-result]')).toBeNull()
  } finally { fetchMock.mockRestore() }
})
test('opening history restores raw measurements; an account change clears private profile and history', async () => {
  mockUser = 'alice'; window.history.replaceState({}, '', `/tools/pipeline-asbuilt?projectId=${projectId}`)
  const fetchMock = jest.spyOn(globalThis, 'fetch').mockImplementation(async url => {
    if (String(url).includes('/api/projects')) return json({ data: [{ id: projectId, name: 'Private Drain' }] }) as Response
    if (String(url).includes('batchId=')) return json({ data: record('382925b1-44b1-4479-a282-e5b4681d357c') }) as Response
    return json({ data: [{ id: recordId, recorded_at: '2026-10-14T12:00:00Z', route: 'Drain A', point_count: 2, algorithm_version: '2.0.0' }] }) as Response
  })
  try {
    await act(async () => root.render(<PipelineAsBuiltPage />))
    await click('Open profile')
    expect(container.querySelector<HTMLTextAreaElement>('textarea')?.value).toBe(csv)
    expect(container.querySelector('[data-result]')?.textContent).toContain('-0.150')
    mockUser = null
    await act(async () => root.render(<PipelineAsBuiltPage />))
    expect(container.querySelector<HTMLTextAreaElement>('textarea')?.value).toBe('')
    expect(container.textContent).not.toContain(recordId)
    expect(container.querySelector('[data-result]')).toBeNull()
  } finally { fetchMock.mockRestore() }
})
