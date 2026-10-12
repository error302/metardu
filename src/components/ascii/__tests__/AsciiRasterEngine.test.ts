import { describe, it, expect, beforeEach } from '@jest/globals'
import { AsciiRasterEngine } from '../AsciiRasterEngine'
import { AD_ASCII_RECIPE, CADASTRAL_CONTOUR_RECIPE } from '../types'

describe('AsciiRasterEngine - 21st.dev Canvas2D Pipeline', () => {
  let engine: AsciiRasterEngine

  beforeEach(() => {
    engine = new AsciiRasterEngine()
  })

  it('initializes engine successfully', () => {
    expect(engine).toBeInstanceOf(AsciiRasterEngine)
  })

  it('correctly calculates color adjustments (contrast, brightness, saturation, tint)', () => {
    // 1. Neutral (no adjustments)
    const neutral = engine.applyColorAdjustments(
      100, 150, 200,
      0, 100, 100, 0,
      { r: 60, g: 166, b: 255 }, 0, 'multiply'
    )
    expect(neutral.r).toBeCloseTo(100, 0)
    expect(neutral.g).toBeCloseTo(150, 0)
    expect(neutral.b).toBeCloseTo(200, 0)

    // 2. Brightness (+20)
    const brighter = engine.applyColorAdjustments(
      100, 150, 200,
      20, 100, 100, 0,
      { r: 60, g: 166, b: 255 }, 0, 'multiply'
    )
    expect(brighter.r).toBeGreaterThan(100)
    expect(brighter.g).toBeGreaterThan(150)
    expect(brighter.b).toBeGreaterThan(200)

    // 3. Grayscale (100%)
    const gray = engine.applyColorAdjustments(
      100, 150, 200,
      0, 100, 100, 100,
      { r: 60, g: 166, b: 255 }, 0, 'multiply'
    )
    // Red, green, blue should be equal
    expect(gray.r).toBeCloseTo(gray.g, 0)
    expect(gray.g).toBeCloseTo(gray.b, 0)
  })

  it('correctly handles tint blend with multiply and screen', () => {
    // Multiply blend with white tint
    const tinted = engine.applyColorAdjustments(
      120, 120, 120,
      0, 100, 100, 0,
      { r: 255, g: 255, b: 255 }, 100, 'multiply'
    )
    expect(tinted.r).toBe(120)

    // Screen blend
    const screened = engine.applyColorAdjustments(
      0, 0, 0,
      0, 100, 100, 0,
      { r: 100, g: 100, b: 100 }, 100, 'screen'
    )
    expect(screened.r).toBe(100)
  })

  it('verifies AD_ASCII_RECIPE configuration completeness', () => {
    expect(AD_ASCII_RECIPE.renderMode).toBe('stars')
    expect(AD_ASCII_RECIPE.cellSize).toBe(16)
    expect(AD_ASCII_RECIPE.contrast).toBe(115)
    expect(AD_ASCII_RECIPE.brightness).toBe(12)
    expect(AD_ASCII_RECIPE.pfx.scanLines.enabled).toBe(true)
    expect(AD_ASCII_RECIPE.pfx.bloom.enabled).toBe(true)
    expect(AD_ASCII_RECIPE.pfx.vignette.enabled).toBe(true)
    expect(AD_ASCII_RECIPE.pfx.filmGrain.enabled).toBe(true)
    expect(AD_ASCII_RECIPE.pfx.pixelate.enabled).toBe(true)
    expect(AD_ASCII_RECIPE.pfx.halftone.enabled).toBe(true)
    expect(AD_ASCII_RECIPE.gradientSource.mode).toBe('radial')
    expect(AD_ASCII_RECIPE.gradientSource.colors).toHaveLength(4)
  })

  it('verifies CADASTRAL_CONTOUR_RECIPE configuration for surveying', () => {
    expect(CADASTRAL_CONTOUR_RECIPE.renderMode).toBe('contour')
    expect(CADASTRAL_CONTOUR_RECIPE.animStyle).toBe('ripple')
    expect(CADASTRAL_CONTOUR_RECIPE.cellSize).toBe(18)
  })
})
