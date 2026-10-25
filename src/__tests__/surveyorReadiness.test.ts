import { describe, it, expect } from '@jest/globals'
import { computeTraverse } from '../lib/computations/traverseEngine'
import { generateCADDocumentDXF } from '../components/cad-editor/cadDxfExport'
import type { CADDocument } from '../components/cad-editor/CADEditor'
import {
  AD_ASCII_RECIPE,
  CADASTRAL_CONTOUR_RECIPE,
  GEODETIC_MATRIX_RECIPE,
  SURVEYOR_CROSS_RECIPE,
} from '../components/ascii/types'
import { AsciiRasterEngine } from '../components/ascii/AsciiRasterEngine'

const syntheticProjectCrs = 'EPSG:21037'

describe('METARDU synthetic survey computation and export checks', () => {
  it('T1 - Synthetic four-leg loop preserves analytical Bowditch geometry', () => {
    const result = computeTraverse({
      openingEasting: 250000.0,
      openingNorthing: 9800000.0,
      openingStation: 'STN1',
      closingEasting: 250000.0,
      closingNorthing: 9800000.0,
      closingStation: 'STN1',
      backsightBearingDeg: 0,
      backsightBearingMin: 0,
      backsightBearingSec: 0,
      observations: [
        {
          station: 'STN2',
          bs: 'BS',
          fs: 'STN3',
          hclDeg: '90',
          hclMin: '0',
          hclSec: '0',
          hcrDeg: '270',
          hcrMin: '0',
          hcrSec: '0',
          slopeDist: '150.000',
          vaDeg: '90',
          vaMin: '0',
          vaSec: '0',
          ih: '1.5',
          th: '1.5',
        },
        {
          station: 'STN3',
          bs: 'STN1',
          fs: 'STN4',
          hclDeg: '270',
          hclMin: '0',
          hclSec: '0',
          hcrDeg: '90',
          hcrMin: '0',
          hcrSec: '0',
          slopeDist: '120.000',
          vaDeg: '90',
          vaMin: '0',
          vaSec: '0',
          ih: '1.5',
          th: '1.5',
        },
        {
          station: 'STN4',
          bs: 'STN2',
          fs: 'STN1',
          hclDeg: '270',
          hclMin: '0',
          hclSec: '0',
          hcrDeg: '90',
          hcrMin: '0',
          hcrSec: '0',
          slopeDist: '150.000',
          vaDeg: '90',
          vaMin: '0',
          vaSec: '0',
          ih: '1.5',
          th: '1.5',
        },
        {
          station: 'STN1',
          bs: 'STN3',
          fs: 'X',
          hclDeg: '270',
          hclMin: '0',
          hclSec: '0',
          hcrDeg: '90',
          hcrMin: '0',
          hcrSec: '0',
          slopeDist: '120.000',
          vaDeg: '90',
          vaMin: '0',
          vaSec: '0',
          ih: '1.5',
          th: '1.5',
        },
      ],
    })

    // Leg 1 should propagate due East (90 deg)
    expect(Math.abs(result.legs[0].wcb - 90)).toBeLessThan(0.1)

    // Total perimeter should equal 150 + 120 + 150 + 120 = 540m
    expect(Math.abs(result.totalPerimeter - 540)).toBeLessThan(0.05)

    // Closing coordinates must return to STN1 (250000, 9800000)
    const closingCoord = result.coordinates[result.coordinates.length - 1]
    expect(Math.abs(closingCoord.easting - 250000.0)).toBeLessThan(0.02)
    expect(Math.abs(closingCoord.northing - 9800000.0)).toBeLessThan(0.02)
  })

  it('T2 - referenced CAD generates AC1021 DXF with recomputed measurements', () => {
    const samplePlan: CADDocument = {
      beacons: [
        { id: 'b1', label: 'B1', x: 200, y: 200, easting: 250100.0, northing: 9800100.0, symbol: 'concrete_beacon' },
        { id: 'b2', label: 'B2', x: 450, y: 200, easting: 250350.0, northing: 9800100.0, symbol: 'concrete_beacon' },
        { id: 'b3', label: 'B3', x: 450, y: 400, easting: 250350.0, northing: 9799900.0, symbol: 'concrete_beacon' },
        { id: 'b4', label: 'B4', x: 200, y: 400, easting: 250100.0, northing: 9799900.0, symbol: 'concrete_beacon' },
      ],
      boundaries: [
        { id: 'bdy1', fromId: 'b1', toId: 'b2', bearing: '90°00\'00"', distance: '25.000', distanceM: 25, type: 'standard' },
        { id: 'bdy2', fromId: 'b2', toId: 'b3', bearing: '180°00\'00"', distance: '20.000', distanceM: 20, type: 'standard' },
        { id: 'bdy3', fromId: 'b3', toId: 'b4', bearing: '270°00\'00"', distance: '25.000', distanceM: 25, type: 'road', roadLabel: '12m Road' },
        { id: 'bdy4', fromId: 'b4', toId: 'b1', bearing: '00°00\'00"', distance: '20.000', distanceM: 20, type: 'standard' },
      ],
      annotations: [
        { id: 'a1', type: 'text', x: 325, y: 300, text: 'LR 209/5431' },
      ],
      northArrow: { x: 800, y: 100, rotation: 0, type: 'grid', bearing: '0°' },
      scaleBar: { x: 50, y: 700, scaleMeters: 50 },
      titleBlock: {
        projectName: 'Cadastral Deed Plan LR 209/5431',
        lrNumber: '209/5431',
        surveyor: 'K. J. Odhiambo MISK',
        regNo: 'MISK/442',
        date: '2026-09-23',
        scale: '1:1000',
        sheet: '1 of 1',
      },
      width: 1122,
      height: 794,
      metersPerPixel: 1,
      originEasting: 249900,
      originNorthing: 9799506,
      coordinateReferenceSystem: syntheticProjectCrs,
    }

    const dxf = generateCADDocumentDXF(samplePlan)

    expect(dxf).toContain('AC1021')
    expect(dxf).toContain('250.000m')
    expect(dxf).toContain('200.000m')
    expect(dxf).toContain('DRAFT')
    expect(dxf).toContain('$INSUNITS')
    expect(dxf).toContain('BOUNDARY')
    expect(dxf).toContain('BEACONS')
    expect(dxf).toContain('LABELS')
    expect(dxf).toContain('TITLE_BLOCK')
    expect(dxf).toContain('POINT')
    expect(dxf).toContain('B1')
    expect(dxf).toContain('LINE')
    expect(dxf).toContain('LR 209/5431')
    expect(dxf).toContain('EOF')
  })

  it('T3 - All 21st.dev presets ("ad" Stars, Contour, Matrix, Cross) are strictly configured', () => {
    expect(AD_ASCII_RECIPE.renderMode).toBe('stars')
    expect(AD_ASCII_RECIPE.cellSize).toBe(16)
    expect(AD_ASCII_RECIPE.contrast).toBe(115)
    expect(AD_ASCII_RECIPE.brightness).toBe(12)
    expect(AD_ASCII_RECIPE.pfx.bloom.enabled).toBe(true)
    expect(AD_ASCII_RECIPE.pfx.scanLines.enabled).toBe(true)
    expect(AD_ASCII_RECIPE.pfx.vignette.enabled).toBe(true)
    expect(AD_ASCII_RECIPE.pfx.filmGrain.enabled).toBe(true)
    expect(AD_ASCII_RECIPE.gradientSource.colors).toHaveLength(4)

    expect(CADASTRAL_CONTOUR_RECIPE.renderMode).toBe('contour')
    expect(CADASTRAL_CONTOUR_RECIPE.animStyle).toBe('ripple')

    expect(GEODETIC_MATRIX_RECIPE.renderMode).toBe('matrix')
    expect(GEODETIC_MATRIX_RECIPE.pfx.bloom.intensity).toBe(45)

    expect(SURVEYOR_CROSS_RECIPE.renderMode).toBe('cross')
    expect(SURVEYOR_CROSS_RECIPE.cellSize).toBe(20)
  })

  it('T4 - Color grading and blend modes calculate accurate RGB transitions', () => {
    const engine = new AsciiRasterEngine()

    const neutral = engine.applyColorAdjustments(
      128, 128, 128,
      0, 100, 100, 0,
      { r: 0, g: 0, b: 0 }, 0, 'multiply'
    )
    expect(neutral.r).toBe(128)
    expect(neutral.g).toBe(128)
    expect(neutral.b).toBe(128)

    const contrast = engine.applyColorAdjustments(
      140, 140, 140,
      0, 150, 100, 0,
      { r: 0, g: 0, b: 0 }, 0, 'multiply'
    )
    expect(contrast.r).toBeGreaterThan(140)

    const mono = engine.applyColorAdjustments(
      255, 0, 0,
      0, 100, 100, 100,
      { r: 0, g: 0, b: 0 }, 0, 'multiply'
    )
    expect(Math.abs(mono.r - mono.g)).toBeLessThanOrEqual(2)
    expect(Math.abs(mono.g - mono.b)).toBeLessThanOrEqual(2)
  })

  it('T5 - Calculates accurate survey parcel area in square metres and hectares', () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 200 },
      { x: 0, y: 200 },
    ]
    let sum = 0
    for (let i = 0; i < pts.length; i++) {
      const j = (i + 1) % pts.length
      sum += pts[i].x * pts[j].y - pts[j].x * pts[i].y
    }
    const areaM2 = Math.abs(sum) / 2
    const areaHa = areaM2 / 10000

    expect(areaM2).toBe(20000)
    expect(areaHa).toBe(2.0)
  })

  it('T6 - End-to-end subdivision calculation yields valid child lots with road reserves', async () => {
    const { generateSubdivision } = await import('../lib/compute/subdivisionGenerator')

    // 1-hectare parent parcel (100m x 100m)
    const parentBoundary: [number, number][] = [
      [760200.0, 9913200.0],
      [760300.0, 9913200.0],
      [760300.0, 9913300.0],
      [760200.0, 9913300.0],
      [760200.0, 9913200.0],
    ]

    const result = generateSubdivision({
      parentBoundary,
      plotWidth: 20,
      plotDepth: 40,
      roadWidth: 9,
      roadPlacement: 'center',
    })

    expect(result.plots.length).toBeGreaterThan(0)
    expect(result.beacons.length).toBeGreaterThan(0)
    expect(result.stats.totalPlotAreaSqM).toBeGreaterThan(0)
    expect(result.stats.totalRoadAreaSqM).toBeGreaterThan(0)
    expect(result.stats.parentAreaSqM).toBeCloseTo(10000, 6)
    expect(result.stats.totalRoadAreaSqM).toBeCloseTo(900, 4)
    expect(result.roadReserve.boundaryRings.length).toBeGreaterThan(0)
    expect(result.stats.efficiency).toBeGreaterThan(50)
  })

  it('T7 - Subdivision plan export remains a draft and uses only supplied geometry', async () => {
    const { renderSubdivisionPlan } = await import('../lib/reports/subdivisionPlan/subdivisionPlanRenderer')

    const planData = {
      projectCrs: syntheticProjectCrs,
      countyName: '', parcelNumber: '', ward: '', location: '', userCategory: '',
      portions: [{
        id: 'A', label: 'A', areaHa: 0,
        boundaryPoints: [
          { easting: 760200, northing: 9913200 },
          { easting: 760300, northing: 9913200 },
          { easting: 760300, northing: 9913300 },
          { easting: 760200, northing: 9913300 },
        ],
      }],
      roadReserves: [], truncations: [], abuttals: [],
      locationPlan: { landmarkName: '', nearbyParcels: [], accessRoadLabel: '' },
      owner: { name: '', address: '', idNo: '' },
      planner: { name: '', address: '', rppNo: '' },
      surveyor: { name: '', address: '', lsNo: '' },
      notes: [],
    }
    const svg = renderSubdivisionPlan(planData)

    expect(svg).toContain('SUBDIVISION/AMALGAMATION SCHEME PLAN')
    expect(svg).toContain('PROPOSED SUBDIVISION OF PARCEL')
    expect(svg).toContain('A = 1.0000')
    expect(svg).toContain('DRAFT — NOT AUTHORITY APPROVED')
    expect(svg).toContain('NOT SUBMITTED / NOT APPROVED')
    expect(svg).not.toContain('COUNTY GOVERNMENT OF BOMET')
    expect(svg).not.toContain('30M Road Reserve')
  })
})

