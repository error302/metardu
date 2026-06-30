/**
 * Features module test
 * Run: npx jest src/lib/__tests__/features.test.ts
 */

import { describe, it, expect } from '@jest/globals'
import { FEATURE } from '../features'

describe('FEATURE', () => {
  it('returns false when env var is not set', () => {
    delete process.env.NEXT_PUBLIC_FEATURE_TEST_FLAG
    expect(FEATURE('test_flag')).toBe(false)
  })

  it('returns true when env var is "on"', () => {
    process.env.NEXT_PUBLIC_FEATURE_TEST_FLAG = 'on'
    expect(FEATURE('test_flag')).toBe(true)
    delete process.env.NEXT_PUBLIC_FEATURE_TEST_FLAG
  })

  it('returns false when env var is "off"', () => {
    process.env.NEXT_PUBLIC_FEATURE_TEST_FLAG = 'off'
    expect(FEATURE('test_flag')).toBe(false)
    delete process.env.NEXT_PUBLIC_FEATURE_TEST_FLAG
  })
})
