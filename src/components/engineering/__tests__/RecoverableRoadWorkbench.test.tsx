import { act, configure, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { webcrypto } from 'node:crypto'
import RecoverableRoadWorkbench from '../RecoverableRoadWorkbench'
import { roadWorkbenchExample } from '@/lib/engineering/roadWorkbenchExample'
import { sha256Hex } from '@/lib/crypto/sha256'
import { canonicalJson } from '@/lib/provenance/canonicalJson'
import type { RoadWorkbenchCommand } from '@/lib/engineering/roadWorkbenchRecoveryContract'
import { StrictMode } from 'react'
jest.mock('next-auth/react', () => ({
  useSession: () => ({
    status: 'authenticated',
    data: { user: { id: '11111111-1111-4111-8111-111111111111' } },
  }),
}))
jest.mock('../RoadWorkbench3D', () => ({
  __esModule: true,
  default: () => <div aria-label="Road 3D view" />,
}))
const actor = '11111111-1111-4111-8111-111111111111',
  project = '22222222-2222-4222-8222-222222222222'
const original = {
  version: 1 as const,
  actorId: actor,
  projectId: project,
  engineeringHash: 'a'.repeat(64),
  referenceHash: 'b'.repeat(64),
  ...roadWorkbenchExample(),
}
let source = original,
  lost = false,
  requests: RoadWorkbenchCommand[] = []
const fetcher = jest.fn(async (_url: unknown, init?: RequestInit) => {
  if(String(_url).includes('/api/engineering/road-terrain'))return {ok:true,json:async()=>({scope:{actorId:actor,projectId:project,engineeringHash:source.engineeringHash,referenceHash:source.referenceHash},revisions:[],limited:false})}
  if (!init?.body) return { ok: true, json: async () => ({ source }) }
  const body = JSON.parse(String(init.body)) as {
    operation: string
    command: RoadWorkbenchCommand
  }
  requests.push(body.command)
  if (lost && body.operation === 'commit')
    throw Error('Synthetic response lost')
  const c = body.command
  if (body.operation === 'cancel')
    return {
      ok: true,
      json: async () => ({
        outcome: {
          version: 1,
          state: 'cancelled',
          actorId: actor,
          projectId: project,
          requestId: c.requestId,
          requestHash: await sha256Hex(canonicalJson(c)),
        },
      }),
    }
  source = { ...source, road: c.road, engineeringHash: 'c'.repeat(64) }
  return {
    ok: true,
    json: async () => ({
      outcome: {
        version: 1,
        state: 'committed',
        actorId: actor,
        projectId: project,
        requestId: c.requestId,
        requestHash: await sha256Hex(canonicalJson(c)),
        roadHash: await sha256Hex(canonicalJson({ road: c.road })),
        engineeringHash: source.engineeringHash,
        referenceHash: source.referenceHash,
        road: c.road,
        reference: source.reference,
      },
    }),
  }
})
beforeAll(() => {
  // These checks use real asynchronous SubtleCrypto, including under a full
  // regression run. Wait for its acknowledgement before resetting device storage.
  configure({ asyncUtilTimeout: 5000 })
  Object.defineProperty(window, 'crypto', {
    value: webcrypto,
    configurable: true,
  })
  Object.defineProperty(navigator, 'locks', {
    value: { request: async (_name: string, work: () => unknown) => work() },
    configurable: true,
  })
})
beforeEach(() => {
  window.localStorage.clear()
  source = original
  lost = false
  requests = []
  fetcher.mockClear()
  global.fetch = fetcher as unknown as typeof fetch
})
it('restores incomplete input after unmounting and reopening the same account/project', async () => {
  const view = render(<RecoverableRoadWorkbench projectId={project} />)
  const input = await screen.findByLabelText('PI 1 Easting (m)')
  fireEvent.change(input, { target: { value: '' } })
  await waitFor(() =>
    expect(screen.getByLabelText('Device recovery status')).toHaveTextContent(
      'retained on this device',
    ),
  )
  view.unmount()
  render(<RecoverableRoadWorkbench projectId={project} />)
  expect(await screen.findByLabelText('PI 1 Easting (m)')).toHaveValue('')
  expect(screen.getByRole('alert')).toHaveTextContent('finite decimal')
  expect(screen.getByLabelText('Device recovery status')).toHaveTextContent(
    'Recovered',
  )
  expect(requests).toHaveLength(0)
})
it('retains the command before sending, recovers the original request ID and clears only its exact acknowledged outcome', async () => {
  let view = render(<RecoverableRoadWorkbench projectId={project} />)
  await screen.findByLabelText('PI 1 Easting (m)')
  fireEvent.click(
    screen.getByRole('button', { name: 'Vertical profile inputs' }),
  )
  fireEvent.change(screen.getByLabelText('VIP 1 Tangent intersection RL (m)'), {
    target: { value: '99' },
  })
  await waitFor(() =>
    expect(screen.getByLabelText('Device recovery status')).toHaveTextContent(
      'retained on this device',
    ),
  )
  lost = true
  fireEvent.click(screen.getByRole('button', { name: 'Save road draft' }))
  await screen.findByRole('button', { name: 'Check original save outcome' })
  expect(requests).toHaveLength(1)
  expect(
    window.localStorage.getItem(
      `metardu:road-workbench:v1:${actor}:${project}`,
    ),
  ).toContain(requests[0].requestId)
  view.unmount()
  lost = false
  view = render(<RecoverableRoadWorkbench projectId={project} />)
  await screen.findByRole('button', { name: 'Check original save outcome' })
  await act(async () =>
    fireEvent.click(
      screen.getByRole('button', { name: 'Check original save outcome' }),
    ),
  )
  await waitFor(() =>
    expect(screen.getByLabelText('Device recovery status')).toHaveTextContent(
      /^Road save confirmed/,
    ),
  )
  expect(requests).toHaveLength(2)
  expect(requests[1]).toEqual(requests[0])
  expect(
    window.localStorage.getItem(
      `metardu:road-workbench:v1:${actor}:${project}`,
    ),
  ).toBeNull()
  expect(screen.getByLabelText('Selected target level')).toHaveTextContent(
    '99.000',
  )
  view.unmount()
})
it('retains a draft and blocks saving if the saved source changed while the page was closed', async () => {
  let view = render(<RecoverableRoadWorkbench projectId={project} />)
  fireEvent.change(await screen.findByLabelText('PI 1 Easting (m)'), {
    target: { value: '499999' },
  })
  await waitFor(() =>
    expect(screen.getByLabelText('Device recovery status')).toHaveTextContent(
      'retained on this device',
    ),
  )
  view.unmount()
  source = { ...original, engineeringHash: 'd'.repeat(64) }
  view = render(<RecoverableRoadWorkbench projectId={project} />)
  expect(await screen.findByLabelText('PI 1 Easting (m)')).toHaveValue('499999')
  expect(screen.getByRole('button', { name: 'Save road draft' })).toBeDisabled()
  expect(screen.getByText(/saved project changed/i)).toBeInTheDocument()
  expect(requests).toHaveLength(0)
  view.unmount()
})
it('confirms cancellation without discarding inputs and uses a new request identity for a subsequent save', async () => {
  const view = render(<RecoverableRoadWorkbench projectId={project} />)
  await screen.findByLabelText('PI 1 Easting (m)')
  fireEvent.click(
    screen.getByRole('button', { name: 'Vertical profile inputs' }),
  )
  fireEvent.change(screen.getByLabelText('VIP 1 Tangent intersection RL (m)'), {
    target: { value: '99' },
  })
  await waitFor(() =>
    expect(screen.getByLabelText('Device recovery status')).toHaveTextContent(
      'retained on this device',
    ),
  )
  lost = true
  fireEvent.click(screen.getByRole('button', { name: 'Save road draft' }))
  await screen.findByRole('button', { name: 'Cancel pending save' })
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Cancel pending save' }),
    ).toBeEnabled(),
  )
  fireEvent.click(screen.getByRole('button', { name: 'Cancel pending save' }))
  await waitFor(() =>
    expect(screen.getByLabelText('Device recovery status')).toHaveTextContent(
      /^Cancellation confirmed/,
    ),
  )
  const raw = window.localStorage.getItem(
    `metardu:road-workbench:v1:${actor}:${project}`,
  )
  if (raw === null)
    throw Error('The synthetic cancelled draft was not retained.')
  const retained = JSON.parse(raw) as {
    record: {
      command: unknown
      draft: { vips: Array<{ reducedLevel: string }> }
    }
  }
  expect(retained.record.command).toBeNull()
  expect(retained.record.draft.vips[0].reducedLevel).toBe('99')
  lost = false
  fireEvent.click(screen.getByRole('button', { name: 'Save road draft' }))
  await waitFor(() =>
    expect(screen.getByLabelText('Device recovery status')).toHaveTextContent(
      /^Road save confirmed/,
    ),
  )
  expect(requests[2].requestId).not.toBe(requests[0].requestId)
  view.unmount()
})
it('blocks a server save when device storage cannot retain the current inputs', async () => {
  const view = render(<RecoverableRoadWorkbench projectId={project} />)
  const input = await screen.findByLabelText('PI 1 Easting (m)')
  const write = jest
    .spyOn(Storage.prototype, 'setItem')
    .mockImplementation(() => {
      throw Error('Synthetic quota failure')
    })
  fireEvent.change(input, { target: { value: '499999' } })
  await waitFor(() =>
    expect(screen.getByLabelText('Device recovery status')).toHaveTextContent(
      'retention is unconfirmed',
    ),
  )
  expect(screen.getByRole('button', { name: 'Save road draft' })).toBeDisabled()
  expect(
    screen.getByRole('button', { name: 'Download recovery file' }),
  ).toBeInTheDocument()
  expect(requests).toHaveLength(0)
  expect(input).toHaveValue('499999')
  write.mockRestore()
  view.unmount()
})
it('ignores the interrupted first initialization when development strict mode starts a new load', async () => {
  global.fetch = jest.fn(async (_url: unknown, init?: RequestInit) => {
    if(String(_url).includes('/api/engineering/road-terrain'))return {ok:true,json:async()=>({scope:{actorId:actor,projectId:project,engineeringHash:original.engineeringHash,referenceHash:original.referenceHash},revisions:[],limited:false})}
    if (init?.signal?.aborted)
      throw new DOMException('Synthetic stale initialization', 'AbortError')
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, 5)
      init?.signal?.addEventListener(
        'abort',
        () => {
          clearTimeout(timer)
          setTimeout(
            () =>
              reject(
                new DOMException(
                  'Synthetic stale initialization',
                  'AbortError',
                ),
              ),
            15,
          )
        },
        { once: true },
      )
    })
    return { ok: true, json: async () => ({ source: original }) }
  }) as unknown as typeof fetch
  const view = render(
    <StrictMode>
      <RecoverableRoadWorkbench projectId={project} />
    </StrictMode>,
  )
  expect(await screen.findByLabelText('PI 1 Easting (m)')).toBeEnabled()
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 35))
  })
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  expect(screen.getByLabelText('PI 1 Easting (m)')).toBeEnabled()
  view.unmount()
})
it('allows leaving only after the exact current draft is acknowledged on the device', async () => {
  const view = render(<RecoverableRoadWorkbench projectId={project} />)
  fireEvent.change(await screen.findByLabelText('PI 1 Easting (m)'), {
    target: { value: '499999' },
  })
  await waitFor(() =>
    expect(screen.getByLabelText('Device recovery status')).toHaveTextContent(
      'retained on this device',
    ),
  )
  const acknowledged = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(acknowledged)
  expect(acknowledged.defaultPrevented).toBe(false)
  view.unmount()
})
