import Draw from 'ol/interaction/Draw'
import Map from 'ol/Map'
import View from 'ol/View'
import VectorSource from 'ol/source/Vector'
import type Feature from 'ol/Feature'
import type { LineString, Polygon } from 'ol/geom'
import { attachSketchHistory, emptySketchHistory } from '../utils/sketchHistory'

const originalResizeObserver = globalThis.ResizeObserver
beforeAll(() => {
  globalThis.ResizeObserver = class implements ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
})
afterAll(() => { globalThis.ResizeObserver = originalResizeObserver })

function createSketch(type: 'LineString' | 'Polygon') {
  const source = new VectorSource()
  const map = new Map({ view: new View({ center: [0, 0], zoom: 12 }) })
  // Headless map has no rendered frame. Use a fixed view-to-pixel transform.
  jest.spyOn(map, 'getPixelFromCoordinate').mockImplementation(([x, y]) => [x * 10, y * 10])
  const draw = new Draw({ source, type })
  map.addInteraction(draw)
  let state = emptySketchHistory
  const history = attachSketchHistory(draw, value => { state = value })
  return { map, draw, source, history, state: () => state }
}

it.each(['LineString', 'Polygon'] as const)('undos and redoes draft %s vertices without publishing an incomplete feature', type => {
  const { map, draw, source, history, state } = createSketch(type)
  try {
    const vertices = [[1, 2], [3, 4], [7, 8]]
    draw.appendCoordinates(vertices)
    expect(state()).toEqual({ canUndo: true, canRedo: false })
    expect(history.undo()).toBe(true)
    expect(state()).toEqual({ canUndo: true, canRedo: true })
    expect(source.getFeatures()).toHaveLength(0)
    expect(history.redo()).toBe(true)
    expect(state()).toEqual({ canUndo: true, canRedo: false })

    draw.finishDrawing()
    const geometry = (source.getFeatures()[0] as Feature).getGeometry() as LineString | Polygon
    expect(geometry.getCoordinates()).toEqual(type === 'LineString' ? vertices : [[...vertices, vertices[0]]])
    expect(state()).toEqual(emptySketchHistory)
  } finally {
    map.dispose()
  }
})

it.each(['LineString', 'Polygon'] as const)('restores the first %s vertex and clears redo when a new vertex is chosen', type => {
  const { map, draw, history, state } = createSketch(type)
  try {
    draw.appendCoordinates([[1, 2]])
    expect(history.undo()).toBe(true)
    expect(state()).toEqual({ canUndo: false, canRedo: true })
    expect(history.redo()).toBe(true)
    draw.appendCoordinates([[3, 4], [5, 6]])
    expect(history.undo()).toBe(true)
    draw.appendCoordinates([[7, 8]])
    expect(state()).toEqual({ canUndo: true, canRedo: false })
    draw.abortDrawing()
    expect(state()).toEqual(emptySketchHistory)
  } finally {
    map.dispose()
  }
})
