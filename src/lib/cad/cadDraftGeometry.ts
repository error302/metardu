import type { CADAnnotation } from '@/components/cad-editor/CADEditor'

export const cadLineStyles = ['solid', 'dashed', 'dotted', 'center'] as const
export type CadLineStyle = (typeof cadLineStyles)[number]
export type CadDraftType = Exclude<CADAnnotation['type'], 'text'>
interface Point { x: number; y: number }

export const cadStrokeDash: Record<CadLineStyle, string | undefined> = {
  solid: undefined,
  dashed: '8 5',
  dotted: '1 4',
  center: '12 4 2 4',
}

export function makeCadDraftShape(type: CadDraftType, start: Point, end: Point, lineStyle: CadLineStyle, id: string): CADAnnotation {
  if (![start.x, start.y, end.x, end.y].every(Number.isFinite)) throw new RangeError('Choose finite draft coordinates.')
  const dx = end.x - start.x, dy = end.y - start.y
  if (type === 'rectangle' ? !dx || !dy : !Math.hypot(dx, dy)) throw new RangeError('Choose a second point that gives the shape a size.')
  return { id, type, x: start.x, y: start.y, x2: end.x, y2: end.y, lineStyle }
}

export function cadDraftBoundsPoints(shape: CADAnnotation): Point[] {
  if (shape.x2 === undefined || shape.y2 === undefined) return [shape]
  if (shape.type === 'circle') {
    const radius = Math.hypot(shape.x2 - shape.x, shape.y2 - shape.y)
    return [{ x: shape.x - radius, y: shape.y - radius }, { x: shape.x + radius, y: shape.y + radius }]
  }
  return [shape, { x: shape.x2, y: shape.y2 }]
}

export function copyCadDraftShape(shape: CADAnnotation, offset: Point, id: string) {
  if (shape.type === 'text' || shape.x2 === undefined || shape.y2 === undefined) throw new RangeError('Select a draft line or shape to copy.')
  if (offset.x === 0 && offset.y === 0) throw new RangeError('Enter a nonzero copy offset.')
  return {
    ...makeCadDraftShape(shape.type, { x: shape.x + offset.x, y: shape.y + offset.y },
      { x: shape.x2 + offset.x, y: shape.y2 + offset.y }, shape.lineStyle ?? 'solid', id),
    color: shape.color,
  }
}
