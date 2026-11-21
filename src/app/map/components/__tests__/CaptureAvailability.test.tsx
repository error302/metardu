import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MapProvider, type MapContextValue } from '../../MapReactContext'
import { CaptureContent } from '../MapToolDock'

/**
 * Slice 3, check 1: Capture with no active project shows a project picker
 * and offers no working capture action. Tools must be visibly disabled with
 * a reason instead of failing at runtime after a tap.
 */

function buildContext(overrides: Partial<MapContextValue> = {}): MapContextValue {
  const noop = jest.fn()
  return {
    mapInstance: { current: null },
    selectedFeature: null,
    selectedFeatures: [],
    currentSurveyCrs: null,
    schemeProjectId: null,
    drawMode: 'none',
    measureMode: 'none',
    editMode: false,
    moveMode: false,
    showAnnotations: false,
    measureResult: '',
    activeDigitizingTool: null,
    offsetDistance: 0,
    rotateAngle: 0,
    showSnappingOptions: false,
    vertexEditingEnabled: false,
    snapEnabled: false,
    snapTolerance: 10,
    vertexEditState: { vertexCount: 0, hoveredVertex: null, lastEditedVertex: null },
    setVertexEditingEnabled: noop,
    setSnapEnabled: noop,
    setSnapTolerance: noop,
    setShowSnappingOptions: noop,
    setActiveDigitizingTool: noop,
    setOffsetDistance: noop,
    setRotateAngle: noop,
    applyOneShotTool: noop,
    toggleDraw: noop,
    toggleMeasure: noop,
    toggleEdit: noop,
    toggleMove: noop,
    toggleAnnotations: noop,
    deleteSelected: noop,
    ...overrides,
  } as unknown as MapContextValue
}

beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ data: [{ id: 'project-1', name: 'Riverside Cadastral' }] }),
  }) as unknown as typeof fetch
})

afterEach(() => {
  jest.restoreAllMocks()
})

it('shows a project picker and no working capture actions when no project is linked', async () => {
  render(
    <MapProvider value={buildContext()}>
      <CaptureContent onPointSaved={jest.fn()} onSketchStart={jest.fn()} />
    </MapProvider>,
  )

  // The picker replaces the old instruction text.
  expect(screen.getByTestId('capture-project-picker')).toBeTruthy()
  expect(screen.getByLabelText('Link a project to start capturing')).toBeTruthy()

  // Reason is stated, and register actions are genuinely disabled buttons
  // (not links that navigate somewhere useless).
  expect(screen.getByRole('status').textContent).toMatch(/Link a project/)
  const measure = screen.getByRole('button', { name: 'Measure with instrument' })
  expect(measure).toHaveProperty('disabled', true)
  expect(screen.getByRole('button', { name: 'Import controller file' })).toHaveProperty('disabled', true)

  // Every sketch/measure tool is disabled too.
  for (const name of ['Sketch point', 'Line', 'Polygon', 'Circle', 'Distance', 'Area']) {
    expect(screen.getByRole('button', { name })).toHaveProperty('disabled', true)
  }

  // No key-in form is offered without a project.
  expect(screen.queryByRole('button', { name: /key in|add point/i })).toBeNull()

  await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/projects'))
})

it('keeps the picker usable: selecting a project enables the project map link', async () => {
  render(
    <MapProvider value={buildContext()}>
      <CaptureContent onPointSaved={jest.fn()} onSketchStart={jest.fn()} />
    </MapProvider>,
  )

  const select = screen.getByLabelText('Link a project to start capturing') as HTMLSelectElement
  await waitFor(() => expect(screen.getByRole('option', { name: 'Riverside Cadastral' })).toBeTruthy())
  fireEvent.change(select, { target: { value: 'project-1' } })

  const open = screen.getByRole('link', { name: 'Open project map' })
  expect(open.getAttribute('href')).toBe('/map?projectId=project-1')
})

it('reports a load failure instead of pretending the project list is empty', async () => {
  global.fetch = jest.fn().mockRejectedValue(new Error('offline')) as unknown as typeof fetch
  render(
    <MapProvider value={buildContext()}>
      <CaptureContent onPointSaved={jest.fn()} onSketchStart={jest.fn()} />
    </MapProvider>,
  )
  await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/Projects could not be loaded/))
})
