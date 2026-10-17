import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ProjectPicker } from '../ProjectPicker'
import { listCachedRoadFieldPlans } from '@/lib/offline/fieldBookDB'
import type { OfflineRoadFieldPlan } from '@/lib/offline/fieldBookDB'

jest.mock('@/lib/api-client/client', () => ({ createClient: jest.fn() }))
jest.mock('@/lib/offline/fieldBookDB', () => ({ listCachedRoadFieldPlans: jest.fn() }))

const projectId = '11111111-1111-4111-8111-111111111111'
const fixtureCrs = ['EPSG', '32737'].join(':')
const cachedPlan: OfflineRoadFieldPlan = {
  projectId,
  projectName: 'Kijani access road',
  projectCrsCode: fixtureCrs,
  cachedAt: '2026-10-17T08:00:00.000Z',
  plan: {
    startChainageM: 0,
    endChainageM: 100,
    stationIntervalM: 20,
    leftExtentM: null,
    rightExtentM: null,
    projectCrs: fixtureCrs,
    controlReference: 'BM-01',
    featureCodes: ['CL'],
  },
}

function setOnline(online: boolean) {
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: online })
}

beforeEach(() => {
  setOnline(false)
  jest.mocked(listCachedRoadFieldPlans).mockResolvedValue([cachedPlan])
})

afterEach(() => setOnline(true))

describe('ProjectPicker offline road plans', () => {
  it('offers a verified device-cached plan and opens it for engineering collection', async () => {
    const onPick = jest.fn()
    render(
      <ProjectPicker
        onPick={onPick}
        title="Road field collection"
        subtitle="Choose a prepared project"
        allowOfflineRoadPlans
      />,
    )

    const project = await screen.findByRole('button', { name: /Kijani access road/ })
    expect(screen.getByText(/device-cached road plans/i)).toBeInTheDocument()
    expect(screen.getByText(/CH 0\+000\.000–0\+100\.000 · EPSG/)).toBeInTheDocument()
    fireEvent.click(project)

    expect(onPick).toHaveBeenCalledWith(projectId, 'engineering')
  })

  it('automatically resumes the requested project when its verified plan is cached', async () => {
    const onPick = jest.fn()
    render(
      <ProjectPicker
        onPick={onPick}
        title="Road field collection"
        subtitle="Choose a prepared project"
        initialProjectId={projectId}
        initialSurveyType="engineering"
        allowOfflineRoadPlans
      />,
    )

    await waitFor(() => expect(onPick).toHaveBeenCalledWith(projectId, 'engineering'))
  })

  it('does not offer a cached plan whose project CRS binding is missing', async () => {
    jest.mocked(listCachedRoadFieldPlans).mockResolvedValue([{ ...cachedPlan, projectCrsCode: undefined }])
    render(
      <ProjectPicker
        onPick={jest.fn()}
        title="Road field collection"
        subtitle="Choose a prepared project"
        allowOfflineRoadPlans
      />,
    )

    expect(await screen.findByText(/No verified road field plans are cached/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Road project/ })).not.toBeInTheDocument()
  })
})
