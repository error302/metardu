/**
 * @module sectionalProperties
 *
 * Draft sectional area schedules from operator-supplied measurements.
 *
 * Manages sectional plans for apartment buildings, commercial buildings,
 * and mixed-use developments. Each unit (apartment, office, parking bay,
 * common area) is recorded as supplied; this module does not determine title.
 *
 * Features:
 *   - Define building floors and units
 *   - Compute measured floor, unit and residual areas
 *   - Compute area-based shares for review, without determining legal quotas
 */

export interface SectionalUnit {
  id: string
  /** Unit number (e.g., "A1", "PARK-01") */
  unitNumber: string
  /** Floor number (0 = ground, 1 = first, -1 = basement) */
  floor: number
  /** Unit type */
  type: 'residential' | 'commercial' | 'parking' | 'storage' | 'common'
  /** Unit area in m² */
  area: number
  /** Description (e.g., "2-bedroom apartment") */
  description?: string
  /** Unit boundary coordinates (closed polygon, relative to building origin) */
  boundary?: Array<{ x: number; y: number }>
}

export interface SectionalFloor {
  floor: number
  /** Floor name (e.g., "Ground Floor", "1st Floor", "Basement") */
  name: string
  /** Total floor area in m² */
  totalArea: number
  /** Units on this floor */
  units: SectionalUnit[]
}

export interface SectionalPlan {
  buildingName: string
  lrNumber: string
  /** Total floors (including basement) */
  totalFloors: number
  floors: SectionalFloor[]
  /** Total building area (all floors) */
  totalArea: number
  /** Total unit area (excludes common areas) */
  totalUnitArea: number
  /** Measured floor area minus supplied private-unit areas; legal classification unverified. */
  totalCommonArea: number
  /** Area-based share per private unit; not an approved ownership quota. */
  participationQuotas: Array<{ unitId: string; unitNumber: string; quota: number }>
}

/**
 * Create a sectional plan from floor + unit data.
 * Computes areas, common areas, and participation quotas.
 */
export function createSectionalPlan(
  buildingName: string,
  lrNumber: string,
  floors: SectionalFloor[],
): SectionalPlan {
  if (!buildingName.trim() || !lrNumber.trim() || !floors.length) throw new RangeError('Supply the building identity, source parcel reference and measured floor data.')
  if (floors.length > 1000 || floors.reduce((sum, f) => sum + f.units.length, 0) > 20000) throw new RangeError('Use at most 1,000 floors and 20,000 measured units per schedule.')
  const floorIds = new Set<number>(), unitIds = new Set<string>(), unitNumbers = new Set<string>()
  const types = new Set(['residential', 'commercial', 'parking', 'storage', 'common'])
  let totalArea = 0
  let totalUnitArea = 0
  let totalCommonArea = 0

  for (const floor of floors) {
    if (!Number.isInteger(floor.floor) || floorIds.has(floor.floor) || !Number.isFinite(floor.totalArea) || floor.totalArea <= 0 || !floor.units.length) throw new RangeError('Each distinct integer floor needs a positive measured total area and measured units.')
    floorIds.add(floor.floor)
    totalArea += floor.totalArea
    let floorUnitArea = 0, allUnitArea = 0
    for (const unit of floor.units) {
      const id = unit.id.trim(), number = unit.unitNumber.trim().toUpperCase()
      if (!id || !number || unitIds.has(id) || unitNumbers.has(number)) throw new RangeError('Unit IDs and numbers must be nonempty and unique across the building.')
      unitIds.add(id); unitNumbers.add(number)
      if (unit.floor !== floor.floor || !types.has(unit.type) || !Number.isFinite(unit.area) || unit.area <= 0) throw new RangeError('Each unit needs the matching floor, declared type and positive finite measured area.')
      allUnitArea += unit.area
      if (unit.type !== 'common') {
        floorUnitArea += unit.area
        totalUnitArea += unit.area
      }
    }
    if (!Number.isFinite(allUnitArea) || allUnitArea > floor.totalArea) throw new RangeError('Supplied unit/common-space areas exceed the measured floor total; review observations and the area basis.')
    totalCommonArea += floor.totalArea - floorUnitArea
  }
  if (![totalArea, totalUnitArea, totalCommonArea].every(Number.isFinite) || totalUnitArea <= 0) throw new RangeError('A finite area schedule requires at least one measured private unit.')

  // Participation quota = unit area / total unit area × 100
  const participationQuotas = floors
    .flatMap(f => f.units)
    .filter(u => u.type !== 'common')
    .map(u => ({
      unitId: u.id,
      unitNumber: u.unitNumber,
      quota: totalUnitArea > 0 ? (u.area / totalUnitArea) * 100 : 0,
    }))

  return {
    buildingName,
    lrNumber,
    totalFloors: floors.length,
    floors,
    totalArea,
    totalUnitArea,
    totalCommonArea,
    participationQuotas,
  }
}

/** Group supplied units against explicit measured totals; no assumed common-space allowance. */
export function createSectionalPlanFromUnits(buildingName: string, lrNumber: string, units: SectionalUnit[], floorTotals: Array<{ floor: number; totalArea: number }>): SectionalPlan {
  if (units.some(unit => !floorTotals.some(total => total.floor === unit.floor))) throw new RangeError('Supply a measured total for every entered floor.')
  return createSectionalPlan(buildingName, lrNumber, floorTotals.map(total => ({ ...total,
    name: total.floor === 0 ? 'Ground floor' : total.floor < 0 ? `Basement ${-total.floor}` : `Floor ${total.floor}`,
    units: units.filter(unit => unit.floor === total.floor) })).sort((a, b) => a.floor - b.floor))
}
