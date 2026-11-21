import type Feature from 'ol/Feature'

/**
 * Sketch tagging — sketches are drawing aids, never survey data.
 *
 * Features created with the sketch tools carry `featureKind: 'sketch'`.
 * Survey deliverable exports (DXF, LandXML) exclude them; the point
 * register never receives them (register writes go through
 * ManualPointEntry / import flows, not the drawing source). Untagged
 * legacy drawing features keep their existing export behaviour — only
 * features positively identified as sketches are filtered out.
 */
export const SKETCH_FEATURE_KIND = 'sketch'

type FeatureLike = Pick<Feature, 'get' | 'set'>

export function tagSketchFeature<T extends FeatureLike>(feature: T): T {
  feature.set('featureKind', SKETCH_FEATURE_KIND)
  return feature
}

export function isSketchFeature(feature: FeatureLike | null | undefined): boolean {
  return feature?.get('featureKind') === SKETCH_FEATURE_KIND
}

/** Carry the sketch tag onto a feature derived from another (split/merge/reshape/offset). */
export function inheritSketchTag(from: FeatureLike | null | undefined, to: FeatureLike): void {
  if (isSketchFeature(from)) tagSketchFeature(to)
}

/** Features eligible for survey deliverable exports: everything except sketches. */
export function surveyExportFeatures<T extends FeatureLike>(features: readonly T[]): T[] {
  return features.filter((feature) => !isSketchFeature(feature))
}
