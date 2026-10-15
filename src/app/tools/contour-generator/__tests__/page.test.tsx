import React from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import ContourGeneratorPage from '../page'
import * as worker from '@/lib/workers/tinWorkerClient'
import { buildTINSurface, generateContours, type ContourLine } from '@/lib/engine/contours'
import * as exporters from '../generators'

const fixtureCrs = 'EPSG:32737'
let mockProject: string | null = null
let mockUser: string | null = null
jest.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(mockProject ? `project=${mockProject}` : '') }))
jest.mock('next-auth/react', () => ({ useSession: () => ({ data: mockUser ? { user: { id: mockUser } } : null, status: mockUser ? 'authenticated' : 'unauthenticated' }) }))
jest.mock('@/lib/i18n/LanguageContext', () => ({ useLanguage: () => ({ t: (key: string) => key }) }))
jest.mock('@/components/tools/ComputeLimitNotice', () => ({ ComputeLimitNotice: () => null }))
jest.mock('next/dynamic', () => ({ __esModule: true, default: (loader: () => unknown) => {
  const source = String(loader)
  if (source.includes('ImportTab')) return jest.requireActual<typeof import('../ImportTab')>('../ImportTab').ImportTab
  if (source.includes('SettingsTab')) return jest.requireActual<typeof import('../SettingsTab')>('../SettingsTab').SettingsTab
  if (source.includes('MapTab')) return jest.requireActual<typeof import('../MapTab')>('../MapTab').MapTab
  if (source.includes('ExportTab')) return jest.requireActual<typeof import('../ExportTab')>('../ExportTab').ExportTab
  return jest.requireActual<typeof import('../BreaklineTab')>('../BreaklineTab').BreaklineTab
} }))

// Twenty measured ground points on a steep plane z=100+3x+2y. Higher ground
// observations must not disappear because a point-cloud heuristic calls them vegetation.
const survey = Array.from({ length: 20 }, (_, i) => ({
  name: `P${i + 1}`, easting: 10 * (i % 5), northing: 10 * Math.floor(i / 5),
  elevation: 100 + 30 * (i % 5) + 20 * Math.floor(i / 5),
}))
const csv = ['Name,Easting,Northing,Elevation', ...survey.map(p => `${p.name},${p.easting},${p.northing},${p.elevation}`)].join('\n')

function importSurvey(text = csv) {
  render(<ContourGeneratorPage />)
  fireEvent.change(screen.getByRole('textbox'), { target: { value: text } })
  fireEvent.click(screen.getByRole('button', { name: 'Parse Data' }))
  fireEvent.click(screen.getByRole('button', { name: 'Settings & Generate' }))
}
async function generate() {
  fireEvent.click(screen.getByRole('button', { name: 'Generate Contours' }))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Generate Contours' })).toBeEnabled())
}

describe('contour survey observation integrity', () => {
  beforeEach(() => {
    mockProject = null; mockUser = null
    jest.spyOn(worker, 'isWorkerAvailable').mockReturnValue(false)
    jest.spyOn(worker, 'generateContoursAsync').mockImplementation(async (points, interval, options) => generateContours(points, interval, options?.indexInterval, options?.breaklines))
    jest.spyOn(worker, 'buildTINSurfaceAsync').mockImplementation(async (points, breaklines) => buildTINSurface(points, breaklines))
  })
  afterEach(() => jest.restoreAllMocks())
  it('shows the index interval as the exact entered decimal multiple', () => {
    importSurvey()
    fireEvent.change(screen.getByLabelText('Contour interval'), { target: { value: '0.1' } })
    fireEvent.change(screen.getByLabelText('Index Contour Multiplier'), { target: { value: '3' } })
    expect(screen.getByText(/Every Nth contour/).textContent).toContain('= 0.3 source units')
  })

  it('uses every supplied observation and retains hilltop elevations', async () => {
    importSurvey()
    await generate()
    expect(worker.generateContoursAsync).toHaveBeenCalledWith(survey, 1, expect.any(Object))
    expect(worker.buildTINSurfaceAsync).toHaveBeenCalledWith(survey, undefined, expect.any(Object))
    const lines = await (worker.generateContoursAsync as jest.Mock).mock.results[0].value as ContourLine[]
    expect(Math.max(...lines.map(line => line.elevation))).toBe(279)
    for (const line of lines) for (const p of line.points) expect(100 + 3 * p.easting + 2 * p.northing).toBeCloseTo(line.elevation, 9)
  })

  it('invalidates displayed and exportable contours when the interval changes', async () => {
    importSurvey()
    await generate()
    expect(screen.getByRole('button', { name: 'Contour Map' })).toBeEnabled()
    fireEvent.change(screen.getByLabelText('Contour interval'), { target: { value: '2' } })
    expect(screen.getByRole('button', { name: 'Contour Map' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Export' })).toBeDisabled()
    expect(screen.queryByText('Generation Results')).not.toBeInTheDocument()
  })

  it('publishes no partial contour result if the surface computation fails', async () => {
    jest.mocked(worker.buildTINSurfaceAsync).mockRejectedValueOnce(new Error('Conflicting survey controls'))
    importSurvey()
    await generate()
    expect(screen.getByText('Conflicting survey controls')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Contour Map' })).toBeDisabled()
  })

  it('ignores a completed worker result after its input was edited', async () => {
    let complete: (value: ContourLine[]) => void = () => undefined
    jest.mocked(worker.generateContoursAsync).mockImplementationOnce(() => new Promise(resolve => { complete = resolve }))
    importSurvey()
    fireEvent.click(screen.getByRole('button', { name: 'Generate Contours' }))
    await waitFor(() => expect(worker.generateContoursAsync).toHaveBeenCalled())
    fireEvent.change(screen.getByLabelText('Contour interval'), { target: { value: '2' } })
    await act(async () => complete(generateContours(survey, 1)))
    expect(screen.getByRole('button', { name: 'Export' })).toBeDisabled()
    expect(worker.buildTINSurfaceAsync).not.toHaveBeenCalled()
  })

  it('does not silently generate a reduced surface from a partially invalid import', async () => {
    importSurvey(csv + '\nBROKEN,1,,110')
    await generate()
    expect(worker.generateContoursAsync).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent(/import/i)
  })
  it('project observations with missing heights are visible errors, not a silently reduced contour surface', async () => {
    mockProject = 'job-a'; mockUser = 'alice'
    Object.assign(globalThis, { fetch: jest.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [
      ...survey.slice(0, 3).map(p => ({ id: p.name, point_name: p.name, easting: p.easting, northing: p.northing, elevation: p.elevation, horizontal_crs: fixtureCrs, vertical_datum: 'SYNTHETIC BM' })),
      { id: 'missing', point_name: 'MISSING-RL', easting: 5, northing: 5, elevation: null },
    ], meta: { project_id: mockProject } }) }) })
    render(<ContourGeneratorPage />)
    await waitFor(() => expect(screen.getByText(/MISSING-RL.*height/i)).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Settings & Generate' }))
    await generate()
    expect(worker.generateContoursAsync).not.toHaveBeenCalled()
  })
  it('changing project clears the old generated surface and requests the new project', async () => {
    mockProject = 'job-a'; mockUser = 'alice'
    const data = survey.map(p => ({ id: p.name, point_name: p.name, easting: p.easting, northing: p.northing, elevation: p.elevation, horizontal_crs: fixtureCrs, vertical_datum: 'SYNTHETIC BM' }))
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ data, meta: { project_id: mockProject } }) })
    Object.assign(globalThis, { fetch: fetchMock })
    const view = render(<ContourGeneratorPage />)
    await waitFor(() => expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toContain('P20'))
    fireEvent.click(screen.getByRole('button', { name: 'Settings & Generate' })); await generate()
    expect(screen.getByRole('button', { name: 'Contour Map' })).toBeEnabled()
    mockProject = 'job-b'
    view.rerender(<ContourGeneratorPage />)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/project/job-b/points?includeIncomplete=true', expect.any(Object)))
    expect(screen.getByRole('button', { name: 'Contour Map' })).toBeDisabled()
  })
  it('typing a new unparsed source immediately disables outputs from the previous measurements', async () => {
    importSurvey(); await generate()
    fireEvent.click(screen.getByRole('button', { name: 'Import Points' }))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Name,Easting,Northing,Height\nNEW,0,0,50' } })
    expect(screen.getByRole('button', { name: 'Contour Map' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Export' })).toBeDisabled()
  })
  it('a late project fetch cannot overwrite a newly entered manual source', async () => {
    mockProject = 'job-a'; mockUser = 'alice'
    let complete: (response: unknown) => void = () => undefined
    const request = new Promise(resolve => { complete = resolve })
    Object.assign(globalThis, { fetch: jest.fn().mockReturnValue(request) })
    render(<ContourGeneratorPage />)
    const manual = 'Name,Easting,Northing,Height\nMANUAL,0,0,20'
    fireEvent.change(screen.getByRole('textbox'), { target: { value: manual } })
    await act(async () => complete({ ok: true, json: async () => ({ data: [{ id: 'OLD', easting: 100, northing: 100, elevation: 999 }] }) }))
    expect(screen.getByRole('textbox')).toHaveValue(manual)
    expect(screen.queryByText('Project observations loaded for review.', { exact: false })).not.toBeInTheDocument()
  })
  it('an account change clears private project observations and pending derived outputs', async () => {
    mockProject = 'job-a'; mockUser = 'alice'
    const data = survey.map(p => ({ id: p.name, point_name: p.name, easting: p.easting, northing: p.northing, elevation: p.elevation, horizontal_crs: fixtureCrs, vertical_datum: 'SYNTHETIC BM' }))
    Object.assign(globalThis, { fetch: jest.fn().mockResolvedValue({ ok: true, json: async () => ({ data, meta: { project_id: mockProject } }) }) })
    const view = render(<ContourGeneratorPage />)
    await waitFor(() => expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toContain('P20'))
    mockUser = null
    view.rerender(<ContourGeneratorPage />)
    expect(screen.getByRole('textbox')).toHaveValue('')
    expect(screen.getByRole('button', { name: 'Contour Map' })).toBeDisabled()
  })
  it('a PDF completing after reference edits is not downloaded under the current source context', async () => {
    let complete: (value: Blob) => void = () => undefined
    jest.spyOn(exporters, 'generateContourPDF').mockImplementation(() => new Promise(resolve => { complete = resolve }))
    const download = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    Object.assign(URL, { createObjectURL: jest.fn(() => 'blob:synthetic-pdf'), revokeObjectURL: jest.fn() })
    importSurvey()
    fireEvent.change(screen.getByLabelText('Horizontal CRS / EPSG'), { target: { value: fixtureCrs } })
    fireEvent.change(screen.getByLabelText('Vertical datum / height source'), { target: { value: 'SYNTHETIC BM' } })
    fireEvent.click(screen.getByRole('checkbox'))
    await generate(); fireEvent.click(screen.getByRole('button', { name: 'Export' }))
    fireEvent.click(screen.getByRole('button', { name: 'Download A3 PDF' }))
    fireEvent.click(screen.getByRole('button', { name: 'Settings & Generate' }))
    fireEvent.change(screen.getByLabelText('Vertical datum / height source'), { target: { value: 'NEW REFERENCE' } })
    await act(async () => complete(new Blob(['synthetic-only'])))
    expect(download).not.toHaveBeenCalled()
  })
  it('rejects a response bound to another project instead of loading its terrain', async () => {
    mockProject = 'job-a'; mockUser = 'alice'
    Object.assign(globalThis, { fetch: jest.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [], meta: { project_id: 'job-b' } }) }) })
    render(<ContourGeneratorPage />)
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/does not match the requested project/))
    expect(screen.getByRole('textbox')).toHaveValue('')
  })
})
