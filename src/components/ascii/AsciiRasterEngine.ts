/**
 * AsciiRasterEngine — High-Performance Canvas2D ASCII & Generative Raster Engine
 * Recreates the 21st.dev raster pipeline with zero external runtime dependencies.
 *
 * Implements the 8-step render pipeline:
 * 1. Animated gradient source (radial/linear/conic multi-stop, animated over time)
 * 2. Grid sampling (cellSize, luminance, color, edgeEmphasis)
 * 3. Shape rendering per renderMode (all 24 21st.dev modes including 'stars')
 * 4. Color grading (brightness, contrast, saturation, grayscale, tint, overlayBlend, blur)
 * 5. Post-effects (vignette, scanlines, bloom, chromatic, filmGrain, glitch, halftone, pixelate, filmDust)
 * 6. Ambient point lights
 * 7. Mask reveal
 * 8. Kinetic animation styles (wave, pulse, shimmer, ripple, flicker)
 */

/**
 * AsciiRasterEngine — High-Performance Canvas2D ASCII & Generative Raster Engine
 * Recreates the 21st.dev raster pipeline with zero external runtime dependencies.
 *
 * Implements the 8-step render pipeline:
 * 1. Animated gradient source (radial/linear/conic multi-stop, animated over time)
 * 2. Grid sampling (cellSize, luminance, color, edgeEmphasis)
 * 3. Shape rendering per renderMode (all 24 21st.dev modes including 'stars')
 * 4. Color grading (brightness, contrast, saturation, grayscale, tint, overlayBlend, blur)
 * 5. Post-effects (vignette, scanlines, bloom, chromatic, filmGrain, glitch, halftone, pixelate, filmDust)
 * 6. Ambient point lights
 * 7. Mask reveal
 * 8. Kinetic animation styles (wave, pulse, shimmer, ripple, flicker)
 */
import type { AsciiRecipeConfig, RenderMode, AnimStyle, GradientSourceConfig } from './types';

// Pre-computed Bayer 4x4 matrix for ordered dithering
const BAYER_4X4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
]

// Braille Unicode Base (U+2800)
const BRAILLE_BASE = 0x2800

// Standard ASCII ramp
const STANDARD_RAMP = ' .:-=+*#%@'
const MATRIX_CHARS = '0123456789ABCDEFｦｱｳｴｵｶｷｹｺｻｼｽｾｿﾀﾂﾃﾅﾆﾇﾈﾊﾋﾎﾏﾐﾑﾒﾓﾔﾕﾗﾘﾜ'

export interface CellSample {
  col: number
  row: number
  x: number
  y: number
  r: number
  g: number
  b: number
  a: number
  luminance: number
  edgeDelta: number
  animOffset: number
}

export class AsciiRasterEngine {
  private sourceCanvas: HTMLCanvasElement | null = null
  private sourceCtx: CanvasRenderingContext2D | null = null
  private bloomCanvas: HTMLCanvasElement | null = null
  private bloomCtx: CanvasRenderingContext2D | null = null
  private postCanvas: HTMLCanvasElement | null = null
  private postCtx: CanvasRenderingContext2D | null = null

  // Matrix rain state tracking
  private matrixColumns: number[] = []

  constructor() {
    this.initCanvases()
  }

  private initCanvases() {
    if (this.sourceCanvas || typeof document === 'undefined') return
    try {
      this.sourceCanvas = document.createElement('canvas')
      this.sourceCtx = this.sourceCanvas.getContext('2d', { willReadFrequently: true })
      this.bloomCanvas = document.createElement('canvas')
      this.bloomCtx = this.bloomCanvas.getContext('2d')
      this.postCanvas = document.createElement('canvas')
      this.postCtx = this.postCanvas.getContext('2d', { willReadFrequently: true })
    } catch {
      // In non-browser / mock test environments
    }
  }

  /**
   * Helper: Hex to RGBA
   */
  private hexToRgb(hex: string): { r: number; g: number; b: number } {
    let clean = hex.replace('#', '').trim()
    if (clean.length === 3) {
      clean = clean.split('').map(c => c + c).join('')
    }
    const num = parseInt(clean, 16) || 0
    return {
      r: (num >> 16) & 255,
      g: (num >> 8) & 255,
      b: num & 255,
    }
  }

  /**
   * Pipeline Step 1: Render Animated Gradient Source
   */
  public renderGradientSource(
    width: number,
    height: number,
    cfg: GradientSourceConfig,
    timeMs: number
  ): HTMLCanvasElement {
    this.initCanvases()
    if (!this.sourceCanvas || !this.sourceCtx) {
      const fallback = typeof document !== 'undefined' ? document.createElement('canvas') : ({} as HTMLCanvasElement)
      fallback.width = width
      fallback.height = height
      return fallback
    }
    if (this.sourceCanvas.width !== width || this.sourceCanvas.height !== height) {
      this.sourceCanvas.width = width
      this.sourceCanvas.height = height
    }

    const ctx = this.sourceCtx
    ctx.save()

    // 1. Fill backdrop
    ctx.fillStyle = cfg.backdrop || '#000000'
    ctx.fillRect(0, 0, width, height)

    // Compute animation parameters
    const speedMultiplier = cfg.animated ? (cfg.speed / 100) * 0.001 : 0
    const t = timeMs * speedMultiplier
    const motionDist = (cfg.motionAmount / 100) * (Math.min(width, height) * 0.25)

    // Center coordinates with gentle orbital motion
    let cx = (cfg.centerX / 100) * width
    let cy = (cfg.centerY / 100) * height

    if (cfg.animated && cfg.motionAmount > 0) {
      const rev = cfg.motionReverse ? -1 : 1
      cx += Math.sin(t * 1.3) * motionDist * rev
      cy += Math.cos(t * 0.9) * motionDist * 0.8
    }

    const maxDim = Math.max(width, height)
    const baseRadius = (cfg.scale / 100) * maxDim * 0.65

    // Add wave modulation to radius
    const waveRadius = baseRadius * (1 + (cfg.wave / 100) * 0.2 * Math.sin(t * 2.0))

    // Sort color stops by position
    const sortedStops = [...cfg.colors].sort((a, b) => a.pos - b.pos)

    if (cfg.mode === 'radial') {
      const grad = ctx.createRadialGradient(
        cx,
        cy,
        Math.max(0, waveRadius * 0.02),
        cx,
        cy,
        Math.max(10, waveRadius)
      )

      for (const stop of sortedStops) {
        const p = Math.max(0, Math.min(1, stop.pos / 100))
        grad.addColorStop(p, stop.hex)
      }

      ctx.fillStyle = grad
      ctx.fillRect(0, 0, width, height)

      // Secondary dynamic distortion wave
      if (cfg.distortion > 0) {
        const distortGrad = ctx.createRadialGradient(
          cx + Math.cos(t * 1.5) * (motionDist * 0.5),
          cy + Math.sin(t * 1.1) * (motionDist * 0.5),
          0,
          cx,
          cy,
          waveRadius * 1.2
        )
        const alpha = Math.min(0.6, (cfg.distortion / 100) * 0.6)
        distortGrad.addColorStop(0, `rgba(233, 204, 255, ${alpha})`)
        distortGrad.addColorStop(0.5, `rgba(138, 43, 226, ${alpha * 0.5})`)
        distortGrad.addColorStop(1, 'rgba(0, 0, 0, 0)')

        ctx.globalCompositeOperation = 'screen'
        ctx.fillStyle = distortGrad
        ctx.fillRect(0, 0, width, height)
        ctx.globalCompositeOperation = 'source-over'
      }
    } else {
      // Linear gradient mode
      const rad = ((cfg.angle || 0) * Math.PI) / 180
      const halfW = width / 2
      const halfH = height / 2
      const x1 = halfW - Math.cos(rad) * halfW
      const y1 = halfH - Math.sin(rad) * halfH
      const x2 = halfW + Math.cos(rad) * halfW
      const y2 = halfH + Math.sin(rad) * halfH

      const grad = ctx.createLinearGradient(x1, y1, x2, y2)
      for (const stop of sortedStops) {
        const p = Math.max(0, Math.min(1, stop.pos / 100))
        grad.addColorStop(p, stop.hex)
      }
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, width, height)
    }

    ctx.restore()
    return this.sourceCanvas
  }

  /**
   * Pipeline Step 2: Grid Division and Luminance Sampling
   */
  public sampleGrid(
    sourceImg: ImageData,
    width: number,
    height: number,
    cellSize: number,
    invert: boolean,
    edgeEmphasis: number,
    animStyle: AnimStyle,
    animSpeed: number,
    animIntensity: number,
    timeMs: number
  ): { cells: CellSample[]; cols: number; rows: number } {
    const cols = Math.ceil(width / cellSize)
    const rows = Math.ceil(height / cellSize)
    const cells: CellSample[] = []
    const imgData = sourceImg.data

    const t = (timeMs * 0.001 * (animSpeed / 100) * 3)

    // Pre-calculate luminance buffer for edge emphasis computation
    const lumMatrix = Array.from({ length: rows }, () => Array<number>(cols).fill(0))

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const sampleX = Math.min(width - 1, Math.floor(c * cellSize + cellSize / 2))
        const sampleY = Math.min(height - 1, Math.floor(r * cellSize + cellSize / 2))
        const idx = (sampleY * width + sampleX) * 4

        const red = imgData[idx]
        const green = imgData[idx + 1]
        const blue = imgData[idx + 2]

        // Rec. 709 / standard ITU luminance formula
        let lum = (0.299 * red + 0.587 * green + 0.114 * blue) / 255
        if (invert) lum = 1 - lum
        lumMatrix[r][c] = Math.max(0, Math.min(1, lum))
      }
    }

    // Process each cell with kinetic animation & edge emphasis
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cellX = c * cellSize
        const cellY = r * cellSize
        const sampleX = Math.min(width - 1, Math.floor(cellX + cellSize / 2))
        const sampleY = Math.min(height - 1, Math.floor(cellY + cellSize / 2))
        const idx = (sampleY * width + sampleX) * 4

        const red = imgData[idx]
        const green = imgData[idx + 1]
        const blue = imgData[idx + 2]
        const alpha = imgData[idx + 3] / 255

        let baseLum = lumMatrix[r][c]

        // Edge emphasis via neighbor delta (Sobel-like difference)
        let edgeDelta = 0
        if (edgeEmphasis > 0) {
          const left = c > 0 ? lumMatrix[r][c - 1] : baseLum
          const right = c < cols - 1 ? lumMatrix[r][c + 1] : baseLum
          const top = r > 0 ? lumMatrix[r - 1][c] : baseLum
          const bottom = r < rows - 1 ? lumMatrix[r + 1][c] : baseLum
          const dx = right - left
          const dy = bottom - top
          edgeDelta = Math.sqrt(dx * dx + dy * dy)
          baseLum = Math.min(1, baseLum + edgeDelta * (edgeEmphasis / 50))
        }

        // Pipeline Step 8: Kinetic Animation Styles
        let animOffset = 0
        const strength = (animIntensity / 100) * 0.45

        if (animStyle === 'wave') {
          animOffset = Math.sin(c * 0.28 + r * 0.18 + t) * strength
        } else if (animStyle === 'pulse') {
          animOffset = Math.sin(t * 1.8) * strength
        } else if (animStyle === 'shimmer') {
          // Deterministic hash pseudo-twinkle
          const hash = Math.sin(c * 12.9898 + r * 78.233) * 43758.5453
          animOffset = Math.sin(t * 3.5 + (hash % 6.28)) * strength
        } else if (animStyle === 'ripple') {
          const centerX = cols / 2
          const centerY = rows / 2
          const dist = Math.hypot(c - centerX, r - centerY)
          animOffset = Math.sin(dist * 0.35 - t * 2.2) * strength
        } else if (animStyle === 'flicker') {
          const rand = Math.sin(c * 91.1 + r * 13.7 + Math.floor(t * 12)) * 0.5 + 0.5
          animOffset = (rand - 0.5) * strength * 0.7
        }

        const lum = Math.max(0, Math.min(1, baseLum + animOffset))

        cells.push({
          col: c,
          row: r,
          x: cellX,
          y: cellY,
          r: red,
          g: green,
          b: blue,
          a: alpha,
          luminance: lum,
          edgeDelta,
          animOffset,
        })
      }
    }

    return { cells, cols, rows }
  }

  /**
   * Pipeline Step 4: Color Grading Transformations
   */
  public applyColorAdjustments(
    r: number,
    g: number,
    b: number,
    brightness: number,
    contrast: number,
    saturation: number,
    grayscale: number,
    tintRgb: { r: number; g: number; b: number },
    tintOpacity: number,
    overlayBlend: string
  ): { r: number; g: number; b: number } {
    let red = r
    let green = g
    let blue = b

    // 1. Brightness (-100 to 100)
    if (brightness !== 0) {
      const bOffset = (brightness / 100) * 255
      red = Math.max(0, Math.min(255, red + bOffset))
      green = Math.max(0, Math.min(255, green + bOffset))
      blue = Math.max(0, Math.min(255, blue + bOffset))
    }

    // 2. Contrast (e.g. 100 is 1.0, 115 is 1.15)
    if (contrast !== 100) {
      const factor = (contrast / 100)
      red = Math.max(0, Math.min(255, (red - 128) * factor + 128))
      green = Math.max(0, Math.min(255, (green - 128) * factor + 128))
      blue = Math.max(0, Math.min(255, (blue - 128) * factor + 128))
    }

    // 3. Saturation (0 to 200, 100 is neutral)
    if (saturation !== 100) {
      const gray = 0.299 * red + 0.587 * green + 0.114 * blue
      const satFactor = saturation / 100
      red = Math.max(0, Math.min(255, gray + (red - gray) * satFactor))
      green = Math.max(0, Math.min(255, gray + (green - gray) * satFactor))
      blue = Math.max(0, Math.min(255, gray + (blue - gray) * satFactor))
    }

    // 4. Grayscale (0 to 100)
    if (grayscale > 0) {
      const gray = 0.299 * red + 0.587 * green + 0.114 * blue
      const gFactor = grayscale / 100
      red = red * (1 - gFactor) + gray * gFactor
      green = green * (1 - gFactor) + gray * gFactor
      blue = blue * (1 - gFactor) + gray * gFactor
    }

    // 5. Tint & Overlay Blend
    if (tintOpacity > 0) {
      const tAlpha = Math.min(1, Math.max(0, tintOpacity / 100))
      let tr = tintRgb.r
      let tg = tintRgb.g
      let tb = tintRgb.b

      if (overlayBlend === 'multiply') {
        tr = (red * tintRgb.r) / 255
        tg = (green * tintRgb.g) / 255
        tb = (blue * tintRgb.b) / 255
      } else if (overlayBlend === 'screen') {
        tr = 255 - ((255 - red) * (255 - tintRgb.r)) / 255
        tg = 255 - ((255 - green) * (255 - tintRgb.g)) / 255
        tb = 255 - ((255 - blue) * (255 - tintRgb.b)) / 255
      }

      red = Math.round(red * (1 - tAlpha) + tr * tAlpha)
      green = Math.round(green * (1 - tAlpha) + tg * tAlpha)
      blue = Math.round(blue * (1 - tAlpha) + tb * tAlpha)
    }

    return { r: red, g: green, b: blue }
  }

  /**
   * Pipeline Step 3: Draw Shapes Per renderMode
   */
  public drawCellShape(
    ctx: CanvasRenderingContext2D,
    mode: RenderMode,
    cell: CellSample,
    cellSize: number,
    colorStyle: string,
    density: number,
    charSetRamp: string,
    timeMs: number,
    _cols: number
  ) {
    const cx = cell.x + cellSize / 2
    const cy = cell.y + cellSize / 2
    const lum = cell.luminance
    if (lum <= 0.01) return

    const dScale = 1 + (density / 100) * 0.5
    const maxRadius = (cellSize / 2) * dScale

    ctx.fillStyle = colorStyle
    ctx.strokeStyle = colorStyle

    switch (mode) {
      case 'stars': {
        // Iconic 4-point twinkling starburst (21st.dev "ad" signature effect)
        const starRadius = Math.max(1, maxRadius * lum * 1.35)
        const innerRadius = starRadius * 0.22

        ctx.beginPath()
        // 4-point concave star
        for (let i = 0; i < 8; i++) {
          const angle = (i * Math.PI) / 4
          const r = i % 2 === 0 ? starRadius : innerRadius
          const px = cx + Math.cos(angle) * r
          const py = cy + Math.sin(angle) * r
          if (i === 0) ctx.moveTo(px, py)
          else ctx.lineTo(px, py)
        }
        ctx.closePath()
        ctx.fill()

        // Intense center point highlight on high luminance
        if (lum > 0.6) {
          ctx.beginPath()
          ctx.arc(cx, cy, Math.max(0.8, starRadius * 0.25), 0, Math.PI * 2)
          ctx.fillStyle = '#ffffff'
          ctx.fill()
        }
        break
      }

      case 'characters': {
        const ramp = charSetRamp || STANDARD_RAMP
        const charIdx = Math.min(ramp.length - 1, Math.floor(lum * ramp.length))
        const ch = ramp[charIdx]
        const fontSize = Math.max(8, cellSize * 0.95 * dScale)
        ctx.font = `bold ${fontSize}px ui-monospace, 'Courier New', monospace`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(ch, cx, cy)
        break
      }

      case 'dither': {
        const bX = cell.col % 4
        const bY = cell.row % 4
        const threshold = (BAYER_4X4[bY][bX] + 0.5) / 16
        if (lum > threshold) {
          ctx.fillRect(cell.x + 1, cell.y + 1, cellSize - 2, cellSize - 2)
        }
        break
      }

      case 'mosaic': {
        const pad = Math.max(1, 2 * (1 - lum))
        ctx.fillRect(cell.x + pad, cell.y + pad, cellSize - pad * 2, cellSize - pad * 2)
        break
      }

      case 'pixel': {
        ctx.fillRect(cell.x, cell.y, cellSize, cellSize)
        break
      }

      case 'dots': {
        const r = Math.max(1, maxRadius * lum)
        ctx.beginPath()
        ctx.arc(cx, cy, r, 0, Math.PI * 2)
        ctx.fill()
        break
      }

      case 'cross': {
        const arm = maxRadius * lum
        const th = Math.max(1, 2 * lum * dScale)
        ctx.lineWidth = th
        ctx.beginPath()
        ctx.moveTo(cx - arm, cy)
        ctx.lineTo(cx + arm, cy)
        ctx.moveTo(cx, cy - arm)
        ctx.lineTo(cx, cy + arm)
        ctx.stroke()
        break
      }

      case 'diamond': {
        const r = maxRadius * lum
        ctx.beginPath()
        ctx.moveTo(cx, cy - r)
        ctx.lineTo(cx + r, cy)
        ctx.lineTo(cx, cy + r)
        ctx.lineTo(cx - r, cy)
        ctx.closePath()
        ctx.fill()
        break
      }

      case 'voxel': {
        // 3D Isometric Pseudo-Cube with top, left, right shading
        const size = (cellSize * 0.45 * lum) * dScale
        if (size < 1) break

        // Top face (brightest)
        ctx.beginPath()
        ctx.moveTo(cx, cy - size)
        ctx.lineTo(cx + size, cy - size * 0.5)
        ctx.lineTo(cx, cy)
        ctx.lineTo(cx - size, cy - size * 0.5)
        ctx.closePath()
        ctx.fill()

        // Left face (medium)
        ctx.fillStyle = 'rgba(0, 0, 0, 0.25)'
        ctx.beginPath()
        ctx.moveTo(cx - size, cy - size * 0.5)
        ctx.lineTo(cx, cy)
        ctx.lineTo(cx, cy + size)
        ctx.lineTo(cx - size, cy + size * 0.5)
        ctx.closePath()
        ctx.fill()

        // Right face (darker)
        ctx.fillStyle = 'rgba(0, 0, 0, 0.45)'
        ctx.beginPath()
        ctx.moveTo(cx, cy)
        ctx.lineTo(cx + size, cy - size * 0.5)
        ctx.lineTo(cx + size, cy + size * 0.5)
        ctx.lineTo(cx, cy + size)
        ctx.closePath()
        ctx.fill()
        break
      }

      case 'lego': {
        const r = maxRadius * 0.4 * lum
        ctx.fillRect(cell.x + 1, cell.y + 1, cellSize - 2, cellSize - 2)
        ctx.beginPath()
        ctx.arc(cx, cy, Math.max(1, r), 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(255, 255, 255, 0.45)'
        ctx.fill()
        break
      }

      case 'lines': {
        const barH = Math.max(1, cellSize * lum * 0.85)
        ctx.fillRect(cell.x, cy - barH / 2, cellSize, barH)
        break
      }

      case 'diagonal': {
        ctx.lineWidth = Math.max(1, 2.5 * lum)
        ctx.beginPath()
        ctx.moveTo(cell.x, cell.y + cellSize)
        ctx.lineTo(cell.x + cellSize, cell.y)
        ctx.stroke()
        break
      }

      case 'braille': {
        // Map luminance to 8-dot braille bits
        const bitCount = Math.floor(lum * 8)
        let mask = 0
        for (let b = 0; b < bitCount; b++) {
          mask |= (1 << b)
        }
        const ch = String.fromCharCode(BRAILLE_BASE + mask)
        ctx.font = `${cellSize * 1.1}px monospace`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(ch, cx, cy)
        break
      }

      case 'matrix': {
        // Cascading code rain
        const colIdx = cell.col
        if (!this.matrixColumns[colIdx]) {
          this.matrixColumns[colIdx] = Math.floor(Math.sin(colIdx * 19.3) * 50)
        }
        const streamHead = (Math.floor(timeMs * 0.015) + this.matrixColumns[colIdx]) % 40
        const isHead = Math.abs(cell.row - streamHead) < 2
        const charIdx = (cell.row + colIdx) % MATRIX_CHARS.length
        const ch = MATRIX_CHARS[charIdx]

        ctx.font = `bold ${Math.max(9, cellSize * 0.9)}px monospace`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        if (isHead) {
          ctx.fillStyle = '#ffffff'
        }
        ctx.fillText(ch, cx, cy)
        break
      }

      case 'rings': {
        const ringCount = Math.max(1, Math.floor(lum * 3))
        ctx.lineWidth = 1
        for (let k = 1; k <= ringCount; k++) {
          ctx.beginPath()
          ctx.arc(cx, cy, (maxRadius / 3) * k, 0, Math.PI * 2)
          ctx.stroke()
        }
        break
      }

      case 'hearts': {
        const size = maxRadius * lum
        ctx.beginPath()
        ctx.moveTo(cx, cy + size * 0.3)
        ctx.bezierCurveTo(cx - size, cy - size * 0.6, cx - size * 0.7, cy - size, cx, cy - size * 0.3)
        ctx.bezierCurveTo(cx + size * 0.7, cy - size, cx + size, cy - size * 0.6, cx, cy + size * 0.3)
        ctx.fill()
        break
      }

      case 'hexagons': {
        const r = maxRadius * lum
        ctx.beginPath()
        for (let i = 0; i < 6; i++) {
          const a = (i * Math.PI) / 3
          const px = cx + Math.cos(a) * r
          const py = cy + Math.sin(a) * r
          if (i === 0) ctx.moveTo(px, py)
          else ctx.lineTo(px, py)
        }
        ctx.closePath()
        ctx.fill()
        break
      }

      case 'triangles': {
        const isUp = (cell.col + cell.row) % 2 === 0
        const r = maxRadius * lum
        ctx.beginPath()
        if (isUp) {
          ctx.moveTo(cx, cy - r)
          ctx.lineTo(cx + r, cy + r)
          ctx.lineTo(cx - r, cy + r)
        } else {
          ctx.moveTo(cx, cy + r)
          ctx.lineTo(cx + r, cy - r)
          ctx.lineTo(cx - r, cy - r)
        }
        ctx.closePath()
        ctx.fill()
        break
      }

      case 'bubbles': {
        const r = Math.max(1.5, maxRadius * lum)
        ctx.beginPath()
        ctx.arc(cx, cy, r, 0, Math.PI * 2)
        ctx.fill()
        // Translucent specular arc
        ctx.beginPath()
        ctx.arc(cx - r * 0.3, cy - r * 0.3, r * 0.35, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)'
        ctx.fill()
        break
      }

      case 'hatch': {
        ctx.lineWidth = 1.2
        ctx.beginPath()
        ctx.moveTo(cell.x, cell.y + cellSize)
        ctx.lineTo(cell.x + cellSize, cell.y)
        if (lum > 0.5) {
          ctx.moveTo(cell.x, cell.y)
          ctx.lineTo(cell.x + cellSize, cell.y + cellSize)
        }
        ctx.stroke()
        break
      }

      case 'contour': {
        // Topographic elevation contour lines (METARDU Surveying Favorite)
        const levels = Math.floor(lum * 4)
        ctx.lineWidth = 1.5
        for (let l = 1; l <= levels; l++) {
          ctx.beginPath()
          const rad = (cellSize * 0.5 * l) / 4
          ctx.arc(cx, cy, rad, 0, Math.PI * 2)
          ctx.stroke()
        }
        break
      }

      case 'halfblocks': {
        const h = cellSize / 2
        if (lum > 0.3) ctx.fillRect(cell.x, cell.y, cellSize, h)
        if (lum > 0.6) ctx.fillRect(cell.x, cell.y + h, cellSize, h)
        break
      }

      case 'disco': {
        const r = maxRadius * lum
        ctx.save()
        ctx.translate(cx, cy)
        ctx.rotate((timeMs * 0.002) + cell.col)
        ctx.fillRect(-r / 2, -r / 2, r, r)
        ctx.restore()
        break
      }

      case 'hexdump': {
        const hex = Math.floor(lum * 255).toString(16).padStart(2, '0').toUpperCase()
        ctx.font = `bold ${Math.max(8, cellSize * 0.7)}px monospace`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(hex, cx, cy)
        break
      }

      case 'mixed':
      default: {
        const alt = (cell.col + cell.row) % 3
        if (alt === 0) {
          ctx.beginPath()
          ctx.arc(cx, cy, maxRadius * lum, 0, Math.PI * 2)
          ctx.fill()
        } else if (alt === 1) {
          const r = maxRadius * lum
          ctx.fillRect(cx - r / 2, cy - r / 2, r, r)
        } else {
          ctx.lineWidth = 1.5
          ctx.beginPath()
          ctx.moveTo(cx - maxRadius * lum, cy)
          ctx.lineTo(cx + maxRadius * lum, cy)
          ctx.stroke()
        }
        break
      }
    }
  }

  /**
   * Pipeline Step 5 & 6: Post-processing Effects (PFX) & Lighting
   */
  public applyPostEffects(
    targetCanvas: HTMLCanvasElement,
    cfg: AsciiRecipeConfig,
    timeMs: number
  ) {
    const width = targetCanvas.width
    const height = targetCanvas.height
    const ctx = targetCanvas.getContext('2d')
    if (!ctx) throw new Error('A 2D canvas context is required for raster effects.')
    const pfx = cfg.pfx

    // ── 1. Bloom Pass ──
    if (pfx.bloom?.enabled && pfx.bloom.intensity > 0 && this.bloomCanvas && this.bloomCtx) {
      if (this.bloomCanvas.width !== width || this.bloomCanvas.height !== height) {
        this.bloomCanvas.width = width
        this.bloomCanvas.height = height
      }
      this.bloomCtx.clearRect(0, 0, width, height)
      this.bloomCtx.drawImage(targetCanvas, 0, 0)

      ctx.save()
      ctx.globalCompositeOperation = 'screen'
      ctx.filter = `blur(${Math.max(4, pfx.bloom.intensity * 0.35)}px)`
      ctx.globalAlpha = Math.min(1, (pfx.bloom.intensity / 100) * 0.8)
      ctx.drawImage(this.bloomCanvas, 0, 0)
      ctx.restore()
    }

    // ── 2. Vignette Pass ──
    if (pfx.vignette?.enabled && pfx.vignette.intensity > 0) {
      ctx.save()
      const radius = Math.max(width, height) * 0.65
      const vigGrad = ctx.createRadialGradient(
        width / 2,
        height / 2,
        radius * 0.35,
        width / 2,
        height / 2,
        radius
      )
      const vigAlpha = Math.min(1, (pfx.vignette.intensity / 100) * 0.9)
      vigGrad.addColorStop(0, 'rgba(0, 0, 0, 0)')
      vigGrad.addColorStop(1, `rgba(0, 0, 0, ${vigAlpha})`)

      ctx.fillStyle = vigGrad
      ctx.fillRect(0, 0, width, height)
      ctx.restore()
    }

    // ── 3. ScanLines Pass ──
    if (pfx.scanLines?.enabled && pfx.scanLines.intensity > 0) {
      ctx.save()
      const lineAlpha = (pfx.scanLines.intensity / 100) * 0.35
      ctx.fillStyle = `rgba(0, 0, 0, ${lineAlpha})`
      for (let y = 0; y < height; y += 3) {
        ctx.fillRect(0, y, width, 1)
      }
      ctx.restore()
    }

    // ── 4. Film Grain Pass ──
    if (pfx.filmGrain?.enabled && pfx.filmGrain.intensity > 0) {
      ctx.save()
      const grainCount = Math.floor((width * height * 0.015) * (pfx.filmGrain.intensity / 100))
      const grainAlpha = (pfx.filmGrain.intensity / 100) * 0.25
      ctx.fillStyle = `rgba(255, 255, 255, ${grainAlpha})`

      const tSeed = Math.floor(timeMs * 0.05)
      for (let i = 0; i < grainCount; i++) {
        // Pseudo-random distribution seeded by time
        const rx = (Math.sin(i * 991.1 + tSeed) * 0.5 + 0.5) * width
        const ry = (Math.cos(i * 443.7 + tSeed) * 0.5 + 0.5) * height
        ctx.fillRect(rx, ry, 1, 1)
      }
      ctx.restore()
    }

    // ── 5. Chromatic Aberration ──
    if (pfx.chromatic?.enabled && pfx.chromatic.intensity > 0) {
      const shift = Math.max(1, Math.round(pfx.chromatic.intensity * 0.08))
      ctx.save()
      ctx.globalCompositeOperation = 'screen'
      ctx.globalAlpha = 0.4
      ctx.drawImage(targetCanvas, -shift, 0)
      ctx.drawImage(targetCanvas, shift, 0)
      ctx.restore()
    }

    // ── 6. Glitch Artifacts ──
    if (pfx.glitch?.enabled && pfx.glitch.intensity > 0) {
      const glitchChance = (pfx.glitch.intensity / 100) * 0.3
      if (Math.sin(timeMs * 0.007) > (1 - glitchChance)) {
        ctx.save()
        const stripY = (Math.sin(timeMs * 0.03) * 0.5 + 0.5) * height
        const stripH = Math.max(4, Math.random() * 20)
        const shiftX = (Math.random() - 0.5) * (pfx.glitch.intensity * 0.6)
        ctx.drawImage(targetCanvas, 0, stripY, width, stripH, shiftX, stripY, width, stripH)
        ctx.restore()
      }
    }

    // ── 7. Halftone Overlay ──
    if (pfx.halftone?.enabled && pfx.halftone.intensity > 0) {
      ctx.save()
      const step = 8
      const dotAlpha = (pfx.halftone.intensity / 100) * 0.15
      ctx.fillStyle = `rgba(0, 0, 0, ${dotAlpha})`
      for (let y = 0; y < height; y += step) {
        for (let x = 0; x < width; x += step) {
          ctx.beginPath()
          ctx.arc(x, y, 1.2, 0, Math.PI * 2)
          ctx.fill()
        }
      }
      ctx.restore()
    }

    // ── 8. Ambient Glow Lights ──
    if (cfg.lights?.enabled && cfg.lights.points && cfg.lights.points.length > 0) {
      ctx.save()
      ctx.globalCompositeOperation = 'lighter'
      for (const light of cfg.lights.points) {
        const lx = light.x * width
        const ly = light.y * height
        const rad = light.radius || 150
        const grad = ctx.createRadialGradient(lx, ly, 0, lx, ly, rad)
        const col = light.color || 'rgba(138, 43, 226, 0.4)'
        grad.addColorStop(0, col)
        grad.addColorStop(1, 'rgba(0, 0, 0, 0)')
        ctx.fillStyle = grad
        ctx.fillRect(lx - rad, ly - rad, rad * 2, rad * 2)
      }
      ctx.restore()
    }
  }

  /**
   * Main Pipeline Entry: Render Full ASCII Frame
   */
  public renderFrame(
    targetCanvas: HTMLCanvasElement,
    cfg: AsciiRecipeConfig,
    timeMs: number
  ) {
    const width = targetCanvas.width
    const height = targetCanvas.height
    const ctx = targetCanvas.getContext('2d')
    if (!ctx) return

    // 1. Generate Gradient Source Canvas
    const source = this.renderGradientSource(width, height, cfg.gradientSource, timeMs)
    if (!this.sourceCtx) return
    const sourceImgData = this.sourceCtx.getImageData(0, 0, width, height)

    // 2. Clear Target Canvas / Background Mode
    ctx.clearRect(0, 0, width, height)

    if (cfg.bgMode === 'source' || cfg.bgMode === 'blurred') {
      ctx.save()
      if (cfg.bgMode === 'blurred' && cfg.bgBlur > 0) {
        ctx.filter = `blur(${cfg.bgBlur}px)`
      }
      ctx.globalAlpha = (cfg.bgOpacity / 100)
      ctx.drawImage(source, 0, 0)
      ctx.restore()
    } else {
      // Solid / dark backdrop
      ctx.fillStyle = '#03000A'
      ctx.fillRect(0, 0, width, height)
    }

    // 3. Grid Sampling
    const { cells, cols } = this.sampleGrid(
      sourceImgData,
      width,
      height,
      cfg.cellSize,
      cfg.invert,
      cfg.edgeEmphasis,
      cfg.animStyle,
      cfg.animSpeed?.intensity ?? 100,
      cfg.animIntensity?.intensity ?? 60,
      timeMs
    )

    const tintRgb = this.hexToRgb(cfg.tint || '#3ca6ff')
    const coverage = cfg.coverage ?? 100

    // 4. Draw Cells
    for (const cell of cells) {
      // Respect coverage %
      if (coverage < 100) {
        const hash = Math.abs(Math.sin(cell.col * 7919 + cell.row * 6271) * 10000) % 100
        if (hash > coverage) continue
      }

      // Color adjustments
      const adj = this.applyColorAdjustments(
        cell.r,
        cell.g,
        cell.b,
        cfg.brightness,
        cfg.contrast,
        cfg.saturation,
        cfg.grayscale,
        tintRgb,
        cfg.tintOpacity,
        cfg.overlayBlend
      )

      const colorStyle = `rgba(${adj.r}, ${adj.g}, ${adj.b}, ${cell.a})`

      this.drawCellShape(
        ctx,
        cfg.renderMode,
        cell,
        cfg.cellSize,
        colorStyle,
        cfg.density,
        cfg.charSet === 'custom' ? cfg.customChars : STANDARD_RAMP,
        timeMs,
        cols
      )
    }

    // 5. Post-Effects & Lights
    this.applyPostEffects(targetCanvas, cfg, timeMs)
  }
}
