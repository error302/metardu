import type MapBrowserEvent from 'ol/MapBrowserEvent'
import Draw, { type Options } from 'ol/interaction/Draw'
import type { LineString, Polygon } from 'ol/geom'
import { committedVertices } from './sketchHistory'

interface Tap {
  pixel: number[]
  time: number
  pointerType: string
}

export default class MapPathDraw extends Draw {
  private sketch: LineString | Polygon | null = null
  private lastTap: Tap | null = null
  private readonly minimumVertices: number

  constructor(options: Options & { type: 'LineString' | 'Polygon' }, onReady: (ready: boolean) => void) {
    super({ ...options, stopClick: true, finishCondition: () => false })
    this.minimumVertices = options.type === 'Polygon' ? 3 : 2
    const update = () => onReady(this.canFinish())
    this.on('drawstart', ({ feature }) => {
      this.sketch = feature.getGeometry() as LineString | Polygon
      this.sketch.on('change', update)
      update()
    })
    this.on(['drawabort', 'drawend'], () => {
      this.sketch?.un('change', update)
      this.sketch = null
      this.lastTap = null
      onReady(false)
    })
  }

  private canFinish() {
    if (!this.sketch) return false
    const vertices = committedVertices(this.sketch)
    return new Set(vertices.map(([x, y]) => x + ',' + y)).size >= this.minimumVertices
  }

  finishIfReady() {
    if (!this.canFinish()) return false
    this.finishDrawing()
    return true
  }

  override handleUpEvent(event: MapBrowserEvent<PointerEvent>) {
    const { timeStamp: time, pointerType } = event.originalEvent
    const previous = this.lastTap
    const before = this.sketch ? committedVertices(this.sketch).length : 0
    const pass = super.handleUpEvent(event)
    if (pass || !this.sketch || this.getFreehand()) {
      this.lastTap = null
      return pass
    }

    const pixel = event.pixel
    const doubleTap = previous && previous.pointerType === pointerType && time >= previous.time &&
      time - previous.time <= 350 && Math.hypot(pixel[0] - previous.pixel[0], pixel[1] - previous.pixel[1]) <= 10
    this.lastTap = doubleTap ? null : { pixel: pixel.slice(), time, pointerType }
    if (doubleTap) {
      // Before the minimum is reached OpenLayers can append the second tap.
      if (committedVertices(this.sketch).length > before) this.removeLastPoint()
      this.finishIfReady()
    }
    return pass
  }
}
