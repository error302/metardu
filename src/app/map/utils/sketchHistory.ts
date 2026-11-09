import type { Coordinate } from 'ol/coordinate'
import type { LineString, Polygon } from 'ol/geom'
import type Draw from 'ol/interaction/Draw'

export const emptySketchHistory = { canUndo: false, canRedo: false }

function committedVertices(geometry: LineString | Polygon): Coordinate[] {
  // The live line ends with the cursor. A live polygon ring also closes at its first vertex.
  if (geometry.getType() !== 'Polygon') return (geometry as LineString).getCoordinates().slice(0, -1)
  const ring = (geometry as Polygon).getCoordinates()[0] ?? []
  // At drawstart OpenLayers has not added the ring's extra closing vertex.
  return ring.length === 2 ? ring.slice(0, 1) : ring.slice(0, -2)
}

export function attachSketchHistory(draw: Draw, onChange: (value: typeof emptySketchHistory) => void) {
  let geometry: LineString | Polygon | null = null
  let undoCount = 0
  let redoing = false
  let undoing = false
  const undone: Coordinate[] = []

  function publish() {
    onChange({ canUndo: undoCount > 0, canRedo: undone.length > 0 })
  }

  function updateVertexCount() {
    const count = geometry ? committedVertices(geometry).length : 0
    if (count === undoCount) return
    if (count > undoCount && !redoing) undone.length = 0
    undoCount = count
    publish()
  }

  function reset() {
    geometry?.un('change', updateVertexCount)
    geometry = null
    undoCount = 0
    if (!undoing) undone.length = 0
    publish()
  }

  draw.on('drawstart', ({ feature }) => {
    geometry = feature.getGeometry() as LineString | Polygon
    geometry.on('change', updateVertexCount)
    updateVertexCount()
  })
  draw.on(['drawabort', 'drawend'], reset)

  return {
    undo() {
      const vertex = geometry && committedVertices(geometry).at(-1)
      if (!vertex) return undone.length > 0
      undone.push(vertex)
      undoing = true
      try {
        draw.removeLastPoint()
      } finally {
        undoing = false
      }
      return true
    },
    redo() {
      const vertex = undone.pop()
      if (!vertex) return undoCount > 0
      redoing = true
      try {
        draw.appendCoordinates([vertex])
      } finally {
        redoing = false
        publish()
      }
      return true
    },
    reset,
  }
}
