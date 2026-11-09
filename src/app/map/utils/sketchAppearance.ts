import { asArray } from 'ol/color'
import type { FeatureLike } from 'ol/Feature'
import CircleStyle from 'ol/style/Circle'
import RegularShape from 'ol/style/RegularShape'
import Text from 'ol/style/Text'
import Fill from 'ol/style/Fill'
import Stroke from 'ol/style/Stroke'
import Style from 'ol/style/Style'

export const linePointerShapes = ['circle', 'square', 'diamond', 'crosshair'] as const
export type LinePointerShape = (typeof linePointerShapes)[number]

export interface SketchAppearance {
  lineOpacity: number
  pointSize: number
  linePointerShape: LinePointerShape
}

export const defaultSketchAppearance: SketchAppearance = { lineOpacity: 100, pointSize: 14, linePointerShape: 'circle' }

export function applySketchStrokeOpacity(style: Style | Style[], opacity: number) {
  if (opacity === 100) return style
  for (const item of Array.isArray(style) ? style : [style]) {
    const stroke = item.getStroke()
    const color = stroke?.getColor()
    if (stroke && (typeof color === 'string' || Array.isArray(color))) {
      const [red, green, blue, alpha] = asArray(color)
      stroke.setColor([red, green, blue, (alpha ?? 1) * opacity / 100])
    }
  }
  return style
}

export function createSketchStyle(
  appearance: { readonly current: SketchAppearance },
  variant: 'drawn' | 'draft' | 'selected' = 'drawn',
  useLinePointer = false,
) {
  const draft = variant === 'draft'
  const selected = variant === 'selected'
  const stroke = new Stroke({ width: selected ? 3 : draft ? 2 : 2.5, lineDash: draft ? [8, 4] : undefined })
  const image = new CircleStyle({
    radius: defaultSketchAppearance.pointSize / 2,
    fill: new Fill({ color: '#D17B47' }),
    stroke: new Stroke({ color: '#fff', width: selected ? 3 : 2 }),
  })
  const style = new Style({
    fill: new Fill({ color: draft || selected ? 'rgba(209, 123, 71, 0.3)' : 'rgba(209, 123, 71, 0.15)' }),
    stroke,
    image,
  })
  let previous: SketchAppearance | undefined
  return (feature?: FeatureLike) => {
    const current = appearance.current
    if (current !== previous) {
      stroke.setColor([209, 123, 71, current.lineOpacity / 100])
      const radius = current.pointSize / 2
      const pointer = useLinePointer ? current.linePointerShape : 'circle'
      if (pointer === 'circle') {
        image.setRadius(radius)
        style.setImage(image)
      } else {
        style.setImage(new RegularShape({
          points: 4, radius,
          angle: pointer === 'square' ? Math.PI / 4 : 0,
          radius2: pointer === 'crosshair' ? radius * 0.22 : undefined,
          fill: image.getFill() ?? undefined,
          stroke: image.getStroke() ?? undefined,
        }))
      }
      previous = current
    }
    if (!draft && feature?.getGeometry()?.getType() === 'Point') {
      const name: unknown = feature.get('name') ?? feature.get('label')
      if (typeof name === 'string' && name.trim()) {
        return [style, new Style({ text: new Text({
          text: name,
          offsetY: -(appearance.current.pointSize / 2 + 9),
          font: 'bold 11px sans-serif',
          fill: new Fill({ color: '#1a1816' }),
          stroke: new Stroke({ color: '#fff', width: 3 }),
        }) })]
      }
    }
    return style
  }
}
