/**
 * African Datum Transformations
 * Phase 10 full implementation
 * Foundation only — structure for future development
 */

export interface DatumParameters {
  name: string
  ellipsoid: string
  semiMajorAxis: number
  inverseFlattening: number
  dx: number
  dy: number
  dz: number
  rx: number
  ry: number
  rz: number
  scale: number
  countries: string[]
}

export const AFRICAN_DATUMS: Record<string, DatumParameters> = {
  ARC1960: {
    name: 'Arc 1960',
    ellipsoid: 'Clarke 1880',
    semiMajorAxis: 6378249.145,
    inverseFlattening: 293.465,
    dx: -157, dy: -2, dz: -299,
    rx: 0, ry: 0, rz: 0,
    scale: 0,
    countries: ['Kenya', 'Uganda', 'Tanzania']
  },
  HARTEBEESTHOEK94: {
    name: 'Hartebeesthoek94',
    ellipsoid: 'GRS80',
    semiMajorAxis: 6378137.0,
    inverseFlattening: 298.257222101,
    dx: 0, dy: 0, dz: 0,
    rx: 0, ry: 0, rz: 0,
    scale: 0,
    countries: ['South Africa', 'Namibia', 'Lesotho', 'Swaziland']
  },
  ADINDAN: {
    name: 'Adindan',
    ellipsoid: 'Clarke 1880',
    semiMajorAxis: 6378249.145,
    inverseFlattening: 293.465,
    dx: -166, dy: -15, dz: 204,
    rx: 0, ry: 0, rz: 0,
    scale: 0,
    countries: ['Ethiopia', 'Sudan', 'Somalia']
  },
  CAPE: {
    name: 'Cape',
    ellipsoid: 'Clarke 1880',
    semiMajorAxis: 6378249.145,
    inverseFlattening: 293.465,
    dx: -136, dy: -108, dz: -292,
    rx: 0, ry: 0, rz: 0,
    scale: 0,
    countries: ['South Africa']
  },
  WGS84: {
    name: 'WGS84',
    ellipsoid: 'WGS84',
    semiMajorAxis: 6378137.0,
    inverseFlattening: 298.257223563,
    dx: 0, dy: 0, dz: 0,
    rx: 0, ry: 0, rz: 0,
    scale: 0,
    countries: ['Worldwide']
  }
}

export function getAvailableDatums(): DatumParameters[] {
  return Object.values(AFRICAN_DATUMS)
}

export function getDatumByCountry(country: string): DatumParameters[] {
  return Object.values(AFRICAN_DATUMS).filter(d => 
    d.countries.includes(country)
  )
}

export function getDatumNames(): string[] {
  return Object.keys(AFRICAN_DATUMS)
}

export function getDatumByName(name: string): DatumParameters | undefined {
  return AFRICAN_DATUMS[name]
}

export function transformToWGS84(
  easting: number,
  northing: number,
  zone: number,
  hemisphere: 'N' | 'S',
  sourceDatum: DatumParameters
): { easting: number; northing: number } {
  console.warn(`Datum transformation for ${sourceDatum.name} not yet implemented. Using WGS84 approximation.`)
  return { easting, northing }
}
