import { 
  getBeaconSymbol, 
  getBeaconSymbolSVG, 
  getBeaconLabel, 
  getBeaconColor,
  BEACON_DEFINITIONS 
} from '../src/lib/compute/beaconSymbols'
import type { BeaconType, BeaconStatus } from '../src/types/deedPlan'

const ALL_BEACON_TYPES: BeaconType[] = [
  'PSC', 'PSC_FLUSH', 'SSC', 'TSC',
  'MASONRY_NAIL', 'IRON_PIN', 'WOODEN_PEG', 'CONCRETE_BEACON', 'INDICATORY', 'RIVET',
  'BM', 'TBM', 'FLUSH_BRACKET',
  'ROAD_NAIL', 'SPIKE',
  'NATURAL_FEATURE', 'FENCE_POST', 'WALL_CORNER'
]

const ALL_STATUSES: BeaconStatus[] = ['FOUND', 'SET', 'REFERENCED', 'DESTROYED', 'NOT_FOUND']

describe('beaconSymbols', () => {
  describe('BEACON_DEFINITIONS', () => {
    it('should have entries for all 18 beacon types', () => {
      expect(Object.keys(BEACON_DEFINITIONS).length).toBe(18)
    })

    it('should have all required fields for each definition', () => {
      ALL_BEACON_TYPES.forEach(type => {
        const def = BEACON_DEFINITIONS[type]
        expect(def).toBeDefined()
        expect(def.shortCode).toBeDefined()
        expect(def.fullName).toBeDefined()
        expect(def.regulation).toBeDefined()
        expect(def.isPermanent).toBeDefined()
        expect(def.isControlMark).toBeDefined()
        expect(def.defaultOrder).toBeDefined()
        expect(def.description).toBeDefined()
      })
    })
  })

  describe('getBeaconSymbol', () => {
    it('should return valid SVG string for all 18 types × 5 statuses = 90 combinations', () => {
      ALL_BEACON_TYPES.forEach(type => {
        ALL_STATUSES.forEach(status => {
          const result = getBeaconSymbol(type, status, 8)
          expect(result).toBeDefined()
          expect(typeof result).toBe('string')
          expect(result.length).toBeGreaterThan(0)
        })
      })
    })

    it('should include <title> element in all symbols', () => {
      ALL_BEACON_TYPES.forEach(type => {
        const result = getBeaconSymbol(type, 'FOUND')
        expect(result).toContain('<title>')
        expect(result).toContain('</title>')
      })
    })

    it('should include <desc> element in all symbols', () => {
      ALL_BEACON_TYPES.forEach(type => {
        const result = getBeaconSymbol(type, 'FOUND')
        expect(result).toContain('<desc>')
        expect(result).toContain('</desc>')
      })
    })

    it('should include red diagonal cross for DESTROYED status', () => {
      ALL_BEACON_TYPES.forEach(type => {
        const result = getBeaconSymbol(type, 'DESTROYED')
        expect(result).toContain('#dc2626')
      })
    })

    it('should include stroke-dasharray for NOT_FOUND status', () => {
      ALL_BEACON_TYPES.forEach(type => {
        const result = getBeaconSymbol(type, 'NOT_FOUND')
        expect(result).toContain('stroke-dasharray')
      })
    })

    it('should not throw for any combination', () => {
      expect(() => {
        ALL_BEACON_TYPES.forEach(type => {
          ALL_STATUSES.forEach(status => {
            getBeaconSymbol(type, status)
          })
        })
      }).not.toThrow()
    })

    it('should not return empty string', () => {
      ALL_BEACON_TYPES.forEach(type => {
        ALL_STATUSES.forEach(status => {
          const result = getBeaconSymbol(type, status)
          expect(result.trim().length).toBeGreaterThan(0)
        })
      })
    })
  })

  describe('getBeaconColor', () => {
    it('should return red (#dc2626) for DESTROYED status', () => {
      const result = getBeaconSymbol('PSC', 'DESTROYED')
      expect(result).toContain('#dc2626')
    })

    it('should return grey (#9ca3af) for NOT_FOUND status', () => {
      const result = getBeaconSymbol('PSC', 'NOT_FOUND')
      expect(result).toContain('#9ca3af')
    })

    it('should return blue (#1d4ed8) for control marks', () => {
      expect(getBeaconColor('PSC')).toBe('#1d4ed8')
      expect(getBeaconColor('SSC')).toBe('#1d4ed8')
      expect(getBeaconColor('TSC')).toBe('#1d4ed8')
    })

    it('should return green (#059669) for level marks', () => {
      expect(getBeaconColor('BM')).toBe('#059669')
      expect(getBeaconColor('TBM')).toBe('#059669')
    })

    it('should return black (#000000) for boundary marks', () => {
      expect(getBeaconColor('MASONRY_NAIL')).toBe('#000000')
      expect(getBeaconColor('IRON_PIN')).toBe('#000000')
      expect(getBeaconColor('CONCRETE_BEACON')).toBe('#000000')
    })
  })

  describe('getBeaconLabel', () => {
    it('should return short code for each beacon type', () => {
      expect(getBeaconLabel('PSC')).toBe('PSC')
      expect(getBeaconLabel('BM')).toBe('BM')
      expect(getBeaconLabel('MASONRY_NAIL')).toBe('MN')
      expect(getBeaconLabel('IRON_PIN')).toBe('IP')
      expect(getBeaconLabel('WOODEN_PEG')).toBe('WP')
    })
  })

  describe('getBeaconSymbolSVG', () => {
    it('should wrap symbol in <g> tags', () => {
      const result = getBeaconSymbolSVG('PSC', 'FOUND')
      expect(result.startsWith('<g>')).toBe(true)
      expect(result.endsWith('</g>')).toBe(true)
    })
  })
})
