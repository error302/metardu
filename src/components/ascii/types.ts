/**
 * Types and Preset Definitions for the 21st.dev ASCII Canvas2D Engine
 * Recreates the exact parameter schema from 21st.dev community recipes (including "ad")
 */

export type RenderMode =
  | 'stars'
  | 'characters'
  | 'dither'
  | 'mosaic'
  | 'pixel'
  | 'dots'
  | 'cross'
  | 'diamond'
  | 'voxel'
  | 'lego'
  | 'mixed'
  | 'lines'
  | 'diagonal'
  | 'braille'
  | 'disco'
  | 'hexdump'
  | 'matrix'
  | 'rings'
  | 'hearts'
  | 'hexagons'
  | 'triangles'
  | 'bubbles'
  | 'hatch'
  | 'contour'
  | 'halfblocks'

export type AnimStyle = 'wave' | 'pulse' | 'shimmer' | 'ripple' | 'flicker'

export type OverlayBlend = 'multiply' | 'screen' | 'overlay' | 'soft-light' | 'hard-light' | 'color-dodge' | 'source-over'

export interface GradientColorStop {
  id: string
  name: string
  hex: string
  pos: number // 0 to 100
}

export interface GradientSourceConfig {
  mode: 'radial' | 'linear' | 'conic'
  colors: GradientColorStop[]
  angle: number
  centerX: number // 0 to 100
  centerY: number // 0 to 100
  scale: number
  softness: number
  wave: number
  distortion: number
  grain: number
  vignette: number
  count?: number
  fade?: number
  envelope?: string
  spread?: number
  soften?: number
  pixelCols?: number
  pixelRows?: number
  pixelAngle?: number
  pixelDither?: number
  pixelGap?: number
  archBase?: number
  archHeight?: number
  archWidth?: number
  archGlow?: number
  archEdge?: number
  animated: boolean
  speed: number
  motionAmount: number
  motionReverse?: boolean
  seed?: number
  backdrop: string
}

export interface PfxEntry {
  enabled: boolean
  intensity: number // 0 to 100
}

export interface PfxConfig {
  vignette: PfxEntry
  scanLines: PfxEntry
  chromatic: PfxEntry
  bloom: PfxEntry
  filmGrain: PfxEntry
  glitch: PfxEntry
  pixelate: PfxEntry
  halftone: PfxEntry
  filmDust: PfxEntry
}

export interface LightPoint {
  x: number // 0 to 1
  y: number // 0 to 1
  radius: number
  intensity: number
  color?: string
}

export interface LightsConfig {
  enabled: boolean
  points: LightPoint[]
}

export interface MaskConfig {
  enabled: boolean
  tool: string
  brushSize: number
  showOverlay: boolean
  invert: boolean
  dataUrl: string | null
  shapes: any[]
}

export interface ToneCurvePoint {
  x: number
  y: number
}

export interface AsciiRecipeConfig {
  renderMode: RenderMode
  bgMode: 'solid' | 'source' | 'blurred' | 'none'
  bgBlur: number
  bgOpacity: number // 0 to 100
  cellSize: number
  coverage: number // 0 to 100
  invert: boolean
  styleBlend: string
  charSet: string
  customChars: string
  brightness: number // -100 to 100
  contrast: number // e.g. 100 is normal, 115 is boosted
  edgeEmphasis: number // 0 to 100
  density: number // -100 to 100
  toneCurve: ToneCurvePoint[]
  tint: string
  tintOpacity: number // 0 to 100
  overlayBlend: OverlayBlend
  saturation: number // 0 to 200
  grayscale: number // 0 to 100
  blurType: 'off' | 'gaussian' | 'lens' | 'tilt' | 'progressive'
  blurAmount: number
  blurAngle?: number
  directionalBothSides?: boolean
  tiltFocus?: number
  tiltPosition?: number
  tiltFeather?: number
  lensFocus?: number
  blurCenterX?: number
  blurCenterY?: number
  progressivePosition?: number
  progressiveReverse?: boolean
  pfx: PfxConfig
  animated: boolean
  animStyle: AnimStyle
  animSpeed: {
    enabled: boolean
    intensity: number
  }
  animIntensity: {
    enabled: boolean
    intensity: number
  }
  lights: LightsConfig
  mask: MaskConfig
  gradientSource: GradientSourceConfig
}

/**
 * 21st.dev Exact "ad" ASCII Recipe
 */
export const AD_ASCII_RECIPE: AsciiRecipeConfig = {
  renderMode: 'stars',
  bgMode: 'solid',
  bgBlur: 12,
  bgOpacity: 90,
  cellSize: 16,
  coverage: 100,
  invert: false,
  styleBlend: 'source-over',
  charSet: 'standard',
  customChars: '',
  brightness: 12,
  contrast: 115,
  edgeEmphasis: 0,
  density: 0,
  toneCurve: [
    { x: 0, y: 0 },
    { x: 1, y: 1 },
  ],
  tint: '#D17B47',
  tintOpacity: 0,
  overlayBlend: 'multiply',
  saturation: 100,
  grayscale: 0,
  blurType: 'off',
  blurAmount: 35,
  blurAngle: 0,
  directionalBothSides: false,
  tiltFocus: 35,
  tiltPosition: 50,
  tiltFeather: 15,
  lensFocus: 40,
  blurCenterX: 50,
  blurCenterY: 50,
  progressivePosition: 55,
  progressiveReverse: false,
  pfx: {
    vignette: { enabled: true, intensity: 38 },
    scanLines: { enabled: true, intensity: 40 },
    chromatic: { enabled: false, intensity: 15 },
    bloom: { enabled: true, intensity: 25 },
    filmGrain: { enabled: true, intensity: 30 },
    glitch: { enabled: false, intensity: 20 },
    pixelate: { enabled: true, intensity: 15 },
    halftone: { enabled: true, intensity: 20 },
    filmDust: { enabled: false, intensity: 20 },
  },
  animated: true,
  animStyle: 'wave',
  animSpeed: { enabled: true, intensity: 100 },
  animIntensity: { enabled: true, intensity: 60 },
  lights: {
    enabled: false,
    points: [],
  },
  mask: {
    enabled: false,
    tool: 'freehand',
    brushSize: 30,
    showOverlay: false,
    invert: false,
    dataUrl: null,
    shapes: [],
  },
  gradientSource: {
    mode: 'radial',
    colors: [
      { id: 'metardu-warm-light', name: 'Survey Sand', hex: '#E5B89B', pos: 0 },
      { id: 'metardu-sienna', name: 'METARDU Sienna', hex: '#D17B47', pos: 33 },
      { id: 'metardu-bronze', name: 'Survey Bronze', hex: '#8F4928', pos: 67 },
      { id: 'metardu-night', name: 'Charcoal', hex: '#050505', pos: 100 },
    ],
    angle: 90,
    centerX: 46,
    centerY: 52,
    scale: 88,
    softness: 26,
    wave: 12,
    distortion: 28,
    grain: 0,
    vignette: 0,
    count: 6,
    fade: 40,
    envelope: 'ramp',
    spread: -20,
    soften: 0,
    pixelCols: 16,
    pixelRows: 10,
    pixelAngle: 45,
    pixelDither: 50,
    pixelGap: 0,
    archBase: 70,
    archHeight: 50,
    archWidth: 100,
    archGlow: 55,
    archEdge: 30,
    animated: true,
    speed: 50,
    motionAmount: 86,
    motionReverse: false,
    seed: 1,
    backdrop: '#050505',
  },
}

/**
 * Topographic Iso-Contour Preset (21st.dev Style for Surveying & GIS)
 */
export const CADASTRAL_CONTOUR_RECIPE: AsciiRecipeConfig = {
  ...AD_ASCII_RECIPE,
  renderMode: 'contour',
  cellSize: 18,
  contrast: 130,
  brightness: 18,
  animStyle: 'ripple',
  pfx: {
    ...AD_ASCII_RECIPE.pfx,
    bloom: { enabled: true, intensity: 35 },
    scanLines: { enabled: true, intensity: 20 },
    vignette: { enabled: true, intensity: 45 },
  },
  gradientSource: {
    ...AD_ASCII_RECIPE.gradientSource,
    colors: [
      { id: 'c_gold', name: 'Arc Amber', hex: '#FFB800', pos: 0 },
      { id: 'c_bronze', name: 'Survey Bronze', hex: '#D17B47', pos: 35 },
      { id: 'c_deep', name: 'Obsidian Teal', hex: '#002B36', pos: 70 },
      { id: 'c_night', name: 'Void', hex: '#020B14', pos: 100 },
    ],
    speed: 40,
    motionAmount: 60,
  },
}

/**
 * Geodetic Matrix Rain Preset (21st.dev Matrix Style)
 */
export const GEODETIC_MATRIX_RECIPE: AsciiRecipeConfig = {
  ...AD_ASCII_RECIPE,
  renderMode: 'matrix',
  cellSize: 14,
  contrast: 125,
  brightness: 20,
  animStyle: 'pulse',
  pfx: {
    ...AD_ASCII_RECIPE.pfx,
    bloom: { enabled: true, intensity: 45 },
    scanLines: { enabled: true, intensity: 50 },
    filmGrain: { enabled: true, intensity: 25 },
    chromatic: { enabled: true, intensity: 20 },
  },
  gradientSource: {
    ...AD_ASCII_RECIPE.gradientSource,
    colors: [
      { id: 'm_cyan', name: 'Phosphor Cyan', hex: '#38BDF8', pos: 0 },
      { id: 'm_teal', name: 'Emerald Fix', hex: '#10B981', pos: 40 },
      { id: 'm_abyss', name: 'Deep Basin', hex: '#042F2E', pos: 75 },
      { id: 'm_black', name: 'Terminal Void', hex: '#020617', pos: 100 },
    ],
    speed: 60,
  },
}

/**
 * Surveyor Theodolite Crosshairs Preset (21st.dev Cross Mode)
 */
export const SURVEYOR_CROSS_RECIPE: AsciiRecipeConfig = {
  ...AD_ASCII_RECIPE,
  renderMode: 'cross',
  cellSize: 20,
  contrast: 140,
  brightness: 15,
  animStyle: 'shimmer',
  pfx: {
    ...AD_ASCII_RECIPE.pfx,
    bloom: { enabled: true, intensity: 30 },
    scanLines: { enabled: true, intensity: 30 },
    vignette: { enabled: true, intensity: 50 },
  },
  gradientSource: {
    ...AD_ASCII_RECIPE.gradientSource,
    colors: [
      { id: 's_amber', name: 'Cadastral Gold', hex: '#F59E0B', pos: 0 },
      { id: 's_ruby', name: 'Laser Plum', hex: '#E11D48', pos: 45 },
      { id: 's_night', name: 'Night Vault', hex: '#0F172A', pos: 80 },
      { id: 's_space', name: 'Void', hex: '#020617', pos: 100 },
    ],
    speed: 45,
  },
}

/**
 * Digital Elevation Voxel Preset (21st.dev Voxel Mode)
 */
export const ELEVATION_VOXEL_RECIPE: AsciiRecipeConfig = {
  ...AD_ASCII_RECIPE,
  renderMode: 'voxel',
  cellSize: 22,
  contrast: 120,
  brightness: 10,
  animStyle: 'wave',
  pfx: {
    ...AD_ASCII_RECIPE.pfx,
    bloom: { enabled: true, intensity: 20 },
    pixelate: { enabled: true, intensity: 10 },
    vignette: { enabled: true, intensity: 40 },
  },
}
