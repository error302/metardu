import type { RoadDesignData } from '@/types/engineering'
import { buildRoadHorizontalGeometry } from './roadCoordinateSetout'
/** Deliberately synthetic teaching data, never a client job or field evidence. */
export function roadWorkbenchExample() {
  const reference = {
    code: 'EPSG:32737',
    verticalDatum: 'Synthetic benchmark for worked example',
    distanceMode: 'grid' as const,
  }
  const ips: RoadDesignData['ips'] = [
    {
      id: 'example-start',
      name: 'Start',
      easting: 500000,
      northing: 9500000,
      radius: 0,
    },
    {
      id: 'example-pi',
      name: 'PI 1',
      easting: 500120,
      northing: 9500000,
      radius: 40,
      hasTransition: true,
      transitionLengthIn: 10,
      transitionLengthOut: 10,
    },
    {
      id: 'example-end',
      name: 'End',
      easting: 500120,
      northing: 9500120,
      radius: 0,
    },
  ]
  const route = buildRoadHorizontalGeometry(ips, 0, reference.code)
  if (!route.alignment)
    throw Error('The synthetic road geometry could not be evaluated.')
  const end = route.alignment.end,
    chainages = new Set([0, end])
  for (let ch = 20; ch < end; ch += 20) chainages.add(ch)
  const road: RoadDesignData = {
    roadName: 'Synthetic road · worked example',
    startChainage: 0,
    datum: 'WGS84',
    coordinateSystem: reference.code,
    designSpeed: 40,
    roadClass: 'C',
    ips,
    vips: [
      { id: 'example-v0', chainage: 0, reducedLevel: 100 },
      { id: 'example-v1', chainage: 100, reducedLevel: 102, curveLength: 60 },
      { id: 'example-v2', chainage: end, reducedLevel: 100 },
    ],
    crossSectionTemplate: {
      carriagewayWidth: 7,
      shoulderWidth: 1,
      camber: 2.5,
      shoulderCrossfall: 4,
      subgradeDepth: 0.4,
      cutSlope: '2:1',
      fillSlope: '1.5:1',
    },
    stations: [...chainages]
      .sort((a, b) => a - b)
      .map((chainage) => {
        const groundLevel =
          100 + chainage * 0.005 + 0.3 * Math.sin(chainage / 30)
        return {
          chainage,
          groundLevel,
          designLevelSource: 'vertical-alignment',
          groundProfile: [-20, -10, 0, 10, 20].map((offset) => ({
            offset,
            level: groundLevel + Math.abs(offset) * 0.015,
          })),
        }
      }),
  }
  return { road, reference }
}
