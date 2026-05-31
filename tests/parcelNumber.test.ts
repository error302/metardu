import { 
  parseParcelNumber, 
  validateParcelNumber, 
  formatParcelNumber, 
  generateParcelReference,
  lookupRegistrationSection,
  getUTMZoneForParcel 
} from '../src/lib/compute/parcelNumber'

describe('parcelNumber', () => {
  describe('parseParcelNumber', () => {
    it('should parse BLOCK format correctly', () => {
      const result = parseParcelNumber('NAIROBI BLOCK 2/1234')
      expect(result.format).toBe('BLOCK')
      expect(result.registrationSection).toBeDefined()
      expect(result.block).toBe(2)
      expect(result.parcelNumber).toBe(1234)
      expect(result.isValid).toBe(true)
    })

    it('should parse SECTION format correctly', () => {
      const result = parseParcelNumber('KIAMBU/456')
      expect(result.format).toBe('SECTION')
      expect(result.registrationSection).toBeDefined()
      expect(result.parcelNumber).toBe(456)
      expect(result.isValid).toBe(true)
    })

    it('should parse LR format correctly', () => {
      const result = parseParcelNumber('L.R. No. 1234/56')
      expect(result.format).toBe('LR')
      expect(result.parcelNumber).toBe(1234)
      expect(result.suffix).toBe('56')
      expect(result.isValid).toBe(true)
    })

    it('should return invalid for empty input', () => {
      const result = parseParcelNumber('')
      expect(result.isValid).toBe(false)
      expect(result.validationErrors.length).toBeGreaterThan(0)
    })

    it('should return invalid for invalid format', () => {
      const result = parseParcelNumber('INVALID$$$$')
      expect(result.isValid).toBe(false)
      expect(result.validationErrors.length).toBeGreaterThan(0)
    })

    it('should parse section code format', () => {
      const result = parseParcelNumber('KBU/789')
      expect(result.format).toBe('BLOCK')
      expect(result.parcelNumber).toBe(789)
      expect(result.isValid).toBe(true)
    })
  })

  describe('validateParcelNumber', () => {
    it('should return valid for correct format', () => {
      const result = validateParcelNumber('NAIROBI BLOCK 2/1234')
      expect(result.isValid).toBe(true)
      expect(result.errors.length).toBe(0)
    })

    it('should return invalid for invalid format', () => {
      const result = validateParcelNumber('INVALID$$$$')
      expect(result.isValid).toBe(false)
      expect(result.errors.length).toBeGreaterThan(0)
    })
  })

  describe('getUTMZoneForParcel', () => {
    it('should return zone 37S for Nairobi', () => {
      const result = getUTMZoneForParcel('NRBN')
      expect(result.zone).toBe(37)
      expect(result.hemisphere).toBe('S')
    })

    it('should return zone 36N for Kisumu', () => {
      const result = getUTMZoneForParcel('KSM')
      expect(result.zone).toBe(36)
      expect(result.hemisphere).toBe('N')
    })

    it('should return zone 36N for Eldoret', () => {
      const result = getUTMZoneForParcel('ELD')
      expect(result.zone).toBe(36)
      expect(result.hemisphere).toBe('N')
    })

    it('should default to Nairobi for unknown section', () => {
      const result = getUTMZoneForParcel('UNKNOWN')
      expect(result.zone).toBe(37)
      expect(result.hemisphere).toBe('S')
    })
  })

  describe('formatParcelNumber', () => {
    it('should format with block correctly', () => {
      const result = formatParcelNumber('NAIROBI', 2, 1234)
      expect(result).toBe('NAIROBI BLOCK 2/1234')
    })

    it('should format without block correctly', () => {
      const result = formatParcelNumber('KIAMBU', null, 456)
      expect(result).toBe('KIAMBU/456')
    })

    it('should format with suffix correctly', () => {
      const result = formatParcelNumber('MOMBASA', 1, 789, '1')
      expect(result).toBe('MOMBASA BLOCK 1/789/1')
    })
  })

  describe('lookupRegistrationSection', () => {
    it('should find Nairobi section (case insensitive)', () => {
      const result = lookupRegistrationSection('nbi')
      expect(result).not.toBeNull()
    })

    it('should find Westlands as Nairobi section', () => {
      const result = lookupRegistrationSection('WESTLANDS')
      expect(result).not.toBeNull()
    })

    it('should return null for unknown section', () => {
      const result = lookupRegistrationSection('xxxxxx')
      expect(result).toBeNull()
    })
  })

  describe('generateParcelReference', () => {
    it('should generate reference with block', () => {
      const result = generateParcelReference('NBI', 'NRBN', 1234, 2)
      expect(result).toContain('1234')
    })

    it('should generate reference without block', () => {
      const result = generateParcelReference('KBU', 'KBU', 456)
      expect(result).toBeDefined()
    })
  })
})
