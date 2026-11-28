import { bearingToString } from '@/lib/engine/angles'
import { coordinateArea } from '@/lib/engine/area'
import { bowditchAdjustment, forwardTraverse } from '@/lib/engine/traverse'

export const CRS = 'Arc 1960 / UTM zone 37S (EPSG:21037)'
export const CONTROL = { name: 'MB1', easting: 257410.250, northing: 9857210.400 }
export const MIN_PRECISION = 5000
export const CLOSING_SHOT = 4

// Reduced horizontal grid observations for an illustrative closed traverse.
const shots = [
  { to: 'MB2', bearingSeconds: 276718, distance: 154.029 },
  { to: 'MB3', bearingSeconds: 565444, distance: 141.156 },
  { to: 'MB4', bearingSeconds: 845517, distance: 165.076 },
  { to: 'MB5', bearingSeconds: 1123638, distance: 126.732 },
  { to: 'MB1', bearingSeconds: 46350, distance: 108.642 },
]

export function sampleObservations(reobserved: boolean) {
  return shots.map((shot, index) => {
    const bearing = shot.bearingSeconds / 3600
    return {
      from: index === 0 ? CONTROL.name : shots[index - 1].to,
      to: shot.to,
      bearing,
      bearingDms: bearingToString(bearing),
      distance: reobserved && index === CLOSING_SHOT ? 107.742 : shot.distance,
    }
  })
}

export function sampleTraverse(reobserved: boolean) {
  const observations = sampleObservations(reobserved)
  const stations = observations.map(shot => shot.to)
  const distances = observations.map(shot => shot.distance)
  const bearings = observations.map(shot => shot.bearing)

  const raw = forwardTraverse({ start: CONTROL, stations, distances, bearings })
  const deltaE = raw.end.easting - CONTROL.easting
  const deltaN = raw.end.northing - CONTROL.northing
  const misclosure = Math.hypot(deltaE, deltaN)
  const precision = raw.totalDistance / misclosure
  const adjustment = precision >= MIN_PRECISION
    ? bowditchAdjustment({
      points: [CONTROL, ...raw.legs.map(leg => ({ name: leg.to, easting: leg.easting, northing: leg.northing }))],
      distances,
      bearings,
      closingPoint: CONTROL,
    })
    : null
  const points = adjustment
    ? [CONTROL, ...adjustment.legs.slice(0, -1).map(leg => ({
      name: leg.to,
      easting: leg.adjEasting,
      northing: leg.adjNorthing,
    }))]
    : []
  const area = adjustment ? coordinateArea(points) : null
  return { raw, deltaE, deltaN, misclosure, precision, adjustment, points, area }
}

export type SampleTraverse = ReturnType<typeof sampleTraverse>
export const ratio = (value: number) => `1:${Math.floor(value).toLocaleString('en-GB')}`
export const metres = (value: number) => value.toFixed(3)
