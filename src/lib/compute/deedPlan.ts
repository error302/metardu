import type { BoundaryPoint, BoundaryLeg, ClosureCheck } from '@/types/deedPlan'

export function computeBoundaryLegs(points: BoundaryPoint[]): BoundaryLeg[] {
  if (points.length < 3) {
    throw new Error('A polygon requires at least 3 boundary points')
  }

  const legs: BoundaryLeg[] = []
  const closedPoints = [...points, points[0]]

  for (let i = 0; i < closedPoints.length - 1; i++) {
    const from = closedPoints[i]
    const to = closedPoints[i + 1]

    const deltaE = to.easting - from.easting
    const deltaN = to.northing - from.northing

    const bearingDecimal = Math.atan2(deltaE, deltaN) * (180 / Math.PI)
    const bearing360 = (bearingDecimal + 360) % 360

    const distance = Math.sqrt(deltaE * deltaE + deltaN * deltaN)

    legs.push({
      fromPoint: from.id,
      toPoint: to.id,
      bearing: degreesToDMS(bearing360),
      distance: Math.round(distance * 100) / 100
    })
  }

  return legs
}

export function degreesToDMS(decimalDegrees: number): string {
  const d = Math.floor(decimalDegrees)
  const decimalMinutes = (decimalDegrees - d) * 60
  const m = Math.floor(decimalMinutes)
  const seconds = (decimalMinutes - m) * 60

  return `${String(d).padStart(3, '0')}°${String(m).padStart(2, '0')}'${seconds.toFixed(3).padStart(6, '0')}"`
}

export function computeArea(points: BoundaryPoint[]): number {
  if (points.length < 3) {
    return 0
  }

  let area = 0
  const n = points.length

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    area += points[i].easting * points[j].northing
    area -= points[j].easting * points[i].northing
  }

  return Math.round(Math.abs(area / 2) * 10000) / 10000
}

export function computeClosureCheck(points: BoundaryPoint[]): ClosureCheck {
  if (points.length < 3) {
    return {
      closingErrorE: 0,
      closingErrorN: 0,
      perimeter: 0,
      precisionRatio: 'N/A',
      passes: false
    }
  }

  let totalDeparture = 0
  let totalLatitude = 0
  let perimeter = 0
  const closedPoints = [...points, points[0]]

  for (let i = 0; i < closedPoints.length - 1; i++) {
    const deltaE = closedPoints[i + 1].easting - closedPoints[i].easting
    const deltaN = closedPoints[i + 1].northing - closedPoints[i].northing

    totalDeparture += deltaE
    totalLatitude += deltaN

    const distance = Math.sqrt(deltaE * deltaE + deltaN * deltaN)
    perimeter += distance
  }

  const closingErrorE = Math.abs(totalDeparture)
  const closingErrorN = Math.abs(totalLatitude)
  const linearMisclosure = Math.sqrt(closingErrorE * closingErrorE + closingErrorN * closingErrorN)

  const precisionRatio = linearMisclosure > 0
    ? perimeter / linearMisclosure
    : Infinity

  const formattedRatio = `1 : ${Math.round(precisionRatio).toLocaleString()}`

  return {
    closingErrorE: Math.round(closingErrorE * 100) / 100,
    closingErrorN: Math.round(closingErrorN * 100) / 100,
    perimeter: Math.round(perimeter * 100) / 100,
    precisionRatio: formattedRatio,
    passes: precisionRatio >= 5000
  }
}
