import Feature from 'ol/Feature'
import Point from 'ol/geom/Point'
import Polygon from 'ol/geom/Polygon'
import {
  inheritSketchTag,
  isSketchFeature,
  surveyExportFeatures,
  tagSketchFeature,
} from './sketchFeatures'

function pointFeature(kind?: string) {
  const feature = new Feature({ geometry: new Point([0, 0]) })
  if (kind) feature.set('featureKind', kind)
  return feature
}

test('tagSketchFeature marks a feature as a sketch', () => {
  const feature = pointFeature()
  expect(isSketchFeature(feature)).toBe(false)
  tagSketchFeature(feature)
  expect(isSketchFeature(feature)).toBe(true)
  expect(isSketchFeature(null)).toBe(false)
  expect(isSketchFeature(undefined)).toBe(false)
})

test('survey exports exclude sketches but keep untagged drawing features', () => {
  const sketch = tagSketchFeature(pointFeature())
  const boundary = pointFeature() // legacy drawing feature, not a sketch
  const taggedParcel = pointFeature('parcel')
  const exported = surveyExportFeatures([sketch, boundary, taggedParcel])
  expect(exported).toEqual([boundary, taggedParcel])
  expect(exported).not.toContain(sketch)
})

test('derived features inherit the sketch tag (split/merge/reshape/offset)', () => {
  const original = tagSketchFeature(new Feature({ geometry: new Polygon([[[0, 0], [1, 0], [1, 1], [0, 0]]]) }))
  const derived = new Feature({ geometry: new Polygon([[[0, 0], [1, 0], [1, 1], [0, 0]]]) })
  inheritSketchTag(original, derived)
  expect(isSketchFeature(derived)).toBe(true)

  const plain = pointFeature()
  const plainDerived = pointFeature()
  inheritSketchTag(plain, plainDerived)
  expect(isSketchFeature(plainDerived)).toBe(false)
})
