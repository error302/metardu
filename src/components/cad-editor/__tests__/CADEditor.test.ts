import { describe, it, expect } from '@jest/globals'
import type { CADDocument } from '../CADEditor';
import { generateCADDocumentDXF } from '../cadDxfExport'

// Declared reference systems for the synthetic controls in this suite.
const fixtureCrs21037 = 'EPSG:21037'


describe('CADEditor types and utilities', () => {
  const sampleDoc: CADDocument = {
    beacons: [
      { id: 'b1', label: 'B1', x: 100, y: 100, easting: 250100, northing: 9800100 },
      { id: 'b2', label: 'B2', x: 300, y: 100, easting: 250300, northing: 9800100 },
      { id: 'b3', label: 'B3', x: 300, y: 300, easting: 250300, northing: 9799900 },
    ],
    boundaries: [
      { id: 'bdy1', fromId: 'b1', toId: 'b2', bearing: '90°00\'00"', bearingDeg: 90, distance: '200.000', distanceM: 200, type: 'standard' },
      { id: 'bdy2', fromId: 'b2', toId: 'b3', bearing: '180°00\'00"', bearingDeg: 180, distance: '200.000', distanceM: 200, type: 'standard' },
    ],
    annotations: [
      { id: 'ann1', type: 'text', x: 150, y: 80, text: 'ROAD ACCESS' },
    ],
    northArrow: { x: 900, y: 100, rotation: 0, type: 'grid', bearing: '0°' },
    scaleBar: { x: 80, y: 700, scaleMeters: 50 },
    titleBlock: {
      projectName: 'Cadastral Test Plan',
      lrNumber: 'LR 209/999',
      surveyor: 'Test Surveyor',
      regNo: 'MISK001',
      date: '2026-09-10',
      scale: '1:1000',
      sheet: '1 of 1',
    },
    backgroundImage: {
      id: 'img1',
      url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      name: 'scanned_rim.png',
      x: 50,
      y: 50,
      width: 800,
      height: 600,
      opacity: 0.5,
      rotation: 0,
      locked: false,
      visible: true,
    },
    width: 1122,
    height: 794,
    metersPerPixel: 1,
    originEasting: 250000,
    originNorthing: 9799406,
    coordinateReferenceSystem: fixtureCrs21037,
  }

  it('CADDocument interface correctly supports background image and scale parameters', () => {
    expect(sampleDoc.beacons).toHaveLength(3)
    expect(sampleDoc.backgroundImage).toBeDefined()
    expect(sampleDoc.backgroundImage?.name).toBe('scanned_rim.png')
    expect(sampleDoc.metersPerPixel).toBe(1)
  })

  it('2-Point scale calibration calculates correct meters-per-pixel ratio', () => {
    const pt1 = { x: 100, y: 100 }
    const pt2 = { x: 500, y: 100 }
    const realGroundDistanceM = 100.0 // 100 meters

    const pixelDistance = Math.hypot(pt2.x - pt1.x, pt2.y - pt1.y)
    expect(pixelDistance).toBe(400)

    const calculatedMetersPerPx = realGroundDistanceM / pixelDistance
    expect(calculatedMetersPerPx).toBe(0.25) // 400px = 100m -> 4px = 1m -> 0.25m per px
  })

  it('generates standard AutoCAD DXF output with layers and entities', () => {
    const dxf = generateCADDocumentDXF(sampleDoc)

    // Verify UTF-8 AutoCAD 2007 format.
    expect(dxf).toContain('SECTION')
    expect(dxf).toContain('HEADER')
    expect(dxf).toContain('$ACADVER')
    expect(dxf).toContain('AC1021')

    // Verify layer definitions
    expect(dxf).toContain('BOUNDARY')
    expect(dxf).toContain('BEACONS')
    expect(dxf).toContain('LABELS')
    expect(dxf).toContain('TITLE_BLOCK')
    expect(dxf).toContain('METARDU_CRS=EPSG:21037')
    expect(dxf).toContain('CRS: EPSG:21037')

    // Verify entities
    expect(dxf).toContain('POINT') // Beacon point
    expect(dxf).toContain('B1')    // Beacon text
    expect(dxf).toContain('LINE')  // Boundary line
    expect(dxf).toContain('ROAD ACCESS') // Custom annotation
    expect(dxf).toContain('LR: LR 209/999') // Title block text
    expect(dxf).toContain('EOF')
  })
})
