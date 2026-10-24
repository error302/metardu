/** @jest-environment jsdom */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import ProjectSettings from '@/app/project/[id]/settings/page'

let mockProjectId = 'synthetic-project'
const mockLoad = jest.fn()
const mockUpdate = jest.fn()
const mockRouter = { push: jest.fn() }
jest.mock('next/navigation', () => ({ useParams: () => ({ id: mockProjectId }), useRouter: () => mockRouter }))
jest.mock('@/components/project/ProjectReferenceSystemPanel', () => ({ __esModule: true, default: () => <div>Reference declaration</div> }))
jest.mock('@/lib/api-client/client', () => ({ createClient: () => ({ from: () => ({
  select: () => ({ eq: () => ({ single: mockLoad }) }),
  update: (value: unknown) => { mockUpdate(value); return { eq: async () => ({ error: null }) } },
}) }) }))

const fixture = { id: 'synthetic-project', name: 'Synthetic only', survey_type: 'cadastral', datum: null, utm_zone: null, hemisphere: null, traverse: { linearError: null, source: 'independent-observations' }, start_chainage: null }
let host: HTMLDivElement
let root: Root
const reply = (data: unknown, status = 200) => ({ ok: status < 400, status, json: async () => data })
const fill = async (selector: string, value: string) => act(async () => {
  const input = host.querySelector(selector) as HTMLInputElement
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
})
const save = async () => act(async () => {
  Array.from(host.querySelectorAll('button')).find(button => /Save (Changes|project details)/i.test(button.textContent ?? ''))!.click()
})
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
  mockProjectId = 'synthetic-project'
  jest.clearAllMocks()
  mockLoad.mockResolvedValue({ data: fixture, error: null })
  global.fetch = jest.fn(async () => reply({ data: fixture })) as jest.Mock
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host)
})
afterEach(async () => { await act(async () => root.unmount()); host.remove() })

test('missing grid and unknown measurements remain visibly unset', async () => {
  await act(async () => root.render(<ProjectSettings />))
  expect((host.querySelector('#utm-zone') as HTMLInputElement).value).toBe('')
  expect((host.querySelector('#hemisphere') as HTMLSelectElement).value).toBe('')
  expect((host.querySelector('#datum') as HTMLSelectElement).value).toBe('')
  expect((host.querySelector('#linearError') as HTMLInputElement).value).toBe('')
  await save()
  expect(mockUpdate).not.toHaveBeenCalled()
  expect(fetch).toHaveBeenCalledTimes(1)
})

test('a name-only save cannot assign CRS or replace untouched traverse and chainage evidence', async () => {
  await act(async () => root.render(<ProjectSettings />))
  await fill('#projectName', 'Synthetic renamed')
  await save()
  expect(mockUpdate).not.toHaveBeenCalled()
  const calls = (fetch as jest.Mock).mock.calls
  expect(JSON.parse(calls[1][1].body)).toEqual({ name: 'Synthetic renamed' })
  expect(calls[1][1].method).toBe('PATCH')
})

test('zero is saved explicitly while blank means unknown and unchanged fields are omitted', async () => {
  await act(async () => root.render(<ProjectSettings />))
  await fill('#linearError', '0')
  ;(fetch as jest.Mock).mockResolvedValueOnce(reply({ success: true, data: { id: mockProjectId } }))
  await save()
  expect(JSON.parse((fetch as jest.Mock).mock.calls[1][1].body)).toEqual({ linear_error_m: 0 })
  expect(host.textContent).toContain('Project details saved')
  await fill('#linearError', '')
  await save()
  expect(JSON.parse((fetch as jest.Mock).mock.calls[2][1].body)).toEqual({ linear_error_m: null })
})

test('a failed or unconfirmed save retains entered details and can be retried', async () => {
  await act(async () => root.render(<ProjectSettings />))
  await fill('#projectName', 'Keep this draft')
  ;(fetch as jest.Mock).mockRejectedValueOnce(new Error('Network unavailable'))
  await save()
  expect(host.textContent).toContain('Network unavailable')
  expect((host.querySelector('#projectName') as HTMLInputElement).value).toBe('Keep this draft')
  expect((host.querySelector('fieldset') as HTMLFieldSetElement).disabled).toBe(false)
  ;(fetch as jest.Mock).mockResolvedValueOnce(reply({ data: { id: mockProjectId } }))
  await save()
  expect(host.textContent).toContain('save was not confirmed')
  ;(fetch as jest.Mock).mockResolvedValueOnce(reply({ success: true, data: { id: mockProjectId } }))
  await save()
  expect(host.textContent).toContain('Project details saved')
  expect((fetch as jest.Mock).mock.calls.slice(1).every(([, options]) => JSON.parse(options.body).name === 'Keep this draft')).toBe(true)
})

test('load failures show a retry without offering an editable fabricated project', async () => {
  ;(fetch as jest.Mock).mockRejectedValueOnce(new Error('Offline'))
  await act(async () => root.render(<ProjectSettings />))
  expect(host.textContent).toContain('Offline')
  expect(host.querySelector('#projectName')).toBeNull()
  await act(async () => host.querySelector('button')!.click())
  expect((host.querySelector('#projectName') as HTMLInputElement).value).toBe(fixture.name)
  expect(mockRouter.push).not.toHaveBeenCalled()
})

test('late project A loading cannot hydrate project B settings', async () => {
  let resolveA!: (value: unknown) => void
  ;(fetch as jest.Mock).mockReturnValueOnce(new Promise(resolve => { resolveA = resolve }))
  await act(async () => root.render(<ProjectSettings />))
  mockProjectId = 'project-b'
  ;(fetch as jest.Mock).mockResolvedValueOnce(reply({ data: { ...fixture, id: 'project-b', name: 'Synthetic B' } }))
  await act(async () => root.render(<ProjectSettings />))
  await act(async () => resolveA(reply({ data: fixture })))
  expect((host.querySelector('#projectName') as HTMLInputElement).value).toBe('Synthetic B')
})
