import Draw from 'ol/interaction/Draw'
import Map from 'ol/Map'
import MapBrowserEvent from 'ol/MapBrowserEvent'
import MapPathDraw from '../utils/MapPathDraw'
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


function tapPath(draw: MapPathDraw, map: Map, coordinate: number[], time: number, pointerType: 'touch' | 'mouse' = 'touch') {
  const pixel = coordinate.map(value => value * 10)
  for (const type of ['pointerdown', 'pointerup']) {
    const pointer = new MouseEvent(type, { button: 0 }) as PointerEvent
    Object.defineProperties(pointer, { pointerType: { value: pointerType }, timeStamp: { value: time } })
    const event = new MapBrowserEvent(type, map, pointer, false, undefined, type === 'pointerdown' ? [pointer] : [])
    event.pixel = pixel
    event.coordinate = coordinate.slice()
    draw.handleEvent(event)
    if (type === 'pointerup') expect(event.defaultPrevented).toBe(true)
  }
}

it.each(['touch', 'mouse'] as const)('closes an area with a %s double tap and rejects rapid separate vertices as completion', pointerType => {
  const { map, source } = createSketch('Polygon')
  const draw = new MapPathDraw({ source, type: 'Polygon' }, () => {})
  map.addInteraction(draw)
  try {
    tapPath(draw, map, [0, 0], 100, pointerType)
    tapPath(draw, map, [0, 0], 200, pointerType)
    tapPath(draw, map, [20, 0], 300, pointerType)
    tapPath(draw, map, [20, 20], 400, pointerType)
    expect(source.getFeatures()).toHaveLength(0)
    tapPath(draw, map, [20, 20], 500, pointerType)
    expect(source.getFeatures()).toHaveLength(1)
    expect((source.getFeatures()[0].getGeometry() as Polygon).getCoordinates())
      .toEqual([[[0, 0], [20, 0], [20, 20], [0, 0]]])
  } finally {
    map.dispose()
  }
})

it('can finish a line explicitly and leaves an incomplete line in draft', () => {
  const { map, source } = createSketch('LineString')
  const onReady = jest.fn()
  const draw = new MapPathDraw({ source, type: 'LineString' }, onReady)
  map.addInteraction(draw)
  try {
    tapPath(draw, map, [0, 0], 100)
    expect(draw.finishIfReady()).toBe(false)
    tapPath(draw, map, [20, 0], 500)
    expect(onReady).toHaveBeenLastCalledWith(true)
    expect(draw.finishIfReady()).toBe(true)
    expect(onReady).toHaveBeenLastCalledWith(false)
    expect((source.getFeatures()[0].getGeometry() as LineString).getCoordinates()).toEqual([[0, 0], [20, 0]])
  } finally {
    map.dispose()
  }
})
