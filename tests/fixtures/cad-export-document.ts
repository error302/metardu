import type { CADDocument } from '@/components/cad-editor/CADEditor'

export function exportDrawing(patch: Partial<CADDocument> = {}): CADDocument {
  return {
    width: 1122, height: 794, metersPerPixel: 0.5, originEasting: 500000, originNorthing: -347, coordinateReferenceSystem: 'EPSG:32636',
    beacons: [{ id: 'a', label: 'CP-01', x: 100, y: 100, easting: 500050, northing: 0 }, { id: 'b', label: 'CP-02', x: 300, y: 100, easting: 500150, northing: 0 }],
    boundaries: [{ id: 'ab', fromId: 'a', toId: 'b', bearing: '0°00\'00"', bearingDeg: 0, distance: '10.000', distanceM: 10, type: 'standard' }],
    annotations: [{ id: 'text', type: 'text', x: 200, y: 90, text: 'DRAINAGE PLAN — SYNTHETIC' }, { id: 'line', type: 'line', x: 100, y: 200, x2: 200, y2: 200 }],
    northArrow: { x: 1012, y: 90, rotation: 0, type: 'grid', bearing: '0' }, scaleBar: { x: 70, y: 744, scaleMeters: 50 },
    titleBlock: { projectName: 'Synthetic export QA', lrNumber: '', surveyor: '', regNo: '', date: '2026-10-09', scale: 'Draft — verify print scale', sheet: '1 of 1' },
    ...patch,
  }
}
