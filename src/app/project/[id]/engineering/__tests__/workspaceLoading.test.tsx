import { act, render, screen, waitFor, fireEvent } from '@testing-library/react'
import type { ReactNode } from 'react'
import EngineeringWorkspacePage from '../page'
import * as persistence from '@/lib/engineering/projectEngineeringPersistence'
import type { EngineeringData } from '@/types/engineering'
import { roadWorkbenchExample } from '@/lib/engineering/roadWorkbenchExample'
import { webcrypto, createHash } from 'node:crypto'
import { canonicalJson } from '@/lib/provenance/canonicalJson'
import { apiPost } from '@/lib/api/client'
const projectId = '22222222-2222-4222-8222-222222222222'
const fixtureProjectCrs = 'EPSG:32737'
let projectReads = 0,
  projectFailure = false
let mockRoadData: Record<string, unknown> | null = null,
  mockSearch = ''
let mockReferenceRecord: Record<string, unknown> | null = null
interface Builder {
  select: () => Builder
  eq: () => Builder
  single: () => Promise<{
    data: Record<string, unknown> | null
    error: { message: string } | null
  }>
  limit: () => Promise<{ data: Record<string, unknown>[]; error: null }>
}
const mockCreateClient = jest.fn(() => ({
  from: (table: string) => {
    const query: Builder = {
      select: () => query,
      eq: () => query,
      single: async () => {
        if (table === 'projects') {
          projectReads++
          if (projectFailure)
            return {
              data: null,
              error: { message: 'Temporary network failure' },
            }
          if (projectReads > 3) return new Promise(() => {})
          return {
            data: {
              id: projectId,
              user_id: 'owner',
              name: 'Synthetic project',
              survey_type: 'engineering',
              ...(mockRoadData
                ? {
                    engineering_data: {
                      mode: 'road',
                      standard: 'KRDM2017',
                      road: mockRoadData,
                    },
                  }
                : {}),
            },
            error: null,
          }
        }
        return { data: null, error: null }
      },
      limit: async () => ({ data: [], error: null }),
    }
    return query
  },
}))
jest.mock('@/lib/api-client/client', () => ({
  createClient: () => mockCreateClient(),
}))
jest.mock('next/navigation', () => ({
  useParams: () => ({ id: projectId }),
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => new URLSearchParams(mockSearch),
}))
jest.mock('@/lib/api/client', () => ({
  apiGet: jest.fn(async (url: string) =>
    url.includes('/reference-system')
      ? { referenceSystem: mockReferenceRecord }
      : { data: null },
  ),
  apiPost: jest.fn(),
}))
jest.mock('@/components/MobileDesktopNotice', () => ({
  __esModule: true,
  default: ({ children }: { children: ReactNode }) => <>{children}</>,
}))
jest.mock('../steps/renderStepContent', () => ({
  renderStepContent: (
    _step: unknown,
    project: {
      projectReferenceSystem?: { code: string; verticalDatum: string }
    },
    _data: EngineeringData | null,
    onSave: (data: Partial<EngineeringData>) => Promise<boolean>,
  ) => (
    <>
      <p>Workspace ready</p>
      <button
        type="button"
        onClick={() => void onSave({ road: roadWorkbenchExample().road })}
      >
        Save synthetic road inputs
      </button>
      <p>
        Reference: {project.projectReferenceSystem?.code} /{' '}
        {project.projectReferenceSystem?.verticalDatum}
      </p>
    </>
  ),
}))
jest.mock('@/components/engineering/RecoverableRoadWorkbench', () => ({
  __esModule: true,
  default: () => <p>Road visual workspace ready</p>,
}))
jest.mock('../QuickComputeTab', () => ({ QuickComputeTab: () => null }))
beforeEach(() => {
  projectReads = 0
  projectFailure = false
  mockReferenceRecord = null
  mockRoadData = null
  mockSearch = ''
  mockCreateClient.mockClear()
})
afterEach(() => jest.restoreAllMocks())
beforeAll(()=>Object.defineProperty(window,'crypto',{value:webcrypto,configurable:true}))
it('finishes loading without creating a new client and refetching on each state update', async () => {
  render(<EngineeringWorkspacePage />)
  await waitFor(
    () => expect(screen.getByText('Workspace ready')).toBeInTheDocument(),
    { timeout: 2000 },
  )
  expect(projectReads).toBe(1)
  expect(mockCreateClient).toHaveBeenCalledTimes(1)
})
it('offers retry on a transient project load failure instead of claiming the project is missing', async () => {
  projectFailure = true
  render(<EngineeringWorkspacePage />)
  expect(await screen.findByRole('alert')).toHaveTextContent(
    /could not be loaded/i,
  )
  expect(screen.queryByText('Project not found')).not.toBeInTheDocument()
  projectFailure = false
  fireEvent.click(screen.getByRole('button', { name: 'Retry project load' }))
  expect(await screen.findByText('Workspace ready')).toBeInTheDocument()
})
it('loads the declared reference through its dedicated API rather than the forbidden table proxy', async () => {
  const code = fixtureProjectCrs
  mockReferenceRecord = {
    prs: {
      horizontalCrs: code,
      horizontalName: 'WGS84 UTM 37S',
      datum: 'WGS84',
      units: 'metres',
      zone: 37,
      hemisphere: 'S',
      verticalDatum: 'Synthetic BM',
      verticalReference: 'local',
      distanceMode: 'grid',
      coordinatePrecision: 3,
    },
  }
  render(<EngineeringWorkspacePage />)
  expect(
    await screen.findByText(`Reference: ${code} / Synthetic BM`),
  ).toBeInTheDocument()
})

it('opens an existing saved road in the visual workspace by default', async () => {
  mockRoadData = {
    roadName: 'SYNTHETIC existing road',
    ips: [],
    vips: [],
    stations: [],
  }
  render(<EngineeringWorkspacePage />)
  expect(
    await screen.findByText('Road visual workspace ready'),
  ).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Input workflow' })).toHaveAttribute(
    'href',
    `/project/${projectId}/engineering?tab=workflow`,
  )
})
it('honors explicit workflow and step links for an existing road', async () => {
  mockRoadData = {
    roadName: 'SYNTHETIC existing road',
    ips: [],
    vips: [],
    stations: [],
  }
  mockSearch = 'tab=workflow&step=setup'
  render(<EngineeringWorkspacePage />)
  expect(await screen.findByText('Workspace ready')).toBeInTheDocument()
  expect(
    screen.queryByText('Road visual workspace ready'),
  ).not.toBeInTheDocument()
})
it('keeps a new project in its input workflow when its first road is saved', async () => {
  const save = jest
    .spyOn(persistence, 'saveProjectEngineeringData')
    .mockResolvedValue(undefined)
  render(<EngineeringWorkspacePage />)
  await screen.findByText('Workspace ready')
  await act(async () => {
    fireEvent.click(
      screen.getByRole('button', { name: 'Save synthetic road inputs' }),
    )
  })
  expect(screen.getByText('Workspace ready')).toBeInTheDocument()
  expect(
    screen.queryByText('Road visual workspace ready'),
  ).not.toBeInTheDocument()
  expect(save.mock.calls[0][3]).toBeNull()
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save synthetic road inputs' })) })
  expect(save.mock.calls[1][3]).toEqual(save.mock.calls[0][2])
})

it('retains its original snapshot after a conflict and does not call mirror synchronization', async () => {
  mockRoadData = roadWorkbenchExample().road as unknown as Record<string, unknown>
  mockSearch = 'tab=workflow'
  const save=jest.spyOn(persistence,'saveProjectEngineeringData').mockRejectedValue(new Error('Synthetic engineering conflict; retain inputs'))
  const {apiPost}=jest.requireMock<typeof import('@/lib/api/client')>('@/lib/api/client')
  jest.mocked(apiPost).mockClear()
  render(<EngineeringWorkspacePage />)
  await screen.findByText('Workspace ready')
  await act(async()=>{fireEvent.click(screen.getByRole('button',{name:'Save synthetic road inputs'}))})
  expect(screen.getByRole('alert')).toHaveTextContent('Synthetic engineering conflict')
  const expected={mode:'road',standard:'KRDM2017',road:mockRoadData}
  expect(save.mock.calls[0][3]).toEqual(expected)
  expect(apiPost).not.toHaveBeenCalled()
})

it('binds every automatic mirror copy to the just-acknowledged engineering snapshot',async()=>{
  const save=jest.spyOn(persistence,'saveProjectEngineeringData').mockResolvedValue(undefined)
  jest.mocked(apiPost).mockReset().mockResolvedValue({data:{id:'mirror-alignment'}})
  render(<EngineeringWorkspacePage />)
  await screen.findByText('Workspace ready')
  fireEvent.click(screen.getByRole('button',{name:'Save synthetic road inputs'}))
  await waitFor(()=>expect(jest.mocked(apiPost).mock.calls).toHaveLength(4),{timeout:5000})
  const snapshot=persistence.engineeringDataSnapshot(save.mock.calls[0][2])
  const hash=createHash('sha256').update(canonicalJson({engineering:snapshot})).digest('hex')
  for(const call of jest.mocked(apiPost).mock.calls)expect(call[2]).toMatchObject({project_snapshot_hash:hash})
})
it('refuses overlapping saves before the first conditional write is acknowledged',async()=>{
  let finish:()=>void=()=>{throw Error('Synthetic write not started')}
  const save=jest.spyOn(persistence,'saveProjectEngineeringData').mockImplementation(()=>new Promise<void>(resolve=>{finish=resolve}))
  render(<EngineeringWorkspacePage />)
  await screen.findByText('Workspace ready')
  const button=screen.getByRole('button',{name:'Save synthetic road inputs'})
  fireEvent.click(button)
  fireEvent.click(button)
  expect(save).toHaveBeenCalledTimes(1)
  await act(async()=>{finish()})
})
