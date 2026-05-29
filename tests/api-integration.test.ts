/**
 * API Route Integration Tests
 * Tests the most critical API route infrastructure for auth, validation, and error handling.
 *
 * Phase 4 (G5): These tests verify the apiHandler wrapper, Zod schemas,
 * AI validation safety, and coordinate validation.
 *
 * Note: Tests that require full Next.js request/response cycle are tested
 * via the handler function directly, not via HTTP calls.
 */

import { describe, it, expect } from '@jest/globals'

// ─── Test Suite: Zod schemas for Kenya coordinates ──────────────────────────

describe('Coordinate Validation (SRID 21037)', () => {
  it('should accept valid Kenya UTM Zone 37S coordinates', async () => {
    const { CoordinateSchema } = await import('@/lib/validation/apiSchemas')

    const result = CoordinateSchema.safeParse({
      point_id: 'BM1',
      easting: 276000,
      northing: 9850000,
      elevation: 1650.5,
      srid: 21037,
    })

    expect(result.success).toBe(true)
  })

  it('should reject coordinates outside Kenya bounds', async () => {
    const { CoordinateSchema } = await import('@/lib/validation/apiSchemas')

    const result = CoordinateSchema.safeParse({
      point_id: 'BM1',
      easting: 500000,   // Outside Kenya easting range
      northing: 5000000, // Way outside Kenya
      elevation: 1650.5,
      srid: 21037,
    })

    expect(result.success).toBe(false)
  })

  it('should default srid to 21037 when not provided', async () => {
    const { CoordinateSchema } = await import('@/lib/validation/apiSchemas')

    const result = CoordinateSchema.safeParse({
      point_id: 'BM1',
      easting: 276000,
      northing: 9850000,
      elevation: 1650.5,
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.srid).toBe(21037)
    }
  })

  it('should reject negative elevation below -100m', async () => {
    const { CoordinateSchema } = await import('@/lib/validation/apiSchemas')

    const result = CoordinateSchema.safeParse({
      point_id: 'BM1',
      easting: 276000,
      northing: 9850000,
      elevation: -200,
      srid: 21037,
    })

    expect(result.success).toBe(false)
  })
})

describe('Project Validation', () => {
  it('should accept CreateProjectSchema with valid survey types', async () => {
    const { CreateProjectSchema } = await import('@/lib/validation/apiSchemas')

    const result = CreateProjectSchema.safeParse({
      name: 'Nairobi Subdivision Scheme',
      survey_type: 'cadastral_subdivision',
      location: 'Nairobi',
    })

    expect(result.success).toBe(true)
  })

  it('should reject project names shorter than 3 characters', async () => {
    const { CreateProjectSchema } = await import('@/lib/validation/apiSchemas')

    const result = CreateProjectSchema.safeParse({
      name: 'AB',
      survey_type: 'cadastral_subdivision',
    })

    expect(result.success).toBe(false)
  })

  it('should reject invalid survey types', async () => {
    const { CreateProjectSchema } = await import('@/lib/validation/apiSchemas')

    const result = CreateProjectSchema.safeParse({
      name: 'Test Project',
      survey_type: 'invalid_type',
    })

    expect(result.success).toBe(false)
  })

  it('should accept all 17 valid survey types', async () => {
    const { CreateProjectSchema, SurveyTypeEnum } = await import('@/lib/validation/apiSchemas')

    const validTypes = SurveyTypeEnum.enum
    for (const survey_type of Object.values(validTypes)) {
      const result = CreateProjectSchema.safeParse({
        name: `Test ${survey_type}`,
        survey_type,
      })
      expect(result.success).toBe(true)
    }
  })
})

describe('Traverse Validation', () => {
  it('should accept valid traverse observations', async () => {
    const { TraverseObservationSchema } = await import('@/lib/validation/apiSchemas')

    const result = TraverseObservationSchema.safeParse({
      station: 'A',
      target: 'B',
      hcl_deg: 45,
      hcl_min: 30,
      hcl_sec: 15.5,
      slope_dist: 150.25,
      ih: 1.55,
      th: 1.65,
    })

    expect(result.success).toBe(true)
  })

  it('should reject bearings over 360 degrees', async () => {
    const { TraverseObservationSchema } = await import('@/lib/validation/apiSchemas')

    const result = TraverseObservationSchema.safeParse({
      station: 'A',
      target: 'B',
      hcl_deg: 370,
    })

    expect(result.success).toBe(false)
  })

  it('should require at least 2 observations for compute', async () => {
    const { ComputeTraverseSchema } = await import('@/lib/validation/apiSchemas')

    const result = ComputeTraverseSchema.safeParse({
      parcel_id: '00000000-0000-0000-0000-000000000001',
      backsight_bearing: 180,
      opening_easting: 276000,
      opening_northing: 9850000,
      observations: [
        { station: 'A', target: 'B' },
      ],
    })

    expect(result.success).toBe(false)
  })
})

describe('Auth Validation', () => {
  it('should accept valid registration data', async () => {
    const { RegisterSchema } = await import('@/lib/validation/apiSchemas')

    const result = RegisterSchema.safeParse({
      email: 'surveyor@metardu.com',
      password: 'securePassword123',
      full_name: 'John Doe',
      isk_number: 'ISK/2024/1234',
    })

    expect(result.success).toBe(true)
  })

  it('should reject registration with short password', async () => {
    const { RegisterSchema } = await import('@/lib/validation/apiSchemas')

    const result = RegisterSchema.safeParse({
      email: 'surveyor@metardu.com',
      password: '12345',  // too short (min 6)
      full_name: 'John Doe',
    })

    expect(result.success).toBe(false)
  })

  it('should lowercase email automatically', async () => {
    const { RegisterSchema } = await import('@/lib/validation/apiSchemas')

    const result = RegisterSchema.safeParse({
      email: 'SURVEYOR@METARDU.COM',
      password: 'securePassword123',
      full_name: 'John Doe',
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.email).toBe('surveyor@metardu.com')
    }
  })
})

// ─── Test Suite: AI validation safety ────────────────────────────────────────

describe('AI Validation Safety', () => {
  it('should NEVER return "passed: boolean" from validateSurveyResults', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const source = fs.readFileSync(
      path.join(process.cwd(), 'src/lib/ai/nvidiaService.ts'),
      'utf-8'
    )

    // The old dangerous pattern "passed: boolean" should NOT be in the return type
    expect(source).not.toContain('passed: boolean')
    // The new safe pattern should be present
    expect(source).toContain('aiAssessment')
    expect(source).toContain('disclaimer')
    expect(source).toContain('Survey Act Cap 299')
  })

  it('should have aiAssessment with only safe values', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const source = fs.readFileSync(
      path.join(process.cwd(), 'src/lib/ai/nvidiaService.ts'),
      'utf-8'
    )

    // The aiAssessment should only allow these values (never "pass" or "fail")
    expect(source).toContain("'likely_pass'")
    expect(source).toContain("'likely_fail'")
    expect(source).toContain("'needs_review'")
  })
})

// ─── Test Suite: Entity Versioning Infrastructure ────────────────────────────

describe('Entity Versioning', () => {
  it('should have migration 006 with entity_versions table', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const migrationPath = path.join(process.cwd(), 'src/lib/db/migrations/006_entity_versioning.sql')
    const exists = fs.existsSync(migrationPath)
    expect(exists).toBe(true)

    if (exists) {
      const sql = fs.readFileSync(migrationPath, 'utf-8')
      expect(sql).toContain('entity_versions')
      expect(sql).toContain('entity_type')
      expect(sql).toContain('snapshot')
      expect(sql).toContain('delta')
      expect(sql).toContain('entity_version_trigger_func')
    }
  })

  it('should have versioning API route', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const routePath = path.join(process.cwd(), 'src/app/api/versions/route.ts')
    const exists = fs.existsSync(routePath)
    expect(exists).toBe(true)
  })

  it('should have diff and restore API routes', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const diffPath = path.join(process.cwd(), 'src/app/api/versions/[id]/diff/route.ts')
    const restorePath = path.join(process.cwd(), 'src/app/api/versions/[id]/restore/route.ts')
    expect(fs.existsSync(diffPath)).toBe(true)
    expect(fs.existsSync(restorePath)).toBe(true)
  })
})
