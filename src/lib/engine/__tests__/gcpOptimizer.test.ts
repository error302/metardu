/**
 * GCP export checks: Pix4D coordinates are converted from UTM to WGS84, while
 * the WebODM GCP Editor Pro CSV preserves its documented projected N/E order.
 */
import {
  exportForPix4D,
  exportForWebODM,
  generateGCPPlan,
  getProjectAreaHectares,
  isPointInsideProjectBoundary,
  markGCPPhotoCaptured,
  parseUtmBoundary,
  updateGCPWithSurvey,
} from '@/lib/engine/gcpOptimizer'
import type { GCPPoint } from '@/lib/engine/gcpOptimizer'

function makeGCP(easting: number, northing: number, name = 'GCP-01'): GCPPoint {
  return {
    id: 'test-' + name,
    name,
    easting,
    northing,
    elevation: 1700,
    rtkFixed: true,
    accuracy: 0.02,
    verticalAccuracy: 0.03,
    photoCaptured: true,
    status: 'validated',
    targetPattern: 'checkerboard',
  }
}

describe('P0-1: gcpOptimizer WGS84 export', () => {
  // Nairobi city centre WGS84 lat=-1.286, lon=36.817
  // → UTM 37S E=257088.42 N=9857754.23 (computed via geographicToUTM)
  const NAIROBI_E = 257088.42
  const NAIROBI_N = 9857754.23

  test('exportForPix4D produces non-zero lat/lon in Kenya bbox', () => {
    const csv = exportForPix4D([makeGCP(NAIROBI_E, NAIROBI_N)], 37, 'S')
    const lines = csv.trim().split('\n')
    expect(lines.length).toBe(1) // one six-column record

    const row = lines[0].split(',')
    const lat = parseFloat(row[1])
    const lon = parseFloat(row[2])

    // Must NOT be zero (the bug we fixed)
    expect(lat).not.toBe(0)
    expect(lon).not.toBe(0)

    // Must be in Kenya (lat -5..5, lon 33..42)
    expect(lat).toBeGreaterThan(-5)
    expect(lat).toBeLessThan(5)
    expect(lon).toBeGreaterThan(33)
    expect(lon).toBeLessThan(42)

    // Should be near Nairobi (within ~5km — test UTM coords are approximate)
    expect(Math.abs(lat - (-1.286))).toBeLessThan(0.05)
    expect(Math.abs(lon - 36.817)).toBeLessThan(0.05)
  })

  test('exportForWebODM produces the GCP Editor Pro Northing/Easting CSV format', () => {
    const csv = exportForWebODM([makeGCP(NAIROBI_E, NAIROBI_N)], 37, 'S')
    const lines = csv.trim().split('\n')
    expect(lines.length).toBe(2)
    expect(lines[0]).toBe('GCP Label,Northing,Easting,Elevation')

    expect(lines[1]).toBe('GCP-01,9857754.2300,257088.4200,1700.0000')
  })

  test('exportForPix4D with explicit Zone 37S produces Kenya lat/lon', () => {
    // Same Nairobi coords — should produce Kenya lat/lon with explicit zone
    const csv = exportForPix4D([makeGCP(NAIROBI_E, NAIROBI_N)], 37, 'S')
    const row = csv.trim().split('\n')[0].split(',')
    const lat = parseFloat(row[1])
    const lon = parseFloat(row[2])

    expect(lat).toBeGreaterThan(-5)
    expect(lat).toBeLessThan(5)
    expect(lon).toBeGreaterThan(33)
    expect(lon).toBeLessThan(42)
  })

  test('respects explicit zone override (Zone 36S for western Kenya)', () => {
    // Kisumu WGS84 lat=-0.091, lon=34.768
    // → UTM 36S E=696765.33 N=9989936.94 (computed via geographicToUTM)
    const csv = exportForPix4D(
      [makeGCP(696765.33, 9989936.94, 'GCP-KSM')],
      36, // Zone 36S
      'S',
    )
    const row = csv.trim().split('\n')[0].split(',')
    const lat = parseFloat(row[1])
    const lon = parseFloat(row[2])

    expect(lat).not.toBe(0)
    expect(lon).not.toBe(0)
    // Western Kenya lon < 37 (zone boundary)
    expect(lon).toBeLessThan(37)
    expect(lon).toBeGreaterThan(33)
  })

  test('Pix4D export preserves zero elevation and separate uncertainties', () => {
    const point = { ...makeGCP(NAIROBI_E, NAIROBI_N), elevation: 0, accuracy: 0.015, verticalAccuracy: 0.04 }
    const row = exportForPix4D([point], 37, 'S').trim().split('\n')[0].split(',')

    expect(row[3]).toBe('0.0000')
    expect(row[4]).toBe('0.0150')
    expect(row[5]).toBe('0.0400')
  })

  test('refuses to export proposed target coordinates as surveyed GCPs', () => {
    const planned = { ...makeGCP(NAIROBI_E, NAIROBI_N), status: 'planned' as const, rtkFixed: false }

    expect(() => exportForPix4D([planned], 37, 'S')).toThrow('planned target')
    expect(() => exportForWebODM([planned], 37, 'S')).toThrow('planned target')
  })

  test('refuses Pix4D export when horizontal or vertical uncertainty is missing', () => {
    const point = { ...makeGCP(NAIROBI_E, NAIROBI_N), verticalAccuracy: undefined }
    expect(() => exportForPix4D([point], 37, 'S')).toThrow('uncertainty')
  })

  test('a photo alone does not mark an unsurveyed target validated', () => {
    const planned = { ...makeGCP(NAIROBI_E, NAIROBI_N), status: 'planned' as const, rtkFixed: false }
    expect(markGCPPhotoCaptured(planned, 'https://example.test/gcp.jpg').status).toBe('planned')
  })
})

describe('GCP candidate target planning', () => {
  const concaveBoundary = [
    { easting: 257_000, northing: 9_857_700 },
    { easting: 257_100, northing: 9_857_700 },
    { easting: 257_100, northing: 9_857_740 },
    { easting: 257_040, northing: 9_857_740 },
    { easting: 257_040, northing: 9_857_800 },
    { easting: 257_000, northing: 9_857_800 },
  ]

  test('derives area from a strict UTM boundary and keeps targets inside a concave site', () => {
    const boundary = parseUtmBoundary('257000,9857700\n257100,9857700\n257100,9857740\n257040,9857740\n257040,9857800\n257000,9857800\n257000,9857700')
    const plan = generateGCPPlan({ boundary })

    expect(getProjectAreaHectares(boundary)).toBeCloseTo(0.64, 8)
    expect(plan.projectAreaHa).toBeCloseTo(0.64, 8)
    expect(plan.totalGCPs).toBe(5)
    expect(plan.gcps.every(gcp => isPointInsideProjectBoundary(gcp, boundary))).toBe(true)
    expect(plan.gcps.every(gcp => gcp.status === 'planned' && !gcp.rtkFixed)).toBe(true)
    expect(plan).not.toHaveProperty('estimatedAccuracy')
    expect(plan).not.toHaveProperty('coveragePercent')
  })

  test('rejects self-intersecting and malformed boundaries', () => {
    expect(() => parseUtmBoundary('257000,9857700\n257100,9857800\n257000,9857800\n257100,9857700')).toThrow()
    expect(() => parseUtmBoundary('257000,9857700,1\n257100,9857700\n257000,9857800')).toThrow('exactly two values')
    expect(() => generateGCPPlan({ boundary: [{ easting: 0, northing: 0 }, { easting: 0, northing: 0 }, { easting: 1, northing: 1 }] })).toThrow()
  })

  test('rejects a site whose heuristic target count exceeds the reviewed limit', () => {
    const largeSite = [
      { easting: 100_000, northing: 4_000_000 },
      { easting: 800_000, northing: 4_000_000 },
      { easting: 800_000, northing: 4_700_000 },
      { easting: 100_000, northing: 4_700_000 },
    ]
    expect(() => generateGCPPlan({ boundary: largeSite })).toThrow('Divide it into smaller survey blocks')
  })

  test('survey updates require finite coordinates and positive horizontal and vertical uncertainties', () => {
    const point = generateGCPPlan({ boundary: concaveBoundary }).gcps[0]
    expect(() => updateGCPWithSurvey(point, 1, 2, 3, 0, 0.02, true)).toThrow('positive horizontal and vertical uncertainty')
    const surveyed = updateGCPWithSurvey(point, 257088.42, 9857754.23, 1700, 0.02, 0.03, true)
    expect(surveyed).toMatchObject({ status: 'surveyed', rtkFixed: true, accuracy: 0.02, verticalAccuracy: 0.03 })
  })
})
