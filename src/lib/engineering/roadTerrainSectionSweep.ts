import type { RoadDesignData } from '@/types/engineering'
import { canonicalJson } from '@/lib/provenance/canonicalJson'
import { assertSurveyCrs } from '@/lib/spatial/projectCrs'
import { roadDesignDataSchema } from './roadDesignSchema'
import { buildRoadHorizontalGeometry, roadHorizontalCurvature, roadHorizontalStation, type RoadDerivativeSide } from './roadCoordinateSetout'
import { calculateRoadVertical, roadVerticalStation } from './roadVerticalAlignment'
import { calculateRoadSection, validateRoadTemplate } from './roadProjectOutputs'
import { integrateProfileSweep } from './profileGeometry'
import { roadTerrainDataSchema, roadTerrainIdentitySchema, sectionFromRetainedTerrain, type RoadTerrainData } from './roadTerrain'
import type { QuantityReference } from './roadQuantity'

export const ROAD_TERRAIN_SECTION_SWEEP_VERSION = '1.0.0'

/**
 * Prepare immutable consumed inputs for local terrain volume-rate evaluation.
 * The caller must obtain terrain through the validated retained-revision reader;
 * matching claimed identities here is not database ownership/hash authentication.
 * The source key includes the actual geometry supplied, not just its claimed hash.
 * No station schedule, whole-road volume or coverage verdict is inferred.
 */
export function prepareRoadTerrainSectionSampler(input: RoadDesignData, projectReference: QuantityReference, retained: RoadTerrainData) {
  if (!input.retainedTerrain) throw new RangeError('Select an exact saved terrain binding before evaluating section rates.')
  // Retain only consumed source fields, independently of cached designs and the
  // original measured station list. Schema parsing deep-copies these inputs.
  const road = roadDesignDataSchema.parse({
    roadName: input.roadName, startChainage: input.startChainage, datum: input.datum,
    coordinateSystem: input.coordinateSystem, designSpeed: input.designSpeed, roadClass: input.roadClass,
    retainedTerrain: input.retainedTerrain,
    ips: input.ips.map(p => ({ id: p.id, name: p.name, easting: p.easting, northing: p.northing, radius: p.radius, hasTransition: p.hasTransition, transitionLengthIn: p.transitionLengthIn, transitionLengthOut: p.transitionLengthOut })),
    vips: input.vips.map(p => ({ id: p.id, chainage: p.chainage, reducedLevel: p.reducedLevel, kValue: p.kValue, curveLength: p.curveLength, gradientIn: p.gradientIn, gradientOut: p.gradientOut })),
    crossSectionTemplate: input.crossSectionTemplate && {
      carriagewayWidth: input.crossSectionTemplate.carriagewayWidth, shoulderWidth: input.crossSectionTemplate.shoulderWidth,
      camber: input.crossSectionTemplate.camber, subgradeDepth: input.crossSectionTemplate.subgradeDepth,
      cutSlope: input.crossSectionTemplate.cutSlope, fillSlope: input.crossSectionTemplate.fillSlope, shoulderCrossfall: input.crossSectionTemplate.shoulderCrossfall,
    }, stations: [],
  })
  const terrain = roadTerrainDataSchema.parse(retained), binding = road.retainedTerrain, template = road.crossSectionTemplate
  if (!binding || !template) throw new RangeError('The terrain binding and complete road template are required.')
  const { halfWidthM } = binding, identity = roadTerrainIdentitySchema.strip().parse(binding)
  if (canonicalJson(identity) !== canonicalJson(terrain.identity)) throw new RangeError('The exact retained terrain identity does not match the saved road binding.')
  const reference = { code: projectReference.code, verticalDatum: projectReference.verticalDatum, distanceMode: projectReference.distanceMode }
  if (!reference.code || reference.code !== road.coordinateSystem || reference.code !== identity.crs || assertSurveyCrs(reference.code).units !== 'metres' || reference.verticalDatum !== identity.verticalDatum || reference.distanceMode !== 'grid') throw new RangeError('The section rate requires the same declared projected metre, height and grid references as the retained terrain.')
  validateRoadTemplate(template)
  if (halfWidthM < template.carriagewayWidth / 2 + template.shoulderWidth) throw new RangeError('Extend the terrain review width to cover both shoulders and daylight.')
  const horizontal = buildRoadHorizontalGeometry(road.ips, road.startChainage, reference.code)
  if (!horizontal.alignment) throw new RangeError(horizontal.issues.join(' '))
  const vertical = calculateRoadVertical(road.vips)
  if (!vertical.alignment || vertical.alignment.start > horizontal.alignment.start || vertical.alignment.end < horizontal.alignment.end) throw new RangeError('The saved vertical alignment must cover the full horizontal route; no target levels are extrapolated.')
  const alignment = horizontal.alignment, profile = vertical.alignment
  const sourceKey = canonicalJson({ algorithm: 'retained-terrain-section-sweep', algorithmVersion: ROAD_TERRAIN_SECTION_SWEEP_VERSION, road, reference, terrain })
  if (sourceKey.length > 8_000_000) throw new RangeError('Split this section-rate source into a bounded work package smaller than 8 million characters.')
  return {
    start: alignment.start, end: alignment.end, sourceKey,
    at(chainage: number, side: RoadDerivativeSide) {
      const position = roadHorizontalStation(alignment, chainage), curvaturePerM = roadHorizontalCurvature(alignment, chainage, side)
      if (!position || curvaturePerM === null) throw new RangeError('The requested one-sided derivative is outside route coverage; no section rate was extrapolated.')
      const design = roadVerticalStation(profile, chainage)
      if (!design) throw new RangeError('The requested section lacks saved vertical design coverage.')
      const groundProfile = sectionFromRetainedTerrain(terrain.mesh, position, halfWidthM)
      const centre = groundProfile.find(p => p.offset === 0)
      if (!centre) throw new RangeError('The retained terrain centreline height is unknown.')
      const section = calculateRoadSection({ chainage, groundLevel: centre.level, groundProfile, designLevel: design.elevation, designLevelSource: 'vertical-alignment' }, template)
      const sweep = integrateProfileSweep(section.ground, section.formation, curvaturePerM)
      return {
        status: 'LOCAL_REVIEW' as const, fieldVerified: false as const,
        chainage, side, curvaturePerM, terrainRevisionId: identity.revisionId,
        designLevel: design.elevation, groundLevel: centre.level,
        leftDaylightOffset: section.leftCatch.offset, rightDaylightOffset: section.rightCatch.offset,
        ...sweep,
      }
    },
  }
}
