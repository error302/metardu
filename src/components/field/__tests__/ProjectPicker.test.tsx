import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ProjectPicker } from '../ProjectPicker'
import { listCachedRoadFieldPlans } from '@/lib/offline/fieldBookDB'
import type { OfflineRoadFieldPlan } from '@/lib/offline/fieldBookDB'
import { apiGet } from '@/lib/api/client'

jest.mock('@/lib/api/client', () => ({ apiGet: jest.fn() }))
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
  it('gives ordinary field collection a connection message without suggesting a road-only recovery path', async () => {
    render(<ProjectPicker onPick={jest.fn()} title="Choose a field project" subtitle="Select your field project" />)
    expect(await screen.findByText('Connect to load your projects. Your existing device records are retained.')).toBeInTheDocument()
    expect(screen.queryByText(/Reopen a road field plan/i)).not.toBeInTheDocument()
  })

  it('lets a field operator retry project selection when the connection returns', async () => {
    const onPick = jest.fn()
    jest.mocked(apiGet).mockResolvedValue({projects:[{id:projectId,name:'Synthetic level run',survey_type:'leveling'}],hasMore:false})
    render(<ProjectPicker onPick={onPick} title="Choose a field project" subtitle="Select your field project" />)
    await screen.findByText('Connect to load your projects. Your existing device records are retained.')
    setOnline(true)
    fireEvent.click(screen.getByRole('button', { name: 'Retry project list' }))
    fireEvent.click(await screen.findByRole('button', { name: /Synthetic level run/i }))
    expect(onPick).toHaveBeenCalledWith(projectId, 'leveling', 'Synthetic level run')
  })

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

    expect(onPick).toHaveBeenCalledWith(projectId, 'engineering', 'Kijani access road')
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

    await waitFor(() => expect(onPick).toHaveBeenCalledWith(projectId, 'engineering', 'Kijani access road'))
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

  it('does not automatically resume a cached plan with conflicting grid declarations', async () => {
    const onPick = jest.fn()
    jest.mocked(listCachedRoadFieldPlans).mockResolvedValue([{ ...cachedPlan, plan: { ...cachedPlan.plan, projectCrs: `${fixtureCrs} / EPSG:21037` } }])
    render(<ProjectPicker onPick={onPick} title="Road field collection" subtitle="Choose a prepared project" initialProjectId={projectId} allowOfflineRoadPlans />)
    expect(await screen.findByRole('alert')).toHaveTextContent('No verified offline road plan is cached for this project.')
    expect(onPick).not.toHaveBeenCalled()
  })
})
