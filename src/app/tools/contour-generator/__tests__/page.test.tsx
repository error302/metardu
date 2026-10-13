import React from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import ContourGeneratorPage from '../page'
import * as worker from '@/lib/workers/tinWorkerClient'
import { buildTINSurface, generateContours, type ContourLine } from '@/lib/engine/contours'

jest.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams() }))
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
    jest.spyOn(worker, 'isWorkerAvailable').mockReturnValue(false)
    jest.spyOn(worker, 'generateContoursAsync').mockImplementation(async (points, interval, options) => generateContours(points, interval, options?.indexInterval, options?.breaklines))
    jest.spyOn(worker, 'buildTINSurfaceAsync').mockImplementation(async (points, breaklines) => buildTINSurface(points, breaklines))
  })
  afterEach(() => jest.restoreAllMocks())

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
})
