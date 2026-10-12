import { endAreaVolume, prismoidalVolume, surfaceCutFillVolumeGrid } from '@/lib/engine/volume'
import { approxEqual } from '@/test-utils/approx'

describe('Volume Numerical Evidence & Audit Verification', () => {
  describe('Prismoidal Formula — Even Section Count & Interval Handling (Basak Ch. 8)', () => {
    it('computes 4 sections (3 intervals) by combining prismoid pair and final end-area interval', () => {
      const sections = [
        { chainage: 0, area: 20.0 },
        { chainage: 50, area: 30.0 },
        { chainage: 100, area: 25.0 },
        { chainage: 150, area: 15.0 },
      ]

      const pm = prismoidalVolume(sections)

      // Interval 0 to 100 (L=100): V1 = (100 / 6) * (20 + 4*30 + 25) = (100 / 6) * 165 = 2750.0 m³
      // Interval 100 to 150 (L=50): V2 = (50 / 2) * (25 + 15) = 25 * 40 = 1000.0 m³
      // Expected total: 2750 + 1000 = 3750.0 m³
      // (Prior bug dropped interval 100-150 and returned 2750.0 m³)
      expect(approxEqual(pm.totalVolume, 3750.0, 1e-4)).toBe(true)
      expect(pm.segments).toHaveLength(2)
      expect(pm.segments[0].from).toBe(0)
      expect(pm.segments[0].to).toBe(100)
      expect(approxEqual(pm.segments[0].volume, 2750.0, 1e-4)).toBe(true)
      expect(pm.segments[1].from).toBe(100)
      expect(pm.segments[1].to).toBe(150)
      expect(approxEqual(pm.segments[1].volume, 1000.0, 1e-4)).toBe(true)
    })

    it('computes 2 sections (1 interval) by falling back to end-area instead of returning 0', () => {
      const sections = [
        { chainage: 0, area: 20.0 },
        { chainage: 50, area: 30.0 },
      ]

      const pm = prismoidalVolume(sections)

      // Interval 0 to 50: V = (50 / 2) * (20 + 30) = 1250.0 m³
      // (Prior bug returned totalVolume = 0 and segments = [])
      expect(approxEqual(pm.totalVolume, 1250.0, 1e-4)).toBe(true)
      expect(pm.segments).toHaveLength(1)
      expect(pm.segments[0].from).toBe(0)
      expect(pm.segments[0].to).toBe(50)
      expect(approxEqual(pm.segments[0].volume, 1250.0, 1e-4)).toBe(true)
    })

    it('computes 3 sections (2 intervals) purely prismoidally', () => {
      const sections = [
        { chainage: 0, area: 10.0 },
        { chainage: 50, area: 20.0 },
        { chainage: 100, area: 10.0 },
      ]

      const pm = prismoidalVolume(sections)

      // V = (100 / 6) * (10 + 4*20 + 10) = 1666.6667 m³
      expect(approxEqual(pm.totalVolume, 1666.6667, 1e-3)).toBe(true)
      expect(pm.segments).toHaveLength(1)
      expect(pm.segments[0].from).toBe(0)
      expect(pm.segments[0].to).toBe(100)
    })

    it('returns zero for fewer than 2 sections', () => {
      expect(prismoidalVolume([]).totalVolume).toBe(0)
      expect(prismoidalVolume([{ chainage: 0, area: 10 }]).totalVolume).toBe(0)
    })
  })

  describe('IDW Surface Cut/Fill Cutoff & Extrapolation Suppression', () => {
    it('skips grid cells lacking interpolation support within maxDistance instead of fabricating nearest elevations', () => {
      // Existing surface: points clustered tightly at (0, 0), (5, 0), (0, 5), (5, 5) with elevation 10
      // Design surface: points spread across (0, 0) to (50, 50) with elevation 5
      // With gridSpacing = 5, maxDistance = 7:
      // Grid cells around (40, 40) have NO existing points within 7m.
      // Previously, idwZ returned nearest point elevation (10) for ALL cells infinitely far away,
      // evaluating every cell and missing 0 cells!
      const existing = [
        { easting: 0, northing: 0, elevation: 10 },
        { easting: 5, northing: 0, elevation: 10 },
        { easting: 0, northing: 5, elevation: 10 },
        { easting: 5, northing: 5, elevation: 10 },
      ]

      const design = [
        { easting: 0, northing: 0, elevation: 5 },
        { easting: 50, northing: 0, elevation: 5 },
        { easting: 0, northing: 50, elevation: 5 },
        { easting: 50, northing: 50, elevation: 5 },
      ]

      const res = surfaceCutFillVolumeGrid({
        existing,
        design,
        gridSpacing: 5,
        maxDistance: 7,
      })

      // Must have skipped distant cells and generated a warning
      expect(res.warnings.length).toBeGreaterThan(0)
      expect(res.warnings[0]).toMatch(/Skipped \d+ grid cell\(s\) due to missing interpolation support\./)
      // Evaluated cell count must be much less than full 50x50 grid (which would be ~100+ cells)
      expect(res.cellCount).toBeLessThan(30)
      expect(res.cutVolume).toBeGreaterThan(0)
    })
  })
})
