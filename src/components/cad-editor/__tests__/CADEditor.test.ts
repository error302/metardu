import { describe, it, expect } from '@jest/globals'
describe('CADEditor types', () => {
  it('CADDocument interface is correctly typed', () => {
    const doc = { beacons: [{ id: 'b1', label: 'P1', x: 100, y: 200 }], boundaries: [], annotations: [], northArrow: { x: 900, y: 100, rotation: 0, type: 'grid' as const, bearing: '0°' }, scaleBar: { x: 80, y: 700, scaleMeters: 50 }, titleBlock: { projectName: 'Test', lrNumber: 'LR123', surveyor: 'John', regNo: 'ISK001', date: '2026-01-01', scale: '1:1000', sheet: '1 of 1' }, width: 1122, height: 794 }
    expect(doc.beacons).toHaveLength(1)
    expect(doc.beacons[0].label).toBe('P1')
  })
})
